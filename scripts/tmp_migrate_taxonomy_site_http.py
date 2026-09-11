from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    file_path = Path(path)
    text = file_path.read_text()
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{path}: expected exactly one marker, found {count}: {old!r}")
    file_path.write_text(text.replace(old, new, 1))


def replace_all_checked(path: str, replacements: dict[str, str]) -> None:
    file_path = Path(path)
    text = file_path.read_text()
    for old, new in replacements.items():
        count = text.count(old)
        if count == 0:
            raise SystemExit(f"{path}: missing marker: {old!r}")
        text = text.replace(old, new)
    file_path.write_text(text)


response = "blog-backend/internal/controllerutil/response.go"
replace_once(
    response,
    '\t"github.com/rushairer/blog-backend/internal/knowledge"\n\t"github.com/rushairer/blog-backend/internal/service"\n',
    '\t"github.com/rushairer/blog-backend/internal/knowledge"\n\tsiteservice "github.com/rushairer/blog-backend/internal/site/service"\n\t"github.com/rushairer/blog-backend/internal/service"\n\ttaxonomyservice "github.com/rushairer/blog-backend/internal/taxonomy/service"\n',
)
replace_all_checked(
    response,
    {
        "service.ErrCategoryNotFound": "taxonomyservice.ErrCategoryNotFound",
        "service.ErrCategorySlugInUse": "taxonomyservice.ErrCategorySlugInUse",
        "service.ErrCategoryNameRequired": "taxonomyservice.ErrCategoryNameRequired",
        "service.ErrInvalidCategoryID": "taxonomyservice.ErrInvalidCategoryID",
        "service.ErrInvalidTagPayload": "taxonomyservice.ErrInvalidTagPayload",
        "service.ErrInvalidSettings": "siteservice.ErrInvalidSettings",
        "service.ErrSettingValueTooLong": "siteservice.ErrSettingValueTooLong",
        "service.ErrSiteTitleEmpty": "siteservice.ErrSiteTitleEmpty",
        "service.ErrInvalidRSSURL": "siteservice.ErrInvalidRSSURL",
        "service.ErrInvalidGithubURL": "siteservice.ErrInvalidGithubURL",
    },
)
replace_once(
    response,
    "\t\terrors.Is(err, siteservice.ErrInvalidGithubURL),\n\t\terrors.Is(err, service.ErrBatchInvalidIDs),",
    "\t\terrors.Is(err, siteservice.ErrInvalidGithubURL),\n\t\terrors.Is(err, siteservice.ErrInvalidFaviconURL),\n\t\terrors.Is(err, service.ErrBatchInvalidIDs),",
)

feed = "blog-backend/internal/controller/feed_controller.go"
replace_once(feed, 'import (\n\t"encoding/xml"', 'import (\n\t"context"\n\t"encoding/xml"')
replace_once(
    feed,
    '''type FeedController struct {
\tsvc     BlogService
\tpageSvc *service.PageService
\tcatSvc  service.CategoryService
}

func NewFeedController(svc BlogService, pageSvc *service.PageService, catSvc service.CategoryService) *FeedController {
\treturn &FeedController{svc: svc, pageSvc: pageSvc, catSvc: catSvc}
}
''',
    '''type SiteSettingsReader interface {
\tGetSiteSettings(ctx context.Context) (map[string]string, error)
}

type FeedController struct {
\tsvc          BlogService
\tpageSvc      *service.PageService
\tsiteSettings SiteSettingsReader
}

func NewFeedController(svc BlogService, pageSvc *service.PageService, siteSettings SiteSettingsReader) *FeedController {
\treturn &FeedController{svc: svc, pageSvc: pageSvc, siteSettings: siteSettings}
}
''',
)
replace_all_checked(feed, {"ctrl.catSvc": "ctrl.siteSettings"})

router = "blog-backend/router/web.go"
replace_once(
    router,
    '\tcommunityservice "github.com/rushairer/blog-backend/internal/community/service"\n\t"github.com/rushairer/blog-backend/internal/controller"\n',
    '\tcommunityservice "github.com/rushairer/blog-backend/internal/community/service"\n\t"github.com/rushairer/blog-backend/internal/controller"\n\tsitecontroller "github.com/rushairer/blog-backend/internal/site/controller"\n\tsiteservice "github.com/rushairer/blog-backend/internal/site/service"\n\ttaxonomycontroller "github.com/rushairer/blog-backend/internal/taxonomy/controller"\n\ttaxonomyservice "github.com/rushairer/blog-backend/internal/taxonomy/service"\n',
)
replace_once(
    router,
    "\tCategorySvc        service.CategoryService\n",
    "\tTaxonomySvc        taxonomyservice.Service\n\tSiteSvc            siteservice.Service\n",
)
replace_once(
    router,
    "if opts.PostSvc == nil || opts.PageSvc == nil || opts.CategorySvc == nil || opts.CommunitySvc == nil || opts.GrowthSvc == nil {",
    "if opts.PostSvc == nil || opts.PageSvc == nil || opts.TaxonomySvc == nil || opts.SiteSvc == nil || opts.CommunitySvc == nil || opts.GrowthSvc == nil {",
)
replace_once(
    router,
    '''\tcatSvc := opts.CategorySvc
\tcontentCtrl := controller.NewContentController(catSvc)

\tfeedCtrl := controller.NewFeedController(postSvc, pageSvc, catSvc)
''',
    '''\ttaxonomySvc := opts.TaxonomySvc
\ttaxonomyCtrl := taxonomycontroller.New(taxonomySvc)

\tsiteSvc := opts.SiteSvc
\tsiteCtrl := sitecontroller.New(siteSvc)

\tfeedCtrl := controller.NewFeedController(postSvc, pageSvc, siteSvc)
''',
)
replace_all_checked(
    router,
    {
        "contentCtrl.GetSiteSettings": "siteCtrl.GetSiteSettings",
        "contentCtrl.UpdateSiteSettings": "siteCtrl.UpdateSiteSettings",
        "contentCtrl.": "taxonomyCtrl.",
    },
)
router_text = Path(router).read_text()
for forbidden in ("CategorySvc", "contentCtrl", "catSvc"):
    if forbidden in router_text:
        raise SystemExit(f"{router}: legacy runtime marker remains: {forbidden}")

cmd = "blog-backend/cmd/gouno/web.go"
replace_once(
    cmd,
    '\t"github.com/rushairer/blog-backend/internal/secretbox"\n\t"github.com/rushairer/blog-backend/internal/service"\n',
    '\t"github.com/rushairer/blog-backend/internal/secretbox"\n\tsiterepository "github.com/rushairer/blog-backend/internal/site/repository"\n\tsiteservice "github.com/rushairer/blog-backend/internal/site/service"\n\t"github.com/rushairer/blog-backend/internal/service"\n\ttaxonomyrepository "github.com/rushairer/blog-backend/internal/taxonomy/repository"\n\ttaxonomyservice "github.com/rushairer/blog-backend/internal/taxonomy/service"\n',
)
replace_once(
    cmd,
    "\tcatSvc := service.NewCategoryService(repository.NewCategoryRepository(cfg.DB))\n",
    "\ttaxonomySvc := taxonomyservice.New(taxonomyrepository.New(cfg.DB))\n\tsiteSvc := siteservice.New(siterepository.New(cfg.DB))\n",
)
replace_once(
    cmd,
    "\t\tPostSvc:            postSvc, PageSvc: pageSvc, CategorySvc: catSvc, CommunitySvc: communitySvc,\n",
    "\t\tPostSvc: postSvc, PageSvc: pageSvc, TaxonomySvc: taxonomySvc, SiteSvc: siteSvc, CommunitySvc: communitySvc,\n",
)
cmd_text = Path(cmd).read_text()
for forbidden in ("catSvc", "NewCategoryService", "NewCategoryRepository"):
    if forbidden in cmd_text:
        raise SystemExit(f"{cmd}: legacy composition marker remains: {forbidden}")

web_test = "blog-backend/router/web_test.go"
replace_once(
    web_test,
    '\t"github.com/rushairer/blog-backend/internal/service"\n',
    '\tsiterepository "github.com/rushairer/blog-backend/internal/site/repository"\n\tsiteservice "github.com/rushairer/blog-backend/internal/site/service"\n\t"github.com/rushairer/blog-backend/internal/service"\n\ttaxonomyrepository "github.com/rushairer/blog-backend/internal/taxonomy/repository"\n\ttaxonomyservice "github.com/rushairer/blog-backend/internal/taxonomy/service"\n',
)
replace_once(
    web_test,
    "\t\tCategorySvc:  service.NewCategoryService(repository.NewCategoryRepository(nil)),\n",
    "\t\tTaxonomySvc:  taxonomyservice.New(taxonomyrepository.New(nil)),\n\t\tSiteSvc:      siteservice.New(siterepository.New(nil)),\n",
)
replace_once(
    web_test,
    '''\tfoundCommunityModeration := false
\tcommunityModerationHandler := ""
''',
    '''\tfoundCommunityModeration := false
\tcommunityModerationHandler := ""
\tfoundTaxonomy := false
\ttaxonomyHandler := ""
\tfoundSite := false
\tsiteHandler := ""
''',
)
replace_once(
    web_test,
    '''\t\tif route.Method == "GET" && route.Path == "/api/posts/:slugOrID/comments/all" {
\t\t\tfoundCommunityModeration = true
\t\t\tcommunityModerationHandler = route.Handler
\t\t}
''',
    '''\t\tif route.Method == "GET" && route.Path == "/api/posts/:slugOrID/comments/all" {
\t\t\tfoundCommunityModeration = true
\t\t\tcommunityModerationHandler = route.Handler
\t\t}
\t\tif route.Method == "GET" && route.Path == "/api/categories" {
\t\t\tfoundTaxonomy = true
\t\t\ttaxonomyHandler = route.Handler
\t\t}
\t\tif route.Method == "GET" && route.Path == "/api/site" {
\t\t\tfoundSite = true
\t\t\tsiteHandler = route.Handler
\t\t}
''',
)
replace_once(
    web_test,
    '''\tif !foundUpdate || !foundLike || !foundRelated || !foundAnalytics || !foundMedia || !foundHealth || !foundBlogSession || !foundCommunityModeration {
\t\tt.Fatalf("expected routes, update=%v like=%v related=%v analytics=%v media=%v health=%v blogSession=%v communityModeration=%v", foundUpdate, foundLike, foundRelated, foundAnalytics, foundMedia, foundHealth, foundBlogSession, foundCommunityModeration)
\t}
''',
    '''\tif !foundUpdate || !foundLike || !foundRelated || !foundAnalytics || !foundMedia || !foundHealth || !foundBlogSession || !foundCommunityModeration || !foundTaxonomy || !foundSite {
\t\tt.Fatalf("expected routes, update=%v like=%v related=%v analytics=%v media=%v health=%v blogSession=%v communityModeration=%v taxonomy=%v site=%v", foundUpdate, foundLike, foundRelated, foundAnalytics, foundMedia, foundHealth, foundBlogSession, foundCommunityModeration, foundTaxonomy, foundSite)
\t}
''',
)
replace_once(
    web_test,
    '''\tif !strings.Contains(communityModerationHandler, "internal/community/controller") {
\t\tt.Fatalf("comments/all must be owned by canonical Community controller, handler=%q", communityModerationHandler)
\t}
''',
    '''\tif !strings.Contains(communityModerationHandler, "internal/community/controller") {
\t\tt.Fatalf("comments/all must be owned by canonical Community controller, handler=%q", communityModerationHandler)
\t}
\tif !strings.Contains(taxonomyHandler, "internal/taxonomy/controller") {
\t\tt.Fatalf("categories must be owned by canonical Taxonomy controller, handler=%q", taxonomyHandler)
\t}
\tif !strings.Contains(siteHandler, "internal/site/controller") {
\t\tt.Fatalf("site settings must be owned by canonical Site controller, handler=%q", siteHandler)
\t}
''',
)

print("taxonomy/site HTTP ownership transform completed")
