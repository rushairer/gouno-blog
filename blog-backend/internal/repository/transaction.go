package repository

import (
	"database/sql"

	"github.com/rushairer/blog-backend/internal/dbtx"
	"go.uber.org/zap"
)

// Transactor is retained only for the Connector Module Hold. All non-Connector
// capabilities and the composition root depend on internal/dbtx directly.
// Remove this alias when the hold is explicitly lifted and Connector is cut over.
type Transactor = dbtx.Transactor

func NewTransactor(db *sql.DB, logger *zap.Logger) *Transactor {
	if db == nil {
		// Preserve the legacy panic contract for callers still using this facade.
		panic("repository.NewTransactor: db is required")
	}
	return dbtx.NewTransactor(db, logger)
}
