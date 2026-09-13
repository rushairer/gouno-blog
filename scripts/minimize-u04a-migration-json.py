from pathlib import Path
import json
import re
import subprocess

base = subprocess.check_output([
    "git", "show", "c1b0ef722670ae7c0ec9c86967982d5e2ed83c34:docs/ui-redesign/migration.json"
], text=True)

u04a = re.compile(r'(      "U04a": \{\n)(.*?)(\n      \},)', re.S)
match = u04a.search(base)
if not match:
    raise SystemExit("U04a block not found")
block = match.group(2)
block = block.replace('"status": "implemented-ci-verified"', '"status": "verified"', 1)
block = re.sub(
    r'"evidence": "[^"]*"',
    '"evidence": "PR #211 Chromium rendered acceptance: 87/87 U04a cases; standard CI and Images green"',
    block,
    count=1,
)
block = re.sub(
    r'"browser": "[^"]*"',
    '"browser": "verified: run 34761329896; artifact 10319540400; sha256:c380295786ccdf2f8d1d1bde0ce4785ab2ce3c5e10419586a55191c7ae6154d7"',
    block,
    count=1,
)
text = base[:match.start(2)] + block + base[match.end(2):]

entry_re = re.compile(
    r'(    \{\n      "id": "blog-admin:pages/admin/AIOperations\.tsx",\n)(.*?)(\n    \},)',
    re.S,
)
entry = entry_re.search(text)
if not entry:
    raise SystemExit("AIOperations entry not found")
body = entry.group(2)
body, n1 = re.subn(r'"status": "not-started"', '"status": "migrated"', body, count=1)
body, n2 = re.subn(r'"visualCheck": "not-run"', '"visualCheck": "verified"', body, count=1)
if n1 != 1 or n2 != 1:
    raise SystemExit(f"unexpected AIOperations fields: status={n1} visualCheck={n2}")
text = text[:entry.start(2)] + body + text[entry.end(2):]

json.loads(text)
Path("docs/ui-redesign/migration.json").write_text(text)
