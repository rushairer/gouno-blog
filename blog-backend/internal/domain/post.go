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
	ID            int64     `json:"id"`
	PostID        int64     `json:"post_id"`
	ParentID      *int64    `json:"parent_id,omitempty"`
	Author        string    `json:"author"`
	AuthorSubject *string   `json:"-"`
	AuthorType    string    `json:"author_type"`
	Content       string    `json:"content"`
	Status        string    `json:"status"`
	IsVisible     bool      `json:"is_visible"`
	ReportCount   int       `json:"report_count,omitempty"`
	CreatedAt     time.Time `json:"created_at"`
}

type Bookmark struct {
	Post      *Post     `json:"post"`
	CreatedAt time.Time `json:"created_at"`
}

type Notification struct {
	ID        int64      `json:"id"`
	Type      string     `json:"type"`
	PostID    int64      `json:"post_id"`
	PostSlug  string     `json:"post_slug"`
	PostTitle string     `json:"post_title"`
	CommentID *int64     `json:"comment_id,omitempty"`
	ActorName string     `json:"actor_name"`
	ReadAt    *time.Time `json:"read_at,omitempty"`
	CreatedAt time.Time  `json:"created_at"`
}

type CommunityState struct {
	Liked      bool  `json:"liked"`
	Bookmarked bool  `json:"bookmarked"`
	LikesCount int64 `json:"likes_count"`
}

type PostVersion struct {
	ID          int64      `json:"id"`
	PostID      int64      `json:"post_id"`
	Title       string     `json:"title"`
	Slug        string     `json:"slug"`
	Summary     string     `json:"summary"`
	Content     string     `json:"content,omitempty"`
	Tags        []string   `json:"tags"`
	Status      PostStatus `json:"status"`
	PublishedAt *time.Time `json:"published_at,omitempty"`
	ScheduledAt *time.Time `json:"scheduled_at,omitempty"`
	CreatedAt   time.Time  `json:"created_at"`
}

type MediaAsset struct {
	ID          int64     `json:"id"`
	Filename    string    `json:"filename"`
	StorageName string    `json:"-"`
	URL         string    `json:"url"`
	ContentType string    `json:"content_type"`
	SizeBytes   int64     `json:"size_bytes"`
	AltText     string    `json:"alt_text"`
	CreatedBy   *string   `json:"created_by,omitempty"`
	CreatedAt   time.Time `json:"created_at"`
}

type AnalyticsSummary struct {
	TotalPosts      int64             `json:"total_posts"`
	PublishedPosts  int64             `json:"published_posts"`
	TotalViews      int64             `json:"total_views"`
	TotalLikes      int64             `json:"total_likes"`
	TotalBookmarks  int64             `json:"total_bookmarks"`
	TotalComments   int64             `json:"total_comments"`
	PendingComments int64             `json:"pending_comments"`
	ReportedItems   int64             `json:"reported_items"`
	TopPosts        []*Post           `json:"top_posts"`
	DailyEvents     []DailyEventCount `json:"daily_events"`
}

type DailyEventCount struct {
	Date  string `json:"date"`
	Count int64  `json:"count"`
}
