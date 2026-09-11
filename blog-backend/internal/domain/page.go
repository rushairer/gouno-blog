package domain

import pagedomain "github.com/rushairer/blog-backend/internal/page/domain"

// Page domain aliases are retained while callers migrate to the capability-owned package.
type PageStatus = pagedomain.PageStatus

const (
	PageStatusDraft     = pagedomain.PageStatusDraft
	PageStatusPublished = pagedomain.PageStatusPublished
)

type PageTemplate = pagedomain.PageTemplate

const (
	PageTemplateDefault  = pagedomain.PageTemplateDefault
	PageTemplateAbout    = pagedomain.PageTemplateAbout
	PageTemplateLinks    = pagedomain.PageTemplateLinks
	PageTemplateBlank    = pagedomain.PageTemplateBlank
	PageTemplateTimeline = pagedomain.PageTemplateTimeline
	PageTemplateProjects = pagedomain.PageTemplateProjects
	PageTemplateFocus    = pagedomain.PageTemplateFocus
	PageTemplateFAQ      = pagedomain.PageTemplateFAQ
)

type Page = pagedomain.Page
type AdminPageFilter = pagedomain.AdminPageFilter
