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

// Static first-order HTTP disclosure guard for sixteen independently reviewed
// non-Connector capability controller packages. The Connector product module
// remains on its separate explicit hold; extending this test to it requires a
// dedicated contract and source audit, not silently bypassing the hold.
//
// This detects direct Error() serialization and local aliases forwarded to
// Gin response methods (including via response structs/maps/fmt wrappers).
// It is not a complete interprocedural taint analysis: domain return values,
// middleware, custom response writers and external error types still need review.
func TestAuditedControllerResponsesNeverSerializeRawErrorMethods(t *testing.T) {
	for _, capability := range []string{
		"access", "agent", "analytics", "community", "externalcapability",
		"feed", "knowledge", "media", "operations", "page", "post",
		"postversion", "recommendation", "site", "taxonomy", "workflow",
	} {
		dir := filepath.Join("..", capability, "controller")
		entries, err := os.ReadDir(dir)
		if err != nil {
			t.Fatalf("read %s controller: %v", capability, err)
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
				t.Fatalf("parse audited controller %s: %v", name, err)
			}
			for _, pos := range rawErrorHTTPResponses(file) {
				t.Errorf("%s: raw error text must not flow to a Gin HTTP response", fset.Position(pos))
			}
		}
	}
}

// rawErrorHTTPResponses is deliberately scoped to a function body: an
// unrelated function's logging variable must not taint an HTTP handler.
func rawErrorHTTPResponses(file *ast.File) []token.Pos {
	var violations []token.Pos
	for _, decl := range file.Decls {
		fn, ok := decl.(*ast.FuncDecl)
		if !ok || fn.Body == nil {
			continue
		}
		aliases := make(map[string]bool)
		type binding struct {
			name string
			rhs  ast.Expr
		}
		var assignments []binding
		ast.Inspect(fn.Body, func(n ast.Node) bool {
			switch node := n.(type) {
			case *ast.AssignStmt:
				if len(node.Lhs) == len(node.Rhs) {
					for i, lhs := range node.Lhs {
						if id, ok := lhs.(*ast.Ident); ok {
							assignments = append(assignments, binding{id.Name, node.Rhs[i]})
						}
					}
				}
			case *ast.ValueSpec:
				if len(node.Names) == len(node.Values) {
					for i, id := range node.Names {
						assignments = append(assignments, binding{id.Name, node.Values[i]})
					}
				}
			}
			return true
		})
		// Resolve aliases transitively, regardless of whether the source and
		// response are separated by a map/struct/fmt construction.
		for changed := true; changed; {
			changed = false
			for _, assignment := range assignments {
				if !aliases[assignment.name] && hasRawErrorText(assignment.rhs, aliases) {
					aliases[assignment.name] = true
					changed = true
				}
			}
		}
		ast.Inspect(fn.Body, func(n ast.Node) bool {
			call, ok := n.(*ast.CallExpr)
			if !ok || !isGinHTTPResponse(call) {
				return true
			}
			for _, arg := range call.Args {
				if hasRawErrorText(arg, aliases) {
					violations = append(violations, call.Pos())
					break
				}
			}
			return true
		})
	}
	return violations
}

func isGinHTTPResponse(call *ast.CallExpr) bool {
	sel, ok := call.Fun.(*ast.SelectorExpr)
	if !ok {
		return false
	}
	receiver, ok := sel.X.(*ast.Ident)
	if !ok || (receiver.Name != "c" && receiver.Name != "ctx") {
		return false
	}
	switch sel.Sel.Name {
	case "JSON", "AbortWithStatusJSON", "String", "Data", "XML",
		"YAML", "ProtoBuf", "SecureJSON", "AsciiJSON", "IndentedJSON", "PureJSON", "Render":
		return true
	}
	return false
}

// Only flag a direct zero-argument Error() method or an alias already
// derived from one; unrelated fixed domain messages remain permitted.
func hasRawErrorText(expr ast.Expr, aliases map[string]bool) bool {
	found := false
	ast.Inspect(expr, func(n ast.Node) bool {
		if call, ok := n.(*ast.CallExpr); ok {
			if sel, ok := call.Fun.(*ast.SelectorExpr); ok &&
				sel.Sel.Name == "Error" && len(call.Args) == 0 {
				found = true
				return false
			}
		}
		if id, ok := n.(*ast.Ident); ok && aliases[id.Name] {
			found = true
			return false
		}
		return true
	})
	return found
}

func TestHTTPResponseErrorGuardHasPositiveAndNegativeProbes(t *testing.T) {
	tests := []struct {
		name   string
		source string
		want   bool
	}{
		{"direct", `package p; func f(c *Context, err error) { c.JSON(500, Response(err.Error())) }`, true},
		{"indirect-map", `package p; func f(ctx *Context, err error) {
			message := err.Error()
			body := map[string]any{"message": message}
			ctx.JSON(500, body)
		}`, true},
		{"transitive-fmt", `package p; func f(c *Context, err error) {
			message := err.Error()
			wrapped := fmt.Sprintf("failed: %s", message)
			c.String(500, wrapped)
		}`, true},
		{"trusted-logging-only", `package p; func f(c *Context, err error) {
			message := err.Error()
			logTrusted(message)
			c.JSON(500, Response("internal server error"))
		}`, false},
		{"fixed-domain-response", `package p; func f(c *Context) {
			message := "invalid request"
			c.JSON(400, Response(message))
		}`, false},
		{"cross-function-alias", `package p
		func logOnly(err error) { message := err.Error(); logTrusted(message) }
		func public(c *Context) { message := "fixed"; c.JSON(500, Response(message)) }`, false},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			file, err := parser.ParseFile(token.NewFileSet(), "guard_probe.go", tc.source, 0)
			if err != nil {
				t.Fatal(err)
			}
			got := len(rawErrorHTTPResponses(file)) > 0
			if got != tc.want {
				t.Fatalf("detected=%v, want=%v", got, tc.want)
			}
		})
	}
}
