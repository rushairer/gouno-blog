package domain

import "time"

type Post struct {
	ID        int64     `json:"id"`
	Title     string    `json:"title"`
	Slug      string    `json:"slug"`
	Summary   string    `json:"summary"`
	Content   string    `json:"content"`
	Tags      []string  `json:"tags"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

type Comment struct {
	ID        int64     `json:"id"`
	PostID    int64     `json:"post_id"`
	Author    string    `json:"author"`
	Content   string    `json:"content"`
	IsVisible bool      `json:"is_visible"`
	CreatedAt time.Time `json:"created_at"`
}
