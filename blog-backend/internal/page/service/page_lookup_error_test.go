package service

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strings"
	"testing"

	"github.com/rushairer/blog-backend/internal/page/domain"
)

// The Page-facing domain error is safe for a confirmed missing row only.
// Wrapped SQL/transport/cancellation diagnostics must not be flattened into
// the same sentinel or frontends will treat an outage as a missing page.
func TestPageLookupResultDistinguishesMissingRowsAndStorageFailures(t *testing.T) {
	const marker = "PRIVATE_POSTGRES_DSN_OR_SQL_QUERY_CAUSE"
	page := &domain.Page{ID: 25, Slug: "real-page", Status: domain.PageStatusPublished}
	for _, tc := range []struct {
		name string
		page *domain.Page
		input error
		want error
	}{
		{"direct_no_rows", nil, sql.ErrNoRows, ErrPageNotFound},
		{"wrapped_no_rows", nil, fmt.Errorf("%s: %w", marker, sql.ErrNoRows), ErrPageNotFound},
		{"nil_result", nil, nil, ErrPageNotFound},
		{"canceled_query", nil, context.Canceled, context.Canceled},
		{"deadline_exceeded", nil, context.DeadlineExceeded, context.DeadlineExceeded},
		{"storage_failure", nil, errors.New(marker), nil},
		{"success", page, nil, nil},
	} {
		t.Run(tc.name, func(t *testing.T) {
			actual, err := pageLookupResult(tc.page, tc.input)
			if tc.want == nil && tc.input != nil {
				if err == nil || !strings.Contains(err.Error(), marker) ||
					errors.Is(err, ErrPageNotFound) {
					t.Fatalf("unexpected infrastructure error was suppressed: %v", err)
				}
				return
			}
			if !errors.Is(err, tc.want) && !(err == nil && tc.want == nil) {
				t.Fatalf("result err=%v want=%v", err, tc.want)
			}
			if tc.want == nil && actual != page {
				t.Fatalf("successful Page read was changed: %#v", actual)
			}
			if tc.want != nil && actual != nil {
				t.Fatalf("failure returned an unsafe Page payload: %#v", actual)
			}
		})
	}
}
