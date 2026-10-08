import json
from pathlib import Path
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from probe_rpc import Gateway
from save_probe_evidence import sanitize


FIXTURES = Path(__file__).resolve().parents[1] / "fixtures/hermes"


class EvidenceTests(unittest.TestCase):
    def test_published_frames_replay_without_losing_requests(self):
        files = list(FIXTURES.glob("*/trace.jsonl"))
        self.assertTrue(files, "Run the isolated harness and save its evidence first")
        for fixture in files:
            rows = [json.loads(line) for line in fixture.read_text().splitlines()]
            frames = [r["frame"] for r in rows if r["direction"] == "receive"]
            # A real pipe, reordered events, and duplicate request replays emulate reconnect.
            server_requests = [f for f in frames if f.get("method") in ("clarify", "approval")]
            stream = list(reversed(frames)) + server_requests
            with tempfile.NamedTemporaryFile(mode="w", suffix=".json") as data:
                json.dump(stream, data)
                data.flush()
                peer = Gateway([sys.executable, "-u", "-c",
                    "import json,sys; [print(json.dumps(f),flush=True) for f in json.load(open(sys.argv[1]))]; sys.stdin.read()",
                    data.name], {}, tempfile.gettempdir(), "fixture", [])
                try:
                    for expected in server_requests:
                        self.assertEqual(peer.wait(lambda f: f.get("id") == expected["id"] and f.get("method") == expected["method"]), expected)
                    for expected in server_requests:
                        self.assertEqual(peer.wait(lambda f: f.get("id") == expected["id"] and f.get("method") == expected["method"]), expected)
                finally:
                    peer.stop()

    def test_nested_credentials_and_machine_paths_are_removed(self):
        self.assertEqual(sanitize({"nested": [{"api_key": "secret", "path": "/private/home/source/x.py"}]},
                                  [("/private/home/source", "$SOURCE")]),
                         {"nested": [{"api_key": "[REDACTED]", "path": "$SOURCE/x.py"}]})


if __name__ == "__main__":
    unittest.main()
