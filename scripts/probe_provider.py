"""Deterministic local Chat Completions provider. No model, credentials, or external network."""
import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import threading


class MockProvider:
    def __init__(self, port=0):
        self.calls = []
        owner = self

        class Handler(BaseHTTPRequestHandler):
            def log_message(self, *args):
                pass

            def do_GET(self):
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(b'{"object":"list","data":[{"id":"blueoffice-mock","object":"model"}]}')

            def do_POST(self):
                body = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
                messages = body.get("messages", [])
                owner.calls.append({"path": self.path, "model": body.get("model"),
                                    "stream": body.get("stream", False),
                                    "roles": [m["role"] for m in messages]})
                if self.path != "/v1/chat/completions":
                    self.send_error(404)
                    return
                user = next((m.get("content", "") for m in reversed(messages) if m["role"] == "user"), "")
                last_user = max((i for i, m in enumerate(messages) if m["role"] == "user"), default=-1)
                has_tool = any(m["role"] == "tool" for m in messages[last_user + 1:])
                tool = None
                if not has_tool and isinstance(user, str):
                    if "PROBE_SINGLE" in user or "PROBE_CANCEL" in user or "PROBE_EXPIRE" in user:
                        tool = ("clarify", {"question": "Choose a synthetic desk", "choices": ["Oak", "Birch"]})
                    elif "PROBE_BATCH" in user:
                        tool = ("clarify", {"questions": [{"question": "Desk?", "choices": ["Oak", "Birch"]},
                                                           {"question": "Lamp?", "choices": ["Blue", "White"], "multi_select": "MULTI" in user}]})
                    elif "PROBE_APPROVAL" in user:
                        # The path is in the disposable namespace. The harness always denies.
                        tool = ("terminal", {"command": "rm -rf /tmp/blueoffice-approval-sentinel"})
                message = {"role": "assistant", "content": "Synthetic turn complete."}
                finish = "stop"
                if tool:
                    message = {"role": "assistant", "content": None, "tool_calls": [
                        {"id": f"call-probe-{len(owner.calls)}", "type": "function", "function":
                         {"name": tool[0], "arguments": json.dumps(tool[1])}}]}
                    finish = "tool_calls"
                try:
                    self.send_response(200)
                    if body.get("stream"):
                        self.send_header("Content-Type", "text/event-stream")
                        self.end_headers()
                        delta = dict(message)
                        if tool:
                            delta["tool_calls"] = [{"index": 0, **message["tool_calls"][0]}]
                        for data, reason in [(delta, None), ({}, finish)]:
                            chunk = {"id": "chatcmpl-probe", "object": "chat.completion.chunk", "created": 1,
                                     "model": "blueoffice-mock", "choices": [{"index": 0, "delta": data, "finish_reason": reason}]}
                            self.wfile.write(("data: " + json.dumps(chunk) + "\n\n").encode())
                            self.wfile.flush()
                        self.wfile.write(b"data: [DONE]\n\n")
                    else:
                        self.send_header("Content-Type", "application/json")
                        self.end_headers()
                        self.wfile.write(json.dumps({"id": "chatcmpl-probe", "object": "chat.completion", "created": 1,
                            "model": "blueoffice-mock", "choices": [{"index": 0, "message": message, "finish_reason": finish}],
                            "usage": {"prompt_tokens": 10, "completion_tokens": 4, "total_tokens": 14}}).encode())
                except (BrokenPipeError, ConnectionResetError):
                    pass

        self.server = ThreadingHTTPServer(("127.0.0.1", port), Handler)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)

    def __enter__(self):
        self.thread.start()
        return self

    @property
    def url(self):
        return f"http://127.0.0.1:{self.server.server_port}/v1"

    def __exit__(self, *args):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=2)
