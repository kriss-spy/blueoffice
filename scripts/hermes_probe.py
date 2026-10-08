#!/usr/bin/env python3
"""Run the installed Hermes contract probe in a disposable Linux namespace."""
import argparse
import ast
import hashlib
import fcntl
import json
from pathlib import Path
import shutil
import subprocess
import sys


def discover(launcher):
    command = json.loads(subprocess.check_output(
        [launcher, "--print-runtime-command"], text=True, timeout=20))
    if not isinstance(command, list) or "-c" not in command:
        raise RuntimeError("Unsupported Hermes launcher: expected a Python runtime command")
    # Read the declared source path; never eval launcher output.
    tree = ast.parse(command[command.index("-c") + 1])
    roots = [node.args[1].value for node in ast.walk(tree)
             if isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute)
             and ast.unparse(node.func) == "sys.path.insert" and len(node.args) == 2
             and isinstance(node.args[1], ast.Constant) and isinstance(node.args[1].value, str)]
    if len(roots) != 1:
        raise RuntimeError("Cannot unambiguously discover Hermes source root")
    source = Path(roots[0]).resolve()
    runtime = Path(command[0]).resolve()
    revision = subprocess.check_output(["git", "-C", str(source), "rev-parse", "HEAD"], text=True).strip()
    # PM's read-only selection helper is stdlib-only, unlike importing the gateway.
    code = ("import sys,json; from pathlib import Path; "
            f"sys.path.insert(0,{str(source)!r}); "
            "from pm.environments import selected_venv; from hermes_constants import get_hermes_home,get_default_hermes_root; "
            f"print(json.dumps({{'venv':str(selected_venv(Path({str(source)!r}))), 'profile_home':str(get_hermes_home()), 'profile_root':str(get_default_hermes_root())}}))")
    context = json.loads(subprocess.check_output([str(runtime), "-I", "-c", code], text=True))
    venv = Path(context["venv"])
    python = venv / "bin/python"
    if not python.exists() or python.resolve() != runtime:
        raise RuntimeError("Selected dependency environment does not match trusted Hermes interpreter")
    return {"source": str(source), "runtime": str(runtime), "venv": str(venv),
            "python": str(python), "revision": revision, "profile_home": context["profile_home"], "profile_root": context["profile_root"]}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--launcher", default=shutil.which("hermes"))
    parser.add_argument("--output", type=Path, default=Path("artifacts/hermes-contract"))
    parser.add_argument("--suite", choices=("protocol", "office"), default="protocol")
    args = parser.parse_args()
    output = args.output.resolve()
    output.mkdir(parents=True, exist_ok=True)
    # A failed rerun must revoke previous passing evidence before discovery starts.
    # Serialize writers so one failed process cannot invalidate another live run.
    lock = (output / "run.lock").open("w")
    try:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        parser.error("Another probe is already writing this output directory")
    report_path = output / "report.json"
    report_path.write_text(json.dumps({"passed": False, "runner_completed": False, "phase": "discovery"}))
    if not args.launcher or not shutil.which("bwrap"):
        parser.error("Installed Hermes and bubblewrap are required; there is no unisolated fallback")
    installation = discover(args.launcher)
    source = Path(installation["source"])
    fingerprints = {str(path.relative_to(source)): hashlib.sha256(path.read_bytes()).hexdigest()
                    for path in sorted((source / "tui_gateway").glob("*.py"))}
    project = Path(__file__).resolve().parents[1]
    mounts = [installation["source"], str(Path(installation["runtime"]).parents[1]),
              str(Path(installation["venv"]).parent)]
    command = ["bwrap", "--unshare-all", "--die-with-parent", "--new-session", "--clearenv"]
    for directory in ("/usr", "/lib", "/lib64", "/bin", "/etc"):
        if Path(directory).exists():
            command += ["--ro-bind", directory, directory]
    command += ["--proc", "/proc", "--dev", "/dev", "--tmpfs", "/tmp", "--tmpfs", "/home"]
    for directory in mounts:
        command += ["--ro-bind", directory, directory]
    # PM validates that dependency generations belong to the profile root. Mount the
    # same immutable generation under each temporary root; never copy real profile data.
    for label in ("alpha", "beta"):
        relative = Path(installation["venv"]).relative_to(Path(installation["venv"]).parents[4])
        command += ["--ro-bind", installation["venv"], str(Path("/tmp") / label / relative)]
    if args.suite == "office":
        node = shutil.which("node")
        if not node:
            parser.error("Node.js is required for the office integration probe")
        node_root = str(Path(node).resolve().parents[1])
        command += ["--ro-bind", node_root, node_root, "--dir", "/office", "--setenv", "BLUEOFFICE_NODE", node]
        # Never expose the checkout wholesale: it may contain live .blueoffice data or credentials.
        for entry in ("server", "shared", "scripts", "tests", "node_modules", "package.json", "tsconfig.json"):
            command += ["--ro-bind", str(project / entry), f"/office/{entry}"]
    inner = "probe_contract.py" if args.suite == "protocol" else "probe_office.py"
    command += ["--ro-bind", str(project / "scripts"), "/probe", "--bind", str(output), "/evidence",
                "--setenv", "PATH", "/usr/bin:/bin", "--setenv", "LANG", "C.UTF-8",
                "--setenv", "HERMES_DISABLE_LAZY_INSTALLS", "1", "--chdir", "/tmp",
                installation["python"], "-B", f"/probe/{inner}", json.dumps(installation), json.dumps(fingerprints)]
    try:
        result = subprocess.run(command, timeout=240)
    except (subprocess.TimeoutExpired, OSError) as exc:
        report_path.write_text(json.dumps({"passed": False, "runner_completed": False, "error": str(exc)}))
        raise
    report = json.loads(report_path.read_text())
    report["runner_completed"] = result.returncode == 0
    report["passed"] = report.get("passed") is True and report["runner_completed"]
    report_path.write_text(json.dumps(report, indent=2) + "\n")
    lock.close()
    print(f"Probe evidence: {output}")
    return result.returncode


if __name__ == "__main__":
    sys.exit(main())
