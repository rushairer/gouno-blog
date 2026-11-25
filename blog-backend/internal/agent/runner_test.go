package agent

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/rushairer/blog-backend/internal/agent/domain"
	"github.com/rushairer/blog-backend/internal/provider"
	providerdomain "github.com/rushairer/blog-backend/internal/provider/domain"
	"github.com/rushairer/blog-backend/internal/tool"
	tooldomain "github.com/rushairer/blog-backend/internal/tool/domain"
)

func TestApproximateInputBytesIncludesToolContext(t *testing.T) {
	messages := []provider.Message{
		{Role: "user", Content: "request"},
		{Role: "assistant", Content: "result", ToolCalls: []provider.ToolCall{
			{ID: "call-1", Name: "content.get_post", Arguments: json.RawMessage(`{"id":1}`)},
		}},
		{Role: "tool", ToolCallID: "call-1", Content: `{"content":"post"}`},
	}
	got := approximateInputBytes("instructions", messages)
	if got <= len("instructionsrequestresult") {
		t.Fatalf("expected tool context to be counted, got %d", got)
	}
}

func TestCollectRSSSourceLinksDeduplicatesAndRejectsUnsafeURLs(t *testing.T) {
	links := collectRSSSourceLinks(nil, json.RawMessage(`{"items":[
		{"title":"OpenAI","url":"https://openai.com/news/example"},
		{"title":"duplicate","url":"https://openai.com/news/example"},
		{"title":"unsafe","url":"http://example.com/news"}
	]}`))
	if len(links) != 1 || links[0].Title != "OpenAI" || links[0].URL != "https://openai.com/news/example" {
		t.Fatalf("unexpected source links: %#v", links)
	}
}

func TestAppendRSSSourceLinksKeepsExistingLinksAndAddsOriginalSection(t *testing.T) {
	arguments := json.RawMessage(`{"title":"AI news","content":"News summary without any links","tags":[]}`)
	updated, err := appendRSSSourceLinks(arguments, []rssSourceLink{
		{Title: "OpenAI", URL: "https://openai.com/news/example"},
		{Title: "Google Blog", URL: "https://blog.google/example"},
	})
	if err != nil {
		t.Fatal(err)
	}
	var payload createPostArguments
	if err := json.Unmarshal(updated, &payload); err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(payload.Content, "## 原文链接") || !strings.Contains(payload.Content, "[Google Blog](<https://blog.google/example>)") {
		t.Fatalf("source section is missing: %s", payload.Content)
	}
}

func TestAppendRSSSourceLinksDoesNotAppendWhenContentAlreadyHasInlineLinks(t *testing.T) {
	arguments := json.RawMessage(`{"title":"AI news","content":"Already covered: [OpenAI](https://openai.com/news/example)","tags":[]}`)
	updated, err := appendRSSSourceLinks(arguments, []rssSourceLink{
		{Title: "OpenAI", URL: "https://openai.com/news/example"},
		{Title: "Google Blog", URL: "https://blog.google/example"},
	})
	if err != nil {
		t.Fatal(err)
	}
	var payload createPostArguments
	if err := json.Unmarshal(updated, &payload); err != nil {
		t.Fatal(err)
	}
	if strings.Contains(payload.Content, "## 原文链接") {
		t.Fatalf("should not append source links when content already has inline links: %s", payload.Content)
	}
}


type retryTestProvider struct {
	calls int
	err   error
}

func (p *retryTestProvider) Name() string  { return "retry-test" }
func (p *retryTestProvider) Model() string { return "test-model" }

func (p *retryTestProvider) Generate(context.Context, provider.Request) (provider.Result, error) {
	p.calls++
	return provider.Result{}, p.err
}

func TestGenerateWithRetryReportsActualAttemptsForNonRetryableError(t *testing.T) {
	client := &retryTestProvider{
		err: errors.New(`upstream openai returned 400: {"error":{"message":"Stream must be set to true"}}`),
	}
	_, attempts, err := generateWithRetry(context.Background(), client, provider.Request{})
	if err == nil {
		t.Fatal("expected provider error")
	}
	if attempts != 1 || client.calls != 1 {
		t.Fatalf("attempts=%d calls=%d, want 1/1", attempts, client.calls)
	}
	if !strings.Contains(err.Error(), "provider request failed after 1 attempt:") {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestGenerateWithRetryDoesNotReplayAmbiguousOrMisleadingFailures(t *testing.T) {
	for _, status := range []int{http.StatusBadRequest, http.StatusUnauthorized, http.StatusInternalServerError, http.StatusServiceUnavailable} {
		t.Run(http.StatusText(status), func(t *testing.T) {
			calls := 0
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
				calls++
				w.WriteHeader(status)
				_, _ = w.Write([]byte(`{"error":{"message":"timeout; upstream returned 429; retry now"}}`))
			}))
			defer server.Close()
			client, err := provider.NewHTTPProviderWithConfig("openai", server.URL, "secret", "model", "responses", "never", []string{"127.0.0.1"}, time.Second)
			if err != nil {
				t.Fatal(err)
			}
			_, attempts, err := generateWithRetry(context.Background(), client, provider.Request{})
			if err == nil || calls != 1 || attempts != 1 {
				t.Fatalf("status=%d attempts=%d HTTP=%d err=%v", status, attempts, calls, err)
			}
		})
	}
	for _, cause := range []error{context.DeadlineExceeded, errors.New("transport timeout"), errors.New("returned 429")} {
		client := &retryTestProvider{err: cause}
		_, attempts, err := generateWithRetry(context.Background(), client, provider.Request{})
		if !errors.Is(err, cause) || attempts != 1 || client.calls != 1 {
			t.Fatalf("ambiguous failure was replayed: attempts=%d calls=%d err=%v", attempts, client.calls, err)
		}
	}
}

func TestGenerateWithRetryRetainsBoundedTypedRateLimitRecovery(t *testing.T) {
	calls := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		calls++
		if calls == 1 {
			w.WriteHeader(http.StatusTooManyRequests)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"choices":[{"message":{"content":"recovered"}}],"usage":{"prompt_tokens":2,"completion_tokens":1}}`))
	}))
	defer server.Close()
	client, err := provider.NewHTTPProviderWithConfig("openai", server.URL, "secret", "model", "chat_completions", "never", []string{"127.0.0.1"}, time.Second)
	if err != nil {
		t.Fatal(err)
	}
	result, attempts, err := generateWithRetry(context.Background(), client, provider.Request{})
	if err != nil || calls != 2 || attempts != 2 || result.Text != "recovered" {
		t.Fatalf("typed 429 recovery: result=%#v calls=%d attempts=%d err=%v", result, calls, attempts, err)
	}
}

func TestGenerateWithRetryDoesNotDispatchCancelledContext(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	client := &retryTestProvider{err: errors.New("must not execute")}
	_, attempts, err := generateWithRetry(ctx, client, provider.Request{})
	if !errors.Is(err, context.Canceled) || attempts != 0 || client.calls != 0 {
		t.Fatalf("cancelled context dispatched: attempts=%d calls=%d err=%v", attempts, client.calls, err)
	}
}

// These fakes embed the remaining ports deliberately: unexpected persistence
// or administrative calls fail the test instead of silently succeeding.
type modelBoundaryManagement struct {
	RunnerManagement
	agent  *domain.Agent
	skill  *domain.AgentSkill
	client provider.Provider
}

func (m *modelBoundaryManagement) GetAgent(context.Context, int64) (*domain.Agent, error) {
	return m.agent, nil
}

func (m *modelBoundaryManagement) GetSkillVersion(context.Context, int64) (*domain.AgentSkill, error) {
	return m.skill, nil
}

func (m *modelBoundaryManagement) AgentProviderClient(context.Context, *domain.Agent) (*providerdomain.ProviderProfile, provider.Provider, error) {
	return &providerdomain.ProviderProfile{ID: 1, ProviderType: "openai", Vendor: "openai", Model: m.client.Model()}, m.client, nil
}

type modelBoundaryRuns struct {
	RunnerRunStore
	run      *domain.AgentRun
	starts   int
	usages   int
	toolRows int
	claimErr error
	usageErr error
}

func (s *modelBoundaryRuns) GetRun(context.Context, int64) (*domain.AgentRun, error) {
	return s.run, nil
}

func (s *modelBoundaryRuns) StartRun(context.Context, int64) error {
	s.starts++
	return s.claimErr
}

func (s *modelBoundaryRuns) MonthlyTokenUsage(context.Context, int64) (int64, error) {
	return 0, nil
}

func (s *modelBoundaryRuns) RecordUsage(context.Context, *domain.UsageEvent) error {
	s.usages++
	return s.usageErr
}

func (s *modelBoundaryRuns) SaveRunCitations(context.Context, int64, []domain.AgentCitation) error {
	return nil
}

func (s *modelBoundaryRuns) CreateToolCall(context.Context, *domain.AgentToolCall) error {
	s.toolRows++
	return errors.New("unexpected Tool dispatch")
}

type modelBoundaryProvider struct {
	requests []provider.Request
	result   provider.Result
}

func (*modelBoundaryProvider) Name() string { return "test" }
func (*modelBoundaryProvider) Model() string { return "test" }

func (p *modelBoundaryProvider) Generate(_ context.Context, request provider.Request) (provider.Result, error) {
	p.requests = append(p.requests, request)
	return p.result, nil
}

func TestRunnerRejectsUnadvertisedBatchBeforeAnyToolSideEffect(t *testing.T) {
	for _, tc := range []struct {
		name        string
		steps       int
		preview     bool
		badTool     string
		wantOffered []string
	}{
		{"final-synthesis", 1, false, "content.create_post", nil},
		{"preview-write", 2, true, "media.create_image_task", []string{"read", "proposal"}},
		{"stale-external-grant", 2, false, "external.read", []string{"read", "proposal", "content.create_post", "media.create_image_task"}},
		{"unknown-tool", 2, false, "not.registered", []string{"read", "proposal", "content.create_post", "media.create_image_task"}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			executed := 0
			read := func(context.Context, json.RawMessage) (any, error) {
				executed++
				return map[string]bool{"ok": true}, nil
			}
			registry := tool.New(
				tool.Definition{Name: "read", Risk: tooldomain.ToolRiskRead, Execute: read},
				tool.Definition{Name: "proposal", Risk: tooldomain.ToolRiskPropose},
				tool.Definition{Name: "content.create_post", Risk: tooldomain.ToolRiskWrite},
				tool.Definition{Name: "media.create_image_task", Risk: tooldomain.ToolRiskWrite},
				tool.Definition{Name: "external.read", Risk: tooldomain.ToolRiskRead, Surfaces: []string{"external"}, Execute: read},
			)
			client := &modelBoundaryProvider{result: provider.Result{
				InputTokens: 10, OutputTokens: 3,
				ToolCalls: []provider.ToolCall{
					{ID: "call-read", Name: "read", Arguments: json.RawMessage(`{}`)},
					{ID: "call-denied", Name: tc.badTool, Arguments: json.RawMessage(`{}`)},
				},
			}}
			versionID := int64(9)
			runs := &modelBoundaryRuns{run: &domain.AgentRun{ID: 1, AgentID: 2, SkillVersionID: &versionID}}
			lifecycle := &recordingRunLifecycle{}
			notifications := &recordingRunNotifications{}
			runner := &Runner{
				runs: runs, tools: registry, lifecycle: lifecycle, notifications: notifications,
				management: &modelBoundaryManagement{
					agent: &domain.Agent{ID: 2, MonthlyTokenBudget: 10000},
					skill: &domain.AgentSkill{Capabilities: []string{"read", "proposal", "content.create_post", "media.create_image_task", "external.read"}, MaxSteps: tc.steps, MaxInputTokens: 10000, MaxOutputTokens: 100},
					client: client,
				},
			}
			err := runner.execute(context.Background(), 1, tc.preview)
			if !errors.Is(err, tool.ErrUnauthorized) || executed != 0 || runs.toolRows != 0 || runs.usages != 1 || runs.starts != 1 || len(client.requests) != 1 {
				t.Fatalf("boundary failure: err=%v effects=%d rows=%d usage=%d starts=%d requests=%d", err, executed, runs.toolRows, runs.usages, runs.starts, len(client.requests))
			}
			if lifecycle.calls != 1 || lifecycle.status != domain.AgentRunFailed || lifecycle.inputTokens != 10 || lifecycle.outputTokens != 3 || notifications.calls != 1 {
				t.Fatalf("failed-run evidence lost: %#v notifications=%d", lifecycle, notifications.calls)
			}
			offered := client.requests[0].Tools
			if len(offered) != len(tc.wantOffered) {
				t.Fatalf("offered=%#v want=%v", offered, tc.wantOffered)
			}
			for i, definition := range offered {
				if definition.Name != tc.wantOffered[i] {
					t.Fatalf("offered=%#v want=%v", offered, tc.wantOffered)
				}
			}
		})
	}
}

func TestRunnerDirectDispatchPreservesAgentSurfaceAndPreviewFence(t *testing.T) {
	executed := 0
	registry := tool.New(
		tool.Definition{Name: "external.read", Risk: tooldomain.ToolRiskRead, Surfaces: []string{"external"}, Execute: func(context.Context, json.RawMessage) (any, error) {
			executed++
			return nil, nil
		}},
		tool.Definition{Name: "content.create_post", Risk: tooldomain.ToolRiskWrite},
		tool.Definition{Name: "media.create_image_task", Risk: tooldomain.ToolRiskWrite},
	)
	skill := &domain.AgentSkill{Capabilities: []string{"external.read", "content.create_post", "media.create_image_task"}}
	runner := &Runner{tools: registry}
	for _, name := range skill.Capabilities {
		_, result, proposal, err := runner.invokeTool(context.Background(), &domain.AgentRun{ID: 1}, skill, name, json.RawMessage(`{}`), true)
		if !errors.Is(err, tool.ErrUnauthorized) || result != nil || proposal != nil || executed != 0 {
			t.Fatalf("unexpected dispatch: %s result=%s proposal=%#v err=%v effects=%d", name, result, proposal, err, executed)
		}
	}
}

func TestRunnerOwnedWriteHandlersRejectMisclassifiedDefinitions(t *testing.T) {
	for _, name := range []string{"content.create_post", "media.create_image_task"} {
		runner := &Runner{tools: tool.New(tool.Definition{Name: name, Risk: tooldomain.ToolRiskRead})}
		skill := &domain.AgentSkill{Capabilities: []string{name}}
		for _, preview := range []bool{true, false} {
			_, result, proposal, err := runner.invokeTool(context.Background(), &domain.AgentRun{ID: 1}, skill, name, json.RawMessage(`{}`), preview)
			if !errors.Is(err, tool.ErrUnauthorized) || result != nil || proposal != nil {
				t.Fatalf("misclassified write handler %s: result=%s proposal=%#v err=%v", name, result, proposal, err)
			}
		}
	}
}

type recordingRunLifecycle struct {
	RunnerRunLifecycle
	calls                     int
	status                    domain.AgentRunStatus
	inputTokens, outputTokens int64
	finishErr                 error
	boundedContext            bool
}

func (s *recordingRunLifecycle) FinishRun(ctx context.Context, _ int64, status domain.AgentRunStatus, _ string, input, output int64, _, _ *string) error {
	s.calls++
	s.status, s.inputTokens, s.outputTokens = status, input, output
	deadline, ok := ctx.Deadline()
	s.boundedContext = ok && ctx.Err() == nil && time.Until(deadline) <= runFinalizationTimeout
	return s.finishErr
}

type recordingRunNotifications struct {
	calls int
}

func (s *recordingRunNotifications) Create(context.Context, int64, string, string, string, string, string) error {
	s.calls++
	return nil
}

func TestRunnerUnacknowledgedClaimNeverDispatchesOrFinishes(t *testing.T) {
	for _, cause := range []error{sql.ErrNoRows, errors.New("claim acknowledgement lost"), context.Canceled} {
		runs := &modelBoundaryRuns{claimErr: cause}
		lifecycle := &recordingRunLifecycle{}
		runner := &Runner{runs: runs, lifecycle: lifecycle}
		err := runner.execute(context.Background(), 7, false)
		if !errors.Is(err, cause) || runs.starts != 1 || lifecycle.calls != 0 || runs.usages != 0 || runs.toolRows != 0 {
			t.Fatalf("failed claim changed execution: err=%v starts=%d finishes=%d", err, runs.starts, lifecycle.calls)
		}
	}
}

func TestRunnerPreservesUsageOnFailureAndNeverRewritesUnconfirmedFinish(t *testing.T) {
	for _, terminalErr := range []error{nil, errors.New("terminal commit acknowledgement lost")} {
		usageErr := errors.New("usage acknowledgement lost")
		versionID := int64(9)
		runs := &modelBoundaryRuns{
			run: &domain.AgentRun{ID: 1, AgentID: 2, SkillVersionID: &versionID},
			usageErr: usageErr,
		}
		client := &modelBoundaryProvider{result: provider.Result{Text: "answer", InputTokens: 11, OutputTokens: 4}}
		lifecycle := &recordingRunLifecycle{finishErr: terminalErr}
		notifications := &recordingRunNotifications{}
		runner := &Runner{
			runs: runs, tools: tool.New(), lifecycle: lifecycle, notifications: notifications,
			management: &modelBoundaryManagement{
				agent: &domain.Agent{ID: 2, MonthlyTokenBudget: 1000},
				skill: &domain.AgentSkill{MaxSteps: 1, MaxInputTokens: 10000, MaxOutputTokens: 100},
				client: client,
			},
		}
		err := runner.execute(context.Background(), 1, false)
		wantNotifications := 1
		if terminalErr != nil {
			wantNotifications = 0
			if !errors.Is(err, terminalErr) {
				t.Fatalf("terminal error lost: %v", err)
			}
		}
		if !errors.Is(err, usageErr) || lifecycle.calls != 1 || !lifecycle.boundedContext ||
			lifecycle.status != domain.AgentRunFailed || lifecycle.inputTokens != 11 || lifecycle.outputTokens != 4 ||
			notifications.calls != wantNotifications || len(client.requests) != 1 {
			t.Fatalf("failure evidence: err=%v lifecycle=%#v notifications=%d", err, lifecycle, notifications.calls)
		}
	}
}

func TestRunnerFinalizationUsesBoundedContextAfterWorkerCancellation(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	versionID := int64(9)
	runs := &modelBoundaryRuns{
		run: &domain.AgentRun{ID: 1, AgentID: 2, SkillVersionID: &versionID},
		usageErr: context.Canceled,
	}
	lifecycle := &recordingRunLifecycle{}
	client := &cancellingModelProvider{cancel: cancel}
	runner := &Runner{
		runs: runs, tools: tool.New(), lifecycle: lifecycle, notifications: &recordingRunNotifications{},
		management: &modelBoundaryManagement{
			agent: &domain.Agent{ID: 2, MonthlyTokenBudget: 1000},
			skill: &domain.AgentSkill{MaxSteps: 1, MaxInputTokens: 10000, MaxOutputTokens: 100},
			client: client,
		},
	}
	err := runner.execute(ctx, 1, false)
	if !errors.Is(err, context.Canceled) || lifecycle.calls != 1 || !lifecycle.boundedContext ||
		lifecycle.inputTokens != 8 || lifecycle.outputTokens != 2 {
		t.Fatalf("cancelled worker lost terminal evidence: err=%v lifecycle=%#v", err, lifecycle)
	}
}

type cancellingModelProvider struct {
	cancel context.CancelFunc
}

func (*cancellingModelProvider) Name() string { return "test" }
func (*cancellingModelProvider) Model() string { return "test" }

func (p *cancellingModelProvider) Generate(context.Context, provider.Request) (provider.Result, error) {
	p.cancel()
	return provider.Result{Text: "answer", InputTokens: 8, OutputTokens: 2}, nil
}

func TestRunnerSuccessfulOutcomeNeverRewrittenAfterUnacknowledgedCommit(t *testing.T) {
	commitErr := errors.New("success commit acknowledgement lost")
	versionID := int64(9)
	runs := &modelBoundaryRuns{run: &domain.AgentRun{ID: 1, AgentID: 2, SkillVersionID: &versionID}}
	client := &modelBoundaryProvider{result: provider.Result{Text: "answer", InputTokens: 12, OutputTokens: 6}}
	lifecycle := &recordingRunLifecycle{finishErr: commitErr}
	notifications := &recordingRunNotifications{}
	runner := &Runner{
		runs: runs, tools: tool.New(), lifecycle: lifecycle, notifications: notifications,
		management: &modelBoundaryManagement{
			agent: &domain.Agent{ID: 2, MonthlyTokenBudget: 1000},
			skill: &domain.AgentSkill{MaxSteps: 1, MaxInputTokens: 10000, MaxOutputTokens: 100},
			client: client,
		},
	}
	err := runner.execute(context.Background(), 1, false)
	if !errors.Is(err, commitErr) || lifecycle.calls != 1 || lifecycle.status != domain.AgentRunSucceeded ||
		lifecycle.inputTokens != 12 || lifecycle.outputTokens != 6 || notifications.calls != 0 ||
		runs.usages != 1 || len(client.requests) != 1 {
		t.Fatalf("unconfirmed success was rewritten or replayed: err=%v lifecycle=%#v notifications=%d", err, lifecycle, notifications.calls)
	}
}
