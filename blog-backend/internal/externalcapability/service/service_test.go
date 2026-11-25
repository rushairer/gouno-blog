package service

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/json"
	"errors"
	"strings"
	"testing"
	"time"

	externaldomain "github.com/rushairer/blog-backend/internal/externalcapability/domain"
	"github.com/rushairer/blog-backend/internal/tool"
	tooldomain "github.com/rushairer/blog-backend/internal/tool/domain"
	"go.uber.org/zap"
	"go.uber.org/zap/zaptest/observer"
)

var testPrincipalID int64 = 42

type fakeRepository struct {
	client       *externaldomain.Client
	keyHash      []byte
	audits       []externaldomain.InvocationAudit
	lastUsedID   int64
	auditWrite   func(context.Context, externaldomain.InvocationAudit) error
}

func (r *fakeRepository) Create(_ context.Context, item *externaldomain.Client, keyHash []byte) error {
	item.ID = 1
	item.CreatedAt = time.Now()
	item.UpdatedAt = item.CreatedAt
	r.client = item
	r.keyHash = append([]byte(nil), keyHash...)
	return nil
}

func (r *fakeRepository) List(context.Context) ([]externaldomain.Client, error) {
	if r.client == nil {
		return nil, nil
	}
	return []externaldomain.Client{*r.client}, nil
}

func (r *fakeRepository) ListAudits(context.Context, int64, int) ([]externaldomain.InvocationAudit, error) {
	return append([]externaldomain.InvocationAudit(nil), r.audits...), nil
}

func (r *fakeRepository) FindByKeyHash(_ context.Context, keyHash []byte) (*externaldomain.Client, error) {
	if r.client == nil || string(keyHash) != string(r.keyHash) {
		return nil, sql.ErrNoRows
	}
	copy := *r.client
	return &copy, nil
}

func (r *fakeRepository) FindByID(context.Context, int64) (*externaldomain.Client, error) {
	if r.client == nil {
		return nil, sql.ErrNoRows
	}
	copy := *r.client
	return &copy, nil
}

func (r *fakeRepository) UpdatePolicy(_ context.Context, _ int64, name string, capabilities []string, enabled bool, rateLimit int, expiresAt *time.Time) (*externaldomain.Client, error) {
	if r.client == nil {
		return nil, sql.ErrNoRows
	}
	r.client.Name = name
	r.client.Capabilities = append([]string(nil), capabilities...)
	r.client.Enabled = enabled
	r.client.RateLimitPerMinute = rateLimit
	r.client.ExpiresAt = expiresAt
	copy := *r.client
	return &copy, nil
}

func (r *fakeRepository) RotateKey(_ context.Context, _ int64, prefix string, keyHash []byte) (*externaldomain.Client, error) {
	if r.client == nil {
		return nil, sql.ErrNoRows
	}
	r.client.KeyPrefix = prefix
	r.keyHash = append([]byte(nil), keyHash...)
	copy := *r.client
	return &copy, nil
}

func (r *fakeRepository) Revoke(context.Context, int64) error {
	if r.client == nil {
		return sql.ErrNoRows
	}
	now := time.Now()
	r.client.Enabled = false
	r.client.RevokedAt = &now
	return nil
}

func (r *fakeRepository) TouchLastUsed(_ context.Context, id int64) {
	r.lastUsedID = id
}

func (r *fakeRepository) RecordAudit(ctx context.Context, audit externaldomain.InvocationAudit) error {
	if r.auditWrite != nil {
		if err := r.auditWrite(ctx, audit); err != nil {
			return err
		}
	}
	r.audits = append(r.audits, audit)
	return nil
}

type fixedLimiter struct {
	allowed bool
}

func (l fixedLimiter) Allow(context.Context, string, int, time.Duration) (bool, error) {
	return l.allowed, nil
}

func externalRegistry() *tool.Registry {
	return tool.New(
		tool.Definition{
			Name: "content.safe_read", Surfaces: []string{"agent", "external"},
			Risk: tooldomain.ToolRiskRead, Parameters: json.RawMessage(`{"type":"object"}`),
			Execute: func(context.Context, json.RawMessage) (any, error) {
				return map[string]bool{"ok": true}, nil
			},
		},
		tool.Definition{
			Name: "content.agent_only", Surfaces: []string{"agent"},
			Risk: tooldomain.ToolRiskRead, Parameters: json.RawMessage(`{"type":"object"}`),
			Execute: func(context.Context, json.RawMessage) (any, error) {
				return map[string]bool{"ok": true}, nil
			},
		},
		tool.Definition{
			Name: "content.write", Surfaces: []string{"external"},
			Risk: tooldomain.ToolRiskWrite, Parameters: json.RawMessage(`{"type":"object"}`),
			Execute: func(context.Context, json.RawMessage) (any, error) {
				return map[string]bool{"unsafe": true}, nil
			},
		},
	)
}

func TestCreateClientRequiresAuditableActorAndBoundedName(t *testing.T) {
	svc := New(&fakeRepository{}, externalRegistry(), fixedLimiter{allowed: true}, nil)

	if _, err := svc.CreateClient(
		context.Background(), "Missing Actor", []string{"content.safe_read"}, true, 60, nil, nil,
	); !errors.Is(err, ErrInvalid) {
		t.Fatalf("missing actor error = %v", err)
	}

	longName := strings.Repeat("x", 121)
	if _, err := svc.CreateClient(
		context.Background(), longName, []string{"content.safe_read"}, true, 60, nil, &testPrincipalID,
	); !errors.Is(err, ErrInvalid) {
		t.Fatalf("long name error = %v", err)
	}
}

func TestCreateClientCanStartDisabled(t *testing.T) {
	repo := &fakeRepository{}
	svc := New(repo, externalRegistry(), fixedLimiter{allowed: true}, nil)
	created, err := svc.CreateClient(
		context.Background(), "Staged", []string{"content.safe_read"}, false, 60, nil, &testPrincipalID,
	)
	if err != nil {
		t.Fatal(err)
	}
	if created.Client.Enabled || repo.client == nil || repo.client.Enabled {
		t.Fatalf("created client enabled state = %#v repo=%#v", created.Client, repo.client)
	}
}

func TestCreateClientReturnsSecretOnceAndAuthenticatesHash(t *testing.T) {
	repo := &fakeRepository{}
	svc := New(repo, externalRegistry(), fixedLimiter{allowed: true}, nil)
	created, err := svc.CreateClient(
		context.Background(), "Reporting", []string{"content.safe_read"}, true, 30, nil, &testPrincipalID,
	)
	if err != nil {
		t.Fatal(err)
	}
	if created.APIKey == "" || created.Client.KeyPrefix == "" {
		t.Fatalf("created client = %#v", created)
	}
	if created.APIKey == string(repo.keyHash) {
		t.Fatal("repository stored the raw API key")
	}
	sum := sha256.Sum256([]byte(created.APIKey))
	if string(sum[:]) != string(repo.keyHash) {
		t.Fatal("repository key hash does not match returned secret")
	}
	client, err := svc.Authenticate(context.Background(), created.APIKey)
	if err != nil || client.ID != created.Client.ID || repo.lastUsedID != created.Client.ID {
		t.Fatalf("client=%#v lastUsed=%d err=%v", client, repo.lastUsedID, err)
	}
	if _, err := svc.Authenticate(context.Background(), created.APIKey+"x"); !errors.Is(err, ErrUnauthorized) {
		t.Fatalf("invalid key error = %v", err)
	}
}

func TestCreateClientRejectsNonExternalOrWriteCapabilities(t *testing.T) {
	svc := New(&fakeRepository{}, externalRegistry(), fixedLimiter{allowed: true}, nil)
	for _, capability := range []string{"content.agent_only", "content.write", "missing"} {
		_, err := svc.CreateClient(context.Background(), "Unsafe", []string{capability}, true, 60, nil, &testPrincipalID)
		if !errors.Is(err, ErrForbidden) {
			t.Fatalf("%s error = %v", capability, err)
		}
	}
}

func TestInvokeRequiresExplicitReadScopeAndRecordsAudit(t *testing.T) {
	repo := &fakeRepository{}
	svc := New(repo, externalRegistry(), fixedLimiter{allowed: true}, nil)
	created, err := svc.CreateClient(
		context.Background(), "Reporting", []string{"content.safe_read"}, true, 60, nil, &testPrincipalID,
	)
	if err != nil {
		t.Fatal(err)
	}
	result, err := svc.Invoke(
		context.Background(), &created.Client, "content.safe_read",
		json.RawMessage(`{}`), "req-1", "203.0.113.5",
	)
	if err != nil || string(result) != `{"ok":true}` {
		t.Fatalf("result=%s err=%v", result, err)
	}
	if len(repo.audits) != 1 || repo.audits[0].Result != "success" ||
		repo.audits[0].Capability != "content.safe_read" ||
		repo.audits[0].InputDigest == "" {
		t.Fatalf("audits = %#v", repo.audits)
	}

	_, err = svc.Invoke(
		context.Background(), &created.Client, "content.agent_only",
		json.RawMessage(`{}`), "req-2", "203.0.113.5",
	)
	if !errors.Is(err, ErrForbidden) {
		t.Fatalf("agent-only invoke error = %v", err)
	}
	if len(repo.audits) != 2 || repo.audits[1].Result != "denied" {
		t.Fatalf("denied audit = %#v", repo.audits)
	}
}

func TestAuthenticationFailureRateLimitFailsClosedAtServiceBoundary(t *testing.T) {
	svc := New(&fakeRepository{}, externalRegistry(), fixedLimiter{allowed: false}, nil)
	if err := svc.AllowAuthenticationFailure(context.Background(), "203.0.113.10"); !errors.Is(err, ErrRateLimited) {
		t.Fatalf("authentication failure rate limit error = %v", err)
	}
}

func TestRateLimitFailsClosedAtServiceBoundary(t *testing.T) {
	svc := New(&fakeRepository{}, externalRegistry(), fixedLimiter{allowed: false}, nil)
	client := &externaldomain.Client{ID: 1, KeyPrefix: "gouno_live_example", RateLimitPerMinute: 1}
	if err := svc.Allow(context.Background(), client); !errors.Is(err, ErrRateLimited) {
		t.Fatalf("rate limit error = %v", err)
	}
}

func TestExpiredAndRevokedClientsCannotAuthenticate(t *testing.T) {
	for _, mutate := range []func(*externaldomain.Client){
		func(client *externaldomain.Client) {
			expired := time.Now().Add(-time.Minute)
			client.ExpiresAt = &expired
		},
		func(client *externaldomain.Client) {
			now := time.Now()
			client.RevokedAt = &now
		},
		func(client *externaldomain.Client) {
			client.Enabled = false
		},
	} {
		repo := &fakeRepository{}
		svc := New(repo, externalRegistry(), fixedLimiter{allowed: true}, nil)
		created, err := svc.CreateClient(
			context.Background(), "Reporting", []string{"content.safe_read"}, true, 60, nil, &testPrincipalID,
		)
		if err != nil {
			t.Fatal(err)
		}
		mutate(repo.client)
		if _, err := svc.Authenticate(context.Background(), created.APIKey); !errors.Is(err, ErrUnauthorized) {
			t.Fatalf("authentication error = %v", err)
		}
	}
}


func TestCreateAndUpdateRejectExpiredCredentials(t *testing.T) {
	repo := &fakeRepository{}
	svc := New(repo, externalRegistry(), fixedLimiter{allowed: true}, nil)
	expired := time.Now().Add(-time.Minute)
	if _, err := svc.CreateClient(
		context.Background(), "Expired", []string{"content.safe_read"}, true, 60, &expired, &testPrincipalID,
	); !errors.Is(err, ErrInvalid) {
		t.Fatalf("create expired error = %v", err)
	}

	created, err := svc.CreateClient(
		context.Background(), "Valid", []string{"content.safe_read"}, true, 60, nil, &testPrincipalID,
	)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := svc.UpdateClient(
		context.Background(), created.Client.ID, "Valid", []string{"content.safe_read"},
		true, 60, &expired,
	); !errors.Is(err, ErrInvalid) {
		t.Fatalf("update expired error = %v", err)
	}
}

func TestListAuditsBoundsLimit(t *testing.T) {
	svc := New(&fakeRepository{}, externalRegistry(), fixedLimiter{allowed: true}, nil)
	for _, limit := range []int{-1, 501} {
		if _, err := svc.ListAudits(context.Background(), 0, limit); !errors.Is(err, ErrInvalid) {
			t.Fatalf("limit %d error = %v", limit, err)
		}
	}
}


func TestRecordRateLimitedPersistsKnownClientAudit(t *testing.T) {
	repo := &fakeRepository{}
	svc := New(repo, externalRegistry(), fixedLimiter{allowed: false}, nil)
	client := &externaldomain.Client{ID: 7, KeyPrefix: "gouno_live_example", RateLimitPerMinute: 1}

	svc.RecordRateLimited(
		context.Background(), client, "content.list_published_posts", "req-rate", "203.0.113.9",
	)
	if len(repo.audits) != 1 {
		t.Fatalf("audits = %#v", repo.audits)
	}
	audit := repo.audits[0]
	if audit.Result != "rate_limited" || audit.StatusCode != 429 ||
		audit.Capability != "content.list_published_posts" || audit.ClientID != 7 {
		t.Fatalf("audit = %#v", audit)
	}
}

func TestInvocationAuditFailureWithholdsSuccessfulReadAndPreservesDenial(t *testing.T) {
	for _, tc := range []struct {
		name       string
		capability string
		arguments  json.RawMessage
		want       error
		auditState string
	}{
		{"successful-read", "content.safe_read", json.RawMessage(`{}`), ErrAuditUnavailable, "success"},
		{"denied", "content.agent_only", json.RawMessage(`{}`), ErrForbidden, "denied"},
		{"invalid", "content.safe_read", json.RawMessage(`{`), ErrInvalid, "failed"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			const privateCause = "private-storage-detail"
			auditFailure := errors.New(privateCause)
			core, logs := observer.New(zap.ErrorLevel)
			attempts := 0
			repo := &fakeRepository{
				auditWrite: func(ctx context.Context, audit externaldomain.InvocationAudit) error {
					attempts++
					if audit.Result != tc.auditState {
						t.Fatalf("audit state = %q, want %q", audit.Result, tc.auditState)
					}
					deadline, ok := ctx.Deadline()
					if !ok || time.Until(deadline) > invocationAuditTimeout || ctx.Err() != nil {
						t.Fatalf("audit must have an independent bounded context")
					}
					return auditFailure
				},
			}
			svc := New(repo, externalRegistry(), fixedLimiter{allowed: true}, zap.New(core))
			client := &externaldomain.Client{ID: 7, Capabilities: []string{"content.safe_read"}}
			result, err := svc.Invoke(context.Background(), client, tc.capability, tc.arguments, "private-request-id", "203.0.113.10")
			if result != nil || !errors.Is(err, tc.want) {
				t.Fatalf("result=%s err=%v, want nil and %v", result, err, tc.want)
			}
			if tc.want == ErrAuditUnavailable && !errors.Is(err, auditFailure) {
				t.Fatal("audit failure cause was not retained in the trusted error chain")
			}
			if attempts != 1 || len(repo.audits) != 0 {
				t.Fatalf("uncertain audit write must not be retried: attempts=%d audits=%d", attempts, len(repo.audits))
			}
			entries := logs.All()
			if len(entries) != 1 || entries[0].Message != "external capability invocation audit write failed" {
				t.Fatalf("expected one fixed diagnostic: %#v", entries)
			}
			fields := entries[0].ContextMap()
			if len(fields) != 4 || fields["result"] != tc.auditState || fields["client_id"] != int64(7) {
				t.Fatalf("unsafe or unexpected diagnostic fields: %#v", fields)
			}
		})
	}
}

func TestAuditContextSurvivesCancellationWithBoundedDeadline(t *testing.T) {
	core, logs := observer.New(zap.ErrorLevel)
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	calls := 0
	repo := &fakeRepository{
		auditWrite: func(auditCtx context.Context, audit externaldomain.InvocationAudit) error {
			calls++
			deadline, ok := auditCtx.Deadline()
			if !ok || time.Until(deadline) > invocationAuditTimeout || auditCtx.Err() != nil {
				t.Fatal("cancelled request did not receive a fresh bounded audit context")
			}
			if audit.Result != "rate_limited" || audit.StatusCode != 429 {
				t.Fatalf("unexpected audit: %#v", audit)
			}
			select {
			case <-auditCtx.Done():
				return auditCtx.Err()
			case <-time.After(invocationAuditTimeout + time.Second):
				t.Fatal("audit deadline did not expire")
				return nil
			}
		},
	}
	svc := New(repo, externalRegistry(), fixedLimiter{allowed: false}, zap.New(core))
	svc.RecordRateLimited(ctx, &externaldomain.Client{ID: 7}, "content.safe_read", "request", "203.0.113.10")
	entries := logs.All()
	if calls != 1 || len(entries) != 1 || entries[0].ContextMap()["deadline_exceeded"] != true {
		t.Fatalf("rate limit audit timeout not recorded: calls=%d logs=%#v", calls, entries)
	}
}

func TestInvocationWithoutPersistedClientIdentityCannotSucceed(t *testing.T) {
	repo := &fakeRepository{}
	svc := New(repo, externalRegistry(), fixedLimiter{allowed: true}, nil)
	client := &externaldomain.Client{Capabilities: []string{"content.safe_read"}}
	result, err := svc.Invoke(context.Background(), client, "content.safe_read", json.RawMessage(`{}`), "", "")
	if result != nil || !errors.Is(err, ErrForbidden) || len(repo.audits) != 0 {
		t.Fatalf("identityless invocation: result=%s err=%v audits=%#v", result, err, repo.audits)
	}
}
