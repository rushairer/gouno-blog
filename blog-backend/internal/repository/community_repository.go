package repository

import (
	"context"
	"database/sql"
	"errors"
	"fmt"

	"github.com/rushairer/blog-backend/internal/domain"
)

var (
	ErrDuplicateInteraction  = errors.New("duplicate interaction")
	ErrParentCommentMismatch = errors.New("parent comment belongs to another post")
	ErrCommentDepthExceeded  = errors.New("comments support at most two levels")
)

type CommunityRepository struct {
	db *sql.DB
}

func NewCommunityRepository(db *sql.DB) *CommunityRepository {
	return &CommunityRepository{db: db}
}

func scanComment(scanner interface{ Scan(...any) error }) (*domain.Comment, error) {
	var comment domain.Comment
	err := scanner.Scan(
		&comment.ID, &comment.PostID, &comment.ParentID, &comment.Author, &comment.AuthorPrincipalID,
		&comment.AuthorType, &comment.Content, &comment.Status, &comment.IsVisible,
		&comment.ReportCount, &comment.CreatedAt,
	)
	return &comment, err
}

const commentColumns = `c.id, c.post_id, c.parent_id, c.author, c.author_principal_id,
	c.author_type, c.content, c.status, c.is_visible,
	(SELECT COUNT(*) FROM comment_reports cr WHERE cr.comment_id = c.id), c.created_at`

func (r *CommunityRepository) CreateComment(ctx context.Context, comment *domain.Comment) error {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	if comment.ParentID != nil {
		var parentPostID int64
		var parentParentID *int64
		var recipient *int64
		if err := tx.QueryRowContext(ctx, `SELECT post_id, parent_id, author_principal_id FROM comments WHERE id = $1`, *comment.ParentID).
			Scan(&parentPostID, &parentParentID, &recipient); err != nil {
			return err
		}
		if parentPostID != comment.PostID {
			return ErrParentCommentMismatch
		}
		if parentParentID != nil {
			return ErrCommentDepthExceeded
		}
		if err := tx.QueryRowContext(ctx, `
			INSERT INTO comments (post_id, parent_id, author, author_principal_id, author_type, content, status, is_visible, created_at)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
			RETURNING id, created_at
		`, comment.PostID, comment.ParentID, comment.Author, comment.AuthorPrincipalID, comment.AuthorType,
			comment.Content, comment.Status, comment.IsVisible).Scan(&comment.ID, &comment.CreatedAt); err != nil {
			return err
		}
		if comment.IsVisible && recipient != nil && (comment.AuthorPrincipalID == nil || *recipient != *comment.AuthorPrincipalID) {
			if _, err := tx.ExecContext(ctx, `
				INSERT INTO notifications (recipient_principal_id, type, post_id, comment_id, actor_name)
				VALUES ($1, 'comment_reply', $2, $3, $4)
				ON CONFLICT DO NOTHING
			`, *recipient, comment.PostID, comment.ID, comment.Author); err != nil {
				return err
			}
		}
		return tx.Commit()
	}

	if err := tx.QueryRowContext(ctx, `
		INSERT INTO comments (post_id, parent_id, author, author_principal_id, author_type, content, status, is_visible, created_at)
		VALUES ($1, NULL, $2, $3, $4, $5, $6, $7, NOW())
		RETURNING id, created_at
	`, comment.PostID, comment.Author, comment.AuthorPrincipalID, comment.AuthorType, comment.Content,
		comment.Status, comment.IsVisible).Scan(&comment.ID, &comment.CreatedAt); err != nil {
		return err
	}
	return tx.Commit()
}

func (r *CommunityRepository) GetVisibleComments(ctx context.Context, postID int64) ([]*domain.Comment, error) {
	rows, err := r.db.QueryContext(ctx, `SELECT `+commentColumns+`
		FROM comments c WHERE c.post_id = $1 AND c.status = 'visible'
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

func (r *CommunityRepository) ListCommentsForAdmin(ctx context.Context, status string, reported bool, limit, offset int) ([]*domain.Comment, int, error) {
	where := "TRUE"
	args := []any{}
	if status != "" && status != "all" {
		args = append(args, status)
		where += fmt.Sprintf(" AND c.status = $%d", len(args))
	}
	if reported {
		where += " AND EXISTS (SELECT 1 FROM comment_reports x WHERE x.comment_id = c.id)"
	}
	var total int
	if err := r.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM comments c WHERE `+where, args...).Scan(&total); err != nil {
		return nil, 0, err
	}
	args = append(args, limit, offset)
	rows, err := r.db.QueryContext(ctx, `SELECT `+commentColumns+` FROM comments c WHERE `+where+
		fmt.Sprintf(" ORDER BY c.created_at DESC LIMIT $%d OFFSET $%d", len(args)-1, len(args)), args...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()
	comments := make([]*domain.Comment, 0)
	for rows.Next() {
		comment, err := scanComment(rows)
		if err != nil {
			return nil, 0, err
		}
		comments = append(comments, comment)
	}
	return comments, total, rows.Err()
}

func (r *CommunityRepository) ModerateComment(ctx context.Context, id int64, status string) error {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	visible := status == "visible"
	var parentID *int64
	var postID int64
	var author string
	var authorPrincipalID *int64
	var previousStatus string
	if err := tx.QueryRowContext(ctx, `SELECT parent_id, post_id, author, author_principal_id, status FROM comments WHERE id = $1 FOR UPDATE`, id).
		Scan(&parentID, &postID, &author, &authorPrincipalID, &previousStatus); err != nil {
		return err
	}
	result, err := tx.ExecContext(ctx, `UPDATE comments SET status = $1, is_visible = $2, moderated_at = NOW() WHERE id = $3`, status, visible, id)
	if err != nil {
		return err
	}
	if rows, _ := result.RowsAffected(); rows == 0 {
		return sql.ErrNoRows
	}
	if status == "visible" && previousStatus != "visible" && parentID != nil {
		var recipientPrincipalID *int64
		if err := tx.QueryRowContext(ctx, `SELECT author_principal_id FROM comments WHERE id = $1`, *parentID).Scan(&recipientPrincipalID); err != nil {
			return err
		}
		if recipientPrincipalID != nil && (authorPrincipalID == nil || *recipientPrincipalID != *authorPrincipalID) {
			if _, err := tx.ExecContext(ctx, `INSERT INTO notifications (recipient_principal_id, type, post_id, comment_id, actor_name)
				VALUES ($1, 'comment_reply', $2, $3, $4) ON CONFLICT DO NOTHING`, *recipientPrincipalID, postID, id, author); err != nil {
				return err
			}
		}
	}
	return tx.Commit()
}

func (r *CommunityRepository) DeleteComment(ctx context.Context, id int64) error {
	result, err := r.db.ExecContext(ctx, `DELETE FROM comments WHERE id = $1`, id)
	if err != nil {
		return err
	}
	if rows, _ := result.RowsAffected(); rows == 0 {
		return sql.ErrNoRows
	}
	return nil
}

func (r *CommunityRepository) ReportComment(ctx context.Context, commentID int64, actorKey, reason string) error {
	result, err := r.db.ExecContext(ctx, `INSERT INTO comment_reports (comment_id, actor_key, reason)
		VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`, commentID, actorKey, reason)
	if err != nil {
		return err
	}
	if rows, _ := result.RowsAffected(); rows == 0 {
		return ErrDuplicateInteraction
	}
	return nil
}

func (r *CommunityRepository) SetLike(ctx context.Context, postID int64, actorKey string, liked bool) (*domain.CommunityState, error) {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()
	if liked {
		result, err := tx.ExecContext(ctx, `INSERT INTO post_reactions (post_id, actor_key) VALUES ($1, $2) ON CONFLICT DO NOTHING`, postID, actorKey)
		if err != nil {
			return nil, err
		}
		if rows, _ := result.RowsAffected(); rows > 0 {
			if _, err := tx.ExecContext(ctx, `UPDATE posts SET likes_count = likes_count + 1 WHERE id = $1`, postID); err != nil {
				return nil, err
			}
		}
	} else {
		result, err := tx.ExecContext(ctx, `DELETE FROM post_reactions WHERE post_id = $1 AND actor_key = $2`, postID, actorKey)
		if err != nil {
			return nil, err
		}
		if rows, _ := result.RowsAffected(); rows > 0 {
			if _, err := tx.ExecContext(ctx, `UPDATE posts SET likes_count = GREATEST(likes_count - 1, 0) WHERE id = $1`, postID); err != nil {
				return nil, err
			}
		}
	}
	state := &domain.CommunityState{Liked: liked}
	if err := tx.QueryRowContext(ctx, `SELECT likes_count FROM posts WHERE id = $1`, postID).Scan(&state.LikesCount); err != nil {
		return nil, err
	}
	if err := tx.QueryRowContext(ctx, `SELECT EXISTS(SELECT 1 FROM post_reactions WHERE post_id = $1 AND actor_key = $2)`, postID, actorKey).Scan(&state.Liked); err != nil {
		return nil, err
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	return state, nil
}

func (r *CommunityRepository) CommunityState(ctx context.Context, postID int64, actorKey, _ string) (*domain.CommunityState, error) {
	state := &domain.CommunityState{}
	if err := r.db.QueryRowContext(ctx, `SELECT likes_count,
		EXISTS(SELECT 1 FROM post_reactions WHERE post_id = p.id AND actor_key = $2)
		FROM posts p WHERE p.id = $1`, postID, actorKey).Scan(&state.LikesCount, &state.Liked); err != nil {
		return nil, err
	}
	return state, nil
}

func (r *CommunityRepository) ListNotifications(ctx context.Context, principalID int64, limit, offset int) ([]*domain.Notification, int, error) {
	var unread int
	if err := r.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM notifications WHERE recipient_principal_id = $1 AND read_at IS NULL`, principalID).Scan(&unread); err != nil {
		return nil, 0, err
	}
	rows, err := r.db.QueryContext(ctx, `SELECT n.id, n.type, n.post_id, COALESCE(p.slug,''), COALESCE(p.title,''), n.comment_id,
		n.actor_name, COALESCE(n.title,''), COALESCE(n.body,''), COALESCE(n.href,''), n.read_at, n.created_at
		FROM notifications n LEFT JOIN posts p ON p.id = n.post_id
		WHERE n.recipient_principal_id = $1 ORDER BY n.created_at DESC LIMIT $2 OFFSET $3`, principalID, limit, offset)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()
	notifications := make([]*domain.Notification, 0)
	for rows.Next() {
		var notification domain.Notification
		if err := rows.Scan(&notification.ID, &notification.Type, &notification.PostID, &notification.PostSlug,
			&notification.PostTitle, &notification.CommentID, &notification.ActorName, &notification.Title, &notification.Body, &notification.Href,
			&notification.ReadAt, &notification.CreatedAt); err != nil {
			return nil, 0, err
		}
		notifications = append(notifications, &notification)
	}
	return notifications, unread, rows.Err()
}

func (r *CommunityRepository) ReadNotification(ctx context.Context, principalID, id int64) error {
	result, err := r.db.ExecContext(ctx, `UPDATE notifications SET read_at = COALESCE(read_at, NOW()) WHERE id = $1 AND recipient_principal_id = $2`, id, principalID)
	if err != nil {
		return err
	}
	if rows, _ := result.RowsAffected(); rows == 0 {
		return sql.ErrNoRows
	}
	return nil
}

func (r *CommunityRepository) ReadAllNotifications(ctx context.Context, principalID int64) error {
	_, err := r.db.ExecContext(ctx, `UPDATE notifications SET read_at = COALESCE(read_at, NOW()) WHERE recipient_principal_id = $1`, principalID)
	return err
}

func (r *CommunityRepository) DeleteNotification(ctx context.Context, principalID, id int64) error {
	result, err := r.db.ExecContext(ctx, `DELETE FROM notifications WHERE id = $1 AND recipient_principal_id = $2`, id, principalID)
	if err != nil {
		return err
	}
	if rows, _ := result.RowsAffected(); rows == 0 {
		return sql.ErrNoRows
	}
	return nil
}

func (r *CommunityRepository) DeleteNotifications(ctx context.Context, principalID int64, ids []int64) error {
	if len(ids) == 0 {
		return nil
	}
	_, err := r.db.ExecContext(ctx, `DELETE FROM notifications WHERE recipient_principal_id = $1 AND id = ANY($2)`, principalID, ids)
	return err
}

func (r *CommunityRepository) ClearNotifications(ctx context.Context, principalID int64, onlyRead bool) (int64, error) {
	query := `DELETE FROM notifications WHERE recipient_principal_id = $1`
	if onlyRead {
		query += ` AND read_at IS NOT NULL`
	}
	res, err := r.db.ExecContext(ctx, query, principalID)
	if err != nil {
		return 0, err
	}
	rows, _ := res.RowsAffected()
	return rows, nil
}
