package repository

import (
	"context"
	"database/sql"
	"errors"
	"time"

	"github.com/rushairer/blog-backend/internal/page/domain"
)

// pageQueryRower is the shared SQL adapter used by the normal product paths
// and the caller-owned approval transaction. No Page SQL moves into Agent.
type pageQueryRower interface {
	QueryRowContext(context.Context, string, ...any) *sql.Row
}

func (r *PageRepository) CreateTx(ctx context.Context, tx *sql.Tx, p *domain.Page) error {
	if tx == nil {
		return errors.New("page creation requires a transaction")
	}
	return createPageOn(ctx, tx, p)
}

func (r *PageRepository) GetByIDTx(ctx context.Context, tx *sql.Tx, id int64) (*domain.Page, error) {
	if tx == nil {
		return nil, errors.New("page read requires a transaction")
	}
	return getPageByIDOn(ctx, tx, id)
}

func (r *PageRepository) GetBySlugTx(ctx context.Context, tx *sql.Tx, slug string) (*domain.Page, error) {
	if tx == nil {
		return nil, errors.New("page slug lookup requires a transaction")
	}
	return getPageBySlugOn(ctx, tx, slug)
}

// UpdateIfUnchangedTx applies the Page's captured timestamp guard IN SQL.
// No stale approval may overwrite a Page updated after proposal creation,
// including a race occurring after the final transactional read.
func (r *PageRepository) UpdateIfUnchangedTx(ctx context.Context, tx *sql.Tx, p *domain.Page, expectedUpdatedAt time.Time) error {
	if tx == nil {
		return errors.New("page update requires a transaction")
	}
	if expectedUpdatedAt.IsZero() {
		return errors.New("page update requires a captured timestamp")
	}
	return updatePageOn(ctx, tx, p, &expectedUpdatedAt)
}
