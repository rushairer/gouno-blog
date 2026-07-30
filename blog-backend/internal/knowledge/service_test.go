package knowledge

import (
	"math"
	"strings"
	"testing"
)

func TestSplitMarkdownIsBoundedAndOverlapping(t *testing.T) {
	text := "# Intro\n" + strings.Repeat("knowledge ", 400)
	chunks := splitMarkdown(text)
	if len(chunks) < 2 {
		t.Fatalf("expected multiple chunks, got %d", len(chunks))
	}
	if chunks[0].Heading != "Intro" {
		t.Fatalf("heading = %q", chunks[0].Heading)
	}
	for index, chunk := range chunks {
		if chunk.End <= chunk.Start || len([]rune(chunk.Content)) > 1200 {
			t.Fatalf("invalid chunk %d: %#v", index, chunk)
		}
		if index > 0 && chunk.Start >= chunks[index-1].End {
			t.Fatalf("chunk %d does not overlap its predecessor", index)
		}
	}
}

func TestVectorLiteralSanitizesNonFiniteValues(t *testing.T) {
	got := vectorLiteral([]float64{1.25, math.NaN(), math.Inf(1)})
	if got != "[1.25,0,0]" {
		t.Fatalf("vector literal = %q", got)
	}
}

func TestPercentile95(t *testing.T) {
	if got := percentile95([]float64{1, 2, 3, 4, 100}); got != 100 {
		t.Fatalf("p95 = %v", got)
	}
	if got := percentile95(nil); got != 0 {
		t.Fatalf("empty p95 = %v", got)
	}
}
