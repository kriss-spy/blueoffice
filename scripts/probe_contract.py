"""Inner probe. Only run via hermes_probe.py's isolated namespace."""
import json
import hashlib
import os
from pathlib import Path
import platform
import subprocess
import sys
import time
import traceback

from probe_provider import MockProvider
from probe_rpc import Gateway


def main():
    if not Path("/probe/probe_contract.py").is_file() or not Path("/evidence").is_dir():
        raise RuntimeError("Use scripts/hermes_probe.py to run inside the isolated namespace")
    installation = json.loads(sys.argv[1])
    trace, gateways, checks = [], [], []
    report = {"installation": installation, "environment": {"python": sys.version, "os": platform.platform()},
              "source_sha256": json.loads(sys.argv[2]),
              "isolation": "bubblewrap: private network/PID/IPC namespaces, read-only runtime/source, disposable profiles",
              "checks": checks, "passed": False}
    with MockProvider() as provider:
        try:
            # Each profile is rooted independently, with no inherited provider credentials.
            def launch(label):
                profile = Path("/tmp") / label
                profile.mkdir(exist_ok=True)
                (profile / "workspace").mkdir(exist_ok=True)
                install_key = hashlib.sha256(installation["source"].encode()).hexdigest()[:16]
                selection = profile / "installs" / install_key
                selection.mkdir(parents=True, exist_ok=True)
                dependency_env = selection / "environments" / Path(installation["venv"]).parent.name / "venv"
                (selection / "facts.json").write_text(json.dumps({"schema": 1, "packages": {
                    "venv": {"environment": str(dependency_env)}}}))
                config = {"model": {"default": "blueoffice-mock", "provider": "custom", "base_url": provider.url},
                          "platform_toolsets": {"cli": ["clarify", "terminal"]},
                          "terminal": {"cwd": str(profile / "workspace"), "backend": "local"},
                          "approvals": {"mode": "manual", "timeout": 10},
                          "clarify": {"timeout": 3}, "mcp_servers": {}, "blueoffice_unknown": {"keep": True}}
                # JSON is valid YAML; avoids adding a dependency to the harness.
                if not (profile / "config.yaml").exists():
                    (profile / "config.yaml").write_text(json.dumps(config))
                env = {"PATH": "/usr/bin:/bin", "LANG": "C.UTF-8", "HERMES_HOME": str(profile),
                       "HERMES_DISABLE_LAZY_INSTALLS": "1", "HERMES_PYTHON_SRC_ROOT": installation["source"],
                       "OPENAI_API_KEY": "synthetic-not-a-secret", "OPENAI_BASE_URL": provider.url,
                       "HERMES_TUI_GATEWAY_SHUTDOWN_GRACE_S": "1"}
                code = f"import sys,runpy; sys.path.insert(0,{installation['source']!r}); runpy.run_module('tui_gateway.entry',run_name='__main__')"
                gateway = Gateway([installation["python"], "-B", "-I", "-c", code], env,
                                  profile / "workspace", f"{label}-{len(gateways) + 1}", trace)
                gateways.append(gateway)
                gateway.event("gateway.ready")
                gateway.request("client.capabilities", {"server_requests": True})
                return gateway

            a = launch("alpha")
            checks.append("gateway handshake and capability advertisement")
            session = a.request("session.create", {"cwd": "/tmp/alpha/workspace", "title": "Synthetic contract"})
            sid, stored = session["session_id"], session["stored_session_id"]
            report["session_ids_distinct"] = sid != stored
            result = a.request("prompt.submit", {"session_id": sid, "text": "PROBE_SINGLE"})
            assert result["status"] == "streaming", result
            request = a.wait(lambda f: f.get("method") == "clarify")
            assert request["params"]["session_id"] == sid
            replay = a.request("session.events.since", {"session_id": sid, "last_seen": 0})
            assert any(r["id"] == request["id"] for r in replay["open_requests"])
            a.answer(request, {"answer": "Oak"})
            complete = a.event("message.complete", sid)
            assert complete["params"]["payload"]["status"] == "complete"
            assert a.event("message.delta", sid)["params"]["payload"]["text"]
            assert a.event("tool.complete", sid)["params"]["payload"]["result"]["user_response"] == "Oak"
            report["completion"] = complete
            checks.append("single clarification, exact reply, replay and completion")

            def submit(gateway, live_id, scenario):
                deadline = time.monotonic() + 10
                while gateway.request("session.activate", {"session_id": live_id}).get("running"):
                    if time.monotonic() >= deadline:
                        raise TimeoutError("Previous turn did not release the foreground session")
                    time.sleep(0.05)
                result = gateway.request("prompt.submit", {"session_id": live_id, "text": scenario})
                assert result["status"] == "streaming", result

            def finished(gateway, live_id):
                payload = gateway.event("message.complete", live_id)["params"]["payload"]
                assert payload["status"] == "complete", payload
                return payload

            submit(a, sid, "PROBE_BATCH")
            batch = a.wait(lambda f: f.get("method") == "clarify")
            questions = batch["params"]["questions"]
            assert len(questions) == 2
            lock = a.request("clarify.lock", {"request_id": batch["id"], "question_id": questions[0]["qid"], "answer": "Birch"})
            assert lock["status"] == "ok" and lock["remaining"] == [questions[1]["qid"]]
            snapshot = a.request("session.events.since", {"session_id": sid, "last_seen": 0})
            assert snapshot["open_requests"][0]["params"]["answers"] == {questions[0]["qid"]: "Birch"}
            invalid = a.request("clarify.lock", {"request_id": batch["id"], "question_id": "foreign", "answer": "No"}, allow_error=True)
            assert "error" in invalid
            a.answer(batch, {"answers": {questions[1]["qid"]: "Blue"}})
            finished(a, sid)
            # A late answer must not create another task or resolve a different request.
            late = a.request("clarify.lock", {"request_id": batch["id"], "question_id": questions[0]["qid"], "answer": "Oak"})
            assert late["status"] == "expired"
            checks.append("batch lock, replayed partial answer, unknown question rejection and stale lock")

            sentinel = Path("/tmp/blueoffice-approval-sentinel")
            sentinel.mkdir()
            (sentinel / "keep.txt").write_text("must survive denial")
            submit(a, sid, "PROBE_APPROVAL")
            approval = a.wait(lambda f: f.get("method") == "approval")
            assert approval["id"] != approval["params"]["request_id"]
            assert "deny" in approval["params"]["choices"]
            snapshot = a.request("session.events.since", {"session_id": sid, "last_seen": 0})
            assert any(r["id"] == approval["id"] for r in snapshot["open_requests"])
            a.answer(approval, {"choice": "deny"})
            finished(a, sid)
            assert (sentinel / "keep.txt").read_text() == "must survive denial"
            checks.append("approval outer/inner IDs, advertised choices, replay and denial prevents execution")

            submit(a, sid, "PROBE_CANCEL")
            cancelled = a.wait(lambda f: f.get("method") == "clarify")
            a.request("session.interrupt", {"session_id": sid})
            cancel = a.event("request.cancel", sid)["params"]["payload"]
            assert cancel["id"] == cancelled["id"] and cancel["reason"] == "interrupted", cancel
            interrupted = a.event("message.complete", sid)["params"]["payload"]
            report["interrupt_outcome"] = interrupted
            assert interrupted["status"] != "complete", interrupted
            assert a.process.poll() is None
            a.answer(cancelled, {"answer": "late"})
            assert not a.request("session.events.since", {"session_id": sid})["open_requests"]
            checks.append("interrupt cancels exact request, leaves runtime alive and rejects late reply")

            submit(a, sid, "PROBE_EXPIRE")
            expired = a.wait(lambda f: f.get("method") == "clarify")
            cancel = a.event("request.cancel", sid)["params"]["payload"]
            assert cancel["id"] == expired["id"] and cancel["reason"] == "timeout", cancel
            finished(a, sid)
            checks.append("request expiry has exact cancellation ID and timeout reason")

            b = launch("beta")
            b_session = b.request("session.create", {"cwd": "/tmp/beta/workspace"})
            bid = b_session["session_id"]
            submit(a, sid, "PROBE_SINGLE")
            qa = a.wait(lambda f: f.get("method") == "clarify")
            submit(b, bid, "PROBE_SINGLE")
            qb = b.wait(lambda f: f.get("method") == "clarify")
            b.answer(qa, {"answer": "foreign"})
            assert b.request("session.events.since", {"session_id": bid})["open_requests"][0]["id"] == qb["id"]
            assert a.request("session.events.since", {"session_id": sid})["open_requests"][0]["id"] == qa["id"]
            a.answer(qa, {"answer": "Oak"})
            b.answer(qb, {"answer": "Birch"})
            finished(a, sid)
            finished(b, bid)
            foreign = b.request("session.resume", {"session_id": stored}, allow_error=True)
            assert "error" in foreign, foreign
            checks.append("two owned profiles run independently; foreign response/resume cannot cross profiles")

            a.raw("not json")
            parse_error = a.wait(lambda f: f.get("error", {}).get("code") == -32700)
            assert parse_error["id"] is None
            missing = a.request("blueoffice.unsupported", allow_error=True)
            assert missing["error"]["code"] == -32601
            invalid = a.request("session.create", {"cwd": 42}, allow_error=True)
            report["invalid_parameter_probe"] = {"input": {"cwd": 42}, "result": invalid,
                "strictly_rejected": "error" in invalid}
            assert a.process.poll() is None
            checks.append("malformed JSON and missing method errors; invalid-parameter behavior captured")

            created = a.request("profiles.create", {"name": "probe-child", "no_skills": True,
                "no_alias": True, "mirror_credentials": False, "share_auth": False})
            assert created["ok"] and created["mirrored"]["env"] is False
            configured = a.request("profiles.configure", {"name": "probe-child", "description": "Synthetic profile",
                "soul": "Synthetic assistant", "ui_meta": {"color": "blue"}, "ui_meta_expected_revisions": {"color": 0}})
            assert configured["applied"]["soul"] is True
            partial = a.request("profiles.configure", {"name": "probe-child", "description": "Readback survives conflict",
                "ui_meta": {"color": "red"}, "ui_meta_expected_revisions": {"color": 0}})
            report["partial_config"] = partial
            assert partial["applied"]["description"] is True and partial["applied"]["ui_meta"] is False
            configured = a.request("config.set", {"key": "reasoning", "value": "low", "scope": "global"})
            readback = a.request("config.get", {"key": "full"})
            assert readback["config"]["blueoffice_unknown"] == {"keep": True}
            report["config_reasoning_readback"] = a.request("config.get", {"key": "reasoning"})
            assert report["config_reasoning_readback"]["value"] == "low"
            unsupported = a.request("config.set", {"key": "blueoffice.arbitrary", "value": "no"}, allow_error=True)
            assert "error" in unsupported
            report["profile_readback"] = a.request("profiles.list")
            child_profile = next(p for p in report["profile_readback"]["profiles"] if p["name"] == "probe-child")
            assert child_profile["description"] == "Readback survives conflict"
            assert child_profile["ui_meta"]["color"] == "blue"
            checks.append("native profile create/configure, partial conflict, config readback and unknown-key preservation")

            report["history"] = a.request("session.list")
            assert stored in json.dumps(report["history"])
            epoch = a.request("session.events.since", {"session_id": sid})["epoch"]
            stopped = a.stop()
            assert stopped == {"returncode": 0, "forced": False}, stopped
            a = launch("alpha")
            resumed = a.request("session.resume", {"session_id": stored})
            assert resumed["resumed"] == stored and resumed["session_key"] == stored and resumed["session_id"] != sid
            report["resume_id_fields"] = {key: resumed.get(key) for key in ("session_id", "stored_session_id", "resumed", "session_key")}
            assert resumed["messages"] and not resumed.get("open_requests")
            new_sid = resumed["session_id"]
            assert a.request("session.events.since", {"session_id": new_sid})["epoch"] != epoch
            submit(a, new_sid, "PROBE_RESUMED")
            finished(a, new_sid)
            checks.append("history discovery, graceful exit, explicit stored-ID resume and new replay epoch")
            code = (f"import sys,runpy; sys.path.insert(0,{installation['source']!r}); "
                    "import hermes_bootstrap; runpy.run_path('/probe/probe_requests.py',run_name='__main__')")
            module_probe = subprocess.run([installation["python"], "-B", "-I", "-c", code],
                env={"PATH": "/usr/bin:/bin", "HERMES_HOME": "/tmp/alpha", "HERMES_DISABLE_LAZY_INSTALLS": "1"},
                text=True, capture_output=True, timeout=15, check=True)
            report["module_probe"] = json.loads(module_probe.stdout)
            report["wire_proven_methods"] = sorted({r["frame"]["method"] for r in trace
                if r["direction"] == "send" and r["frame"].get("method") not in (None, "blueoffice.unsupported")})
            report["passed"] = True
        except Exception as exc:
            report["error"] = f"{type(exc).__name__}: {exc}"
            traceback.print_exc()
        finally:
            report["shutdown"] = [{"owner": g.label, **g.stop()} for g in gateways]
            if any(s["forced"] or s["returncode"] != 0 for s in report["shutdown"]):
                report["passed"] = False
                report["error"] = "One or more owned runtimes did not exit gracefully"
            report["provider_calls"] = provider.calls
            for g in gateways:
                Path(f"/evidence/{g.label}.stderr.txt").write_text("\n".join(g.diagnostics))
            Path("/evidence/trace.json").write_text(json.dumps(trace, indent=2))
            Path("/evidence/report.json").write_text(json.dumps(report, indent=2))
    print(json.dumps({"passed": report["passed"], "checks": checks, "error": report.get("error")}, indent=2))
    return 0 if report["passed"] else 1


if __name__ == "__main__":
    sys.exit(main())
