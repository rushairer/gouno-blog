package postversion

import (
	"os"
	"strings"
	"testing"
)

func TestPostVersionRepositoryDoesNotOwnPostWritesOrTransactions(t *testing.T) {
	data, err := os.ReadFile("repository/repository.go")
	if err != nil {
		t.Fatal(err)
	}
	text := string(data)
	for _, forbidden := range []string{"BeginTx(", "UPDATE posts", "RestoreVersion("} {
		if strings.Contains(text, forbidden) {
			t.Errorf("PostVersion repository still owns cross-capability restore behavior %q", forbidden)
		}
	}
	if !strings.Contains(text, "GetVersionTx(") {
		t.Fatal("PostVersion transaction-aware snapshot reader is missing")
	}
}

func TestPostRepositoryOwnsRestoreWritePort(t *testing.T) {
	data, err := os.ReadFile("../post/repository/post_repository.go")
	if err != nil {
		t.Fatal(err)
	}
	text := string(data)
	if !strings.Contains(text, "RestoreSnapshotTx(") || !strings.Contains(text, "UPDATE posts SET") {
		t.Fatal("Post repository does not own the restore write port")
	}
}

func TestRestoreCoordinatorOwnsTransactionScope(t *testing.T) {
	data, err := os.ReadFile("coordinator.go")
	if err != nil {
		t.Fatal(err)
	}
	text := string(data)
	if !strings.Contains(text, "c.transactor.Run(") || !strings.Contains(text, "c.versions.GetVersionTx(") || !strings.Contains(text, "c.posts.RestoreSnapshotTx(") {
		t.Fatal("restore coordinator does not own the expected transaction orchestration")
	}
}
