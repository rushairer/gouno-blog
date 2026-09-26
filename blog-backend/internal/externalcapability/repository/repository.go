package repository

import (
	"context"
	"database/sql"
	"time"

	"github.com/lib/pq"
	externaldomain "github.com/rushairer/blog-backend/internal/externalcapability/domain"
)

type Repository struct {
	db *sql.DB
}

func New(db *sql.DB) *Repository {
	return &Repository{db: db}
}

func scanClient(scanner interface{ Scan(...any) error }) (*externaldomain.Client, error) {
	var item externaldomain.Client
	err := scanner.Scan(
		&item.ID, &item.Name, &item.KeyPrefix, pq.Array(&item.Capabilities),
		&item.Enabled, &item.RateLimitPerMinute, &item.ExpiresAt, &item.LastUsedAt,
		&item.CreatedByPrincipalID, &item.RevokedAt, &item.CreatedAt, &item.UpdatedAt,
	)
	return &item, err
}

const clientColumns = `id, name, key_prefix, capabilities, enabled, rate_limit_per_minute,
	expires_at, last_used_at, created_by_principal_id, revoked_at, created_at, updated_at`

func (r *Repository) Create(ctx context.Context, item *externaldomain.Client, keyHash []byte) error {
	row := r.db.QueryRowContext(ctx, `
		INSERT INTO external_api_clients
			(name, key_prefix, key_hash, capabilities, enabled, rate_limit_per_minute, expires_at, created_by_principal_id)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
		RETURNING id, created_at, updated_at`,
		item.Name, item.KeyPrefix, keyHash, pq.Array(item.Capabilities), item.Enabled,
		item.RateLimitPerMinute, item.ExpiresAt, item.CreatedByPrincipalID,
	)
	return row.Scan(&item.ID, &item.CreatedAt, &item.UpdatedAt)
}

func (r *Repository) List(ctx context.Context) ([]externaldomain.Client, error) {
	rows, err := r.db.QueryContext(ctx, `SELECT `+clientColumns+`
		FROM external_api_clients ORDER BY created_at DESC, id DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := make([]externaldomain.Client, 0)
	for rows.Next() {
		item, err := scanClient(rows)
		if err != nil {
			return nil, err
		}
		items = append(items, *item)
	}
	return items, rows.Err()
}

func (r *Repository) FindByKeyHash(ctx context.Context, keyHash []byte) (*externaldomain.Client, error) {
	return scanClient(r.db.QueryRowContext(ctx, `SELECT `+clientColumns+`
		FROM external_api_clients WHERE key_hash=$1`, keyHash))
}

func (r *Repository) FindByID(ctx context.Context, id int64) (*externaldomain.Client, error) {
	return scanClient(r.db.QueryRowContext(ctx, `SELECT `+clientColumns+`
		FROM external_api_clients WHERE id=$1`, id))
}

func (r *Repository) UpdatePolicy(ctx context.Context, id int64, name string, capabilities []string, enabled bool, rateLimit int, expiresAt *time.Time) (*externaldomain.Client, error) {
	row := r.db.QueryRowContext(ctx, `
		UPDATE external_api_clients
		SET name=$2, capabilities=$3, enabled=$4, rate_limit_per_minute=$5, expires_at=$6, updated_at=NOW()
		WHERE id=$1 AND revoked_at IS NULL
		RETURNING `+clientColumns,
		id, name, pq.Array(capabilities), enabled, rateLimit, expiresAt,
	)
	return scanClient(row)
}

func (r *Repository) RotateKey(ctx context.Context, id int64, keyPrefix string, keyHash []byte) (*externaldomain.Client, error) {
	row := r.db.QueryRowContext(ctx, `
		UPDATE external_api_clients
		SET key_prefix=$2, key_hash=$3, updated_at=NOW()
		WHERE id=$1 AND revoked_at IS NULL
		RETURNING `+clientColumns, id, keyPrefix, keyHash)
	return scanClient(row)
}

func (r *Repository) Revoke(ctx context.Context, id int64) error {
	result, err := r.db.ExecContext(ctx, `
		UPDATE external_api_clients
		SET enabled=FALSE, revoked_at=COALESCE(revoked_at, NOW()), updated_at=NOW()
		WHERE id=$1 AND revoked_at IS NULL`, id)
	if err != nil {
		return err
	}
	count, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if count != 1 {
		return sql.ErrNoRows
	}
	return nil
}

func (r *Repository) TouchLastUsed(ctx context.Context, id int64) {
	_, _ = r.db.ExecContext(ctx, `
		UPDATE external_api_clients SET last_used_at=NOW() WHERE id=$1`, id)
}

func (r *Repository) RecordAudit(ctx context.Context, audit externaldomain.InvocationAudit) error {
	_, err := r.db.ExecContext(ctx, `
		INSERT INTO external_api_invocation_audits
			(client_id, request_id, capability, result, status_code, source_ip, input_digest, duration_ms)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
		audit.ClientID, audit.RequestID, audit.Capability, audit.Result, audit.StatusCode,
		audit.SourceIP, audit.InputDigest, audit.DurationMS,
	)
	return err
}
