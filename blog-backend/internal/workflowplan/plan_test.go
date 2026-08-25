package workflowplan

import (
	"encoding/json"
	"strings"
	"testing"

	"github.com/rushairer/blog-backend/internal/domain"
	"github.com/rushairer/blog-backend/internal/tool"
)

func TestTypedPlannerEnvelopeValidatesSemanticsWithoutPromptKeywords(t *testing.T) {
	provider := &domain.ProviderProfile{ID: 1, Enabled: true, IsDefaultWriting: true}
	writerSkill := &domain.AgentSkill{VersionID: 2, Capabilities: []string{"content.propose_draft"}, ExecutionMode: domain.AgentModeApproval}
	imageSkill := &domain.AgentSkill{VersionID: 3, Capabilities: []string{"media.create_image_task"}, ExecutionMode: domain.AgentModeApproval}
	writer := &domain.Agent{ID: 10, Enabled: true, SkillVersionID: &writerSkill.VersionID, Skill: writerSkill, ProviderProfile: provider}
	image := &domain.Agent{ID: 11, Enabled: true, SkillVersionID: &imageSkill.VersionID, Skill: imageSkill, ProviderProfile: provider}
	cron := "0 4 * * *"
	envelope := plannerEnvelope{
		Intent: WorkflowIntent{
			Version: PlannerProtocolVersion, Status: "ready", RequiresApproval: true,
			Trigger: IntentTrigger{Type: "cron", CronExpression: cron, Timezone: "Asia/Shanghai"},
			Inputs:  []IntentInput{},
			Operations: []IntentOperation{
				{StepID: "write", ResourceMode: "create", RequiredCapabilities: []string{"content.propose_draft"}},
				{StepID: "cover", ResourceMode: "existing", RequiredCapabilities: []string{"media.create_image_task"}, DependsOn: []string{"write"}},
			},
		},
		Workflow: domain.Workflow{
			CronExpression: &cron, Timezone: "Asia/Shanghai",
			InputSchema: json.RawMessage(`{"type":"object","additionalProperties":false}`),
			Steps: []domain.WorkflowStep{
				{ID: "write", Type: "model", AgentID: 10, InputPointer: "/input"},
				{ID: "review", Type: "approval_gate", InputPointer: "/steps/write"},
				{ID: "cover", Type: "model", AgentID: 11, InputPointer: "/steps/write"},
				{ID: "result", Type: "output", OutputPointer: "/steps/cover"},
			},
		},
	}
	catalog := []tool.CatalogItem{{Name: "content.propose_draft"}, {Name: "media.create_image_task"}}
	if errors := validatePlannerEnvelope(&envelope, []*domain.Agent{writer, image}, catalog); len(errors) != 0 {
		t.Fatalf("valid typed plan was rejected: %v", errors)
	}

	envelope.Intent.Inputs = []IntentInput{{Name: "post_ids", Source: "generated", Type: "post"}}
	envelope.Workflow.InputSchema = json.RawMessage(`{"type":"object","additionalProperties":false,"properties":{"post_ids":{"type":"array"}}}`)
	envelope.Workflow.Steps[2].AgentID = 10
	errors := validatePlannerEnvelope(&envelope, []*domain.Agent{writer, image}, catalog)
	joined := strings.Join(errors, "; ")
	if !strings.Contains(joined, "must not appear in input_schema") || !strings.Contains(joined, "lacks capability") {
		t.Fatalf("semantic contract did not catch generated-input or Agent errors: %v", errors)
	}
}
func TestPersistedStarterTemplatesAreRegistered(t *testing.T) {
	want := []string{
		"daily_news", "weekly_operations", "stale_content_refresh", "low_engagement",
		"selected_pre_publish_review", "selected_internal_linking", "selected_distribution",
		"selected_article_image_generation",
		"selected_comment_replies", "selected_media_review", "selected_page_review", "selected_operations_deep_dive",
		"selected_taxonomy_review", "selected_mixed_review", "scheduled_stale_resource_review",
		"scheduled_post_publish_review", "scheduled_page_review", "scheduled_reported_comment_review", "scheduled_missing_alt_review",
	}
	if got := PersistedTemplateKeys(); len(got) != len(want) {
		t.Fatalf("persisted template count = %d, want %d: %v", len(got), len(want), got)
	}
	for _, key := range want {
		if template, ok := TemplateByKey(key); !ok || template.Key != key {
			t.Fatalf("starter template %q is not registered", key)
		}
	}
	if _, ok := TemplateByKey("not_seeded"); ok {
		t.Fatal("unknown template must not be accepted")
	}
}
