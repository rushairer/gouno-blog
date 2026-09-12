package gouno

import (
	"database/sql"

	postversionrepository "github.com/rushairer/blog-backend/internal/postversion/repository"
	postversionservice "github.com/rushairer/blog-backend/internal/postversion/service"
)

func newPostVersionService(db *sql.DB) postversionservice.Service {
	return postversionservice.New(postversionrepository.New(db))
}
