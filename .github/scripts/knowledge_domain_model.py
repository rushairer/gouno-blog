from pathlib import Path
import re

root = Path(__file__).resolve().parents[2]
backend = root / "blog-backend"
agent_path = backend / "internal" / "domain" / "agent.go"
knowledge_domain = backend / "internal" / "knowledge" / "domain"
knowledge_domain.mkdir(parents=True, exist_ok=True)

text = agent_path.read_text()
start_marker = "type EmbeddingProfile struct {"
end_marker = "type AgentCitation struct {"
assert start_marker in text and end_marker in text
start = text.index(start_marker)
end = text.index(end_marker)
segment = text[start:end].rstrip() + "\n"
assert "APIKeyCiphertext" in segment and "RequestTimeoutSeconds" in segment

model_path = knowledge_domain / "model.go"
assert not model_path.exists(), "knowledge/domain/model.go already exists"
model_path.write_text('package domain\n\nimport "time"\n\n' + segment)
agent_path.write_text(text[:start] + text[end:])

root_import_path = "github.com/rushairer/blog-backend/internal/domain"
knowledge_import_path = "github.com/rushairer/blog-backend/internal/knowledge/domain"
retired_symbols = ["EmbeddingProfile"]
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


def add_knowledge_import(source: str) -> str:
    if knowledge_import_path in source:
        return source
    spec = f'\tknowledgedomain "{knowledge_import_path}"\n'
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
    raise AssertionError("cannot add Knowledge domain import")


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
    if path == agent_path or path.is_relative_to(knowledge_domain):
        continue
    source = path.read_text()
    alias = root_alias(source)
    if not alias:
        continue
    selector_re = re.compile(
        r"(?<![A-Za-z0-9_])" + re.escape(alias) + r"\.(" + selector_names + r")\b"
    )
    source, count = selector_re.subn(lambda m: "knowledgedomain." + m.group(1), source)
    if count == 0:
        continue
    source = add_knowledge_import(source)
    source = remove_root_if_unused(source, alias)
    path.write_text(source)
    migrated.append(str(path.relative_to(root)))

assert migrated, "expected EmbeddingProfile consumers"
print("Migrated Knowledge consumers:")
print("\n".join(migrated))

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
'''
(knowledge_domain / "ownership_test.go").write_text(ownership)

arch_path = backend / "ARCHITECTURE.md"
arch = arch_path.read_text()
provider_sentence = 'Provider profile identity/configuration values (`ProviderType` and `ProviderProfile`) are Provider-owned under `internal/provider/domain`; Agent management/runtime and Workflow planning import that leaf contract directly while credential validation, encryption and upstream runtime behavior remain in canonical Provider/Agent services.'
assert provider_sentence in arch, "Provider ownership paragraph drifted"
knowledge_sentence = ' Embedding profile configuration/credential metadata (`EmbeddingProfile`) is Knowledge-owned under `internal/knowledge/domain`; Knowledge service/controller import that leaf contract while encryption, upstream validation, SQL, indexing, and embedding runtime behavior remain in `internal/knowledge`.'
arch = arch.replace(provider_sentence, provider_sentence + knowledge_sentence, 1)
arch_path.write_text(arch)

conv_path = backend / "ARCHITECTURE_CONVERGENCE.md"
conv = conv_path.read_text()
conv = conv.replace(
    '| **Knowledge** | Embedding profiles, index jobs/chunks, retrieval metrics/evaluation; `ai_embedding_profiles`, `ai_content_index_jobs`, `ai_content_chunks`, `ai_retrieval_metrics`, `ai_retrieval_eval_cases` | `internal/knowledge` service and `internal/knowledge/controller`; cohesive service-local persistence is intentional today |',
    '| **Knowledge** | Embedding profiles, index jobs/chunks, retrieval metrics/evaluation; `ai_embedding_profiles`, `ai_content_index_jobs`, `ai_content_chunks`, `ai_retrieval_metrics`, `ai_retrieval_eval_cases` | `internal/knowledge` service/controller plus `internal/knowledge/domain`; cohesive service-local persistence is intentional today |',
    1,
)
conv = conv.replace(
    '**Service and HTTP ownership are converged.** Embedding/index transport is capability-owned; persistence/transaction behavior is unchanged.',
    '**Service, HTTP ownership, and EmbeddingProfile domain ownership are converged.** Embedding/index transport is capability-owned; persistence/transaction behavior is unchanged.',
    1,
)
conv = conv.replace(
    '| `internal/domain` Agent mixed models | Deliberate model migration boundary, not automatically a facade | Agent plus Knowledge/Tool consumers | Classify the remaining Agent/Knowledge/Tool-risk model bucket into real owners before moving. Provider/Workflow/Post-owned models are retired from this boundary. Never move solely for directory symmetry. |',
    '| `internal/domain` Agent mixed models | Deliberate model migration boundary, not automatically a facade | Agent plus Tool consumers | Classify the remaining Agent/Tool-risk model bucket into real owners before moving. Knowledge/Provider/Workflow/Post-owned models are retired from this boundary. Never move solely for directory symmetry. |',
    1,
)
conv = conv.replace(
    '- **C — intentionally shared pending model-boundary decision:** remaining root `internal/domain` Agent/Knowledge/Tool-risk mixed models with real cross-capability consumers. Page, Post, Workflow, and Provider have been classified as capability-owned and their root aliases are retired. Remaining models must not be duplicated or moved just to empty the directory.',
    '- **C — intentionally shared pending model-boundary decision:** remaining root `internal/domain` Agent/Tool-risk mixed models with real cross-capability consumers. Page, Post, Workflow, Provider, and Knowledge EmbeddingProfile have been classified as capability-owned and their root aliases are retired. Remaining models must not be duplicated or moved just to empty the directory.',
    1,
)
conv = conv.replace(
    '2. **Shared-model classification:** Page, Post, Workflow, and Provider are complete; classify the remaining mixed Agent/Knowledge/Tool-risk root models only where a real capability/shared-kernel/contract decision is needed; never move them for directory symmetry.',
    '2. **Shared-model classification:** Page, Post, Workflow, Provider, and Knowledge EmbeddingProfile are complete; classify the remaining mixed Agent/Tool-risk root models only where a real capability/shared-kernel/contract decision is needed; never move them for directory symmetry.',
    1,
)
conv = conv.replace(
    'and **Provider domain model ownership** now use canonical ownership boundaries',
    'and **Provider domain model ownership**, and **Knowledge EmbeddingProfile domain ownership** now use canonical ownership boundaries',
    1,
)
conv = conv.replace(
    '- Remaining root model classification is Agent/Knowledge/Tool-risk only.',
    '- Remaining root model classification is Agent/Tool-risk only.',
    1,
)
conv = conv.replace(
    '- Root `internal/domain` is now the remaining mixed Agent/Knowledge/Tool-risk model-classification bucket only.',
    '- Root `internal/domain` is now the remaining mixed Agent/Tool-risk model-classification bucket only.',
    1,
)
marker = '### Provider domain model ownership — 2026-09-14\n'
assert marker in conv, "Provider domain ownership section missing"
section = '''### Knowledge EmbeddingProfile domain ownership — 2026-09-14

- `internal/knowledge/domain` owns `EmbeddingProfile`; the credential/configuration value is no longer declared by root `internal/domain`.
- Knowledge service/controller import the leaf contract directly; cohesive Knowledge persistence and transaction ownership stay unchanged.
- `internal/knowledge/domain/ownership_test.go` rejects redeclaration or future consumption of `EmbeddingProfile` through root `internal/domain`.
- API-key ciphertext/nonce handling, encryption/decryption, upstream URL validation, HTTP client safety, SQL, index/retrieval behavior, routes/responses, Auth BFF, Access, Connector, and middleware behavior are unchanged.
- Remaining root model classification is Agent/Tool-risk only.


'''
conv = conv.replace(marker, section + marker, 1)
conv_path.write_text(conv)
