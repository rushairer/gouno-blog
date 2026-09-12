package dberror

import "errors"

// IsConstraintError classifies PostgreSQL integrity-constraint failures without
// coupling business capabilities to the transitional flat repository package.
func IsConstraintError(err error) bool {
	if err == nil {
		return false
	}
	var target interface{ SQLState() string }
	return errors.As(err, &target) && (target.SQLState() == "23505" || target.SQLState() == "23503" || target.SQLState() == "23514")
}
