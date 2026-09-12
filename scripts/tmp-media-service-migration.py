from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
architecture = ROOT / "blog-backend/ARCHITECTURE.md"
text = architecture.read_text()
old = (
    "The legacy flat `GrowthRepository` / `GrowthService` / `GrowthController` bucket is not promoted wholesale into a fake `growth` capability because it currently mixes post recommendations, post-version restore, media assets, and analytics. Decomposition follows real ownership. Media-asset persistence is now canonical under `internal/media/repository`; the legacy `GrowthRepository` retains media methods only as a compatibility delegate while Media service/controller/runtime ownership migrates in later stages. Post-version, recommendation, and analytics behavior remain in the flat Growth bucket until their own seams are established."
)
new = (
    "The legacy flat `GrowthRepository` / `GrowthService` / `GrowthController` bucket is not promoted wholesale into a fake `growth` capability because it currently mixes post recommendations, post-version restore, media assets, and analytics. Decomposition follows real ownership. Media-asset persistence and business behavior are now canonical under `internal/media/repository` and `internal/media/service`; the legacy `GrowthRepository` and `GrowthService` retain media methods only as compatibility delegates while Media controller/runtime ownership migrates in a later stage. The legacy service preserves its historical media-not-found mapping to `ErrPostNotFound` until active consumers move to the canonical Media service. Post-version, recommendation, and analytics behavior remain in the flat Growth bucket until their own seams are established."
)
if text.count(old) != 1:
    raise SystemExit(f"ARCHITECTURE.md: expected one Media ownership paragraph, found {text.count(old)}")
architecture.write_text(text.replace(old, new, 1))
