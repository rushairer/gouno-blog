package authbff

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"time"

	"github.com/redis/go-redis/v9"
	"github.com/tink-crypto/tink-go/v2/tink"
)

var ErrNotFound = errors.New("BFF record not found")

type AuthorizationFlow struct {
	State        string    `json:"state"`
	Nonce        string    `json:"nonce"`
	PKCEVerifier string    `json:"pkce_verifier"`
	ReturnTo     string    `json:"return_to"`
	CreatedAt    time.Time `json:"created_at"`
}

type Session struct {
	Issuer       string         `json:"issuer"`
	Subject      string         `json:"subject"`
	SID          string         `json:"sid,omitempty"`
	AccessToken  string         `json:"access_token"`
	RefreshToken string         `json:"refresh_token"`
	IDToken      string         `json:"id_token"`
	TokenExpiry  time.Time      `json:"token_expiry"`
	AuthTime     int64          `json:"auth_time,omitempty"`
	AMR          []string       `json:"amr,omitempty"`
	Claims       map[string]any `json:"claims"`
	CreatedAt    time.Time      `json:"created_at"`
}

type Store struct {
	redis  *redis.Client
	aead   tink.AEAD
	prefix string
}

func NewStore(client *redis.Client, primitive tink.AEAD, prefix string) (*Store, error) {
	if client == nil || primitive == nil {
		return nil, errors.New("Redis client and Tink AEAD are required")
	}
	if prefix == "" {
		return nil, errors.New("Redis key prefix is required")
	}
	return &Store{redis: client, aead: primitive, prefix: prefix}, nil
}

func RandomHandle() (string, error) {
	raw := make([]byte, 32)
	if _, err := io.ReadFull(rand.Reader, raw); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(raw), nil
}

func (s *Store) PutFlow(ctx context.Context, handle string, flow AuthorizationFlow, ttl time.Duration) error {
	if handle == "" || flow.State == "" || flow.Nonce == "" || flow.PKCEVerifier == "" || ttl <= 0 {
		return errors.New("complete authorization flow and positive TTL are required")
	}
	return s.put(ctx, "flow", handle, flow, ttl, true)
}

func (s *Store) TakeFlow(ctx context.Context, handle string) (AuthorizationFlow, error) {
	var flow AuthorizationFlow
	key, aad := s.key("flow", handle)
	value, err := s.redis.GetDel(ctx, key).Bytes()
	if errors.Is(err, redis.Nil) {
		return flow, ErrNotFound
	}
	if err != nil {
		return flow, err
	}
	if err := s.open(value, aad, &flow); err != nil {
		return flow, err
	}
	return flow, nil
}

func (s *Store) PutSession(ctx context.Context, handle string, session Session, ttl time.Duration) error {
	if handle == "" || session.Issuer == "" || session.Subject == "" || session.IDToken == "" || ttl <= 0 {
		return errors.New("complete session and positive TTL are required")
	}
	plain, err := json.Marshal(session)
	if err != nil {
		return err
	}
	key, aad := s.key("session", handle)
	sealed, err := s.aead.Encrypt(plain, aad)
	if err != nil {
		return err
	}
	subKey := s.prefix + ":idx:sub:" + session.Subject
	_, err = s.redis.TxPipelined(ctx, func(pipe redis.Pipeliner) error {
		pipe.Set(ctx, key, sealed, ttl)
		pipe.SAdd(ctx, subKey, handle)
		pipe.Expire(ctx, subKey, ttl)
		if session.SID != "" {
			sidKey := s.prefix + ":idx:sid:" + session.SID
			pipe.SAdd(ctx, sidKey, handle)
			pipe.Expire(ctx, sidKey, ttl)
		}
		return nil
	})
	return err
}

func (s *Store) GetSession(ctx context.Context, handle string) (Session, error) {
	var session Session
	key, aad := s.key("session", handle)
	value, err := s.redis.Get(ctx, key).Bytes()
	if errors.Is(err, redis.Nil) {
		return session, ErrNotFound
	}
	if err != nil {
		return session, err
	}
	if err := s.open(value, aad, &session); err != nil {
		return session, err
	}
	return session, nil
}

func (s *Store) DeleteSession(ctx context.Context, handle string) error {
	session, err := s.GetSession(ctx, handle)
	if err == nil {
		if session.Subject != "" {
			_ = s.redis.SRem(ctx, s.prefix+":idx:sub:"+session.Subject, handle).Err()
		}
		if session.SID != "" {
			_ = s.redis.SRem(ctx, s.prefix+":idx:sid:"+session.SID, handle).Err()
		}
	}
	key, _ := s.key("session", handle)
	return s.redis.Del(ctx, key).Err()
}

func (s *Store) DeleteBySubject(ctx context.Context, sub string) error {
	if sub == "" {
		return nil
	}
	subKey := s.prefix + ":idx:sub:" + sub
	handles, err := s.redis.SMembers(ctx, subKey).Result()
	if err != nil && !errors.Is(err, redis.Nil) {
		return err
	}
	for _, handle := range handles {
		if err := s.DeleteSession(ctx, handle); err != nil {
			return err
		}
	}
	return s.redis.Del(ctx, subKey).Err()
}

func (s *Store) DeleteBySID(ctx context.Context, sid string) error {
	if sid == "" {
		return nil
	}
	sidKey := s.prefix + ":idx:sid:" + sid
	handles, err := s.redis.SMembers(ctx, sidKey).Result()
	if err != nil && !errors.Is(err, redis.Nil) {
		return err
	}
	for _, handle := range handles {
		if err := s.DeleteSession(ctx, handle); err != nil {
			return err
		}
	}
	return s.redis.Del(ctx, sidKey).Err()
}

func (s *Store) IsLogoutTokenProcessed(ctx context.Context, jti string) (bool, error) {
	if jti == "" {
		return false, errors.New("jti is required")
	}
	key := s.prefix + ":replay:logout:" + jti
	exists, err := s.redis.Exists(ctx, key).Result()
	if err != nil {
		return false, err
	}
	return exists > 0, nil
}

// MarkLogoutTokenProcessed records a replay marker after logout side effects succeed.
func (s *Store) MarkLogoutTokenProcessed(ctx context.Context, jti string, ttl time.Duration) error {
	if jti == "" {
		return errors.New("jti is required")
	}
	key := s.prefix + ":replay:logout:" + jti
	return s.redis.Set(ctx, key, "1", ttl).Err()
}

// PutLogoutState stores a logout state nonce for CSRF protection on
// RP-initiated logout. The state is consumed once via TakeLogoutState.
func (s *Store) PutLogoutState(ctx context.Context, state string, ttl time.Duration) error {
	if state == "" || ttl <= 0 {
		return errors.New("state and positive TTL are required")
	}
	return s.put(ctx, "logout_state", state, struct{}{}, ttl, true)
}

// TakeLogoutState atomically consumes and returns the logout state.
// Returns ErrNotFound if the state does not exist or was already consumed.
func (s *Store) TakeLogoutState(ctx context.Context, state string) error {
	if state == "" {
		return errors.New("state is required")
	}
	key, aad := s.key("logout_state", state)
	value, err := s.redis.GetDel(ctx, key).Bytes()
	if errors.Is(err, redis.Nil) {
		return ErrNotFound
	}
	if err != nil {
		return err
	}
	var dummy struct{}
	return s.open(value, aad, &dummy)
}

func (s *Store) put(ctx context.Context, kind, handle string, value any, ttl time.Duration, onlyIfAbsent bool) error {
	plain, err := json.Marshal(value)
	if err != nil {
		return err
	}
	key, aad := s.key(kind, handle)
	sealed, err := s.aead.Encrypt(plain, aad)
	if err != nil {
		return err
	}
	if onlyIfAbsent {
		ok, err := s.redis.SetNX(ctx, key, sealed, ttl).Result()
		if err != nil {
			return err
		}
		if !ok {
			return errors.New("BFF record already exists")
		}
		return nil
	}
	return s.redis.Set(ctx, key, sealed, ttl).Err()
}

func (s *Store) open(value, aad []byte, target any) error {
	plain, err := s.aead.Decrypt(value, aad)
	if err != nil {
		return fmt.Errorf("decrypt BFF record: %w", err)
	}
	if err := json.Unmarshal(plain, target); err != nil {
		return fmt.Errorf("decode BFF record: %w", err)
	}
	return nil
}

func (s *Store) key(kind, handle string) (string, []byte) {
	digest := sha256.Sum256([]byte(handle))
	key := s.prefix + ":" + kind + ":" + base64.RawURLEncoding.EncodeToString(digest[:])
	return key, []byte("gouno-blog-bff:" + kind + ":" + key)
}

// AcquireRefreshLock acquires a distributed lock for refreshing a session.
func (s *Store) AcquireRefreshLock(ctx context.Context, handle string, ttl time.Duration) (string, bool, error) {
	if handle == "" || ttl <= 0 {
		return "", false, errors.New("handle and positive ttl are required")
	}
	owner, err := RandomHandle()
	if err != nil {
		return "", false, err
	}
	digest := sha256.Sum256([]byte(handle))
	key := s.prefix + ":lock:refresh:" + base64.RawURLEncoding.EncodeToString(digest[:])
	ok, err := s.redis.SetNX(ctx, key, owner, ttl).Result()
	if err != nil {
		return "", false, err
	}
	return owner, ok, nil
}

var releaseRefreshLockScript = redis.NewScript(`
if redis.call("GET", KEYS[1]) == ARGV[1] then
    return redis.call("DEL", KEYS[1])
else
    return 0
end
`)

// ReleaseRefreshLock releases a distributed lock if the caller still owns it.
func (s *Store) ReleaseRefreshLock(ctx context.Context, handle, owner string) error {
	if handle == "" || owner == "" {
		return nil
	}
	digest := sha256.Sum256([]byte(handle))
	key := s.prefix + ":lock:refresh:" + base64.RawURLEncoding.EncodeToString(digest[:])
	return releaseRefreshLockScript.Run(ctx, s.redis, []string{key}, owner).Err()
}
