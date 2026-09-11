from pathlib import Path

root = Path("blog-backend")


def read(rel: str) -> str:
    return (root / rel).read_text()


def write(rel: str, text: str) -> None:
    (root / rel).write_text(text)


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly one match, found {count}")
    return text.replace(old, new, 1)


# Composition root constructs canonical Community repository/service directly.
rel = "cmd/gouno/web.go"
text = read(rel)
text = replace_once(
    text,
    '\t"github.com/rushairer/blog-backend/internal/connector"\n',
    '\t"github.com/rushairer/blog-backend/internal/connector"\n'
    '\tcommunityrepository "github.com/rushairer/blog-backend/internal/community/repository"\n'
    '\tcommunityservice "github.com/rushairer/blog-backend/internal/community/service"\n',
    f"{rel} canonical imports",
)
text = replace_once(
    text,
    'communitySvc := service.NewCommunityService(repository.NewCommunityRepository(cfg.DB), postRepo)',
    'communitySvc := communityservice.NewCommunityService(communityrepository.NewCommunityRepository(cfg.DB), postRepo)',
    f"{rel} canonical construction",
)
write(rel, text)

# Router options and HTTP composition depend on canonical Community packages.
rel = "router/web.go"
text = read(rel)
text = replace_once(
    text,
    '\t"github.com/rushairer/blog-backend/internal/authbff"\n',
    '\t"github.com/rushairer/blog-backend/internal/authbff"\n'
    '\tcommunitycontroller "github.com/rushairer/blog-backend/internal/community/controller"\n'
    '\tcommunityservice "github.com/rushairer/blog-backend/internal/community/service"\n',
    f"{rel} community imports",
)
text = replace_once(
    text,
    '\t"github.com/rushairer/blog-backend/internal/media"\n',
    '\t"github.com/rushairer/blog-backend/internal/media"\n'
    '\t"github.com/rushairer/blog-backend/internal/ratelimit"\n',
    f"{rel} ratelimit import",
)
text = replace_once(
    text,
    '\tCommunitySvc       *service.CommunityService\n',
    '\tCommunitySvc       *communityservice.CommunityService\n',
    f"{rel} CommunitySvc type",
)
text = replace_once(
    text,
    'var interactionLimiter service.RateLimiter',
    'var interactionLimiter ratelimit.Limiter',
    f"{rel} limiter type",
)
text = replace_once(
    text,
    'if limiter, err := service.NewRedisRateLimiter(opts.RedisDSN); err == nil {',
    'if limiter, err := ratelimit.NewRedisLimiter(opts.RedisDSN); err == nil {',
    f"{rel} limiter constructor",
)
text = replace_once(
    text,
    'communityCtrl := controller.NewCommunityController(communitySvc, interactionLimiter, opts.VisitorSecret, opts.Logger)',
    'communityCtrl := communitycontroller.NewCommunityController(communitySvc, interactionLimiter, opts.VisitorSecret, opts.Logger)',
    f"{rel} controller constructor",
)
write(rel, text)

# Router test uses the same canonical composition path.
rel = "router/web_test.go"
text = read(rel)
text = replace_once(
    text,
    '\t"github.com/rushairer/blog-backend/internal/access"\n',
    '\t"github.com/rushairer/blog-backend/internal/access"\n'
    '\tcommunityrepository "github.com/rushairer/blog-backend/internal/community/repository"\n'
    '\tcommunityservice "github.com/rushairer/blog-backend/internal/community/service"\n',
    f"{rel} canonical imports",
)
text = replace_once(
    text,
    'CommunitySvc: service.NewCommunityService(repository.NewCommunityRepository(nil), postRepo),',
    'CommunitySvc: communityservice.NewCommunityService(communityrepository.NewCommunityRepository(nil), postRepo),',
    f"{rel} canonical construction",
)
write(rel, text)

# Growth needs only published-post resolution, not a concrete Community service.
rel = "internal/controller/growth_controller.go"
text = read(rel)
text = replace_once(text, '\t"crypto/rand"\n', '\t"context"\n\t"crypto/rand"\n', f"{rel} context import")
old = '''type GrowthController struct {
\tgrowth      *service.GrowthService
\tposts       *service.PostService
\tcommunity   *service.CommunityService
\tmedia       media.Store
\tlogger      *zap.Logger
\tpostPolicy  access.PostPolicy
\tmediaPolicy access.MediaPolicy
}

func NewGrowthController(growth *service.GrowthService, posts *service.PostService, community *service.CommunityService, store media.Store, logger *zap.Logger) *GrowthController {
'''
new = '''type publishedPostResolver interface {
\tResolvePublishedPost(context.Context, string) (*domain.Post, error)
}

type GrowthController struct {
\tgrowth      *service.GrowthService
\tposts       *service.PostService
\tcommunity   publishedPostResolver
\tmedia       media.Store
\tlogger      *zap.Logger
\tpostPolicy  access.PostPolicy
\tmediaPolicy access.MediaPolicy
}

func NewGrowthController(growth *service.GrowthService, posts *service.PostService, community publishedPostResolver, store media.Store, logger *zap.Logger) *GrowthController {
'''
text = replace_once(text, old, new, f"{rel} narrow Community dependency")
write(rel, text)

# Blog tools need only the moderation-list query from Community.
rel = "internal/tool/blog_tools.go"
text = read(rel)
text = replace_once(
    text,
    '\t"github.com/rushairer/blog-backend/internal/domain"\n',
    '\tcommunitydomain "github.com/rushairer/blog-backend/internal/community/domain"\n'
    '\t"github.com/rushairer/blog-backend/internal/domain"\n',
    f"{rel} community domain import",
)
old = '''type BlogTools struct {
\tposts      *service.PostService
\tcommunity  *service.CommunityService
\tgrowth     *service.GrowthService
\tpages      *service.PageService
\tlinkClient linkHTTPClient
\tknowledge  *knowledge.Service
}

func NewBlogRegistry(posts *service.PostService, community *service.CommunityService, growth *service.GrowthService, pages *service.PageService, knowledgeServices ...*knowledge.Service) *Registry {
'''
new = '''type communityModerationReader interface {
\tListAdminComments(context.Context, string, bool, int, int) ([]*communitydomain.Comment, int, error)
}

type BlogTools struct {
\tposts      *service.PostService
\tcommunity  communityModerationReader
\tgrowth     *service.GrowthService
\tpages      *service.PageService
\tlinkClient linkHTTPClient
\tknowledge  *knowledge.Service
}

func NewBlogRegistry(posts *service.PostService, community communityModerationReader, growth *service.GrowthService, pages *service.PageService, knowledgeServices ...*knowledge.Service) *Registry {
'''
text = replace_once(text, old, new, f"{rel} narrow Community dependency")
write(rel, text)

# Shared HTTP error mapping points to canonical Community sentinels.
rel = "internal/controllerutil/response.go"
text = read(rel)
text = replace_once(
    text,
    '\tcommunityservice "github.com/rushairer/blog-backend/internal/community/service"\n',
    '\tcommunityrepository "github.com/rushairer/blog-backend/internal/community/repository"\n'
    '\tcommunityservice "github.com/rushairer/blog-backend/internal/community/service"\n',
    f"{rel} canonical repository import",
)
replacements = {
    'repository.ErrDuplicateInteraction': 'communityrepository.ErrDuplicateInteraction',
    'repository.ErrParentCommentMismatch': 'communityrepository.ErrParentCommentMismatch',
    'repository.ErrCommentDepthExceeded': 'communityrepository.ErrCommentDepthExceeded',
    'service.ErrCommentContentTooLong': 'communityservice.ErrCommentContentTooLong',
    'service.ErrAuthorTooLong': 'communityservice.ErrAuthorTooLong',
    'service.ErrParentCommentNotFound': 'communityservice.ErrParentCommentNotFound',
    'service.ErrInvalidCommentStatus': 'communityservice.ErrInvalidCommentStatus',
    'service.ErrReportReasonTooLong': 'communityservice.ErrReportReasonTooLong',
}
for old_name, new_name in replacements.items():
    text = replace_once(text, old_name, new_name, f"{rel} {old_name}")
for line in [
    '\t\terrors.Is(err, service.ErrCommentAuthorEmpty),\n',
    '\t\terrors.Is(err, service.ErrCommentContentEmpty),\n',
]:
    text = replace_once(text, line, '', f"{rel} remove facade error identity")
text = replace_once(
    text,
    '\t"github.com/rushairer/blog-backend/internal/repository"\n',
    '',
    f"{rel} remove legacy repository import",
)
write(rel, text)

# Root domain no longer aliases Community types once legacy facades/tests are gone.
rel = "internal/domain/post.go"
text = read(rel)
text = replace_once(
    text,
    'import (\n\t"time"\n\n\tcommunitydomain "github.com/rushairer/blog-backend/internal/community/domain"\n)\n',
    'import "time"\n',
    f"{rel} remove Community import",
)
text = replace_once(
    text,
    '\n// Community domain aliases are retained while callers migrate to the capability-owned package.\n'
    'type Comment = communitydomain.Comment\n'
    'type Notification = communitydomain.Notification\n'
    'type CommunityState = communitydomain.State\n',
    '',
    f"{rel} remove Community aliases",
)
write(rel, text)
