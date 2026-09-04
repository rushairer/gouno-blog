package authbff

import (
	"context"
	"errors"
	"strings"
	"time"

	"github.com/redis/go-redis/v9"
)

const recentMFARecordKind = "recent_mfa"

var ErrRecentMFARequired = errors.New("step-up did not establish recent multi-factor authentication")

type RecentMFAEvidence struct {
	AuthTime   int64     `json:"auth_time"`
	AMR        []string  `json:"amr"`
	RecordedAt time.Time `json:"recorded_at"`
}

// recentMFAEvidence converts verified interactive OIDC authentication claims
// into Blog-owned transaction-freshness evidence. Refresh-token responses must
// never call this helper: only browser authorization callbacks may establish a
// fresh MFA record.
func recentMFAEvidence(authTime int64, amr []string, now time.Time) (RecentMFAEvidence, time.Duration, bool) {
	if authTime <= 0 || len(amr) == 0 {
		return RecentMFAEvidence{}, 0, false
	}
	authenticatedAt := time.Unix(authTime, 0)
	if authenticatedAt.After(now.Add(60*time.Second)) || now.Sub(authenticatedAt) > 10*time.Minute {
		return RecentMFAEvidence{}, 0, false
	}
	strong := false
	for _, method := range amr {
		switch strings.ToLower(strings.TrimSpace(method)) {
		case "otp", "totp", "mfa", "swk", "webauthn", "fido2":
			strong = true
		}
	}
	if !strong {
		return RecentMFAEvidence{}, 0, false
	}
	ttl := authenticatedAt.Add(10 * time.Minute).Sub(now)
	if ttl <= 0 {
		return RecentMFAEvidence{}, 0, false
	}
	return RecentMFAEvidence{
		AuthTime:   authTime,
		AMR:        append([]string(nil), amr...),
		RecordedAt: now.UTC(),
	}, ttl, true
}

// persistRecentMFAFromCallback is the only production write path for recent
// MFA evidence. It is deliberately called from the interactive authorization
// callback, never from Refresh, so token renewal cannot extend transaction
// freshness.
func (c *Client) persistRecentMFAFromCallback(ctx context.Context, flow AuthorizationFlow, sessionHandle string, session Session) error {
	evidence, ttl, ok := recentMFAEvidence(session.AuthTime, session.AMR, c.flowNow())
	if !ok {
		if flow.Purpose == "step_up" {
			return ErrRecentMFARequired
		}
		return nil
	}
	remaining, err := c.sessionRemainingTTL(session)
	if err != nil {
		return err
	}
	if ttl > remaining {
		ttl = remaining
	}
	if ttl <= 0 {
		return ErrSessionExpired
	}
	if err := c.store.PutRecentMFA(ctx, sessionHandle, evidence, ttl); err != nil {
		return err
	}
	if flow.Purpose == "step_up" && flow.SessionHandle != "" && flow.SessionHandle != sessionHandle {
		_ = c.store.DeleteRecentMFA(ctx, flow.SessionHandle)
	}
	return nil
}

func (s *Store) PutRecentMFA(ctx context.Context, sessionHandle string, evidence RecentMFAEvidence, ttl time.Duration) error {
	if sessionHandle == "" || evidence.AuthTime <= 0 || len(evidence.AMR) == 0 || ttl <= 0 {
		return errors.New("recent MFA evidence requires session, authentication context and positive TTL")
	}
	return s.put(ctx, recentMFARecordKind, sessionHandle, evidence, ttl, false)
}

func (s *Store) GetRecentMFA(ctx context.Context, sessionHandle string) (RecentMFAEvidence, error) {
	if sessionHandle == "" {
		return RecentMFAEvidence{}, ErrNotFound
	}
	key, aad := s.key(recentMFARecordKind, sessionHandle)
	value, err := s.redis.Get(ctx, key).Bytes()
	if errors.Is(err, redis.Nil) {
		return RecentMFAEvidence{}, ErrNotFound
	}
	if err != nil {
		return RecentMFAEvidence{}, err
	}
	var evidence RecentMFAEvidence
	if err := s.open(value, aad, &evidence); err != nil {
		return RecentMFAEvidence{}, err
	}
	if evidence.AuthTime <= 0 || len(evidence.AMR) == 0 {
		return RecentMFAEvidence{}, errors.New("invalid recent MFA evidence")
	}
	return evidence, nil
}

func (s *Store) DeleteRecentMFA(ctx context.Context, sessionHandle string) error {
	if sessionHandle == "" {
		return nil
	}
	key, _ := s.key(recentMFARecordKind, sessionHandle)
	return s.redis.Del(ctx, key).Err()
}

// PeekFlow reads an encrypted flow record without consuming it. The callback
// uses this only to distinguish login from step-up before Complete atomically
// consumes the same flow with GETDEL.
func (s *Store) PeekFlow(ctx context.Context, handle string) (AuthorizationFlow, error) {
	if handle == "" {
		return AuthorizationFlow{}, ErrNotFound
	}
	key, aad := s.key("flow", handle)
	value, err := s.redis.Get(ctx, key).Bytes()
	if errors.Is(err, redis.Nil) {
		return AuthorizationFlow{}, ErrNotFound
	}
	if err != nil {
		return AuthorizationFlow{}, err
	}
	var flow AuthorizationFlow
	if err := s.open(value, aad, &flow); err != nil {
		return AuthorizationFlow{}, err
	}
	return flow, nil
}
