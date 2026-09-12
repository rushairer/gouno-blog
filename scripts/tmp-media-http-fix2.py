from pathlib import Path

path = Path(__file__).resolve().parent / "tmp-media-http-migration.py"
text = path.read_text()
old = "service.ErrPageNotFound"
count = text.count(old)
if count != 2:
    raise SystemExit(f"expected exactly two Page error markers, found {count}")
path.write_text(text.replace(old, "pageservice.ErrPageNotFound"))
