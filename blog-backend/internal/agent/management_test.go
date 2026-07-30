package agent

import (
	"testing"
	"time"

	"github.com/rushairer/blog-backend/internal/domain"
)

func TestNextRunUsesAgentTimezone(t *testing.T) {
	expression := "0 9 * * 1"
	value := &domain.Agent{
		Enabled: true, TriggerType: domain.AgentTriggerCron, CronExpression: &expression,
		Timezone: "Asia/Shanghai",
	}
	after := time.Date(2026, 7, 30, 0, 0, 0, 0, time.UTC)
	next, err := NextRun(value, after)
	if err != nil {
		t.Fatal(err)
	}
	want := time.Date(2026, 8, 3, 1, 0, 0, 0, time.UTC)
	if next == nil || !next.Equal(want) {
		t.Fatalf("next = %v, want %v", next, want)
	}
}

func TestNextRunRejectsInvalidCron(t *testing.T) {
	expression := "not cron"
	_, err := NextRun(&domain.Agent{
		Enabled: true, TriggerType: domain.AgentTriggerCron, CronExpression: &expression,
		Timezone: "Asia/Shanghai",
	}, time.Now())
	if err == nil {
		t.Fatal("expected invalid cron error")
	}
}

func TestPresetsOnlyUseKnownExecutionModes(t *testing.T) {
	for _, preset := range Presets() {
		if preset.ID == "" || preset.Name == "" || preset.SystemPrompt == "" || len(preset.Capabilities) == 0 {
			t.Fatalf("invalid preset: %#v", preset)
		}
		if preset.ExecutionMode != domain.AgentModeAdvisory && preset.ExecutionMode != domain.AgentModeApproval {
			t.Fatalf("invalid execution mode: %s", preset.ExecutionMode)
		}
	}
}

func TestValidateAgentRejectsUnknownCapability(t *testing.T) {
	service := NewManagementService(nil, nil, nil, []string{"content.list_posts"}, nil)
	value := &domain.Agent{
		Name: "test", SystemPrompt: "test", ProviderProfileID: 1,
		TriggerType: domain.AgentTriggerManual, ExecutionMode: domain.AgentModeAdvisory,
		MaxSteps: 1, MaxInputTokens: 100, MaxOutputTokens: 100,
		DailyRunLimit: 1, MonthlyTokenBudget: 1000,
		Capabilities: []string{"content.delete_post"},
	}
	if err := service.validateAgent(value); err == nil {
		t.Fatal("expected unknown capability to be rejected")
	}
}

func TestValidateAgentKeepsAdvisoryModeReadOnly(t *testing.T) {
	service := NewManagementService(
		nil, nil, nil,
		[]string{"content.list_posts", "content.propose_update"},
		[]string{"content.propose_update"},
	)
	value := &domain.Agent{
		Name: "test", SystemPrompt: "test", ProviderProfileID: 1,
		TriggerType: domain.AgentTriggerManual, ExecutionMode: domain.AgentModeAdvisory,
		MaxSteps: 1, MaxInputTokens: 100, MaxOutputTokens: 100,
		DailyRunLimit: 1, MonthlyTokenBudget: 1000,
		Capabilities: []string{"content.propose_update"},
	}
	if err := service.validateAgent(value); err == nil {
		t.Fatal("expected proposal capability to be rejected in advisory mode")
	}
}

func TestValidateSkillRejectsProposalCapabilityInAdvisoryMode(t *testing.T) {
	service := NewManagementService(nil, nil, nil, []string{"content.propose_update"}, []string{"content.propose_update"})
	err := service.validateSkill(&domain.AgentSkill{
		Name: "safe", SystemPrompt: "review", Capabilities: []string{"content.propose_update"},
		ExecutionMode: domain.AgentModeAdvisory, MaxSteps: 1, MaxInputTokens: 100, MaxOutputTokens: 100,
		DailyRunLimit: 1, MonthlyTokenBudget: 1000,
	})
	if err == nil {
		t.Fatal("expected proposal capability to be rejected")
	}
}
