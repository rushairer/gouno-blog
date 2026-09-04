package controller

import "testing"

func TestDetectMediaContentType(t *testing.T) {
	tests := []struct {
		name     string
		filename string
		sample   []byte
		want     string
	}{
		{
			name:     "svg with xml declaration",
			filename: "icon.svg",
			sample:   []byte(`<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"></svg>`),
			want:     "image/svg+xml",
		},
		{
			name:     "ico magic header",
			filename: "favicon.ico",
			sample:   []byte{0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x10, 0x10},
			want:     "image/x-icon",
		},
		{
			name:     "avif ftyp brand",
			filename: "cover.avif",
			sample: []byte{
				0x00, 0x00, 0x00, 0x18,
				'f', 't', 'y', 'p',
				'a', 'v', 'i', 'f',
				0x00, 0x00, 0x00, 0x00,
				'a', 'v', 'i', 'f',
			},
			want: "image/avif",
		},
		{
			name:     "png remains detected by content",
			filename: "image.png",
			sample:   []byte{0x89, 'P', 'N', 'G', '\r', '\n', 0x1a, '\n', 0x00, 0x00, 0x00, 0x0d, 'I', 'H', 'D', 'R'},
			want:     "image/png",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := detectMediaContentType(tt.filename, tt.sample); got != tt.want {
				t.Fatalf("detectMediaContentType() = %q, want %q", got, tt.want)
			}
		})
	}
}

func TestDetectMediaContentTypeDoesNotTrustExtension(t *testing.T) {
	got := detectMediaContentType("fake.svg", []byte("plain text, not an svg document"))
	if got == "image/svg+xml" {
		t.Fatalf("detectMediaContentType() trusted SVG extension without SVG content")
	}

	got = detectMediaContentType("fake.ico", []byte("plain text, not an icon"))
	if got == "image/x-icon" || got == "image/vnd.microsoft.icon" {
		t.Fatalf("detectMediaContentType() trusted ICO extension without ICO content")
	}
}
