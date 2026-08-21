package controller

import (
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
)

func TestBindAgentJSONRejectsUnknownFields(t *testing.T) {
	gin.SetMode(gin.TestMode)
	request := httptest.NewRequest("POST", "/", strings.NewReader(`{"name":"provider","unknown":true}`))
	request.Header.Set("Content-Type", "application/json")
	context, _ := gin.CreateTestContext(httptest.NewRecorder())
	context.Request = request

	var value providerRequest
	if err := bindAgentJSON(context, &value); err == nil {
		t.Fatal("expected unknown JSON field to be rejected")
	}
}

func TestBindAgentJSONRunsStructValidation(t *testing.T) {
	gin.SetMode(gin.TestMode)
	request := httptest.NewRequest("POST", "/", strings.NewReader(`{"name":"provider"}`))
	request.Header.Set("Content-Type", "application/json")
	context, _ := gin.CreateTestContext(httptest.NewRecorder())
	context.Request = request

	var value providerRequest
	if err := bindAgentJSON(context, &value); err == nil {
		t.Fatal("expected required fields to be validated")
	}
}

func TestBindWorkflowJSONRejectsOversizedBody(t *testing.T) {
	gin.SetMode(gin.TestMode)
	request := httptest.NewRequest("POST", "/", strings.NewReader(`{"prompt":"`+strings.Repeat("x", maxWorkflowJSONBody)+`"}`))
	recorder := httptest.NewRecorder()
	context, _ := gin.CreateTestContext(recorder)
	context.Request = request

	var value workflowDraftRequest
	if bindWorkflowJSON(context, &value) {
		t.Fatal("expected oversized workflow request to be rejected")
	}
	if recorder.Code != 413 {
		t.Fatalf("status = %d, want 413", recorder.Code)
	}
}

func TestCleanDraftAssistContent(t *testing.T) {
	// Case 1: Pure Markdown
	raw1 := "# Title\n\nThis is content."
	if got := cleanDraftAssistContent(raw1); got != raw1 {
		t.Errorf("cleanDraftAssistContent(raw1) = %q, want %q", got, raw1)
	}

	// Case 2: Standard JSON
	raw2 := `{"suggestions": ["# Title\n\nThis is content."]}`
	if got := cleanDraftAssistContent(raw2); got != raw1 {
		t.Errorf("cleanDraftAssistContent(raw2) = %q, want %q", got, raw1)
	}

	// Case 3: Malformed JSON with literal newlines & escaping as in user screenshot
	raw3 := "{\n  \"suggestions\": [\n    \"\\n# Title\\n\\nThis is content.\"\n  ]\n}"
	if got := cleanDraftAssistContent(raw3); got != raw1 {
		t.Errorf("cleanDraftAssistContent(raw3) = %q, want %q", got, raw1)
	}

	// Case 4: Markdown in code fence
	raw4 := "```markdown\n# Title\n\nThis is content.\n```"
	if got := cleanDraftAssistContent(raw4); got != raw1 {
		t.Errorf("cleanDraftAssistContent(raw4) = %q, want %q", got, raw1)
	}
}

func TestExtractDraftSuggestions(t *testing.T) {
	// Case 1: Standard JSON object
	r1 := `{"suggestions": ["标题一", "标题二", "标题三"]}`
	res1 := extractDraftSuggestions(r1)
	if len(res1) != 3 || res1[0] != "标题一" {
		t.Fatalf("extractDraftSuggestions(r1) = %v, want 3 items", res1)
	}

	// Case 2: JSON in markdown code fence
	r2 := "```json\n{\n  \"suggestions\": [\n    \"摘要一\",\n    \"摘要二\"\n  ]\n}\n```"
	res2 := extractDraftSuggestions(r2)
	if len(res2) != 2 || res2[0] != "摘要一" {
		t.Fatalf("extractDraftSuggestions(r2) = %v, want 2 items", res2)
	}

	// Case 3: JSON array
	r3 := `["候选1", "候选2", "候选3"]`
	res3 := extractDraftSuggestions(r3)
	if len(res3) != 3 || res3[0] != "候选1" {
		t.Fatalf("extractDraftSuggestions(r3) = %v, want 3 items", res3)
	}

	// Case 4: Plain text numbered list
	r4 := "1. 第一条建议\n2. 第二条建议\n3. 第三条建议"
	res4 := extractDraftSuggestions(r4)
	if len(res4) != 3 || res4[0] != "第一条建议" {
		t.Fatalf("extractDraftSuggestions(r4) = %v, want 3 items", res4)
	}

	// Case 5: Single raw text summary
	r5 := "这是一篇介绍 AI 编程依赖症的文章，深度剖析了原因与应对思路。"
	res5 := extractDraftSuggestions(r5)
	if len(res5) != 1 || res5[0] != r5 {
		t.Fatalf("extractDraftSuggestions(r5) = %v, want 1 item", res5)
	}

	// Case 6: Truncated JSON array with multiple items
	r6 := "{\n  \"suggestions\": [\n    \"摘要候选一内容...\",\n    \"摘要候选二内容...\",\n"
	res6 := extractDraftSuggestions(r6)
	if len(res6) != 2 || res6[0] != "摘要候选一内容..." || res6[1] != "摘要候选二内容..." {
		t.Fatalf("extractDraftSuggestions(r6) = %v, want 2 separate items", res6)
	}

	// Case 7: 5 tags in JSON array
	r7 := `{"suggestions": ["AI", "Go", "架构", "全栈", "思考"]}`
	res7 := extractDraftSuggestions(r7)
	if len(res7) != 5 || res7[4] != "思考" {
		t.Fatalf("extractDraftSuggestions(r7) = %v, want 5 tags", res7)
	}
}

func TestExtractStructuredMetadata(t *testing.T) {
	raw := "```json\n{\n  \"summary\": \"这是一篇关于AI与人类思考的文章\",\n  \"tags\": [\"AI\", \"思考\", \"成长\"],\n  \"slug\": \"ai-and-human-thinking\",\n  \"seo_title\": \"AI时代的人类思考 | 思考与实践\",\n  \"seo_description\": \"深度探讨AI时代如何保持独立思考能力与批判性思维。\",\n  \"category\": \"技术思考\",\n  \"cover_alt\": \"一个程序员在思考的插画\"\n}\n```"
	meta := extractStructuredMetadata(raw)
	if meta == nil {
		t.Fatalf("extractStructuredMetadata returned nil")
	}
	if meta.Summary != "这是一篇关于AI与人类思考的文章" {
		t.Errorf("summary = %q, want expected", meta.Summary)
	}
	if len(meta.Tags) != 3 || meta.Tags[0] != "AI" {
		t.Errorf("tags = %v, want 3 items", meta.Tags)
	}
	if meta.Slug != "ai-and-human-thinking" {
		t.Errorf("slug = %q, want ai-and-human-thinking", meta.Slug)
	}
	if meta.SeoTitle != "AI时代的人类思考 | 思考与实践" {
		t.Errorf("seo_title = %q, want expected", meta.SeoTitle)
	}
	if meta.Category != "技术思考" {
		t.Errorf("category = %q, want 技术思考", meta.Category)
	}
	if meta.CoverAlt != "一个程序员在思考的插画" {
		t.Errorf("cover_alt = %q, want expected", meta.CoverAlt)
	}
}


