package controller

import (
	"strings"
	"testing"

	"github.com/rushairer/blog-backend/internal/domain"
	"github.com/rushairer/blog-backend/internal/workflowplan"
)

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
			_, ok := workflowplan.ExtractWorkflowDraftJSON(test.input)
			if ok != test.ok {
				t.Fatalf("ok=%v, want %v", ok, test.ok)
			}
		})
	}
	if !strings.Contains(workflowplan.WorkflowPlannerPrompt, "media.create_image_task") || !strings.Contains(workflowplan.WorkflowPlannerCorrectionPrompt, "agent_id must be an integer") {
		t.Fatal("planner prompts must constrain image goals and integer Agent IDs")
	}
}

func TestBuildAutomationPlan(t *testing.T) {
	provider := &domain.ProviderProfile{ID: 1, Name: "Writing", Model: "test", Enabled: true, IsDefaultWriting: true}
	skill := &domain.AgentSkill{ID: 2, VersionID: 3, Name: "Review", Capabilities: []string{"content.audit_post"}, ExecutionMode: domain.AgentModeApproval}
	agent := &domain.Agent{ID: 4, Name: "Reviewer", Enabled: true, ProviderProfileID: provider.ID, SkillVersionID: &skill.VersionID, Skill: skill}

	t.Run("reuses ready dependency chain", func(t *testing.T) {
		plan := workflowplan.BuildAutomationPlan("review posts", []*domain.ProviderProfile{provider}, []*domain.Agent{agent}, []*domain.AgentSkill{skill})
		if plan.Provider["status"] != "ready" || plan.Skill["status"] != "reuse" || plan.Agent["status"] != "reuse" {
			t.Fatalf("unexpected statuses: %#v", plan)
		}
		if len(plan.Prerequisites) != 0 || len(plan.Workflow.Steps) == 0 || plan.Workflow.Steps[0].AgentID != agent.ID {
			t.Fatalf("expected reusable workflow plan: %#v", plan)
		}
	})

	t.Run("returns unpersisted drafts when dependencies are missing", func(t *testing.T) {
		plan := workflowplan.BuildAutomationPlan("review posts", nil, nil, nil)
		if plan.Provider["status"] != "missing" || plan.Skill["status"] != "draft" || plan.Agent["status"] != "draft" {
			t.Fatalf("unexpected statuses: %#v", plan)
		}
		if len(plan.Prerequisites) != 3 || plan.Workflow.Enabled || plan.Workflow.Steps[0].AgentID != 0 {
			t.Fatalf("unsafe missing-dependency plan: %#v", plan)
		}
	})

	t.Run("matches the agent capability to the requested automation", func(t *testing.T) {
		commentSkill := &domain.AgentSkill{ID: 5, VersionID: 6, Name: "Comments", Capabilities: []string{"comments.get_comment", "comments.propose_reply"}, ExecutionMode: domain.AgentModeApproval}
		commentAgent := &domain.Agent{ID: 7, Name: "Commenter", Enabled: true, ProviderProfileID: provider.ID, SkillVersionID: &commentSkill.VersionID, Skill: commentSkill}
		plan := workflowplan.BuildAutomationPlan("为评论生成回复草案", []*domain.ProviderProfile{provider}, []*domain.Agent{agent, commentAgent}, []*domain.AgentSkill{skill, commentSkill})
		if plan.Agent["id"] != commentAgent.ID || plan.Skill["id"] != commentSkill.ID {
			t.Fatalf("expected comment dependency match: %#v", plan)
		}
	})
}

func TestImageBriefWorkflowContract(t *testing.T) {
	draft := workflowplan.FallbackWorkflowDraft("为文章生成封面和文中配图 Brief", 9, true)
	if !strings.Contains(string(draft.InputSchema), `"image_brief"`) || draft.Steps[0].InputPointer != "/input" {
		t.Fatalf("image brief fallback contract = %#v", draft)
	}
	plan := workflowplan.BuildAutomationPlan("选择文章生成配图 Brief", nil, nil, nil)
	if plan.Skill["status"] != "draft" || !strings.Contains(strings.Join(plan.Skill["draft"].(map[string]any)["capabilities"].([]string), ","), "content.propose_distribution_draft") {
		t.Fatalf("image brief plan capabilities = %#v", plan.Skill)
	}
}

func TestImageGenerationPlanUsesInternalTaskWithoutApproval(t *testing.T) {
	provider := &domain.ProviderProfile{ID: 1, Name: "Writing", Model: "test", Enabled: true, IsDefaultWriting: true, IsDefaultImage: true}
	skill := &domain.AgentSkill{ID: 2, VersionID: 3, Name: "Distribution", Capabilities: []string{"content.get_post", "content.propose_distribution_draft", "media.create_image_task"}, ExecutionMode: domain.AgentModeApproval}
	agent := &domain.Agent{ID: 4, Name: "Distribution", Enabled: true, ProviderProfileID: provider.ID, ProviderProfile: provider, SkillVersionID: &skill.VersionID, Skill: skill}

	plan := workflowplan.BuildAutomationPlan("为文章生成封面和正文配图", []*domain.ProviderProfile{provider}, []*domain.Agent{agent}, []*domain.AgentSkill{skill})
	capabilities := plan.Skill["capabilities"].([]string)
	if !strings.Contains(strings.Join(capabilities, ","), "media.create_image_task") {
		t.Fatalf("image generation capabilities = %#v", capabilities)
	}
}

func TestPageDraftWorkflowContract(t *testing.T) {
	prompt := "给“单页”做一个Workflow。不需要审核，直接运行后，到运行中心，然后等我输入一段提示词后，给“单页”生成新正文，可以重复生成。等我确认后保持单页。"
	draft := workflowplan.FallbackWorkflowDraft(prompt, 15, false)
	if !strings.Contains(string(draft.InputSchema), `"page_ids"`) || !strings.Contains(string(draft.InputSchema), `"prompt"`) {
		t.Fatalf("page fallback draft must contain page_ids and prompt: %s", draft.InputSchema)
	}
	plan := workflowplan.BuildAutomationPlan(prompt, nil, nil, nil)
	capabilities := plan.Skill["draft"].(map[string]any)["capabilities"].([]string)
	if !strings.Contains(strings.Join(capabilities, ","), "content.propose_page_update") {
		t.Fatalf("expected propose_page_update capability for page generation plan: %#v", capabilities)
	}
}

func TestCustomGoalDetectionAndAgentNormalization(t *testing.T) {
	if !isCustomOrCompositeGoal("每天自动筛选文章并生成摘要") {
		t.Fatal("expected daily goal to be composite")
	}
	if !isCustomOrCompositeGoal("等我输入一段提示词后生成单页") {
		t.Fatal("expected prompt input goal to be custom")
	}
	if isCustomOrCompositeGoal("生成文章配图 Brief") {
		t.Fatal("standard brief goal must not be composite")
	}

	steps := []domain.WorkflowStep{
		{ID: "select", Type: "resource_query", ResourceType: "post"},
		{ID: "batch", Type: "for_each", CollectionPointer: "/steps/select", Steps: []domain.WorkflowStep{
			{ID: "inner", Type: "model", AgentID: 0},
		}},
		{ID: "top_model", Type: "model", AgentID: 0},
	}
	normalized := workflowplan.NormalizeDraftAgentIDs(steps, 42)
	if normalized[1].Steps[0].AgentID != 42 || normalized[2].AgentID != 42 {
		t.Fatalf("agent IDs not normalized: %#v", normalized)
	}
}


