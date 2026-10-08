"""Exercise the actual Linux ownership wrappers without models or native user data."""
import fcntl
import json
import os
from pathlib import Path
import select
import signal
import subprocess
import sys
import tempfile
import time
import unittest

ROOT = Path(__file__).resolve().parents[1]


class OwnershipTests(unittest.TestCase):
    def test_parent_death_releases_profile_kernel_lease(self):
        with tempfile.TemporaryDirectory(prefix="blueoffice-ownership-") as directory:
            root = Path(directory)
            source = root / "source" / "tui_gateway"
            source.mkdir(parents=True)
            (source / "__init__.py").write_text("")
            (source / "entry.py").write_text('import time\nprint("READY", flush=True)\ntime.sleep(60)\n')
            profile = root / "profile"
            profile.mkdir()
            (profile / ".blueoffice-agent.json").write_text(json.dumps({"agentId": "test-agent"}))
            args = [sys.executable, "-I", str(ROOT / "scripts/owned_gateway.py"), str(source.parent), str(profile), "test-epoch", "test-agent"]
            parent = subprocess.Popen([sys.executable, "-c", "import subprocess,sys,time; subprocess.Popen(sys.argv[1:]); time.sleep(60)", *args], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
            try:
                self.assertTrue(select.select([parent.stdout], [], [], 5)[0], "child did not start")
                self.assertEqual(parent.stdout.readline().strip(), "READY")
                with (profile / ".blueoffice-lease").open() as lease:
                    with self.assertRaises(BlockingIOError):
                        fcntl.flock(lease, fcntl.LOCK_EX | fcntl.LOCK_NB)
                    parent.kill()
                    parent.wait(timeout=5)
                    deadline = time.monotonic() + 5
                    while True:
                        try:
                            fcntl.flock(lease, fcntl.LOCK_EX | fcntl.LOCK_NB)
                            break
                        except BlockingIOError:
                            if time.monotonic() > deadline:
                                self.fail("orphaned child retained the lease after supervisor death")
                            time.sleep(.02)
                self.assertEqual(parent.stdout.read(), "")
            finally:
                if parent.poll() is None:
                    parent.kill()
                    parent.wait(timeout=5)
                parent.stdout.close()
                parent.stderr.close()

    def test_server_wrapper_holds_lease_across_exec(self):
        with tempfile.TemporaryDirectory(prefix="blueoffice-server-lease-") as directory:
            env = dict(os.environ, BLUEOFFICE_DATA=directory, BLUEOFFICE_PORT="0")
            server = subprocess.Popen([sys.executable, "scripts/run_server.py", "--fixture"], cwd=ROOT, env=env, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
            try:
                self.assertTrue(select.select([server.stdout], [], [], 10)[0])
                self.assertIn("http://127.0.0.1:", server.stdout.readline())
                duplicate = subprocess.run([sys.executable, "scripts/run_server.py", "--fixture"], cwd=ROOT, env=env, capture_output=True, text=True, timeout=5)
                self.assertNotEqual(duplicate.returncode, 0)
                self.assertIn("Another BlueOffice server owns", duplicate.stderr)
                server.send_signal(signal.SIGTERM)
                server.wait(timeout=10)
                with (Path(directory) / "server.lease").open() as lease:
                    fcntl.flock(lease, fcntl.LOCK_EX | fcntl.LOCK_NB)
            finally:
                if server.poll() is None:
                    server.kill()
                    server.wait(timeout=5)
                server.stdout.close()
                server.stderr.close()
