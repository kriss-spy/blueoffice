"""Deliberate route verification. --live is required before any credential or live call is used."""
import argparse
import fcntl
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--live", action="store_true")
args = parser.parse_args()
root = Path(__file__).resolve().parents[1]
os.chdir(root)
data = Path(os.environ.get("BLUEOFFICE_DATA", ".blueoffice")).resolve()
data.mkdir(mode=0o700, parents=True, exist_ok=True)
lock = (data / "routes.lease").open("w")
try:
    fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
except BlockingIOError:
    raise SystemExit("Route verification is already running")

def publish(report):
    temporary = data / "routes.pending.json"
    temporary.write_text(json.dumps(report, indent=2))
    temporary.chmod(0o600)
    temporary.replace(data / "routes.json")

if args.live:
    publish({"routes": [], "phase": "verifying"})
result = subprocess.run([sys.executable, "scripts/hermes_probe.py", "--suite", "routes", "--output", "artifacts/routes-mock"])
if result.returncode:
    raise SystemExit(result.returncode)
if not args.live:
    print("Mock routes passed. Run npm run verify:routes -- --live for small deliberate live probes. No live route was admitted.")
    raise SystemExit(0)
config_path = Path.home() / ".cli-proxy-api/config.yaml"
before = hashlib.sha256(config_path.read_bytes()).hexdigest()
result = subprocess.run([sys.executable, "scripts/hermes_probe.py", "--suite", "routes", "--live", "--output", "artifacts/routes-live"])
unchanged = before == hashlib.sha256(config_path.read_bytes()).hexdigest()
report = json.loads((root / "artifacts/routes-live/report.json").read_text())
report["proxyConfigUnchanged"] = unchanged
if not unchanged or not report.get("runner_completed"):
    report["passed"] = False
    for route in report.get("routes", []): route["passed"] = False
publish(report)
print(json.dumps({"passed": report.get("passed", False), "proxyConfigUnchanged": unchanged, "evidence": str(data / "routes.json")}))
raise SystemExit(0 if report.get("passed") else result.returncode or 1)
