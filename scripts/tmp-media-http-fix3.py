from pathlib import Path

path = Path(__file__).resolve().parent / "tmp-media-http-migration.py"
text = path.read_text()
replacements = [
    (
        "if !foundUpdate || !foundLike || !foundRelated || !foundAnalytics || !foundMedia || !foundHealth || !foundBlogSession || !foundCommunityModeration || !foundTaxonomy || !foundSite || !foundPage {",
        "if !foundUpdate || !foundLike || !foundRelated || !foundAnalytics || !foundMedia || !foundHealth || !foundBlogSession || !foundCommunityModeration || !foundPage || !foundTaxonomy || !foundSite {",
    ),
    (
        't.Fatalf(\\"expected routes, update=%v like=%v related=%v analytics=%v media=%v health=%v blogSession=%v communityModeration=%v taxonomy=%v site=%v page=%v\\", foundUpdate, foundLike, foundRelated, foundAnalytics, foundMedia, foundHealth, foundBlogSession, foundCommunityModeration, foundTaxonomy, foundSite, foundPage)',
        't.Fatalf(\\"expected routes, update=%v like=%v related=%v analytics=%v media=%v health=%v blogSession=%v communityModeration=%v page=%v taxonomy=%v site=%v\\", foundUpdate, foundLike, foundRelated, foundAnalytics, foundMedia, foundHealth, foundBlogSession, foundCommunityModeration, foundPage, foundTaxonomy, foundSite)',
    ),
]
for old, new in replacements:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"expected one route-test marker, found {count}: {old[:100]!r}")
    text = text.replace(old, new, 1)
path.write_text(text)
