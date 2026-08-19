package repository

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"log"
	"sync/atomic"

	"go.uber.org/zap"
)

var atomicLogger atomic.Pointer[zap.Logger]

// SetLogger configures a structured logger for the repository transaction runner.
func SetLogger(l *zap.Logger) {
	atomicLogger.Store(l)
}

// RunInTransaction executes fn within a database transaction with LevelReadCommitted isolation.
// If fn returns an error or panics, the transaction is rolled back; otherwise it is committed.
func RunInTransaction(ctx context.Context, db *sql.DB, fn func(tx *sql.Tx) error) (err error) {
	return RunInTransactionIsolation(ctx, db, sql.LevelReadCommitted, fn)
}

// RunInTransactionIsolation is like RunInTransaction but allows specifying the isolation level.
func RunInTransactionIsolation(ctx context.Context, db *sql.DB, isolation sql.IsolationLevel, fn func(tx *sql.Tx) error) (err error) {
	tx, err := db.BeginTx(ctx, &sql.TxOptions{Isolation: isolation})
	if err != nil {
		return fmt.Errorf("begin transaction: %w", err)
	}

	panicked := true
	defer func() {
		if p := recover(); p != nil {
			if rerr := tx.Rollback(); rerr != nil {
				logRollbackError("rollback failed during panic recovery", rerr)
			}
			panic(p)
		} else if panicked || err != nil {
			if rerr := tx.Rollback(); rerr != nil {
				logRollbackError("rollback failed", rerr)
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

func logRollbackError(msg string, rerr error) {
	if l := atomicLogger.Load(); l != nil {
		l.Warn(msg, zap.Error(rerr))
	} else {
		log.Printf("%s: %v", msg, rerr)
	}
}
