package post

import (
	"time"

	"github.com/rushairer/blog-backend/internal/domain"
)

// RestoreSnapshot is the Post-owned command used by cross-capability
// coordinators to restore Post state without exposing Post persistence.
type RestoreSnapshot struct {
	Title          string
	Slug           string
	Summary        string
	Content        string
	Tags           []string
	CategoryID     *int64
	CoverURL       string
	CoverAlt       string
	SEOTitle       string
	SEODescription string
	Status         domain.PostStatus
	PublishedAt    *time.Time
	ScheduledAt    *time.Time
}
