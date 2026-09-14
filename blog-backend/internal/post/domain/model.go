package domain

import "time"

type PostStatus string

const (
	PostStatusDraft     PostStatus = "draft"
	PostStatusScheduled PostStatus = "scheduled"
	PostStatusPublished PostStatus = "published"
)

type Post struct {
	Revision             int64      `json:"revision"`
	ID                   int64      `json:"id"`
	Title                string     `json:"title"`
	Slug                 string     `json:"slug"`
	Summary              string     `json:"summary"`
	Content              string     `json:"content"`
	Tags                 []string   `json:"tags"`
	CategoryID           *int64     `json:"category_id,omitempty"`
	CoverURL             string     `json:"cover_url,omitempty"`
	CoverAlt             string     `json:"cover_alt,omitempty"`
	SEOTitle             string     `json:"seo_title,omitempty"`
	SEODescription       string     `json:"seo_description,omitempty"`
	Status               PostStatus `json:"status"`
	ViewsCount           int64      `json:"views_count"`
	LikesCount           int64      `json:"likes_count"`
	PublishedAt          *time.Time `json:"published_at,omitempty"`
	ScheduledAt          *time.Time `json:"scheduled_at,omitempty"`
	CreatedByPrincipalID *int64     `json:"created_by_principal_id,omitempty"`
	UpdatedByPrincipalID *int64     `json:"updated_by_principal_id,omitempty"`
	CreatedAt            time.Time  `json:"created_at"`
	UpdatedAt            time.Time  `json:"updated_at"`
}

type PostSearchResult struct {
	Post    *Post   `json:"post"`
	Snippet string  `json:"snippet"`
	Score   float64 `json:"score"`
}

type AdminPostFilter struct {
	Query                string
	Status               PostStatus
	Category             string
	Tag                  string
	CreatedByPrincipalID *int64
}
