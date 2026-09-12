from pathlib import Path

path = Path(__file__).resolve().parent / "tmp-media-http-migration.py"
text = path.read_text()
replacements = [
    (
        "!foundCommunityModeration || !foundTaxonomy || !foundSite || !foundPage",
        "!foundCommunityModeration || !foundPage || !foundTaxonomy || !foundSite",
    ),
    (
        "communityModeration=%v taxonomy=%v site=%v page=%v",
        "communityModeration=%v page=%v taxonomy=%v site=%v",
    ),
    (
        "foundCommunityModeration, foundTaxonomy, foundSite, foundPage",
        "foundCommunityModeration, foundPage, foundTaxonomy, foundSite",
    ),
]
for old, new in replacements:
    count = text.count(old)
    if count != 2:
        raise SystemExit(f"expected two route-test ordering markers, found {count}: {old!r}")
    text = text.replace(old, new)
path.write_text(text)
