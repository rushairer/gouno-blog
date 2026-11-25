package agent

import (
	"context"
	"encoding/base64"
	"testing"
	"time"

	"github.com/rushairer/blog-backend/internal/agent/domain"
	providerdomain "github.com/rushairer/blog-backend/internal/provider/domain"
	"github.com/rushairer/blog-backend/internal/secretbox"
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

func TestValidateAgentRequiresSkillVersion(t *testing.T) {
	service := NewManagementService(ManagementServiceDependencies{}, nil, nil, nil, nil)
	pID := int64(1)
	value := &domain.Agent{
		Name: "test", ProviderProfileID: &pID, TriggerType: domain.AgentTriggerManual,
		DailyRunLimit: 1, MonthlyTokenBudget: 1000,
	}
	if err := service.validateAgent(value); err == nil {
		t.Fatal("expected missing Skill Version to be rejected")
	}
}

func TestValidateAgentAllowsNilProvider(t *testing.T) {
	service := NewManagementService(ManagementServiceDependencies{}, nil, nil, nil, nil)
	vID := int64(1)
	value := &domain.Agent{
		Name: "test", SkillVersionID: &vID, TriggerType: domain.AgentTriggerManual,
		DailyRunLimit: 1, MonthlyTokenBudget: 1000,
	}
	if err := service.validateAgent(value); err != nil {
		t.Fatalf("expected nil provider to be valid (inheriting default), got error: %v", err)
	}
	if value.ProviderProfileID != nil {
		t.Fatalf("expected ProviderProfileID to remain nil")
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
	service := NewManagementService(ManagementServiceDependencies{}, nil, nil, []string{"content.propose_update"}, []string{"content.propose_update"})
	err := service.validateSkill(&domain.AgentSkill{
		Name: "safe", SystemPrompt: "review", Capabilities: []string{"content.propose_update"},
		ExecutionMode: domain.AgentModeAdvisory, MaxSteps: 1, MaxInputTokens: 100, MaxOutputTokens: 100,
		DefaultDailyRunLimit: 1, DefaultMonthlyTokenBudget: 1000,
	})
	if err == nil {
		t.Fatal("expected proposal capability to be rejected")
	}
}

type profileSnapshotStore struct {
	ManagementProviderStore
	listed, selected, later *providerdomain.ProviderProfile
	reads int
}

func (s *profileSnapshotStore) ListProviders(context.Context) ([]*providerdomain.ProviderProfile, error) {
	return []*providerdomain.ProviderProfile{s.listed}, nil
}

func (s *profileSnapshotStore) GetProvider(context.Context, int64) (*providerdomain.ProviderProfile, error) {
	s.reads++
	if s.reads == 1 {
		return s.selected, nil
	}
	return s.later, nil
}

func TestAgentProviderUsesSameSnapshotForClientAndEvidence(t *testing.T) {
	box, err := secretbox.New(base64.StdEncoding.EncodeToString(make([]byte, 32)))
	if err != nil {
		t.Fatal(err)
	}
	const id int64 = 9
	ciphertext, nonce, err := box.EncryptWithAAD("fixture-key", secretbox.ProviderAPIKeyAAD(id, box.KeyVersion()))
	if err != nil {
		t.Fatal(err)
	}
	selected := &providerdomain.ProviderProfile{
		ID: id, Enabled: true, IsDefaultWriting: true,
		ProviderType: "openai", Vendor: "openai",
		BaseURL: "http://127.0.0.1:1", Model: "selected-model",
		APIKeyCiphertext: ciphertext, APIKeyNonce: nonce, KeyVersion: box.KeyVersion(),
		RequestTimeoutSeconds: 1,
	}
	listed, later := *selected, *selected
	listed.Model, later.Model = "stale-list-model", "later-model"
	for _, explicit := range []bool{true, false} {
		store := &profileSnapshotStore{listed: &listed, selected: selected, later: &later}
		service := NewManagementService(ManagementServiceDependencies{Providers: store}, box, []string{"127.0.0.1"}, nil, nil)
		agent := &domain.Agent{}
		if explicit {
			value := id
			agent.ProviderProfileID = &value
		}
		profile, client, err := service.AgentProviderClient(context.Background(), agent)
		if err != nil {
			t.Fatal(err)
		}
		if store.reads != 1 || profile != selected || client.Model() != profile.Model {
			t.Fatalf("explicit=%v reads=%d profile=%#v client model=%s", explicit, store.reads, profile.ID, client.Model())
		}
	}
}

func TestDefaultWritingClientRejectsReassignedProfile(t *testing.T) {
	listed := &providerdomain.ProviderProfile{ID: 9, Enabled: true, IsDefaultWriting: true}
	selected := *listed
	selected.IsDefaultWriting = false
	store := &profileSnapshotStore{listed: listed, selected: &selected, later: &selected}
	service := NewManagementService(ManagementServiceDependencies{Providers: store}, nil, nil, nil, nil)
	if _, _, err := service.DefaultWritingClient(context.Background()); err == nil {
		t.Fatal("stale default selection remained authorized")
	}
}
