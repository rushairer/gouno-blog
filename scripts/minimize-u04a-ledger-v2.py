from pathlib import Path
import json
import re
import subprocess

text = subprocess.check_output([
    "git", "show", "c1b0ef722670ae7c0ec9c86967982d5e2ed83c34:docs/ui-redesign/migration.json"
], text=True)

m = re.search(r'(      "U04a": \{\n)(.*?)(\n      \},)', text, re.S)
if not m:
    raise SystemExit("U04a block not found")
block = m.group(2)
if '"status": "implemented-ci-verified"' not in block:
    raise SystemExit("stale U04a status not found")
block = block.replace('"status": "implemented-ci-verified"', '"status": "verified"', 1)
block = re.sub(r'"evidence": "[^"]*"', '"evidence": "PR #211 Chromium rendered acceptance: 87/87 U04a cases; standard CI and Images green"', block, count=1)
block = re.sub(r'"browser": "[^"]*"', '"browser": "verified: run 34761329896; artifact 10319540400 sha256:c380295786ccdf2f8d1d1bde0ce4785ab2ce3c5e10419586a55191c7ae6154d7"', block, count=1)
text = text[:m.start(2)] + block + text[m.end(2):]

m = re.search(r'(    \{\n      "id": "blog-admin:pages/admin/AIOperations\.tsx",\n)(.*?)(\n    \},)', text, re.S)
if not m:
    raise SystemExit("AIOperations entry not found")
body = m.group(2)
if '"implementation": "not-started"' not in body or '"verification": "not-run"' not in body:
    raise SystemExit("stale AIOperations implementation/verification fields not found")
body = body.replace('"implementation": "not-started"', '"implementation": "migrated"', 1)
body = body.replace('"verification": "not-run"', '"verification": "verified"', 1)
text = text[:m.start(2)] + body + text[m.end(2):]

json.loads(text)
Path("docs/ui-redesign/migration.json").write_text(text)
