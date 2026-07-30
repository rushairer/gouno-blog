package agent

import (
	"context"
	"database/sql"
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

func (s *ManagementService) GetProvider(ctx context.Context, id int64) (*domain.ProviderProfile, error) {
	value, err := s.repo.GetProvider(ctx, id)
	return value, translateError(err)
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
	if profile.ID == 0 && !replaceSecret {
		return fmt.Errorf("%w: API key is required", ErrInvalid)
	}
	if replaceSecret {
		ciphertext, nonce, err := s.secrets.Encrypt(apiKey)
		if err != nil {
			return err
		}
		profile.APIKeyCiphertext = ciphertext
		profile.APIKeyNonce = nonce
		profile.APIKeyLast4 = secretbox.Last4(apiKey)
		profile.KeyVersion = s.secrets.KeyVersion()
		profile.HasAPIKey = true
	}
	var err error
	if profile.ID == 0 {
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
	if profile.ProviderType != domain.ProviderOpenAI && profile.ProviderType != domain.ProviderAnthropic {
		return fmt.Errorf("%w: unsupported provider type", ErrInvalid)
	}
	if err := provider.ValidateUpstreamURL(ctx, profile.BaseURL, s.allowedHosts); err != nil {
		return fmt.Errorf("%w: %v", ErrInvalid, err)
	}
	if profile.RequestTimeoutSeconds < 1 || profile.RequestTimeoutSeconds > 600 ||
		profile.MaxOutputTokens < 1 || profile.MaxOutputTokens > 100000 {
		return fmt.Errorf("%w: provider limits are outside allowed ranges", ErrInvalid)
	}
	return nil
}

func (s *ManagementService) DeleteProvider(ctx context.Context, id int64) error {
	err := s.repo.DeleteProvider(ctx, id)
	if errors.Is(err, repository.ErrResourceInUse) || repository.IsConstraintError(err) {
		return ErrProviderInUse
	}
	return translateError(err)
}

func (s *ManagementService) ProviderClient(ctx context.Context, id int64) (provider.Provider, error) {
	profile, err := s.GetProvider(ctx, id)
	if err != nil {
		return nil, err
	}
	if !profile.Enabled {
		return nil, fmt.Errorf("%w: provider is disabled", ErrInvalid)
	}
	key, err := s.secrets.Decrypt(profile.APIKeyCiphertext, profile.APIKeyNonce, profile.KeyVersion)
	if err != nil {
		return nil, err
	}
	return provider.NewHTTPProvider(
		string(profile.ProviderType), profile.BaseURL, key, profile.Model, s.allowedHosts,
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
		return time.Since(start), errors.New("provider connection test failed")
	}
	return time.Since(start), nil
}

func (s *ManagementService) ListAgents(ctx context.Context) ([]*domain.Agent, error) {
	return s.repo.ListAgents(ctx)
}

func (s *ManagementService) GetAgent(ctx context.Context, id int64) (*domain.Agent, error) {
	value, err := s.repo.GetAgent(ctx, id)
	return value, translateError(err)
}

func (s *ManagementService) SaveAgent(ctx context.Context, value *domain.Agent) error {
	value.Name = strings.TrimSpace(value.Name)
	value.Description = strings.TrimSpace(value.Description)
	value.SystemPrompt = strings.TrimSpace(value.SystemPrompt)
	if value.Timezone == "" {
		value.Timezone = "Asia/Shanghai"
	}
	if value.MaxSteps == 0 {
		value.MaxSteps = 6
	}
	if value.MaxInputTokens == 0 {
		value.MaxInputTokens = 16000
	}
	if value.MaxOutputTokens == 0 {
		value.MaxOutputTokens = 2000
	}
	if value.DailyRunLimit == 0 {
		value.DailyRunLimit = 10
	}
	if value.MonthlyTokenBudget == 0 {
		value.MonthlyTokenBudget = 1000000
	}
	if value.ExecutionMode == "" {
		value.ExecutionMode = domain.AgentModeAdvisory
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
	if _, err := s.repo.GetProvider(ctx, value.ProviderProfileID); err != nil {
		return translateError(err)
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
	if value.Name == "" || value.SystemPrompt == "" || value.ProviderProfileID <= 0 {
		return fmt.Errorf("%w: name, system prompt and provider are required", ErrInvalid)
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
	if value.ExecutionMode != domain.AgentModeAdvisory && value.ExecutionMode != domain.AgentModeApproval {
		return fmt.Errorf("%w: invalid execution mode", ErrInvalid)
	}
	if value.MaxSteps < 1 || value.MaxSteps > 20 || value.MaxInputTokens < 1 ||
		value.MaxOutputTokens < 1 || value.DailyRunLimit < 1 || value.MonthlyTokenBudget < 1 {
		return fmt.Errorf("%w: invalid run limits", ErrInvalid)
	}
	seen := make(map[string]struct{}, len(value.Capabilities))
	for _, capability := range value.Capabilities {
		if strings.TrimSpace(capability) == "" {
			return fmt.Errorf("%w: empty capability", ErrInvalid)
		}
		if !slices.Contains(s.allowedCapabilities, capability) {
			return fmt.Errorf("%w: unknown capability %q", ErrInvalid, capability)
		}
		if value.ExecutionMode == domain.AgentModeAdvisory && slices.Contains(s.proposalCapabilities, capability) {
			return fmt.Errorf("%w: advisory agents cannot use proposal capability %q", ErrInvalid, capability)
		}
		if _, exists := seen[capability]; exists {
			return fmt.Errorf("%w: duplicate capability", ErrInvalid)
		}
		seen[capability] = struct{}{}
	}
	return nil
}

func (s *ManagementService) DeleteAgent(ctx context.Context, id int64) error {
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

type Preset struct {
	ID             string                    `json:"id"`
	Name           string                    `json:"name"`
	Description    string                    `json:"description"`
	SystemPrompt   string                    `json:"system_prompt"`
	TriggerType    domain.AgentTriggerType   `json:"trigger_type"`
	CronExpression string                    `json:"cron_expression"`
	Timezone       string                    `json:"timezone"`
	Capabilities   []string                  `json:"capabilities"`
	ExecutionMode  domain.AgentExecutionMode `json:"execution_mode"`
}

func Presets() []Preset {
	return []Preset{
		{
			ID: "weekly-operations", Name: "每周运营报告",
			Description:  "汇总过去一周的内容、互动与增长表现，并给出下周行动建议。",
			SystemPrompt: "生成一份每周博客运营报告。先读取文章、分析数据和待处理评论，再总结增长、下滑、风险与下周优先事项。引用具体数据，不创建内容提案。",
			TriggerType:  domain.AgentTriggerCron, CronExpression: "0 9 * * 1", Timezone: "Asia/Shanghai",
			Capabilities:  []string{"content.list_posts", "analytics.get_summary", "comments.list_pending"},
			ExecutionMode: domain.AgentModeAdvisory,
		},
		{
			ID: "content-health", Name: "内容健康巡检",
			Description:  "检查旧内容、摘要、标签和内容结构，并生成待审批修改建议。",
			SystemPrompt: "巡检博客内容质量。先列出文章，再读取需要检查的文章。识别缺失摘要、过时表述、标签问题和内容结构问题。只有证据充分时才创建更新或标签提案。",
			TriggerType:  domain.AgentTriggerCron, CronExpression: "0 10 * * 2", Timezone: "Asia/Shanghai",
			Capabilities:  []string{"content.list_posts", "content.get_post", "content.search_posts", "content.list_tags", "content.check_links", "content.propose_update", "content.propose_tags", "content.propose_task"},
			ExecutionMode: domain.AgentModeApproval,
		},
		{
			ID: "comment-insights", Name: "评论洞察与回复草稿",
			Description:  "总结待处理评论、高频问题，并生成回复草稿。",
			SystemPrompt: "分析待处理和被举报的评论，按问题、建议、争议或疑似垃圾内容归类。需要回复时读取相关文章，再创建回复草稿提案。不要批准、隐藏或删除评论。",
			TriggerType:  domain.AgentTriggerCron, CronExpression: "0 18 * * *", Timezone: "Asia/Shanghai",
			Capabilities:  []string{"comments.list_pending", "content.get_post", "comments.propose_reply", "content.propose_task"},
			ExecutionMode: domain.AgentModeApproval,
		},
	}
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
