package agent

import "testing"

func TestEditorTemplatesPreserveExistingTokenBudgets(t *testing.T) {
	cases := map[string]int{
		"title": 1000, "summary": 2000, "slug": 800, "tags": 800,
		"seo": 2000, "alt": 800, "category": 500, "cover_prompt": 2500, "metadata_all": 3000,
	}
	for task, want := range cases {
		t.Run(task, func(t *testing.T) {
			template, ok := editorTemplate(task)
			if !ok || template.maxTokens(100000) != want {
				t.Fatalf("%s token budget = %d, want %d", task, template.maxTokens(100000), want)
			}
		})
	}
	content, ok := editorTemplate("content")
	if !ok || content.maxTokens(1000) != 6000 || content.maxTokens(100000) != 100000 {
		t.Fatalf("content token budget must preserve min 6000 and provider maximum")
	}
}

func TestEditorPayloadPreservesConditionalFieldsAndTruncationBoundary(t *testing.T) {
	request := EditorTextRequest{Task: "title", Title: "title", Content: string(make([]rune, 4001))}
	content := truncateEditorContent(request.Task, request.Content)
	payload := editorPayload(request, content)
	if got := len([]rune(content)); got != 4019 { // 4,000 plus the historical suffix.
		t.Fatalf("truncated content length = %d", got)
	}
	if contains(payload, "\"prompt\"") || contains(payload, "\"categories\"") {
		t.Fatalf("optional empty editor fields must remain absent: %s", payload)
	}
	if got := truncateEditorContent("content", request.Content); got != request.Content {
		t.Fatal("content generation must not truncate editor input")
	}
}

func TestCleanImagePromptPreservesExistingChineseDescriptionHandling(t *testing.T) {
	if got := cleanImagePrompt("English prompt [中文说明: 示例]"); got != "English prompt" {
		t.Fatalf("bracket explanation = %q", got)
	}
	if got := cleanImagePrompt("English prompt (中文说明: 示例)"); got != "English prompt" {
		t.Fatalf("parenthesized explanation = %q", got)
	}
	if got := cleanImagePrompt("纯中文提示词"); got != "纯中文提示词" {
		t.Fatalf("ordinary prompt = %q", got)
	}
}

func contains(value, part string) bool {
	for i := 0; i+len(part) <= len(value); i++ {
		if value[i:i+len(part)] == part {
			return true
		}
	}
	return false
}
