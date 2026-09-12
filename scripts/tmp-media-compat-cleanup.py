from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]


def read(path):
    return (ROOT / path).read_text()


def write(path, text):
    (ROOT / path).write_text(text)


def replace_once(path, old, new):
    text = read(path)
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{path}: expected one marker, found {count}: {old[:120]!r}")
    write(path, text.replace(old, new, 1))


def regex_once(path, pattern, replacement, flags=0):
    text = read(path)
    new, count = re.subn(pattern, replacement, text, count=1, flags=flags)
    if count != 1:
        raise SystemExit(f"{path}: expected one regex match, found {count}: {pattern!r}")
    write(path, new)


repo = "blog-backend/internal/repository/growth_repository.go"
replace_once(repo, '\tmediarepository "github.com/rushairer/blog-backend/internal/media/repository"\n', '')
replace_once(
    repo,
    '''type GrowthRepository struct {\n\tdb    *sql.DB\n\tmedia mediarepository.Repository\n}\n\nvar _ mediarepository.Repository = (*GrowthRepository)(nil)\n\nfunc NewGrowthRepository(db *sql.DB) *GrowthRepository {\n\treturn &GrowthRepository{db: db, media: mediarepository.New(db)}\n}\n''',
    '''type GrowthRepository struct {\n\tdb *sql.DB\n}\n\nfunc NewGrowthRepository(db *sql.DB) *GrowthRepository {\n\treturn &GrowthRepository{db: db}\n}\n''',
)
regex_once(
    repo,
    r'\nvar ErrMediaInUse = mediarepository\.ErrMediaInUse\n\nfunc \(r \*GrowthRepository\) CreateMedia.*?(?=\nfunc \(r \*GrowthRepository\) RecordEvent)',
    '\n',
    re.S,
)

service = "blog-backend/internal/service/growth_service.go"
replace_once(service, '\tmediarepository "github.com/rushairer/blog-backend/internal/media/repository"\n', '')
replace_once(service, '\tmediaservice "github.com/rushairer/blog-backend/internal/media/service"\n', '')
replace_once(service, '\tmediarepository.Repository\n', '')
replace_once(
    service,
    '''var (\n\tErrMediaInUse          = mediaservice.ErrMediaInUse\n\tErrInvalidVersion      = errors.New("invalid version")\n\tErrInvalidMediaPayload = mediaservice.ErrInvalidMediaPayload\n\tErrInvalidMediaID      = mediaservice.ErrInvalidMediaID\n)\n\ntype GrowthService struct {\n\tstore GrowthStore\n\tmedia mediaservice.Service\n}\n\nfunc NewGrowthService(store GrowthStore) *GrowthService {\n\treturn &GrowthService{store: store, media: mediaservice.New(store)}\n}\n''',
    '''var ErrInvalidVersion = errors.New("invalid version")\n\ntype GrowthService struct {\n\tstore GrowthStore\n}\n\nfunc NewGrowthService(store GrowthStore) *GrowthService {\n\treturn &GrowthService{store: store}\n}\n''',
)
regex_once(
    service,
    r'\nfunc \(s \*GrowthService\) CreateMedia.*?\nfunc legacyMediaError\(err error\) error \{.*?\n\}\n(?=\nfunc \(s \*GrowthService\) RecordView)',
    '\n',
    re.S,
)

architecture = "blog-backend/ARCHITECTURE.md"
replace_once(
    architecture,
    'The legacy flat `GrowthRepository` / `GrowthService` / `GrowthController` bucket is not promoted wholesale into a fake `growth` capability because it currently mixes post recommendations, post-version restore, media assets, and analytics. Decomposition follows real ownership. Media-asset persistence, business behavior, and HTTP ownership are canonical under `internal/media/{repository,service,controller}`. Active Media routes use the canonical controller/service, SVG upload security lives with that HTTP adapter, shared HTTP error mapping recognizes canonical Media sentinels, and Agent generation/approval depend on narrow Media create/list contracts. The legacy `GrowthRepository` and `GrowthService` retain media methods only as compatibility delegates for a separate cleanup stage; the legacy service preserves its historical media-not-found mapping to `ErrPostNotFound` until those delegates are removed. Post-version, recommendation, and analytics behavior remain in the flat Growth bucket until their own seams are established.',
    'The legacy flat `GrowthRepository` / `GrowthService` / `GrowthController` bucket is not promoted wholesale into a fake `growth` capability because it mixes post recommendations, post-version restore, and analytics. Decomposition follows real ownership. Media-asset persistence, business behavior, and HTTP ownership are fully canonical under `internal/media/{repository,service,controller}`. Active Media routes use the canonical controller/service, SVG upload security lives with that HTTP adapter, shared HTTP error mapping recognizes canonical Media sentinels, and Agent generation/approval depend on narrow Media create/list contracts. The former GrowthRepository/GrowthService Media compatibility delegates and legacy Media error shims have been removed after full repository compilation proved no remaining consumers. Post-version, recommendation, and analytics behavior remain in the flat Growth bucket until their own seams are established.',
)
