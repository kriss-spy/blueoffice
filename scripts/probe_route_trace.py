"""Test-only HTTPX observation: no bodies, headers, credentials, or response text are recorded."""
import json
import os
from pathlib import Path
import threading
import httpx


def install():
    trace = Path(os.environ["BLUEOFFICE_ROUTE_TRACE"])
    expected_model = os.environ["BLUEOFFICE_EXPECT_MODEL"]
    expected_path = "/v1/responses" if expected_model.startswith("muse-") else "/v1/chat/completions"
    original = httpx.Client.send
    lock = threading.Lock()

    def send(client, request, **kwargs):
        if request.url.host != "127.0.0.1" or request.url.port != 8317:
            raise httpx.ConnectError("Probe blocked a non-proxy endpoint", request=request)
        record = None
        if request.method == "POST" and request.url.path.startswith("/v1/"):
            data = json.loads(request.content)
            if request.url.path != expected_path or data.get("model") != expected_model:
                raise httpx.ConnectError("Probe blocked an unexpected model or API family", request=request)
            inputs = data.get("messages", data.get("input", []))
            record = {"path": request.url.path, "model": data.get("model"), "stream": data.get("stream", False),
                      "input_types": [i.get("type", i.get("role", "")) for i in inputs if isinstance(i, dict)],
                      "tool_count": len(data.get("tools", []))}
        try:
            response = original(client, request, **kwargs)
            if record is not None:
                record["status"] = response.status_code
            return response
        except Exception:
            if record is not None:
                record["status"] = "connection_error"
            raise
        finally:
            if record is not None:
                with lock, trace.open("a") as output:
                    output.write(json.dumps(record) + "\n")
    httpx.Client.send = send
