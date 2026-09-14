package domain_test

import (
	"go/ast"
	"go/parser"
	"go/token"
	"io/fs"
	"path/filepath"
	"strconv"
	"testing"
)

const rootDomainImport = "github.com/rushairer/blog-backend/internal/domain"

func TestRootEmbeddingProfileStaysRetired(t *testing.T) {
	fset := token.NewFileSet()
	rootDomain := filepath.Clean("../../domain")
	err := filepath.WalkDir(rootDomain, func(path string, entry fs.DirEntry, walkErr error) error {
		if walkErr != nil { return walkErr }
		if entry.IsDir() || filepath.Ext(path) != ".go" { return nil }
		parsed, err := parser.ParseFile(fset, path, nil, 0)
		if err != nil { return err }
		for _, decl := range parsed.Decls {
			gen, ok := decl.(*ast.GenDecl); if !ok { continue }
			for _, spec := range gen.Specs {
				if typed, ok := spec.(*ast.TypeSpec); ok && typed.Name.Name == "EmbeddingProfile" {
					t.Errorf("%s redeclares Knowledge-owned EmbeddingProfile in root internal/domain", path)
				}
			}
		}
		return nil
	})
	if err != nil { t.Fatal(err) }

	backendRoot := filepath.Clean("../../..")
	err = filepath.WalkDir(backendRoot, func(path string, entry fs.DirEntry, walkErr error) error {
		if walkErr != nil { return walkErr }
		if entry.IsDir() || filepath.Ext(path) != ".go" { return nil }
		parsed, err := parser.ParseFile(fset, path, nil, 0)
		if err != nil { return err }
		aliases := map[string]struct{}{}
		for _, spec := range parsed.Imports {
			importPath, err := strconv.Unquote(spec.Path.Value)
			if err != nil || importPath != rootDomainImport { continue }
			alias := "domain"
			if spec.Name != nil {
				alias = spec.Name.Name
				if alias == "." { t.Errorf("%s dot-imports root internal/domain", path); continue }
			}
			aliases[alias] = struct{}{}
		}
		ast.Inspect(parsed, func(node ast.Node) bool {
			selector, ok := node.(*ast.SelectorExpr); if !ok || selector.Sel.Name != "EmbeddingProfile" { return true }
			ident, ok := selector.X.(*ast.Ident); if !ok { return true }
			if _, rootAlias := aliases[ident.Name]; rootAlias {
				t.Errorf("%s consumes Knowledge-owned EmbeddingProfile through root internal/domain; import internal/knowledge/domain instead", path)
			}
			return true
		})
		return nil
	})
	if err != nil { t.Fatal(err) }
}
