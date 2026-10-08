"""Adversarial checks at the installed Hermes request-registry boundary.

These are module-level probes, separate from the real RPC/provider round trips.
Only sinks are replaced; request settlement and validation use installed source.
"""
import json
import threading


def check_requests():
    from tui_gateway import server_requests as requests
    from tui_gateway.contracts import registry

    frames, events, outcomes = [], [], []
    requests.bind_sinks(frames.append, lambda *args: events.append(args), lambda sid: False)
    assert requests.send("clarify", "capability-test", {"question": "Unavailable?"}, timeout=0) is None
    assert not frames and requests.open_request_count() == 0
    requests.bind_sinks(frames.append, lambda *args: events.append(args), lambda sid: True)
    params = {"request_id": "inner-approval", "command": "synthetic", "choices": ["deny", "once"]}
    settle = requests.send_async("approval", "session-a", params, outcomes.append)
    frame = frames[-1]
    assert not requests.resolve_response({"jsonrpc": "2.0", "id": "foreign", "result": {"choice": "once"}})
    assert requests.open_requests("session-b") == []
    assert requests.resolve_response({"jsonrpc": "2.0", "id": frame["id"], "result": {"choice": "deny"}})
    assert not requests.resolve_response({"jsonrpc": "2.0", "id": frame["id"], "result": {"choice": "once"}})
    settle("timeout")
    assert outcomes == [{"choice": "deny"}] and not events

    # Out-of-order independent requests resolve by ID, never arrival position.
    requests.send_async("approval", "session-a", params, lambda r: outcomes.append(("a", r)))
    first = frames[-1]
    requests.send_async("approval", "session-b", params, lambda r: outcomes.append(("b", r)))
    second = frames[-1]
    requests.resolve_response({"id": second["id"], "result": {"choice": "deny"}})
    assert requests.open_requests("session-a")[0]["id"] == first["id"]
    assert requests.cancel("session-a") == 1
    assert outcomes[-2:] == [("b", {"choice": "deny"}), ("a", None)]
    assert events[-1][2]["id"] == first["id"]
    assert requests.open_request_count() == 0

    # Timeout returns only previously locked batch answers.
    ready = threading.Event()
    requests.bind_sinks(lambda f: (frames.append(f), ready.set()), lambda *args: events.append(args), lambda sid: True)
    batch_result = []
    worker = threading.Thread(target=lambda: batch_result.append(requests.send(
        "clarify", "session-a", {"questions": [{"qid": "q0", "question": "Desk?"},
                                                    {"qid": "q1", "question": "Lamp?"}]},
        timeout=0.25, qids=["q0", "q1"])))
    worker.start()
    assert ready.wait(2)
    requests.lock_answer(frames[-1]["id"], "q0", "Oak")
    worker.join(2)
    assert not worker.is_alive() and batch_result == [{"answers": {"q0": "Oak"}, "timed_out": True}]
    assert events[-1][2]["reason"] == "timeout"
    return {"checks": ["missing request capability fails fast", "duplicate and foreign responses are ignored",
                       "out-of-order IDs remain independent", "session-scoped cancellation",
                       "batch expiry preserves only locked answers"],
            "source_declared_methods": sorted(registry.METHODS),
            "source_declared_requests": sorted(registry.SERVER_REQUESTS),
            "source_declared_events": sorted(registry.EVENTS)}


if __name__ == "__main__":
    print(json.dumps(check_requests()))
