package repository

import (
	"context"
	"database/sql"
	"errors"
	"fmt"

	"go.uber.org/zap"
)

type Transactor struct {
	db     *sql.DB
	logger *zap.Logger
}

func NewTransactor(db *sql.DB, logger *zap.Logger) *Transactor {
	if db == nil {
		panic("repository.NewTransactor: db is required")
	}
	if logger == nil {
		logger = zap.NewNop()
	}
	return &Transactor{db: db, logger: logger}
}

func (t *Transactor) Run(ctx context.Context, fn func(tx *sql.Tx) error) error {
	return t.RunIsolation(ctx, sql.LevelReadCommitted, fn)
}

func (t *Transactor) RunIsolation(ctx context.Context, isolation sql.IsolationLevel, fn func(tx *sql.Tx) error) (err error) {
	tx, err := t.db.BeginTx(ctx, &sql.TxOptions{Isolation: isolation})
	if err != nil {
		return fmt.Errorf("begin transaction: %w", err)
	}

	panicked := true
	defer func() {
		if p := recover(); p != nil {
			if rerr := tx.Rollback(); rerr != nil {
				t.logger.Warn("rollback failed during panic recovery", zap.Error(rerr))
			}
			panic(p)
		} else if panicked || err != nil {
			if rerr := tx.Rollback(); rerr != nil {
				t.logger.Warn("rollback failed", zap.Error(rerr))
				if err != nil {
					err = errors.Join(err, fmt.Errorf("transaction rollback failed: %w", rerr))
				} else {
					err = fmt.Errorf("transaction rollback failed: %w", rerr)
				}
			}
		}
	}()

	err = fn(tx)
	panicked = false

	if err != nil {
		return err
	}

	if err = tx.Commit(); err != nil {
		return fmt.Errorf("commit transaction: %w", err)
	}

	return nil
}
