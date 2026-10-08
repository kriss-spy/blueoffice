"""Read-only launcher discovery for the TypeScript supervisor."""
import json
import shutil
from hermes_probe import discover

launcher = shutil.which("hermes")
if not launcher:
    raise SystemExit("Hermes launcher is unavailable on PATH")
print(json.dumps(discover(launcher)))
