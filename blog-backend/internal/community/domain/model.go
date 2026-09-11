package domain

import "time"

// Comment is a community-owned discussion entry attached to a post.
type Comment struct {
	ID                int64     `json:"id"`
	PostID            int64     `json:"post_id"`
	ParentID          *int64    `json:"parent_id,omitempty"`
	Author            string    `json:"author"`
	AuthorPrincipalID *int64    `json:"-"`
	AuthorType        string    `json:"author_type"`
	Content           string    `json:"content"`
	Status            string    `json:"status"`
	IsVisible         bool      `json:"is_visible"`
	ReportCount       int       `json:"report_count,omitempty"`
	CreatedAt         time.Time `json:"created_at"`
}

// Notification represents community/user-facing notification state.
type Notification struct {
	ID        int64      `json:"id"`
	Type      string     `json:"type"`
	PostID    *int64     `json:"post_id,omitempty"`
	PostSlug  string     `json:"post_slug"`
	PostTitle string     `json:"post_title"`
	CommentID *int64     `json:"comment_id,omitempty"`
	ActorName string     `json:"actor_name"`
	Title     string     `json:"title,omitempty"`
	Body      string     `json:"body,omitempty"`
	Href      string     `json:"href,omitempty"`
	ReadAt    *time.Time `json:"read_at,omitempty"`
	CreatedAt time.Time  `json:"created_at"`
}

// State is the community interaction state for a post and actor.
type State struct {
	Liked      bool  `json:"liked"`
	LikesCount int64 `json:"likes_count"`
}
