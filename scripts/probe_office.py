"""Run the production TypeScript supervisor with real Hermes in the isolated suite."""
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
from probe_provider import MockProvider

installation = json.loads(sys.argv[1])
root = Path("/tmp/alpha")
key = hashlib.sha256(installation["source"].encode()).hexdigest()[:16]
selection = root / "installs" / key
selection.mkdir(parents=True, exist_ok=True)
dependency = selection / "environments" / Path(installation["venv"]).parent.name / "venv"
(selection / "facts.json").write_text(json.dumps({"schema": 1, "packages": {"venv": {"environment": str(dependency)}}}))
(root / "workspace").mkdir(exist_ok=True)
(root / "mock-key").write_text("synthetic-office-key")
installation["profile_root"] = str(root)
with MockProvider(port=8317) as provider:
    result = subprocess.run([os.environ["BLUEOFFICE_NODE"], "--import", "tsx", "tests/installed-runtime.ts", json.dumps(installation)],
                            cwd="/office", timeout=100)
    report_path = Path("/evidence/report.json")
    report = json.loads(report_path.read_text())
    report["provider_calls"] = provider.calls
    report["hermes_revision"] = installation["revision"]
    report["source_sha256"] = json.loads(sys.argv[2])
    report_path.write_text(json.dumps(report, indent=2))
raise SystemExit(result.returncode)
