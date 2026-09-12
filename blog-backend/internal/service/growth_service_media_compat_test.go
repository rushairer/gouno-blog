package service

import (
	"errors"
	"testing"

	mediaservice "github.com/rushairer/blog-backend/internal/media/service"
)

func TestLegacyMediaErrorCompatibility(t *testing.T) {
	if ErrMediaInUse != mediaservice.ErrMediaInUse {
		t.Fatal("ErrMediaInUse must alias the canonical Media sentinel")
	}
	if ErrInvalidMediaPayload != mediaservice.ErrInvalidMediaPayload {
		t.Fatal("ErrInvalidMediaPayload must alias the canonical Media sentinel")
	}
	if ErrInvalidMediaID != mediaservice.ErrInvalidMediaID {
		t.Fatal("ErrInvalidMediaID must alias the canonical Media sentinel")
	}
	if err := legacyMediaError(mediaservice.ErrMediaNotFound); !errors.Is(err, ErrPostNotFound) {
		t.Fatalf("legacy media not-found error=%v, want ErrPostNotFound", err)
	}
	other := errors.New("other")
	if err := legacyMediaError(other); err != other {
		t.Fatalf("legacyMediaError changed unrelated error: got %v want %v", err, other)
	}
}
