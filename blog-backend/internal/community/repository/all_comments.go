package repository

import (
	"context"

	"github.com/rushairer/blog-backend/internal/community/domain"
)

// GetAllComments returns every comment for one post, including moderation-hidden entries.
// The endpoint using this method is authorization-gated by the router.
func (r *CommunityRepository) GetAllComments(ctx context.Context, postID int64) ([]*domain.Comment, error) {
	rows, err := r.db.QueryContext(ctx, `SELECT `+commentColumns+`
		FROM comments c WHERE c.post_id = $1
		ORDER BY COALESCE(c.parent_id, c.id), c.parent_id NULLS FIRST, c.created_at`, postID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	comments := make([]*domain.Comment, 0)
	for rows.Next() {
		comment, err := scanComment(rows)
		if err != nil {
			return nil, err
		}
		comments = append(comments, comment)
	}
	return comments, rows.Err()
}
