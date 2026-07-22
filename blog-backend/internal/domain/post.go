package domain

import "time"

type PostStatus string

const (
	PostStatusDraft     PostStatus = "draft"
	PostStatusScheduled PostStatus = "scheduled"
	PostStatusPublished PostStatus = "published"
)

type Post struct {
	ID          int64      `json:"id"`
	Title       string     `json:"title"`
	Slug        string     `json:"slug"`
	Summary     string     `json:"summary"`
	Content     string     `json:"content"`
	Tags        []string   `json:"tags"`
	Status      PostStatus `json:"status"`
	ViewsCount  int64      `json:"views_count"`
	LikesCount  int64      `json:"likes_count"`
	PublishedAt *time.Time `json:"published_at,omitempty"`
	ScheduledAt *time.Time `json:"scheduled_at,omitempty"`
	CreatedAt   time.Time  `json:"created_at"`
	UpdatedAt   time.Time  `json:"updated_at"`
}

type Comment struct {
	ID        int64     `json:"id"`
	PostID    int64     `json:"post_id"`
	ParentID  *int64    `json:"parent_id,omitempty"`
	Author    string    `json:"author"`
	Content   string    `json:"content"`
	IsVisible bool      `json:"is_visible"`
	CreatedAt time.Time `json:"created_at"`
}
