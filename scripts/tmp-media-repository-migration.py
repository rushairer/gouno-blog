from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def replace_once(rel, old, new):
    path = ROOT / rel
    text = path.read_text()
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{rel}: expected exactly one marker, found {count}: {old!r}")
    path.write_text(text.replace(old, new, 1))


replace_once(
    "blog-backend/internal/repository/growth_repository.go",
    'import (\n\t"context"\n\t"database/sql"\n\t"errors"\n\n\t"github.com/lib/pq"\n\t"github.com/rushairer/blog-backend/internal/domain"\n)',
    'import (\n\t"context"\n\t"database/sql"\n\n\t"github.com/lib/pq"\n\t"github.com/rushairer/blog-backend/internal/domain"\n\tmediarepository "github.com/rushairer/blog-backend/internal/media/repository"\n)',
)
replace_once(
    "blog-backend/internal/repository/growth_repository.go",
    'type GrowthRepository struct {\n\tdb *sql.DB\n}\n\nfunc NewGrowthRepository(db *sql.DB) *GrowthRepository {\n\treturn &GrowthRepository{db: db}\n}',
    'type GrowthRepository struct {\n\tdb    *sql.DB\n\tmedia mediarepository.Repository\n}\n\nvar _ mediarepository.Repository = (*GrowthRepository)(nil)\n\nfunc NewGrowthRepository(db *sql.DB) *GrowthRepository {\n\treturn &GrowthRepository{db: db, media: mediarepository.New(db)}\n}',
)

path = ROOT / "blog-backend/internal/repository/growth_repository.go"
text = path.read_text()
start = text.find('func (r *GrowthRepository) CreateMedia')
end = text.find('func (r *GrowthRepository) RecordEvent')
if start < 0 or end < 0 or end <= start:
    raise SystemExit("growth_repository.go: media persistence block markers not found")
media_block = '''var ErrMediaInUse = mediarepository.ErrMediaInUse

func (r *GrowthRepository) CreateMedia(ctx context.Context, asset *domain.MediaAsset) error {
	return r.media.CreateMedia(ctx, asset)
}

func (r *GrowthRepository) GetMedia(ctx context.Context, id int64) (*domain.MediaAsset, error) {
	return r.media.GetMedia(ctx, id)
}

func (r *GrowthRepository) ListMedia(ctx context.Context, filter domain.MediaFilter) ([]*domain.MediaAsset, error) {
	return r.media.ListMedia(ctx, filter)
}

func (r *GrowthRepository) UpdateMediaAltText(ctx context.Context, id int64, altText string, updatedByPrincipalID *int64) (*domain.MediaAsset, error) {
	return r.media.UpdateMediaAltText(ctx, id, altText, updatedByPrincipalID)
}

func (r *GrowthRepository) DeleteMedia(ctx context.Context, id int64) (*domain.MediaAsset, error) {
	return r.media.DeleteMedia(ctx, id)
}

func (r *GrowthRepository) CountMediaReferences(ctx context.Context, id int64) (int64, error) {
	return r.media.CountMediaReferences(ctx, id)
}

func (r *GrowthRepository) ListMediaReferences(ctx context.Context, id int64) ([]*domain.MediaReference, error) {
	return r.media.ListMediaReferences(ctx, id)
}

'''
path.write_text(text[:start] + media_block + text[end:])

replace_once(
    "blog-backend/internal/repository/growth_repository_integration_test.go",
    '\n\t"github.com/rushairer/blog-backend/internal/domain"',
    '',
)
path = ROOT / "blog-backend/internal/repository/growth_repository_integration_test.go"
text = path.read_text()
start = text.find('\n\tasset := &domain.MediaAsset{')
end = text.find('\n\tif err := repo.RecordEvent')
if start < 0 or end < 0 or end <= start:
    raise SystemExit("growth_repository_integration_test.go: media test block markers not found")
path.write_text(text[:start] + '\n' + text[end:])

architecture = ROOT / "blog-backend/ARCHITECTURE.md"
text = architecture.read_text()
marker = "Root content models such as `domain.Category`, `domain.TagSummary`, and `domain.Post` are not moved merely for directory symmetry. Their model boundary must be decided from actual ownership and cross-capability usage before any later relocation."
addition = marker + "\n\nThe legacy flat `GrowthRepository` / `GrowthService` / `GrowthController` bucket is not promoted wholesale into a fake `growth` capability because it currently mixes post recommendations, post-version restore, media assets, and analytics. Decomposition follows real ownership. Media-asset persistence is now canonical under `internal/media/repository`; the legacy `GrowthRepository` retains media methods only as a compatibility delegate while Media service/controller/runtime ownership migrates in later stages. Post-version, recommendation, and analytics behavior remain in the flat Growth bucket until their own seams are established."
if text.count(marker) != 1:
    raise SystemExit(f"ARCHITECTURE.md: expected one insertion marker, found {text.count(marker)}")
architecture.write_text(text.replace(marker, addition, 1))
