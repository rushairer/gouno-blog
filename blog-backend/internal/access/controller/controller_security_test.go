package controller

import (
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/rushairer/blog-backend/internal/access"
)

func TestAccessMutationErrorsNeverExposeWrappedInternals(t *testing.T) {
	// Wrapper strings can contain SQL statements, storage credentials, JWTs or
	// user-controlled diagnostics. The public body must only carry fixed text.
	const marker = "PRIVATE-SQL-CREDENTIAL-MARKER"
	for _, tc := range []struct {
		name string
		err error
		status int
		message string
	}{
		{"forbidden", access.ErrForbidden, http.StatusForbidden, "forbidden"},
		{"owner_only", access.ErrOwnerOnly, http.StatusForbidden, "owner role changes require an owner"},
		{"self_escalation", access.ErrSelfEscalation, http.StatusForbidden, "cannot grant owner to yourself"},
		{"last_owner", access.ErrLastOwner, http.StatusForbidden, "cannot remove the last owner"},
		{"invalid_status", access.ErrInvalidMemberStatus, http.StatusBadRequest, "invalid membership request"},
		{"invalid_role", access.ErrInvalidMemberRole, http.StatusBadRequest, "invalid membership request"},
		{"invalid_transfer_target", access.ErrOwnerTargetNotActive, http.StatusBadRequest, "target must be an active member"},
		{"unknown_database_error", errors.New("database connection failed"), http.StatusInternalServerError, "internal server error"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			rec := httptest.NewRecorder()
			ctx, _ := gin.CreateTestContext(rec)
			ctx.Request = httptest.NewRequest(http.MethodPatch, "/api/admin/access/members/5", nil)
			writeAccessMutationError(ctx, fmt.Errorf("%s: %w", marker, tc.err))
			if rec.Code != tc.status {
				t.Fatalf("status=%d want %d: %s", rec.Code, tc.status, rec.Body.String())
			}
			body := rec.Body.String()
			if strings.Contains(body, marker) || strings.Contains(body, "database connection failed") {
				t.Fatalf("internal mutation error leaked: %s", body)
			}
			if !strings.Contains(body, tc.message) {
				t.Fatalf("sanitized response missing %q: %s", tc.message, body)
			}
		})
	}
}
