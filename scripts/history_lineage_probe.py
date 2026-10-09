#!/usr/bin/env python3
"""Installed-Hermes native delegation lineage evidence in a private synthetic namespace."""
import argparse
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
    os.environ.update(HERMES_HOME=str(root), BLUEOFFICE_PROXY_KEY="synthetic")
    selection = root / "installs" / hashlib.sha256(installation["source"].encode()).hexdigest()[:16]
    selection.mkdir(parents=True, exist_ok=True)
    environment = selection / "environments" / Path(installation["venv"]).parent.name / "venv"
    (selection / "facts.json").write_text(json.dumps({"schema": 1, "packages": {"venv": {"environment": str(environment)}}}))
    config = installation["managedConfigs"][model]
    config.update(terminal={"cwd": str(workspace), "backend": "local"}, platform_toolsets={"cli": ["clarify"]}, approvals={"mode": "manual"}, mcp_servers={})
    (root / "config.yaml").write_text(json.dumps(config))
    (root / ".env").write_text("")
    sys.path.insert(0, installation["source"])
    import hermes_bootstrap
    from hermes_state import SessionDB
    from run_agent import AIAgent
    from tools.delegate_tool import _build_child_agent
    from tools.delegate_tool_results import _run_child_lifecycle
    import hermes_cli.lifecycle as lifecycle
    import hermes_cli.plugins as plugins
    from history_resume_provider import ResumeProvider
    from tui_gateway import server as gateway
    wire = []
    gateway.write_json = lambda frame: wire.append(frame) or True
    hooks, events = [], []
    def hook(name, **payload):
        if name in ("subagent_start", "subagent_stop"):
            hooks.append({"event": name, **{k: v for k, v in payload.items() if k in ("parent_session_id", "parent_turn_id", "child_session_id", "child_subagent_id", "child_status")}})
        return []  # Native plugin hook result contract.
    def progress(kind, *args, **payload):
        gateway._on_tool_progress("parent-live-proof", kind, *args, **payload)
        if kind.startswith("subagent."):
            events.append({"event": kind, **{k: v for k, v in payload.items() if k in ("child_session_id", "subagent_id", "parent_id", "status", "delegation_id")}})
    # Observe native emissions without invoking optional user plugins.
    lifecycle.invoke_hook = hook
    plugins.invoke_hook = hook
    with ResumeProvider(model) as provider:
        provider.phase = "explicit"
        db = SessionDB(root / "state.db")
        db.create_session("parent-stored", "cli", model=model)
        parent = AIAgent(model=model, provider="custom:blueoffice-glm", base_url="http://127.0.0.1:8317/v1", api_key="synthetic", api_mode="chat_completions", session_id="parent-stored", session_db=db, enabled_toolsets=["clarify"], quiet_mode=True, skip_context_files=True, skip_memory=True, skip_background_review=True, tool_progress_callback=progress, cwd=str(workspace))
        parent._current_turn_id = "parent-turn-proof"
        child = _build_child_agent(0, "LINEAGE_CHILD_GOAL", None, ["clarify"], model, 2, 1, parent)
        child_id = child.session_id
        result = _run_child_lifecycle(0, "LINEAGE_CHILD_GOAL", child, parent)
        assert result["status"] == "completed", result
        row = db.get_session(child_id)
        assert row["source"] == "subagent" and row["parent_session_id"] == "parent-stored", row
        raw = row["model_config"]
        cfg = json.loads(raw) if isinstance(raw, str) else raw
        assert cfg["_delegate_from"] == "parent-stored", cfg
        assert any(e["event"] == "subagent_start" and e["parent_session_id"] == "parent-stored" and e["child_session_id"] == child_id and e["parent_turn_id"] == "parent-turn-proof" for e in hooks), hooks
        assert any(e["event"] == "subagent_stop" and e["child_session_id"] == child_id and e["child_status"] == "completed" for e in hooks), hooks
        assert any(e["event"] == "subagent.complete" and e.get("child_session_id") == child_id and e.get("status") == "completed" for e in events), events
        assert any(f.get("params", {}).get("type") == "subagent.complete" and f["params"].get("payload", {}).get("child_session_id") == child_id for f in wire), wire
        Path("/evidence/native-wire.json").write_text(json.dumps(wire, indent=2))
        # Compression ancestry alone is not delegation.
        db.end_session("parent-stored", "context_compression")
        db.create_session("compression-child", "cli", model=model, parent_session_id="parent-stored")
        compression = db.get_session("compression-child")
        assert compression["source"] == "cli" and "_delegate_from" not in json.dumps(compression["model_config"])
        parent.close()
        db.close()
        from history_reader import read
        projected = read(root, None, "native")
        projected_child = next(r for r in projected["records"] if r["storedSessionId"] == child_id)
        assert projected_child["parentStoredSessionId"] == "parent-stored" and projected_child["lineageEvidence"] == "native-delegate-marker", projected_child
        assert next(r for r in projected["records"] if r["storedSessionId"] == "compression-child")["parentStoredSessionId"] is None
        Path("/evidence/public-native-projection.json").write_text(json.dumps(projected, indent=2))
        Path("/evidence/native-lineage.json").write_text(json.dumps({"childStoredSessionId": child_id, "parentStoredSessionId": "parent-stored", "persistedSource": row["source"], "persistedDelegateFrom": cfg["_delegate_from"], "endReason": row.get("end_reason"), "hooks": hooks, "events": events}, indent=2))
        Path("/evidence/provider-requests.json").write_text(json.dumps(provider.requests, indent=2))
        assert not provider.rejected, provider.rejected
        Path("/evidence/report.json").write_text(json.dumps({"passed": True, "hermesRevision": installation["revision"], "schema": 30, "realProviderCalls": 0, "checks": ["native delegate child stored id and typed model_config marker", "native start/stop parent stored id and parent turn", "native gateway JSON-RPC event frame with exact child stored id and structured outcome", "compression parent alone is not delegation"]}, indent=2))


def main():
    if len(sys.argv) > 1 and sys.argv[1] == "--inner":
        inner(json.loads(sys.argv[2]), sys.argv[3])
        return
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, help="Fresh evidence directory supplied by the verification runner")
    args = parser.parse_args()
    from hermes_probe import discover
    launcher = shutil.which("hermes")
    if not launcher or not shutil.which("bwrap"):
        raise RuntimeError("Installed Hermes and bubblewrap are required; no unisolated fallback")
    installation = discover(launcher)
    if installation["revision"] != "f1247d2e0146bbd8edd4e510b9e67e0d259509a4":
        raise RuntimeError("Installed Hermes revision has not been verified")
    installation["managedConfigs"] = json.loads(subprocess.check_output(["node", "--import", "tsx", "--input-type=module", "-e", "import {routingConfig} from './server/routes.ts'; console.log(JSON.stringify(Object.fromEntries(['glm-5.3-flash','muse-spark-1.3-contributor'].map(m=>[m,routingConfig(m)]))));"], text=True))
    output = args.output or Path("artifacts/history-lineage-probe") / str(time.time_ns())
    output.mkdir(parents=True, exist_ok=True)
    output = output.resolve()
    (output / "report.json").write_text(json.dumps({"passed": False, "runner_completed": False, "phase": "running"}))
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
    command += ["--ro-bind", str(scripts), "/probe", "--bind", str(output), "/evidence", "--setenv", "PATH", "/usr/bin:/bin", "--setenv", "LANG", "C.UTF-8", "--setenv", "HERMES_DISABLE_LAZY_INSTALLS", "1", "--chdir", "/tmp", installation["python"], "-B", "/probe/history_lineage_probe.py", "--inner", json.dumps(installation)]
    reports = []
    for model in ("glm-5.3-flash",):
        evidence = output / model
        evidence.mkdir()
        attempt = list(command)
        attempt[attempt.index("/evidence") - 1] = str(evidence)
        result = subprocess.run([*attempt, model], timeout=90, capture_output=True, text=True)
        (evidence / "stdout.log").write_text(result.stdout)
        (evidence / "stderr.log").write_text(result.stderr)
        if result.returncode:
            (output / "report.json").write_text(json.dumps({"passed": False, "runner_completed": False, "phase": "completed", "failedModel": model, "exitCode": result.returncode, "models": reports}, indent=2))
            print(result.stderr, file=sys.stderr)
            print("Lineage probe evidence:", output)
            raise SystemExit(result.returncode)
        report = json.loads((evidence / "report.json").read_text())
        assert report["passed"]
        reports.append(report)
    (output / "report.json").write_text(json.dumps({"passed": True, "runner_completed": True, "hermesRevision": installation["revision"], "models": reports, "realProviderCalls": 0}, indent=2))
    print("Lineage probe evidence:", output)



if __name__ == "__main__":
    main()
