"""Regression tests for false-green detection; no Docker/database required."""
import importlib.util
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("gate", Path(__file__).with_name("check-db-integration.py"))
gate = importlib.util.module_from_spec(spec)
spec.loader.exec_module(gate)


class GateTests(unittest.TestCase):
    def event(self, action, test=None):
        return {"Package": gate.MODULE + "internal/example", "Action": action, "Test": test}

    def check(self, events, code=0):
        return gate.validate_events(events, "internal/example", {"TestDatabase"}, code)["ok"]

    def test_requires_actual_successful_execution(self):
        self.assertTrue(self.check([self.event("pass", "TestDatabase"), self.event("pass")]))
        self.assertFalse(self.check([]))
        self.assertFalse(self.check([self.event("pass")]))
        self.assertFalse(self.check([self.event("skip", "TestDatabase"), self.event("pass")]))
        self.assertFalse(self.check([self.event("fail", "TestDatabase"), self.event("fail")], 1))
        self.assertFalse(self.check([self.event("pass", "TestDatabase"), self.event("pass")], 1))

    def test_subtest_skip_and_failure_are_not_hidden_by_parent_pass(self):
        for action in ("skip", "fail"):
            self.assertFalse(self.check([self.event(action, "TestDatabase/case"),
                                         self.event("pass", "TestDatabase"), self.event("pass")]))

    def test_empty_inventory_fails(self):
        with tempfile.TemporaryDirectory() as directory:
            with self.assertRaises(RuntimeError):
                gate.inventory(Path(directory))

    def test_discovery_tracks_new_cases(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            package = root / "internal/migrations"
            package.mkdir(parents=True)
            source = package / "schema_integration_test.go"
            source.write_text("func TestFresh(t *testing.T) {}\nfunc TestUpgrade(t *testing.T) {}\n")
            self.assertEqual(gate.inventory(root), {"internal/migrations": {"TestFresh", "TestUpgrade"}})

    def test_existing_database_is_rejected_before_docker(self):
        with tempfile.TemporaryDirectory() as directory:
            with patch.dict(gate.os.environ, {"BLOG_TEST_POSTGRES_DSN": "not-an-owned-test-database"}):
                with patch.object(gate.subprocess, "run") as run:
                    with self.assertRaisesRegex(RuntimeError, "never uses an existing database"):
                        gate.run_gate(Path(directory))
                    run.assert_not_called()

    def test_artifacts_cannot_be_reused(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "old.json").write_text("{}")
            with patch.dict(gate.os.environ, {}, clear=True):
                with self.assertRaisesRegex(RuntimeError, "must be empty"):
                    gate.run_gate(root)


if __name__ == "__main__":
    unittest.main()
