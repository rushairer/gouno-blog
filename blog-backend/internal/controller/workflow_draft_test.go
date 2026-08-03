package controller

import (
	"testing"

	"github.com/rushairer/blog-backend/internal/domain"
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
			_, ok := extractWorkflowDraftJSON(test.input)
			if ok != test.ok {
				t.Fatalf("ok=%v, want %v", ok, test.ok)
			}
		})
	}
}

func TestBuildAutomationPlan(t *testing.T) {
	provider := &domain.ProviderProfile{ID: 1, Name: "Writing", Model: "test", Enabled: true, IsDefaultWriting: true}
	skill := &domain.AgentSkill{ID: 2, VersionID: 3, Name: "Review", Capabilities: []string{"content.audit_post"}, ExecutionMode: domain.AgentModeApproval}
	agent := &domain.Agent{ID: 4, Name: "Reviewer", Enabled: true, ProviderProfileID: provider.ID, SkillVersionID: &skill.VersionID, Skill: skill}

	t.Run("reuses ready dependency chain", func(t *testing.T) {
		plan := buildAutomationPlan("review posts", []*domain.ProviderProfile{provider}, []*domain.Agent{agent}, []*domain.AgentSkill{skill})
		if plan.Provider["status"] != "ready" || plan.Skill["status"] != "reuse" || plan.Agent["status"] != "reuse" {
			t.Fatalf("unexpected statuses: %#v", plan)
		}
		if len(plan.Prerequisites) != 0 || len(plan.Workflow.Steps) == 0 || plan.Workflow.Steps[0].AgentID != agent.ID {
			t.Fatalf("expected reusable workflow plan: %#v", plan)
		}
	})

	t.Run("returns unpersisted drafts when dependencies are missing", func(t *testing.T) {
		plan := buildAutomationPlan("review posts", nil, nil, nil)
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
		plan := buildAutomationPlan("为评论生成回复草案", []*domain.ProviderProfile{provider}, []*domain.Agent{agent, commentAgent}, []*domain.AgentSkill{skill, commentSkill})
		if plan.Agent["id"] != commentAgent.ID || plan.Skill["id"] != commentSkill.ID {
			t.Fatalf("expected comment dependency match: %#v", plan)
		}
	})
}
