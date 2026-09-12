package repository

import (
	"database/sql"
	"errors"
	"fmt"
)

func IsConstraintError(err error) bool {
	if err == nil {
		return false
	}
	var target interface{ SQLState() string }
	return errors.As(err, &target) && (target.SQLState() == "23505" || target.SQLState() == "23503" || target.SQLState() == "23514")
}

func WrapNotFound(name string, err error) error {
	if errors.Is(err, sql.ErrNoRows) {
		return fmt.Errorf("%s not found: %w", name, err)
	}
	return err
}
