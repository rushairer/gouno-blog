from pathlib import Path
import re

root = Path(__file__).resolve().parents[2]
backend = root / "blog-backend"
internal = backend / "internal"
root_domain = internal / "domain"
analytics_domain = internal / "analytics" / "domain"
analytics_domain.mkdir(parents=True, exist_ok=True)

summary_block = '''type AnalyticsSummary struct {
\tTotalPosts      int64             `json:"total_posts"`
\tPublishedPosts  int64             `json:"published_posts"`
\tTotalViews      int64             `json:"total_views"`
\tTotalLikes      int64             `json:"total_likes"`
\tTotalComments   int64             `json:"total_comments"`
\tPendingComments int64             `json:"pending_comments"`
\tReportedItems   int64             `json:"reported_items"`
\tTopPosts        []*Post           `json:"top_posts"`
\tDailyEvents     []DailyEventCount `json:"daily_events"`
\tAIAlerts        []SystemAlert     `json:"ai_alerts"`
}
'''
alert_block = '''type SystemAlert struct {
\tID        int64     `json:"id"`
\tType      string    `json:"type"`
\tTitle     string    `json:"title"`
\tBody      string    `json:"body"`
\tHref      string    `json:"href"`
\tCreatedAt time.Time `json:"created_at"`
}
'''
daily_block = '''type DailyEventCount struct {
\tDate  string `json:"date"`
\tCount int64  `json:"count"`
}
'''

post_path = root_domain / "post.go"
text = post_path.read_text()
for block in (summary_block, alert_block, daily_block):
    assert block in text
    text = text.replace("\n" + block, "", 1)
post_path.write_text(text)

model = summary_block.replace("[]*Post", "[]*rootdomain.Post")
# The source uses []*Post (not []* Post); keep the assertion explicit.
if model == summary_block:
    model = summary_block.replace("*Post", "*rootdomain.Post")
assert "*rootdomain.Post" in model
(analytics_domain / "model.go").write_text(
    'package domain\n\nimport (\n\t"time"\n\n\trootdomain "github.com/rushairer/blog-backend/internal/domain"\n)\n\n'
    + model + '\n' + alert_block + '\n' + daily_block
)

symbols = ("AnalyticsSummary", "SystemAlert", "DailyEventCount")
root_import = '\t"github.com/rushairer/blog-backend/internal/domain"\n'
analytics_import = '\tanalyticsdomain "github.com/rushairer/blog-backend/internal/analytics/domain"\n'
root_selector = re.compile(r"(?<![A-Za-z0-9_])domain\.")

for path in sorted(internal.rglob("*.go")):
    if path.is_relative_to(analytics_domain):
        continue
    source = path.read_text()
    changed = False
    for symbol in symbols:
        pattern = re.compile(rf"(?<![A-Za-z0-9_])domain\.{symbol}\b")
        source, count = pattern.subn(f"analyticsdomain.{symbol}", source)
        changed = changed or count > 0
    if not changed:
        continue
    if "internal/analytics/domain" not in source:
        if root_import in source:
            source = source.replace(root_import, root_import + analytics_import, 1)
        else:
            marker = "import (\n"
            assert marker in source, path
            source = source.replace(marker, marker + analytics_import, 1)
    if root_import in source and not root_selector.search(source):
        source = source.replace(root_import, "", 1)
    path.write_text(source)

(analytics_domain / "ownership_test.go").write_text(r'''package domain_test

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

var analyticsSymbols = map[string]struct{}{
	"AnalyticsSummary": {},
	"SystemAlert":      {},
	"DailyEventCount":  {},
}

func TestRootAnalyticsReadModelsStayRetired(t *testing.T) {
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
			if _, forbidden := analyticsSymbols[typeSpec.Name.Name]; forbidden {
				t.Errorf("root internal/domain/post.go still declares Analytics-owned type %s", typeSpec.Name.Name)
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
					t.Errorf("%s dot-imports root internal/domain; Analytics ownership cannot be proven", path)
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
			if _, forbidden := analyticsSymbols[selector.Sel.Name]; forbidden {
				t.Errorf("%s consumes Analytics-owned symbol %s.%s through root internal/domain; import internal/analytics/domain instead", path, ident.Name, selector.Sel.Name)
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
anchor = "Recommendation persistence, business behavior, and active HTTP ownership are fully canonical under `internal/recommendation/{repository,service,controller}`."
assert anchor in arch
addition = '''Analytics read-model values are capability-owned under `internal/analytics/domain`: `AnalyticsSummary`, `SystemAlert`, and `DailyEventCount`. The summary remains a cross-capability projection and its `TopPosts` field explicitly references the current root Post model until Post model ownership is classified separately. Tool consumers import the Analytics read-model contract rather than root `internal/domain`.

'''
assert addition not in arch
arch_path.write_text(arch.replace(anchor, addition + anchor, 1))

conv_path = backend / "ARCHITECTURE_CONVERGENCE.md"
conv = conv_path.read_text()
old_row = '| **Analytics** | Analytics events and summary read model; `analytics_events` | `internal/analytics/{repository,service,controller}` | Cross-capability read model; Tool binds directly to canonical Analytics service. | Analytics service/repository. | **Canonical implementation; remaining contracts tracked below.** |'
new_row = '| **Analytics** | Analytics events and summary read model; `analytics_events` | `internal/analytics/{domain,repository,service,controller}` | Cross-capability read model; Tool binds directly to canonical Analytics service and imports the Analytics-owned summary contract. | Analytics service/repository. | **Canonical implementation and read-model ownership converged.** |'
assert old_row in conv
conv = conv.replace(old_row, new_row, 1)
completed = 'and **Taxonomy domain model ownership** now use canonical ownership boundaries'
assert completed in conv
conv = conv.replace(completed, 'and **Taxonomy domain model ownership**, and **Analytics read-model ownership** now use canonical ownership boundaries', 1)
anchor = '### Taxonomy domain model ownership — 2026-09-14\n'
assert anchor in conv
section = '''### Analytics read-model ownership — 2026-09-14

- `internal/analytics/domain` owns `AnalyticsSummary`, `SystemAlert`, and `DailyEventCount`; the historical declarations are removed from `internal/domain/post.go`.
- Analytics repository/service and Tool bindings consume the capability-owned read-model contract. `AnalyticsSummary.TopPosts` explicitly references the current Post model and will follow the Post owner only when that separate classification is proven.
- `internal/analytics/domain/ownership_test.go` rejects redeclaration or future consumption of Analytics-owned read-model symbols through root `internal/domain`.
- Analytics SQL projections, notification reads, route/response behavior, Access/BFF, and Connector behavior are unchanged.


'''
conv_path.write_text(conv.replace(anchor, section + anchor, 1))

print("analytics read-model ownership migration applied")
