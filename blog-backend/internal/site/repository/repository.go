package repository

import (
	"context"
	"database/sql"
	"encoding/json"
)

type Repository interface {
	GetSiteSettings(context.Context) (map[string]string, error)
	UpdateSiteSettings(context.Context, map[string]string) (map[string]string, error)
}

type postgresRepository struct {
	db *sql.DB
}

func New(db *sql.DB) Repository {
	return &postgresRepository{db: db}
}

func (r *postgresRepository) GetSiteSettings(ctx context.Context) (map[string]string, error) {
	var raw []byte
	if err := r.db.QueryRowContext(ctx, `SELECT settings FROM site_settings WHERE id=1`).Scan(&raw); err != nil {
		return nil, err
	}
	var settings map[string]string
	if err := json.Unmarshal(raw, &settings); err != nil {
		return nil, err
	}
	return settings, nil
}

func (r *postgresRepository) UpdateSiteSettings(ctx context.Context, settings map[string]string) (map[string]string, error) {
	raw, err := json.Marshal(settings)
	if err != nil {
		return nil, err
	}
	var saved []byte
	if err := r.db.QueryRowContext(ctx, `UPDATE site_settings SET settings = settings || $1::jsonb, updated_at=NOW() WHERE id=1 RETURNING settings`, string(raw)).Scan(&saved); err != nil {
		return nil, err
	}
	var result map[string]string
	if err := json.Unmarshal(saved, &result); err != nil {
		return nil, err
	}
	return result, nil
}
