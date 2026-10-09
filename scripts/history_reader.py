"""Versioned, read-only Hermes history boundary. No gateway or provider is launched.

Only trusted server discovery supplies profile paths. The native display projection
is reduced to public conversation and compact tool labels; raw payloads, system
prompts, reasoning and display metadata never cross stdout.
"""
import contextlib
import io
import json
import math
import os
from pathlib import Path
import re
import sqlite3
import sys
from datetime import datetime, timezone

REVISION = "f1247d2e0146bbd8edd4e510b9e67e0d259509a4"
SCHEMA = 30
LIMIT = 500
CAPABILITY = {"reader": "hermes-f1247d2e-schema30-readonly-v1", "textSearch": "public-loaded", "lineage": True, "resume": False, "resumeReason": "Resume has not yet been verified for this history source."}


def safe(value, limit=32000):
    text = value[:limit] if isinstance(value, str) else ""
    text = re.sub(r"(?i)\b(?:bearer\s+)[A-Za-z0-9._~+/-]+", "Bearer [redacted]", text)
    text = re.sub(r"(?i)\b(api[_-]?key|token|password|secret|authorization)\s*[:=]\s*[^\s,;]+", r"\1=[redacted]", text)
    return re.sub(r"\bsk-[A-Za-z0-9_-]{8,}\b", "[redacted]", text)


def timestamp(value):
    if isinstance(value, (int, float)) and math.isfinite(value) and value > 0:
        try:
            return datetime.fromtimestamp(value, timezone.utc).isoformat().replace("+00:00", "Z")
        except (ValueError, OverflowError, OSError):
            pass
    return None


def number(value):
    return value if isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value) and value >= 0 else None


def delegate_parent(row):
    if row.get("source") != "subagent":
        return None
    try:
        raw = row.get("model_config")
        config = json.loads(raw) if isinstance(raw, str) and raw else raw or {}
        parent = config.get("_delegate_from") if isinstance(config, dict) else None
        if isinstance(parent, str) and 0 < len(parent) <= 300 and parent == row.get("parent_session_id") and parent != row.get("id"):
            return parent
    except (ValueError, TypeError):
        pass
    return None


def record(row):
    actual, estimated = number(row.get("actual_cost_usd")), number(row.get("estimated_cost_usd"))
    # Native usage updates coalesce an absent estimate to zero. Only typed,
    # sourced cost evidence establishes a measurement; numeric presence does not.
    status, source = row.get("cost_status"), row.get("cost_source")
    sourced = isinstance(source, str) and source not in ("", "none", "unknown")
    cost, kind = None, None
    if status == "actual" and sourced and actual is not None:
        cost, kind = actual, "actual"
    elif status == "estimated" and sourced and estimated is not None:
        cost, kind = estimated, "estimated"
    elif status == "included" and source == "none" and estimated == 0:
        cost, kind = 0, "included"
    # Schema defaults are not measurements; calls must establish usage exists.
    measured = number(row.get("api_call_count")) not in (None, 0)
    return {"storedSessionId": row["id"], "title": safe(row.get("title"), 300), "source": safe(row.get("source"), 100) or "unknown", "startedAt": timestamp(row.get("started_at")), "lastActivityAt": timestamp(row.get("last_activity_at")) or timestamp(row.get("started_at")), "endedAt": timestamp(row.get("ended_at")), "endReason": safe(row.get("end_reason"), 100) or None, "parentStoredSessionId": delegate_parent(row), "lineageEvidence": "native-delegate-marker" if delegate_parent(row) else None,
            "metrics": {"inputTokens": number(row.get("input_tokens")) if measured else None, "outputTokens": number(row.get("output_tokens")) if measured else None, "calls": number(row.get("api_call_count")) if measured else None, "costUsd": cost, "costKind": kind}}


def profiles(root, source):
    if source == "fixture":
        names = [p.name for p in sorted((root / "profiles").glob("*")) if p.is_dir() and not p.is_symlink()]
        return [{"id": name, "name": "fixture-" + name, "home": str(root / "profiles" / name)} for name in names]
    from hermes_cli.profiles import list_profile_names, get_profile_dir
    result = []
    for name in list_profile_names():
        home = get_profile_dir(name)
        canonical = home.resolve(strict=True)
        if home.is_symlink() or (canonical != root and canonical.parent != root / "profiles"):
            continue
        result.append({"id": name, "name": name, "home": str(canonical)})
    return result


def read(home, stored_id, source):
    if source == "fixture":
        path = home / ".history-fixture.json"
        data = json.loads(path.read_text()) if path.exists() else {"records": []}
        rows = data.get("records", [])
        if stored_id:
            rows = [row for row in rows if row["storedSessionId"] == stored_id]
        result = {"records": rows, "truncated": False, "capability": {**CAPABILITY, "reader": "synthetic-history-v1"}}
        if stored_id:
            result.update(messages=data.get("messages", {}).get(stored_id, []), tools=data.get("tools", {}).get(stored_id, []))
        return result
    path = home / "state.db"
    if not path.exists():
        return {"records": [], "truncated": False, "capability": CAPABILITY}
    if path.is_symlink() or not path.is_file():
        raise ValueError("History database is not a regular file")
    conn = sqlite3.connect(path.as_uri() + "?mode=ro", uri=True, timeout=2)
    conn.row_factory = sqlite3.Row
    try:
        conn.execute("PRAGMA query_only=ON")
        version = conn.execute("SELECT version FROM schema_version").fetchone()
        if not version or version[0] != SCHEMA:
            raise ValueError("History schema is unsupported; run the compatibility probe")
        # Never use title/prefix/resume-chain resolution: inspection addresses the exact stored id.
        sql = "SELECT id,title,source,started_at,last_activity_at,ended_at,end_reason,input_tokens,output_tokens,api_call_count,actual_cost_usd,estimated_cost_usd,cost_status,cost_source,parent_session_id,model_config FROM sessions"
        owner = home.name if home.parent.name == "profiles" else "default"
        params = (owner, stored_id, LIMIT + 1) if stored_id else (owner, LIMIT + 1)
        rows = conn.execute(sql + " WHERE (profile_name IS NULL OR profile_name=?)" + (" AND id=?" if stored_id else "") + " ORDER BY COALESCE(last_activity_at,started_at) DESC LIMIT ?", params).fetchall()
        result = {"records": [record(dict(row)) for row in rows[:LIMIT]], "truncated": len(rows) > LIMIT, "capability": CAPABILITY}
        if not stored_id or not rows:
            return result
    finally:
        conn.close()
    from hermes_state import SessionDB
    # Hermes' split helper is normally rebound onto gateway globals. Bind only
    # its pure display dependencies; importing/starting the gateway is unnecessary.
    from types import SimpleNamespace
    from tui_gateway import session_history
    from agent.compaction_display import project_compaction_message_for_display
    from agent.skill_commands import describe_skill_invocation
    from agent.display import build_tool_preview
    display = SimpleNamespace(json=json, re=re,
        project_compaction_message_for_display=project_compaction_message_for_display,
        describe_skill_invocation=describe_skill_invocation,
        _tool_ctx=lambda name, args: build_tool_preview(name, args, max_len=80) or "")
    session_history.register(display)
    db = SessionDB(path, read_only=True)
    try:
        rows = db.get_messages(stored_id, include_compacted=True, limit=LIMIT + 1, latest=True)
        # Native projection expects _row_id for public durable row identity.
        for row in rows:
            row["_row_id"] = row.get("id")
        public = display._history_to_messages(rows[-LIMIT:], profile_home=home)
        result["truncated"] = len(rows) > LIMIT
        result["messages"], result["tools"] = [], []
        for index, row in enumerate(public):
            role = row.get("role")
            if role in ("user", "assistant") and isinstance(row.get("text"), str):
                result["messages"].append({"id": str(row.get("row_id") or index), "role": role, "text": safe(row["text"]), "at": timestamp(row.get("timestamp"))})
            elif role == "tool":
                result["tools"].append({"id": str(row.get("tool_call_id") or index), "name": safe(row.get("name"), 100) or "tool", "context": safe(row.get("context"), 1000), "at": timestamp(row.get("timestamp")), "outcome": "unknown"})
        return result
    finally:
        db.close()


def main():
    source, root, revision = sys.argv[1:4]
    root = Path(root).resolve(strict=True)
    request = json.load(sys.stdin)
    if source != "fixture":
        if revision != REVISION:
            raise ValueError("Hermes revision is unsupported")
        sys.path.insert(0, source)
        os.environ["HERMES_HOME"] = str(root)
    allowed = profiles(root, source)
    if request.get("action") == "profiles":
        return allowed
    home = Path(request.get("profileHome", "")).resolve(strict=True)
    if not any(home == Path(p["home"]) for p in allowed):
        raise ValueError("History profile is not in trusted discovery")
    stored_id = request.get("storedSessionId")
    if stored_id is not None and (not isinstance(stored_id, str) or not stored_id or len(stored_id) > 300):
        raise ValueError("Stored history identifier is invalid")
    return read(home, stored_id, source)


if __name__ == "__main__":
    try:
        with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
            result = main()
        print(json.dumps(result))
    except Exception:
        print(json.dumps({"error": "History could not be read safely. Check the profile database and supported Hermes revision; no history was changed.", "status": 409}))
        sys.exit(1)
