"""Exercise the harness transport against independent subprocess peers."""
import os
from pathlib import Path
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from probe_rpc import Gateway, RpcError


class ProbeTransportTests(unittest.TestCase):
    def peer(self, script):
        gateway = Gateway([sys.executable, "-u", "-c", script],
                          {"PATH": os.defpath}, tempfile.gettempdir(), "test", [])
        self.addCleanup(gateway.stop)
        return gateway

    def test_unrelated_response_and_question_survive_wait_for_exact_response(self):
        gateway = self.peer('''
import json,sys
request=json.loads(sys.stdin.readline())
for frame in [
    {"id":999,"result":{"sentinel":"out-of-order"}},
    {"id":"srq-1","method":"clarify","params":{"session_id":"one","question":"Desk?"}},
    {"id":request["id"],"result":{"ok":True}}]:
    print(json.dumps({"jsonrpc":"2.0",**frame}),flush=True)
sys.stdin.read()
''')
        self.assertEqual(gateway.request("session.create"), {"ok": True})
        self.assertEqual(gateway.wait(lambda f: f.get("id") == 999)["result"]["sentinel"], "out-of-order")
        self.assertEqual(gateway.wait(lambda f: f.get("method") == "clarify")["id"], "srq-1")

    def test_malformed_and_non_rpc_output_fail_visibly(self):
        for output in ("bad json", "[]", '{"noise":true}'):
            with self.subTest(output=output):
                gateway = self.peer(f"print({output!r},flush=True)")
                with self.assertRaises(RpcError):
                    gateway.wait(lambda f: True)

    def test_stdout_eof_is_not_a_success_event(self):
        gateway = self.peer("pass")
        with self.assertRaisesRegex(RpcError, "stdout closed"):
            gateway.event("message.complete")

    def test_ignored_shutdown_requires_reported_force(self):
        gateway = self.peer('''
import signal,json,sys
signal.signal(signal.SIGTERM,signal.SIG_IGN)
print(json.dumps({"jsonrpc":"2.0","method":"ready"}),flush=True)
sys.stdin.read()
''')
        gateway.wait(lambda f: f.get("method") == "ready")
        result = gateway.stop(timeout=0.05)
        self.assertTrue(result["forced"])
        self.assertLess(result["returncode"], 0)
        self.assertIsNotNone(gateway.process.poll())


if __name__ == "__main__":
    unittest.main()
