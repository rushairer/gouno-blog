package service

import (
	"errors"
	"testing"

	"github.com/lib/pq"
)

func TestPageConstraintMappingOnlyClaimsUniqueViolations(t *testing.T) {
	unique := &pq.Error{Code: "23505"}
	if err := pageSaveError(unique); !errors.Is(err, ErrDuplicateSlug) {
		t.Fatalf("unique Slug constraint result=%v, want Page domain duplicate", err)
	}
	for _, code := range []string{"23503", "23514", "08006"} {
		err := &pq.Error{Code: pq.ErrorCode(code)}
		if got := pageSaveError(err); !errors.Is(got, err) {
			t.Fatalf("SQLSTATE %s incorrectly reclassified: %v", code, got)
		}
	}
}
