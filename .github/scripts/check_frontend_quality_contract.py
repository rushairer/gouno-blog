#!/usr/bin/env python3
"""Prevent frontend dependency updates from bypassing the A+ quality ratchet."""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
HIGHEST_ACCEPTED_WARNINGS = 61
EXPECTED_SCRIPTS = {
    "lint": "node scripts/check-lint-warning-budget.mjs",
    "lint:budget:test": "node --test scripts/check-lint-warning-budget.probe.mjs",
    "check": "npm run format:check && tsc -b && npm run lint:budget:test && npm run lint && npm run test:coverage",
    "quality": "npm run format:check && npm run lint:budget:test && npm run lint && npm run lint:ui && npm run lint:css && tsc -b && npm run test:coverage && npm run build",
}


def validate_frontend_quality_contract(manifest, warning_gate_source):
    """Fail closed on stale npm scripts, relaxed budgets, and malformed source."""
    if not isinstance(manifest, dict) or not isinstance(manifest.get("scripts"), dict):
        raise ValueError("frontend manifest has no valid scripts object")
    scripts = manifest["scripts"]
    for name, expected in EXPECTED_SCRIPTS.items():
        if scripts.get(name) != expected:
            raise ValueError(
                f"frontend npm script {name!r} bypasses or changes the certified quality gate"
            )
    limits = re.findall(
        r"(?m)^export const maxAllowedWarnings = ([0-9]+);$",
        warning_gate_source,
    )
    if len(limits) != 1:
        raise ValueError("frontend warning ceiling must have one recognizable declaration")
    count = int(limits[0])
    if count > HIGHEST_ACCEPTED_WARNINGS:
        raise ValueError(
            f"frontend warning ceiling {count} exceeds the accepted "
            f"{HIGHEST_ACCEPTED_WARNINGS}-warning ratchet"
        )
    return count


def check():
    manifest = json.loads((ROOT / "blog-frontend/package.json").read_text(encoding="utf-8"))
    gate = (ROOT / "blog-frontend/scripts/check-lint-warning-budget.mjs").read_text(
        encoding="utf-8"
    )
    limit = validate_frontend_quality_contract(manifest, gate)
    print(f"Independent frontend script contract passed; warning ceiling <= {limit}")


if __name__ == "__main__":
    try:
        check()
    except (OSError, ValueError) as error:
        print(f"Frontend quality contract failed: {error}", file=sys.stderr)
        sys.exit(1)
