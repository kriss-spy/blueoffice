"""Exact, read-only owned resume preflight; private route data never crosses stdout."""
import contextlib
import io
import json
import os
from pathlib import Path
import sqlite3
import sys
sys.path.insert(0, str(Path(__file__).resolve().parent))


class ResumeError(Exception):
    pass


def plan(home, stored_id, model, agent_id, source):
    from profile_settings import revision, validate_resume_policy
    if json.loads((home / ".blueoffice-agent.json").read_text()).get("agentId") != agent_id:
        raise ResumeError("Profile ownership does not match this assistant.")
    before = revision(home)
    if source == "fixture":
        validate_resume_policy(json.loads((home / "config.yaml").read_text()))
        return {"requestedStoredSessionId": stored_id, "resolvedStoredSessionId": stored_id,
                "source": "blueoffice", "profileName": "fixture-" + home.name, "profileRevision": before}
    import hermes_bootstrap
    from hermes_cli.config import load_config
    validate_resume_policy(load_config())
    from hermes_state import SessionDB
    from tui_gateway import server
    path = home / "state.db"
    if path.is_symlink() or not path.is_file():
        raise ResumeError("Stored history is unavailable for resume.")
    with sqlite3.connect(path.as_uri() + "?mode=ro", uri=True) as conn:
        if conn.execute("SELECT version FROM schema_version").fetchone()[0] != 30:
            raise ResumeError("Stored history schema has not been verified for resume.")
    db = SessionDB(path, read_only=True)
    try:
        owner = home.name if home.parent.name == "profiles" else "default"
        row = db.get_session(stored_id)
        if not row or row.get("profile_name") not in (None, owner):
            raise ResumeError("The exact stored history does not belong to this profile.")
        resolved = (db.get_compression_tip(stored_id) if (row.get("title") or "").strip() == "Bot Chat"
                    else db.resolve_resume_session_id(stored_id)) or stored_id
        tip = db.get_session(resolved)
        if not tip or tip.get("profile_name") not in (None, owner):
            raise ResumeError("The resolved stored history does not belong to this profile.")
        mode = "codex_responses" if model == "muse-spark-1.3-contributor" else "chat_completions"
        provider = "custom:blueoffice-muse" if mode == "codex_responses" else "custom:blueoffice-glm"
        for candidate in (row, tip):
            # Native healing is not route admission. Inspect original route intent,
            # then compare the actual native restored overrides against managed policy.
            raw = candidate.get("model_config")
            cfg = json.loads(raw) if isinstance(raw, str) and raw else raw or {}
            if not isinstance(cfg, dict):
                raise ResumeError("Stored route metadata is malformed.")
            if any(cfg.get(k) for k in ("api_key", "key_env", "api_key_env", "key_cmd", "extra_headers", "extra_body", "request_overrides")):
                raise ResumeError("Stored route contains unsupported credential or request overrides.")
            overrides = server._stored_session_runtime_overrides(candidate)
            restored = overrides.get("model_override", {})
            if (restored.get("model") not in (None, "", model)
                    or restored.get("provider") not in (None, "", provider)
                    or restored.get("base_url") not in (None, "", "http://127.0.0.1:8317/v1")
                    or restored.get("api_mode") not in (None, "", mode)
                    or overrides.get("provider_override") not in (None, "", provider)
                    or overrides.get("reasoning_config_override") or "service_tier_override" in overrides):
                raise ResumeError("Stored conversation route differs from the current managed route. Reconfigure this stopped assistant to the stored route before resuming; unsupported overrides must be reviewed in Hermes.")
            # Reject stale/healed identities even where Hermes would discard them.
            if cfg.get("provider") not in (None, "", provider) or cfg.get("base_url") not in (None, "", "http://127.0.0.1:8317/v1") or cfg.get("api_mode") not in (None, "", mode):
                raise ResumeError("Stored route overrides have not passed managed route admission.")
        if before != revision(home):
            raise ResumeError("Profile changed during resume preflight. Reload before retrying.")
        return {"requestedStoredSessionId": stored_id, "resolvedStoredSessionId": resolved,
                "source": row.get("source") or "unknown", "profileName": owner, "profileRevision": before}
    finally:
        db.close()


def main():
    source, root, revision_id = sys.argv[1:4]
    if source != "fixture" and revision_id != "f1247d2e0146bbd8edd4e510b9e67e0d259509a4":
        raise ResumeError("Hermes resume revision is unsupported.")
    request = json.load(sys.stdin)
    root = Path(root).resolve(strict=True)
    home = Path(request["profileHome"]).resolve(strict=True)
    if home != root and home.parent != root / "profiles":
        raise ResumeError("Resume profile is outside the trusted profile root.")
    os.environ["HERMES_HOME"] = str(home)
    sys.path.insert(0, source)
    with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
        return plan(home, request["storedSessionId"], request["model"], request["agentId"], source)


if __name__ == "__main__":
    try:
        print(json.dumps(main()))
    except Exception as exc:
        # Only our fixed policy messages are public; native exception text can
        # contain endpoints, credentials or filesystem details.
        message = str(exc) if isinstance(exc, ResumeError) else "Native resume preflight could not be verified. Inspect the stored history and profile in Hermes."
        print(json.dumps({"error": message}))
        sys.exit(1)
