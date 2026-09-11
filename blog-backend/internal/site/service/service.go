package service

import (
	"context"
	"errors"
	"net/url"
	"strings"

	siterepository "github.com/rushairer/blog-backend/internal/site/repository"
)

var (
	ErrInvalidSettings     = errors.New("无效的站点设置")
	ErrSettingValueTooLong = errors.New("设置项内容超出最大长度限制")
	ErrSiteTitleEmpty      = errors.New("站点标题不能为空")
	ErrInvalidRSSURL       = errors.New("RSS 地址格式无效，须为站内路径或 http(s) URL")
	ErrInvalidGithubURL    = errors.New("GitHub 地址格式无效，须为有效的 http(s) URL")
	ErrInvalidFaviconURL   = errors.New("站点图标 (Favicon) 地址格式无效")
)

var allowedSettingKeys = map[string]bool{
	"site_title": true, "site_description": true, "author_name": true, "author_bio": true,
	"email": true, "github_url": true, "rss_url": true, "default_seo_title": true, "default_seo_description": true,
	"footer_text": true, "hero_title": true, "hero_description": true, "hero_image_url": true,
	"hero_image_caption": true,
	"favicon_url":        true,
}

const maxSiteSettingLength = 4_096

// Service owns validation and persistence coordination for site settings.
type Service interface {
	GetSiteSettings(ctx context.Context) (map[string]string, error)
	UpdateSiteSettings(ctx context.Context, requested map[string]string) (map[string]string, error)
}

type siteService struct {
	repo siterepository.Repository
}

func New(repo siterepository.Repository) Service {
	return &siteService{repo: repo}
}

func (s *siteService) GetSiteSettings(ctx context.Context) (map[string]string, error) {
	return s.repo.GetSiteSettings(ctx)
}

func ValidSiteURL(value string, allowPath bool) bool {
	parsed, err := url.Parse(value)
	if err != nil || parsed.User != nil || parsed.Fragment != "" {
		return false
	}
	if allowPath && strings.HasPrefix(value, "/") {
		return !strings.HasPrefix(value, "//") && !strings.Contains(value, "\\") && parsed.Host == ""
	}
	return (parsed.Scheme == "https" || parsed.Scheme == "http") && parsed.Host != ""
}

func validSiteURL(value string, allowPath bool) bool {
	return ValidSiteURL(value, allowPath)
}

func (s *siteService) UpdateSiteSettings(ctx context.Context, requested map[string]string) (map[string]string, error) {
	clean := make(map[string]string, len(requested))
	for key, value := range requested {
		if allowedSettingKeys[key] {
			if len([]rune(value)) > maxSiteSettingLength {
				return nil, ErrSettingValueTooLong
			}
			clean[key] = strings.TrimSpace(value)
		}
	}
	if title, exists := clean["site_title"]; exists && title == "" {
		return nil, ErrSiteTitleEmpty
	}
	if rss, exists := clean["rss_url"]; exists {
		if rss == "" {
			clean["rss_url"] = "/feed.xml"
		} else if !validSiteURL(rss, true) {
			return nil, ErrInvalidRSSURL
		}
	}
	if githubURL, exists := clean["github_url"]; exists && githubURL != "" && !validSiteURL(githubURL, false) {
		return nil, ErrInvalidGithubURL
	}
	if faviconURL, exists := clean["favicon_url"]; exists && faviconURL != "" && !validSiteURL(faviconURL, true) {
		return nil, ErrInvalidFaviconURL
	}
	return s.repo.UpdateSiteSettings(ctx, clean)
}
