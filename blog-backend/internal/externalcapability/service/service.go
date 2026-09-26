package service

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"slices"
	"strings"
	"time"

	externaldomain "github.com/rushairer/blog-backend/internal/externalcapability/domain"
	"github.com/rushairer/blog-backend/internal/ratelimit"
	"github.com/rushairer/blog-backend/internal/tool"
	tooldomain "github.com/rushairer/blog-backend/internal/tool/domain"
)

var (
	ErrInvalid     = errors.New("invalid external capability request")
	ErrUnauthorized = errors.New("invalid external API key")
	ErrForbidden   = errors.New("external capability is not authorized")
	ErrRateLimited = errors.New("external capability rate limit exceeded")
	ErrNotFound    = errors.New("external API client not found")
)

const (
	apiKeyPrefix            = "gouno_live_"
	defaultRateLimitPerMin  = 60
	maxRateLimitPerMinute   = 6000
)

type ClientRepository interface {
	Create(context.Context, *externaldomain.Client, []byte) error
	List(context.Context) ([]externaldomain.Client, error)
	FindByKeyHash(context.Context, []byte) (*externaldomain.Client, error)
	FindByID(context.Context, int64) (*externaldomain.Client, error)
	UpdatePolicy(context.Context, int64, string, []string, bool, int, *time.Time) (*externaldomain.Client, error)
	RotateKey(context.Context, int64, string, []byte) (*externaldomain.Client, error)
	Revoke(context.Context, int64) error
	TouchLastUsed(context.Context, int64)
	RecordAudit(context.Context, externaldomain.InvocationAudit) error
}

type Service struct {
	repo    ClientRepository
	tools   *tool.Registry
	limiter ratelimit.Limiter
}

func New(repo ClientRepository, tools *tool.Registry, limiter ratelimit.Limiter) *Service {
	if limiter == nil {
		limiter = ratelimit.NewMemoryLimiter()
	}
	return &Service{repo: repo, tools: tools, limiter: limiter}
}

func (s *Service) ExternalCatalog() []tool.CatalogItem {
	if s.tools == nil {
		return nil
	}
	items := s.tools.CatalogForSurface("external")
	result := make([]tool.CatalogItem, 0, len(items))
	for _, item := range items {
		if item.Risk == tooldomain.ToolRiskRead {
			result = append(result, item)
		}
	}
	return result
}

func (s *Service) CatalogForClient(client *externaldomain.Client) []tool.CatalogItem {
	if client == nil {
		return nil
	}
	allowed := make(map[string]struct{}, len(client.Capabilities))
	for _, name := range client.Capabilities {
		allowed[name] = struct{}{}
	}
	items := s.ExternalCatalog()
	result := make([]tool.CatalogItem, 0, len(items))
	for _, item := range items {
		if _, ok := allowed[item.Name]; ok {
			result = append(result, item)
		}
	}
	return result
}

func (s *Service) CreateClient(ctx context.Context, name string, capabilities []string, rateLimit int, expiresAt *time.Time, principalID *int64) (*externaldomain.CreatedClient, error) {
	name = strings.TrimSpace(name)
	if name == "" {
		return nil, ErrInvalid
	}
	capabilities, err := s.normalizeCapabilities(capabilities)
	if err != nil {
		return nil, err
	}
	rateLimit, err = normalizeRateLimit(rateLimit)
	if err != nil {
		return nil, err
	}
	rawKey, keyPrefix, keyHash, err := generateAPIKey()
	if err != nil {
		return nil, err
	}
	item := &externaldomain.Client{
		Name: name, KeyPrefix: keyPrefix, Capabilities: capabilities,
		Enabled: true, RateLimitPerMinute: rateLimit, ExpiresAt: expiresAt,
		CreatedByPrincipalID: principalID,
	}
	if err := s.repo.Create(ctx, item, keyHash); err != nil {
		return nil, err
	}
	return &externaldomain.CreatedClient{Client: *item, APIKey: rawKey}, nil
}

func (s *Service) ListClients(ctx context.Context) ([]externaldomain.Client, error) {
	return s.repo.List(ctx)
}

func (s *Service) UpdateClient(ctx context.Context, id int64, name string, capabilities []string, enabled bool, rateLimit int, expiresAt *time.Time) (*externaldomain.Client, error) {
	if id <= 0 || strings.TrimSpace(name) == "" {
		return nil, ErrInvalid
	}
	capabilities, err := s.normalizeCapabilities(capabilities)
	if err != nil {
		return nil, err
	}
	rateLimit, err = normalizeRateLimit(rateLimit)
	if err != nil {
		return nil, err
	}
	item, err := s.repo.UpdatePolicy(ctx, id, strings.TrimSpace(name), capabilities, enabled, rateLimit, expiresAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	return item, err
}

func (s *Service) RotateClientKey(ctx context.Context, id int64) (*externaldomain.CreatedClient, error) {
	if id <= 0 {
		return nil, ErrInvalid
	}
	rawKey, keyPrefix, keyHash, err := generateAPIKey()
	if err != nil {
		return nil, err
	}
	item, err := s.repo.RotateKey(ctx, id, keyPrefix, keyHash)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	return &externaldomain.CreatedClient{Client: *item, APIKey: rawKey}, nil
}

func (s *Service) RevokeClient(ctx context.Context, id int64) error {
	if id <= 0 {
		return ErrInvalid
	}
	err := s.repo.Revoke(ctx, id)
	if errors.Is(err, sql.ErrNoRows) {
		return ErrNotFound
	}
	return err
}

func (s *Service) Authenticate(ctx context.Context, rawKey string) (*externaldomain.Client, error) {
	rawKey = strings.TrimSpace(rawKey)
	if !strings.HasPrefix(rawKey, apiKeyPrefix) || len(rawKey) <= len(apiKeyPrefix)+16 {
		return nil, ErrUnauthorized
	}
	sum := sha256.Sum256([]byte(rawKey))
	client, err := s.repo.FindByKeyHash(ctx, sum[:])
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrUnauthorized
	}
	if err != nil {
		return nil, err
	}
	now := time.Now()
	if !client.Enabled || client.RevokedAt != nil || (client.ExpiresAt != nil && !client.ExpiresAt.After(now)) {
		return nil, ErrUnauthorized
	}
	s.repo.TouchLastUsed(ctx, client.ID)
	return client, nil
}

func (s *Service) Allow(ctx context.Context, client *externaldomain.Client) error {
	if client == nil || client.ID <= 0 {
		return ErrUnauthorized
	}
	allowed, err := s.limiter.Allow(ctx, "external-capability:"+client.KeyPrefix, client.RateLimitPerMinute, time.Minute)
	if err != nil {
		return err
	}
	if !allowed {
		return ErrRateLimited
	}
	return nil
}

func (s *Service) Invoke(ctx context.Context, client *externaldomain.Client, capability string, arguments json.RawMessage, requestID, sourceIP string) (result json.RawMessage, err error) {
	started := time.Now()
	if len(arguments) == 0 {
		arguments = json.RawMessage(`{}`)
	}
	audit := externaldomain.InvocationAudit{
		RequestID: requestID, Capability: capability, SourceIP: sourceIP,
		InputDigest: digest(arguments),
	}
	if client != nil {
		audit.ClientID = client.ID
	}
	defer func() {
		audit.DurationMS = time.Since(started).Milliseconds()
		audit.Result, audit.StatusCode = classifyInvocationResult(err)
		if audit.ClientID > 0 {
			_ = s.repo.RecordAudit(context.WithoutCancel(ctx), audit)
		}
	}()

	if client == nil || !slices.Contains(client.Capabilities, capability) {
		return nil, ErrForbidden
	}
	if s.tools == nil || !s.tools.SupportsSurface(capability, "external") {
		return nil, ErrForbidden
	}
	risk, ok := s.tools.Risk(capability)
	if !ok || risk != tooldomain.ToolRiskRead {
		return nil, ErrForbidden
	}
	if !json.Valid(arguments) {
		return nil, ErrInvalid
	}
	_, output, proposal, invokeErr := s.tools.Invoke(ctx, client.Capabilities, capability, arguments)
	if errors.Is(invokeErr, tool.ErrInvalidArgument) {
		return nil, ErrInvalid
	}
	if invokeErr != nil {
		return nil, invokeErr
	}
	if proposal != nil {
		return nil, ErrForbidden
	}
	return output, nil
}

func (s *Service) normalizeCapabilities(values []string) ([]string, error) {
	available := make(map[string]struct{})
	for _, item := range s.ExternalCatalog() {
		available[item.Name] = struct{}{}
	}
	unique := make(map[string]struct{}, len(values))
	for _, raw := range values {
		name := strings.TrimSpace(raw)
		if name == "" {
			continue
		}
		if _, ok := available[name]; !ok {
			return nil, ErrForbidden
		}
		unique[name] = struct{}{}
	}
	result := make([]string, 0, len(unique))
	for name := range unique {
		result = append(result, name)
	}
	slices.Sort(result)
	return result, nil
}

func normalizeRateLimit(value int) (int, error) {
	if value == 0 {
		return defaultRateLimitPerMin, nil
	}
	if value < 1 || value > maxRateLimitPerMinute {
		return 0, ErrInvalid
	}
	return value, nil
}

func generateAPIKey() (rawKey, keyPrefix string, keyHash []byte, err error) {
	buf := make([]byte, 32)
	if _, err = rand.Read(buf); err != nil {
		return "", "", nil, err
	}
	rawKey = apiKeyPrefix + base64.RawURLEncoding.EncodeToString(buf)
	prefixLen := 20
	if len(rawKey) < prefixLen {
		prefixLen = len(rawKey)
	}
	keyPrefix = rawKey[:prefixLen]
	sum := sha256.Sum256([]byte(rawKey))
	return rawKey, keyPrefix, sum[:], nil
}

func digest(raw []byte) string {
	sum := sha256.Sum256(raw)
	return hex.EncodeToString(sum[:])
}

func classifyInvocationResult(err error) (string, int) {
	switch {
	case err == nil:
		return "success", 200
	case errors.Is(err, ErrRateLimited):
		return "rate_limited", 429
	case errors.Is(err, ErrForbidden), errors.Is(err, ErrUnauthorized):
		return "denied", 403
	case errors.Is(err, ErrInvalid):
		return "failed", 400
	default:
		return "failed", 500
	}
}
