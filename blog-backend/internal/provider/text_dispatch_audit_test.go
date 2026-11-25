package provider

import (
	"context"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

type recordingTextDispatchAudit struct {
	starts []TextDispatch
	outcomes []TextDispatchOutcome
	completions []TextDispatchDecodeOutcome
	startErr, finishErr, completeErr error
}

func (a *recordingTextDispatchAudit) Start(ctx context.Context, dispatch TextDispatch) (int64, error) {
	a.starts = append(a.starts, dispatch)
	if _, ok := ctx.Deadline(); !ok {
		return 0, errors.New("missing start deadline")
	}
	if a.startErr != nil {
		return 0, a.startErr
	}
	return int64(len(a.starts)), nil
}

func (a *recordingTextDispatchAudit) Finish(ctx context.Context, id int64, outcome TextDispatchOutcome) error {
	if _, ok := ctx.Deadline(); !ok || ctx.Err() != nil {
		return errors.New("missing independent finish deadline")
	}
	if id != int64(len(a.starts)) {
		return errors.New("wrong dispatch identity")
	}
	a.outcomes = append(a.outcomes, outcome)
	return a.finishErr
}

func (a *recordingTextDispatchAudit) Complete(ctx context.Context, id int64, outcome TextDispatchDecodeOutcome) error {
	if _, ok := ctx.Deadline(); !ok || ctx.Err() != nil || id <= 0 {
		return errors.New("missing bounded decode completion context")
	}
	a.completions = append(a.completions, outcome)
	return a.completeErr
}

func TestTextDispatchAuditTracksNegotiationWithoutRecordingBody(t *testing.T) {
	var calls atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("X-Client-Request-Id") != "" {
			t.Error("text audit unexpectedly forwarded a new client correlation header")
		}
		if calls.Add(1) == 1 {
			w.Header().Set("x-request-id", "first-rejection")
			w.WriteHeader(http.StatusBadRequest)
			_, _ = w.Write([]byte(`{"error":{"message":"Stream must be set to true"}}`))
			return
		}
		w.Header().Set("x-request-id", "second-rejection")
		w.Header().Set("openai-organization", strings.Repeat("x", 513))
		w.WriteHeader(http.StatusUnauthorized)
		_, _ = w.Write([]byte(`{"error":{"message":"private response body"}}`))
	}))
	defer server.Close()
	client, err := NewHTTPProviderWithConfig("openai", server.URL, "fixture-key", "model", "responses", "auto", []string{"127.0.0.1"}, time.Second)
	if err != nil {
		t.Fatal(err)
	}
	audit := &recordingTextDispatchAudit{}
	_, err = client.Generate(context.Background(), Request{Instructions: "private prompt", DispatchAudit: audit})
	var upstreamErr *upstreamHTTPError
	if !errors.As(err, &upstreamErr) || upstreamErr.StatusCode != 401 || calls.Load() != 2 || len(audit.starts) != 2 || len(audit.outcomes) != 2 {
		t.Fatalf("unexpected dispatches: calls=%d starts=%#v outcomes=%#v err=%v", calls.Load(), audit.starts, audit.outcomes, err)
	}
	if audit.starts[0].Operation != "openai.responses" || audit.starts[0].StreamFlag != "unspecified" ||
		audit.starts[1].StreamFlag != "true" ||
		audit.outcomes[0].Status != "http_error" || audit.outcomes[0].HTTPStatus != 400 ||
		audit.outcomes[0].Evidence.RequestID != "first-rejection" ||
		audit.outcomes[1].HTTPStatus != 401 || audit.outcomes[1].Evidence.RequestID != "second-rejection" ||
		audit.outcomes[1].Evidence.AccountID != "" {
		t.Fatalf("incorrect bounded evidence: starts=%#v outcomes=%#v", audit.starts, audit.outcomes)
	}
}

func TestTextDispatchAuditAcknowledgementFailuresStopBeforeRetryOrNegotiation(t *testing.T) {
	for _, before := range []bool{true, false} {
		for _, status := range []int{http.StatusBadRequest, http.StatusTooManyRequests, http.StatusOK} {
			var calls atomic.Int32
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
				calls.Add(1)
				w.WriteHeader(status)
				_, _ = w.Write([]byte(`{"error":{"message":"Stream must be set to true"}}`))
			}))
			client, err := NewHTTPProviderWithConfig("openai", server.URL, "fixture-key", "model", "responses", "auto", []string{"127.0.0.1"}, time.Second)
			if err != nil {
				server.Close()
				t.Fatal(err)
			}
			audit := &recordingTextDispatchAudit{}
			want := ErrTextDispatchFinishUnconfirmed
			wantCalls := int32(1)
			if before {
				audit.startErr = errors.New("private storage detail")
				want, wantCalls = ErrTextDispatchStartUnconfirmed, 0
			} else {
				audit.finishErr = errors.New("private storage detail")
			}
			_, err = client.Generate(context.Background(), Request{DispatchAudit: audit})
			server.Close()
			if !errors.Is(err, want) || calls.Load() != wantCalls || len(audit.starts) != 1 ||
				len(audit.outcomes) != int(wantCalls) || RetryableTextRejection(err) ||
				strings.Contains(err.Error(), "private storage detail") {
				t.Fatalf("audit failure permitted replay: before=%v HTTP=%d calls=%d audit=%#v err=%v", before, status, calls.Load(), audit, err)
			}
		}
	}
}

func TestTextDispatchResponseHeadersAreNotDecodedModelSuccess(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("x-request-id", "observed-response")
		_, _ = w.Write([]byte("not JSON"))
	}))
	defer server.Close()
	client, err := NewHTTPProviderWithConfig("openai", server.URL, "fixture-key", "model", "responses", "never", []string{"127.0.0.1"}, time.Second)
	if err != nil {
		t.Fatal(err)
	}
	audit := &recordingTextDispatchAudit{}
	_, err = client.Generate(context.Background(), Request{DispatchAudit: audit})
	if err == nil || len(audit.outcomes) != 1 || audit.outcomes[0].Status != "response_received" ||
		audit.outcomes[0].HTTPStatus != 200 || audit.outcomes[0].Evidence.RequestID != "observed-response" {
		t.Fatalf("parse failure confused with HTTP evidence: outcomes=%#v err=%v", audit.outcomes, err)
	}
}

func TestTextDispatchTransportUnknownUsesIndependentOutcomeContext(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(http.ResponseWriter, *http.Request) {}))
	client, err := NewHTTPProviderWithConfig("openai", server.URL, "fixture-key", "model", "responses", "never", []string{"127.0.0.1"}, time.Second)
	server.Close()
	if err != nil {
		t.Fatal(err)
	}
	audit := &recordingTextDispatchAudit{}
	_, err = client.Generate(context.Background(), Request{DispatchAudit: audit})
	if err == nil || len(audit.starts) != 1 || len(audit.outcomes) != 1 ||
		audit.outcomes[0].Status != "transport_unknown" || audit.outcomes[0].HTTPStatus != 0 ||
		RetryableTextRejection(err) {
		t.Fatalf("transport failure lost or retryable: audit=%#v err=%v", audit, err)
	}
}

func TestTextDispatchAuditRecordsDecodedInvalidAndIncompleteResponses(t *testing.T) {
	for _, tc := range []struct {
		name, body, mode, wantStatus string
		wantErr error
		wantText string
	}{
		{"decoded", `{"status":"completed","output_text":"ok","usage":{"input_tokens":4,"output_tokens":2}}`, "never", "decoded", nil, "ok"},
		{"invalid-json", `{"status":`, "never", "invalid", io.ErrUnexpectedEOF, ""},
		{"incomplete-stream", "data: {\"type\":\"response.output_text.delta\",\"delta\":\"partial\"}\n\n", "always", "incomplete", ErrTextStreamIncomplete, ""},
		{"failed-stream", "data: {\"type\":\"response.failed\",\"response\":{\"status\":\"failed\"}}\n\n", "always", "rejected", ErrTextStreamRejected, ""},
	} {
		t.Run(tc.name, func(t *testing.T) {
			var calls atomic.Int32
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
				calls.Add(1)
				if tc.mode == "always" { w.Header().Set("Content-Type", "text/event-stream") }
				w.WriteHeader(http.StatusOK)
				_, _ = w.Write([]byte(tc.body))
			}))
			defer server.Close()
			client, err := NewHTTPProviderWithConfig("openai", server.URL, "fixture-key", "model", "responses", tc.mode, []string{"127.0.0.1"}, time.Second)
			if err != nil { t.Fatal(err) }
			audit := &recordingTextDispatchAudit{}
			result, err := client.Generate(context.Background(), Request{DispatchAudit: audit})
			if tc.wantErr != nil && !errors.Is(err, tc.wantErr) || tc.wantErr == nil && err != nil {
				t.Fatalf("result=%#v err=%v", result, err)
			}
			if calls.Load() != 1 || len(audit.outcomes) != 1 || audit.outcomes[0].Status != "response_received" ||
				len(audit.completions) != 1 || audit.completions[0].Status != tc.wantStatus || result.Text != tc.wantText {
				t.Fatalf("decode evidence mismatch: calls=%d outcomes=%#v decoded=%#v result=%#v err=%v", calls.Load(), audit.outcomes, audit.completions, result, err)
			}
		})
	}
}

func TestTextDispatchDecodeAcknowledgementFailureWithholdsModelOutput(t *testing.T) {
	var calls atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		calls.Add(1)
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"status":"completed","output_text":"must not escape","usage":{"input_tokens":6,"output_tokens":2}}`))
	}))
	defer server.Close()
	client, err := NewHTTPProviderWithConfig("openai", server.URL, "fixture-key", "model", "responses", "never", []string{"127.0.0.1"}, time.Second)
	if err != nil { t.Fatal(err) }
	audit := &recordingTextDispatchAudit{completeErr: errors.New("private storage failure")}
	result, err := client.Generate(context.Background(), Request{DispatchAudit: audit})
	if !errors.Is(err, ErrTextDispatchDecodeUnconfirmed) || calls.Load() != 1 ||
		result.Text != "" || len(result.ToolCalls) != 0 || result.InputTokens != 6 || result.OutputTokens != 2 ||
		len(audit.completions) != 1 || RetryableTextRejection(err) {
		t.Fatalf("unacknowledged decode exposed or replayed: calls=%d result=%#v audit=%#v err=%v", calls.Load(), result, audit, err)
	}
}
