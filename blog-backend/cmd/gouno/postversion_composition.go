package gouno

import (
	"database/sql"

	"github.com/rushairer/blog-backend/internal/dbtx"
	postrepository "github.com/rushairer/blog-backend/internal/post/repository"
	"github.com/rushairer/blog-backend/internal/postversion"
	postversionrepository "github.com/rushairer/blog-backend/internal/postversion/repository"
	postversionservice "github.com/rushairer/blog-backend/internal/postversion/service"
)

func newPostVersionService(db *sql.DB, transactor *dbtx.Transactor, posts *postrepository.PostRepository) postversionservice.Service {
	versions := postversionrepository.New(db)
	restorer := postversion.NewRestoreCoordinator(transactor, versions, posts)
	return postversionservice.New(versions, restorer)
}
