package domain

import "time"

type PageStatus string

const (
	PageStatusDraft     PageStatus = "draft"
	PageStatusPublished PageStatus = "published"
)

type PageTemplate string

const (
	PageTemplateDefault PageTemplate = "default"
	PageTemplateAbout   PageTemplate = "about"
	PageTemplateLinks   PageTemplate = "links"
	PageTemplateBlank   PageTemplate = "blank"
)

type Page struct {
	ID             int64      `json:"id"`
	Title          string     `json:"title"`
	Slug           string     `json:"slug"`
	Content        string     `json:"content"`
	Summary        string     `json:"summary"`
	Template       string     `json:"template"`
	Status         PageStatus `json:"status"`
	AllowComments  bool       `json:"allow_comments"`
	ShowInNav      bool       `json:"show_in_nav"`
	SortOrder      int        `json:"sort_order"`
	SEOTitle       string     `json:"seo_title"`
	SEODescription string     `json:"seo_description"`
	CreatedAt      time.Time  `json:"created_at"`
	UpdatedAt      time.Time  `json:"updated_at"`
}

type AdminPageFilter struct {
	Query  string
	Status PageStatus
}
