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

// A structural regression guard for the two AI capabilities that process
// prompts, Provider credentials, external webhook headers and recovery input.
// It catches direct err.Error() serialization nested anywhere in a Gin HTTP
// response, including inside NewErrorResponse, fmt.Sprintf or a map literal.
//
// Deliberately scoped: other capability controllers require their own
// audit/contract and must not be mass-migrated through this test.
func TestSensitiveAIControllerResponsesNeverSerializeRawErrorMethods(t *testing.T) {
	for _, dir := range []string{
		filepath.Join("..", "agent", "controller"),
		filepath.Join("..", "workflow", "controller"),
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
