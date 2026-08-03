package connector

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"strings"
	"time"

	"github.com/rushairer/blog-backend/internal/secretbox"
)

var (
	ErrInvalid  = errors.New("invalid connector")
	ErrNotFound = errors.New("connector not found")
)

type Profile struct {
	ID              int64           `json:"id"`
	Name            string          `json:"name"`
	Kind            string          `json:"kind"`
	Sandbox         bool            `json:"sandbox"`
	Enabled         bool            `json:"enabled"`
	Config          json.RawMessage `json:"config"`
	CredentialLast4 string          `json:"credential_last4,omitempty"`
	HasCredential   bool            `json:"has_credential"`
	CreatedAt       time.Time       `json:"created_at"`
	UpdatedAt       time.Time       `json:"updated_at"`
}

type OutboxItem struct {
	ID                 int64           `json:"id"`
	ConnectorProfileID int64           `json:"connector_profile_id"`
	IdempotencyKey     string          `json:"idempotency_key"`
	Payload            json.RawMessage `json:"payload"`
	Status             string          `json:"status"`
	Attempts           int             `json:"attempts"`
	ErrorMessage       *string         `json:"error_message,omitempty"`
	DeliveredAt        *time.Time      `json:"delivered_at,omitempty"`
	RevokedAt          *time.Time      `json:"revoked_at,omitempty"`
	CreatedAt          time.Time       `json:"created_at"`
}

type Service struct {
	db      *sql.DB
	secrets *secretbox.Box
}

func NewService(db *sql.DB, secrets *secretbox.Box) *Service {
	return &Service{db: db, secrets: secrets}
}

func validKind(kind string) bool {
	return kind == "search_console" || kind == "newsletter" || kind == "social" || kind == "webhook"
}

func (s *Service) SaveProfile(ctx context.Context, value *Profile, credential string) error {
	value.Name, value.Kind = strings.TrimSpace(value.Name), strings.TrimSpace(value.Kind)
	if value.Name == "" || !validKind(value.Kind) || !json.Valid(value.Config) || !value.Sandbox {
		return ErrInvalid
	}
	var ciphertext, nonce []byte
	last4, version := "", 0
	if credential != "" {
		var err error
		ciphertext, nonce, err = s.secrets.Encrypt(credential)
		if err != nil {
			return err
		}
		last4, version = secretbox.Last4(credential), s.secrets.KeyVersion()
	}
	if value.ID == 0 {
		if err := s.db.QueryRowContext(ctx, `INSERT INTO ai_connector_profiles(name,kind,sandbox,enabled,config,credential_ciphertext,credential_nonce,credential_last4,key_version)
			VALUES($1,$2,TRUE,$3,$4,$5,$6,$7,$8) RETURNING id,created_at,updated_at`, value.Name, value.Kind, value.Enabled, value.Config, ciphertext, nonce, last4, version).Scan(&value.ID, &value.CreatedAt, &value.UpdatedAt); err != nil {
			return err
		}
	} else {
		query := `UPDATE ai_connector_profiles SET name=$2,kind=$3,enabled=$4,config=$5,updated_at=NOW()`
		args := []any{value.ID, value.Name, value.Kind, value.Enabled, value.Config}
		if credential != "" {
			query += `,credential_ciphertext=$6,credential_nonce=$7,credential_last4=$8,key_version=$9`
			args = append(args, ciphertext, nonce, last4, version)
		}
		query += ` WHERE id=$1 RETURNING created_at,updated_at`
		if err := s.db.QueryRowContext(ctx, query, args...).Scan(&value.CreatedAt, &value.UpdatedAt); err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				return ErrNotFound
			}
			return err
		}
	}
	value.CredentialLast4, value.HasCredential = last4, credential != ""
	return nil
}

func (s *Service) ListProfiles(ctx context.Context) ([]*Profile, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT id,name,kind,sandbox,enabled,config,credential_last4,credential_ciphertext IS NOT NULL,created_at,updated_at FROM ai_connector_profiles ORDER BY id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := []*Profile{}
	for rows.Next() {
		v := &Profile{}
		if err := rows.Scan(&v.ID, &v.Name, &v.Kind, &v.Sandbox, &v.Enabled, &v.Config, &v.CredentialLast4, &v.HasCredential, &v.CreatedAt, &v.UpdatedAt); err != nil {
			return nil, err
		}
		items = append(items, v)
	}
	return items, rows.Err()
}

func (s *Service) BeginOAuth(ctx context.Context, profileID int64) (string, error) {
	stateBytes := make([]byte, 32)
	if _, err := rand.Read(stateBytes); err != nil {
		return "", err
	}
	state := hex.EncodeToString(stateBytes)
	result, err := s.db.ExecContext(ctx, `UPDATE ai_connector_profiles SET oauth_state=$2,oauth_state_expires_at=NOW()+INTERVAL '10 minutes',updated_at=NOW() WHERE id=$1 AND sandbox=TRUE`, profileID, state)
	if err != nil {
		return "", err
	}
	if n, _ := result.RowsAffected(); n == 0 {
		return "", ErrNotFound
	}
	return state, nil
}

func (s *Service) CompleteOAuthMock(ctx context.Context, state, code string) error {
	if strings.TrimSpace(state) == "" || strings.TrimSpace(code) == "" {
		return ErrInvalid
	}
	ciphertext, nonce, err := s.secrets.Encrypt(code)
	if err != nil {
		return err
	}
	result, err := s.db.ExecContext(ctx, `UPDATE ai_connector_profiles SET credential_ciphertext=$2,credential_nonce=$3,credential_last4=$4,key_version=$5,oauth_state=NULL,oauth_state_expires_at=NULL,updated_at=NOW() WHERE oauth_state=$1 AND oauth_state_expires_at>NOW() AND sandbox=TRUE`, state, ciphertext, nonce, secretbox.Last4(code), s.secrets.KeyVersion())
	if err != nil {
		return err
	}
	if n, _ := result.RowsAffected(); n == 0 {
		return ErrNotFound
	}
	return nil
}

func (s *Service) Queue(ctx context.Context, profileID int64, key string, payload json.RawMessage) (*OutboxItem, error) {
	if strings.TrimSpace(key) == "" || len(key) > 180 || !json.Valid(payload) {
		return nil, ErrInvalid
	}
	var enabled, sandbox, hasCredential bool
	if err := s.db.QueryRowContext(ctx, `SELECT enabled,sandbox,credential_ciphertext IS NOT NULL FROM ai_connector_profiles WHERE id=$1`, profileID).Scan(&enabled, &sandbox, &hasCredential); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	if !enabled || !sandbox || !hasCredential {
		return nil, ErrInvalid
	}
	item := &OutboxItem{ConnectorProfileID: profileID, IdempotencyKey: key, Payload: payload}
	err := s.db.QueryRowContext(ctx, `INSERT INTO ai_connector_outbox(connector_profile_id,idempotency_key,payload) VALUES($1,$2,$3) ON CONFLICT(connector_profile_id,idempotency_key) DO UPDATE SET updated_at=ai_connector_outbox.updated_at RETURNING id,status,attempts,error_message,delivered_at,revoked_at,created_at`, profileID, key, payload).Scan(&item.ID, &item.Status, &item.Attempts, &item.ErrorMessage, &item.DeliveredAt, &item.RevokedAt, &item.CreatedAt)
	return item, err
}

func (s *Service) Approve(ctx context.Context, id int64) error {
	r, e := s.db.ExecContext(ctx, `UPDATE ai_connector_outbox SET status='approved',updated_at=NOW() WHERE id=$1 AND status='awaiting_approval'`, id)
	if e != nil {
		return e
	}
	if n, _ := r.RowsAffected(); n == 0 {
		return ErrNotFound
	}
	return nil
}

func (s *Service) ListOutbox(ctx context.Context) ([]*OutboxItem, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT id,connector_profile_id,idempotency_key,payload,status,attempts,error_message,delivered_at,revoked_at,created_at FROM ai_connector_outbox ORDER BY id DESC LIMIT 100`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := make([]*OutboxItem, 0)
	for rows.Next() {
		item := &OutboxItem{}
		if err := rows.Scan(&item.ID, &item.ConnectorProfileID, &item.IdempotencyKey, &item.Payload, &item.Status, &item.Attempts, &item.ErrorMessage, &item.DeliveredAt, &item.RevokedAt, &item.CreatedAt); err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}
func (s *Service) Revoke(ctx context.Context, id int64) error {
	r, e := s.db.ExecContext(ctx, `UPDATE ai_connector_outbox SET status='revoked',revoked_at=NOW(),updated_at=NOW() WHERE id=$1 AND status IN ('awaiting_approval','approved','failed')`, id)
	if e != nil {
		return e
	}
	if n, _ := r.RowsAffected(); n == 0 {
		return ErrNotFound
	}
	return nil
}

// DeliverMock is deliberately a no-network transport. It records the same
// idempotency and audit transition a real connector will require.
func (s *Service) DeliverMock(ctx context.Context, id int64) error {
	tx, e := s.db.BeginTx(ctx, nil)
	if e != nil {
		return e
	}
	defer tx.Rollback()
	var item OutboxItem
	var sandbox bool
	var config []byte
	if e = tx.QueryRowContext(ctx, `SELECT o.id,o.connector_profile_id,o.idempotency_key,o.payload,o.status,o.attempts,p.sandbox,p.config FROM ai_connector_outbox o JOIN ai_connector_profiles p ON p.id=o.connector_profile_id WHERE o.id=$1 FOR UPDATE`, id).Scan(&item.ID, &item.ConnectorProfileID, &item.IdempotencyKey, &item.Payload, &item.Status, &item.Attempts, &sandbox, &config); e != nil {
		if errors.Is(e, sql.ErrNoRows) {
			return ErrNotFound
		}
		return e
	}
	if item.Status != "approved" || !sandbox {
		return ErrInvalid
	}
	item.Attempts++
	limit := 10
	var configValue map[string]any
	_ = json.Unmarshal(config, &configValue)
	if value, ok := configValue["rate_limit_per_minute"].(float64); ok && value >= 1 && value <= 120 {
		limit = int(value)
	}
	var recent int
	if e = tx.QueryRowContext(ctx, `SELECT COUNT(*) FROM ai_connector_delivery_audits a JOIN ai_connector_outbox o ON o.id=a.outbox_id WHERE o.connector_profile_id=$1 AND a.created_at>=NOW()-INTERVAL '1 minute'`, item.ConnectorProfileID).Scan(&recent); e != nil {
		return e
	}
	if recent >= limit {
		message := "sandbox connector rate limit exceeded"
		if _, e = tx.ExecContext(ctx, `UPDATE ai_connector_outbox SET status='failed',attempts=$2,error_message=$3,available_at=NOW()+make_interval(secs=>LEAST(3600,POWER(2,$4))) WHERE id=$1`, id, item.Attempts, message, float64(item.Attempts)); e != nil {
			return e
		}
		_, e = tx.ExecContext(ctx, `INSERT INTO ai_connector_delivery_audits(outbox_id,attempt,status,request_summary,response_summary) VALUES($1,$2,'rate_limited',jsonb_build_object('transport','mock'),jsonb_build_object('retryable',TRUE,'external_request',FALSE))`, id, item.Attempts)
		if e != nil {
			return e
		}
		return tx.Commit()
	}
	if _, e = tx.ExecContext(ctx, `UPDATE ai_connector_outbox SET status='delivered',attempts=$2,delivered_at=NOW(),updated_at=NOW() WHERE id=$1`, id, item.Attempts); e != nil {
		return e
	}
	_, e = tx.ExecContext(ctx, `INSERT INTO ai_connector_delivery_audits(outbox_id,attempt,status,request_summary,response_summary) VALUES($1,$2,'delivered',jsonb_build_object('transport','mock','idempotency_key',$3::text),jsonb_build_object('accepted',TRUE,'external_request',FALSE))`, id, item.Attempts, item.IdempotencyKey)
	if e != nil {
		return e
	}
	return tx.Commit()
}

func (s *Service) Retry(ctx context.Context, id int64) error {
	result, err := s.db.ExecContext(ctx, `UPDATE ai_connector_outbox SET status='approved',error_message=NULL,available_at=NOW(),updated_at=NOW() WHERE id=$1 AND status='failed'`, id)
	if err != nil {
		return err
	}
	if n, _ := result.RowsAffected(); n == 0 {
		return ErrNotFound
	}
	return nil
}
