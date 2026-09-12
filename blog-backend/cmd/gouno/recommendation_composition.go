package gouno

import (
	"database/sql"

	recommendationrepository "github.com/rushairer/blog-backend/internal/recommendation/repository"
	recommendationservice "github.com/rushairer/blog-backend/internal/recommendation/service"
)

func newRecommendationService(db *sql.DB) recommendationservice.Service {
	return recommendationservice.New(recommendationrepository.New(db))
}
