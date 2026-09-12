package repository

import (
	"context"
	"database/sql"
)

func (r *Repository) SelectStarterProviderIDTx(ctx context.Context, tx *sql.Tx) (int64, error) {
	var id int64
	err := tx.QueryRowContext(ctx, `SELECT id FROM ai_provider_profiles
		WHERE enabled=TRUE AND deleted_at IS NULL AND api_key_ciphertext IS NOT NULL
		ORDER BY is_default_writing DESC, created_at ASC LIMIT 1`).Scan(&id)
	return id, err
}
