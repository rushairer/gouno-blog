package dberror

import (
	"fmt"
	"testing"
)

type sqlStateError string

func (e sqlStateError) Error() string    { return string(e) }
func (e sqlStateError) SQLState() string { return string(e) }

func TestIsConstraintError(t *testing.T) {
	for _, code := range []string{"23505", "23503", "23514"} {
		t.Run(code, func(t *testing.T) {
			if !IsConstraintError(fmt.Errorf("wrapped: %w", sqlStateError(code))) {
				t.Fatalf("expected SQLSTATE %s to be classified as a constraint error", code)
			}
		})
	}
	if IsConstraintError(sqlStateError("22001")) {
		t.Fatal("non-constraint SQLSTATE must not be classified as a constraint error")
	}
	if IsConstraintError(nil) {
		t.Fatal("nil must not be classified as a constraint error")
	}
}
