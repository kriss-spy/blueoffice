"""Linux owned-child entry: canonical profile lease and parent-death termination.

The open flock stays held for the entire Hermes process, including after a Node
crash. It is never broken based on an untrusted PID file. Hermes runs in-process.
"""
import ctypes
import contextlib
import fcntl
import json
import os
from pathlib import Path
import runpy
import signal
import sys

source, profile, epoch, agent_id = sys.argv[1:5]
profile_path = Path(profile).resolve(strict=True)
owner = json.loads((profile_path / ".blueoffice-agent.json").read_text())
if owner.get("agentId") != agent_id:
    raise SystemExit("Profile is not managed by this office agent")
lease_fd = os.open(profile_path / ".blueoffice-lease", os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600)
try:
    fcntl.flock(lease_fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
except BlockingIOError:
    raise SystemExit("This profile already has an owned runtime")
parent_pid = os.getppid()
libc = ctypes.CDLL(None, use_errno=True)
if libc.prctl(1, signal.SIGTERM, 0, 0, 0) != 0:
    raise SystemExit("Could not establish owned runtime parent-death handling")
if os.getppid() != parent_pid or parent_pid == 1:
    raise SystemExit("Office supervisor exited during startup")
metadata = json.dumps({"agentId": agent_id, "epoch": epoch, "pid": os.getpid(), "parentPid": parent_pid})
os.ftruncate(lease_fd, 0)
os.write(lease_fd, metadata.encode())
os.fsync(lease_fd)
os.environ["HERMES_HOME"] = str(profile_path)
sys.argv = ["tui_gateway.entry"]
sys.path.insert(0, source)
sys.path.insert(0, str(Path(__file__).resolve().parent))
import hermes_bootstrap
from hermes_cli.config import load_config
from profile_settings import validate_resume_policy
validate_resume_policy(load_config())
saved_argv = sys.argv
sys.argv = ["check_route.py", source, os.environ.pop("BLUEOFFICE_MODEL")]
with contextlib.redirect_stdout(sys.stderr):
    runpy.run_path(str(Path(__file__).resolve().parent / "check_route.py"))
sys.argv = saved_argv
if os.environ.get("BLUEOFFICE_RESUME_PLAN"):
    from history_resume import plan
    expected = json.loads(os.environ.pop("BLUEOFFICE_RESUME_PLAN"))
    actual = plan(profile_path, expected["requestedStoredSessionId"], os.environ.pop("BLUEOFFICE_RESUME_MODEL"), agent_id, source)
    if actual != expected:
        raise SystemExit("Profile or stored resume target changed after preflight; no conversation was resumed")
runpy.run_module("tui_gateway.entry", run_name="__main__")
