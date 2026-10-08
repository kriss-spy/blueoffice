"""Stopped-profile settings boundary. Stdout is a small, credential-free JSON projection.

The same kernel lease as owned_gateway protects every write. General Hermes setters
have no cross-process CAS; the revision check and single-writer adoption policy are
therefore owned by BlueOffice. No session DB, messaging credentials or proxy config
is written here. Native save_config supplies parsing/normalization/atomic publication.
"""
import contextlib
import copy
import fcntl
import hashlib
import io
import json
import os
import re
from pathlib import Path
import sys
import tempfile

MODELS = {"glm-5.3-flash", "muse-spark-1.3-contributor"}
TOOLS = {"terminal", "file", "clarify"}
REVISION_FILES = ("config.yaml", "SOUL.md", "profile.yaml", ".env", ".op.env", "auth.json", ".blueoffice-agent.json")
OVERRIDES = ("api_key", "base_url", "key_env", "api_key_env", "key_cmd", "extra_headers",
             "extra_body", "request_overrides", "fallback_chain", "fallback_providers")


class ProfileError(Exception):
    pass


def validate_approval_policy(home, config, fixture=False):
    if config.get("approvals", {}).get("mode", "manual") != "manual":
        return
    for name in (".env", ".op.env"):
        path = home / name
        if not path.exists():
            continue
        if fixture:
            defined = bool(re.search(r"(?m)^\s*(?:export\s+)?HERMES_YOLO_MODE\s*=", path.read_text(encoding="utf-8-sig")))
        else:
            from agent.secret_scope import load_env_file
            defined = "HERMES_YOLO_MODE" in load_env_file(path)
        if defined:
            raise ProfileError("Remove HERMES_YOLO_MODE from the profile environment before selecting manual approvals. The environment file has not been changed.")
    if any(isinstance(source, dict) and source.get("enabled") is True
           for source in (config.get("secrets") or {}).values()):
        raise ProfileError("Manual approvals cannot yet be verified with external environment sources. Disable that profile integration before adopting it.")


def atomic_write(path, data):
    if path.is_symlink():
        raise ProfileError("Managed settings files must not be symbolic links.")
    fd, temporary = tempfile.mkstemp(prefix=".blueoffice-settings-", dir=path.parent)
    try:
        with os.fdopen(fd, "wb") as stream:
            stream.write(data)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def revision(home):
    digest = hashlib.sha256()
    for name in REVISION_FILES:
        path = home / name
        if path.is_symlink():
            raise ProfileError("Managed settings files must not be symbolic links.")
        digest.update(name.encode() + b"\0")
        if path.exists():
            if not path.is_file() or path.stat().st_size > 2_000_000:
                raise ProfileError("A profile settings file is unreadable or too large.")
            digest.update(b"present\0" + path.read_bytes())
        else:
            digest.update(b"absent\0")
    return digest.hexdigest()


def owner(home):
    path = home / ".blueoffice-agent.json"
    if not path.exists():
        return None
    try:
        value = json.loads(path.read_text())["agentId"]
        if not isinstance(value, str) or not value:
            raise ValueError()
        return value
    except (ValueError, KeyError):
        raise ProfileError("Profile ownership metadata is invalid. Repair it before continuing.")


def live_owner(home, root, fixture=False):
    if fixture:
        return False  # The kernel lease still checks synthetic runtime ownership.
    import psutil
    from hermes_cli.profiles import _is_hermes_argv, _argv_profile_selectors, _live_default_multiplexer
    if _live_default_multiplexer():
        return True  # Its automatic profile discovery conflicts with exclusive ownership.
    for process in psutil.process_iter(["pid", "uids", "cmdline"]):
        if process.pid == os.getpid():
            continue
        try:
            if process.info["uids"].real != os.getuid():
                continue
            argv = process.info["cmdline"] or []
            if not argv or not _is_hermes_argv(argv):
                continue
            selected = list(_argv_profile_selectors(argv))
            env_home = process.environ().get("HERMES_HOME")
            homes = [Path(env_home).resolve()] if env_home else []
            homes.extend(root if name == "default" else root / "profiles" / name for name in selected)
            if not homes:
                homes = [root]
            if home in homes:
                return True
        except (psutil.NoSuchProcess, psutil.ZombieProcess):
            continue
        except psutil.AccessDenied:
            raise ProfileError("A Hermes process could not be inspected. Close it before adopting or changing settings.")
    return False


def deep_merge(target, patch):
    for key, value in patch.items():
        if isinstance(value, dict):
            if not isinstance(target.get(key), dict):
                target[key] = {}
            deep_merge(target[key], value)
        else:
            target[key] = copy.deepcopy(value)


class Settings:
    def __init__(self, home, root, fixture=False):
        self.home, self.root, self.fixture = home, root, fixture

    def config(self):
        if self.fixture:
            path = self.home / "config.yaml"
            return json.loads(path.read_text()) if path.exists() else {}
        # Fail closed on malformed files instead of turning an unreadable config into {}.
        from hermes_cli.config import require_readable_config_before_write
        return require_readable_config_before_write(self.home / "config.yaml")

    def save_config(self, config):
        if self.fixture:
            atomic_write(self.home / "config.yaml", json.dumps(config).encode())
        else:
            from hermes_cli.config import save_config
            save_config(config, strip_defaults=False)

    def snapshot(self, live=False):
        before = revision(self.home)
        config = self.config()
        soul_path = self.home / "SOUL.md"
        soul = soul_path.read_text() if soul_path.exists() else ""
        values = {
            "model": config.get("model", {}).get("default", ""),
            "workspace": config.get("terminal", {}).get("cwd", ""),
            "soul": soul,
            "toolsets": config.get("platform_toolsets", {}).get("cli", []),
            "approvalMode": config.get("approvals", {}).get("mode", "manual"),
        }
        if (not all(isinstance(values[field], str) for field in ("model", "workspace", "soul", "approvalMode"))
                or not isinstance(values["toolsets"], list)
                or not all(isinstance(tool, str) for tool in values["toolsets"])):
            raise ProfileError("Profile settings have invalid field types. Repair the file and reload.")
        after = revision(self.home)
        if before != after:
            raise ProfileError("Profile changed while reading. Reload settings.")
        supported = (values["model"] in MODELS and isinstance(values["toolsets"], list)
                     and bool(values["toolsets"]) and set(values["toolsets"]) <= TOOLS
                     and values["approvalMode"] in ("manual", "off"))
        # Unknown fields and credentials never enter this projection.
        return {"profileHome": str(self.home), "profileName": self.home.name if self.home != self.root else "default",
                "revision": after, "values": values, "ownerId": owner(self.home),
                "managed": owner(self.home) is not None, "liveOwner": live,
                "supported": supported, "scope": "profile", "effect": "next-start"}

    def apply(self, request):
        values = request["values"]
        if (set(values) != {"model", "workspace", "soul", "toolsets", "approvalMode"}
                or values["model"] not in MODELS or values["approvalMode"] not in ("manual", "off")
                or not isinstance(values["soul"], str) or len(values["soul"]) > 32000
                or not isinstance(values["toolsets"], list) or not values["toolsets"]
                or not set(values["toolsets"]) <= TOOLS):
            raise ProfileError("Invalid profile settings.")
        workspace = Path(values["workspace"])
        if not workspace.is_absolute() or not workspace.is_dir():
            raise ProfileError("Choose an existing absolute workspace directory.")
        if request.get("expectedRevision") != revision(self.home):
            raise ProfileError("Profile changed outside this editor. Reload and review before saving.")
        config = self.config()
        soul_path = self.home / "SOUL.md"
        original_soul = soul_path.read_bytes() if soul_path.exists() else None
        wanted = copy.deepcopy(config)
        routing = request["routing"]
        deep_merge(wanted, routing)
        wanted.pop("fallback_model", None)
        for block in wanted.get("auxiliary", {}).values():
            if isinstance(block, dict):
                for key in OVERRIDES:
                    block.pop(key, None)
                block["provider"] = routing["model"]["provider"]
                block["model"] = values["model"]
                block["api_mode"] = routing["model"]["api_mode"]
        for key in OVERRIDES:
            if key != "fallback_providers":
                wanted["delegation"].pop(key, None)
        for name in routing["providers"]:
            for key in ("key_cmd", "api_key", "extra_headers", "extra_body", "request_overrides"):
                wanted["providers"][name].pop(key, None)
        deep_merge(wanted, {"terminal": {"cwd": str(workspace), "backend": "local"},
                           "platform_toolsets": {"cli": values["toolsets"]},
                           "approvals": {"mode": values["approvalMode"]}})
        validate_approval_policy(self.home, wanted, self.fixture)
        # Recheck after parsing/validation, immediately before native publication.
        if request["expectedRevision"] != revision(self.home):
            raise ProfileError("Profile changed during validation. Reload settings.")
        sections = {}
        try:
            self.save_config(wanted)
            actual = self.snapshot()["values"]
            for field in ("workspace", "model", "toolsets", "approvalMode"):
                matched = actual[field] == values[field]
                sections[field] = {"applied": matched, "message": "Saved; applies at next start." if matched else "Native readback differs. Reload before retrying."}
        except Exception:
            for field in ("workspace", "model", "toolsets", "approvalMode"):
                sections[field] = {"applied": False, "message": "Configuration save could not be verified. Reload before retrying."}
        try:
            current_soul = soul_path.read_bytes() if soul_path.exists() else None
            if current_soul != original_soul:
                sections["soul"] = {"applied": False, "message": "Persona changed during configuration save. Reload and review it before retrying."}
            else:
                atomic_write(soul_path, values["soul"].encode())
                matched = soul_path.read_text() == values["soul"]
                sections["soul"] = {"applied": matched, "message": "Saved; applies at next start." if matched else "Persona readback differs."}
        except Exception:
            sections["soul"] = {"applied": False, "message": "Persona could not be saved. Other section outcomes are shown separately."}
        return {"ok": all(item["applied"] for item in sections.values()), "sections": sections,
                "snapshot": self.snapshot()}


def run(request, source, root):
    fixture = source == "fixture"
    root = Path(root).resolve(strict=True)
    home = Path(request["profileHome"]).resolve(strict=True)
    if home != root and home.parent != (root / "profiles").resolve():
        raise ProfileError("Choose the default Hermes home or one of its named profiles.")
    if not home.is_dir():
        raise ProfileError("Profile directory does not exist.")
    os.environ["HERMES_HOME"] = str(home)
    if not fixture:
        sys.path.insert(0, source)
    settings = Settings(home, root, fixture)
    revision(home)  # Refuse linked/malformed managed paths before opening any writer.
    lease = os.open(home / ".blueoffice-lease", os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600)
    with os.fdopen(lease, "r+"):
        try:
            fcntl.flock(lease, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            if request["action"] == "read":
                return settings.snapshot(live=True)
            raise ProfileError("This profile has a live owner. Stop it before changing settings.")
        occupied = live_owner(home, root, fixture)
        if request["action"] == "read":
            return settings.snapshot(live=occupied)
        if occupied:
            raise ProfileError("This profile has a live Hermes owner. Stop it before adopting or changing settings.")
        existing = owner(home)
        if request["action"] == "save":
            if not existing or existing != request.get("agentId"):
                raise ProfileError("Profile is not owned by this office agent.")
        elif request["action"] == "adopt":
            if existing:
                raise ProfileError("This canonical profile is already assigned to an office agent.")
            if request.get("acknowledgeOwnership") is not True:
                raise ProfileError("Confirm the managed single-writer policy before adopting this profile.")
        else:
            raise ProfileError("Unknown profile operation.")
        result = settings.apply(request)
        if request["action"] == "adopt" and result["ok"]:
            atomic_write(home / ".blueoffice-agent.json", json.dumps({"agentId": request["agentId"]}).encode())
            result["snapshot"] = settings.snapshot()
        return result


if __name__ == "__main__":
    try:
        request = json.loads(sys.stdin.read(100_000))
        # Native helpers can print diagnostics; never forward their raw output.
        with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
            result = run(request, sys.argv[1], sys.argv[2])
    except ProfileError as error:
        result = {"error": str(error), "status": 409}
    except Exception:
        result = {"error": "Profile settings could not be read or saved. Check file access and reload.", "status": 409}
    print(json.dumps(result))
