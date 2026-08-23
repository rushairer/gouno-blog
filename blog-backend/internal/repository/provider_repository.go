package repository

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strings"

	"github.com/rushairer/blog-backend/internal/domain"
)

const providerColumns = `id, name, provider_type, base_url, model, api_key_ciphertext,
	api_key_nonce, api_key_last4, key_version, enabled, is_default_writing, is_default_image, protocol_mode, stream_mode, request_timeout_seconds,
	max_output_tokens, created_at, updated_at`

func scanProvider(scanner interface{ Scan(...any) error }) (*domain.ProviderProfile, error) {
	var profile domain.ProviderProfile
	err := scanner.Scan(
		&profile.ID, &profile.Name, &profile.ProviderType, &profile.BaseURL, &profile.Model,
		&profile.APIKeyCiphertext, &profile.APIKeyNonce, &profile.APIKeyLast4, &profile.KeyVersion,
		&profile.Enabled, &profile.IsDefaultWriting, &profile.IsDefaultImage, &profile.ProtocolMode, &profile.StreamMode, &profile.RequestTimeoutSeconds, &profile.MaxOutputTokens,
		&profile.CreatedAt, &profile.UpdatedAt,
	)
	profile.HasAPIKey = len(profile.APIKeyCiphertext) > 0
	return &profile, err
}

func (r *AgentRepository) CreateProvider(ctx context.Context, profile *domain.ProviderProfile) error {
	if profile.StreamMode == "" {
		profile.StreamMode = "auto"
	}
	return r.db.QueryRowContext(ctx, `INSERT INTO ai_provider_profiles
		(name, provider_type, base_url, model, api_key_ciphertext, api_key_nonce, api_key_last4,
		 key_version, enabled, protocol_mode, stream_mode, request_timeout_seconds, max_output_tokens)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
		RETURNING id, created_at, updated_at`,
		profile.Name, profile.ProviderType, profile.BaseURL, profile.Model, profile.APIKeyCiphertext,
		profile.APIKeyNonce, profile.APIKeyLast4, profile.KeyVersion, profile.Enabled,
		profile.ProtocolMode, profile.StreamMode, profile.RequestTimeoutSeconds, profile.MaxOutputTokens,
	).Scan(&profile.ID, &profile.CreatedAt, &profile.UpdatedAt)
}

func (r *AgentRepository) UpdateProvider(ctx context.Context, profile *domain.ProviderProfile, replaceSecret bool) error {
	if profile.StreamMode == "" {
		profile.StreamMode = "auto"
	}
	var row *sql.Row
	if replaceSecret {
		row = r.db.QueryRowContext(ctx, `UPDATE ai_provider_profiles SET
			name=$2, provider_type=$3, base_url=$4, model=$5, api_key_ciphertext=$6,
			api_key_nonce=$7, api_key_last4=$8, key_version=$9, enabled=$10,
			protocol_mode=$11, stream_mode=$12, request_timeout_seconds=$13, max_output_tokens=$14, updated_at=NOW()
			WHERE id=$1 AND deleted_at IS NULL RETURNING created_at, updated_at`,
			profile.ID, profile.Name, profile.ProviderType, profile.BaseURL, profile.Model,
			profile.APIKeyCiphertext, profile.APIKeyNonce, profile.APIKeyLast4, profile.KeyVersion,
			profile.Enabled, profile.ProtocolMode, profile.StreamMode, profile.RequestTimeoutSeconds, profile.MaxOutputTokens)
	} else {
		row = r.db.QueryRowContext(ctx, `UPDATE ai_provider_profiles SET
			name=$2, provider_type=$3, base_url=$4, model=$5, enabled=$6,
			protocol_mode=$7, stream_mode=$8, request_timeout_seconds=$9, max_output_tokens=$10, updated_at=NOW()
			WHERE id=$1 AND deleted_at IS NULL
			RETURNING api_key_ciphertext, api_key_nonce, api_key_last4, key_version, created_at, updated_at`,
			profile.ID, profile.Name, profile.ProviderType, profile.BaseURL, profile.Model,
			profile.Enabled, profile.ProtocolMode, profile.StreamMode, profile.RequestTimeoutSeconds, profile.MaxOutputTokens)
		return row.Scan(
			&profile.APIKeyCiphertext, &profile.APIKeyNonce, &profile.APIKeyLast4,
			&profile.KeyVersion, &profile.CreatedAt, &profile.UpdatedAt,
		)
	}
	return row.Scan(&profile.CreatedAt, &profile.UpdatedAt)
}

func (r *AgentRepository) GetProvider(ctx context.Context, id int64) (*domain.ProviderProfile, error) {
	return scanProvider(r.db.QueryRowContext(ctx, `SELECT `+providerColumns+`
		FROM ai_provider_profiles WHERE id=$1 AND deleted_at IS NULL`, id))
}

func (r *AgentRepository) ListProviders(ctx context.Context) ([]*domain.ProviderProfile, error) {
	rows, err := r.db.QueryContext(ctx, `SELECT `+providerColumns+`
		FROM ai_provider_profiles WHERE deleted_at IS NULL ORDER BY name`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	result := make([]*domain.ProviderProfile, 0)
	for rows.Next() {
		profile, err := scanProvider(rows)
		if err != nil {
			return nil, err
		}
		result = append(result, profile)
	}
	return result, rows.Err()
}

func (r *AgentRepository) SetDefaultProvider(ctx context.Context, id int64, purpose string) error {
	column := "is_default_writing"
	if purpose == "image" {
		column = "is_default_image"
	}
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	if _, err = tx.ExecContext(ctx, `UPDATE ai_provider_profiles SET `+column+`=false, updated_at=NOW() WHERE deleted_at IS NULL AND `+column+`=true`); err != nil {
		_ = tx.Rollback()
		return err
	}
	if id > 0 {
		result, updateErr := tx.ExecContext(ctx, `UPDATE ai_provider_profiles SET `+column+`=true, updated_at=NOW() WHERE id=$1 AND enabled=true AND deleted_at IS NULL`, id)
		if updateErr != nil {
			_ = tx.Rollback()
			return updateErr
		}
		affected, _ := result.RowsAffected()
		if affected == 0 {
			_ = tx.Rollback()
			return sql.ErrNoRows
		}
	}
	return tx.Commit()
}

func (r *AgentRepository) DeleteProvider(ctx context.Context, id int64) error {
	var profile domain.ProviderProfile
	err := r.db.QueryRowContext(ctx, `SELECT id, name, is_default_writing, is_default_image FROM ai_provider_profiles WHERE id=$1 AND deleted_at IS NULL`, id).
		Scan(&profile.ID, &profile.Name, &profile.IsDefaultWriting, &profile.IsDefaultImage)
	if errors.Is(err, sql.ErrNoRows) {
		return sql.ErrNoRows
	}
	if err != nil {
		return err
	}

	if profile.IsDefaultWriting {
		return fmt.Errorf("%w: 当前仍被设为默认文本模型，请先在上方「默认用途」中修改或取消选择", ErrResourceInUse)
	}
	if profile.IsDefaultImage {
		return fmt.Errorf("%w: 当前仍被设为默认图片模型，请先在上方「默认用途」中修改或取消选择", ErrResourceInUse)
	}

	rows, err := r.db.QueryContext(ctx, `SELECT name FROM ai_agents WHERE provider_profile_id=$1 AND deleted_at IS NULL ORDER BY id LIMIT 5`, id)
	if err != nil {
		return err
	}
	defer rows.Close()

	var referencingAgents []string
	for rows.Next() {
		var name string
		if err := rows.Scan(&name); err == nil {
			referencingAgents = append(referencingAgents, name)
		}
	}
	if len(referencingAgents) > 0 {
		return fmt.Errorf("%w: 正被以下 Agent 引用：%s 等。请先在「Agent 列表」中将这些 Agent 切换到其他模型或删除", ErrResourceInUse, strings.Join(referencingAgents, "、"))
	}

	result, err := r.db.ExecContext(ctx, `UPDATE ai_provider_profiles
		SET enabled=false, is_default_writing=false, is_default_image=false,
			api_key_ciphertext=NULL, api_key_nonce=NULL,
			api_key_last4='', key_version=0, deleted_at=NOW(), updated_at=NOW()
		WHERE id=$1 AND deleted_at IS NULL`, id)
	if err != nil {
		return err
	}
	if affected, _ := result.RowsAffected(); affected == 0 {
		return sql.ErrNoRows
	}
	return nil
}
