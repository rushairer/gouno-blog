from pathlib import Path

path = Path(__file__).resolve().parent / "tmp-media-http-migration.py"
text = path.read_text()
old = """    '\\t\\terrors.Is(err, taxonomyservice.ErrCategoryNotFound),\\n\\t\\terrors.Is(err, service.ErrPostNotFound),',
    '\\t\\terrors.Is(err, taxonomyservice.ErrCategoryNotFound),\\n\\t\\terrors.Is(err, mediaservice.ErrMediaNotFound),\\n\\t\\terrors.Is(err, service.ErrPostNotFound),',
"""
new = """    '\\t\\terrors.Is(err, taxonomyservice.ErrCategoryNotFound),\\n\\t\\terrors.Is(err, service.ErrPageNotFound),',
    '\\t\\terrors.Is(err, taxonomyservice.ErrCategoryNotFound),\\n\\t\\terrors.Is(err, mediaservice.ErrMediaNotFound),\\n\\t\\terrors.Is(err, service.ErrPageNotFound),',
"""
count = text.count(old)
if count != 1:
    raise SystemExit(f"expected one error-map marker block, found {count}")
path.write_text(text.replace(old, new, 1))
