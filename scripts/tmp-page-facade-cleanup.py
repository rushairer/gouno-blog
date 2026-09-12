from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]

TARGETS = {
    "blog-backend/internal/repository/page_repository.go",
    "blog-backend/internal/service/page_service.go",
    "blog-backend/internal/service/page_service_test.go",
    "blog-backend/internal/controller/page_controller.go",
    "blog-backend/internal/controller/page_controller_test.go",
}

PACKAGES = {
    "github.com/rushairer/blog-backend/internal/repository": (
        "repository",
        {"PageRepository", "NewPageRepository"},
    ),
    "github.com/rushairer/blog-backend/internal/service": (
        "service",
        {
            "PageService",
            "NewPageService",
            "ErrPageNotFound",
            "ErrInvalidSlug",
            "ErrReservedSlug",
            "ErrPageTitleEmpty",
            "ErrDuplicateSlug",
            "NormalizeSlug",
            "IsReservedSlug",
            "ValidateSlug",
        },
    ),
    "github.com/rushairer/blog-backend/internal/controller": (
        "controller",
        {"PageServiceInterface", "PageController", "CreatePageRequest", "NewPageController"},
    ),
}

failures = []
for path in sorted((ROOT / "blog-backend").rglob("*.go")):
    rel = path.relative_to(ROOT).as_posix()
    if rel in TARGETS:
        continue
    text = path.read_text()
    for package_path, (default_alias, symbols) in PACKAGES.items():
        import_pattern = re.compile(
            rf'^\s*(?:(?P<alias>[A-Za-z_][A-Za-z0-9_]*|\.)\s+)?"{re.escape(package_path)}"',
            re.MULTILINE,
        )
        for match in import_pattern.finditer(text):
            alias = match.group("alias") or default_alias
            if alias == "_":
                continue
            if alias == ".":
                failures.append(f"{rel}: dot-imports legacy package {package_path}; cannot prove Page facade is unused")
                continue
            symbol_pattern = re.compile(
                rf'\b{re.escape(alias)}\.({"|".join(sorted(map(re.escape, symbols)))})\b'
            )
            for symbol_match in symbol_pattern.finditer(text):
                failures.append(f"{rel}: still uses legacy {alias}.{symbol_match.group(1)}")

if failures:
    raise SystemExit("Page facade consumer proof failed:\n" + "\n".join(failures))

for rel in sorted(TARGETS):
    path = ROOT / rel
    if not path.exists():
        raise SystemExit(f"expected Page facade file is missing before cleanup: {rel}")
    path.unlink()

architecture = ROOT / "blog-backend/ARCHITECTURE.md"
text = architecture.read_text()
old = (
    "The `page` capability is canonical under `internal/page/{domain,repository,service,controller}`. "
    "The application composition root now constructs its repository and service directly from the capability packages, "
    "`WebRouterOptions.PageSvc` carries the canonical Page service, and active Page routes bind directly to the canonical Page controller. "
    "Feed generation, Agent approval handling, Blog Tools, and shared HTTP error mapping also depend on the canonical Page service or its sentinels. "
    "Legacy Page repository/service/controller symbols in the flat packages remain compatibility facades only and are a separate follow-up deletion boundary after repository-wide consumer proof. "
    "Root `internal/domain` Page aliases are tracked separately because cross-capability consumers still use them."
)
new = (
    "The `page` capability is canonical under `internal/page/{domain,repository,service,controller}`. "
    "The application composition root constructs its repository and service directly from the capability packages, "
    "`WebRouterOptions.PageSvc` carries the canonical Page service, and active Page routes bind directly to the canonical Page controller. "
    "Feed generation, Agent approval handling, Blog Tools, and shared HTTP error mapping also depend on the canonical Page service or its sentinels. "
    "The former flat Page repository/service/controller compatibility facades and their duplicate flat service/controller tests have been removed after repository-wide consumer proof and full `go test ./...` / `go vet ./...` verification. "
    "Root `internal/domain` Page aliases remain intentionally separate because cross-capability consumers still use those shared content-model symbols; they must not be moved or deleted merely for directory symmetry."
)
if text.count(old) != 1:
    raise SystemExit(f"expected exactly one Page architecture status paragraph, found {text.count(old)}")
architecture.write_text(text.replace(old, new, 1))
