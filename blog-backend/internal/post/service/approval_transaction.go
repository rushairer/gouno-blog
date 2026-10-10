package service

import (
	"context"
	"database/sql"
	"errors"
	"strings"

	postdomain "github.com/rushairer/blog-backend/internal/post/domain"
)

// approvalTransactionPostRepository is a narrow, optional capability port.
// Existing consumers and test doubles keep the regular PostRepository API.
// Production's PostRepository implements these methods on *sql.Tx.
type approvalTransactionPostRepository interface {
	GetByIDTx(context.Context, *sql.Tx, int64) (*postdomain.Post, error)
	GetBySlugTx(context.Context, *sql.Tx, string) (*postdomain.Post, error)
	CreateTx(context.Context, *sql.Tx, *postdomain.Post) error
	UpdateTx(context.Context, *sql.Tx, *postdomain.Post) error
}

func (s *PostService) approvalTransactionRepository() (approvalTransactionPostRepository, error) {
	writer, ok := s.repo.(approvalTransactionPostRepository)
	if !ok {
		return nil, errors.New("post transactional persistence is unavailable")
	}
	return writer, nil
}

// CreatePostTx runs the same validation, slug resolution and status rules as
// CreatePost, but reads and writes through the caller's transaction. Domain
// event and PostVersion triggers then participate in the approval commit.
func (s *PostService) CreatePostTx(ctx context.Context, tx *sql.Tx, post *postdomain.Post) error {
	if tx == nil {
		return errors.New("post creation requires a transaction")
	}
	if post == nil || strings.TrimSpace(post.Title) == "" {
		return ErrPostTitleEmpty
	}
	repo, err := s.approvalTransactionRepository()
	if err != nil {
		return err
	}
	if err := s.preparePostWithSlugLookup(ctx, post, nil, func(ctx context.Context, slug string) (*postdomain.Post, error) {
		return repo.GetBySlugTx(ctx, tx, slug)
	}); err != nil {
		return err
	}
	return repo.CreateTx(ctx, tx, post)
}

// UpdatePostTx preserves the PostService validation contract and the
// repository's revision CAS while keeping its version/history/event triggers
// inside the Agent approval's single transaction.
func (s *PostService) UpdatePostTx(ctx context.Context, tx *sql.Tx, post *postdomain.Post) error {
	if tx == nil {
		return errors.New("post update requires a transaction")
	}
	if post == nil || post.ID <= 0 {
		return ErrInvalidPostID
	}
	if strings.TrimSpace(post.Title) == "" {
		return ErrPostTitleEmpty
	}
	repo, err := s.approvalTransactionRepository()
	if err != nil {
		return err
	}
	existing, err := repo.GetByIDTx(ctx, tx, post.ID)
	if err != nil {
		return err
	}
	if existing == nil {
		return ErrPostNotFound
	}
	if existing.Revision != post.Revision {
		return postdomain.ErrRevisionConflict
	}
	if err := s.preparePostWithSlugLookup(ctx, post, existing, func(ctx context.Context, slug string) (*postdomain.Post, error) {
		return repo.GetBySlugTx(ctx, tx, slug)
	}); err != nil {
		return err
	}
	if err := repo.UpdateTx(ctx, tx, post); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return ErrPostNotFound
		}
		return err
	}
	return nil
}
