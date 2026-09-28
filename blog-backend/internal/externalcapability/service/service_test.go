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
)

var testPrincipalID int64 = 42

type fakeRepository struct {
	client       *externaldomain.Client
	keyHash      []byte
	audits       []externaldomain.InvocationAudit
	lastUsedID   int64
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

func (r *fakeRepository) RecordAudit(_ context.Context, audit externaldomain.InvocationAudit) error {
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
	svc := New(&fakeRepository{}, externalRegistry(), fixedLimiter{allowed: true})

	if _, err := svc.CreateClient(
		context.Background(), "Missing Actor", []string{"content.safe_read"}, 60, nil, nil,
	); !errors.Is(err, ErrInvalid) {
		t.Fatalf("missing actor error = %v", err)
	}

	longName := strings.Repeat("x", 121)
	if _, err := svc.CreateClient(
		context.Background(), longName, []string{"content.safe_read"}, 60, nil, &testPrincipalID,
	); !errors.Is(err, ErrInvalid) {
		t.Fatalf("long name error = %v", err)
	}
}

func TestCreateClientReturnsSecretOnceAndAuthenticatesHash(t *testing.T) {
	repo := &fakeRepository{}
	svc := New(repo, externalRegistry(), fixedLimiter{allowed: true})
	created, err := svc.CreateClient(
		context.Background(), "Reporting", []string{"content.safe_read"}, 30, nil, &testPrincipalID,
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
	svc := New(&fakeRepository{}, externalRegistry(), fixedLimiter{allowed: true})
	for _, capability := range []string{"content.agent_only", "content.write", "missing"} {
		_, err := svc.CreateClient(context.Background(), "Unsafe", []string{capability}, 60, nil, &testPrincipalID)
		if !errors.Is(err, ErrForbidden) {
			t.Fatalf("%s error = %v", capability, err)
		}
	}
}

func TestInvokeRequiresExplicitReadScopeAndRecordsAudit(t *testing.T) {
	repo := &fakeRepository{}
	svc := New(repo, externalRegistry(), fixedLimiter{allowed: true})
	created, err := svc.CreateClient(
		context.Background(), "Reporting", []string{"content.safe_read"}, 60, nil, &testPrincipalID,
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
	svc := New(&fakeRepository{}, externalRegistry(), fixedLimiter{allowed: false})
	if err := svc.AllowAuthenticationFailure(context.Background(), "203.0.113.10"); !errors.Is(err, ErrRateLimited) {
		t.Fatalf("authentication failure rate limit error = %v", err)
	}
}

func TestRateLimitFailsClosedAtServiceBoundary(t *testing.T) {
	svc := New(&fakeRepository{}, externalRegistry(), fixedLimiter{allowed: false})
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
		svc := New(repo, externalRegistry(), fixedLimiter{allowed: true})
		created, err := svc.CreateClient(
			context.Background(), "Reporting", []string{"content.safe_read"}, 60, nil, &testPrincipalID,
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
	svc := New(repo, externalRegistry(), fixedLimiter{allowed: true})
	expired := time.Now().Add(-time.Minute)
	if _, err := svc.CreateClient(
		context.Background(), "Expired", []string{"content.safe_read"}, 60, &expired, &testPrincipalID,
	); !errors.Is(err, ErrInvalid) {
		t.Fatalf("create expired error = %v", err)
	}

	created, err := svc.CreateClient(
		context.Background(), "Valid", []string{"content.safe_read"}, 60, nil, &testPrincipalID,
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
	svc := New(&fakeRepository{}, externalRegistry(), fixedLimiter{allowed: true})
	for _, limit := range []int{-1, 501} {
		if _, err := svc.ListAudits(context.Background(), 0, limit); !errors.Is(err, ErrInvalid) {
			t.Fatalf("limit %d error = %v", limit, err)
		}
	}
}


func TestRecordRateLimitedPersistsKnownClientAudit(t *testing.T) {
	repo := &fakeRepository{}
	svc := New(repo, externalRegistry(), fixedLimiter{allowed: false})
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
