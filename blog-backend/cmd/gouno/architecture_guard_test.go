package gouno

import (
	"go/parser"
	"go/token"
	"io/fs"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
)

func TestRetiredRootBusinessLayersStayRetired(t *testing.T) {
	backendRoot := filepath.Clean(filepath.Join("..", ".."))
	internalRoot := filepath.Join(backendRoot, "internal")
	retired := []string{"domain", "service", "repository", "controller"}

	for _, name := range retired {
		path := filepath.Join(internalRoot, name)
		if _, err := os.Stat(path); err == nil {
			t.Fatalf("retired root business package reappeared: %s", path)
		} else if !os.IsNotExist(err) {
			t.Fatalf("stat retired root business package %s: %v", path, err)
		}
	}

	forbidden := make(map[string]struct{}, len(retired))
	for _, name := range retired {
		forbidden["github.com/rushairer/blog-backend/internal/"+name] = struct{}{}
	}

	err := filepath.WalkDir(backendRoot, func(path string, entry fs.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if entry.IsDir() {
			if entry.Name() == ".git" || entry.Name() == "node_modules" {
				return filepath.SkipDir
			}
			return nil
		}
		if filepath.Ext(path) != ".go" {
			return nil
		}
		file, err := parser.ParseFile(token.NewFileSet(), path, nil, parser.ImportsOnly)
		if err != nil {
			return err
		}
		for _, spec := range file.Imports {
			importPath, err := strconv.Unquote(spec.Path.Value)
			if err != nil {
				return err
			}
			for root := range forbidden {
				if importPath == root || strings.HasPrefix(importPath, root+"/") {
					t.Fatalf("retired root business import %q in %s", importPath, path)
				}
			}
		}
		return nil
	})
	if err != nil {
		t.Fatalf("scan backend imports: %v", err)
	}
}
