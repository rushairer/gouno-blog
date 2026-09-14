package domain

import (
	postdomain "github.com/rushairer/blog-backend/internal/post/domain"
	"time"
)

type AnalyticsSummary struct {
	TotalPosts      int64              `json:"total_posts"`
	PublishedPosts  int64              `json:"published_posts"`
	TotalViews      int64              `json:"total_views"`
	TotalLikes      int64              `json:"total_likes"`
	TotalComments   int64              `json:"total_comments"`
	PendingComments int64              `json:"pending_comments"`
	ReportedItems   int64              `json:"reported_items"`
	TopPosts        []*postdomain.Post `json:"top_posts"`
	DailyEvents     []DailyEventCount  `json:"daily_events"`
	AIAlerts        []SystemAlert      `json:"ai_alerts"`
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
