package domain_test

import (
	"go/ast"
	"go/parser"
	"go/token"
	"io/fs"
	"os"
	"path/filepath"
	"strconv"
	"testing"
)

const rootDomainImport = "github.com/rushairer/blog-backend/internal/domain"

var pageSymbols = map[string]struct{}{
	"Page":                 {},
	"PageStatus":           {},
	"PageStatusDraft":      {},
	"PageStatusPublished":  {},
	"PageTemplate":         {},
	"PageTemplateDefault":  {},
	"PageTemplateAbout":    {},
	"PageTemplateLinks":    {},
	"PageTemplateBlank":    {},
	"PageTemplateTimeline": {},
	"PageTemplateProjects": {},
	"PageTemplateFocus":    {},
	"PageTemplateFAQ":      {},
	"AdminPageFilter":      {},
}

func TestRootPageCompatibilityAliasesStayRetired(t *testing.T) {
	if _, err := os.Stat("../../domain/page.go"); !os.IsNotExist(err) {
		t.Fatalf("root Page compatibility alias file must stay retired: %v", err)
	}

	internalRoot := filepath.Clean("../..")
	fset := token.NewFileSet()
	err := filepath.WalkDir(internalRoot, func(path string, entry fs.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if entry.IsDir() || filepath.Ext(path) != ".go" {
			return nil
		}
		file, err := parser.ParseFile(fset, path, nil, 0)
		if err != nil {
			return err
		}

		rootAliases := map[string]struct{}{}
		for _, spec := range file.Imports {
			importPath, err := strconv.Unquote(spec.Path.Value)
			if err != nil || importPath != rootDomainImport {
				continue
			}
			alias := "domain"
			if spec.Name != nil {
				alias = spec.Name.Name
				if alias == "." {
					t.Errorf("%s dot-imports root internal/domain; Page ownership cannot be proven", path)
					continue
				}
			}
			rootAliases[alias] = struct{}{}
		}
		if len(rootAliases) == 0 {
			return nil
		}

		ast.Inspect(file, func(node ast.Node) bool {
			selector, ok := node.(*ast.SelectorExpr)
			if !ok {
				return true
			}
			ident, ok := selector.X.(*ast.Ident)
			if !ok {
				return true
			}
			if _, ok := rootAliases[ident.Name]; !ok {
				return true
			}
			if _, isPageSymbol := pageSymbols[selector.Sel.Name]; isPageSymbol {
				t.Errorf("%s still consumes Page symbol %s.%s through root internal/domain; import internal/page/domain instead", path, ident.Name, selector.Sel.Name)
			}
			return true
		})
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
}
