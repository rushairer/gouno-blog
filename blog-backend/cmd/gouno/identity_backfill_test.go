package gouno

import (
	"bytes"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestIdentityApprovalCLIRejectsUnsafeInputBeforeDatabase(t *testing.T) {
	for _, tc := range []struct {
		name, body string
		confirm    bool
		want       string
	}{
		{"confirmation", `[]`, false, "--confirm"},
		{"unknown field", `[{"password":"do-not-log"}]`, true, "invalid mapping JSON"},
		{"trailing object", `[] {}`, true, "one JSON array"},
		{"oversized", strings.Repeat("x", 1024*1024+1), true, "exceeds"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			path := filepath.Join(t.TempDir(), "mapping.json")
			if err := os.WriteFile(path, []byte(tc.body), 0600); err != nil {
				t.Fatal(err)
			}
			cmd := newIdentityBackfillCommand()
			out := &bytes.Buffer{}
			cmd.SetOut(out)
			cmd.SetErr(out)
			args := []string{"approve", "--file", path, "--approved-by", "operator", "--reason", "verified"}
			if tc.confirm {
				args = append(args, "--confirm")
			}
			cmd.SetArgs(args)
			err := cmd.Execute()
			if err == nil || !strings.Contains(err.Error(), tc.want) {
				t.Fatalf("got %v", err)
			}
			if strings.Contains(out.String(), "do-not-log") {
				t.Fatal("mapping content logged")
			}
		})
	}
}
