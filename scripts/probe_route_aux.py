"""Exercise actual native auxiliary and delegated-child clients in a disposable profile."""
import json
import os
from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).parent))
from probe_route_trace import install
install()
sys.path.insert(0, sys.argv[1])
from hermes_cli.config import load_config
from hermes_cli.runtime_provider import resolve_runtime_provider
from agent.auxiliary_client import call_llm
from run_agent import AIAgent
from tools.delegate_tool import _build_child_agent

cfg = load_config()
model = cfg["model"]["default"]
rt = resolve_runtime_provider(requested=cfg["model"]["provider"], target_model=model)
expected_mode = "codex_responses" if model.startswith("muse-") else "chat_completions"
assert rt["base_url"].rstrip("/") == "http://127.0.0.1:8317/v1" and rt["api_mode"] == expected_mode
parent = child = None
try:
    result = call_llm(task="compression", messages=[{"role": "user", "content": "Reply exactly ROUTE_OK. No tools or explanation."}], max_tokens=64, timeout=40)
    assert "ROUTE_OK" in (result.choices[0].message.content or ""), "Auxiliary text mismatch"
    parent = AIAgent(model=model, **{k: rt[k] for k in ("provider", "api_key", "base_url", "api_mode")}, enabled_toolsets=[], max_iterations=1, quiet_mode=True, skip_memory=True, skip_context_files=True)
    delegation = cfg["delegation"]
    child = _build_child_agent(0, "Reply exactly ROUTE_OK. No tools or explanation.", None, [], model, 1, 1, parent,
        override_provider=delegation["provider"], override_api_mode=delegation["api_mode"], routing_cfg=delegation)
    assert child.base_url.rstrip("/") == "http://127.0.0.1:8317/v1" and child.api_mode == expected_mode
    result = child.run_conversation("Reply exactly ROUTE_OK. No tools or explanation.")
    assert not result.get("failed") and "ROUTE_OK" in result.get("final_response", ""), "Delegated child did not complete"
    Path(os.environ["BLUEOFFICE_AUX_RESULT"]).write_text(json.dumps({"passed": True, "checks": ["auxiliary", "delegation"], "apiMode": expected_mode}))
finally:
    if child: child.close()
    if parent: parent.close()
