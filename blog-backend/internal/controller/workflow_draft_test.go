package controller

import "testing"

func TestExtractWorkflowDraftJSON(t *testing.T) {
	tests := []struct {
		name  string
		input string
		ok    bool
	}{
		{name: "plain", input: `{"name":"draft","input_schema":{},"steps":[]}`, ok: true},
		{name: "code fence", input: "Here is the draft:\n```json\n{\"name\":\"draft\",\"input_schema\":{},\"steps\":[]}\n```", ok: true},
		{name: "braces in string", input: `prefix {"name":"{draft}","input_schema":{},"steps":[]} suffix`, ok: true},
		{name: "not json", input: "I cannot create a draft", ok: false},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			_, ok := extractWorkflowDraftJSON(test.input)
			if ok != test.ok { t.Fatalf("ok=%v, want %v", ok, test.ok) }
		})
	}
}
