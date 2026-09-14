from pathlib import Path
import re

root = Path(__file__).resolve().parents[2]
backend = root / "blog-backend"
root_domain = backend / "internal" / "domain"
post_domain = backend / "internal" / "post" / "domain"
post_domain.mkdir(parents=True, exist_ok=True)

root_post = root_domain / "post.go"
assert root_post.exists(), "expected historical internal/domain/post.go"
model_text = root_post.read_text()
assert "type PostStatus string" in model_text
assert "type Post struct" in model_text
assert "type PostSearchResult struct" in model_text
assert "type AdminPostFilter struct" in model_text

model_path = post_domain / "model.go"
assert not model_path.exists(), "post/domain/model.go already exists"
model_path.write_text(model_text)
root_post.unlink()

root_import_path = "github.com/rushairer/blog-backend/internal/domain"
post_import_path = "github.com/rushairer/blog-backend/internal/post/domain"
retired_symbols = [
    "PostStatusPublished",
    "PostStatusScheduled",
    "PostStatusDraft",
    "PostSearchResult",
    "AdminPostFilter",
    "PostStatus",
    "Post",
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


def add_post_import(text: str) -> str:
    if post_import_path in text:
        return text
    post_spec = f'\tpostdomain "{post_import_path}"\n'
    if "import (\n" in text:
        return text.replace("import (\n", "import (\n" + post_spec, 1)
    any_single = re.search(
        r'(?m)^import[ \t]+(?P<spec>(?:(?:[A-Za-z_][A-Za-z0-9_]*)[ \t]+)?"[^"]+")[ \t]*$',
        text,
    )
    if any_single:
        spec = any_single.group("spec")
        block = "import (\n\t" + spec + "\n" + post_spec + ")"
        return text[: any_single.start()] + block + text[any_single.end() :]
    raise AssertionError("cannot add post domain import")


def root_import_alias(text: str):
    match = block_import_re.search(text) or single_import_re.search(text)
    if not match:
        return None
    alias = match.groupdict().get("alias") or "domain"
    if alias in {".", "_"}:
        raise AssertionError("root internal/domain dot/blank import is not supported by ownership migration")
    return alias


def remove_root_import_if_unused(text: str, alias: str) -> str:
    if re.search(r"\b" + re.escape(alias) + r"\.", text):
        return text
    text, count = block_import_re.subn("", text, count=1)
    if count:
        return text
    text, count = single_import_re.subn("", text, count=1)
    assert count == 1, "expected root domain import to remove"
    return text


migrated = []
for path in sorted(backend.rglob("*.go")):
    if path.is_relative_to(post_domain):
        continue
    text = path.read_text()
    alias = root_import_alias(text)
    if not alias:
        continue
    selector_re = re.compile(
        r"(?<![A-Za-z0-9_])" + re.escape(alias) + r"\.(" + selector_names + r")\b"
    )
    text, count = selector_re.subn(lambda m: "postdomain." + m.group(1), text)
    if count == 0:
        continue
    text = add_post_import(text)
    text = remove_root_import_if_unused(text, alias)
    path.write_text(text)
    migrated.append(str(path.relative_to(root)))

assert migrated, "expected root Post model consumers"
print("Migrated Post model consumers:")
print("\n".join(migrated))


def render_ownership_test(test_name: str, owner_label: str, leaf_import: str, symbols: list[str]) -> str:
    symbol_entries = "\n".join(f'\t"{symbol}": {{}},' for symbol in symbols)
    template = r'''package domain_test

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
SYMBOL_ENTRIES
}

func TEST_NAME(t *testing.T) {
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
						t.Errorf("%s redeclares OWNER_LABEL-owned symbol %s in root internal/domain", path, typed.Name.Name)
					}
				case *ast.ValueSpec:
					for _, name := range typed.Names {
						if _, retired := retiredSymbols[name.Name]; retired {
							t.Errorf("%s redeclares OWNER_LABEL-owned symbol %s in root internal/domain", path, name.Name)
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
					t.Errorf("%s dot-imports root internal/domain; OWNER_LABEL ownership cannot be proven", path)
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
				t.Errorf("%s consumes OWNER_LABEL-owned symbol %s through root internal/domain; import LEAF_IMPORT instead", path, selector.Sel.Name)
			}
			return true
		})
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
}
'''
    return (
        template.replace("TEST_NAME", test_name)
        .replace("OWNER_LABEL", owner_label)
        .replace("LEAF_IMPORT", leaf_import)
        .replace("SYMBOL_ENTRIES", symbol_entries)
    )


ownership_specs = [
    (
        post_domain / "ownership_test.go",
        "TestRootPostModelsStayRetired",
        "Post",
        "internal/post/domain",
        retired_symbols,
    ),
    (
        backend / "internal" / "analytics" / "domain" / "ownership_test.go",
        "TestRootAnalyticsReadModelsStayRetired",
        "Analytics",
        "internal/analytics/domain",
        ["AnalyticsSummary", "SystemAlert", "DailyEventCount"],
    ),
    (
        backend / "internal" / "media" / "domain" / "ownership_test.go",
        "TestRootMediaModelsStayRetired",
        "Media",
        "internal/media/domain",
        ["MediaAsset", "MediaFilter", "MediaReference"],
    ),
    (
        backend / "internal" / "taxonomy" / "domain" / "ownership_test.go",
        "TestRootTaxonomyModelsStayRetired",
        "Taxonomy",
        "internal/taxonomy/domain",
        ["Category", "TagSummary"],
    ),
    (
        backend / "internal" / "postversion" / "domain" / "ownership_test.go",
        "TestRootPostVersionModelStaysRetired",
        "PostVersion",
        "internal/postversion/domain",
        ["PostVersion"],
    ),
]
for path, test_name, owner_label, leaf_import, symbols in ownership_specs:
    path.write_text(render_ownership_test(test_name, owner_label, leaf_import, symbols))

arch_path = backend / "ARCHITECTURE.md"
arch = arch_path.read_text()
old = '`Category` and `TagSummary` are Taxonomy-owned values under `internal/taxonomy/domain`; their former declarations in the root content-model bucket are retired after consumer proof. `PostVersion` is likewise owned by `internal/postversion/domain`, while its `Status` field explicitly references the current root Post status type until Post ownership is classified separately. The remaining root Post model is not moved merely for directory symmetry; its boundary must be decided from actual ownership and cross-capability usage.'
new = '`Category` and `TagSummary` are Taxonomy-owned values under `internal/taxonomy/domain`; their former declarations in the root content-model bucket are retired after consumer proof. `PostVersion` is likewise owned by `internal/postversion/domain`, and its `Status` field references the Post-owned status contract under `internal/post/domain`. `PostStatus`, `Post`, `PostSearchResult`, and `AdminPostFilter` are Post-owned values under `internal/post/domain`; their historical root declarations are retired after repository-wide consumer proof. Cross-capability readers import the leaf Post domain contract directly rather than treating root `internal/domain` as a shared kernel.'
assert old in arch, "ARCHITECTURE Post ownership paragraph drifted"
arch = arch.replace(old, new, 1)
arch = arch.replace(
    '`internal/post/{repository,service,controller}`',
    '`internal/post/{domain,repository,service,controller}`',
    1,
)
arch = arch.replace(
    'The summary remains a cross-capability projection and its `TopPosts` field explicitly references the current root Post model until Post model ownership is classified separately.',
    'The summary remains a cross-capability projection and its `TopPosts` field references the Post-owned leaf domain contract directly.',
    1,
)
arch_path.write_text(arch)

conv_path = backend / "ARCHITECTURE_CONVERGENCE.md"
conv = conv_path.read_text()
conv = conv.replace(
    '`internal/post/{repository,service,controller}`',
    '`internal/post/{domain,repository,service,controller}`',
    1,
)
conv = conv.replace(
    '**Canonical implementation; remaining contracts tracked below.** Flat Post facades and the old flat service bucket are retired.',
    '**Canonical implementation and domain model ownership converged.** Flat Post facades and the old flat service bucket are retired.',
    1,
)
conv = conv.replace(
    '`PostVersion.Status` references the current Post status type pending separate Post classification.',
    '`PostVersion.Status` references the Post-owned status contract under `internal/post/domain`.',
    1,
)
conv = conv.replace(
    '| `internal/domain` Agent/Workflow/Post models | Deliberate model migration boundary, not automatically a facade | Multiple capabilities | Classify each remaining model as capability-owned, shared kernel, cross-capability contract or transport DTO before moving. Never move solely for directory symmetry. |',
    '| `internal/domain` Agent/Workflow models | Deliberate model migration boundary, not automatically a facade | Multiple capabilities | Classify each remaining model as capability-owned, shared kernel, cross-capability contract or transport DTO before moving. Post-owned models are retired from this boundary. Never move solely for directory symmetry. |',
    1,
)
conv = conv.replace(
    '- **C — intentionally shared pending model-boundary decision:** remaining root `internal/domain` Agent/Workflow/Post types with real cross-capability consumers. Page has been classified as capability-owned and its root aliases are retired. Remaining models must not be duplicated or moved just to empty the directory.',
    '- **C — intentionally shared pending model-boundary decision:** remaining root `internal/domain` Agent/Workflow types with real cross-capability consumers. Page and Post have been classified as capability-owned and their root aliases are retired. Remaining models must not be duplicated or moved just to empty the directory.',
    1,
)
conv = conv.replace(
    '2. **Shared-model classification:** Page is complete; classify remaining Agent/Workflow/Post root models only where a real capability/shared-kernel/contract decision is needed; never move them for directory symmetry.',
    '2. **Shared-model classification:** Page and Post are complete; classify remaining Agent/Workflow root models only where a real capability/shared-kernel/contract decision is needed; never move them for directory symmetry.',
    1,
)
conv = conv.replace(
    'and **PostVersion domain model ownership** now use canonical ownership boundaries',
    'and **PostVersion domain model ownership**, and **Post domain model ownership** now use canonical ownership boundaries',
    1,
)
conv = conv.replace(
    '- PostVersion repository/service/coordinator/tests and Agent approval consume the capability-owned snapshot contract directly. `PostVersion.Status` still uses the current Post status type until Post ownership is classified in its own slice.',
    '- PostVersion repository/service/coordinator/tests and Agent approval consume the capability-owned snapshot contract directly. `PostVersion.Status` now uses the Post-owned status contract under `internal/post/domain`.',
    1,
)
conv = conv.replace(
    '- Analytics repository/service and Tool bindings consume the capability-owned read-model contract. `AnalyticsSummary.TopPosts` explicitly references the current Post model and will follow the Post owner only when that separate classification is proven.',
    '- Analytics repository/service and Tool bindings consume the capability-owned read-model contract. `AnalyticsSummary.TopPosts` references the Post-owned contract under `internal/post/domain`.',
    1,
)
marker = '### PostVersion domain model ownership — 2026-09-14\n'
assert marker in conv, "PostVersion ownership section marker missing"
post_section = '''### Post domain model ownership — 2026-09-14

- `internal/post/domain` owns `PostStatus`, `Post`, `PostSearchResult`, and `AdminPostFilter`; the historical `internal/domain/post.go` migration bucket is retired.
- Post repository/service/controller and cross-capability readers import the Post-owned leaf contract directly. This is contract ownership only; Post behavior remains in canonical Post service/repository/controller packages.
- `internal/post/domain/ownership_test.go` rejects redeclaration or future consumption of Post-owned symbols through root `internal/domain`.
- Access `PostPolicy` behavior, PostVersion restore transaction ownership, SQL, routes/responses, BFF behavior, and Connector behavior are unchanged.
- Root `internal/domain` remains only for separately classified Agent/Workflow model boundaries; Post is no longer part of that shared-model migration bucket.


'''
conv = conv.replace(marker, post_section + marker, 1)
conv_path.write_text(conv)
