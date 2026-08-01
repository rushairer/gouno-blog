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

func TestValidateAgentRequiresSkillVersion(t *testing.T) {
	service := NewManagementService(nil, nil, nil, nil, nil)
	value := &domain.Agent{
		Name: "test", ProviderProfileID: 1, TriggerType: domain.AgentTriggerManual,
		DailyRunLimit: 1, MonthlyTokenBudget: 1000,
	}
	if err := service.validateAgent(value); err == nil {
		t.Fatal("expected missing Skill Version to be rejected")
	}
}

func TestValidateOverridesOnlyAllowsTighterSkillLimits(t *testing.T) {
	skill := &domain.AgentSkill{MaxSteps: 6, MaxInputTokens: 1200, MaxOutputTokens: 400}
	lowerSteps, lowerInput, lowerOutput := 4, 1000, 300
	if err := validateOverrides(&domain.Agent{
		MaxStepsOverride: &lowerSteps, MaxInputTokensOverride: &lowerInput, MaxOutputTokensOverride: &lowerOutput,
	}, skill); err != nil {
		t.Fatalf("expected tighter overrides to be accepted: %v", err)
	}
	if err := validateOverrides(&domain.Agent{}, skill); err != nil {
		t.Fatalf("expected inherited Skill limits to be accepted: %v", err)
	}
	higherSteps := 7
	if err := validateOverrides(&domain.Agent{MaxStepsOverride: &higherSteps}, skill); err == nil {
		t.Fatal("expected an override above the bound Skill limit to be rejected")
	}
}

func TestValidateSkillRejectsProposalCapabilityInAdvisoryMode(t *testing.T) {
	service := NewManagementService(nil, nil, nil, []string{"content.propose_update"}, []string{"content.propose_update"})
	err := service.validateSkill(&domain.AgentSkill{
		Name: "safe", SystemPrompt: "review", Capabilities: []string{"content.propose_update"},
		ExecutionMode: domain.AgentModeAdvisory, MaxSteps: 1, MaxInputTokens: 100, MaxOutputTokens: 100,
		DefaultDailyRunLimit: 1, DefaultMonthlyTokenBudget: 1000,
	})
	if err == nil {
		t.Fatal("expected proposal capability to be rejected")
	}
}
