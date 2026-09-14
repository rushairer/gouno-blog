from pathlib import Path
import re

root = Path(__file__).resolve().parents[2]
backend = root / "blog-backend"
internal = backend / "internal"
root_domain = internal / "domain"
postversion_domain = internal / "postversion" / "domain"
postversion_domain.mkdir(parents=True, exist_ok=True)

version_block = '''type PostVersion struct {
\tID             int64      `json:"id"`
\tPostID         int64      `json:"post_id"`
\tTitle          string     `json:"title"`
\tSlug           string     `json:"slug"`
\tSummary        string     `json:"summary"`
\tContent        string     `json:"content,omitempty"`
\tTags           []string   `json:"tags"`
\tCategoryID     *int64     `json:"category_id,omitempty"`
\tCoverURL       string     `json:"cover_url,omitempty"`
\tCoverAlt       string     `json:"cover_alt,omitempty"`
\tSEOTitle       string     `json:"seo_title,omitempty"`
\tSEODescription string     `json:"seo_description,omitempty"`
\tStatus         PostStatus `json:"status"`
\tPublishedAt    *time.Time `json:"published_at,omitempty"`
\tScheduledAt    *time.Time `json:"scheduled_at,omitempty"`
\tCreatedAt      time.Time  `json:"created_at"`
}
'''

post_path = root_domain / "post.go"
post_text = post_path.read_text()
assert version_block in post_text
post_text = post_text.replace("\n" + version_block, "", 1)
post_path.write_text(post_text)

model_path = postversion_domain / "model.go"
assert not model_path.exists()
model_path.write_text(
    'package domain\n\nimport (\n\t"time"\n\n\trootdomain "github.com/rushairer/blog-backend/internal/domain"\n)\n\n'
    + version_block.replace('Status         PostStatus', 'Status         rootdomain.PostStatus')
)

root_import = '\t"github.com/rushairer/blog-backend/internal/domain"\n'
version_import = '\tpostversiondomain "github.com/rushairer/blog-backend/internal/postversion/domain"\n'
root_selector = re.compile(r"(?<![A-Za-z0-9_])domain\.")
pattern = re.compile(r"(?<![A-Za-z0-9_])domain\.PostVersion\b")
migrated = []
for path in sorted(internal.rglob("*.go")):
    if path.is_relative_to(postversion_domain):
        continue
    text = path.read_text()
    text, count = pattern.subn("postversiondomain.PostVersion", text)
    if count == 0:
        continue
    if "internal/postversion/domain" not in text:
        if root_import in text:
            text = text.replace(root_import, root_import + version_import, 1)
        else:
            marker = "import (\n"
            assert marker in text, path
            text = text.replace(marker, marker + version_import, 1)
    if root_import in text and not root_selector.search(text):
        text = text.replace(root_import, "", 1)
    path.write_text(text)
    migrated.append(str(path.relative_to(root)))

assert migrated, "expected PostVersion consumers"
print("Migrated PostVersion consumers:")
print("\n".join(migrated))

(postversion_domain / "ownership_test.go").write_text(r'''package domain_test

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

func TestRootPostVersionModelStaysRetired(t *testing.T) {
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
			if ok && typeSpec.Name.Name == "PostVersion" {
				t.Errorf("root internal/domain/post.go still declares PostVersion-owned type PostVersion")
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
					t.Errorf("%s dot-imports root internal/domain; PostVersion ownership cannot be proven", path)
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
			if !ok || selector.Sel.Name != "PostVersion" {
				return true
			}
			ident, ok := selector.X.(*ast.Ident)
			if !ok {
				return true
			}
			if _, ok := rootAliases[ident.Name]; ok {
				t.Errorf("%s consumes PostVersion through root internal/domain; import internal/postversion/domain instead", path)
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
old = '`Category` and `TagSummary` are Taxonomy-owned values under `internal/taxonomy/domain`; their former declarations in the root content-model bucket are retired after consumer proof. Remaining root content models such as `domain.Post` and `domain.PostVersion` are not moved merely for directory symmetry. Their model boundary must be decided from actual ownership and cross-capability usage before any later relocation.'
new = '`Category` and `TagSummary` are Taxonomy-owned values under `internal/taxonomy/domain`; their former declarations in the root content-model bucket are retired after consumer proof. `PostVersion` is likewise owned by `internal/postversion/domain`, while its `Status` field explicitly references the current root Post status type until Post ownership is classified separately. The remaining root Post model is not moved merely for directory symmetry; its boundary must be decided from actual ownership and cross-capability usage.'
assert old in arch
arch_path.write_text(arch.replace(old, new, 1))

conv_path = backend / "ARCHITECTURE_CONVERGENCE.md"
conv = conv_path.read_text()
old_row = '| **PostVersion** | Post version history/restore; `post_versions` | `internal/postversion/{repository,service,controller}` plus `internal/postversion.RestoreCoordinator` | Approval uses narrow `postVersionReader`; restore writes Post state only through the Post-owned `RestoreSnapshotTx` port. | `RestoreCoordinator` owns the atomic snapshot-read/Post-write transaction through `dbtx.Transactor`; repositories receive the caller transaction. | **Canonical implementation; restore ownership converged.** |'
new_row = '| **PostVersion** | Post version history/restore; `post_versions` | `internal/postversion/{domain,repository,service,controller}` plus `internal/postversion.RestoreCoordinator` | Approval uses narrow `postVersionReader`; restore writes Post state only through the Post-owned `RestoreSnapshotTx` port. `PostVersion.Status` references the current Post status type pending separate Post classification. | `RestoreCoordinator` owns the atomic snapshot-read/Post-write transaction through `dbtx.Transactor`; repositories receive the caller transaction. | **Canonical implementation, restore ownership, and domain model ownership converged.** |'
assert old_row in conv
conv = conv.replace(old_row, new_row, 1)
completed = 'and **Media domain model ownership** now use canonical ownership boundaries'
assert completed in conv
conv = conv.replace(completed, 'and **Media domain model ownership**, and **PostVersion domain model ownership** now use canonical ownership boundaries', 1)
anchor = '### Media domain model ownership — 2026-09-14\n'
assert anchor in conv
section = '''### PostVersion domain model ownership — 2026-09-14

- `internal/postversion/domain` owns the `PostVersion` snapshot value; the historical declaration is removed from `internal/domain/post.go`.
- PostVersion repository/service/coordinator/tests and Agent approval consume the capability-owned snapshot contract directly. `PostVersion.Status` still uses the current Post status type until Post ownership is classified in its own slice.
- `internal/postversion/domain/ownership_test.go` rejects redeclaration or future consumption of `PostVersion` through root `internal/domain`.
- Restore transaction ownership is unchanged: `RestoreCoordinator` still owns the same `dbtx.Transactor` scope, PostVersion repository remains read-only for restore, and Post-owned state is written only through `RestoreSnapshotTx`.
- Routes, persistence SQL, Access/BFF, and Connector behavior are unchanged.


'''
conv_path.write_text(conv.replace(anchor, section + anchor, 1))

print("postversion domain ownership migration applied")
