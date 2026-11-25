package provider

import (
	"context"
	"errors"
	"strings"
	"time"
)

var (
	ErrTextDispatchStartUnconfirmed  = errors.New("provider dispatch audit start unconfirmed; associated HTTP call not sent")
	ErrTextDispatchFinishUnconfirmed = errors.New("provider dispatch audit finish unconfirmed; do not replay")
	ErrTextDispatchDecodeUnconfirmed = errors.New("provider response decode audit unconfirmed; do not dispatch tools or replay")
)

// TextDispatch describes one explicit HTTP client.Do call, not a logical
// Generate invocation, a network packet, or a provider billing event.
type TextDispatch struct {
	Operation  string
	StreamFlag string
}

type TextDispatchOutcome struct {
	Status     string
	HTTPStatus int
	Evidence   RequestEvidence
}

type TextDispatchDecodeOutcome struct {
	Status string // decoded, invalid, incomplete, or rejected
}

// TextDispatchAudit is supplied by governed text callers. The provider owns
// protocol negotiation and invokes this port for every explicit HTTP dispatch,
// including compatibility requests and Agent-level retries.
type TextDispatchAudit interface {
	Start(context.Context, TextDispatch) (int64, error)
	Finish(context.Context, int64, TextDispatchOutcome) error
	Complete(context.Context, int64, TextDispatchDecodeOutcome) error
}

type textDispatchAuditKey struct{}

const textDispatchAuditTimeout = 5 * time.Second

func beginTextDispatch(ctx context.Context, path string, body any) (TextDispatchAudit, int64, error) {
	audit, _ := ctx.Value(textDispatchAuditKey{}).(TextDispatchAudit)
	if audit == nil {
		return nil, 0, nil
	}
	dispatch := TextDispatch{StreamFlag: "unspecified"}
	switch {
	case path == "/v1/responses":
		dispatch.Operation = "openai.responses"
	case path == "/v1/chat/completions":
		dispatch.Operation = "openai.chat_completions"
	case path == "/v1/messages":
		dispatch.Operation = "anthropic.messages"
	case strings.HasPrefix(path, "/v1beta/models/") && strings.HasSuffix(path, ":generateContent"):
		dispatch.Operation = "gemini.generate_content"
	default:
		return nil, 0, ErrTextDispatchStartUnconfirmed
	}
	if fields, ok := body.(map[string]any); ok {
		if stream, explicit := fields["stream"].(bool); explicit {
			dispatch.StreamFlag = "false"
			if stream {
				dispatch.StreamFlag = "true"
			}
		}
	}
	auditCtx, cancel := context.WithTimeout(ctx, textDispatchAuditTimeout)
	defer cancel()
	id, err := audit.Start(auditCtx, dispatch)
	if err != nil || id <= 0 || ctx.Err() != nil {
		// Never expose the storage error or allow it to drive Provider retries.
		return nil, 0, ErrTextDispatchStartUnconfirmed
	}
	return audit, id, nil
}

func finishTextDispatch(ctx context.Context, audit TextDispatchAudit, id int64, outcome TextDispatchOutcome) error {
	if audit == nil {
		return nil
	}
	// Opaque correlation identifiers are optional; reject malformed bytes
	// rather than letting an untrusted response prevent evidence persistence.
	outcome.Evidence = RequestEvidence{
		RequestID:   safeDispatchEvidence(outcome.Evidence.RequestID),
		AccountID:   safeDispatchEvidence(outcome.Evidence.AccountID),
		WorkspaceID: safeDispatchEvidence(outcome.Evidence.WorkspaceID),
	}
	auditCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), textDispatchAuditTimeout)
	defer cancel()
	if err := audit.Finish(auditCtx, id, outcome); err != nil {
		return ErrTextDispatchFinishUnconfirmed
	}
	return nil
}

func safeDispatchEvidence(value string) string {
	value = boundedEvidenceValue(value)
	for _, r := range value {
		if r < 0x21 || r > 0x7e {
			return ""
		}
	}
	return value
}

// textDispatchCollector keeps HTTP header receipt and decoded model outcome
// separate. Only 2xx responses need a decode outcome.
type textDispatchCollector struct {
	audit TextDispatchAudit
	responses []int64
}

func (c *textDispatchCollector) Start(ctx context.Context, dispatch TextDispatch) (int64, error) {
	return c.audit.Start(ctx, dispatch)
}

func (c *textDispatchCollector) Finish(ctx context.Context, id int64, outcome TextDispatchOutcome) error {
	if err := c.audit.Finish(ctx, id, outcome); err != nil {
		return err
	}
	if outcome.Status == "response_received" {
		c.responses = append(c.responses, id)
	}
	return nil
}

func (c *textDispatchCollector) Complete(ctx context.Context, id int64, outcome TextDispatchDecodeOutcome) error {
	return c.audit.Complete(ctx, id, outcome)
}

func (c *textDispatchCollector) complete(ctx context.Context, decodeErr error) error {
	if c == nil || len(c.responses) == 0 {
		return nil
	}
	status := "decoded"
	switch {
	case errors.Is(decodeErr, ErrTextStreamIncomplete), errors.Is(decodeErr, context.Canceled), errors.Is(decodeErr, context.DeadlineExceeded):
		status = "incomplete"
	case errors.Is(decodeErr, ErrTextStreamRejected):
		status = "rejected"
	case decodeErr != nil:
		status = "invalid"
	}
	var unconfirmed bool
	for _, id := range c.responses {
		auditCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), textDispatchAuditTimeout)
		err := c.audit.Complete(auditCtx, id, TextDispatchDecodeOutcome{Status: status})
		cancel()
		if err != nil {
			unconfirmed = true
		}
	}
	if unconfirmed {
		return ErrTextDispatchDecodeUnconfirmed
	}
	return nil
}
