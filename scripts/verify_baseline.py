#!/usr/bin/env python3
"""Verify the intentionally small, tracked BlueOffice project baseline."""
import re
import subprocess
from pathlib import Path
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parents[1]
ALLOWED = {
    ".gitignore", "AGENTS.md", "README.md", "RESOURCES.md",
    ".github/workflows/verification.yml", "scripts/verify_baseline.py",
    "docs/ARCHIVE.md", "docs/DIRECTION.md", "docs/PROTOTYPE-LESSONS.md",
    "docs/VERIFICATION.md",
}


def main():
    tracked = set(filter(None, subprocess.check_output(
        ["git", "ls-files", "-z"], cwd=ROOT).decode().split("\0")))
    errors = []
    if tracked != ALLOWED:
        errors.append(f"Unexpected tracked files: {sorted(tracked - ALLOWED)}")
        errors.append(f"Missing baseline files: {sorted(ALLOWED - tracked)}")
    for name in sorted(tracked & ALLOWED):
        path = ROOT / name
        if not path.is_file() or not path.read_text().strip():
            errors.append(f"Missing or empty file: {name}")
            continue
        if path.suffix != ".md":
            continue
        for target in re.findall(r"\[[^\]]+\]\(([^)]+)\)", path.read_text()):
            link = urlsplit(target)
            if link.scheme or link.netloc or not link.path:
                continue
            resolved = (path.parent / unquote(link.path)).resolve()
            if not resolved.is_relative_to(ROOT) or not resolved.is_file():
                errors.append(f"Broken or external local link in {name}: {target}")
                continue
            if resolved.relative_to(ROOT).as_posix() not in tracked:
                errors.append(f"Link to an untracked file in {name}: {target}")
    if errors:
        raise SystemExit("\n".join(errors))
    print(f"Project baseline passed: {len(tracked)} tracked files; local document links resolve.")


if __name__ == "__main__":
    main()
