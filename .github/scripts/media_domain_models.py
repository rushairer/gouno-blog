from pathlib import Path
import re

root = Path(__file__).resolve().parents[2]
backend = root / "blog-backend"
internal = backend / "internal"
root_domain = internal / "domain"
media_domain = internal / "media" / "domain"
media_domain.mkdir(parents=True, exist_ok=True)

asset_block = '''type MediaAsset struct {
\tID                   int64     `json:"id"`
\tFilename             string    `json:"filename"`
\tStorageName          string    `json:"-"`
\tURL                  string    `json:"url"`
\tContentType          string    `json:"content_type"`
\tSizeBytes            int64     `json:"size_bytes"`
\tAltText              string    `json:"alt_text"`
\tCreatedByPrincipalID *int64    `json:"created_by_principal_id,omitempty"`
\tUpdatedByPrincipalID *int64    `json:"updated_by_principal_id,omitempty"`
\tCreatedAt            time.Time `json:"created_at"`
\tUsageCount           int64     `json:"usage_count"`
}
'''
filter_block = '''type MediaFilter struct {
\tCreatedByPrincipalID *int64
}
'''
reference_block = '''type MediaReference struct {
\tPostID    int64  `json:"post_id"`
\tPostTitle string `json:"post_title"`
\tPostSlug  string `json:"post_slug"`
}
'''

post_path = root_domain / "post.go"
post_text = post_path.read_text()
for block in (asset_block, filter_block, reference_block):
    assert block in post_text, block.splitlines()[0]
    post_text = post_text.replace("\n" + block, "", 1)
post_path.write_text(post_text)

model_path = media_domain / "model.go"
assert not model_path.exists()
model_path.write_text('package domain\n\nimport "time"\n\n' + asset_block + '\n' + filter_block + '\n' + reference_block)

symbols = ("MediaAsset", "MediaFilter", "MediaReference")
root_import = '\t"github.com/rushairer/blog-backend/internal/domain"\n'
media_import = '\tmediadomain "github.com/rushairer/blog-backend/internal/media/domain"\n'
root_selector = re.compile(r"(?<![A-Za-z0-9_])domain\.")

migrated = []
for path in sorted(internal.rglob("*.go")):
    if path.is_relative_to(media_domain):
        continue
    text = path.read_text()
    changed = False
    for symbol in symbols:
        pattern = re.compile(rf"(?<![A-Za-z0-9_])domain\.{re.escape(symbol)}\b")
        text, count = pattern.subn(f"mediadomain.{symbol}", text)
        changed = changed or count > 0
    if not changed:
        continue
    if "internal/media/domain" not in text:
        if root_import in text:
            text = text.replace(root_import, root_import + media_import, 1)
        else:
            marker = "import (\n"
            assert marker in text, path
            text = text.replace(marker, marker + media_import, 1)
    if root_import in text and not root_selector.search(text):
        text = text.replace(root_import, "", 1)
    path.write_text(text)
    migrated.append(str(path.relative_to(root)))

assert migrated, "expected Media model consumers"
print("Migrated Media consumers:")
print("\n".join(migrated))

(media_domain / "ownership_test.go").write_text(r'''package domain_test

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

var mediaSymbols = map[string]struct{}{
	"MediaAsset":     {},
	"MediaFilter":    {},
	"MediaReference": {},
}

func TestRootMediaModelsStayRetired(t *testing.T) {
	fset := token.NewFileSet()
	rootPost := filepath.Clean("../../domain/post.go")
	file, err := parser.ParseFile(fset, rootPost, nil, 0)
	if err != nil {
		t.Fatal(err)
	}
	for _, decl := range file.Decls {
		gen, ok := decl.(*ast.GenDecl)
		if !ok {
			continue
		}
		for _, spec := range gen.Specs {
			typeSpec, ok := spec.(*ast.TypeSpec)
			if !ok {
				continue
			}
			if _, forbidden := mediaSymbols[typeSpec.Name.Name]; forbidden {
				t.Errorf("root internal/domain/post.go still declares Media-owned type %s", typeSpec.Name.Name)
			}
		}
	}

	internalRoot := filepath.Clean("../..")
	err = filepath.WalkDir(internalRoot, func(path string, entry fs.DirEntry, walkErr error) error {
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
					t.Errorf("%s dot-imports root internal/domain; Media ownership cannot be proven", path)
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
			ident, ok := selector.X.(*ast.Ident)
			if !ok {
				return true
			}
			if _, ok := rootAliases[ident.Name]; !ok {
				return true
			}
			if _, forbidden := mediaSymbols[selector.Sel.Name]; forbidden {
				t.Errorf("%s consumes Media-owned symbol %s.%s through root internal/domain; import internal/media/domain instead", path, ident.Name, selector.Sel.Name)
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

arch_path = backend / "ARCHITECTURE.md"
arch = arch_path.read_text()
old = 'Media-asset persistence, business behavior, and HTTP ownership are fully canonical under `internal/media/{repository,service,controller}`. Active Media routes use the canonical controller/service, SVG upload security lives with that HTTP adapter, shared HTTP error mapping recognizes canonical Media sentinels, and Agent generation/approval depend on narrow Media create/list contracts.'
new = 'Media-asset domain values, persistence, business behavior, and HTTP ownership are fully canonical under `internal/media/{domain,repository,service,controller}`. `MediaAsset`, `MediaFilter`, and `MediaReference` are Media-owned contracts; Access policy and Agent/Operations consumers import that leaf domain package without importing Media service behavior. Active Media routes use the canonical controller/service, SVG upload security lives with that HTTP adapter, shared HTTP error mapping recognizes canonical Media sentinels, and Agent generation/approval depend on narrow Media create/list contracts.'
assert old in arch
arch_path.write_text(arch.replace(old, new, 1))

conv_path = backend / "ARCHITECTURE_CONVERGENCE.md"
conv = conv_path.read_text()
old_row = '| **Media** | Media assets; `media_assets` | `internal/media/{repository,service,controller}` | Agent generation/approval uses narrow Media contracts. | Media repository/service. | **Canonical implementation; remaining contracts tracked below.** |'
new_row = '| **Media** | Media assets; `media_assets` | `internal/media/{domain,repository,service,controller}` | Access policy and Agent/Operations consumers use Media-owned value contracts; Agent generation/approval uses narrow Media behavior contracts. | Media repository/service. | **Canonical implementation and domain model ownership converged.** |'
assert old_row in conv
conv = conv.replace(old_row, new_row, 1)
completed = 'and **Analytics read-model ownership** now use canonical ownership boundaries'
assert completed in conv
conv = conv.replace(completed, 'and **Analytics read-model ownership**, and **Media domain model ownership** now use canonical ownership boundaries', 1)
anchor = '### Analytics read-model ownership — 2026-09-14\n'
assert anchor in conv
section = '''### Media domain model ownership — 2026-09-14

- `internal/media/domain` owns `MediaAsset`, `MediaFilter`, and `MediaReference`; their historical declarations are removed from `internal/domain/post.go`.
- Media repository/service/controller, Access media policy, Agent generation/approval, and Operations consumers import Media-owned value contracts directly. No consumer needs a root-domain compatibility alias.
- Access authorization rules are unchanged; this slice changes only the concrete import/type owner used by the existing MediaPolicy signatures and tests.
- `internal/media/domain/ownership_test.go` rejects redeclaration or future consumption of Media-owned symbols through root `internal/domain`.
- Storage behavior, upload validation, SQL, routes/responses, BFF, and Connector behavior are unchanged.


'''
conv_path.write_text(conv.replace(anchor, section + anchor, 1))

print("media domain model ownership migration applied")
