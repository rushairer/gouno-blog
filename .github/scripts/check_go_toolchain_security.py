#!/usr/bin/env python3
"""Guard the pinned, patched Go toolchain across modules and OCI builders."""
import re
import sys
from pathlib import Path


def check():
    root = Path(__file__).resolve().parents[2]
    versions = []
    digests = []
    for component in ("blog-backend", "seed"):
        mod = (root / component / "go.mod").read_text()
        directive = re.search(r"(?m)^go (\d+)\.(\d+)\.(\d+)$", mod)
        assert directive, f"{component}: go.mod must pin a Go patch release"
        version = tuple(map(int, directive.groups()))
        assert version >= (1, 27, 2), f"{component}: requires Go 1.27.2+ security baseline"
        dockerfile = (root / component / "Dockerfile").read_text()
        builder = re.search(
            r"(?m)^FROM --platform=\$BUILDPLATFORM golang:(\d+\.\d+\.\d+)-alpine@sha256:([0-9a-f]{64}) AS builder$",
            dockerfile,
        )
        assert builder, f"{component}: builder must pin a patch tag and immutable index digest"
        assert builder.group(1) == ".".join(map(str, version)), (
            f"{component}: builder Go version {builder.group(1)} differs from go.mod"
        )
        versions.append(version)
        digests.append(builder.group(2))
    assert versions[0] == versions[1], "Backend and Seed Go patch versions diverged"
    assert digests[0] == digests[1], "Backend and Seed pinned builder digests diverged"

    backend_mod = (root / "blog-backend/go.mod").read_text()
    x_net = re.search(r"(?m)^\s*golang\.org/x/net v(\d+)\.(\d+)\.(\d+)(?:\s+// indirect)?$", backend_mod)
    assert x_net, "backend must explicitly pin golang.org/x/net"
    x_net_version = tuple(map(int, x_net.groups()))
    assert x_net_version >= (0, 60, 0), "golang.org/x/net v0.60.0+ required for 2026 HTTP/2 fixes"
    sums = (root / "blog-backend/go.sum").read_text()
    exact_version = "v" + ".".join(map(str, x_net_version))
    for suffix in ("", "/go.mod"):
        assert re.search(
            rf"(?m)^golang\.org/x/net {re.escape(exact_version + suffix)} h1:[A-Za-z0-9+/=]+$",
            sums,
        ), f"missing checksum for golang.org/x/net {exact_version}{suffix}"

    workflow = (root / ".github/workflows/ci.yml").read_text()
    for name in ("blog-backend", "seed"):
        assert f"go-version-file: {name}/go.mod" in workflow, (
            f"CI must install Go from {name}/go.mod rather than float independently"
        )
    print(f"Go security baseline OK: {'.'.join(map(str, versions[0]))}, immutable multiarch builder sha256:{digests[0]}")


if __name__ == "__main__":
    try:
        check()
    except (AssertionError, OSError, ValueError) as exc:
        sys.exit(f"Go toolchain security contract failed: {exc}")
