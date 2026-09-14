from pathlib import Path
import re

root = Path(__file__).resolve().parents[2]
backend = root / "blog-backend"
internal = backend / "internal"
root_domain = internal / "domain"
taxonomy_domain = internal / "taxonomy" / "domain"
taxonomy_domain.mkdir(parents=True, exist_ok=True)

category_block = '''type Category struct {
\tID          int64     `json:"id"`
\tName        string    `json:"name"`
\tSlug        string    `json:"slug"`
\tDescription string    `json:"description"`
\tSortOrder   int       `json:"sort_order"`
\tPostCount   int64     `json:"post_count"`
\tCreatedAt   time.Time `json:"created_at"`
\tUpdatedAt   time.Time `json:"updated_at"`
}
'''

tag_block = '''type TagSummary struct {
\tName      string `json:"name"`
\tPostCount int64  `json:"post_count"`
}
'''

post_path = root_domain / "post.go"
post_text = post_path.read_text()
assert category_block in post_text
assert tag_block in post_text
post_text = post_text.replace("\n" + category_block, "", 1)
post_text = post_text.replace("\n" + tag_block, "", 1)
post_path.write_text(post_text)

model_path = taxonomy_domain / "model.go"
assert not model_path.exists()
model_path.write_text('package domain\n\nimport "time"\n\n' + category_block + '\n' + tag_block)

symbols = ("Category", "TagSummary")
root_import = '\t"github.com/rushairer/blog-backend/internal/domain"\n'
taxonomy_import = '\ttaxonomydomain "github.com/rushairer/blog-backend/internal/taxonomy/domain"\n'
root_selector = re.compile(r"(?<![A-Za-z0-9_])domain\.")

for path in sorted((internal / "taxonomy").rglob("*.go")):
    if path.is_relative_to(taxonomy_domain):
        continue
    text = path.read_text()
    changed = False
    for symbol in symbols:
        pattern = re.compile(rf"(?<![A-Za-z0-9_])domain\.{symbol}\b")
        text, count = pattern.subn(f"taxonomydomain.{symbol}", text)
        changed = changed or count > 0
    if not changed:
        continue
    if "internal/taxonomy/domain" not in text:
        if root_import in text:
            text = text.replace(root_import, root_import + taxonomy_import, 1)
        else:
            marker = "import (\n"
            assert marker in text, path
            text = text.replace(marker, marker + taxonomy_import, 1)
    if root_import in text and not root_selector.search(text):
        text = text.replace(root_import, "", 1)
    path.write_text(text)

ownership_path = taxonomy_domain / "ownership_test.go"
ownership_path.write_text(r'''package domain_test

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

var taxonomySymbols = map[string]struct{}{
	"Category":   {},
	"TagSummary": {},
}

func TestRootTaxonomyModelsStayRetired(t *testing.T) {
	rootPost := filepath.Clean("../../domain/post.go")
	fset := token.NewFileSet()
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
			if _, forbidden := taxonomySymbols[typeSpec.Name.Name]; forbidden {
				t.Errorf("root internal/domain/post.go still declares Taxonomy-owned type %s", typeSpec.Name.Name)
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
					t.Errorf("%s dot-imports root internal/domain; Taxonomy ownership cannot be proven", path)
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
			if _, forbidden := taxonomySymbols[selector.Sel.Name]; forbidden {
				t.Errorf("%s consumes Taxonomy-owned symbol %s.%s through root internal/domain; import internal/taxonomy/domain instead", path, ident.Name, selector.Sel.Name)
			}
			return true
		})
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}

	if _, err := os.Stat("model.go"); err != nil {
		t.Fatalf("Taxonomy model owner file missing: %v", err)
	}
}
''')

arch_path = backend / "ARCHITECTURE.md"
arch = arch_path.read_text()
old = 'Root content models such as `domain.Category`, `domain.TagSummary`, `domain.Post`, and `domain.PostVersion` are not moved merely for directory symmetry. Their model boundary must be decided from actual ownership and cross-capability usage before any later relocation.'
new = '`Category` and `TagSummary` are Taxonomy-owned values under `internal/taxonomy/domain`; their former declarations in the root content-model bucket are retired after consumer proof. Remaining root content models such as `domain.Post` and `domain.PostVersion` are not moved merely for directory symmetry. Their model boundary must be decided from actual ownership and cross-capability usage before any later relocation.'
assert old in arch
arch_path.write_text(arch.replace(old, new, 1))

conv_path = backend / "ARCHITECTURE_CONVERGENCE.md"
conv = conv_path.read_text()
old_row = '| **Taxonomy** | Categories, Tags and taxonomy relationships; `categories`, `tags`, association writes | `internal/taxonomy/{repository,service,controller}` | Post/feed consumers use canonical taxonomy API. | Taxonomy service/repository. | **Canonical implementation; remaining contracts tracked below.** |'
new_row = '| **Taxonomy** | Categories, Tags and taxonomy relationships; `categories`, `tags`, association writes | `internal/taxonomy/{domain,repository,service,controller}` | Post/feed consumers use canonical taxonomy API. `Category` and `TagSummary` values are capability-owned. | Taxonomy service/repository. | **Canonical implementation and domain model ownership converged.** |'
assert old_row in conv
conv = conv.replace(old_row, new_row, 1)
completed = 'and **Operations domain model ownership convergence** now use canonical ownership boundaries'
assert completed in conv
conv = conv.replace(completed, 'and **Operations domain model ownership convergence**, and **Taxonomy domain model ownership** now use canonical ownership boundaries', 1)
anchor = '### Operations domain model ownership convergence — 2026-09-14\n'
assert anchor in conv
section = '''### Taxonomy domain model ownership — 2026-09-14

- `internal/taxonomy/domain` owns `Category` and `TagSummary`; the historical declarations are removed from `internal/domain/post.go`.
- Taxonomy repository/service/tests consume those values directly from their capability-owned leaf package. No cross-capability consumer requires the root aliases.
- `internal/taxonomy/domain/ownership_test.go` rejects redeclaration or future consumption of `Category` / `TagSummary` through root `internal/domain`.
- Post models, PostVersion, Media, Analytics, Access/BFF, and Connector behavior are unchanged in this slice.


'''
conv_path.write_text(conv.replace(anchor, section + anchor, 1))

print("taxonomy domain model ownership migration applied")
