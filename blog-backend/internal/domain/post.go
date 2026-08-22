package domain

import "time"

type PostStatus string

const (
	PostStatusDraft     PostStatus = "draft"
	PostStatusScheduled PostStatus = "scheduled"
	PostStatusPublished PostStatus = "published"
)

type Post struct {
	ID             int64      `json:"id"`
	Title          string     `json:"title"`
	Slug           string     `json:"slug"`
	Summary        string     `json:"summary"`
	Content        string     `json:"content"`
	Tags           []string   `json:"tags"`
	CategoryID     *int64     `json:"category_id,omitempty"`
	CoverURL       string     `json:"cover_url,omitempty"`
	CoverAlt       string     `json:"cover_alt,omitempty"`
	SEOTitle       string     `json:"seo_title,omitempty"`
	SEODescription string     `json:"seo_description,omitempty"`
	Status         PostStatus `json:"status"`
	ViewsCount     int64      `json:"views_count"`
	LikesCount     int64      `json:"likes_count"`
	PublishedAt    *time.Time `json:"published_at,omitempty"`
	ScheduledAt    *time.Time `json:"scheduled_at,omitempty"`
	CreatedAt      time.Time  `json:"created_at"`
	UpdatedAt      time.Time  `json:"updated_at"`
}

type PostSearchResult struct {
	Post    *Post   `json:"post"`
	Snippet string  `json:"snippet"`
	Score   float64 `json:"score"`
}

type AdminPostFilter struct {
	Query    string
	Status   PostStatus
	Category string
	Tag      string
}

type Category struct {
	ID          int64     `json:"id"`
	Name        string    `json:"name"`
	Slug        string    `json:"slug"`
	Description string    `json:"description"`
	SortOrder   int       `json:"sort_order"`
	PostCount   int64     `json:"post_count"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

type TagSummary struct {
	Name      string `json:"name"`
	PostCount int64  `json:"post_count"`
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

type CommunityState struct {
	Liked      bool  `json:"liked"`
	LikesCount int64 `json:"likes_count"`
}

type PostVersion struct {
	ID             int64      `json:"id"`
	PostID         int64      `json:"post_id"`
	Title          string     `json:"title"`
	Slug           string     `json:"slug"`
	Summary        string     `json:"summary"`
	Content        string     `json:"content,omitempty"`
	Tags           []string   `json:"tags"`
	CategoryID     *int64     `json:"category_id,omitempty"`
	CoverURL       string     `json:"cover_url,omitempty"`
	CoverAlt       string     `json:"cover_alt,omitempty"`
	SEOTitle       string     `json:"seo_title,omitempty"`
	SEODescription string     `json:"seo_description,omitempty"`
	Status         PostStatus `json:"status"`
	PublishedAt    *time.Time `json:"published_at,omitempty"`
	ScheduledAt    *time.Time `json:"scheduled_at,omitempty"`
	CreatedAt      time.Time  `json:"created_at"`
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
	UsageCount  int64     `json:"usage_count"`
}

type MediaReference struct {
	PostID    int64  `json:"post_id"`
	PostTitle string `json:"post_title"`
	PostSlug  string `json:"post_slug"`
}

type AnalyticsSummary struct {
	TotalPosts      int64             `json:"total_posts"`
	PublishedPosts  int64             `json:"published_posts"`
	TotalViews      int64             `json:"total_views"`
	TotalLikes      int64             `json:"total_likes"`
	TotalComments   int64             `json:"total_comments"`
	PendingComments int64             `json:"pending_comments"`
	ReportedItems   int64             `json:"reported_items"`
	TopPosts        []*Post           `json:"top_posts"`
	DailyEvents     []DailyEventCount `json:"daily_events"`
	AIAlerts        []SystemAlert     `json:"ai_alerts"`
}

type SystemAlert struct {
	ID        int64     `json:"id"`
	Type      string    `json:"type"`
	Title     string    `json:"title"`
	Body      string    `json:"body"`
	Href      string    `json:"href"`
	CreatedAt time.Time `json:"created_at"`
}

type DailyEventCount struct {
	Date  string `json:"date"`
	Count int64  `json:"count"`
}
