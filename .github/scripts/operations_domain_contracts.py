from pathlib import Path
import re

root = Path(__file__).resolve().parents[2]
backend = root / "blog-backend"
root_domain = backend / "internal" / "domain"
operations = backend / "internal" / "operations"
operations_domain = operations / "domain"
operations_domain.mkdir(parents=True, exist_ok=True)

symbols = (
    "OperationalSuggestion",
    "EditorialTask",
    "ContentCandidateSet",
    "ContentCandidate",
    "AIFeedback",
)

# Move the model definitions without changing their JSON or time semantics.
source_path = root_domain / "operations.go"
source = source_path.read_text()
assert source.startswith("package domain\n")
(operations_domain / "model.go").write_text(source)
source_path.unlink()

root_import = '\t"github.com/rushairer/blog-backend/internal/domain"\n'
ops_import = '\topsdomain "github.com/rushairer/blog-backend/internal/operations/domain"\n'
root_selector = re.compile(r"(?<![A-Za-z0-9_])domain\.")


def migrate_symbols(relative: str) -> None:
    path = backend / relative
    text = path.read_text()
    changed = False
    for symbol in symbols:
        pattern = re.compile(rf"(?<![A-Za-z0-9_])domain\.{re.escape(symbol)}\b")
        text, count = pattern.subn(f"opsdomain.{symbol}", text)
        changed = changed or count > 0
    if not changed:
        return
    if "internal/operations/domain" not in text:
        if root_import in text:
            text = text.replace(root_import, root_import + ops_import, 1)
        else:
            marker = "import (\n"
            assert marker in text, relative
            text = text.replace(marker, marker + ops_import, 1)
    if root_import in text and not root_selector.search(text):
        text = text.replace(root_import, "", 1)
    path.write_text(text)


for relative in (
    "internal/operations/service.go",
    "internal/operations/approval_effects.go",
    "internal/operations/controller/controller.go",
    "internal/operations/service_test.go",
    "internal/operations/approval_effects_integration_test.go",
    "internal/agent/approval.go",
    "internal/agent/approval_ports.go",
):
    migrate_symbols(relative)

# Ownership regression guard mirrors the proven Page-domain retirement pattern.
(operations_domain / "ownership_test.go").write_text(r'''package domain_test

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

var operationsSymbols = map[string]struct{}{
	"OperationalSuggestion": {},
	"EditorialTask":          {},
	"ContentCandidate":       {},
	"ContentCandidateSet":    {},
	"AIFeedback":             {},
}

func TestRootOperationsDomainModelsStayRetired(t *testing.T) {
	if _, err := os.Stat("../../domain/operations.go"); !os.IsNotExist(err) {
		t.Fatalf("root Operations domain model file must stay retired: %v", err)
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
					t.Errorf("%s dot-imports root internal/domain; Operations ownership cannot be proven", path)
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
			if _, owned := operationsSymbols[selector.Sel.Name]; owned {
				t.Errorf("%s still consumes Operations symbol %s.%s through root internal/domain; import internal/operations/domain instead", path, ident.Name, selector.Sel.Name)
			}
			return true
		})
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
}
''')

# Architecture docs: classify Operations models as capability-owned, not shared kernel.
arch_path = backend / "ARCHITECTURE.md"
arch = arch_path.read_text()
anchor = "## Workflow HTTP ownership boundary\n"
section = '''## Operations domain ownership boundary

Operations-owned model values live under `internal/operations/domain`: `OperationalSuggestion`, `EditorialTask`, `ContentCandidate`, `ContentCandidateSet`, and `AIFeedback`.

- These values describe Operations persistence/API concepts and are not a shared kernel merely because Agent approval can propose one of them.
- Agent approval consumes `OperationalSuggestion` through the existing narrow `ApprovalEffectWriter` contract by importing the leaf Operations domain package; Operations behavior and persistence remain owned by `internal/operations`.
- The former root `internal/domain/operations.go` migration boundary is retired. `internal/operations/domain/ownership_test.go` rejects reintroduction of these symbols through the root domain package.
- JSON fields, database schema/queries, approval action types, HTTP routes/responses, authorization/MFA/audit middleware, BFF behavior, and Connector behavior are unchanged.

'''
assert anchor in arch
assert "## Operations domain ownership boundary" not in arch
arch = arch.replace(anchor, section + anchor, 1)
arch_path.write_text(arch)

conv_path = backend / "ARCHITECTURE_CONVERGENCE.md"
conv = conv_path.read_text()
replacements = {
    "`internal/operations` service; no artificial repository/controller layer": "`internal/operations` service/controller plus `internal/operations/domain`; no artificial repository layer",
    "**Service dependency, approval-effect ownership, and HTTP ownership are converged.**": "**Service dependency, approval-effect ownership, HTTP ownership, and domain model ownership are converged.**",
    "`internal/domain` Agent/Workflow/Operations/Post models": "`internal/domain` Agent/Workflow/Post models",
    "remaining root `internal/domain` Agent/Workflow/Operations/Post types": "remaining root `internal/domain` Agent/Workflow/Post types",
    "classify remaining Agent/Workflow/Operations/Post root models": "classify remaining Agent/Workflow/Post root models",
}
for old, new in replacements.items():
    assert old in conv, old
    conv = conv.replace(old, new, 1)
completed = "and **Page domain alias retirement** now use canonical ownership boundaries"
assert completed in conv
conv = conv.replace(completed, "and **Page domain alias retirement**, and **Operations domain model ownership convergence** now use canonical ownership boundaries", 1)
section_anchor = "### Page domain alias retirement — 2026-09-14\n"
assert section_anchor in conv
ops_section = '''### Operations domain model ownership convergence — 2026-09-14

- `internal/operations/domain` is the sole owner of `OperationalSuggestion`, `EditorialTask`, `ContentCandidate`, `ContentCandidateSet`, and `AIFeedback`; root `internal/domain/operations.go` is retired.
- Agent approval imports only the Operations-owned `OperationalSuggestion` value needed by its narrow approval-effect port. This is an explicit cross-capability value contract, not a reason to keep Operations models in a root shared-model bucket.
- Operations service/controller/tests consume the capability-owned domain package while Agent/Workflow/Post models remain in the root migration boundary pending separate classification.
- `internal/operations/domain/ownership_test.go` scans backend Go imports/selectors and rejects reintroduction of Operations symbols through root `internal/domain`.
- No persistence schema/query, transaction boundary, route, response payload, authorization, BFF, Access, or Connector behavior changes in this slice.


'''
conv = conv.replace(section_anchor, ops_section + section_anchor, 1)
conv_path.write_text(conv)

print("operations domain ownership migration applied")
