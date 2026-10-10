package service

import (
	"context"
	"database/sql"
	"errors"
	"time"

	"github.com/rushairer/blog-backend/internal/page/domain"
)

// ErrPageApprovalConflict is an immutable Page snapshot mismatch; approval
// coordinators quarantine the claimed decision rather than replaying it.
var ErrPageApprovalConflict = errors.New("page changed since approval was proposed")

// CreatePageTx preserves PageService's Slug/title policy while joining
// Page-owned persistence to the Agent review's caller-owned transaction.
func (s *PageService) CreatePageTx(ctx context.Context, tx *sql.Tx, page *domain.Page) error {
	if tx == nil {
		return errors.New("page creation requires a transaction")
	}
	if err := s.validatePageWrite(ctx, page, func(ctx context.Context, slug string) (*domain.Page, error) {
		return s.repo.GetBySlugTx(ctx, tx, slug)
	}); err != nil {
		return err
	}
	return pageSaveError(s.repo.CreateTx(ctx, tx, page))
}

// GetPageTx reads the latest Page from the SAME PostgreSQL transaction used
// by the approval's final guarded UPDATE, never via an unrelated pool connection.
func (s *PageService) GetPageTx(ctx context.Context, tx *sql.Tx, id int64) (*domain.Page, error) {
	if tx == nil {
		return nil, errors.New("page read requires a transaction")
	}
	if id <= 0 {
		return nil, ErrPageNotFound
	}
	page, err := s.repo.GetByIDTx(ctx, tx, id)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrPageNotFound
	}
	return page, err
}

// UpdatePageTx validates the proposed Page through the canonical PageService
// contract. The repository then performs an explicit updated_at compare-and-
// swap in SQL; a competing editor after GetPageTx still causes a conflict.
func (s *PageService) UpdatePageTx(ctx context.Context, tx *sql.Tx, page *domain.Page, expectedUpdatedAt time.Time) error {
	if tx == nil {
		return errors.New("page update requires a transaction")
	}
	if page == nil || page.ID <= 0 {
		return ErrPageNotFound
	}
	if expectedUpdatedAt.IsZero() || !page.UpdatedAt.Equal(expectedUpdatedAt) {
		return ErrPageApprovalConflict
	}
	if err := s.validatePageWrite(ctx, page, func(ctx context.Context, slug string) (*domain.Page, error) {
		return s.repo.GetBySlugTx(ctx, tx, slug)
	}); err != nil {
		return err
	}
	if err := s.repo.UpdateIfUnchangedTx(ctx, tx, page, expectedUpdatedAt); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return ErrPageApprovalConflict
		}
		return pageSaveError(err)
	}
	return nil
}
