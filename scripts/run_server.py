"""Hold the office database's kernel lease across exec into the Node server."""
import fcntl
import os
from pathlib import Path
import shutil
import sys

os.umask(0o077)
data = Path(os.environ.get("BLUEOFFICE_DATA", ".blueoffice")).resolve()
data.mkdir(parents=True, exist_ok=True, mode=0o700)
lease = os.open(data / "server.lease", os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
try:
    fcntl.flock(lease, fcntl.LOCK_EX | fcntl.LOCK_NB)
except BlockingIOError:
    raise SystemExit("Another BlueOffice server owns this data directory.")
os.set_inheritable(lease, True)
node = shutil.which("node")
if not node:
    raise SystemExit("Node.js 22.13+ is required")
os.execv(node, [node, "--import", "tsx", "server/main.ts", *sys.argv[1:]])
