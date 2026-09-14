package controllerutil_test

import (
	"errors"
	"os"
	"testing"
)

func TestRetiredRootControllerBucketDoesNotReturn(t *testing.T) {
	if _, err := os.Stat("../controller"); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("retired internal/controller bucket exists: %v", err)
	}
}
