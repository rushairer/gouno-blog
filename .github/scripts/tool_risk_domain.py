from pathlib import Path
import re

root = Path(__file__).resolve().parents[2]
backend = root / "blog-backend"
agent_path = backend / "internal" / "domain" / "agent.go"
tool_domain = backend / "internal" / "tool" / "domain"
tool_domain.mkdir(parents=True, exist_ok=True)

text = agent_path.read_text()
start_marker = "type ToolRiskLevel string\n"
end_marker = "type ToolCallStatus string"
assert start_marker in text and end_marker in text
start = text.index(start_marker)
end = text.index(end_marker)
segment = text[start:end].rstrip() + "\n"
assert 'ToolRiskRead' in segment and 'ToolRiskPropose' in segment and 'ToolRiskWrite' in segment

model_path = tool_domain / "model.go"
assert not model_path.exists(), "tool/domain/model.go already exists"
model_path.write_text("package domain\n\n" + segment)

text = text[:start] + text[end:]
text, count = re.subn(r"(\bRiskLevel\s+)ToolRiskLevel\b", r"\1tooldomain.ToolRiskLevel", text)
assert count == 1, f"expected one AgentToolCall RiskLevel field, found {count}"
if '"github.com/rushairer/blog-backend/internal/tool/domain"' not in text:
    text = text.replace(
        'import (\n',
        'import (\n\ttooldomain "github.com/rushairer/blog-backend/internal/tool/domain"\n',
        1,
    )
agent_path.write_text(text)

root_import_path = "github.com/rushairer/blog-backend/internal/domain"
tool_import_path = "github.com/rushairer/blog-backend/internal/tool/domain"
retired_symbols = ["ToolRiskLevel", "ToolRiskRead", "ToolRiskPropose", "ToolRiskWrite"]
selector_names = "|".join(map(re.escape, retired_symbols))
block_import_re = re.compile(
    r'(?m)^(?P<indent>[ \t]*)(?:(?P<alias>[A-Za-z_][A-Za-z0-9_]*)[ \t]+)?"'
    + re.escape(root_import_path)
    + r'"[ \t]*$'
)
single_import_re = re.compile(
    r'(?m)^import[ \t]+(?:(?P<alias>[A-Za-z_][A-Za-z0-9_]*)[ \t]+)?"'
    + re.escape(root_import_path)
    + r'"[ \t]*$'
)


def add_tool_import(source: str) -> str:
    if tool_import_path in source:
        return source
    spec = f'\ttooldomain "{tool_import_path}"\n'
    if "import (\n" in source:
        return source.replace("import (\n", "import (\n" + spec, 1)
    single = re.search(
        r'(?m)^import[ \t]+(?P<spec>(?:(?:[A-Za-z_][A-Za-z0-9_]*)[ \t]+)?"[^"]+")[ \t]*$', source
    )
    if single:
        existing = single.group("spec")
        block = "import (\n\t" + existing + "\n" + spec + ")"
        return source[: single.start()] + block + source[single.end() :]
    raise AssertionError("cannot add Tool domain import")


def root_alias(source: str):
    match = block_import_re.search(source) or single_import_re.search(source)
    if not match:
        return None
    alias = match.groupdict().get("alias") or "domain"
    if alias in {".", "_"}:
        raise AssertionError("unsupported root-domain dot/blank import")
    return alias


def remove_root_if_unused(source: str, alias: str) -> str:
    if re.search(r"\b" + re.escape(alias) + r"\.", source):
        return source
    source, count = block_import_re.subn("", source, count=1)
    if count:
        return source
    source, count = single_import_re.subn("", source, count=1)
    assert count == 1
    return source


migrated = []
for path in sorted(backend.rglob("*.go")):
    if path == agent_path or path.is_relative_to(tool_domain):
        continue
    source = path.read_text()
    alias = root_alias(source)
    if not alias:
        continue
    selector_re = re.compile(
        r"(?<![A-Za-z0-9_])" + re.escape(alias) + r"\.(" + selector_names + r")\b"
    )
    source, count = selector_re.subn(lambda m: "tooldomain." + m.group(1), source)
    if count == 0:
        continue
    source = add_tool_import(source)
    source = remove_root_if_unused(source, alias)
    path.write_text(source)
    migrated.append(str(path.relative_to(root)))

assert migrated, "expected ToolRisk consumers"
print("Migrated ToolRisk consumers:")
print("\n".join(migrated))

entries = "\n".join(f'\t"{symbol}": {{}},' for symbol in retired_symbols)
ownership = r'''package domain_test

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

var retiredToolRiskSymbols = map[string]struct{}{
SYMBOL_ENTRIES
}

func TestRootToolRiskModelsStayRetired(t *testing.T) {
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
				switch typed := spec.(type) {
				case *ast.TypeSpec:
					if _, retired := retiredToolRiskSymbols[typed.Name.Name]; retired {
						t.Errorf("%s redeclares Tool-owned symbol %s in root internal/domain", path, typed.Name.Name)
					}
				case *ast.ValueSpec:
					for _, name := range typed.Names {
						if _, retired := retiredToolRiskSymbols[name.Name]; retired {
							t.Errorf("%s redeclares Tool-owned symbol %s in root internal/domain", path, name.Name)
						}
					}
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
			selector, ok := node.(*ast.SelectorExpr); if !ok { return true }
			if _, retired := retiredToolRiskSymbols[selector.Sel.Name]; !retired { return true }
			ident, ok := selector.X.(*ast.Ident); if !ok { return true }
			if _, rootAlias := aliases[ident.Name]; rootAlias {
				t.Errorf("%s consumes Tool-owned symbol %s through root internal/domain; import internal/tool/domain instead", path, selector.Sel.Name)
			}
			return true
		})
		return nil
	})
	if err != nil { t.Fatal(err) }
}
'''.replace("SYMBOL_ENTRIES", entries)
(tool_domain / "ownership_test.go").write_text(ownership)

arch_path = backend / "ARCHITECTURE.md"
arch = arch_path.read_text()
knowledge_sentence = 'Embedding profile configuration/credential metadata (`EmbeddingProfile`) is Knowledge-owned under `internal/knowledge/domain`; Knowledge service/controller import that leaf contract while encryption, upstream validation, SQL, indexing, and embedding runtime behavior remain in `internal/knowledge`.'
assert knowledge_sentence in arch, "Knowledge ownership paragraph drifted"
tool_sentence = ' Tool risk classification (`ToolRiskLevel` and its read/propose/write constants) is Tool-owned under `internal/tool/domain`; Agent, Workflow, Operations, and Tool registry consumers import that leaf contract while invocation/proposal/execution behavior remains in `internal/tool`.'
arch = arch.replace(knowledge_sentence, knowledge_sentence + tool_sentence, 1)
arch_path.write_text(arch)

conv_path = backend / "ARCHITECTURE_CONVERGENCE.md"
conv = conv_path.read_text()
conv = conv.replace(
    '| **Tool** | Tool registry/contracts/bindings; no owned persistence table | `internal/tool` | Calls capability services/ports; must not become a generic business bucket. | Transaction ownership stays with the called application/capability service. | **Stable boundary.** |',
    '| **Tool** | Tool registry/contracts/bindings; no owned persistence table | `internal/tool` plus `internal/tool/domain` | Calls capability services/ports; must not become a generic business bucket. | Transaction ownership stays with the called application/capability service. | **Stable boundary and ToolRisk domain ownership converged.** |',
    1,
)
conv = conv.replace(
    '| `internal/domain` Agent mixed models | Deliberate model migration boundary, not automatically a facade | Agent plus Tool consumers | Classify the remaining Agent/Tool-risk model bucket into real owners before moving. Knowledge/Provider/Workflow/Post-owned models are retired from this boundary. Never move solely for directory symmetry. |',
    '| `internal/domain` Agent models | Deliberate model migration boundary, not automatically a facade | Agent consumers | Remaining root models are Agent-owned and are the final shared-model migration slice. Tool/Knowledge/Provider/Workflow/Post-owned models are retired from this boundary. |',
    1,
)
conv = conv.replace(
    '- **C — intentionally shared pending model-boundary decision:** remaining root `internal/domain` Agent/Tool-risk mixed models with real cross-capability consumers. Page, Post, Workflow, Provider, and Knowledge EmbeddingProfile have been classified as capability-owned and their root aliases are retired. Remaining models must not be duplicated or moved just to empty the directory.',
    '- **C — final model-migration boundary:** remaining root `internal/domain` models are Agent-owned. Page, Post, Workflow, Provider, Knowledge EmbeddingProfile, and ToolRisk have been classified and their root aliases are retired; the final Agent slice may retire `internal/domain` after full consumer proof.',
    1,
)
conv = conv.replace(
    '2. **Shared-model classification:** Page, Post, Workflow, Provider, and Knowledge EmbeddingProfile are complete; classify the remaining mixed Agent/Tool-risk root models only where a real capability/shared-kernel/contract decision is needed; never move them for directory symmetry.',
    '2. **Shared-model classification:** Page, Post, Workflow, Provider, Knowledge EmbeddingProfile, and ToolRisk are complete; the remaining root models are Agent-owned and form the final model-migration slice.',
    1,
)
conv = conv.replace(
    'and **Knowledge EmbeddingProfile domain ownership** now use canonical ownership boundaries',
    'and **Knowledge EmbeddingProfile domain ownership**, and **ToolRisk domain ownership** now use canonical ownership boundaries',
    1,
)
conv = conv.replace(
    '- Remaining root model classification is Agent/Tool-risk only.',
    '- Remaining root model classification is Agent-owned only.',
    1,
)
conv = conv.replace(
    '- Root `internal/domain` is now the remaining mixed Agent/Tool-risk model-classification bucket only.',
    '- Root `internal/domain` now contains only the final Agent-owned model migration boundary.',
    1,
)
marker = '### Knowledge EmbeddingProfile domain ownership — 2026-09-14\n'
assert marker in conv, "Knowledge ownership section missing"
section = '''### ToolRisk domain ownership — 2026-09-14

- `internal/tool/domain` owns `ToolRiskLevel` and the read/propose/write risk constants; these values are no longer declared by root `internal/domain`.
- Tool registry/bindings plus Agent, Workflow, and Operations consumers import the Tool-owned leaf contract directly. `AgentToolCall.RiskLevel` explicitly references the leaf Tool contract.
- `internal/tool/domain/ownership_test.go` rejects redeclaration or future consumption of ToolRisk symbols through root `internal/domain`.
- Tool invocation/proposal/execution behavior, scope enforcement, approval behavior, SQL, routes/responses, Auth BFF, Access, Connector, and middleware behavior are unchanged.
- Remaining root model classification is Agent-owned only and is ready for the final whole-file Agent migration after consumer proof.


'''
conv = conv.replace(marker, section + marker, 1)
conv_path.write_text(conv)
