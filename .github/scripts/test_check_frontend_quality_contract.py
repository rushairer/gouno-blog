"""Executable positive/negative probes for the independent CI npm script guard."""
import unittest

from check_frontend_quality_contract import (
    EXPECTED_SCRIPTS,
    validate_frontend_quality_contract,
)


def valid_manifest():
    return {"scripts": dict(EXPECTED_SCRIPTS)}


def warning_source(limit=61):
    return f"export const maxAllowedWarnings = {limit};\n"


class FrontendQualityContractTests(unittest.TestCase):
    def test_accepted_scripts_and_current_budget(self):
        self.assertEqual(
            validate_frontend_quality_contract(valid_manifest(), warning_source()), 61
        )

    def test_real_budget_reduction_is_allowed(self):
        self.assertEqual(
            validate_frontend_quality_contract(valid_manifest(), warning_source(60)), 60
        )

    def test_stale_lint_command_is_rejected(self):
        manifest = valid_manifest()
        manifest["scripts"]["lint"] = "oxlint"
        with self.assertRaisesRegex(ValueError, "lint"):
            validate_frontend_quality_contract(manifest, warning_source())

    def test_missing_native_probes_are_rejected(self):
        manifest = valid_manifest()
        manifest["scripts"].pop("lint:budget:test")
        with self.assertRaisesRegex(ValueError, "lint:budget:test"):
            validate_frontend_quality_contract(manifest, warning_source())

    def test_quality_without_probes_or_lint_is_rejected(self):
        for new_command in (
            "npm run format:check && oxlint src && npm run build",
            "npm run lint && npm run lint:ui && npm run build",
            "npm run lint:budget:test && npm run build",
        ):
            with self.subTest(new_command=new_command):
                manifest = valid_manifest()
                manifest["scripts"]["quality"] = new_command
                with self.assertRaisesRegex(ValueError, "quality"):
                    validate_frontend_quality_contract(manifest, warning_source())

    def test_check_without_probes_is_rejected(self):
        manifest = valid_manifest()
        manifest["scripts"]["check"] = "npm run format:check && oxlint src && npm run test:coverage"
        with self.assertRaisesRegex(ValueError, "check"):
            validate_frontend_quality_contract(manifest, warning_source())

    def test_old_65_warning_ceiling_cannot_return(self):
        with self.assertRaisesRegex(ValueError, "exceeds"):
            validate_frontend_quality_contract(valid_manifest(), warning_source(65))

    def test_missing_or_duplicate_warning_declarations_fail(self):
        for source in (
            "",
            "const maxAllowedWarnings = 61;",
            warning_source() + warning_source(),
            "export const maxAllowedWarnings = dynamic;",
        ):
            with self.subTest(source=source):
                with self.assertRaisesRegex(ValueError, "one recognizable"):
                    validate_frontend_quality_contract(valid_manifest(), source)

    def test_missing_or_invalid_manifest_scripts_fail(self):
        for invalid in ({}, {"scripts": None}, {"scripts": []}):
            with self.subTest(invalid=invalid):
                with self.assertRaisesRegex(ValueError, "no valid scripts"):
                    validate_frontend_quality_contract(invalid, warning_source())


if __name__ == "__main__":
    unittest.main()
