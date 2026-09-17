#!/usr/bin/env python3
"""Require automated main-branch writers to hand runtime changes to image publishing."""

from __future__ import annotations

import re
from pathlib import Path
from typing import Iterable

MAIN_PUSH_RE = re.compile(
    r"(?m)^[ \t]*(?!#)[^\n]*\bgit\s+push\b[^\n#]*(?:HEAD:main|refs/heads/main|\borigin\s+main\b)"
)
PUBLISH_IMAGES_DISPATCH_RE = re.compile(
    r"(?mi)^[ \t]*(?!#)[^\n]*\bgh\s+workflow\s+run\s+(?:\"Publish Images\"|'Publish Images'|publish-images\.yml)"
)
PUBLISH_HANDOFF_WAIVER_RE = re.compile(
    r"(?mi)^\s*#\s*image-publish-handoff:\s*not-required\s*$"
)


def workflow_contract_violations(workflow_paths: Iterable[Path]) -> list[str]:
    violations: list[str] = []
    for path in workflow_paths:
        text = path.read_text(encoding="utf-8")
        if not MAIN_PUSH_RE.search(text):
            continue
        if PUBLISH_IMAGES_DISPATCH_RE.search(text):
            continue
        if PUBLISH_HANDOFF_WAIVER_RE.search(text):
            continue
        violations.append(
            f"{path.as_posix()}: workflow pushes directly to main but does not explicitly dispatch "
            '"Publish Images". GitHub Actions pushes made with GITHUB_TOKEN do not recursively '
            "trigger push workflows; dispatch Publish Images after the push, or add "
            "'# image-publish-handoff: not-required' for a verified non-runtime writer."
        )
    return violations


def repository_contract_violations(repository_root: Path) -> list[str]:
    workflow_dir = repository_root / ".github" / "workflows"
    workflow_paths = sorted(
        [*workflow_dir.glob("*.yml"), *workflow_dir.glob("*.yaml")],
        key=lambda item: item.as_posix(),
    )
    return workflow_contract_violations(workflow_paths)


def main() -> int:
    repository_root = Path(__file__).resolve().parents[2]
    violations = repository_contract_violations(repository_root)
    if violations:
        print("Automated main-push image publish contract failed:")
        for violation in violations:
            print(f"- {violation}")
        return 1
    print("Automated main-push image publish contract passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
