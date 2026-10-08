"""Independent synthetic RPC process for supervisor tests and opt-in offline UI."""
import fcntl
import json
import os
from pathlib import Path
import signal
import sys
import threading
import time
import uuid

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
seq = 0
busy = False
requests = {}
replay_events = []
write_lock = threading.Lock()
cancel_generation = 0


def write(frame):
    with write_lock:
        print(json.dumps({"jsonrpc": "2.0", **frame}), flush=True)


def event(kind, payload=None):
    global seq
    with write_lock:
        seq += 1
        print(json.dumps({"jsonrpc": "2.0", "method": "event", "params": {
            "type": kind, "session_id": session, "seq": seq, "payload": payload or {}}}), flush=True)


def finish(generation):
    global busy
    if generation != cancel_generation:
        return
    event("message.delta", {"text": "Fixture task complete. "})
    event("message.complete", {"text": "Fixture task complete. Your workspace is ready.", "status": "complete"})
    time.sleep(0.02)  # Deliberately retain busy after completion, as installed Hermes does.
    busy = False
    event("session.info", {"running": False})


def task(prompt, generation):
    global busy
    event("thinking.delta", {"text": "HIDDEN_REASONING_CANARY"})
    event("session.info", {"running": True, "system_prompt": "PRIVATE_SYSTEM_CANARY"})
    event("tool.start", {"tool_id": f"tool-{generation}", "name": "terminal", "args": {"api_key": "TOOL_SECRET_CANARY"}})
    time.sleep(0.06)
    if generation != cancel_generation:
        return
    lower = prompt.lower()
    if scenario == "split-credential":
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
    if any(word in lower for word in ("question", "batch", "approval", "secret")):
        kind = "approval" if "approval" in lower else "secret" if "secret" in lower else "clarify"
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
        if kind == "secret":
            params = {"session_id": session, "prompt": "PRIVATE_SECRET_CANARY"}
        frame = {"id": generation if "numeric" in lower else f"srq-{generation}", "method": kind, "params": params}
        requests[frame["id"]] = frame
        write(frame)
        if "expire" in lower:
            def expire():
                time.sleep(0.25)
                if frame["id"] in requests:
                    requests.pop(frame["id"])
                    event("request.cancel", {"id": frame["id"], "reason": "timeout"})
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
    elif method == "session.activate":
        result = {"running": busy, "open_requests": list(requests.values())}
        time.sleep(0.05)  # Response can arrive after a newer settled session.info.
    elif method == "session.events.since":
        result = {"open_requests": list(requests.values()), "events": replay_events, "epoch": "fixture-epoch", "latest_seq": seq}
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
