package agent

import "testing"

func TestApprovalMutatesExistingPost(t *testing.T) {
	tests := []struct {
		action string
		want   bool
	}{
		{action: "update_post", want: true},
		{action: "update_tags", want: true},
		{action: "create_content_candidates", want: false},
		{action: "create_distribution_draft", want: false},
	}
	for _, test := range tests {
		if got := approvalMutatesExistingPost(test.action); got != test.want {
			t.Fatalf("approvalMutatesExistingPost(%q) = %v, want %v", test.action, got, test.want)
		}
	}
}
