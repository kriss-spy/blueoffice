"""Bounded stdio RPC client for synthetic protocol probes (not the production adapter)."""
import json
import queue
import subprocess
import threading
import time


class RpcError(RuntimeError):
    pass


class Gateway:
    def __init__(self, command, env, cwd, label, trace):
        self.label, self.trace = label, trace
        self.process = subprocess.Popen(command, env=env, cwd=cwd, text=True,
                                        stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                                        stderr=subprocess.PIPE, bufsize=1, start_new_session=True)
        self.incoming = queue.Queue()
        self.saved = []
        self.diagnostics = []
        self.counter = 0
        self.readers = [threading.Thread(target=self._read, daemon=True),
                        threading.Thread(target=self._stderr, daemon=True)]
        for reader in self.readers:
            reader.start()

    def _read(self):
        for line in self.process.stdout:
            try:
                frame = json.loads(line)
                if not isinstance(frame, dict) or frame.get("jsonrpc") != "2.0":
                    raise ValueError("invalid JSON-RPC envelope")
                self.trace.append({"owner": self.label, "direction": "receive", "frame": frame})
                self.incoming.put(frame)
            except (ValueError, TypeError) as exc:
                self.incoming.put(RpcError(str(exc)))
        self.incoming.put(RpcError("gateway stdout closed"))

    def _stderr(self):
        for line in self.process.stderr:
            self.diagnostics.append(line.rstrip())

    def send(self, frame):
        self.trace.append({"owner": self.label, "direction": "send", "frame": frame})
        self.raw(json.dumps(frame))

    def raw(self, line):
        self.process.stdin.write(line + "\n")
        self.process.stdin.flush()

    def wait(self, predicate, timeout=40):
        deadline = time.monotonic() + timeout
        def timed_out():
            return TimeoutError(f"{self.label}: RPC wait timed out; stderr: {self.diagnostics[-8:]}")
        for index, frame in enumerate(self.saved):
            if time.monotonic() >= deadline:
                raise timed_out()
            if predicate(frame):
                return self.saved.pop(index)
        while True:
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                raise timed_out()
            try:
                frame = self.incoming.get(timeout=remaining)
            except queue.Empty:
                raise timed_out() from None
            if isinstance(frame, Exception):
                raise frame
            if predicate(frame):
                return frame
            self.saved.append(frame)

    def request(self, method, params=None, allow_error=False):
        self.counter += 1
        rid = self.counter
        self.send({"jsonrpc": "2.0", "id": rid, "method": method, "params": params or {}})
        frame = self.wait(lambda f: f.get("id") == rid and "method" not in f)
        if "error" in frame:
            if allow_error:
                return frame
            raise RpcError(f"{method}: {frame['error']}")
        return frame["result"]

    def event(self, kind, sid=None, timeout=40):
        return self.wait(lambda f: f.get("method") == "event" and
                         f.get("params", {}).get("type") == kind and
                         (sid is None or f["params"].get("session_id") == sid), timeout)

    def answer(self, frame, result):
        self.send({"jsonrpc": "2.0", "id": frame["id"], "result": result})

    def stop(self, timeout=8):
        """Signal only the Popen child; report forced exit honestly."""
        forced = False
        if self.process.poll() is None:
            self.process.terminate()
            try:
                self.process.wait(timeout=timeout)
            except subprocess.TimeoutExpired:
                forced = True
                self.process.kill()
                self.process.wait(timeout=5)
        for reader in self.readers:
            reader.join(timeout=2)
        for stream in (self.process.stdin, self.process.stdout, self.process.stderr):
            stream.close()
        return {"returncode": self.process.returncode, "forced": forced}
