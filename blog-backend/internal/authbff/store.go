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
	subKey := s.identityIndexKey("sub", session.Issuer, session.Subject)
	_, err = s.redis.TxPipelined(ctx, func(pipe redis.Pipeliner) error {
		pipe.Set(ctx, key, sealed, ttl)
		pipe.SAdd(ctx, subKey, handle)
		pipe.Expire(ctx, subKey, ttl)
		if session.SID != "" {
			sidKey := s.identityIndexKey("sid", session.Issuer, session.SID)
			pipe.SAdd(ctx, sidKey, handle)
			pipe.Expire(ctx, sidKey, ttl)
		}
		return nil
	})
	return err
}

// ReplaceSession updates an existing session without allowing a concurrent
// logout to be undone. The watched transaction fails closed when the session
// key has been deleted between the refresh-token exchange and persistence.
func (s *Store) ReplaceSession(ctx context.Context, handle string, previous, session Session, ttl time.Duration) error {
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

	for attempt := 0; attempt < 3; attempt++ {
		err = s.redis.Watch(ctx, func(tx *redis.Tx) error {
			exists, watchErr := tx.Exists(ctx, key).Result()
			if watchErr != nil {
				return watchErr
			}
			if exists == 0 {
				return ErrNotFound
			}
			_, watchErr = tx.TxPipelined(ctx, func(pipe redis.Pipeliner) error {
				pipe.Set(ctx, key, sealed, ttl)
				if previous.Issuer != "" && previous.Subject != "" && (previous.Issuer != session.Issuer || previous.Subject != session.Subject) {
					pipe.SRem(ctx, s.identityIndexKey("sub", previous.Issuer, previous.Subject), handle)
				}
				subKey := s.identityIndexKey("sub", session.Issuer, session.Subject)
				pipe.SAdd(ctx, subKey, handle)
				pipe.Expire(ctx, subKey, ttl)
				if previous.Issuer != "" && previous.SID != "" && (previous.Issuer != session.Issuer || previous.SID != session.SID) {
					pipe.SRem(ctx, s.identityIndexKey("sid", previous.Issuer, previous.SID), handle)
				}
				if session.SID != "" {
					sidKey := s.identityIndexKey("sid", session.Issuer, session.SID)
					pipe.SAdd(ctx, sidKey, handle)
					pipe.Expire(ctx, sidKey, ttl)
				}
				return nil
			})
			return watchErr
		}, key)
		if !errors.Is(err, redis.TxFailedErr) {
			return err
		}
	}
	return errors.New("session changed concurrently during refresh")
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
			_ = s.redis.SRem(ctx, s.identityIndexKey("sub", session.Issuer, session.Subject), handle).Err()
		}
		if session.SID != "" {
			_ = s.redis.SRem(ctx, s.identityIndexKey("sid", session.Issuer, session.SID), handle).Err()
		}
	}
	key, _ := s.key("session", handle)
	return s.redis.Del(ctx, key).Err()
}

func (s *Store) DeleteByIdentity(ctx context.Context, issuer, subject string) error {
	if issuer == "" || subject == "" {
		return nil
	}
	subKey := s.identityIndexKey("sub", issuer, subject)
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

func (s *Store) DeleteBySID(ctx context.Context, issuer, sid string) error {
	if issuer == "" || sid == "" {
		return nil
	}
	sidKey := s.identityIndexKey("sid", issuer, sid)
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

// ClaimLogoutToken serializes back-channel logout processing across replicas.
// completed is true for an already processed replay; acquired is true only for
// the caller that owns the processing lease.
func (s *Store) ClaimLogoutToken(ctx context.Context, jti string, lease time.Duration) (owner string, acquired, completed bool, err error) {
	if jti == "" || lease <= 0 {
		return "", false, false, errors.New("jti and positive lease are required")
	}
	key := s.prefix + ":replay:logout:" + jti
	current, getErr := s.redis.Get(ctx, key).Result()
	if getErr == nil && current == "completed" {
		return "", false, true, nil
	}
	if getErr != nil && !errors.Is(getErr, redis.Nil) {
		return "", false, false, getErr
	}
	owner, err = RandomHandle()
	if err != nil {
		return "", false, false, err
	}
	ok, err := s.redis.SetNX(ctx, key, "processing:"+owner, lease).Result()
	if err != nil {
		return "", false, false, err
	}
	if ok {
		return owner, true, false, nil
	}
	current, err = s.redis.Get(ctx, key).Result()
	if err != nil {
		return "", false, false, err
	}
	return "", false, current == "completed", nil
}

var finishLogoutTokenScript = redis.NewScript(`
if redis.call("GET", KEYS[1]) == "processing:" .. ARGV[1] then
    redis.call("SET", KEYS[1], "completed", "PX", ARGV[2])
    return 1
end
return 0
`)

func (s *Store) FinishLogoutToken(ctx context.Context, jti, owner string, ttl time.Duration) error {
	if jti == "" || owner == "" || ttl <= 0 {
		return errors.New("jti, owner and positive ttl are required")
	}
	key := s.prefix + ":replay:logout:" + jti
	result, err := finishLogoutTokenScript.Run(ctx, s.redis, []string{key}, owner, ttl.Milliseconds()).Int()
	if err != nil {
		return err
	}
	if result != 1 {
		return errors.New("logout token processing lease was lost")
	}
	return nil
}

var releaseLogoutTokenScript = redis.NewScript(`
if redis.call("GET", KEYS[1]) == "processing:" .. ARGV[1] then
    return redis.call("DEL", KEYS[1])
end
return 0
`)

func (s *Store) ReleaseLogoutToken(ctx context.Context, jti, owner string) error {
	if jti == "" || owner == "" {
		return nil
	}
	key := s.prefix + ":replay:logout:" + jti
	return releaseLogoutTokenScript.Run(ctx, s.redis, []string{key}, owner).Err()
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

// identityIndexKey scopes every session index to the verified issuer. Subject
// and SID values are only unique within an issuer, so a valid logout token
// must never be able to delete a session belonging to another identity domain.
func (s *Store) identityIndexKey(kind, issuer, value string) string {
	digest := sha256.Sum256([]byte(issuer + "\x00" + value))
	return s.prefix + ":idx:" + kind + ":" + base64.RawURLEncoding.EncodeToString(digest[:])
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
