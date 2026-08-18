package service_test

import (
	"testing"

	"github.com/rushairer/blog-backend/internal/service"
)

func TestValidateSlug(t *testing.T) {
	tests := []struct {
		slug    string
		wantErr bool
	}{
		{"about", false},
		{"about-me", false},
		{"friends-links-2026", false},
		{"", true},
		{"admin", true},
		{"articles", true},
		{"api", true},
		{"feed.xml", true},
		{"sitemap.xml", true},
		{"About", true},      // Capital letter before normalization
		{"about/me", true},   // Slash
		{"about_me", true},   // Underscore
		{"-about", true},     // Leading dash
		{"about-", true},     // Trailing dash
	}

	for _, tt := range tests {
		t.Run(tt.slug, func(t *testing.T) {
			err := service.ValidateSlug(tt.slug)
			if (err != nil) != tt.wantErr {
				t.Errorf("ValidateSlug(%q) err = %v, wantErr %v", tt.slug, err, tt.wantErr)
			}
		})
	}
}

func TestNormalizeSlug(t *testing.T) {
	tests := []struct {
		input    string
		expected string
	}{
		{"  About  ", "about"},
		{"/about/", "about"},
		{"MY-PAGE", "my-page"},
	}

	for _, tt := range tests {
		t.Run(tt.input, func(t *testing.T) {
			got := service.NormalizeSlug(tt.input)
			if got != tt.expected {
				t.Errorf("NormalizeSlug(%q) = %q, expected %q", tt.input, got, tt.expected)
			}
		})
	}
}
