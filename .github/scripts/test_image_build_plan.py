#!/usr/bin/env python3
"""Regression tests for the container image change planner and publish handoff."""

from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from image_build_plan import select_images  # noqa: E402
from main_writer_publish_contract import (  # noqa: E402
    repository_contract_violations,
    workflow_contract_violations,
)


class ImageBuildPlanTest(unittest.TestCase):
    def test_frontend_runtime_change_builds_only_frontend(self) -> None:
        self.assertEqual(select_images(["blog-frontend/src/pages/admin/Users.tsx"]), ["frontend"])

    def test_frontend_e2e_only_change_builds_nothing(self) -> None:
        self.assertEqual(select_images(["blog-frontend/e2e/privileged-access-parity.pw.mjs"]), [])

    def test_frontend_quality_contract_change_builds_nothing(self) -> None:
        self.assertEqual(select_images(["blog-frontend/scripts/check-privileged-access-parity.mjs"]), [])

    def test_frontend_build_integrity_script_still_builds_frontend(self) -> None:
        self.assertEqual(select_images(["blog-frontend/scripts/check-static-chunk-cycles.mjs"]), ["frontend"])

    def test_frontend_test_source_builds_nothing(self) -> None:
        self.assertEqual(select_images(["blog-frontend/src/components/auth/__tests__/SudoGate.test.tsx"]), [])

    def test_frontend_dependency_change_builds_frontend(self) -> None:
        self.assertEqual(select_images(["blog-frontend/package-lock.json"]), ["frontend"])

    def test_backend_test_only_change_builds_nothing(self) -> None:
        self.assertEqual(select_images(["blog-backend/internal/auth/policy_test.go"]), [])

    def test_backend_runtime_change_builds_backend(self) -> None:
        self.assertEqual(select_images(["blog-backend/internal/auth/policy.go"]), ["backend"])

    def test_seed_test_only_change_builds_nothing(self) -> None:
        self.assertEqual(select_images(["seed/main_test.go"]), [])

    def test_seed_runtime_change_builds_seed(self) -> None:
        self.assertEqual(select_images(["seed/main.go"]), ["seed"])

    def test_unrelated_workflow_and_docs_build_nothing(self) -> None:
        self.assertEqual(
            select_images([".github/workflows/ui-browser-acceptance.yml", "docs/architecture.md"]),
            [],
        )

    def test_multi_component_change_selects_only_affected_images(self) -> None:
        self.assertEqual(
            select_images(["blog-backend/cmd/main.go", "blog-frontend/src/main.tsx"]),
            ["backend", "frontend"],
        )

    def test_release_force_all_builds_every_image(self) -> None:
        self.assertEqual(select_images([], force_all=True), ["backend", "frontend", "seed"])


class MainWriterPublishContractTest(unittest.TestCase):
    def test_main_writer_without_publish_dispatch_is_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            workflow = Path(directory) / "writer.yml"
            workflow.write_text(
                "name: Writer\nsteps:\n  - run: git push origin HEAD:main\n",
                encoding="utf-8",
            )
            violations = workflow_contract_violations([workflow])
            self.assertEqual(len(violations), 1)
            self.assertIn("does not explicitly dispatch", violations[0])

    def test_main_writer_with_publish_dispatch_is_accepted(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            workflow = Path(directory) / "writer.yml"
            workflow.write_text(
                "name: Writer\nsteps:\n"
                "  - run: git push origin HEAD:main\n"
                "  - run: gh workflow run \"Publish Images\" --ref main --field image=frontend\n",
                encoding="utf-8",
            )
            self.assertEqual(workflow_contract_violations([workflow]), [])

    def test_verified_non_runtime_writer_can_use_explicit_waiver(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            workflow = Path(directory) / "writer.yml"
            workflow.write_text(
                "name: Writer\n# image-publish-handoff: not-required\n"
                "steps:\n  - run: git push origin HEAD:main\n",
                encoding="utf-8",
            )
            self.assertEqual(workflow_contract_violations([workflow]), [])

    def test_repository_workflows_follow_publish_handoff_contract(self) -> None:
        repository_root = Path(__file__).resolve().parents[2]
        self.assertEqual(repository_contract_violations(repository_root), [])


if __name__ == "__main__":
    unittest.main()
