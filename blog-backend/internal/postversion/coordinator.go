package postversion

import (
	"context"
	"database/sql"

	"github.com/rushairer/blog-backend/internal/domain"
	postcapability "github.com/rushairer/blog-backend/internal/post"
	postversiondomain "github.com/rushairer/blog-backend/internal/postversion/domain"
)

// TransactionRunner is the narrow transaction boundary required by restore.
// Production composition supplies *dbtx.Transactor.
type TransactionRunner interface {
	Run(context.Context, func(*sql.Tx) error) error
}

// VersionSnapshotReader exposes only PostVersion-owned snapshot reads inside
// a caller-owned transaction.
type VersionSnapshotReader interface {
	GetVersionTx(context.Context, *sql.Tx, int64, int64) (*postversiondomain.PostVersion, error)
}

// PostRestoreWriter exposes only the Post-owned restore write inside a
// caller-owned transaction.
type PostRestoreWriter interface {
	RestoreSnapshotTx(context.Context, *sql.Tx, int64, postcapability.RestoreSnapshot) (*domain.Post, error)
}

// RestoreCoordinator owns the atomic PostVersion-read -> Post-write use case.
// Repositories remain capability-local and never call each other.
type RestoreCoordinator struct {
	transactor TransactionRunner
	versions   VersionSnapshotReader
	posts      PostRestoreWriter
}

func NewRestoreCoordinator(transactor TransactionRunner, versions VersionSnapshotReader, posts PostRestoreWriter) *RestoreCoordinator {
	return &RestoreCoordinator{transactor: transactor, versions: versions, posts: posts}
}

func (c *RestoreCoordinator) RestoreVersion(ctx context.Context, postID, versionID int64) (*domain.Post, error) {
	var restored *domain.Post
	err := c.transactor.Run(ctx, func(tx *sql.Tx) error {
		version, err := c.versions.GetVersionTx(ctx, tx, postID, versionID)
		if err != nil {
			return err
		}
		restored, err = c.posts.RestoreSnapshotTx(ctx, tx, postID, postcapability.RestoreSnapshot{
			Title:          version.Title,
			Slug:           version.Slug,
			Summary:        version.Summary,
			Content:        version.Content,
			Tags:           version.Tags,
			CategoryID:     version.CategoryID,
			CoverURL:       version.CoverURL,
			CoverAlt:       version.CoverAlt,
			SEOTitle:       version.SEOTitle,
			SEODescription: version.SEODescription,
			Status:         version.Status,
			PublishedAt:    version.PublishedAt,
			ScheduledAt:    version.ScheduledAt,
		})
		return err
	})
	return restored, err
}
