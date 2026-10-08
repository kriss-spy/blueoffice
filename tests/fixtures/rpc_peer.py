"""Independent synthetic RPC process for supervisor tests and opt-in offline UI."""
import ctypes
import fcntl
import json
import os
from pathlib import Path
import signal
import sys
import threading
import time
import uuid

# Mirror the production owned gateway: a crashed supervisor cannot leave an
# orphan fixture holding the profile lease. No saved PID is used for signals.
parent = os.getppid()
ctypes.CDLL(None, use_errno=True).prctl(1, signal.SIGTERM, 0, 0, 0)
if os.getppid() != parent or parent == 1:
    raise SystemExit(1)

profile, scenario = Path(sys.argv[1]), sys.argv[2]
lease = open(profile / ".blueoffice-lease", "w")
try:
    fcntl.flock(lease, fcntl.LOCK_EX | fcntl.LOCK_NB)
except BlockingIOError:
    raise SystemExit(73)
if scenario == "startup-failure":
    raise SystemExit(2)
if scenario == "ignore-stop":
    signal.signal(signal.SIGTERM, signal.SIG_IGN)
if scenario == "abnormal-stop":
    signal.signal(signal.SIGTERM, lambda *_: sys.exit(17))
if scenario == "never-ready":
    time.sleep(60)
session = "live-fixture-" + uuid.uuid4().hex[:8]
stored_session = "stored-" + session
session_title = "Owned conversation"
seq = 0
busy = False
requests = {}
replay_events = []
history = []
inflight = None
omitted_delta = False
truncated_through = 0
write_lock = threading.Lock()
cancel_generation = 0


def write(frame):
    with write_lock:
        print(json.dumps({"jsonrpc": "2.0", **frame}), flush=True)


def event(kind, payload=None):
    global seq, omitted_delta, truncated_through
    with write_lock:
        seq += 1
        data = {"type": kind, "session_id": session, "seq": seq, "payload": payload or {}}
        replay_events.append(data)
        if scenario in ("checkpoint-stream", "checkpoint-tool-prefix", "checkpoint-tool") and kind == "message.delta" and payload.get("checkpoint_omit"):
            return
        if scenario in ("truncated", "interim-gap") and busy and kind not in ("recovery.trigger", "message.interim"):
            return
        if scenario in ("truncated", "interim-gap", "checkpoint-stream", "checkpoint-tool-prefix", "checkpoint-tool") and kind == "recovery.trigger":
            truncated_through = seq - 1
            replay_events[:] = [data]
        if scenario == "replay-order" and kind == "message.delta" and not omitted_delta:
            omitted_delta = True
            return
        wire = json.dumps({"jsonrpc": "2.0", "method": "event", "params": data})
        print(wire, flush=True)
        if scenario == "replay-order":
            print(wire, flush=True)


def persist_history():
    path = profile / ".history-fixture.json"
    data = json.loads(path.read_text())
    if not any(row["storedSessionId"] == stored_session for row in data["records"]):
        data["records"].append({"storedSessionId": stored_session, "title": session_title, "source": "blueoffice", "startedAt": "2026-10-08T00:00:00Z", "lastActivityAt": "2026-10-08T00:00:00Z", "endedAt": None, "endReason": None, "parentStoredSessionId": None, "metrics": {"inputTokens": None, "outputTokens": None, "calls": None, "costUsd": None, "costKind": None}})
    data.setdefault("messages", {})[stored_session] = [{"id": str(i), "role": row["role"], "text": row["text"], "at": None} for i, row in enumerate(history)]
    path.write_text(json.dumps(data))


def finish(generation):
    global busy
    if generation != cancel_generation:
        return
    history.append({"role": "assistant", "text": "Fixture task complete. Your workspace is ready."})
    persist_history()
    event("message.delta", {"text": "Fixture task complete. "})
    event("message.complete", {"text": "Fixture task complete. Your workspace is ready.", "status": "complete"})
    time.sleep(0.02)  # Deliberately retain busy after completion, as installed Hermes does.
    busy = False
    event("session.info", {"running": False})


def task(prompt, generation):
    global busy, inflight
    if scenario == "interim-gap":
        event("message.interim", {"text": "I will wait for permission before continuing.", "already_streamed": False})
    event("thinking.delta", {"text": "HIDDEN_REASONING_CANARY"})
    event("session.info", {"running": True, "system_prompt": "PRIVATE_SYSTEM_CANARY"})
    event("tool.start", {"tool_id": f"tool-{generation}", "name": "terminal", "args": {"api_key": "TOOL_SECRET_CANARY"}})
    time.sleep(0.06)
    if generation != cancel_generation:
        return
    lower = prompt.lower()
    if "history stream" in lower:
        for index in range(8):
            if generation != cancel_generation:
                return
            event("message.delta", {"text": f"Public stream chunk {index}. "})
            time.sleep(0.2)  # Longer than the history list debounce: each delta is independent evidence.
        finish(generation)
        return
    if scenario in ("checkpoint-stream", "checkpoint-tool-prefix", "checkpoint-tool"):
        key = os.environ["BLUEOFFICE_PROXY_KEY"]
        prefix = "Checking the files." if scenario != "checkpoint-stream" else ""
        if prefix:
            event("message.delta", {"text": prefix})
            event("message.interim", {"text": prefix, "already_streamed": True})
        if scenario != "checkpoint-tool":
            event("message.delta", {"text": "Hello "})
        inflight = {"user": prompt, "assistant": prefix + ("" if scenario == "checkpoint-tool" else "Hello " + key[:10]), "streaming": True}
        event("message.delta", {"text": "" if scenario == "checkpoint-tool" else key[:10], "checkpoint_omit": True})
        event("recovery.trigger")
        deadline = time.monotonic() + 10
        while not (profile / "continue-recovery").exists() and time.monotonic() < deadline:
            time.sleep(0.01)
        event("message.delta", {"text": "Done." if scenario == "checkpoint-tool" else key[10:] + " world"})
        event("message.complete", {"text": "Done." if scenario == "checkpoint-tool" else "Hello " + key + " world", "status": "complete"})
        inflight = None
        busy = False
        event("session.info", {"running": False})
        return
    if scenario in ("split-credential", "replay-order"):
        key = os.environ["BLUEOFFICE_PROXY_KEY"]
        for part in ("Safe prefix ", key[:10], key[10:14], key[14:], " done ", "synt"):
            event("message.delta", {"text": part})
            time.sleep(0.01)
        event("message.complete", {"text": "", "status": "complete"})
        busy = False
        event("session.info", {"running": False})
        return
    if "long output" in lower:
        event("message.delta", {"text": "I will inspect the workspace."})
        event("message.interim", {"text": "I will inspect the workspace.", "already_streamed": True})
        event("message.interim", {"text": "The inspection is complete.", "already_streamed": False})
        answer = "A" * 40000 + "FINAL_TAIL"
        event("message.delta", {"text": answer})
        event("message.complete", {"text": answer, "status": "complete"})
        busy = False
        event("session.info", {"running": False})
        return
    if "exit" in lower:
        os._exit(9)
    if "slow" in lower:
        return
    if "prose" in lower:
        event("message.complete", {"text": "Which desk should we use?", "status": "complete"})
        busy = False
        event("session.info", {"running": False})
        return
    if any(word in lower for word in ("question", "batch", "approval", "secret", "sudo", "vault")):
        kind = "approval" if "approval" in lower else "sudo" if "sudo" in lower else "vault.unlock_prompt" if "vault" in lower else "secret" if "secret" in lower else "clarify"
        params = {"session_id": session, "question": "Which desk should we use?", "choices": ["Oak", "Birch"]}
        if "batch" in lower:
            params = {"session_id": session, "questions": [
                {"qid": "q0", "question": "Which desk?", "choices": ["Oak", "Birch"]},
                {"qid": "q1", "question": "Which lamp?", "choices": ["Blue", "White"]}]}
        if "multi" in lower:
            if "questions" in params:
                params["questions"][1]["multi_select"] = True
            else:
                params["multi_select"] = True
        if "malformed" in lower:
            params["questions"] = [None]
        if kind == "approval":
            params = {"session_id": session, "request_id": "inner-permission", "description": "Allow a synthetic command?", "command": "fixture-action", "choices": ["once", "deny"]}
            if "all choices" in lower:
                params["choices"] = ["once", "session", "always", "deny"]
            if "unknown choice" in lower:
                params["choices"] = ["once", "future-allow", "deny"]
            if "missing id" in lower:
                params.pop("request_id")
            if "contradictory" in lower:
                params["choices"] = ["session", "deny"]
                params["allow_session"] = False
            if "long id" in lower:
                params["request_id"] = "inner-" + "x" * 300
            if "private metadata" in lower:
                params["command"] = "fixture-action TOKEN=" + os.environ.get("BLUEOFFICE_PROXY_KEY", "[redacted]")
                params["internal_context"] = {"password": "PRIVATE_APPROVAL_METADATA"}
        if kind in ("secret", "sudo", "vault.unlock_prompt"):
            params = {"session_id": session, "prompt": "PRIVATE_SECRET_CANARY", "command": "PRIVATE_SUDO_COMMAND", "display_name": "PRIVATE_VAULT_NAME"}
        frame = {"id": generation if "numeric" in lower else f"srq-{generation}", "method": kind, "params": params}
        requests[frame["id"]] = frame
        if scenario not in ("missing-request", "truncated", "interim-gap"):
            write(frame)
        if scenario in ("truncated", "interim-gap"):
            event("recovery.trigger")
        if "expire" in lower or "resolve approval" in lower:
            def expire():
                time.sleep(0.25)
                if frame["id"] in requests:
                    requests.pop(frame["id"])
                    event("request.cancel", {"id": frame["id"], "reason": "resolved" if "resolve approval" in lower else "timeout"})
                    finish(generation)
            threading.Thread(target=expire, daemon=True).start()
        if "disconnect" in lower:
            threading.Timer(0.25, lambda: os._exit(9)).start()
        return
    event("tool.complete", {"tool_id": f"tool-{generation}", "name": "terminal", "result": {"error": "synthetic tool failure recovered", "secret": "TOOL_SECRET_CANARY"}})
    finish(generation)


event("gateway.ready", {"replay_epoch": "fixture-epoch"})
for line in sys.stdin:
    frame = json.loads(line)
    method, rid, params = frame.get("method"), frame.get("id"), frame.get("params", {})
    with open(profile / "commands.jsonl", "a") as log:
        log.write(json.dumps(frame) + "\n")
    if not method:
        if rid in requests:
            if scenario == "lost-reply-ack":
                os._exit(9)
            if scenario == "replay-cancel":
                requests.pop(rid)
                seq += 1
                replay_events.append({"type": "request.cancel", "session_id": session, "seq": seq,
                                      "payload": {"id": rid, "reason": "timeout"}})
                continue
            def resolve(request_id, generation):
                if scenario == "delayed-answer":
                    time.sleep(0.4)
                requests.pop(request_id, None)
                finish(generation)
            threading.Thread(target=resolve, args=(rid, cancel_generation), daemon=True).start()
        continue
    result = {}
    if method == "session.create":
        result = {"session_id": session, "stored_session_id": "stored-" + session}
        session_title = params.get("title", "Owned conversation")
    elif method == "session.resume":
        if scenario == "resume-failure":
            write({"id": rid, "error": {"code": 4007, "message": "synthetic resume failure"}})
            continue
        stored_session = params["session_id"]
        result = {"session_id": session, "resumed": params["session_id"], "session_key": params["session_id"], "messages": []}
    elif method == "session.activate":
        result = {"session_id": session, "running": busy, "open_requests": list(requests.values()), "messages": history, "messages_omitted": False, "inflight": inflight}
        time.sleep(0.05)  # Response can arrive after a newer settled session.info.
    elif method == "session.events.since":
        result = {"open_requests": list(requests.values()), "events": [e for e in replay_events if e["seq"] > params.get("last_seen", 0)], "epoch": "fixture-epoch", "latest_seq": seq, "truncated": params.get("last_seen", 0) < truncated_through}
    elif method == "clarify.lock":
        request = requests.get(params["request_id"])
        if not request:
            result = {"status": "expired"}
        else:
            qids = [q["qid"] for q in request["params"]["questions"]]
            if params["question_id"] not in qids:
                write({"id": rid, "error": {"code": -32602, "message": "foreign question"}})
                continue
            locked = request["params"].setdefault("answers", {})
            locked[params["question_id"]] = params["answer"]
            remaining = [q for q in qids if q not in locked]
            result = {"status": "ok", "remaining": remaining}
            if scenario == "lost-lock-ack":
                os._exit(9)
            if not remaining:
                requests.pop(params["request_id"])
                threading.Thread(target=finish, args=(cancel_generation,), daemon=True).start()
    elif method == "prompt.submit":
        if busy:
            result = {"status": "queued"}
        else:
            busy = True
            history.append({"role": "user", "text": params["text"]})
            persist_history()
            cancel_generation += 1
            result = {"status": "streaming"}
            if scenario == "lost-ack":
                threading.Thread(target=task, args=(params["text"], cancel_generation), daemon=True).start()
                continue
            write({"id": rid, "result": result})
            threading.Thread(target=task, args=(params["text"], cancel_generation), daemon=True).start()
            continue
    elif method == "session.interrupt":
        cancel_generation += 1
        for request_id in list(requests):
            event("request.cancel", {"id": request_id, "reason": "interrupted"})
        requests.clear()
        event("message.complete", {"text": "Operation interrupted.", "status": "interrupted"})
        busy = False
        event("session.info", {"running": False})
    else:
        if method != "client.capabilities":
            write({"id": rid, "error": {"code": -32601, "message": "unsupported"}})
            continue
    write({"id": rid, "result": result})
