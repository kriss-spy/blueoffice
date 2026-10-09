"""Namespace-only bootstrap. Reuses the trusted synthetic protocol provider."""
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
from probe_provider import MockProvider

installation = json.loads(sys.argv[1])
root = Path('/tmp/alpha')
key = hashlib.sha256(installation['source'].encode()).hexdigest()[:16]
selection = root / 'installs' / key
selection.mkdir(parents=True, exist_ok=True)
dependency = selection / 'environments' / Path(installation['venv']).parent.name / 'venv'
(selection / 'facts.json').write_text(json.dumps({'schema': 1, 'packages': {'venv': {'environment': str(dependency)}}}))
(root / 'workspace').mkdir(exist_ok=True)
(root / 'mock-key').write_text('synthetic-performance-key')
installation['profile_root'] = str(root)
with MockProvider(port=8317) as provider:
    result = subprocess.run([os.environ['BLUEOFFICE_NODE'], '--import', 'tsx', 'scripts/performance-owned.mjs', json.dumps(installation), sys.argv[2]], cwd='/office', timeout=160)
    report_path = Path('/evidence/report.json')
    report = json.loads(report_path.read_text())
    report['providerCalls'] = provider.calls
    report['hermesRevision'] = installation['revision']
    report_path.write_text(json.dumps(report, indent=2))
raise SystemExit(result.returncode)
