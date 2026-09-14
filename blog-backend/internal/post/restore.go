package post

import (
	postdomain "github.com/rushairer/blog-backend/internal/post/domain"
	"time"
)

// RestoreSnapshot is the Post-owned command used by cross-capability
// coordinators to restore Post state without exposing Post persistence.
type RestoreSnapshot struct {
	ExpectedRevision int64
	Title            string
	Slug             string
	Summary          string
	Content          string
	Tags             []string
	CategoryID       *int64
	CoverURL         string
	CoverAlt         string
	SEOTitle         string
	SEODescription   string
	Status           postdomain.PostStatus
	PublishedAt      *time.Time
	ScheduledAt      *time.Time
}
