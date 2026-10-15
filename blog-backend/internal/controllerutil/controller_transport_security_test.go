package controllerutil

import (
	"go/ast"
	"go/parser"
	"go/token"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// Structural regression guard for ten independently reviewed capability controllers:
// Agent, Workflow, Knowledge, Operations, Community, Media, Site, Taxonomy,
// Post and Page.
// It catches direct Error() serialization nested within a Gin HTTP response,
// including NewErrorResponse, fmt.Sprintf or a map literal.
//
// This is intentionally narrower than a dataflow/taint analyzer: fixed
// sentinel messages are classified outside the HTTP call site, and indirect
// leaks in other capabilities require their own audited contracts.
func TestAuditedControllerResponsesNeverSerializeRawErrorMethods(t *testing.T) {
	for _, dir := range []string{
		filepath.Join("..", "agent", "controller"),
		filepath.Join("..", "workflow", "controller"),
		filepath.Join("..", "knowledge", "controller"),
		filepath.Join("..", "operations", "controller"),
		filepath.Join("..", "community", "controller"),
		filepath.Join("..", "media", "controller"),
		filepath.Join("..", "site", "controller"),
		filepath.Join("..", "taxonomy", "controller"),
		filepath.Join("..", "post", "controller"),
		filepath.Join("..", "page", "controller"),
	} {
		entries, err := os.ReadDir(dir)
		if err != nil {
			t.Fatal(err)
		}
		for _, entry := range entries {
			if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".go") ||
				strings.HasSuffix(entry.Name(), "_test.go") {
				continue
			}
			name := filepath.Join(dir, entry.Name())
			fset := token.NewFileSet()
			file, err := parser.ParseFile(fset, name, nil, parser.SkipObjectResolution)
			if err != nil {
				t.Fatalf("could not inspect sensitive controller %s: %v", name, err)
			}
			ast.Inspect(file, func(node ast.Node) bool {
				call, ok := node.(*ast.CallExpr)
				if !ok {
					return true
				}
				sel, ok := call.Fun.(*ast.SelectorExpr)
				if !ok {
					return true
				}
				receiver, ok := sel.X.(*ast.Ident)
				if !ok || (receiver.Name != "c" && receiver.Name != "ctx") {
					return true
				}
				switch sel.Sel.Name {
				case "JSON", "AbortWithStatusJSON", "String", "Data":
				default:
					return true
				}
				for _, arg := range call.Args {
					ast.Inspect(arg, func(child ast.Node) bool {
						innerCall, ok := child.(*ast.CallExpr)
						if !ok || len(innerCall.Args) != 0 {
							return true
						}
						innerSel, ok := innerCall.Fun.(*ast.SelectorExpr)
						if ok && innerSel.Sel.Name == "Error" {
							t.Errorf("%s: raw Error() must not flow to public HTTP output (%s)", fset.Position(innerCall.Pos()), sel.Sel.Name)
						}
						return true
					})
				}
				return true
			})
		}
	}
}
