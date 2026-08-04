package repository

import "testing"

func TestGenerationFailureEvent(t *testing.T) {
	if got := generationFailureEvent("image_generation_timeout"); got != "image_generation_timed_out" {
		t.Fatalf("timeout event = %q", got)
	}
	if got := generationFailureEvent("image_generation_failed"); got != "image_generation_failed" {
		t.Fatalf("failure event = %q", got)
	}
}
