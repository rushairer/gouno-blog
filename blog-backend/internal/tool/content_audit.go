package tool

import (
	"context"
	"encoding/json"
	"net/url"
	"regexp"
	"strings"
	"unicode/utf8"

	"github.com/rushairer/blog-backend/internal/domain"
)

var (
	markdownHeadingPattern = regexp.MustCompile(`(?m)^(#{1,6})\s+\S`)
	markdownImagePattern   = regexp.MustCompile(`!\[([^\]]*)\]\(`)
	markdownLinkTarget     = regexp.MustCompile(`!?\[[^\]]*\]\(\s*<?([^\s)>]+)`)
)

type contentAuditCheck struct {
	Code     string `json:"code"`
	Severity string `json:"severity"`
	Message  string `json:"message"`
}

func (t *BlogTools) auditPost(ctx context.Context, raw json.RawMessage) (any, error) {
	var args struct {
		ID int64 `json:"id"`
	}
	if err := decodeArguments(raw, &args); err != nil || args.ID <= 0 {
		return nil, ErrInvalidArgument
	}
	post, err := t.posts.GetAdminPost(ctx, args.ID)
	if err != nil {
		return nil, err
	}
	return auditPost(post), nil
}

func (t *BlogTools) auditPage(ctx context.Context, raw json.RawMessage) (any, error) {
	if t.pages == nil {
		return nil, ErrInvalidArgument
	}
	var args struct {
		ID int64 `json:"id"`
	}
	if err := decodeArguments(raw, &args); err != nil || args.ID <= 0 {
		return nil, ErrInvalidArgument
	}
	page, err := t.pages.GetPage(ctx, args.ID)
	if err != nil {
		return nil, err
	}
	return auditPage(page), nil
}

func auditPage(page *domain.Page) map[string]any {
	contentRunes := utf8.RuneCountInString(page.Content)
	headings := markdownHeadingPattern.FindAllStringSubmatch(page.Content, -1)
	images := markdownImagePattern.FindAllStringSubmatch(page.Content, -1)
	missingImageAlt := 0
	levels := make([]int, 0, len(headings))
	for _, heading := range headings {
		levels = append(levels, len(heading[1]))
	}
	for _, image := range images {
		if strings.TrimSpace(image[1]) == "" {
			missingImageAlt++
		}
	}

	checks := make([]contentAuditCheck, 0)
	add := func(code, severity, message string) {
		checks = append(checks, contentAuditCheck{Code: code, Severity: severity, Message: message})
	}
	if strings.TrimSpace(page.Title) == "" {
		add("title_missing", "error", "Add a descriptive page title.")
	} else if utf8.RuneCountInString(page.Title) > 70 {
		add("title_too_long", "warning", "Shorten the title to 70 characters or fewer.")
	}
	if strings.TrimSpace(page.Slug) == "" {
		add("slug_missing", "error", "Add a valid URL slug for the page.")
	}
	if strings.TrimSpace(page.Summary) == "" {
		add("summary_missing", "warning", "Add a concise page summary.")
	} else if utf8.RuneCountInString(page.Summary) > 160 {
		add("summary_too_long", "warning", "Shorten the summary to 160 characters or fewer.")
	}
	if strings.TrimSpace(page.SEOTitle) == "" {
		add("seo_title_missing", "info", "Consider adding a dedicated SEO title.")
	} else if utf8.RuneCountInString(page.SEOTitle) > 60 {
		add("seo_title_too_long", "warning", "Shorten the SEO title to 60 characters or fewer.")
	}
	if strings.TrimSpace(page.SEODescription) == "" {
		add("seo_description_missing", "info", "Consider adding an SEO description.")
	} else if utf8.RuneCountInString(page.SEODescription) > 160 {
		add("seo_description_too_long", "warning", "Shorten the SEO description to 160 characters or fewer.")
	}
	if missingImageAlt > 0 {
		add("image_alt_missing", "warning", "Add alt text to every inline image.")
	}
	if contentRunes < 100 {
		add("content_short", "info", "Review whether the page has enough context.")
	}
	for index := 1; index < len(levels); index++ {
		if levels[index] > levels[index-1]+1 {
			add("heading_level_skipped", "warning", "Use heading levels in order without skipping levels.")
			break
		}
	}

	externalLinks, internalLinks := countMarkdownLinks(page.Content)
	return map[string]any{
		"page_id": page.ID,
		"metrics": map[string]int{
			"title_characters":           utf8.RuneCountInString(page.Title),
			"summary_characters":         utf8.RuneCountInString(page.Summary),
			"seo_title_characters":       utf8.RuneCountInString(page.SEOTitle),
			"seo_description_characters": utf8.RuneCountInString(page.SEODescription),
			"content_characters":         contentRunes,
			"heading_count":              len(headings),
			"image_count":                len(images),
			"images_missing_alt":         missingImageAlt,
			"external_link_count":        externalLinks,
			"internal_link_count":        internalLinks,
		},
		"checks": checks,
	}
}

func auditPost(post *domain.Post) map[string]any {
	contentRunes := utf8.RuneCountInString(post.Content)
	headings := markdownHeadingPattern.FindAllStringSubmatch(post.Content, -1)
	images := markdownImagePattern.FindAllStringSubmatch(post.Content, -1)
	missingImageAlt := 0
	levels := make([]int, 0, len(headings))
	for _, heading := range headings {
		levels = append(levels, len(heading[1]))
	}
	for _, image := range images {
		if strings.TrimSpace(image[1]) == "" {
			missingImageAlt++
		}
	}

	checks := make([]contentAuditCheck, 0)
	add := func(code, severity, message string) {
		checks = append(checks, contentAuditCheck{Code: code, Severity: severity, Message: message})
	}
	if strings.TrimSpace(post.Title) == "" {
		add("title_missing", "error", "Add a descriptive article title.")
	} else if utf8.RuneCountInString(post.Title) > 70 {
		add("title_too_long", "warning", "Shorten the title to 70 characters or fewer.")
	}
	if strings.TrimSpace(post.Summary) == "" {
		add("summary_missing", "warning", "Add a concise article summary.")
	} else if utf8.RuneCountInString(post.Summary) > 160 {
		add("summary_too_long", "warning", "Shorten the summary to 160 characters or fewer.")
	}
	if strings.TrimSpace(post.SEOTitle) == "" {
		add("seo_title_missing", "info", "Consider adding a dedicated SEO title.")
	} else if utf8.RuneCountInString(post.SEOTitle) > 60 {
		add("seo_title_too_long", "warning", "Shorten the SEO title to 60 characters or fewer.")
	}
	if strings.TrimSpace(post.SEODescription) == "" {
		add("seo_description_missing", "info", "Consider adding an SEO description.")
	} else if utf8.RuneCountInString(post.SEODescription) > 160 {
		add("seo_description_too_long", "warning", "Shorten the SEO description to 160 characters or fewer.")
	}
	if strings.TrimSpace(post.CoverURL) != "" && strings.TrimSpace(post.CoverAlt) == "" {
		add("cover_alt_missing", "warning", "Add alt text for the cover image.")
	}
	if missingImageAlt > 0 {
		add("image_alt_missing", "warning", "Add alt text to every inline image.")
	}
	if contentRunes < 300 {
		add("content_short", "info", "Review whether the article has enough context for its intended audience.")
	}
	for index := 1; index < len(levels); index++ {
		if levels[index] > levels[index-1]+1 {
			add("heading_level_skipped", "warning", "Use heading levels in order without skipping levels.")
			break
		}
	}

	externalLinks, internalLinks := countMarkdownLinks(post.Content)
	return map[string]any{
		"post_id": post.ID,
		"metrics": map[string]int{
			"title_characters":           utf8.RuneCountInString(post.Title),
			"summary_characters":         utf8.RuneCountInString(post.Summary),
			"seo_title_characters":       utf8.RuneCountInString(post.SEOTitle),
			"seo_description_characters": utf8.RuneCountInString(post.SEODescription),
			"content_characters":         contentRunes,
			"heading_count":              len(headings),
			"image_count":                len(images),
			"images_missing_alt":         missingImageAlt,
			"external_link_count":        externalLinks,
			"internal_link_count":        internalLinks,
		},
		"checks": checks,
	}
}

func countMarkdownLinks(markdown string) (external, internal int) {
	for _, match := range markdownLinkTarget.FindAllStringSubmatch(markdown, -1) {
		if len(match) < 2 {
			continue
		}
		if strings.HasPrefix(match[0], "!") {
			continue
		}
		parsed, err := url.Parse(strings.TrimSpace(match[1]))
		if err != nil {
			continue
		}
		if parsed.Scheme == "http" || parsed.Scheme == "https" {
			external++
		} else if parsed.Scheme == "" && parsed.Host == "" {
			internal++
		}
	}
	return external, internal
}
