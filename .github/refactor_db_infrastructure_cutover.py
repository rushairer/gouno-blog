from pathlib import Path


def replace_exact(path: str, old: str, new: str, expected: int = 1) -> None:
    p = Path(path)
    text = p.read_text()
    count = text.count(old)
    if count != expected:
        raise SystemExit(f"{path}: expected {expected} occurrences of {old!r}, found {count}")
    p.write_text(text.replace(old, new))


# Composition root: construct canonical transaction infrastructure directly.
replace_exact(
    "blog-backend/cmd/gouno/web.go",
    '"github.com/rushairer/blog-backend/internal/controller"\n\t"github.com/rushairer/blog-backend/internal/knowledge"',
    '"github.com/rushairer/blog-backend/internal/controller"\n\t"github.com/rushairer/blog-backend/internal/dbtx"\n\t"github.com/rushairer/blog-backend/internal/knowledge"',
)
replace_exact(
    "blog-backend/cmd/gouno/web.go",
    "transactor := repository.NewTransactor(cfg.DB, cfg.Logger)",
    "transactor := dbtx.NewTransactor(cfg.DB, cfg.Logger)",
)

# Knowledge: shared transactions are infrastructure, not repository ownership.
replace_exact(
    "blog-backend/internal/knowledge/service.go",
    '"github.com/rushairer/blog-backend/internal/provider"\n\t"github.com/rushairer/blog-backend/internal/repository"',
    '"github.com/rushairer/blog-backend/internal/dbtx"\n\t"github.com/rushairer/blog-backend/internal/provider"',
)
replace_exact(
    "blog-backend/internal/knowledge/service.go",
    "*repository.Transactor",
    "*dbtx.Transactor",
    expected=2,
)

# Operations: direct dbtx dependency and retire the already-unused aggregate facade.
replace_exact(
    "blog-backend/internal/operations/service.go",
    '"github.com/rushairer/blog-backend/internal/domain"\n\tpostservice "github.com/rushairer/blog-backend/internal/post/service"\n\t"github.com/rushairer/blog-backend/internal/repository"',
    '"github.com/rushairer/blog-backend/internal/dbtx"\n\t"github.com/rushairer/blog-backend/internal/domain"\n\tpostservice "github.com/rushairer/blog-backend/internal/post/service"',
)
replace_exact(
    "blog-backend/internal/operations/service.go",
    "*repository.Transactor",
    "*dbtx.Transactor",
    expected=2,
)
replace_exact(
    "blog-backend/internal/operations/service.go",
    '// ConfigureGovernance keeps the transitional flat AgentRepository call shape\n// while composition migrates to canonical Run and Approval repositories.\nfunc (s *Service) ConfigureGovernance(repo *repository.AgentRepository, posts *postservice.PostService) {\n\ts.ConfigureGovernanceRepositories(repo, repo, posts)\n}\n\n',
    "",
)
replace_exact(
    "blog-backend/internal/operations/service_test.go",
    '"github.com/rushairer/blog-backend/internal/domain"\n\t"github.com/rushairer/blog-backend/internal/repository"',
    '"github.com/rushairer/blog-backend/internal/dbtx"\n\t"github.com/rushairer/blog-backend/internal/domain"',
)
replace_exact(
    "blog-backend/internal/operations/service_test.go",
    "*repository.Transactor",
    "*dbtx.Transactor",
)
replace_exact(
    "blog-backend/internal/operations/service_test.go",
    "repository.NewTransactor(db, nil)",
    "dbtx.NewTransactor(db, nil)",
)

# Workflow: remove both shared-infrastructure reasons for importing flat repository.
replace_exact(
    "blog-backend/internal/workflow/service.go",
    'agentservice "github.com/rushairer/blog-backend/internal/agent"\n\t"github.com/rushairer/blog-backend/internal/domain"\n\t"github.com/rushairer/blog-backend/internal/repository"',
    'agentservice "github.com/rushairer/blog-backend/internal/agent"\n\t"github.com/rushairer/blog-backend/internal/dberror"\n\t"github.com/rushairer/blog-backend/internal/dbtx"\n\t"github.com/rushairer/blog-backend/internal/domain"',
)
replace_exact(
    "blog-backend/internal/workflow/service.go",
    "*repository.Transactor",
    "*dbtx.Transactor",
    expected=2,
)
replace_exact(
    "blog-backend/internal/workflow/service.go",
    "repository.IsConstraintError(err)",
    "dberror.IsConstraintError(err)",
)

# Agent still has real flat aggregate dependencies, but generic SQL classification does not belong there.
replace_exact(
    "blog-backend/internal/agent/management.go",
    '"github.com/robfig/cron/v3"\n\t"github.com/rushairer/blog-backend/internal/domain"',
    '"github.com/robfig/cron/v3"\n\t"github.com/rushairer/blog-backend/internal/dberror"\n\t"github.com/rushairer/blog-backend/internal/domain"',
)
replace_exact(
    "blog-backend/internal/agent/management.go",
    "repository.IsConstraintError",
    "dberror.IsConstraintError",
    expected=2,
)
replace_exact(
    "blog-backend/internal/agent/runner.go",
    '"github.com/rushairer/blog-backend/internal/domain"',
    '"github.com/rushairer/blog-backend/internal/dberror"\n\t"github.com/rushairer/blog-backend/internal/domain"',
)
replace_exact(
    "blog-backend/internal/agent/runner.go",
    "repository.IsConstraintError",
    "dberror.IsConstraintError",
)

# Stable shared DB error classification. The old WrapNotFound helper had zero consumers.
dberror = Path("blog-backend/internal/dberror")
dberror.mkdir(parents=True, exist_ok=True)
(dberror / "errors.go").write_text('''package dberror

import "errors"

// IsConstraintError classifies PostgreSQL integrity-constraint failures without
// coupling business capabilities to the transitional flat repository package.
func IsConstraintError(err error) bool {
\tif err == nil {
\t\treturn false
\t}
\tvar target interface{ SQLState() string }
\treturn errors.As(err, &target) && (target.SQLState() == "23505" || target.SQLState() == "23503" || target.SQLState() == "23514")
}
''')
(dberror / "errors_test.go").write_text('''package dberror

import (
\t"fmt"
\t"testing"
)

type sqlStateError string

func (e sqlStateError) Error() string    { return string(e) }
func (e sqlStateError) SQLState() string { return string(e) }

func TestIsConstraintError(t *testing.T) {
\tfor _, code := range []string{"23505", "23503", "23514"} {
\t\tt.Run(code, func(t *testing.T) {
\t\t\tif !IsConstraintError(fmt.Errorf("wrapped: %w", sqlStateError(code))) {
\t\t\t\tt.Fatalf("expected SQLSTATE %s to be classified as a constraint error", code)
\t\t\t}
\t\t})
\t}
\tif IsConstraintError(sqlStateError("22001")) {
\t\tt.Fatal("non-constraint SQLSTATE must not be classified as a constraint error")
\t}
\tif IsConstraintError(nil) {
\t\tt.Fatal("nil must not be classified as a constraint error")
\t}
}
''')

sql_helpers = Path("blog-backend/internal/repository/sql_errors.go")
if not sql_helpers.exists():
    raise SystemExit("expected transitional repository/sql_errors.go to exist")
sql_helpers.unlink()

# Transactor compatibility now has one explicit blocker: Connector Module Hold.
replace_exact(
    "blog-backend/internal/repository/transaction.go",
    '// Transactor is kept as a compatibility alias while capability services move\n// their imports to the shared dbtx infrastructure package.',
    '// Transactor is retained only for the Connector Module Hold. All non-Connector\n// capabilities and the composition root depend on internal/dbtx directly.\n// Remove this alias when the hold is explicitly lifted and Connector is cut over.',
)

# Correct documentation drift: internal/service has already been retired.
replace_exact(
    "AGENTS.md",
    '- `blog-backend/internal/domain`, `internal/repository`, `internal/service`, and `internal/controller` are transitional flat-layer migration buckets. Do not add new business ownership to them when a capability-local home exists or can be introduced coherently.',
    '- `blog-backend/internal/service` has been retired. `internal/domain` remains a deliberate shared-model migration boundary, while `internal/repository` and `internal/controller` are transitional flat-layer migration buckets. Do not add new business ownership to them when a capability-local home exists or can be introduced coherently.',
)
replace_exact(
    "blog-backend/README.md",
    'The historical global `internal/domain`, `internal/repository`, `internal/service`, and `internal/controller` directories are transitional migration buckets. Existing capabilities are migrated incrementally; new business ownership should prefer capability-local packages.',
    'The historical global `internal/service` bucket has already been retired. `internal/domain` remains a deliberate shared-model migration boundary, while `internal/repository` and `internal/controller` are transitional migration buckets. Existing capabilities are migrated incrementally; new business ownership should prefer capability-local packages.',
)
replace_exact(
    "blog-backend/README.md",
    '历史上的全局 `internal/domain`、`internal/repository`、`internal/service`、`internal/controller` 目前属于渐进迁移目录。已有代码按完整 Capability 分批迁移；新的业务 ownership 应优先进入 Capability 自己的目录。',
    '历史上的全局 `internal/service` 已经退役。`internal/domain` 仍是有意保留的共享模型迁移边界，`internal/repository` 与 `internal/controller` 则是渐进迁移目录。已有代码按完整 Capability 分批迁移；新的业务 ownership 应优先进入 Capability 自己的目录。',
)
replace_exact(
    "blog-backend/ARCHITECTURE.md",
    '''The following directories are legacy migration buckets:

```text
internal/domain/
internal/repository/
internal/service/
internal/controller/
```

Existing code may remain there while it is migrated in coherent capability slices. New business features MUST NOT add new ownership to these flat buckets unless a migration constraint is documented in the same change.''',
    '''The remaining legacy migration boundaries are:

```text
internal/domain/       # deliberate shared-model boundary; classify before moving
internal/repository/   # transitional repository/facade bucket
internal/controller/   # transitional HTTP/controller bucket
```

The former `internal/service/` bucket has been retired. Existing code may remain in the boundaries above only while it is migrated in coherent capability slices. New business features MUST NOT add new ownership to these flat buckets unless a migration constraint is documented in the same change.

The live ownership, dependency, transaction, compatibility-facade, and removal-condition inventory is maintained in [ARCHITECTURE_CONVERGENCE.md](./ARCHITECTURE_CONVERGENCE.md). Treat that map as the migration Source of Truth and update it with every architecture slice.''',
)

# Fail closed on the intended result. Connector is explicitly excluded from this slice.
offenders = []
for path in Path("blog-backend").rglob("*.go"):
    body = path.read_text()
    rel = path.as_posix()
    connector_or_alias = rel.startswith("blog-backend/internal/connector/") or rel == "blog-backend/internal/repository/transaction.go"
    if "repository.Transactor" in body and not connector_or_alias:
        offenders.append(f"repository.Transactor: {rel}")
    if "repository.NewTransactor" in body and not connector_or_alias:
        offenders.append(f"repository.NewTransactor: {rel}")
    if "repository.IsConstraintError" in body:
        offenders.append(f"repository.IsConstraintError: {rel}")
if offenders:
    raise SystemExit("unexpected shared-infrastructure consumers remain:\n" + "\n".join(offenders))
if "func (s *Service) ConfigureGovernance(" in Path("blog-backend/internal/operations/service.go").read_text():
    raise SystemExit("dead Operations aggregate governance facade remains")
if Path("blog-backend/internal/repository/sql_errors.go").exists():
    raise SystemExit("flat repository SQL helper remains")
if not Path("blog-backend/ARCHITECTURE_CONVERGENCE.md").exists():
    raise SystemExit("architecture convergence map is missing")
