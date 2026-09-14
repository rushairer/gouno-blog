package dbtx_test

import (
	"errors"
	"os"
	"testing"
)

func TestRetiredRootRepositoryBucketDoesNotReturn(t *testing.T) {
	if _, err := os.Stat("../repository"); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("retired internal/repository bucket exists: %v", err)
	}
}
