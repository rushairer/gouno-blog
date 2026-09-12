package gouno

import (
	"database/sql"

	analyticsrepository "github.com/rushairer/blog-backend/internal/analytics/repository"
	analyticsservice "github.com/rushairer/blog-backend/internal/analytics/service"
)

func newAnalyticsService(db *sql.DB) analyticsservice.Service {
	return analyticsservice.New(analyticsrepository.New(db))
}
