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
