package repository

import (
	"context"
	"database/sql"
	"errors"

	postdomain "github.com/rushairer/blog-backend/internal/post/domain"
)

// postQueryRower is intentionally the smallest shared SQL port. Both *sql.DB
// and *sql.Tx use the same Post-owned SQL and revision checks.
type postQueryRower interface {
	QueryRowContext(context.Context, string, ...any) *sql.Row
}

func (r *PostRepository) CreateTx(ctx context.Context, tx *sql.Tx, post *postdomain.Post) error {
	if tx == nil {
		return errors.New("post create transaction is required")
	}
	return createPostOn(ctx, tx, post)
}

func (r *PostRepository) UpdateTx(ctx context.Context, tx *sql.Tx, post *postdomain.Post) error {
	if tx == nil {
		return errors.New("post update transaction is required")
	}
	return updatePostOn(ctx, tx, post)
}

func (r *PostRepository) GetByIDTx(ctx context.Context, tx *sql.Tx, id int64) (*postdomain.Post, error) {
	if tx == nil {
		return nil, errors.New("post read transaction is required")
	}
	return getPostByIDOn(ctx, tx, id)
}

func (r *PostRepository) GetBySlugTx(ctx context.Context, tx *sql.Tx, slug string) (*postdomain.Post, error) {
	if tx == nil {
		return nil, errors.New("post slug-read transaction is required")
	}
	return getPostBySlugOn(ctx, tx, slug)
}

// Match the normal repository's revision/conflict semantics within the same
// transaction. A second non-transactional DB query could deadlock when the
// connection pool contains only one available connection.
func writeErrorOn(ctx context.Context, writer postQueryRower, err error, id int64) error {
	if err != sql.ErrNoRows {
		return err
	}
	var exists bool
	if readErr := writer.QueryRowContext(ctx, `SELECT EXISTS(SELECT 1 FROM posts WHERE id=$1)`, id).Scan(&exists); readErr != nil {
		return readErr
	}
	if exists {
		return postdomain.ErrRevisionConflict
	}
	return sql.ErrNoRows
}
