#!/usr/bin/env python3
"""Measure 1/4/8 owned installed Hermes processes in a disposable namespace."""
import argparse
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
from hermes_probe import discover


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--seconds', type=float, default=5)
    args = parser.parse_args()
    if not 2 <= args.seconds <= 30:
        parser.error('Use a modest sample duration between 2 and 30 seconds.')
    if not shutil.which('bwrap') or not shutil.which('hermes'):
        parser.error('Installed Hermes and bubblewrap are required.')
    installation = discover(shutil.which('hermes'))
    output = args.output.resolve()
    output.mkdir(parents=True, exist_ok=True)
    project = Path(__file__).resolve().parents[1]
    node = str(Path(shutil.which('node')).resolve()) if shutil.which('node') else None
    if not node:
        parser.error('Node.js is required.')
    command = ['bwrap', '--unshare-all', '--die-with-parent', '--new-session', '--clearenv']
    for directory in ['/usr', '/lib', '/lib64', '/bin', '/etc']:
        if Path(directory).exists():
            command += ['--ro-bind', directory, directory]
    command += ['--proc', '/proc', '--dev', '/dev', '--tmpfs', '/tmp', '--tmpfs', '/home']
    for directory in {installation['source'], str(Path(installation['runtime']).parents[1]), str(Path(installation['venv']).parent), str(Path(node).resolve().parents[1])}:
        command += ['--ro-bind', directory, directory]
    relative = Path(installation['venv']).relative_to(Path(installation['venv']).parents[4])
    command += ['--ro-bind', installation['venv'], str(Path('/tmp/alpha') / relative)]
    for entry in ['server', 'shared', 'scripts', 'tests', 'node_modules', 'package.json', 'tsconfig.json']:
        command += ['--ro-bind', str(project / entry), f'/office/{entry}']
    command += ['--bind', str(output), '/evidence', '--setenv', 'PATH', '/usr/bin:/bin',
                '--setenv', 'LANG', 'C.UTF-8', '--setenv', 'HERMES_DISABLE_LAZY_INSTALLS', '1',
                '--setenv', 'BLUEOFFICE_NODE', node, '--chdir', '/office',
                installation['python'], '-B', '/office/scripts/performance-native-inner.py',
                json.dumps(installation), str(args.seconds)]
    def source_identity():
        script = 'import {sourceIdentity} from "./scripts/verification-evidence.mjs"; console.log(JSON.stringify(await sourceIdentity()))'
        return json.loads(subprocess.check_output([node, '--input-type=module', '-e', script], cwd=project, text=True))
    source = source_identity()
    report = {'passed': False, 'hermesRevision': installation['revision'], 'isolation': 'bubblewrap unshare-all; fresh profiles; synthetic provider; no live credentials/network',
              'source': source, 'host': {'platform': os.uname().sysname, 'release': os.uname().release, 'cpu': subprocess.check_output(['lscpu', '-J'], text=True), 'memory': Path('/proc/meminfo').read_text().splitlines()[:3], 'os': Path('/etc/os-release').read_text()}}
    (output / 'report.json').write_text(json.dumps(report, indent=2))
    with (output / 'runner.log').open('w') as log:
        result = subprocess.run(command, timeout=180, stdout=log, stderr=subprocess.STDOUT, text=True)
    if result.returncode:
        raise RuntimeError(f'Native measurement failed ({result.returncode}); inspect {output / "runner.log"}')
    measured = json.loads((output / 'report.json').read_text())
    final_source = source_identity()
    measured.update({'host': report['host'], 'isolation': report['isolation'], 'source': source, 'finalSource': final_source, 'sourceUnchanged': source['fingerprint'] == final_source['fingerprint']})
    measured['passed'] = bool(measured.get('passed') and measured['sourceUnchanged'])
    (output / 'report.json').write_text(json.dumps(measured, indent=2))
    if not measured['passed']:
        raise RuntimeError('Native samples are incomplete or invalid; inspect report.json')
    print(f'Native performance evidence: {output / "report.json"}')


if __name__ == '__main__':
    main()
