package repository

import (
	"database/sql"

	"github.com/rushairer/blog-backend/internal/dbtx"
	"go.uber.org/zap"
)

// Transactor is kept as a compatibility alias while capability services move
// their imports to the shared dbtx infrastructure package.
type Transactor = dbtx.Transactor

func NewTransactor(db *sql.DB, logger *zap.Logger) *Transactor {
	if db == nil {
		// Preserve the legacy panic contract for callers still using this facade.
		panic("repository.NewTransactor: db is required")
	}
	return dbtx.NewTransactor(db, logger)
}
