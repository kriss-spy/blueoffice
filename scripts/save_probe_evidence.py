#!/usr/bin/env python3
"""Publish compact synthetic fixtures only from a successful isolated probe."""
import argparse
import json
from pathlib import Path


def sanitize(value, replacements):
    if isinstance(value, str):
        for raw, label in replacements:
            value = value.replace(raw, label)
        return value
    if isinstance(value, list):
        return [sanitize(item, replacements) for item in value]
    if isinstance(value, dict):
        return {key: ("[REDACTED]" if key.lower() in ("api_key", "access_token", "refresh_token", "authorization", "system_prompt", "reasoning")
                      else sanitize(item, replacements)) for key, item in value.items()}
    return value


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, default=Path("artifacts/hermes-contract"))
    parser.add_argument("--output", type=Path, default=Path("fixtures/hermes"))
    args = parser.parse_args()
    report = json.loads((args.input / "report.json").read_text())
    if report.get("passed") is not True or report.get("runner_completed") is not True or not report.get("module_probe"):
        raise RuntimeError("Only a complete passing probe can replace published evidence")
    installation = report["installation"]
    replacements = sorted([(value, f"${key.upper()}") for key, value in installation.items() if key != "revision"],
                          key=lambda pair: -len(pair[0]))
    replacements.append(("synthetic-not-a-secret", "[SYNTHETIC_KEY]"))
    trace = json.loads((args.input / "trace.json").read_text())
    selected, requests = [], {}
    events = {"gateway.ready", "message.delta", "message.complete", "tool.complete", "request.cancel"}
    # Keep request/result correlation, exact replay and history-resume examples.
    # Full config and repeated activate snapshots contain large default config/transcripts.
    omitted_methods = {"session.activate", "config.get", "profiles.list", "session.list"}
    for row in trace:
        frame = row["frame"]
        method = frame.get("method")
        key = (row["owner"], frame.get("id"))
        if row["direction"] == "send" and method:
            requests[key] = method
        include = (method not in omitted_methods if method and method != "event" else
                   frame.get("params", {}).get("type") in events if method == "event" else
                   requests.get(key) not in omitted_methods)
        if include:
            selected.append(sanitize(row, replacements))
    # These assertions are structural publication checks; runtime assertions live in the probe.
    assert any(r["frame"].get("method") == "approval" for r in selected)
    assert any(r["frame"].get("method") == "clarify" for r in selected)
    destination = args.output / installation["revision"][:12]
    destination.mkdir(parents=True, exist_ok=True)
    (destination / "trace.jsonl").write_text("".join(json.dumps(r, ensure_ascii=False) + "\n" for r in selected))
    (destination / "report.json").write_text(json.dumps(sanitize(report, replacements), indent=2) + "\n")
    print(f"Saved {len(selected)} synthetic protocol frames and compatibility report to {destination}")


if __name__ == "__main__":
    main()
