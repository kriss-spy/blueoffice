import importlib.util
from pathlib import Path
import sqlite3
import tempfile
import unittest

spec = importlib.util.spec_from_file_location("history_reader", Path(__file__).resolve().parents[1] / "scripts/history_reader.py")
reader = importlib.util.module_from_spec(spec)
spec.loader.exec_module(reader)


class HistoryReaderTests(unittest.TestCase):
    def test_public_strings_redact_credential_shapes(self):
        text = reader.safe("notes TOKEN=private-value Authorization: Bearer hidden-value sk-privatekey12345")
        self.assertNotIn("private-value", text)
        self.assertNotIn("hidden-value", text)
        self.assertNotIn("sk-privatekey", text)
        self.assertIn("notes", text)

    def test_missing_database_does_not_create_one(self):
        with tempfile.TemporaryDirectory() as root:
            home = Path(root)
            result = reader.read(home, None, "native")
            self.assertEqual(result["records"], [])
            self.assertFalse((home / "state.db").exists())

    def test_wrong_schema_is_rejected_without_mutation(self):
        with tempfile.TemporaryDirectory() as root:
            home = Path(root)
            path = home / "state.db"
            conn = sqlite3.connect(path)
            conn.execute("CREATE TABLE schema_version(version INTEGER)")
            conn.execute("INSERT INTO schema_version VALUES (29)")
            conn.commit()
            conn.close()
            before = path.read_bytes()
            with self.assertRaisesRegex(ValueError, "schema is unsupported"):
                reader.read(home, None, "native")
            self.assertEqual(before, path.read_bytes())

    def test_metrics_defaults_are_unavailable_not_measurements(self):
        row = {"id": "session", "started_at": 1000, "input_tokens": 0, "output_tokens": 0, "api_call_count": 0}
        metrics = reader.record(row)["metrics"]
        self.assertEqual(metrics["inputTokens"], None)
        self.assertEqual(metrics["costUsd"], None)
        row.update(api_call_count=1, actual_cost_usd=0)
        self.assertEqual(reader.record(row)["metrics"]["costUsd"], 0)


if __name__ == "__main__":
    unittest.main()
