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
    "blog-backend/router/web.go",
    '\t"github.com/rushairer/blog-backend/internal/media"\n\t"github.com/rushairer/blog-backend/internal/ratelimit"',
    '\t"github.com/rushairer/blog-backend/internal/media"\n\tpagecontroller "github.com/rushairer/blog-backend/internal/page/controller"\n\tpageservice "github.com/rushairer/blog-backend/internal/page/service"\n\t"github.com/rushairer/blog-backend/internal/ratelimit"',
)
replace_once(
    "blog-backend/router/web.go",
    '\tPageSvc            *service.PageService',
    '\tPageSvc            *pageservice.PageService',
)
replace_once(
    "blog-backend/router/web.go",
    '\tpageCtrl := controller.NewPageController(pageSvc)',
    '\tpageCtrl := pagecontroller.NewPageController(pageSvc)',
)

replace_once(
    "blog-backend/cmd/gouno/web.go",
    '\t"github.com/rushairer/blog-backend/internal/operations"\n\t"github.com/rushairer/blog-backend/internal/repository"',
    '\t"github.com/rushairer/blog-backend/internal/operations"\n\tpagerepository "github.com/rushairer/blog-backend/internal/page/repository"\n\tpageservice "github.com/rushairer/blog-backend/internal/page/service"\n\t"github.com/rushairer/blog-backend/internal/repository"',
)
replace_once(
    "blog-backend/cmd/gouno/web.go",
    '\tpageSvc := service.NewPageService(repository.NewPageRepository(cfg.DB))',
    '\tpageSvc := pageservice.NewPageService(pagerepository.NewPageRepository(cfg.DB))',
)

replace_once(
    "blog-backend/router/web_test.go",
    '\t"github.com/rushairer/blog-backend/internal/media"\n\t"github.com/rushairer/blog-backend/internal/repository"',
    '\t"github.com/rushairer/blog-backend/internal/media"\n\tpagerepository "github.com/rushairer/blog-backend/internal/page/repository"\n\tpageservice "github.com/rushairer/blog-backend/internal/page/service"\n\t"github.com/rushairer/blog-backend/internal/repository"',
)
replace_once(
    "blog-backend/router/web_test.go",
    '\t\tPageSvc:      service.NewPageService(repository.NewPageRepository(nil)),',
    '\t\tPageSvc:      pageservice.NewPageService(pagerepository.NewPageRepository(nil)),',
)
replace_once(
    "blog-backend/router/web_test.go",
    '\tfoundSite := false\n\tsiteHandler := ""',
    '\tfoundSite := false\n\tsiteHandler := ""\n\tfoundPage := false\n\tpageHandler := ""',
)
replace_once(
    "blog-backend/router/web_test.go",
    '\t\tif route.Method == "GET" && route.Path == "/api/categories" {\n\t\t\tfoundTaxonomy = true\n\t\t\ttaxonomyHandler = route.Handler\n\t\t}',
    '\t\tif route.Method == "GET" && route.Path == "/api/pages/nav" {\n\t\t\tfoundPage = true\n\t\t\tpageHandler = route.Handler\n\t\t}\n\t\tif route.Method == "GET" && route.Path == "/api/categories" {\n\t\t\tfoundTaxonomy = true\n\t\t\ttaxonomyHandler = route.Handler\n\t\t}',
)
replace_once(
    "blog-backend/router/web_test.go",
    '\tif !foundUpdate || !foundLike || !foundRelated || !foundAnalytics || !foundMedia || !foundHealth || !foundBlogSession || !foundCommunityModeration || !foundTaxonomy || !foundSite {\n\t\tt.Fatalf("expected routes, update=%v like=%v related=%v analytics=%v media=%v health=%v blogSession=%v communityModeration=%v taxonomy=%v site=%v", foundUpdate, foundLike, foundRelated, foundAnalytics, foundMedia, foundHealth, foundBlogSession, foundCommunityModeration, foundTaxonomy, foundSite)\n\t}',
    '\tif !foundUpdate || !foundLike || !foundRelated || !foundAnalytics || !foundMedia || !foundHealth || !foundBlogSession || !foundCommunityModeration || !foundPage || !foundTaxonomy || !foundSite {\n\t\tt.Fatalf("expected routes, update=%v like=%v related=%v analytics=%v media=%v health=%v blogSession=%v communityModeration=%v page=%v taxonomy=%v site=%v", foundUpdate, foundLike, foundRelated, foundAnalytics, foundMedia, foundHealth, foundBlogSession, foundCommunityModeration, foundPage, foundTaxonomy, foundSite)\n\t}',
)
replace_once(
    "blog-backend/router/web_test.go",
    '\tif !strings.Contains(taxonomyHandler, "internal/taxonomy/controller") {',
    '\tif !strings.Contains(pageHandler, "internal/page/controller") {\n\t\tt.Fatalf("pages/nav must be owned by canonical Page controller, handler=%q", pageHandler)\n\t}\n\tif !strings.Contains(taxonomyHandler, "internal/taxonomy/controller") {',
)

replace_once(
    "blog-backend/internal/controller/feed_controller.go",
    '\t"github.com/rushairer/blog-backend/internal/service"',
    '\tpageservice "github.com/rushairer/blog-backend/internal/page/service"',
)
replace_once(
    "blog-backend/internal/controller/feed_controller.go",
    '\tpageSvc      *service.PageService',
    '\tpageSvc      *pageservice.PageService',
)
replace_once(
    "blog-backend/internal/controller/feed_controller.go",
    'func NewFeedController(svc BlogService, pageSvc *service.PageService, siteSettings SiteSettingsReader) *FeedController {',
    'func NewFeedController(svc BlogService, pageSvc *pageservice.PageService, siteSettings SiteSettingsReader) *FeedController {',
)

replace_once(
    "blog-backend/internal/agent/approval.go",
    '\t"github.com/rushairer/blog-backend/internal/media"\n\t"github.com/rushairer/blog-backend/internal/repository"',
    '\t"github.com/rushairer/blog-backend/internal/media"\n\tpageservice "github.com/rushairer/blog-backend/internal/page/service"\n\t"github.com/rushairer/blog-backend/internal/repository"',
)
replace_once(
    "blog-backend/internal/agent/approval.go",
    '\tpages      *service.PageService',
    '\tpages      *pageservice.PageService',
)
replace_once(
    "blog-backend/internal/agent/approval.go",
    'func NewApprovalService(repo *repository.AgentRepository, posts *service.PostService, management *ManagementService, growth *service.GrowthService, store media.Store, pages *service.PageService) *ApprovalService {',
    'func NewApprovalService(repo *repository.AgentRepository, posts *service.PostService, management *ManagementService, growth *service.GrowthService, store media.Store, pages *pageservice.PageService) *ApprovalService {',
)
replace_once(
    "blog-backend/internal/agent/approval.go",
    'func (s *ApprovalService) SetPageService(pages *service.PageService) {',
    'func (s *ApprovalService) SetPageService(pages *pageservice.PageService) {',
)

replace_once(
    "blog-backend/internal/tool/blog_tools.go",
    '\t"github.com/rushairer/blog-backend/internal/knowledge"\n\t"github.com/rushairer/blog-backend/internal/service"',
    '\t"github.com/rushairer/blog-backend/internal/knowledge"\n\tpageservice "github.com/rushairer/blog-backend/internal/page/service"\n\t"github.com/rushairer/blog-backend/internal/service"',
)
replace_once(
    "blog-backend/internal/tool/blog_tools.go",
    '\tpages      *service.PageService',
    '\tpages      *pageservice.PageService',
)
replace_once(
    "blog-backend/internal/tool/blog_tools.go",
    'func NewBlogRegistry(posts *service.PostService, community communityModerationReader, growth *service.GrowthService, pages *service.PageService, knowledgeServices ...*knowledge.Service) *Registry {',
    'func NewBlogRegistry(posts *service.PostService, community communityModerationReader, growth *service.GrowthService, pages *pageservice.PageService, knowledgeServices ...*knowledge.Service) *Registry {',
)

replace_once(
    "blog-backend/internal/controllerutil/response.go",
    '\t"github.com/rushairer/blog-backend/internal/knowledge"\n\t"github.com/rushairer/blog-backend/internal/service"',
    '\t"github.com/rushairer/blog-backend/internal/knowledge"\n\tpageservice "github.com/rushairer/blog-backend/internal/page/service"\n\t"github.com/rushairer/blog-backend/internal/service"',
)
for old, new in [
    ("service.ErrPageNotFound", "pageservice.ErrPageNotFound"),
    ("service.ErrDuplicateSlug", "pageservice.ErrDuplicateSlug"),
    ("service.ErrReservedSlug", "pageservice.ErrReservedSlug"),
    ("service.ErrInvalidSlug", "pageservice.ErrInvalidSlug"),
    ("service.ErrPageTitleEmpty", "pageservice.ErrPageTitleEmpty"),
]:
    replace_once("blog-backend/internal/controllerutil/response.go", old, new)

replace_once(
    "blog-backend/ARCHITECTURE.md",
    "The `page` capability is the first fully migrated reference slice. Its canonical implementation lives under `internal/page/`; legacy Page symbols in the flat packages are temporary compatibility facades.",
    "The `page` capability is canonical under `internal/page/{domain,repository,service,controller}`. The application composition root now constructs its repository and service directly from the capability packages, `WebRouterOptions.PageSvc` carries the canonical Page service, and active Page routes bind directly to the canonical Page controller. Feed generation, Agent approval handling, Blog Tools, and shared HTTP error mapping also depend on the canonical Page service or its sentinels. Legacy Page repository/service/controller symbols in the flat packages remain compatibility facades only and are a separate follow-up deletion boundary after repository-wide consumer proof. Root `internal/domain` Page aliases are tracked separately because cross-capability consumers still use them.",
)
