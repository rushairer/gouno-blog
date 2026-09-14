from pathlib import Path
import re

root = Path(__file__).resolve().parents[2]
backend = root / "blog-backend"
root_domain = backend / "internal" / "domain"
agent_path = root_domain / "agent.go"
provider_domain = backend / "internal" / "provider" / "domain"
provider_domain.mkdir(parents=True, exist_ok=True)

text = agent_path.read_text()
start_marker = "type ProviderType string\n"
end_marker = "type EmbeddingProfile struct {"
assert start_marker in text and end_marker in text
start = text.index(start_marker)
end = text.index(end_marker)
segment = text[start:end].rstrip() + "\n"
assert "type ProviderProfile struct" in segment
assert "ProviderOpenAI" in segment and "ProviderAnthropic" in segment and "ProviderGemini" in segment

model_path = provider_domain / "model.go"
assert not model_path.exists(), "provider/domain/model.go already exists"
model_path.write_text('package domain\n\nimport "time"\n\n' + segment)

text = text[:start] + text[end:]
text = re.sub(r"\bProviderProfile\b", "providerdomain.ProviderProfile", text)
text = re.sub(r"\bProviderType\b", "providerdomain.ProviderType", text)
if '"github.com/rushairer/blog-backend/internal/provider/domain"' not in text:
    text = text.replace(
        'import (\n',
        'import (\n\tproviderdomain "github.com/rushairer/blog-backend/internal/provider/domain"\n',
        1,
    )
agent_path.write_text(text)

root_import_path = "github.com/rushairer/blog-backend/internal/domain"
provider_import_path = "github.com/rushairer/blog-backend/internal/provider/domain"
retired_symbols = [
    "ProviderOpenAI",
    "ProviderAnthropic",
    "ProviderGemini",
    "ProviderProfile",
    "ProviderType",
]
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


def add_provider_import(source: str) -> str:
    if provider_import_path in source:
        return source
    spec = f'\tproviderdomain "{provider_import_path}"\n'
    if "import (\n" in source:
        return source.replace("import (\n", "import (\n" + spec, 1)
    single = re.search(
        r'(?m)^import[ \t]+(?P<spec>(?:(?:[A-Za-z_][A-Za-z0-9_]*)[ \t]+)?"[^"]+")[ \t]*$',
        source,
    )
    if single:
        existing = single.group("spec")
        block = "import (\n\t" + existing + "\n" + spec + ")"
        return source[: single.start()] + block + source[single.end() :]
    raise AssertionError("cannot add Provider domain import")


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
    if path == agent_path or path.is_relative_to(provider_domain):
        continue
    source = path.read_text()
    alias = root_alias(source)
    if not alias:
        continue
    selector_re = re.compile(
        r"(?<![A-Za-z0-9_])" + re.escape(alias) + r"\.(" + selector_names + r")\b"
    )
    source, count = selector_re.subn(lambda m: "providerdomain." + m.group(1), source)
    if count == 0:
        continue
    source = add_provider_import(source)
    source = remove_root_if_unused(source, alias)
    path.write_text(source)
    migrated.append(str(path.relative_to(root)))

assert migrated, "expected Provider model consumers"
print("Migrated Provider consumers:")
print("\n".join(migrated))

entries = "\n".join(f'\t"{s}": {{}},' for s in retired_symbols)
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

var retiredProviderSymbols = map[string]struct{}{
SYMBOL_ENTRIES
}

func TestRootProviderModelsStayRetired(t *testing.T) {
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
					if _, retired := retiredProviderSymbols[typed.Name.Name]; retired {
						t.Errorf("%s redeclares Provider-owned symbol %s in root internal/domain", path, typed.Name.Name)
					}
				case *ast.ValueSpec:
					for _, name := range typed.Names {
						if _, retired := retiredProviderSymbols[name.Name]; retired {
							t.Errorf("%s redeclares Provider-owned symbol %s in root internal/domain", path, name.Name)
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
			if _, retired := retiredProviderSymbols[selector.Sel.Name]; !retired { return true }
			ident, ok := selector.X.(*ast.Ident); if !ok { return true }
			if _, rootAlias := aliases[ident.Name]; rootAlias {
				t.Errorf("%s consumes Provider-owned symbol %s through root internal/domain; import internal/provider/domain instead", path, selector.Sel.Name)
			}
			return true
		})
		return nil
	})
	if err != nil { t.Fatal(err) }
}
'''.replace("SYMBOL_ENTRIES", entries)
(provider_domain / "ownership_test.go").write_text(ownership)

arch_path = backend / "ARCHITECTURE.md"
arch = arch_path.read_text()
workflow_sentence = 'Workflow definitions, scope/event configuration, run/step/resource snapshots, dispatch claims, interactions, and run events are Workflow-owned values under `internal/workflow/domain`; the historical root `internal/domain/workflow.go` bucket is retired after repository-wide consumer proof. Agent, Workflow planner, Starter Pack, and other consumers import that leaf contract directly.'
assert workflow_sentence in arch, "Workflow ownership paragraph drifted"
provider_sentence = ' Provider profile identity/configuration values (`ProviderType` and `ProviderProfile`) are Provider-owned under `internal/provider/domain`; Agent management/runtime and Workflow planning import that leaf contract directly while credential validation, encryption and upstream runtime behavior remain in canonical Provider/Agent services.'
arch = arch.replace(workflow_sentence, workflow_sentence + provider_sentence, 1)
arch_path.write_text(arch)

conv_path = backend / "ARCHITECTURE_CONVERGENCE.md"
conv = conv_path.read_text()
conv = conv.replace(
    '| **Provider** | AI Provider profiles and encrypted credential metadata; `ai_provider_profiles` | `internal/provider`, `internal/provider/repository` |',
    '| **Provider** | AI Provider profiles and encrypted credential metadata; `ai_provider_profiles` | `internal/provider` plus `internal/provider/{domain,repository}` |',
    1,
)
conv = conv.replace(
    '**Management consumer converged.** The flat Provider facade is retired; credential validation/encryption/security behavior is unchanged.',
    '**Management consumer and domain model ownership converged.** The flat Provider facade is retired; credential validation/encryption/security behavior is unchanged.',
    1,
)
conv = conv.replace(
    '| `internal/domain` Agent models | Deliberate model migration boundary, not automatically a facade | Agent plus Provider/Knowledge/Workflow consumers | Classify the remaining mixed Agent/Provider/Knowledge model bucket into real owners before moving. Workflow/Post-owned models are retired from this boundary. Never move solely for directory symmetry. |',
    '| `internal/domain` Agent mixed models | Deliberate model migration boundary, not automatically a facade | Agent plus Knowledge/Tool consumers | Classify the remaining Agent/Knowledge/Tool-risk model bucket into real owners before moving. Provider/Workflow/Post-owned models are retired from this boundary. Never move solely for directory symmetry. |',
    1,
)
conv = conv.replace(
    '- **C — intentionally shared pending model-boundary decision:** remaining root `internal/domain` Agent/Provider/Knowledge mixed models with real cross-capability consumers. Page, Post, and Workflow have been classified as capability-owned and their root aliases are retired. Remaining models must not be duplicated or moved just to empty the directory.',
    '- **C — intentionally shared pending model-boundary decision:** remaining root `internal/domain` Agent/Knowledge/Tool-risk mixed models with real cross-capability consumers. Page, Post, Workflow, and Provider have been classified as capability-owned and their root aliases are retired. Remaining models must not be duplicated or moved just to empty the directory.',
    1,
)
conv = conv.replace(
    '2. **Shared-model classification:** Page, Post, and Workflow are complete; classify the remaining mixed Agent/Provider/Knowledge root models only where a real capability/shared-kernel/contract decision is needed; never move them for directory symmetry.',
    '2. **Shared-model classification:** Page, Post, Workflow, and Provider are complete; classify the remaining mixed Agent/Knowledge/Tool-risk root models only where a real capability/shared-kernel/contract decision is needed; never move them for directory symmetry.',
    1,
)
conv = conv.replace(
    'and **Workflow domain model ownership** now use canonical ownership boundaries',
    'and **Workflow domain model ownership**, and **Provider domain model ownership** now use canonical ownership boundaries',
    1,
)
conv = conv.replace(
    '- Root `internal/domain` is now the remaining mixed Agent/Provider/Knowledge model-classification bucket only.',
    '- Root `internal/domain` is now the remaining mixed Agent/Knowledge/Tool-risk model-classification bucket only.',
    1,
)
marker = '### Workflow domain model ownership — 2026-09-14\n'
assert marker in conv, "Workflow domain ownership section missing"
section = '''### Provider domain model ownership — 2026-09-14

- `internal/provider/domain` owns `ProviderType`, provider-type constants, and `ProviderProfile`; these values are no longer declared by root `internal/domain`.
- Provider repository plus Agent management/generation/controller, Workflow planner/controller, and other consumers import the Provider-owned leaf contract directly.
- `internal/provider/domain/ownership_test.go` rejects redeclaration or future consumption of Provider-owned symbols through root `internal/domain`.
- Credential ciphertext/nonce fields, encryption associated-data behavior, upstream URL validation, provider runtime protocols, SQL, routes/responses, Auth BFF, Connector, and middleware behavior are unchanged.
- Remaining root model classification is Agent/Knowledge/Tool-risk only.


'''
conv = conv.replace(marker, section + marker, 1)
conv_path.write_text(conv)
