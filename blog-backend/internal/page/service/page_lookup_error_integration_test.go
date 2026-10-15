package service_test

import (
	"context"
	"errors"
	"testing"

	"github.com/rushairer/blog-backend/internal/page/repository"
	"github.com/rushairer/blog-backend/internal/page/service"
	"github.com/rushairer/blog-backend/internal/testsupport"
)

// This real PostgreSQL test runs in the disposable package-isolated DB
// inventory. A canceled SQL read is *not* a missing row, for any of the
// three product/approval read entrypoints.
func TestPageReadErrorsPreserveCancelledDatabaseQueries(t *testing.T) {
	db := testsupport.OpenTestDB(t)
	defer db.Close()
	svc := service.NewPageService(repository.NewPageRepository(db))
	canceled, cancel := context.WithCancel(context.Background())
	cancel()
	for _, tc := range []struct {
		name string
		read func(context.Context) error
	}{
		{"id", func(ctx context.Context) error {
			_, err := svc.GetPage(ctx, 1)
			return err
		}},
		{"slug", func(ctx context.Context) error {
			_, err := svc.GetPageBySlug(ctx, "some-page")
			return err
		}},
		{"published_slug", func(ctx context.Context) error {
			_, err := svc.GetPublishedPageBySlug(ctx, "some-page")
			return err
		}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			if err := tc.read(canceled); !errors.Is(err, context.Canceled) ||
				errors.Is(err, service.ErrPageNotFound) {
				t.Fatalf("canceled SQL read was masked as page absence: %v", err)
			}
		})
	}
}

func TestPageReadConfirmedMissingRowsRemainDomainNotFound(t *testing.T) {
	db := testsupport.OpenTestDB(t)
	defer db.Close()
	svc := service.NewPageService(repository.NewPageRepository(db))
	ctx := context.Background()
	for _, tc := range []struct {
		name string
		read func(context.Context) error
	}{
		{"id", func(ctx context.Context) error {
			_, err := svc.GetPage(ctx, 9223372036854775807)
			return err
		}},
		{"slug", func(ctx context.Context) error {
			_, err := svc.GetPageBySlug(ctx, "gouno-nonexistent-page-read-unique-20261015")
			return err
		}},
		{"published_slug", func(ctx context.Context) error {
			_, err := svc.GetPublishedPageBySlug(ctx, "gouno-nonexistent-page-read-unique-20261015")
			return err
		}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			if err := tc.read(ctx); !errors.Is(err, service.ErrPageNotFound) {
				t.Fatalf("confirmed missing Page changed public not-found semantics: %v", err)
			}
		})
	}
}
