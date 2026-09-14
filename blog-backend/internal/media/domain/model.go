package domain

import "time"

type MediaAsset struct {
	ID                   int64     `json:"id"`
	Filename             string    `json:"filename"`
	StorageName          string    `json:"-"`
	URL                  string    `json:"url"`
	ContentType          string    `json:"content_type"`
	SizeBytes            int64     `json:"size_bytes"`
	AltText              string    `json:"alt_text"`
	CreatedByPrincipalID *int64    `json:"created_by_principal_id,omitempty"`
	UpdatedByPrincipalID *int64    `json:"updated_by_principal_id,omitempty"`
	CreatedAt            time.Time `json:"created_at"`
	UsageCount           int64     `json:"usage_count"`
}

type MediaFilter struct {
	CreatedByPrincipalID *int64
}

type MediaReference struct {
	PostID    int64  `json:"post_id"`
	PostTitle string `json:"post_title"`
	PostSlug  string `json:"post_slug"`
}
