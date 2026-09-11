package service

import (
	"context"
	"errors"
	"strings"
	"testing"
)

type stubRepository struct {
	stored map[string]string
}

func (r *stubRepository) GetSiteSettings(context.Context) (map[string]string, error) {
	return r.stored, nil
}

func (r *stubRepository) UpdateSiteSettings(_ context.Context, settings map[string]string) (map[string]string, error) {
	r.stored = settings
	return settings, nil
}

func TestValidSiteURL(t *testing.T) {
	tests := []struct {
		name      string
		value     string
		allowPath bool
		want      bool
	}{
		{name: "https", value: "https://example.com/a", want: true},
		{name: "http", value: "http://example.com", want: true},
		{name: "path", value: "/feed.xml", allowPath: true, want: true},
		{name: "protocol relative rejected", value: "//example.com/feed", allowPath: true, want: false},
		{name: "path rejected when disabled", value: "/feed.xml", want: false},
		{name: "userinfo rejected", value: "https://user@example.com", want: false},
		{name: "fragment rejected", value: "https://example.com/#x", want: false},
		{name: "unsupported scheme", value: "javascript:alert(1)", want: false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := ValidSiteURL(tt.value, tt.allowPath); got != tt.want {
				t.Fatalf("ValidSiteURL(%q, %v) = %v, want %v", tt.value, tt.allowPath, got, tt.want)
			}
		})
	}
}

func TestUpdateSiteSettingsNormalizesAndFilters(t *testing.T) {
	repo := &stubRepository{}
	svc := New(repo)

	got, err := svc.UpdateSiteSettings(context.Background(), map[string]string{
		"site_title":  "  Gouno Blog  ",
		"rss_url":     " ",
		"github_url":  " https://github.com/rushairer/gouno-blog ",
		"favicon_url": "/favicon.svg",
		"unknown":     "discard-me",
	})
	if err != nil {
		t.Fatalf("UpdateSiteSettings() error = %v", err)
	}
	if got["site_title"] != "Gouno Blog" {
		t.Fatalf("site_title = %q", got["site_title"])
	}
	if got["rss_url"] != "/feed.xml" {
		t.Fatalf("rss_url = %q", got["rss_url"])
	}
	if got["github_url"] != "https://github.com/rushairer/gouno-blog" {
		t.Fatalf("github_url = %q", got["github_url"])
	}
	if _, exists := got["unknown"]; exists {
		t.Fatal("unknown setting key was persisted")
	}
}

func TestUpdateSiteSettingsValidation(t *testing.T) {
	svc := New(&stubRepository{})

	tests := []struct {
		name string
		in   map[string]string
		want error
	}{
		{name: "empty title", in: map[string]string{"site_title": "   "}, want: ErrSiteTitleEmpty},
		{name: "invalid rss", in: map[string]string{"rss_url": "ftp://example.com/feed"}, want: ErrInvalidRSSURL},
		{name: "invalid github", in: map[string]string{"github_url": "/relative"}, want: ErrInvalidGithubURL},
		{name: "invalid favicon", in: map[string]string{"favicon_url": "javascript:alert(1)"}, want: ErrInvalidFaviconURL},
		{name: "too long", in: map[string]string{"site_description": strings.Repeat("x", maxSiteSettingLength+1)}, want: ErrSettingValueTooLong},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if _, err := svc.UpdateSiteSettings(context.Background(), tt.in); !errors.Is(err, tt.want) {
				t.Fatalf("UpdateSiteSettings() error = %v, want %v", err, tt.want)
			}
		})
	}
}
