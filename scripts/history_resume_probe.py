#!/usr/bin/env python3
"""Installed-Hermes history reader evidence in a private synthetic namespace."""
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import time


def inner(installation):
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
    from probe_provider import MockProvider
    from probe_rpc import Gateway
    config = installation["managedConfig"]
    config.update(terminal={"cwd": str(workspace), "backend": "local"}, platform_toolsets={"cli": ["clarify"]}, approvals={"mode": "manual"}, mcp_servers={})
    (root / "config.yaml").write_text(json.dumps(config))
    (root / ".blueoffice-agent.json").write_text(json.dumps({"agentId": "resume-probe"}))
    (root / ".env").write_text("")
    db = SessionDB(root / "state.db")
    route = {"provider": "custom:blueoffice-glm", "base_url": "http://127.0.0.1:8317/v1", "api_mode": "chat_completions"}
    db.create_session("owned-parent", "cli", model="glm-5.3-flash", model_config=route)
    db.append_message("owned-parent", "user", "Previously explicit task")
    db.end_session("owned-parent", "context_compression")
    db.create_session("owned-tip", "cli", model="glm-5.3-flash", model_config=route, parent_session_id="owned-parent")
    db.append_message("owned-tip", "assistant", "Compacted context retained")
    db.create_session("conflicting-route", "cli", model="glm-5.3-flash", model_config={**route, "base_url": "http://127.0.0.1:9999/v1"})
    db.create_session("conflicting-model", "cli", model="muse-spark-1.3-contributor", model_config=route)
    db.create_session("foreign-profile", "cli", model="glm-5.3-flash", model_config=route, profile_name="foreign")
    db.close()
    with MockProvider(port=8317) as provider:
        resume = plan(root, "owned-parent", "glm-5.3-flash", "resume-probe", installation["source"])
        assert resume["resolvedStoredSessionId"] == "owned-tip", resume
        for stored in ("conflicting-route", "conflicting-model", "foreign-profile", "owned-par"):
            try:
                plan(root, stored, "glm-5.3-flash", "resume-probe", installation["source"])
                raise AssertionError("unsafe resume admitted: " + stored)
            except ResumeError:
                pass
        assert provider.calls == [], "preflight made provider requests"
        record_turn_start(root, "owned-tip", "CRASH_MARKER_MUST_NOT_REPLAY")
        trace = []
        env = {"PATH": "/usr/bin:/bin", "LANG": "C.UTF-8", "HERMES_HOME": str(root), "HERMES_DISABLE_LAZY_INSTALLS": "1", "HERMES_PYTHON_SRC_ROOT": installation["source"], "BLUEOFFICE_PROXY_KEY": "synthetic", "BLUEOFFICE_MODEL": "glm-5.3-flash", "BLUEOFFICE_RESUME_PLAN": json.dumps(resume), "BLUEOFFICE_RESUME_MODEL": "glm-5.3-flash", "HERMES_TUI_GATEWAY_SHUTDOWN_GRACE_S": "1"}
        gateway = Gateway([installation["python"], "-B", "-I", "/probe/owned_gateway.py", installation["source"], str(root), "fresh-office-epoch", "resume-probe"], env, workspace, "resume-owned", trace)
        try:
            gateway.event("gateway.ready")
            gateway.request("client.capabilities", {"server_requests": True})
            result = gateway.request("session.resume", {"session_id": "owned-parent", "defer_history": True, "eager_build": False, "omit_messages": True})
            assert result["resumed"] == "owned-tip" and result["session_key"] == "owned-tip", result
            assert result["session_id"] != "owned-tip" and result["session_id"] != "owned-parent"
            time.sleep(1)
            Path("/evidence/provider-calls.json").write_text(json.dumps(provider.calls, indent=2))
            assert provider.calls == [], "resume silently replayed crash marker"
            gateway.request("prompt.submit", {"session_id": result["session_id"], "text": "NEW_EXPLICIT_PROMPT"})
            gateway.event("message.complete", result["session_id"])
            assert any(c["path"] == "/v1/chat/completions" for c in provider.calls) and all(c["model"] == "glm-5.3-flash" and c["path"] == "/v1/chat/completions" for c in provider.calls if c["path"].startswith("/v1/")), provider.calls
            assert all("CRASH_MARKER_MUST_NOT_REPLAY" not in json.dumps(c) for c in provider.calls)
        finally:
            stopped = gateway.stop()
            Path("/evidence/native.stderr.txt").write_text("\n".join(gateway.diagnostics))
            Path("/evidence/trace.json").write_text(json.dumps(trace, indent=2))
            assert stopped == {"returncode": 0, "forced": False}, stopped
        report = {"passed": True, "hermesRevision": installation["revision"], "isolated": True, "realProviderCalls": 0, "syntheticProviderCalls": len(provider.calls), "checks": ["exact source and compression-tip resolution", "foreign profile refused", "conflicting stored model/endpoint refused before construction", "owned launch rechecks route and policy under lease", "fresh live ID", "fresh crash marker stays passive until explicit prompt", "explicit prompt uses verified managed model and endpoint"]}
        Path("/evidence/report.json").write_text(json.dumps(report, indent=2))


def main():
    if len(sys.argv) > 1 and sys.argv[1] == "--inner":
        inner(json.loads(sys.argv[2]))
        return
    from hermes_probe import discover
    launcher = shutil.which("hermes")
    if not launcher or not shutil.which("bwrap"):
        raise RuntimeError("Installed Hermes and bubblewrap are required; no unisolated fallback")
    installation = discover(launcher)
    if installation["revision"] != "f1247d2e0146bbd8edd4e510b9e67e0d259509a4":
        raise RuntimeError("Installed Hermes revision has not been verified")
    installation["managedConfig"] = json.loads(subprocess.check_output(["node", "--import", "tsx", "--input-type=module", "-e", "import {routingConfig} from './server/routes.ts'; console.log(JSON.stringify(routingConfig('glm-5.3-flash')));"], text=True))
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
    result = subprocess.run(command, timeout=90, capture_output=True, text=True)
    (output / "stdout.log").write_text(result.stdout)
    (output / "stderr.log").write_text(result.stderr)
    print("Resume probe evidence:", output)
    if result.returncode:
        print(result.stderr, file=sys.stderr)
        raise SystemExit(result.returncode)
    assert json.loads((output / "report.json").read_text())["passed"]


if __name__ == "__main__":
    main()
