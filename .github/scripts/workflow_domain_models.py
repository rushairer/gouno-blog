from pathlib import Path
import re

root = Path(__file__).resolve().parents[2]
backend = root / "blog-backend"
root_domain = backend / "internal" / "domain"
workflow_domain = backend / "internal" / "workflow" / "domain"
workflow_domain.mkdir(parents=True, exist_ok=True)

root_workflow = root_domain / "workflow.go"
assert root_workflow.exists(), "expected historical internal/domain/workflow.go"
model_text = root_workflow.read_text()
required = [
    "type WorkflowStep struct",
    "type WorkflowScopePolicy struct",
    "type WorkflowEventTrigger struct",
    "type Workflow struct",
    "type WorkflowResource struct",
    "type ResourceOption struct",
    "type ResourceQuery struct",
    "type WorkflowDispatchEvent struct",
    "type WorkflowScheduleClaim struct",
    "type WorkflowRun struct",
    "type WorkflowStepRun struct",
    "type WorkflowInteractionStatus string",
    "type WorkflowInteractionTask struct",
    "type WorkflowRunEvent struct",
]
for needle in required:
    assert needle in model_text, f"missing expected Workflow model: {needle}"

model_path = workflow_domain / "model.go"
assert not model_path.exists(), "workflow/domain/model.go already exists"
model_path.write_text(model_text)
root_workflow.unlink()

root_import_path = "github.com/rushairer/blog-backend/internal/domain"
workflow_import_path = "github.com/rushairer/blog-backend/internal/workflow/domain"
retired_symbols = [
    "WorkflowInteractionStatus",
    "WorkflowInteractionTask",
    "WorkflowScheduleClaim",
    "WorkflowDispatchEvent",
    "WorkflowScopePolicy",
    "WorkflowEventTrigger",
    "WorkflowRunEvent",
    "WorkflowStepRun",
    "WorkflowResource",
    "WorkflowStep",
    "WorkflowRun",
    "Workflow",
    "ResourceOption",
    "ResourceQuery",
    "InteractionPending",
    "InteractionResolved",
    "InteractionCancelled",
    "InteractionExpired",
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


def add_workflow_import(text: str) -> str:
    if workflow_import_path in text:
        return text
    spec = f'\tworkflowdomain "{workflow_import_path}"\n'
    if "import (\n" in text:
        return text.replace("import (\n", "import (\n" + spec, 1)
    single = re.search(
        r'(?m)^import[ \t]+(?P<spec>(?:(?:[A-Za-z_][A-Za-z0-9_]*)[ \t]+)?"[^"]+")[ \t]*$',
        text,
    )
    if single:
        existing = single.group("spec")
        block = "import (\n\t" + existing + "\n" + spec + ")"
        return text[: single.start()] + block + text[single.end() :]
    raise AssertionError("cannot add Workflow domain import")


def root_import_alias(text: str):
    match = block_import_re.search(text) or single_import_re.search(text)
    if not match:
        return None
    alias = match.groupdict().get("alias") or "domain"
    if alias in {".", "_"}:
        raise AssertionError("root internal/domain dot/blank import is not supported")
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
    if path.is_relative_to(workflow_domain):
        continue
    text = path.read_text()
    alias = root_import_alias(text)
    if not alias:
        continue
    selector_re = re.compile(
        r"(?<![A-Za-z0-9_])" + re.escape(alias) + r"\.(" + selector_names + r")\b"
    )
    text, count = selector_re.subn(lambda match: "workflowdomain." + match.group(1), text)
    if count == 0:
        continue
    text = add_workflow_import(text)
    text = remove_root_import_if_unused(text, alias)
    path.write_text(text)
    migrated.append(str(path.relative_to(root)))

assert migrated, "expected root Workflow model consumers"
print("Migrated Workflow model consumers:")
print("\n".join(migrated))

symbol_entries = "\n".join(f'\t"{symbol}": {{}},' for symbol in retired_symbols)
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

var retiredWorkflowSymbols = map[string]struct{}{
SYMBOL_ENTRIES
}

func TestRootWorkflowModelsStayRetired(t *testing.T) {
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
					if _, retired := retiredWorkflowSymbols[typed.Name.Name]; retired {
						t.Errorf("%s redeclares Workflow-owned symbol %s in root internal/domain", path, typed.Name.Name)
					}
				case *ast.ValueSpec:
					for _, name := range typed.Names {
						if _, retired := retiredWorkflowSymbols[name.Name]; retired {
							t.Errorf("%s redeclares Workflow-owned symbol %s in root internal/domain", path, name.Name)
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
					t.Errorf("%s dot-imports root internal/domain; Workflow ownership cannot be proven", path)
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
			if _, retired := retiredWorkflowSymbols[selector.Sel.Name]; !retired {
				return true
			}
			ident, ok := selector.X.(*ast.Ident)
			if !ok {
				return true
			}
			if _, rootAlias := rootAliases[ident.Name]; rootAlias {
				t.Errorf("%s consumes Workflow-owned symbol %s through root internal/domain; import internal/workflow/domain instead", path, selector.Sel.Name)
			}
			return true
		})
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
}
'''.replace("SYMBOL_ENTRIES", symbol_entries)
(workflow_domain / "ownership_test.go").write_text(ownership)

arch_path = backend / "ARCHITECTURE.md"
arch = arch_path.read_text()
post_sentence = '`PostStatus`, `Post`, `PostSearchResult`, and `AdminPostFilter` are Post-owned values under `internal/post/domain`; their historical root declarations are retired after repository-wide consumer proof. Cross-capability readers import the leaf Post domain contract directly rather than treating root `internal/domain` as a shared kernel.'
assert post_sentence in arch, "Post ownership paragraph drifted"
workflow_sentence = ' Workflow definitions, scope/event configuration, run/step/resource snapshots, dispatch claims, interactions, and run events are Workflow-owned values under `internal/workflow/domain`; the historical root `internal/domain/workflow.go` bucket is retired after repository-wide consumer proof. Agent, Workflow planner, Starter Pack, and other consumers import that leaf contract directly.'
arch = arch.replace(post_sentence, post_sentence + workflow_sentence, 1)
arch_path.write_text(arch)

conv_path = backend / "ARCHITECTURE_CONVERGENCE.md"
conv = conv_path.read_text()
conv = conv.replace(
    '| **Workflow** | Workflow definitions/versions/runs/steps/resources/events/interactions; `ai_workflows`, `ai_workflow_versions`, `ai_workflow_runs`, `ai_workflow_step_runs`, `ai_workflow_run_resources`, `ai_workflow_events`, `workflow_interaction_tasks`, `workflow_run_events` | `internal/workflow`, `internal/workflow/repository` |',
    '| **Workflow** | Workflow definitions/versions/runs/steps/resources/events/interactions; `ai_workflows`, `ai_workflow_versions`, `ai_workflow_runs`, `ai_workflow_step_runs`, `ai_workflow_run_resources`, `ai_workflow_events`, `workflow_interaction_tasks`, `workflow_run_events` | `internal/workflow` plus `internal/workflow/{domain,repository,controller}` |',
    1,
)
conv = conv.replace(
    '**Definition/version, lifecycle, MediaCandidate boundary, Run admission/retry/recovery, dispatch claiming, execution checkpoint persistence, read-model classification, and HTTP ownership are converged.**',
    '**Definition/version, lifecycle, MediaCandidate boundary, Run admission/retry/recovery, dispatch claiming, execution checkpoint persistence, read-model classification, HTTP ownership, and domain model ownership are converged.**',
    1,
)
conv = conv.replace(
    '| `internal/domain` Agent/Workflow models | Deliberate model migration boundary, not automatically a facade | Multiple capabilities | Classify each remaining model as capability-owned, shared kernel, cross-capability contract or transport DTO before moving. Post-owned models are retired from this boundary. Never move solely for directory symmetry. |',
    '| `internal/domain` Agent models | Deliberate model migration boundary, not automatically a facade | Agent plus Provider/Knowledge/Workflow consumers | Classify the remaining mixed Agent/Provider/Knowledge model bucket into real owners before moving. Workflow/Post-owned models are retired from this boundary. Never move solely for directory symmetry. |',
    1,
)
conv = conv.replace(
    '- **C — intentionally shared pending model-boundary decision:** remaining root `internal/domain` Agent/Workflow types with real cross-capability consumers. Page and Post have been classified as capability-owned and their root aliases are retired. Remaining models must not be duplicated or moved just to empty the directory.',
    '- **C — intentionally shared pending model-boundary decision:** remaining root `internal/domain` Agent/Provider/Knowledge mixed models with real cross-capability consumers. Page, Post, and Workflow have been classified as capability-owned and their root aliases are retired. Remaining models must not be duplicated or moved just to empty the directory.',
    1,
)
conv = conv.replace(
    '2. **Shared-model classification:** Page and Post are complete; classify remaining Agent/Workflow root models only where a real capability/shared-kernel/contract decision is needed; never move them for directory symmetry.',
    '2. **Shared-model classification:** Page, Post, and Workflow are complete; classify the remaining mixed Agent/Provider/Knowledge root models only where a real capability/shared-kernel/contract decision is needed; never move them for directory symmetry.',
    1,
)
conv = conv.replace(
    'and **Post domain model ownership** now use canonical ownership boundaries',
    'and **Post domain model ownership**, and **Workflow domain model ownership** now use canonical ownership boundaries',
    1,
)
conv = conv.replace(
    '- Root `internal/domain` remains only for separately classified Agent/Workflow model boundaries; Post is no longer part of that shared-model migration bucket.',
    '- Root `internal/domain` remains only for the separately classified mixed Agent/Provider/Knowledge model boundary; Post and Workflow are no longer part of that shared-model migration bucket.',
    1,
)
marker = '### Post domain model ownership — 2026-09-14\n'
assert marker in conv, "Post domain ownership section missing"
workflow_section = '''### Workflow domain model ownership — 2026-09-14

- `internal/workflow/domain` owns Workflow definitions, scope/event policy values, resources/query options, dispatch/schedule claims, Run/Step snapshots, interaction status/tasks, and run events; the historical `internal/domain/workflow.go` migration bucket is retired.
- Workflow service/coordinators/repositories/controllers and cross-capability Agent/planner/Starter Pack consumers import the Workflow-owned leaf contract directly.
- `internal/workflow/domain/ownership_test.go` rejects redeclaration or future consumption of Workflow-owned symbols through root `internal/domain`.
- This slice changes contract ownership only: Workflow SQL, transaction/coordinator ownership, webhook/HTTP behavior, Agent approval/media orchestration, Auth BFF, Connector, and middleware behavior are unchanged.
- Root `internal/domain` is now the remaining mixed Agent/Provider/Knowledge model-classification bucket only.


'''
conv = conv.replace(marker, workflow_section + marker, 1)
conv_path.write_text(conv)
