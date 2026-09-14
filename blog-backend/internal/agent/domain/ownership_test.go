package domain_test

import (
	"errors"
	"go/parser"
	"go/token"
	"io/fs"
	"os"
	"path/filepath"
	"strconv"
	"testing"
)

const retiredRootDomainImport = "github.com/rushairer/blog-backend/internal/domain"

func TestRetiredRootDomainDoesNotReturn(t *testing.T) {
	rootDomain := filepath.Join("..", "..", "domain")
	if _, err := os.Stat(rootDomain); err == nil {
		t.Fatalf("retired root domain directory exists: %s", rootDomain)
	} else if !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("stat retired root domain directory: %v", err)
	}

	backendRoot := filepath.Join("..", "..", "..")
	err := filepath.WalkDir(backendRoot, func(path string, entry fs.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if entry.IsDir() || filepath.Ext(path) != ".go" {
			return nil
		}
		parsed, err := parser.ParseFile(token.NewFileSet(), path, nil, parser.ImportsOnly)
		if err != nil {
			return err
		}
		for _, spec := range parsed.Imports {
			importPath, err := strconv.Unquote(spec.Path.Value)
			if err != nil {
				return err
			}
			if importPath == retiredRootDomainImport {
				t.Errorf("%s imports retired root domain %q", path, retiredRootDomainImport)
			}
		}
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
}
