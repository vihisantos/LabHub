"""Conservative desktop CI scope. Unknown changes require the Windows job.

Only known web-only paths, documentation, and root npm version metadata
are exempt. Dependency, shared code, tooling and workflow changes are not.
Compare the full PR diff (merge base to head), without rename detection,
so moving a desktop file into a web-only path still requires validation.
"""
from __future__ import annotations

import json
import os
import re
import subprocess
from pathlib import Path

WEB_ONLY_PREFIXES = (
    "src/apps/chamados/",
    "src/apps/chamados-publico/",
    "src/apps/reservalab/",
)
DOC_PREFIXES = ("docs/",)
WEB_ONLY_FILES = frozenset({"src/pages/Changelog.tsx"})
DOC_FILES = frozenset({"CHANGELOG.md", "README.md"})
NPM_METADATA = frozenset({"package.json", "package-lock.json"})


def canonical(value: object) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def without_root_version(path: str, content: str) -> tuple[str, str]:
    data = json.loads(content)
    if not isinstance(data, dict) or data.get("name") != "labhub":
        raise ValueError("Unexpected npm manifest")
    version = data.pop("version")
    if not isinstance(version, str) or not re.fullmatch(r"\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?", version):
        raise ValueError("Unexpected version format")
    if path == "package-lock.json":
        root = data["packages"][""]
        if root.get("name") != "labhub" or root.pop("version") != version:
            raise ValueError("Inconsistent root lockfile version")
    return version, canonical(data)


def git(root: Path, *args: str) -> bytes:
    return subprocess.check_output(["git", *args], cwd=root)


def metadata_only(root: Path, path: str, base: str, head: str) -> bool:
    try:
        before = git(root, "show", f"{base}:{path}").decode("utf-8")
        after = git(root, "show", f"{head}:{path}").decode("utf-8")
        return without_root_version(path, before)[1] == without_root_version(path, after)[1]
    except (OSError, subprocess.CalledProcessError, UnicodeError, ValueError, KeyError, TypeError, AttributeError):
        return False


def desktop_impact(root: Path, base: str, head: str) -> tuple[bool, list[str]]:
    if not all(re.fullmatch(r"[0-9a-f]{40}", sha) for sha in (base, head)):
        raise ValueError("Expected full commit SHAs")
    ancestor = git(root, "merge-base", base, head).decode("ascii").strip()
    changed = git(root, "diff", "--name-only", "-z", "--no-renames", ancestor, head, "--")
    paths = [os.fsdecode(p) for p in changed.split(b"\0") if p]
    reasons = []
    for path in paths:
        if path in NPM_METADATA:
            if not metadata_only(root, path, ancestor, head):
                reasons.append(path)
        elif path in WEB_ONLY_FILES or path in DOC_FILES or path.startswith(WEB_ONLY_PREFIXES):
            continue
        elif path.startswith(DOC_PREFIXES) and path.lower().endswith(".md"):
            continue
        else:
            reasons.append(path)
    return bool(reasons), reasons


def main() -> None:
    # Errors in Git or the classifier fail the scope job, never silently skip.
    required, reasons = desktop_impact(Path.cwd(), os.environ["BASE_SHA"], os.environ["HEAD_SHA"])
    result = "true" if required else "false"
    print(f"Desktop validation required: {result}")
    for path in reasons:
        print("Desktop-relevant:", repr(path))
    with open(os.environ["GITHUB_OUTPUT"], "a", encoding="utf-8") as output:
        output.write(f"required={result}\n")


if __name__ == "__main__":
    main()
