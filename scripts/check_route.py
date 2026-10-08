"""Resolve a managed profile through Hermes' native configuration path without inference."""
import json
import os
import sys
sys.path.insert(0, sys.argv[1])
from hermes_cli.config import load_config
from hermes_cli.runtime_provider import resolve_runtime_provider

model = sys.argv[2]
mode = "codex_responses" if model == "muse-spark-1.3-contributor" else "chat_completions"
provider = "custom:blueoffice-muse" if mode == "codex_responses" else "custom:blueoffice-glm"
endpoint = "http://127.0.0.1:8317/v1"
config = load_config()
main = config.get("model", {})
assert main.get("default") == model and main.get("provider") == provider
entry = config.get("providers", {}).get(provider[7:], {})
assert entry.get("base_url") == endpoint and entry.get("key_env") == "BLUEOFFICE_PROXY_KEY"
assert not entry.get("key_cmd") and not entry.get("api_key") and not entry.get("extra_headers")
assert entry.get("transport", entry.get("api_mode")) == mode
assert not config.get("fallback_providers") and not config.get("fallback_model")
assert config["agent"]["api_max_retries"] == 1 and config["agent"]["auto_recovery_cycles"] == 0
assert config["auxiliary"]["transient_retries"] == 0
for task, block in config["auxiliary"].items():
    if isinstance(block, dict) and "provider" in block:
        assert block["provider"] == provider and block.get("model") == model
        assert not block.get("api_key") and not block.get("base_url")
delegation = config["delegation"]
assert delegation["provider"] == provider and delegation["model"] == model and delegation["api_mode"] == mode
assert not delegation.get("fallback_providers") and not delegation.get("base_url") and not delegation.get("api_key")
resolved = resolve_runtime_provider(requested=provider, target_model=model)
assert resolved["base_url"].rstrip("/") == endpoint and resolved["api_mode"] == mode
assert resolved["api_key"] == os.environ["BLUEOFFICE_PROXY_KEY"]
print(json.dumps({"model": model, "endpoint": endpoint, "apiMode": mode}))
