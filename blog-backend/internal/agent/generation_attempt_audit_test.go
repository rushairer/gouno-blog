package agent

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"testing"
	"time"

	"github.com/rushairer/blog-backend/internal/agent/domain"
	"github.com/rushairer/blog-backend/internal/provider"
)

type attemptAuditRecorderFunc func(context.Context, *domain.GenerationAudit) error

func (f attemptAuditRecorderFunc) RecordGenerationAudit(ctx context.Context, value *domain.GenerationAudit) error {
	return f(ctx, value)
}

type attemptImageGeneratorFunc func(context.Context, provider.ImageRequest) (provider.ImageResult, error)

func (f attemptImageGeneratorFunc) GenerateImage(ctx context.Context, req provider.ImageRequest) (provider.ImageResult, error) {
	return f(ctx, req)
}

func testImageAttemptRequest() ImageGenerationRequest {
	candidateID, attempt := int64(73), 4
	return ImageGenerationRequest{
		Prompt: "private prompt sentinel", Source: "agent_candidate", Operation: "media.generate_candidate",
		MediaCandidateID: &candidateID, GenerationAttempt: &attempt,
	}
}

func assertBoundedAuditContext(t *testing.T, ctx context.Context) {
	t.Helper()
	deadline, ok := ctx.Deadline()
	if !ok || time.Until(deadline) > 5*time.Second || ctx.Err() != nil {
		t.Fatalf("audit context is cancelled or lacks its five-second bound: deadline=%v err=%v", deadline, ctx.Err())
	}
}

func TestImageAttemptIdentityRejectsMissingOrMixedIdentityBeforeDispatch(t *testing.T) {
	for _, tc := range []struct {
		name   string
		mutate func(*ImageGenerationRequest)
	}{
		{"missing_attempt", func(r *ImageGenerationRequest) { r.GenerationAttempt = nil }},
		{"zero_attempt", func(r *ImageGenerationRequest) { *r.GenerationAttempt = 0 }},
		{"negative_attempt", func(r *ImageGenerationRequest) { *r.GenerationAttempt = -1 }},
		{"missing_candidate", func(r *ImageGenerationRequest) { r.MediaCandidateID = nil }},
		{"invalid_candidate", func(r *ImageGenerationRequest) { *r.MediaCandidateID = 0 }},
		{"editor_source", func(r *ImageGenerationRequest) { r.Source = "editor" }},
		{"editor_operation", func(r *ImageGenerationRequest) { r.Operation = "editor.image" }},
	} {
		t.Run(tc.name, func(t *testing.T) {
			req := testImageAttemptRequest()
			tc.mutate(&req)
			writes, calls := 0, 0
			s := &GenerationService{repo: attemptAuditRecorderFunc(func(context.Context, *domain.GenerationAudit) error {
				writes++
				return nil
			})}
			generator := attemptImageGeneratorFunc(func(context.Context, provider.ImageRequest) (provider.ImageResult, error) {
				calls++
				return provider.ImageResult{}, nil
			})
			if _, err := s.requestAuditedImage(context.Background(), &req, "test", "test", generator); !errors.Is(err, ErrInvalid) {
				t.Fatalf("invalid identity accepted: %v", err)
			}
			if writes != 0 || calls != 0 {
				t.Fatalf("invalid identity performed work: writes=%d calls=%d", writes, calls)
			}
		})
	}
}

func TestImageAttemptRequiresConfirmedStartAuditBeforeProvider(t *testing.T) {
	for _, tc := range []struct {
		name string
		id   int64
		err  error
	}{
		{"storage_failure", 0, errors.New("storage unavailable")},
		{"commit_ack_lost", 91, errors.New("commit acknowledgement lost")},
		{"missing_identity", 0, nil},
	} {
		t.Run(tc.name, func(t *testing.T) {
			req := testImageAttemptRequest()
			writes, calls := 0, 0
			s := &GenerationService{repo: attemptAuditRecorderFunc(func(ctx context.Context, audit *domain.GenerationAudit) error {
				assertBoundedAuditContext(t, ctx)
				writes++
				if audit.Status != "started" || audit.ID != 0 || *audit.GenerationAttempt != *req.GenerationAttempt {
					t.Fatalf("incorrect pre-dispatch audit: %#v", audit)
				}
				audit.ID = tc.id
				return tc.err
			})}
			generator := attemptImageGeneratorFunc(func(context.Context, provider.ImageRequest) (provider.ImageResult, error) {
				calls++
				return provider.ImageResult{}, nil
			})
			if _, err := s.requestAuditedImage(context.Background(), &req, "test", "test", generator); !errors.Is(err, errImageAuditUnconfirmed) {
				t.Fatalf("unconfirmed audit accepted: %v", err)
			}
			if calls != 0 || writes != 1 || req.auditID != 0 {
				t.Fatalf("audit failure caused dispatch, retry or retained unconfirmed ID: calls=%d writes=%d id=%d", calls, writes, req.auditID)
			}
		})
	}
	req := testImageAttemptRequest()
	s := &GenerationService{}
	generator := attemptImageGeneratorFunc(func(context.Context, provider.ImageRequest) (provider.ImageResult, error) {
		t.Fatal("provider called without an audit repository")
		return provider.ImageResult{}, nil
	})
	if _, err := s.requestAuditedImage(context.Background(), &req, "test", "test", generator); !errors.Is(err, errImageAuditUnconfirmed) {
		t.Fatalf("missing audit repository accepted: %v", err)
	}
}

func TestImageAttemptTerminalAuditIsBoundedAndKeepsExactIdentityAfterCancellation(t *testing.T) {
	for _, outcome := range []struct {
		name   string
		err    error
		status string
	}{
		{"success", nil, "succeeded"},
		{"cancelled", context.Canceled, domain.MediaGenerationOutcomeUncertainCode},
		{"timeout", context.DeadlineExceeded, domain.MediaGenerationOutcomeUncertainCode},
		{"provider_error", errors.New("private provider error sentinel"), domain.MediaGenerationOutcomeUncertainCode},
	} {
		t.Run(outcome.name, func(t *testing.T) {
			req := testImageAttemptRequest()
			ctx, cancel := context.WithCancel(context.Background())
			defer cancel()
			writes, calls := 0, 0
			var terminal domain.GenerationAudit
			s := &GenerationService{repo: attemptAuditRecorderFunc(func(auditCtx context.Context, audit *domain.GenerationAudit) error {
				assertBoundedAuditContext(t, auditCtx)
				writes++
				if writes == 1 {
					if calls != 0 || audit.Status != "started" {
						t.Fatal("provider executed before its started audit")
					}
					audit.ID = 99
					return nil
				}
				terminal = *audit
				return errors.New("terminal audit acknowledgement lost")
			})}
			generator := attemptImageGeneratorFunc(func(context.Context, provider.ImageRequest) (provider.ImageResult, error) {
				if writes != 1 || req.auditID != 99 {
					t.Fatal("dispatch lacks a confirmed audit")
				}
				calls++
				cancel()
				return provider.ImageResult{Data: []byte("test"), MIMEType: "image/png"}, outcome.err
			})
			_, err := s.requestAuditedImage(ctx, &req, "test", "test-model", generator)
			s.recordImageAudit(req, "test", "test-model", 0, 0, nil, err)
			if writes != 2 || calls != 1 || terminal.ID != 99 || terminal.Status != outcome.status ||
				terminal.GenerationAttempt == nil || *terminal.GenerationAttempt != 4 ||
				terminal.MediaCandidateID == nil || *terminal.MediaCandidateID != 73 {
				t.Fatalf("wrong audit lifecycle or replay: writes=%d calls=%d audit=%#v", writes, calls, terminal)
			}
			raw, marshalErr := json.Marshal(terminal)
			if marshalErr != nil {
				t.Fatal(marshalErr)
			}
			if strings.Contains(string(raw), "private") {
				t.Fatalf("audit leaked prompt or provider error: %s", raw)
			}
		})
	}
}

func TestEditorImageRetainsUncorrelatedBestEffortAudit(t *testing.T) {
	req := ImageGenerationRequest{Source: "editor", Operation: "editor.image", Prompt: "editor image"}
	writes, calls := 0, 0
	s := &GenerationService{repo: attemptAuditRecorderFunc(func(ctx context.Context, audit *domain.GenerationAudit) error {
		assertBoundedAuditContext(t, ctx)
		writes++
		if audit.GenerationAttempt != nil || audit.MediaCandidateID != nil || audit.ID != 0 || audit.Status != "failed" {
			t.Fatalf("editor audit was assigned a governed identity: %#v", audit)
		}
		return nil
	})}
	generator := attemptImageGeneratorFunc(func(context.Context, provider.ImageRequest) (provider.ImageResult, error) {
		calls++
		if writes != 0 {
			t.Fatal("editor image incorrectly required a started audit")
		}
		return provider.ImageResult{}, context.DeadlineExceeded
	})
	_, err := s.requestAuditedImage(context.Background(), &req, "test", "test", generator)
	s.recordImageAudit(req, "test", "test", 0, 0, nil, err)
	if calls != 1 || writes != 1 || req.auditID != 0 {
		t.Fatalf("editor compatibility changed: calls=%d writes=%d", calls, writes)
	}
}
