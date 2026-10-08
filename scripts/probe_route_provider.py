"""Both API families plus deterministic failures for installed-Hermes route tests."""
import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import threading


class RouteProvider:
    def __init__(self):
        self.calls = []
        owner = self
        class Handler(BaseHTTPRequestHandler):
            def log_message(self, *args):
                pass
            def do_GET(self):
                self.send_response(200); self.end_headers(); self.wfile.write(b'{"data":[]}')
            def do_POST(self):
                data = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
                if self.path not in ("/v1/chat/completions", "/v1/responses"):
                    self.send_error(404); return
                owner.calls.append({"path": self.path, "model": data.get("model"), "stream": data.get("stream", False)})
                inputs = data.get("messages", data.get("input", []))
                last_user = max((i for i, m in enumerate(inputs) if m.get("role") == "user"), default=-1)
                user = json.dumps(inputs[last_user]) if last_user >= 0 else ""
                has_tool = any(m.get("role") == "tool" or m.get("type") == "function_call_output" for m in inputs[last_user + 1:])
                failure = next((name for name in ("QUOTA", "AUTH", "ROUTE", "UNAVAILABLE") if "FAIL_" + name in user), None)
                if failure:
                    status, code = {"QUOTA": (429, "usage_limit_reached"), "AUTH": (401, "invalid_api_key"), "ROUTE": (404, "model_not_found"), "UNAVAILABLE": (503, "service_unavailable")}[failure]
                    self.send_response(status); self.send_header("Content-Type", "application/json"); self.end_headers()
                    self.wfile.write(json.dumps({"error": {"code": code, "message": code + " PRIVATE_PROVIDER_CANARY"}}).encode()); return
                tool = "ROUTE_TOOL" in user and not has_tool
                arguments = json.dumps({"question": "Choose the probe answer", "choices": ["Oak", "Birch"]})
                answer = "ROUTE_OK"
                self.send_response(200)
                self.send_header("Content-Type", "text/event-stream" if data.get("stream") else "application/json")
                self.end_headers()
                def event(payload):
                    self.wfile.write(("data: " + json.dumps(payload) + "\n\n").encode()); self.wfile.flush()
                try:
                    if self.path.endswith("chat/completions"):
                        message = {"role": "assistant", "content": answer}
                        if tool: message = {"role": "assistant", "content": None, "tool_calls": [{"id": "call-route", "type": "function", "function": {"name": "clarify", "arguments": arguments}}]}
                        reason = "tool_calls" if tool else "stop"
                        base = {"id": "chatcmpl-route", "created": 1, "model": data["model"]}
                        if data.get("stream"):
                            delta = dict(message)
                            if tool: delta["tool_calls"] = [{"index": 0, **message["tool_calls"][0]}]
                            for content, stop in [(delta, None), ({}, reason)]: event({**base, "object": "chat.completion.chunk", "choices": [{"index": 0, "delta": content, "finish_reason": stop}]})
                            self.wfile.write(b'data: [DONE]\n\n')
                        else: self.wfile.write(json.dumps({**base, "object": "chat.completion", "choices": [{"index": 0, "message": message, "finish_reason": reason}], "usage": {"prompt_tokens": 2, "completion_tokens": 2, "total_tokens": 4}}).encode())
                    else:
                        item = {"id": "fc_route", "type": "function_call", "call_id": "call-route", "name": "clarify", "arguments": arguments, "status": "completed"} if tool else {"id": "msg_route", "type": "message", "role": "assistant", "status": "completed", "content": [{"type": "output_text", "text": answer, "annotations": []}]}
                        response = {"id": "resp_route", "object": "response", "created_at": 1, "status": "completed", "model": data["model"], "output": [item], "usage": {"input_tokens": 2, "output_tokens": 2, "total_tokens": 4}}
                        if data.get("stream"):
                            event({"type": "response.created", "response": {**response, "status": "in_progress", "output": []}})
                            event({"type": "response.output_item.added", "output_index": 0, "item": {**item, "arguments": ""} if tool else {**item, "content": []}})
                            event({"type": "response.function_call_arguments.delta" if tool else "response.output_text.delta", "item_id": item["id"], "output_index": 0, "content_index": 0, "delta": arguments if tool else answer})
                            event({"type": "response.output_item.done", "output_index": 0, "item": item})
                            event({"type": "response.completed", "response": response})
                        else: self.wfile.write(json.dumps(response).encode())
                except (BrokenPipeError, ConnectionResetError): pass
        self.server = ThreadingHTTPServer(("127.0.0.1", 8317), Handler)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
    def __enter__(self): self.thread.start(); return self
    def __exit__(self, *args): self.server.shutdown(); self.server.server_close(); self.thread.join(timeout=2)
