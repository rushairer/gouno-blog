package controller

import (
	"strings"
	"testing"
)

func TestValidateStaticSVGAcceptsDeclarativeContent(t *testing.T) {
	svg := `<?xml version="1.0"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <defs><linearGradient id="g"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#000"/></linearGradient></defs>
  <rect width="32" height="32" fill="url(#g)" style="stroke:url(#g);stroke-width:1"/>
  <image x="4" y="4" width="8" height="8" href="data:image/png;base64,iVBORw0KGgo="/>
</svg>`
	if err := validateStaticSVG(strings.NewReader(svg)); err != nil {
		t.Fatalf("validateStaticSVG() rejected static SVG: %v", err)
	}
}

func TestValidateStaticSVGRejectsActiveContent(t *testing.T) {
	tests := []struct {
		name string
		svg  string
	}{
		{"script", `<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>`},
		{"event handler", `<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><rect width="1" height="1"/></svg>`},
		{"foreign object", `<svg xmlns="http://www.w3.org/2000/svg"><foreignObject><div xmlns="http://www.w3.org/1999/xhtml">x</div></foreignObject></svg>`},
		{"external image", `<svg xmlns="http://www.w3.org/2000/svg"><image href="https://example.com/pixel.png"/></svg>`},
		{"embedded svg data uri", `<svg xmlns="http://www.w3.org/2000/svg"><image href="data:image/svg+xml;base64,PHN2Zz48L3N2Zz4="/></svg>`},
		{"external css url", `<svg xmlns="http://www.w3.org/2000/svg"><rect style="fill:url(https://example.com/pattern.svg#p)"/></svg>`},
		{"escaped presentation url", `<svg xmlns="http://www.w3.org/2000/svg"><rect fill="u\72l(https://example.com/pattern.svg#p)"/></svg>`},
		{"stylesheet processing instruction", `<?xml-stylesheet href="https://example.com/x.css"?><svg xmlns="http://www.w3.org/2000/svg"></svg>`},
		{"doctype", `<!DOCTYPE svg><svg xmlns="http://www.w3.org/2000/svg"></svg>`},
		{"animation attribute rewrite", `<svg xmlns="http://www.w3.org/2000/svg"><a href="#safe"><set attributeName="href" to="javascript:alert(1)"/></a></svg>`},
		{"xml base", `<svg xmlns="http://www.w3.org/2000/svg" xml:base="https://example.com/"><use href="#icon"/></svg>`},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if err := validateStaticSVG(strings.NewReader(test.svg)); err == nil {
				t.Fatal("validateStaticSVG() accepted active SVG content")
			}
		})
	}
}

func TestValidateStaticSVGRejectsMalformedOrNonSVGDocuments(t *testing.T) {
	for name, document := range map[string]string{
		"non svg root": `<html></html>`,
		"malformed":    `<svg><g></svg>`,
		"two roots":    `<svg></svg><svg></svg>`,
	} {
		t.Run(name, func(t *testing.T) {
			if err := validateStaticSVG(strings.NewReader(document)); err == nil {
				t.Fatal("validateStaticSVG() accepted invalid document")
			}
		})
	}
}
