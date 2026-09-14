package domain

import (
	postdomain "github.com/rushairer/blog-backend/internal/post/domain"
	"time"
)

type PostVersion struct {
	ID             int64                 `json:"id"`
	PostID         int64                 `json:"post_id"`
	Title          string                `json:"title"`
	Slug           string                `json:"slug"`
	Summary        string                `json:"summary"`
	Content        string                `json:"content,omitempty"`
	Tags           []string              `json:"tags"`
	CategoryID     *int64                `json:"category_id,omitempty"`
	CoverURL       string                `json:"cover_url,omitempty"`
	CoverAlt       string                `json:"cover_alt,omitempty"`
	SEOTitle       string                `json:"seo_title,omitempty"`
	SEODescription string                `json:"seo_description,omitempty"`
	Status         postdomain.PostStatus `json:"status"`
	PublishedAt    *time.Time            `json:"published_at,omitempty"`
	ScheduledAt    *time.Time            `json:"scheduled_at,omitempty"`
	CreatedAt      time.Time             `json:"created_at"`
}
