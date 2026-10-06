#!/usr/bin/env python3
"""Regression tests for immutable image vulnerability-scanning contracts."""

from __future__ import annotations

import unittest
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
TRIVY_SHA = "ed142fd0673e97e23eac54620cfb913e5ce36c25"
GRYPE_SHA = "27805bf3b4e84b4a5c980df22ed233c00390a439"


class ImageSecurityContractTest(unittest.TestCase):
    def test_alpine_packages_are_version_pinned(self) -> None:
        backend = (REPO_ROOT / "blog-backend" / "Dockerfile").read_text(encoding="utf-8")
        seed = (REPO_ROOT / "seed" / "Dockerfile").read_text(encoding="utf-8")

        self.assertIn("ca-certificates=20260909-r0", backend)
        self.assertIn("tzdata=2026e-r0", backend)
        self.assertIn("ca-certificates=20260909-r0", seed)
        self.assertNotIn("apk add --no-cache ca-certificates tzdata", backend)
        self.assertNotIn("apk --no-cache add ca-certificates \\\\", seed)

    def test_pull_request_images_run_both_scanners(self) -> None:
        workflow = (REPO_ROOT / ".github" / "workflows" / "images.yml").read_text(
            encoding="utf-8"
        )
        self.assertIn(f"aquasecurity/trivy-action@{TRIVY_SHA}", workflow)
        self.assertIn(f"anchore/scan-action@{GRYPE_SHA}", workflow)
        self.assertIn("severity: HIGH,CRITICAL", workflow)
        self.assertIn("severity-cutoff: high", workflow)
        self.assertIn("local/gouno-blog-${{ matrix.name }}:${{ github.sha }}", workflow)

    def test_published_images_are_scanned_by_immutable_digest(self) -> None:
        workflow = (
            REPO_ROOT / ".github" / "workflows" / "publish-images.yml"
        ).read_text(encoding="utf-8")

        for image in (
            "gouno-blog-backend",
            "gouno-blog-frontend",
            "gouno-blog-seed",
        ):
            digest_ref = (
                "${{ env.REGISTRY }}/${{ github.repository_owner }}/"
                + image
                + "@${{ steps.build.outputs.digest }}"
            )
            self.assertGreaterEqual(workflow.count(digest_ref), 2)

        self.assertEqual(workflow.count(f"aquasecurity/trivy-action@{TRIVY_SHA}"), 3)
        self.assertEqual(workflow.count(f"anchore/scan-action@{GRYPE_SHA}"), 3)


if __name__ == "__main__":
    unittest.main()
