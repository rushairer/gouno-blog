package agent

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"slices"
	"strings"
	"time"

	"github.com/robfig/cron/v3"
	"github.com/rushairer/blog-backend/internal/domain"
	"github.com/rushairer/blog-backend/internal/provider"
	"github.com/rushairer/blog-backend/internal/repository"
	"github.com/rushairer/blog-backend/internal/secretbox"
)

var (
	ErrInvalid       = errors.New("invalid agent configuration")
	ErrConflict      = errors.New("agent configuration conflict")
	ErrNotFound      = errors.New("agent resource not found")
	ErrProviderInUse = errors.New("provider profile is in use")
)

type ManagementService struct {
	repo                 *repository.AgentRepository
	secrets              *secretbox.Box
	allowedHosts         []string
	allowedCapabilities  []string
	proposalCapabilities []string
}

func NewManagementService(repo *repository.AgentRepository, secrets *secretbox.Box, allowedHosts, allowedCapabilities, proposalCapabilities []string) *ManagementService {
	return &ManagementService{
		repo: repo, secrets: secrets, allowedHosts: allowedHosts,
		allowedCapabilities: allowedCapabilities, proposalCapabilities: proposalCapabilities,
	}
}

func (s *ManagementService) ListProviders(ctx context.Context) ([]*domain.ProviderProfile, error) {
	return s.repo.ListProviders(ctx)
}

// DefaultWritingClient is intentionally a narrow capability for dedicated
// system jobs; it does not grant content mutation to normal Agents.
func (s *ManagementService) DefaultWritingClient(ctx context.Context) (*domain.ProviderProfile, provider.Provider, error) {
	profiles, err := s.ListProviders(ctx)
	if err != nil {
		return nil, nil, err
	}
	for _, profile := range profiles {
		if profile.Enabled && profile.IsDefaultWriting {
			client, err := s.ProviderClient(ctx, profile.ID)
			return profile, client, err
		}
	}
	return nil, nil, fmt.Errorf("%w: an enabled default writing Provider is required", ErrInvalid)
}

func (s *ManagementService) Notify(ctx context.Context, recipientPrincipalID int64, eventType, title, body, href, key string) error {
	return s.repo.CreateSystemNotification(ctx, recipientPrincipalID, eventType, title, body, href, key)
}

func (s *ManagementService) GetProvider(ctx context.Context, id int64) (*domain.ProviderProfile, error) {
	value, err := s.repo.GetProvider(ctx, id)
	return value, translateError(err)
}

func (s *ManagementService) SetDefaultProvider(ctx context.Context, id int64, purpose string) error {
	if purpose != "writing" && purpose != "image" {
		return ErrInvalid
	}
	return translateError(s.repo.SetDefaultProvider(ctx, id, purpose))
}

func (s *ManagementService) SaveProvider(ctx context.Context, profile *domain.ProviderProfile, apiKey string) error {
	profile.Name = strings.TrimSpace(profile.Name)
	profile.BaseURL = strings.TrimRight(strings.TrimSpace(profile.BaseURL), "/")
	profile.Model = strings.TrimSpace(profile.Model)
	if profile.RequestTimeoutSeconds == 0 {
		profile.RequestTimeoutSeconds = 60
	}
	if profile.MaxOutputTokens == 0 {
		profile.MaxOutputTokens = 2000
	}
	if err := s.validateProvider(ctx, profile); err != nil {
		return err
	}
	replaceSecret := apiKey != ""
	isNew := profile.ID == 0
	if isNew && !replaceSecret {
		return fmt.Errorf("%w: API key is required", ErrInvalid)
	}
	if isNew {
		id, err := s.repo.ReserveProviderID(ctx)
		if err != nil {
			return err
		}
		profile.ID = id
	}
	if replaceSecret {
		keyVersion := s.secrets.KeyVersion()
		ciphertext, nonce, err := s.secrets.EncryptWithAAD(apiKey, secretbox.ProviderAPIKeyAAD(profile.ID, keyVersion))
		if err != nil {
			return err
		}
		profile.APIKeyCiphertext = ciphertext
		profile.APIKeyNonce = nonce
		profile.APIKeyLast4 = secretbox.Last4(apiKey)
		profile.KeyVersion = keyVersion
		profile.HasAPIKey = true
	}
	var err error
	if isNew {
		err = s.repo.CreateProvider(ctx, profile)
	} else {
		err = s.repo.UpdateProvider(ctx, profile, replaceSecret)
	}
	return translateError(err)
}

func (s *ManagementService) validateProvider(ctx context.Context, profile *domain.ProviderProfile) error {
	if profile.Name == "" || profile.Model == "" {
		return fmt.Errorf("%w: name and model are required", ErrInvalid)
	}
	if profile.ProviderType != domain.ProviderOpenAI && profile.ProviderType != domain.ProviderAnthropic && profile.ProviderType != domain.ProviderGemini {
		return fmt.Errorf("%w: unsupported provider type", ErrInvalid)
	}
	if err := provider.ValidateUpstreamURL(ctx, profile.BaseURL, s.allowedHosts); err != nil {
		return fmt.Errorf("%w: %v", ErrInvalid, err)
	}
	if profile.RequestTimeoutSeconds < 1 || profile.RequestTimeoutSeconds > 1800 ||
		profile.MaxOutputTokens < 1 || profile.MaxOutputTokens > 100000 {
		return fmt.Errorf("%w: provider limits are outside allowed ranges", ErrInvalid)
	}
	return nil
}

func (s *ManagementService) DeleteProvider(ctx context.Context, id int64) error {
	err := s.repo.DeleteProvider(ctx, id)
	if errors.Is(err, repository.ErrResourceInUse) || repository.IsConstraintError(err) {
		msg := err.Error()
		if idx := strings.Index(msg, ": "); idx != -1 {
			return fmt.Errorf("%w: %s", ErrProviderInUse, msg[idx+2:])
		}
		return ErrProviderInUse
	}
	return translateError(err)
}

func (s *ManagementService) ResolveAgentProvider(ctx context.Context, agent *domain.Agent) (*domain.ProviderProfile, error) {
	if agent.ProviderProfileID != nil && *agent.ProviderProfileID > 0 {
		return s.GetProvider(ctx, *agent.ProviderProfileID)
	}
	profile, _, err := s.DefaultWritingClient(ctx)
	if err != nil {
		return nil, fmt.Errorf("%w: agent requires an active default text model or explicit provider", ErrInvalid)
	}
	return profile, nil
}

func (s *ManagementService) AgentProviderClient(ctx context.Context, agent *domain.Agent) (*domain.ProviderProfile, provider.Provider, error) {
	if agent.ProviderProfileID != nil && *agent.ProviderProfileID > 0 {
		profile, err := s.GetProvider(ctx, *agent.ProviderProfileID)
		if err != nil {
			return nil, nil, err
		}
		client, err := s.ProviderClient(ctx, *agent.ProviderProfileID)
		return profile, client, err
	}
	profile, client, err := s.DefaultWritingClient(ctx)
	if err != nil {
		return nil, nil, fmt.Errorf("%w: agent requires an active default text model or explicit provider", ErrInvalid)
	}
	return profile, client, nil
}

func (s *ManagementService) ProviderClient(ctx context.Context, id int64) (provider.Provider, error) {
	profile, err := s.GetProvider(ctx, id)
	if err != nil {
		return nil, err
	}
	if !profile.Enabled {
		return nil, fmt.Errorf("%w: provider is disabled", ErrInvalid)
	}
	key, err := s.secrets.DecryptWithAAD(
		profile.APIKeyCiphertext,
		profile.APIKeyNonce,
		profile.KeyVersion,
		secretbox.ProviderAPIKeyAAD(profile.ID, profile.KeyVersion),
	)
	if err != nil {
		// Backward compatibility for Provider secrets written before record-bound
		// AAD was introduced. New AAD-bound ciphertext cannot downgrade through
		// this path because AES-GCM authentication also covers the original AAD.
		key, err = s.secrets.Decrypt(profile.APIKeyCiphertext, profile.APIKeyNonce, profile.KeyVersion)
	}
	if err != nil {
		return nil, err
	}
	return provider.NewHTTPProviderWithConfig(
		string(profile.ProviderType), profile.BaseURL, key, profile.Model, profile.ProtocolMode, profile.StreamMode, s.allowedHosts,
		time.Duration(profile.RequestTimeoutSeconds)*time.Second,
	)
}

func (s *ManagementService) TestProvider(ctx context.Context, id int64) (time.Duration, error) {
	client, err := s.ProviderClient(ctx, id)
	if err != nil {
		return 0, err
	}
	start := time.Now()
	_, err = client.Generate(ctx, provider.Request{
		Instructions: "Return exactly OK.", Messages: []provider.Message{{Role: "user", Content: "health check"}},
		MaxTokens: 8,
	})
	if err != nil {
		// If text generation failed (e.g. image-only model like Imagen/DALL-E), test image generation
		if imgGen, ok := client.(provider.ImageGenerator); ok {
			if _, imgErr := imgGen.GenerateImage(ctx, provider.ImageRequest{Prompt: "health check"}); imgErr == nil {
				return time.Since(start), nil
			}
		}
		return time.Since(start), fmt.Errorf("provider connection test failed: %w", err)
	}
	return time.Since(start), nil
}

func (s *ManagementService) ListAgents(ctx context.Context) ([]*domain.Agent, error) {
	items, err := s.repo.ListAgents(ctx)
	if err != nil {
		return nil, translateError(err)
	}
	for _, item := range items {
		if item.SkillVersionID == nil {
			return nil, fmt.Errorf("%w: Agent %d has no locked Skill version", ErrInvalid, item.ID)
		}
		skill, err := s.GetSkillVersion(ctx, *item.SkillVersionID)
		if err != nil {
			return nil, err
		}
		item.Skill = skill
	}
	return items, nil
}

func (s *ManagementService) ListSkills(ctx context.Context) ([]*domain.AgentSkill, error) {
	return s.repo.ListSkills(ctx)
}

func (s *ManagementService) GetSkill(ctx context.Context, id int64) (*domain.AgentSkill, error) {
	value, err := s.repo.GetSkill(ctx, id)
	return value, translateError(err)
}

func (s *ManagementService) SaveSkill(ctx context.Context, value *domain.AgentSkill) error {
	value.Name = strings.TrimSpace(value.Name)
	value.Description = strings.TrimSpace(value.Description)
	value.SystemPrompt = strings.TrimSpace(value.SystemPrompt)
	if value.MaxSteps == 0 {
		value.MaxSteps = 6
	}
	if value.MaxInputTokens == 0 {
		value.MaxInputTokens = 16000
	}
	if value.MaxOutputTokens == 0 {
		value.MaxOutputTokens = 2000
	}
	if value.DefaultDailyRunLimit == 0 {
		value.DefaultDailyRunLimit = 10
	}
	if value.DefaultMonthlyTokenBudget == 0 {
		value.DefaultMonthlyTokenBudget = 1000000
	}
	if value.ContentPublishMode == "" {
		value.ContentPublishMode = domain.ContentPublishApproval
	}
	if len(value.InputSchema) == 0 {
		value.InputSchema = json.RawMessage(`{"$schema":"https://json-schema.org/draft/2020-12/schema","type":"object","additionalProperties":false}`)
	}
	if len(value.ToolBindings) == 0 {
		value.ToolBindings = json.RawMessage(`{}`)
	}
	if len(value.AllowedTriggers) == 0 {
		value.AllowedTriggers = []domain.AgentTriggerType{domain.AgentTriggerManual, domain.AgentTriggerCron}
	}
	if value.ExecutionMode == "" {
		value.ExecutionMode = domain.AgentModeAdvisory
	}
	if err := s.validateSkill(value); err != nil {
		return err
	}
	if value.ID == 0 {
		return translateError(s.repo.CreateSkill(ctx, value))
	}
	return translateError(s.repo.UpdateSkill(ctx, value))
}

func (s *ManagementService) validateSkill(value *domain.AgentSkill) error {
	if value.Name == "" || value.SystemPrompt == "" {
		return fmt.Errorf("%w: name and system prompt are required", ErrInvalid)
	}
	if value.ExecutionMode != domain.AgentModeAdvisory && value.ExecutionMode != domain.AgentModeApproval {
		return fmt.Errorf("%w: invalid execution mode", ErrInvalid)
	}
	if value.MaxSteps < 1 || value.MaxSteps > 20 || value.MaxInputTokens < 1 || value.MaxOutputTokens < 1 || value.DefaultDailyRunLimit < 1 || value.DefaultMonthlyTokenBudget < 1 {
		return fmt.Errorf("%w: invalid run limits", ErrInvalid)
	}
	if len(value.InputSchema) > 32<<10 || !json.Valid(value.InputSchema) {
		return fmt.Errorf("%w: input_schema must be valid JSON and at most 32 KiB", ErrInvalid)
	}
	if len(value.ToolBindings) > 32<<10 || !json.Valid(value.ToolBindings) {
		return fmt.Errorf("%w: tool_bindings must be valid JSON and at most 32 KiB", ErrInvalid)
	}
	var bindings map[string]json.RawMessage
	if err := json.Unmarshal(value.ToolBindings, &bindings); err != nil || bindings == nil {
		return fmt.Errorf("%w: tool_bindings must be an object", ErrInvalid)
	}
	var schema struct {
		Type string `json:"type"`
	}
	if json.Unmarshal(value.InputSchema, &schema) != nil || schema.Type != "object" {
		return fmt.Errorf("%w: input_schema must describe an object", ErrInvalid)
	}
	seenTriggers := map[domain.AgentTriggerType]bool{}
	for _, trigger := range value.AllowedTriggers {
		if trigger != domain.AgentTriggerManual && trigger != domain.AgentTriggerCron {
			return fmt.Errorf("%w: unsupported skill trigger", ErrInvalid)
		}
		if seenTriggers[trigger] {
			return fmt.Errorf("%w: duplicate skill trigger", ErrInvalid)
		}
		seenTriggers[trigger] = true
	}
	if len(seenTriggers) == 0 {
		return fmt.Errorf("%w: at least one skill trigger is required", ErrInvalid)
	}
	if value.ContentPublishMode != domain.ContentPublishDraft && value.ContentPublishMode != domain.ContentPublishApproval && value.ContentPublishMode != domain.ContentPublishPublish {
		return fmt.Errorf("%w: invalid content publication mode", ErrInvalid)
	}
	seen := make(map[string]struct{}, len(value.Capabilities))
	for _, capability := range value.Capabilities {
		if strings.TrimSpace(capability) == "" || !slices.Contains(s.allowedCapabilities, capability) {
			return fmt.Errorf("%w: unknown capability %q", ErrInvalid, capability)
		}
		if value.ExecutionMode == domain.AgentModeAdvisory && slices.Contains(s.proposalCapabilities, capability) {
			return fmt.Errorf("%w: advisory skills cannot use proposal capability %q", ErrInvalid, capability)
		}
		if _, exists := seen[capability]; exists {
			return fmt.Errorf("%w: duplicate capability %q", ErrInvalid, capability)
		}
		seen[capability] = struct{}{}
	}
	for name, raw := range bindings {
		if _, authorized := seen[name]; !authorized || !json.Valid(raw) || !jsonObject(raw) {
			return fmt.Errorf("%w: invalid Tool binding %q", ErrInvalid, name)
		}
	}
	return nil
}

func jsonObject(raw json.RawMessage) bool {
	var value map[string]any
	return json.Unmarshal(raw, &value) == nil && value != nil
}

func (s *ManagementService) ListSkillVersions(ctx context.Context, id int64) ([]*domain.AgentSkill, error) {
	items, err := s.repo.ListSkillVersions(ctx, id)
	return items, translateError(err)
}

func (s *ManagementService) GetSkillVersion(ctx context.Context, id int64) (*domain.AgentSkill, error) {
	item, err := s.repo.GetSkillVersion(ctx, id)
	return item, translateError(err)
}

func (s *ManagementService) ImportSkill(ctx context.Context, value *domain.AgentSkill) error {
	value.ID, value.Version, value.VersionID = 0, 0, 0
	return s.SaveSkill(ctx, value)
}

func (s *ManagementService) CopySkill(ctx context.Context, skillID int64, name string, createdByPrincipalID int64) (*domain.AgentSkill, error) {
	source, err := s.GetSkill(ctx, skillID)
	if err != nil {
		return nil, err
	}
	skillVersion, err := s.GetSkillVersion(ctx, source.VersionID)
	if err != nil {
		return nil, err
	}
	skill := &domain.AgentSkill{
		Name: strings.TrimSpace(name), Description: source.Description, SystemPrompt: skillVersion.SystemPrompt,
		Capabilities: slices.Clone(skillVersion.Capabilities), ExecutionMode: skillVersion.ExecutionMode,
		ContentPublishMode: skillVersion.ContentPublishMode,
		ToolBindings:       append(json.RawMessage(nil), skillVersion.ToolBindings...),
		MaxSteps:           skillVersion.MaxSteps, MaxInputTokens: skillVersion.MaxInputTokens, MaxOutputTokens: skillVersion.MaxOutputTokens,
		DefaultDailyRunLimit: skillVersion.DefaultDailyRunLimit, DefaultMonthlyTokenBudget: skillVersion.DefaultMonthlyTokenBudget,
		InputSchema: skillVersion.InputSchema, AllowedTriggers: slices.Clone(skillVersion.AllowedTriggers),
		CreatedByPrincipalID: &createdByPrincipalID,
	}
	if skill.Name == "" {
		skill.Name = source.Name + " Copy"
	}
	if err := s.SaveSkill(ctx, skill); err != nil {
		return nil, err
	}
	return skill, nil
}

func (s *ManagementService) DeleteSkill(ctx context.Context, id int64) error {
	skill, err := s.GetSkill(ctx, id)
	if err != nil {
		return err
	}
	if skill.SystemKey != nil {
		return fmt.Errorf("%w: system Skills cannot be deleted", ErrInvalid)
	}
	return translateError(s.repo.DeleteSkill(ctx, id))
}

func (s *ManagementService) BootstrapStarterPack(ctx context.Context) (int, error) {
	return s.repo.BootstrapStarterPack(ctx)
}

func (s *ManagementService) GetAgent(ctx context.Context, id int64) (*domain.Agent, error) {
	value, err := s.repo.GetAgent(ctx, id)
	if err != nil {
		return value, translateError(err)
	}
	if value.SkillVersionID == nil {
		return nil, fmt.Errorf("%w: Agent has no locked Skill version", ErrInvalid)
	}
	skill, err := s.GetSkillVersion(ctx, *value.SkillVersionID)
	if err != nil {
		return nil, err
	}
	value.Skill = skill
	return value, nil
}

func (s *ManagementService) SaveAgent(ctx context.Context, value *domain.Agent) error {
	value.Name = strings.TrimSpace(value.Name)
	value.Description = strings.TrimSpace(value.Description)
	if value.Timezone == "" {
		value.Timezone = "Asia/Shanghai"
	}
	if value.DailyRunLimit == 0 {
		value.DailyRunLimit = 10
	}
	if value.MonthlyTokenBudget == 0 {
		value.MonthlyTokenBudget = 1000000
	}
	if value.TriggerType == "" {
		value.TriggerType = domain.AgentTriggerManual
	}
	if err := s.validateAgent(value); err != nil {
		return err
	}
	if _, err := time.LoadLocation(value.Timezone); err != nil {
		return fmt.Errorf("%w: invalid timezone", ErrInvalid)
	}
	nextRun, err := NextRun(value, time.Now())
	if err != nil {
		return err
	}
	value.NextRunAt = nextRun
	if value.ProviderProfileID != nil && *value.ProviderProfileID > 0 {
		if _, err := s.repo.GetProvider(ctx, *value.ProviderProfileID); err != nil {
			return translateError(err)
		}
	} else {
		value.ProviderProfileID = nil
	}
	skill, err := s.GetSkillVersion(ctx, *value.SkillVersionID)
	if err != nil {
		return err
	}
	if !slices.Contains(skill.AllowedTriggers, value.TriggerType) {
		return fmt.Errorf("%w: trigger is not allowed by the bound Skill version", ErrInvalid)
	}
	if err := validateOverrides(value, skill); err != nil {
		return err
	}
	var saveErr error
	if value.ID == 0 {
		saveErr = s.repo.CreateAgent(ctx, value)
	} else {
		saveErr = s.repo.UpdateAgent(ctx, value)
	}
	return translateError(saveErr)
}

func (s *ManagementService) validateAgent(value *domain.Agent) error {
	if value.Name == "" || value.SkillVersionID == nil || *value.SkillVersionID <= 0 {
		return fmt.Errorf("%w: name and Skill version are required", ErrInvalid)
	}
	if value.ProviderProfileID != nil && *value.ProviderProfileID <= 0 {
		value.ProviderProfileID = nil
	}
	if value.TriggerType != domain.AgentTriggerManual && value.TriggerType != domain.AgentTriggerCron {
		return fmt.Errorf("%w: invalid trigger type", ErrInvalid)
	}
	if value.TriggerType == domain.AgentTriggerCron && (value.CronExpression == nil || strings.TrimSpace(*value.CronExpression) == "") {
		return fmt.Errorf("%w: cron expression is required", ErrInvalid)
	}
	if value.TriggerType == domain.AgentTriggerManual {
		value.CronExpression = nil
		value.NextRunAt = nil
	}
	if value.DailyRunLimit < 1 || value.MonthlyTokenBudget < 1 {
		return fmt.Errorf("%w: invalid run limits", ErrInvalid)
	}
	return nil
}

func validateOverrides(agent *domain.Agent, skill *domain.AgentSkill) error {
	checks := []struct {
		value *int
		limit int
		name  string
	}{
		{agent.MaxStepsOverride, skill.MaxSteps, "max_steps_override"},
		{agent.MaxInputTokensOverride, skill.MaxInputTokens, "max_input_tokens_override"},
		{agent.MaxOutputTokensOverride, skill.MaxOutputTokens, "max_output_tokens_override"},
	}
	for _, check := range checks {
		if check.value != nil && (*check.value < 1 || *check.value > check.limit) {
			return fmt.Errorf("%w: %s may only tighten the bound Skill limit", ErrInvalid, check.name)
		}
	}
	return nil
}

func (s *ManagementService) DeleteAgent(ctx context.Context, id int64) error {
	value, err := s.GetAgent(ctx, id)
	if err != nil {
		return err
	}
	if value.SystemKey != nil {
		return fmt.Errorf("%w: system Agents cannot be deleted", ErrInvalid)
	}
	return translateError(s.repo.DeleteAgent(ctx, id))
}

func (s *ManagementService) SetAgentEnabled(ctx context.Context, id int64, enabled bool) error {
	value, err := s.GetAgent(ctx, id)
	if err != nil {
		return err
	}
	value.Enabled = enabled
	nextRun, err := NextRun(value, time.Now())
	if err != nil {
		return err
	}
	return translateError(s.repo.SetAgentEnabled(ctx, id, enabled, nextRun))
}

func NextRun(value *domain.Agent, after time.Time) (*time.Time, error) {
	if !value.Enabled || value.TriggerType != domain.AgentTriggerCron || value.CronExpression == nil {
		return nil, nil
	}
	location, err := time.LoadLocation(value.Timezone)
	if err != nil {
		return nil, fmt.Errorf("%w: invalid timezone", ErrInvalid)
	}
	schedule, err := cron.ParseStandard(strings.TrimSpace(*value.CronExpression))
	if err != nil {
		return nil, fmt.Errorf("%w: invalid cron expression: %v", ErrInvalid, err)
	}
	next := schedule.Next(after.In(location)).UTC()
	return &next, nil
}

func translateError(err error) error {
	if errors.Is(err, sql.ErrNoRows) {
		return ErrNotFound
	}
	if repository.IsConstraintError(err) {
		return ErrConflict
	}
	return err
}
