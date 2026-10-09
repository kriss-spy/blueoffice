#!/usr/bin/env python3
"""Installed-Hermes history reader evidence in a private synthetic namespace."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import time


def inner(installation):
    root = Path("/tmp/history-profile")
    root.mkdir()
    os.environ["HERMES_HOME"] = str(root)
    sys.path.insert(0, installation["source"])
    from hermes_state import SessionDB
    from history_reader import read
    db = SessionDB(root / "state.db")
    db.create_session("stored-cli-different-from-live", "cli", system_prompt="SYSTEM_SECRET_CANARY")
    db.create_session("stored-cron", "cron")
    db.create_session("foreign-owner-row", "cli", profile_name="other-profile")
    db.append_message("stored-cli-different-from-live", "system", "SYSTEM_SECRET_CANARY")
    db.append_message("stored-cli-different-from-live", "user", "Find the cobalt notebook")
    db.append_message("stored-cli-different-from-live", "assistant", "Public answer", reasoning="REASONING_SECRET_CANARY", reasoning_content="REASONING_SECRET_CANARY", display_metadata={"password": "METADATA_SECRET_CANARY"}, tool_calls=[{"id": "tool-call-1", "type": "function", "function": {"name": "terminal", "arguments": json.dumps({"command": "echo notes TOKEN=ARG_SECRET_CANARY"})}}])
    db.append_message("stored-cli-different-from-live", "tool", "TOOL_RESULT_SECRET_CANARY", tool_name="terminal", tool_call_id="tool-call-1")
    db.append_message("stored-cli-different-from-live", "user", "HIDDEN_ROW_CANARY", display_kind="hidden")
    # Exercise the installed background usage writer, not hand-shaped cost rows.
    db.update_token_counts("stored-cli-different-from-live", input_tokens=20,
        output_tokens=10, api_call_count=1, estimated_cost_usd=None,
        actual_cost_usd=None, cost_status="unknown", cost_source="none")
    db.update_token_counts("stored-cron", api_call_count=1, actual_cost_usd=0,
        cost_status="actual", cost_source="provider")
    db.close()
    path = root / "state.db"
    before = hashlib.sha256(path.read_bytes()).hexdigest()
    result = read(root, "stored-cli-different-from-live", installation["source"])
    encoded = json.dumps(result)
    for canary in ("SYSTEM_SECRET_CANARY", "REASONING_SECRET_CANARY", "METADATA_SECRET_CANARY", "TOOL_RESULT_SECRET_CANARY", "HIDDEN_ROW_CANARY", "ARG_SECRET_CANARY"):
        assert canary not in encoded, canary + " escaped"
    assert result["records"][0]["storedSessionId"] == "stored-cli-different-from-live"
    assert [message["text"] for message in result["messages"]] == ["Find the cobalt notebook", "Public answer"], result
    assert result["tools"][0]["id"] == "tool-call-1", result
    assert result["tools"][0]["name"] == "terminal"
    assert result["tools"][0]["outcome"] == "unknown"
    assert result["records"][0]["metrics"]["calls"] == 1
    assert result["records"][0]["metrics"]["costUsd"] is None
    assert result["records"][0]["metrics"]["costKind"] is None
    actual_cost = read(root, "stored-cron", installation["source"])["records"][0]["metrics"]
    assert actual_cost["costUsd"] == 0 and actual_cost["costKind"] == "actual", actual_cost
    assert {row["source"] for row in read(root, None, installation["source"])["records"]} == {"cli", "cron"}
    assert read(root, "stored-cli", installation["source"])["records"] == [], "prefix must not resolve"
    assert read(root, "foreign-owner-row", installation["source"])["records"] == [], "foreign profile row must not be served"
    request = subprocess.run([installation["python"], "-B", "-I", "/probe/history_reader.py", installation["source"], str(root), installation["revision"]], input=json.dumps({"profileHome": str(root), "storedSessionId": "stored-cli-different-from-live"}), capture_output=True, text=True, check=True)
    assert json.loads(request.stdout)["messages"] == result["messages"], request.stdout
    assert before == hashlib.sha256(path.read_bytes()).hexdigest(), "history database changed"
    report = {"passed": True, "hermesRevision": installation["revision"], "schema": 30, "isolated": True, "providerCalls": 0, "databaseUnchanged": True, "checks": ["CLI and cron source visibility", "exact stored id", "public native projection", "system/reasoning/hidden/tool payload redaction", "unknown tool outcome", "native usage-writer unknown price remains unavailable", "evidenced actual zero cost", "read-only database"]}
    Path("/evidence/report.json").write_text(json.dumps(report, indent=2) + "\n")
    Path("/evidence/public-detail.json").write_text(json.dumps(result, indent=2) + "\n")


def main():
    if len(sys.argv) > 1 and sys.argv[1] == "--inner":
        inner(json.loads(sys.argv[2]))
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
    output = args.output or Path("artifacts/history-probe") / str(time.time_ns())
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
    scripts = Path(__file__).resolve().parent
    command += ["--ro-bind", str(scripts), "/probe", "--bind", str(output), "/evidence", "--setenv", "PATH", "/usr/bin:/bin", "--setenv", "LANG", "C.UTF-8", "--setenv", "HERMES_DISABLE_LAZY_INSTALLS", "1", "--chdir", "/tmp", installation["python"], "-B", "/probe/history_probe.py", "--inner", json.dumps(installation)]
    result = subprocess.run(command, timeout=90, capture_output=True, text=True)
    (output / "stdout.log").write_text(result.stdout)
    (output / "stderr.log").write_text(result.stderr)
    report = json.loads((output / "report.json").read_text())
    report["runner_completed"] = result.returncode == 0
    report["passed"] = report.get("passed") is True and report["runner_completed"]
    (output / "report.json").write_text(json.dumps(report, indent=2))
    print("History probe evidence:", output)
    if result.returncode:
        print(result.stderr, file=sys.stderr)
        raise SystemExit(result.returncode)
    assert json.loads((output / "report.json").read_text())["passed"]


if __name__ == "__main__":
    main()
