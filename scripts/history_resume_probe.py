#!/usr/bin/env python3
"""Installed-Hermes passive owned resume evidence in a private synthetic namespace."""
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import time


def inner(installation, model):
    root = Path("/tmp/resume-profile")
    root.mkdir(exist_ok=True)
    workspace = root / "workspace"
    workspace.mkdir()
    os.environ["HERMES_HOME"] = str(root)
    selection = root / "installs" / hashlib.sha256(installation["source"].encode()).hexdigest()[:16]
    selection.mkdir(parents=True, exist_ok=True)
    environment = selection / "environments" / Path(installation["venv"]).parent.name / "venv"
    (selection / "facts.json").write_text(json.dumps({"schema": 1, "packages": {"venv": {"environment": str(environment)}}}))
    sys.path.insert(0, installation["source"])
    import hermes_bootstrap
    from hermes_state import SessionDB
    from history_resume import plan, ResumeError
    from tui_gateway.turn_marker import record_turn_start
    from history_resume_provider import ResumeProvider
    from probe_rpc import Gateway
    config = installation["managedConfigs"][model]
    config.update(terminal={"cwd": str(workspace), "backend": "local"}, platform_toolsets={"cli": ["clarify"]}, approvals={"mode": "manual"}, mcp_servers={})
    (root / "config.yaml").write_text(json.dumps(config))
    (root / ".blueoffice-agent.json").write_text(json.dumps({"agentId": "resume-probe"}))
    (root / ".env").write_text("")
    db = SessionDB(root / "state.db")
    family = "codex_responses" if model == "muse-spark-1.3-contributor" else "chat_completions"
    route = {"provider": "custom:blueoffice-muse" if family == "codex_responses" else "custom:blueoffice-glm", "base_url": "http://127.0.0.1:8317/v1", "api_mode": family}
    other_model = "glm-5.3-flash" if family == "codex_responses" else "muse-spark-1.3-contributor"
    db.create_session("owned-parent", "cli", model=model, model_config=route)
    db.append_message("owned-parent", "user", "Previously explicit task")
    db.end_session("owned-parent", "context_compression")
    db.create_session("owned-tip", "cli", model=model, model_config=route, parent_session_id="owned-parent")
    db.append_message("owned-tip", "assistant", "Compacted context retained")
    db.create_session("conflicting-route", "cli", model=model, model_config={**route, "base_url": "http://127.0.0.1:9999/v1"})
    db.create_session("conflicting-model", "cli", model=other_model, model_config=route)
    db.create_session("profile-follow-mismatch", "cli", model=other_model, model_config={**route, "follow_profile_config": True})
    db.create_session("foreign-profile", "cli", model=model, model_config=route, profile_name="foreign")
    db.close()
    with ResumeProvider(model) as provider:
        before = hashlib.sha256((root / "state.db").read_bytes()).hexdigest()
        resume = plan(root, "owned-parent", model, "resume-probe", installation["source"])
        assert resume["resolvedStoredSessionId"] == "owned-tip", resume
        for stored in ("conflicting-route", "conflicting-model", "profile-follow-mismatch", "foreign-profile", "owned-par"):
            try:
                plan(root, stored, model, "resume-probe", installation["source"])
                raise AssertionError("unsafe resume admitted: " + stored)
            except ResumeError:
                pass
        assert provider.calls == [], "preflight made provider requests"
        assert before == hashlib.sha256((root / "state.db").read_bytes()).hexdigest(), "resume preflight wrote history"
        record_turn_start(root, "owned-tip", "CRASH_MARKER_MUST_NOT_REPLAY")
        trace = []
        env = {"PATH": "/usr/bin:/bin", "LANG": "C.UTF-8", "HERMES_HOME": str(root), "HERMES_DISABLE_LAZY_INSTALLS": "1", "HERMES_PYTHON_SRC_ROOT": installation["source"], "BLUEOFFICE_PROXY_KEY": "synthetic", "BLUEOFFICE_MODEL": model, "BLUEOFFICE_RESUME_PLAN": json.dumps(resume), "BLUEOFFICE_RESUME_MODEL": model, "HERMES_TUI_GATEWAY_SHUTDOWN_GRACE_S": "1"}
        provider.phase = "passive"
        gateway = Gateway([installation["python"], "-B", "-I", "/probe/owned_gateway.py", installation["source"], str(root), "fresh-office-epoch", "resume-probe"], env, workspace, "resume-owned", trace)
        try:
            gateway.event("gateway.ready")
            gateway.request("client.capabilities", {"server_requests": True})
            result = gateway.request("session.resume", {"session_id": "owned-parent", "defer_history": True, "eager_build": False, "omit_messages": True})
            assert result["resumed"] == "owned-tip" and result["session_key"] == "owned-tip", result
            assert result["session_id"] != "owned-tip" and result["session_id"] != "owned-parent"
            # Emitted by _announce_built_agent only AFTER the hydrated agent build.
            gateway.event("session.info", result["session_id"])
            time.sleep(1.5)
            assert not provider.rejected, provider.rejected
            assert all(r["kind"] == "metadata" for r in provider.requests), provider.requests
            forbidden = {"message.start", "message.delta", "message.complete", "tool.start", "tool.complete", "tool.call", "turn.start"}
            assert not any(r["frame"].get("params", {}).get("type") in forbidden or r["frame"].get("method") in ("clarify", "approval") for r in trace), trace
            passive_requests = len(provider.requests)
            provider.phase = "explicit"
            gateway.request("prompt.submit", {"session_id": result["session_id"], "text": "NEW_EXPLICIT_PROMPT"})
            gateway.event("message.complete", result["session_id"])
            endpoint = "/v1/responses" if family == "codex_responses" else "/v1/chat/completions"
            inference = [r for r in provider.requests if r["kind"] == "inference"]
            assert inference and all(r["path"] == endpoint and r["body"]["model"] == model for r in inference), inference
            assert all("CRASH_MARKER_MUST_NOT_REPLAY" not in json.dumps(r["body"]) for r in inference)
            assert not provider.rejected, provider.rejected

        finally:
            stopped = gateway.stop()
            Path("/evidence/native.stderr.txt").write_text("\n".join(gateway.diagnostics))
            Path("/evidence/trace.json").write_text(json.dumps(trace, indent=2))
            Path("/evidence/provider-requests.json").write_text(json.dumps(provider.requests, indent=2))
            assert stopped == {"returncode": 0, "forced": False}, stopped
        report = {"passed": True, "hermesRevision": installation["revision"], "isolated": True, "realProviderCalls": 0, "model": model, "passiveMetadataRequests": passive_requests, "syntheticInferenceCalls": len(inference), "passiveInferenceCalls": 0, "checks": ["exact source and compression-tip resolution", "foreign profile refused", "conflicting stored model/endpoint refused before construction", "owned launch rechecks route and policy under lease", "fresh live ID", "settled native build plus quiet interval has only allowlisted model-only metadata; no inference, replay or tool/action", "explicit prompt uses verified managed model and endpoint"]}
        Path("/evidence/report.json").write_text(json.dumps(report, indent=2))


def main():
    if len(sys.argv) > 1 and sys.argv[1] == "--inner":
        inner(json.loads(sys.argv[2]), sys.argv[3])
        return
    from hermes_probe import discover
    launcher = shutil.which("hermes")
    if not launcher or not shutil.which("bwrap"):
        raise RuntimeError("Installed Hermes and bubblewrap are required; no unisolated fallback")
    installation = discover(launcher)
    if installation["revision"] != "f1247d2e0146bbd8edd4e510b9e67e0d259509a4":
        raise RuntimeError("Installed Hermes revision has not been verified")
    installation["managedConfigs"] = json.loads(subprocess.check_output(["node", "--import", "tsx", "--input-type=module", "-e", "import {routingConfig} from './server/routes.ts'; console.log(JSON.stringify(Object.fromEntries(['glm-5.3-flash','muse-spark-1.3-contributor'].map(m=>[m,routingConfig(m)]))));"], text=True))
    output = Path("artifacts/history-resume-probe") / str(time.time_ns())
    output.mkdir(parents=True)
    output = output.resolve()
    (output / "report.json").write_text(json.dumps({"passed": False, "phase": "running"}))
    command = ["bwrap", "--unshare-all", "--die-with-parent", "--new-session", "--clearenv"]
    for directory in ("/usr", "/lib", "/lib64", "/bin", "/etc"):
        if Path(directory).exists():
            command += ["--ro-bind", directory, directory]
    command += ["--proc", "/proc", "--dev", "/dev", "--tmpfs", "/tmp", "--tmpfs", "/home"]
    for directory in (installation["source"], str(Path(installation["runtime"]).parents[1]), str(Path(installation["venv"]).parent)):
        command += ["--ro-bind", directory, directory]
    relative = Path(installation["venv"]).relative_to(Path(installation["venv"]).parents[4])
    command += ["--ro-bind", installation["venv"], str(Path("/tmp/resume-profile") / relative)]
    scripts = Path(__file__).resolve().parent
    command += ["--ro-bind", str(scripts), "/probe", "--bind", str(output), "/evidence", "--setenv", "PATH", "/usr/bin:/bin", "--setenv", "LANG", "C.UTF-8", "--setenv", "HERMES_DISABLE_LAZY_INSTALLS", "1", "--chdir", "/tmp", installation["python"], "-B", "/probe/history_resume_probe.py", "--inner", json.dumps(installation)]
    reports = []
    for model in installation["managedConfigs"]:
        evidence = output / model
        evidence.mkdir()
        attempt = list(command)
        attempt[attempt.index("/evidence") - 1] = str(evidence)
        result = subprocess.run([*attempt, model], timeout=90, capture_output=True, text=True)
        (evidence / "stdout.log").write_text(result.stdout)
        (evidence / "stderr.log").write_text(result.stderr)
        if result.returncode:
            print(result.stderr, file=sys.stderr)
            print("Resume probe evidence:", output)
            raise SystemExit(result.returncode)
        report = json.loads((evidence / "report.json").read_text())
        assert report["passed"]
        reports.append(report)
    (output / "report.json").write_text(json.dumps({"passed": True, "hermesRevision": installation["revision"], "models": reports, "realProviderCalls": 0}, indent=2))
    print("Resume probe evidence:", output)



if __name__ == "__main__":
    main()
