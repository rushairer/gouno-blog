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
        raise SystemExit(f"{path}: expected one marker, found {count}: {old[:100]!r}")
    write(path, text.replace(old, new, 1))


def regex_once(path, pattern, replacement, flags=0):
    text = read(path)
    new, count = re.subn(pattern, replacement, text, count=1, flags=flags)
    if count != 1:
        raise SystemExit(f"{path}: regex expected one match, found {count}: {pattern!r}")
    write(path, new)


# GrowthController stops owning Media HTTP/upload behavior.
growth = "blog-backend/internal/controller/growth_controller.go"
for line in [
    '\t"crypto/rand"\n',
    '\t"encoding/hex"\n',
    '\t"errors"\n',
    '\t"mime/multipart"\n',
    '\t"strings"\n',
    '\t"github.com/rushairer/blog-backend/internal/media"\n',
    '\t"go.uber.org/zap"\n',
]:
    text = read(growth)
    if text.count(line) != 1:
        raise SystemExit(f"{growth}: import marker count={text.count(line)} for {line!r}")
    write(growth, text.replace(line, "", 1))

regex_once(
    growth,
    r'const maxMediaSize = 10 << 20\n\nvar allowedMediaTypes = map\[string\]string\{.*?\n\}\n\n',
    '',
    re.S,
)
replace_once(
    growth,
    '''type GrowthController struct {\n\tgrowth      *service.GrowthService\n\tposts       *service.PostService\n\tcommunity   publishedPostResolver\n\tmedia       media.Store\n\tlogger      *zap.Logger\n\tpostPolicy  access.PostPolicy\n\tmediaPolicy access.MediaPolicy\n}\n\nfunc NewGrowthController(growth *service.GrowthService, posts *service.PostService, community publishedPostResolver, store media.Store, logger *zap.Logger) *GrowthController {\n\tif logger == nil {\n\t\tlogger = zap.L()\n\t}\n\treturn &GrowthController{growth: growth, posts: posts, community: community, media: store, logger: logger}\n}\n''',
    '''type GrowthController struct {\n\tgrowth     *service.GrowthService\n\tposts      *service.PostService\n\tcommunity  publishedPostResolver\n\tpostPolicy access.PostPolicy\n}\n\nfunc NewGrowthController(growth *service.GrowthService, posts *service.PostService, community publishedPostResolver) *GrowthController {\n\treturn &GrowthController{growth: growth, posts: posts, community: community}\n}\n''',
)
regex_once(
    growth,
    r'func \(ctrl \*GrowthController\) ListMedia\(c \*gin\.Context\) \{.*?(?=func \(ctrl \*GrowthController\) Analytics\(c \*gin\.Context\))',
    '',
    re.S,
)
regex_once(growth, r'\nfunc validateMedia\(header \*multipart\.FileHeader\).*\Z', '\n', re.S)

# SVG upload validation is part of the Media HTTP adapter, not the flat controller bucket.
for path in [
    ROOT / "blog-backend/internal/controller/svg_security.go",
    ROOT / "blog-backend/internal/controller/svg_security_test.go",
]:
    if not path.exists():
        raise SystemExit(f"missing legacy SVG file: {path}")
    path.unlink()

# Shared HTTP error mapping understands canonical Media service errors.
response = "blog-backend/internal/controllerutil/response.go"
replace_once(
    response,
    '\t"github.com/rushairer/blog-backend/internal/knowledge"\n',
    '\t"github.com/rushairer/blog-backend/internal/knowledge"\n\tmediaservice "github.com/rushairer/blog-backend/internal/media/service"\n',
)
replace_once(
    response,
    '\t\terrors.Is(err, taxonomyservice.ErrCategoryNotFound),\n\t\terrors.Is(err, service.ErrPostNotFound),',
    '\t\terrors.Is(err, taxonomyservice.ErrCategoryNotFound),\n\t\terrors.Is(err, mediaservice.ErrMediaNotFound),\n\t\terrors.Is(err, service.ErrPostNotFound),',
)
replace_once(response, '\t\terrors.Is(err, service.ErrMediaInUse),', '\t\terrors.Is(err, mediaservice.ErrMediaInUse),')
replace_once(response, '\t\terrors.Is(err, service.ErrInvalidMediaPayload),', '\t\terrors.Is(err, mediaservice.ErrInvalidMediaPayload),')
replace_once(response, '\t\terrors.Is(err, service.ErrInvalidMediaID),', '\t\terrors.Is(err, mediaservice.ErrInvalidMediaID),')

# Router owns an explicit Media service/controller dependency.
router = "blog-backend/router/web.go"
replace_once(
    router,
    '\t"github.com/rushairer/blog-backend/internal/media"\n',
    '\t"github.com/rushairer/blog-backend/internal/media"\n\tmediacontroller "github.com/rushairer/blog-backend/internal/media/controller"\n\tmediaservice "github.com/rushairer/blog-backend/internal/media/service"\n',
)
replace_once(
    router,
    '\tPageSvc            *pageservice.PageService\n\tTaxonomySvc        taxonomyservice.Service',
    '\tPageSvc            *pageservice.PageService\n\tMediaSvc           mediaservice.Service\n\tTaxonomySvc        taxonomyservice.Service',
)
replace_once(
    router,
    'if opts.PostSvc == nil || opts.PageSvc == nil || opts.TaxonomySvc == nil || opts.SiteSvc == nil || opts.CommunitySvc == nil || opts.GrowthSvc == nil {',
    'if opts.PostSvc == nil || opts.PageSvc == nil || opts.MediaSvc == nil || opts.TaxonomySvc == nil || opts.SiteSvc == nil || opts.CommunitySvc == nil || opts.GrowthSvc == nil {',
)
replace_once(
    router,
    '\tgrowthSvc := opts.GrowthSvc\n\tgrowthCtrl := controller.NewGrowthController(growthSvc, postSvc, communitySvc, opts.MediaStore, opts.Logger)\n',
    '\tmediaCtrl := mediacontroller.New(opts.MediaSvc, opts.MediaStore)\n\n\tgrowthSvc := opts.GrowthSvc\n\tgrowthCtrl := controller.NewGrowthController(growthSvc, postSvc, communitySvc)\n',
)
replace_once(router, 'author.GET("/admin/media", growthCtrl.ListMedia)', 'author.GET("/admin/media", mediaCtrl.List)')
replace_once(router, 'author.POST("/admin/media", growthCtrl.UploadMedia)', 'author.POST("/admin/media", mediaCtrl.Upload)')
replace_once(router, 'author.PUT("/admin/media/:id", growthCtrl.UpdateMedia)', 'author.PUT("/admin/media/:id", mediaCtrl.Update)')
replace_once(router, 'author.GET("/admin/media/:id/references", growthCtrl.MediaReferences)', 'author.GET("/admin/media/:id/references", mediaCtrl.References)')
replace_once(router, 'author.DELETE("/admin/media/:id", growthCtrl.DeleteMedia)', 'author.DELETE("/admin/media/:id", mediaCtrl.Delete)')

# Application composition constructs canonical Media persistence/service explicitly.
web = "blog-backend/cmd/gouno/web.go"
replace_once(
    web,
    '\t"github.com/rushairer/blog-backend/internal/media"\n',
    '\t"github.com/rushairer/blog-backend/internal/media"\n\tmediarepository "github.com/rushairer/blog-backend/internal/media/repository"\n\tmediaservice "github.com/rushairer/blog-backend/internal/media/service"\n',
)
replace_once(
    web,
    '\tcommunitySvc := communityservice.NewCommunityService(communityrepository.NewCommunityRepository(cfg.DB), postRepo)\n\tgrowthSvc := service.NewGrowthService(repository.NewGrowthRepository(cfg.DB))\n',
    '\tcommunitySvc := communityservice.NewCommunityService(communityrepository.NewCommunityRepository(cfg.DB), postRepo)\n\tmediaSvc := mediaservice.New(mediarepository.New(cfg.DB))\n\tgrowthSvc := service.NewGrowthService(repository.NewGrowthRepository(cfg.DB))\n',
)
replace_once(
    web,
    'generation := agentservice.NewGenerationService(agentRepo, management, growthSvc, mediaStore)\n\t\tapprovals := agentservice.NewApprovalService(agentRepo, postSvc, management, growthSvc, mediaStore, pageSvc)',
    'generation := agentservice.NewGenerationService(agentRepo, management, mediaSvc, mediaStore)\n\t\tapprovals := agentservice.NewApprovalService(agentRepo, postSvc, management, growthSvc, mediaSvc, mediaStore, pageSvc)',
)
replace_once(
    web,
    '\t\tPostSvc:            postSvc, PageSvc: pageSvc, TaxonomySvc: taxonomySvc, SiteSvc: siteSvc, CommunitySvc: communitySvc,\n',
    '\t\tPostSvc:            postSvc, PageSvc: pageSvc, MediaSvc: mediaSvc, TaxonomySvc: taxonomySvc, SiteSvc: siteSvc, CommunitySvc: communitySvc,\n',
)

# Generation depends only on Media creation, not the mixed Growth service.
generation = "blog-backend/internal/agent/generation.go"
replace_once(generation, '\t"github.com/rushairer/blog-backend/internal/service"\n', '')
replace_once(
    generation,
    '''type GenerationService struct {\n\trepo       *repository.AgentRepository\n\tmanagement *ManagementService\n\tgrowth     *service.GrowthService\n\tmedia      media.Store\n}\n''',
    '''type mediaCreator interface {\n\tCreateMedia(context.Context, *domain.MediaAsset) error\n}\n\ntype GenerationService struct {\n\trepo        *repository.AgentRepository\n\tmanagement  *ManagementService\n\tmediaAssets mediaCreator\n\tmedia       media.Store\n}\n''',
)
replace_once(
    generation,
    'func NewGenerationService(repo *repository.AgentRepository, management *ManagementService, growth *service.GrowthService, store media.Store) *GenerationService {\n\treturn &GenerationService{repo: repo, management: management, growth: growth, media: store}\n}',
    'func NewGenerationService(repo *repository.AgentRepository, management *ManagementService, mediaAssets mediaCreator, store media.Store) *GenerationService {\n\treturn &GenerationService{repo: repo, management: management, mediaAssets: mediaAssets, media: store}\n}',
)
replace_once(generation, 'if s.management == nil || s.growth == nil || s.media == nil || strings.TrimSpace(req.Prompt) == "" {', 'if s.management == nil || s.mediaAssets == nil || s.media == nil || strings.TrimSpace(req.Prompt) == "" {')
replace_once(generation, 'if err = s.growth.CreateMedia(ctx, asset); err != nil {', 'if err = s.mediaAssets.CreateMedia(ctx, asset); err != nil {')

# Approval keeps Growth only for version history; Media reads use a narrow contract.
approval = "blog-backend/internal/agent/approval.go"
replace_once(
    approval,
    '''type ApprovalService struct {\n\trepo       *repository.AgentRepository\n\tposts      *service.PostService\n\tpages      *pageservice.PageService\n\tmanagement *ManagementService\n\tgrowth     *service.GrowthService\n\tmedia      media.Store\n\tgeneration *GenerationService\n}\n''',
    '''type mediaLister interface {\n\tListMedia(context.Context, domain.MediaFilter) ([]*domain.MediaAsset, error)\n}\n\ntype ApprovalService struct {\n\trepo        *repository.AgentRepository\n\tposts       *service.PostService\n\tpages       *pageservice.PageService\n\tmanagement  *ManagementService\n\tgrowth      *service.GrowthService\n\tmediaAssets mediaLister\n\tmedia       media.Store\n\tgeneration  *GenerationService\n}\n''',
)
replace_once(
    approval,
    'func NewApprovalService(repo *repository.AgentRepository, posts *service.PostService, management *ManagementService, growth *service.GrowthService, store media.Store, pages *pageservice.PageService) *ApprovalService {\n\treturn &ApprovalService{repo: repo, posts: posts, pages: pages, management: management, growth: growth, media: store, generation: NewGenerationService(repo, management, growth, store)}\n}',
    'func NewApprovalService(repo *repository.AgentRepository, posts *service.PostService, management *ManagementService, growth *service.GrowthService, mediaAssets mediaLister, store media.Store, pages *pageservice.PageService) *ApprovalService {\n\treturn &ApprovalService{repo: repo, posts: posts, pages: pages, management: management, growth: growth, mediaAssets: mediaAssets, media: store, generation: NewGenerationService(repo, management, mediaAssets, store)}\n}',
)
text = read(approval)
count = text.count('s.growth.ListMedia(ctx, domain.MediaFilter{})')
if count < 1:
    raise SystemExit(f"{approval}: expected Media list consumers, found {count}")
write(approval, text.replace('s.growth.ListMedia(ctx, domain.MediaFilter{})', 's.mediaAssets.ListMedia(ctx, domain.MediaFilter{})'))

# Router tests construct the canonical service and lock handler ownership.
router_test = "blog-backend/router/web_test.go"
replace_once(
    router_test,
    '\t"github.com/rushairer/blog-backend/internal/media"\n',
    '\t"github.com/rushairer/blog-backend/internal/media"\n\tmediarepository "github.com/rushairer/blog-backend/internal/media/repository"\n\tmediaservice "github.com/rushairer/blog-backend/internal/media/service"\n',
)
replace_once(
    router_test,
    '\t\tPageSvc:      pageservice.NewPageService(pagerepository.NewPageRepository(nil)),\n\t\tTaxonomySvc:',
    '\t\tPageSvc:      pageservice.NewPageService(pagerepository.NewPageRepository(nil)),\n\t\tMediaSvc:     mediaservice.New(mediarepository.New(nil)),\n\t\tTaxonomySvc:',
)
replace_once(
    router_test,
    '\tfoundMedia := false\n\tfoundBlogSession := false\n',
    '\tfoundMedia := false\n\tfoundAdminMedia := false\n\tadminMediaHandler := ""\n\tfoundBlogSession := false\n',
)
replace_once(
    router_test,
    '\t\tif route.Method == "GET" && route.Path == "/media/:filename" {\n\t\t\tfoundMedia = true\n\t\t}\n',
    '\t\tif route.Method == "GET" && route.Path == "/media/:filename" {\n\t\t\tfoundMedia = true\n\t\t}\n\t\tif route.Method == "GET" && route.Path == "/api/admin/media" {\n\t\t\tfoundAdminMedia = true\n\t\t\tadminMediaHandler = route.Handler\n\t\t}\n',
)
replace_once(
    router_test,
    'if !foundUpdate || !foundLike || !foundRelated || !foundAnalytics || !foundMedia || !foundHealth || !foundBlogSession || !foundCommunityModeration || !foundTaxonomy || !foundSite || !foundPage {',
    'if !foundUpdate || !foundLike || !foundRelated || !foundAnalytics || !foundMedia || !foundAdminMedia || !foundHealth || !foundBlogSession || !foundCommunityModeration || !foundTaxonomy || !foundSite || !foundPage {',
)
replace_once(
    router_test,
    't.Fatalf("expected routes, update=%v like=%v related=%v analytics=%v media=%v health=%v blogSession=%v communityModeration=%v taxonomy=%v site=%v page=%v", foundUpdate, foundLike, foundRelated, foundAnalytics, foundMedia, foundHealth, foundBlogSession, foundCommunityModeration, foundTaxonomy, foundSite, foundPage)',
    't.Fatalf("expected routes, update=%v like=%v related=%v analytics=%v media=%v adminMedia=%v health=%v blogSession=%v communityModeration=%v taxonomy=%v site=%v page=%v", foundUpdate, foundLike, foundRelated, foundAnalytics, foundMedia, foundAdminMedia, foundHealth, foundBlogSession, foundCommunityModeration, foundTaxonomy, foundSite, foundPage)',
)
replace_once(
    router_test,
    '\tif !strings.Contains(communityModerationHandler, "internal/community/controller") {',
    '\tif !strings.Contains(adminMediaHandler, "internal/media/controller") {\n\t\tt.Fatalf("admin media must be owned by canonical Media controller, handler=%q", adminMediaHandler)\n\t}\n\tif !strings.Contains(communityModerationHandler, "internal/community/controller") {',
)

# Record the new ownership boundary.
architecture = "blog-backend/ARCHITECTURE.md"
replace_once(
    architecture,
    'Media-asset persistence and business behavior are now canonical under `internal/media/repository` and `internal/media/service`; the legacy `GrowthRepository` and `GrowthService` retain media methods only as compatibility delegates while Media controller/runtime ownership migrates in a later stage. The legacy service preserves its historical media-not-found mapping to `ErrPostNotFound` until active consumers move to the canonical Media service.',
    'Media-asset persistence, business behavior, and HTTP ownership are canonical under `internal/media/{repository,service,controller}`. Active Media routes use the canonical controller/service, SVG upload security lives with that HTTP adapter, shared HTTP error mapping recognizes canonical Media sentinels, and Agent generation/approval depend on narrow Media create/list contracts. The legacy `GrowthRepository` and `GrowthService` retain media methods only as compatibility delegates for a separate cleanup stage; the legacy service preserves its historical media-not-found mapping to `ErrPostNotFound` until those delegates are removed.',
)
