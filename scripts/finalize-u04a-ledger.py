from __future__ import annotations

import json
from pathlib import Path

md_path = Path("docs/ui-redesign/MIGRATION.md")
json_path = Path("docs/ui-redesign/migration.json")

md = md_path.read_text()
old_row = "| blog-admin:pages/admin/AIOperations.tsx | /admin/ai-ops | not-started | not-run |"
new_row = "| blog-admin:pages/admin/AIOperations.tsx | /admin/ai-ops | migrated | verified |"
if old_row not in md:
    raise SystemExit("stale AIOperations migration row not found")
md = md.replace(old_row, new_row, 1)

lines = md.splitlines()
matched = False
for index, line in enumerate(lines):
    if line.startswith("- U04a is `implemented-ci-verified`:"):
        lines[index] = (
            "- U04a is `verified`: PR #211 completed independent Chromium rendered QA with "
            "87 U04a tests (80 four-viewport/light-dark matrix cases + 7 key interactions); "
            "the full durable browser gate passed 146/146 tests. Final browser artifact ID "
            "`10319540400`, digest `sha256:c380295786ccdf2f8d1d1bde0ce4785ab2ce3c5e10419586a55191c7ae6154d7`. "
            "The pass also fixed Workflow long-output containment and a real AISettings Symbol-key Proxy runtime failure without weakening existing contracts."
        )
        matched = True
        break
if not matched:
    raise SystemExit("stale U04a summary line not found")
md_path.write_text("\n".join(lines) + "\n")

data = json.loads(json_path.read_text())
updated_task = 0
updated_page = 0

def visit(value):
    global updated_task, updated_page
    if isinstance(value, dict):
        if "U04a" in value and isinstance(value["U04a"], dict):
            task = value["U04a"]
            if task.get("status") == "implemented-ci-verified":
                task["status"] = "verified"
                task["evidence"] = (
                    "canonical AI workspace composition; controlled dialogs; retired AI/Workflow CSS cleanup; "
                    "PR #211 Chromium rendered acceptance 87/87 U04a cases; standard CI and Images green"
                )
                task["browser"] = (
                    "verified: run 34761329896; 80 viewport/theme matrix cases plus 7 key interactions; "
                    "artifact 10319540400 sha256:c380295786ccdf2f8d1d1bde0ce4785ab2ce3c5e10419586a55191c7ae6154d7"
                )
                updated_task += 1
        if value.get("id") == "U04a" and value.get("status") == "implemented-ci-verified":
            value["status"] = "verified"
            updated_task += 1
        if value.get("id") == "blog-admin:pages/admin/AIOperations.tsx":
            if "status" in value:
                value["status"] = "migrated"
            if "migrationStatus" in value:
                value["migrationStatus"] = "migrated"
            if "visualCheck" in value:
                value["visualCheck"] = "verified"
            evidence = value.get("evidence")
            marker = "PR #211 Chromium U04a browser acceptance: 87/87 U04a cases"
            if isinstance(evidence, list) and marker not in evidence:
                evidence.append(marker)
            updated_page += 1
        for child in value.values():
            visit(child)
    elif isinstance(value, list):
        for child in value:
            visit(child)

visit(data)
if updated_task < 1:
    raise SystemExit("no U04a task status updated")
if updated_page != 1:
    raise SystemExit(f"expected exactly one AIOperations inventory entry, got {updated_page}")
json_path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n")
json.loads(json_path.read_text())
