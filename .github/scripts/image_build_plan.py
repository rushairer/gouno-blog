#!/usr/bin/env python3
"""Select deployable container images from changed repository paths."""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path, PurePosixPath
from typing import Iterable

IMAGE_ORDER = ("backend", "frontend", "seed")
IMAGE_CONFIG = {
    "backend": {
        "name": "backend",
        "image": "gouno-blog-backend",
        "context": ".",
        "dockerfile": "blog-backend/Dockerfile",
    },
    "frontend": {
        "name": "frontend",
        "image": "gouno-blog-frontend",
        "context": "blog-frontend",
        "dockerfile": "blog-frontend/Dockerfile",
    },
    "seed": {
        "name": "seed",
        "image": "gouno-blog-seed",
        "context": "seed",
        "dockerfile": "seed/Dockerfile",
    },
}

IMAGE_PIPELINE_FILES = {
    ".github/workflows/publish-images.yml",
    ".github/scripts/image_build_plan.py",
    # This guard controls whether automation-written runtime commits reach the
    # registry. Treat changes to it as release-control-plane changes and force
    # a conservative republish of all deployable images.
    ".github/scripts/main_writer_publish_contract.py",
}

FRONTEND_BUILD_ROOT_FILES = {
    ".npmrc",
    "Dockerfile",
    "index.html",
    "nginx.conf",
    "package-lock.json",
    "package.json",
    "security-headers.conf",
}


def _is_test_file(path: str) -> bool:
    pure = PurePosixPath(path)
    if "__tests__" in pure.parts or "testdata" in pure.parts:
        return True
    name = pure.name
    if name.endswith("_test.go"):
        return True
    return re.search(r"\.(?:test|spec)\.[^.]+$", name) is not None


def _frontend_impacts_image(path: str) -> bool:
    prefix = "blog-frontend/"
    if not path.startswith(prefix):
        return False

    relative = path[len(prefix) :]
    if not relative:
        return False
    if relative.startswith(("e2e/", "playwright-report/", "test-results/", "coverage/")):
        return False
    if _is_test_file(relative):
        return False
    if relative.startswith("scripts/"):
        # npm run build executes this post-build integrity check. Other scripts
        # are quality/parity tooling and do not change the shipped image.
        return relative == "scripts/check-static-chunk-cycles.mjs"
    if relative.startswith(("src/", "public/")):
        return True
    if relative in FRONTEND_BUILD_ROOT_FILES:
        return True
    if relative.startswith(("vite.config.", "tsconfig", "postcss.config.", "tailwind.config.")):
        return True
    if relative.endswith(".md"):
        return False

    # Be conservative for unknown frontend root files: missing a runtime build
    # is worse than doing an occasional extra build.
    return True


def _backend_impacts_image(path: str) -> bool:
    prefix = "blog-backend/"
    if not path.startswith(prefix):
        return False
    relative = path[len(prefix) :]
    if not relative or _is_test_file(relative):
        return False
    if relative.startswith(("coverage/", "test-results/")) or relative.endswith(".md"):
        return False
    return True


def _seed_impacts_image(path: str) -> bool:
    prefix = "seed/"
    if not path.startswith(prefix):
        return False
    relative = path[len(prefix) :]
    if not relative or _is_test_file(relative):
        return False
    if relative.startswith(("coverage/", "test-results/")) or relative.endswith(".md"):
        return False
    return True


def select_images(paths: Iterable[str], force_all: bool = False) -> list[str]:
    if force_all:
        return list(IMAGE_ORDER)

    selected: set[str] = set()
    for raw_path in paths:
        path = raw_path.strip()
        if not path:
            continue
        if path in IMAGE_PIPELINE_FILES:
            selected.update(IMAGE_ORDER)
            continue
        if _backend_impacts_image(path):
            selected.add("backend")
        if _frontend_impacts_image(path):
            selected.add("frontend")
        if _seed_impacts_image(path):
            selected.add("seed")
    return [name for name in IMAGE_ORDER if name in selected]


def matrix_for(selected: Iterable[str]) -> dict[str, list[dict[str, str]]]:
    return {"include": [IMAGE_CONFIG[name] for name in selected]}


def _read_files0(path: Path) -> list[str]:
    raw = path.read_bytes()
    return [item.decode("utf-8") for item in raw.split(b"\0") if item]


def main() -> int:
    parser = argparse.ArgumentParser()
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--all", action="store_true", help="Build all deployable images")
    group.add_argument("--files0", type=Path, help="NUL-delimited changed-path file")
    args = parser.parse_args()

    paths = [] if args.all else _read_files0(args.files0)
    selected = select_images(paths, force_all=args.all)
    selected_set = set(selected)
    matrix = matrix_for(selected)

    print(f"matrix={json.dumps(matrix, separators=(',', ':'))}")
    print(f"has_images={'true' if selected else 'false'}")
    print(f"selection={','.join(selected) if selected else 'none'}")
    for name in IMAGE_ORDER:
        print(f"{name}={'true' if name in selected_set else 'false'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
