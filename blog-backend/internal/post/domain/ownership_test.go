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

var retiredSymbols = map[string]struct{}{
	"PostStatusPublished": {},
	"PostStatusScheduled": {},
	"PostStatusDraft": {},
	"PostSearchResult": {},
	"AdminPostFilter": {},
	"PostStatus": {},
	"Post": {},
}

func TestRootPostModelsStayRetired(t *testing.T) {
	fset := token.NewFileSet()
	rootDomain := filepath.Clean("../../domain")
	err := filepath.WalkDir(rootDomain, func(path string, entry fs.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if entry.IsDir() || filepath.Ext(path) != ".go" {
			return nil
		}
		parsed, err := parser.ParseFile(fset, path, nil, 0)
		if err != nil {
			return err
		}
		for _, decl := range parsed.Decls {
			gen, ok := decl.(*ast.GenDecl)
			if !ok {
				continue
			}
			for _, spec := range gen.Specs {
				switch typed := spec.(type) {
				case *ast.TypeSpec:
					if _, retired := retiredSymbols[typed.Name.Name]; retired {
						t.Errorf("%s redeclares Post-owned symbol %s in root internal/domain", path, typed.Name.Name)
					}
				case *ast.ValueSpec:
					for _, name := range typed.Names {
						if _, retired := retiredSymbols[name.Name]; retired {
							t.Errorf("%s redeclares Post-owned symbol %s in root internal/domain", path, name.Name)
						}
					}
				}
			}
		}
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}

	backendRoot := filepath.Clean("../../..")
	err = filepath.WalkDir(backendRoot, func(path string, entry fs.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if entry.IsDir() || filepath.Ext(path) != ".go" {
			return nil
		}
		parsed, err := parser.ParseFile(fset, path, nil, 0)
		if err != nil {
			return err
		}
		rootAliases := map[string]struct{}{}
		for _, spec := range parsed.Imports {
			importPath, err := strconv.Unquote(spec.Path.Value)
			if err != nil || importPath != rootDomainImport {
				continue
			}
			alias := "domain"
			if spec.Name != nil {
				alias = spec.Name.Name
				if alias == "." {
					t.Errorf("%s dot-imports root internal/domain; Post ownership cannot be proven", path)
					continue
				}
			}
			rootAliases[alias] = struct{}{}
		}
		if len(rootAliases) == 0 {
			return nil
		}
		ast.Inspect(parsed, func(node ast.Node) bool {
			selector, ok := node.(*ast.SelectorExpr)
			if !ok {
				return true
			}
			if _, retired := retiredSymbols[selector.Sel.Name]; !retired {
				return true
			}
			ident, ok := selector.X.(*ast.Ident)
			if !ok {
				return true
			}
			if _, rootAlias := rootAliases[ident.Name]; rootAlias {
				t.Errorf("%s consumes Post-owned symbol %s through root internal/domain; import internal/post/domain instead", path, selector.Sel.Name)
			}
			return true
		})
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
}
