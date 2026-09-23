import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import ts from "typescript";

const root = fileURLToPath(new URL("../src/", import.meta.url));
const adminRoot = path.join(root, "pages/admin");
const failures = [];

const corePages = [
  "Dashboard.tsx",
  "Posts.tsx",
  "Pages.tsx",
  "PostEditor.tsx",
  "PageEditor.tsx",
];
const collectionPages = new Set(["Dashboard.tsx", "Posts.tsx", "Pages.tsx"]);
const editorPages = new Set(["PostEditor.tsx", "PageEditor.tsx"]);

function sourceFile(name, source) {
  return ts.createSourceFile(
    name,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
}

function lineOf(file, node) {
  return file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1;
}

function jsxTag(node) {
  if (ts.isJsxElement(node)) return node.openingElement.tagName.getText();
  if (ts.isJsxSelfClosingElement(node)) return node.tagName.getText();
  return "";
}

function jsxAttributes(node) {
  return ts.isJsxElement(node)
    ? node.openingElement.attributes
    : node.attributes;
}

function hasAttribute(node, attributeName) {
  return jsxAttributes(node).properties.some(
    (item) => ts.isJsxAttribute(item) && item.name.text === attributeName,
  );
}

function staticAttribute(node, attributeName) {
  const attribute = jsxAttributes(node).properties.find(
    (item) => ts.isJsxAttribute(item) && item.name.text === attributeName,
  );
  if (!attribute || !ts.isJsxAttribute(attribute) || !attribute.initializer)
    return "";
  if (ts.isStringLiteral(attribute.initializer)) return attribute.initializer.text;
  if (
    ts.isJsxExpression(attribute.initializer) &&
    attribute.initializer.expression &&
    (ts.isStringLiteral(attribute.initializer.expression) ||
      ts.isNoSubstitutionTemplateLiteral(attribute.initializer.expression))
  )
    return attribute.initializer.expression.text;
  return "";
}

function staticClassName(node) {
  return staticAttribute(node, "className");
}

function isCanonicalAdminStack(node) {
  if (!ts.isJsxElement(node) || jsxTag(node) !== "div") return false;
  const classes = new Set(staticClassName(node).split(/\s+/));
  return classes.has("flex") && classes.has("flex-col") && classes.has("gap-6");
}

function firstMeaningfulChildIdentity(node) {
  if (!ts.isJsxElement(node)) return "";
  for (const child of node.children) {
    if (ts.isJsxText(child) && child.getText().trim() === "") continue;
    if (ts.isJsxElement(child) || ts.isJsxSelfClosingElement(child))
      return jsxTag(child);
    if (ts.isJsxExpression(child) && child.expression) {
      if (ts.isIdentifier(child.expression)) return child.expression.text;
      return "expression";
    }
  }
  return "";
}

function assertCollectionStack(name, source) {
  const file = sourceFile(name, source);
  let stackCount = 0;

  function visit(node) {
    if (ts.isReturnStatement(node) && node.expression) {
      let expression = node.expression;
      while (ts.isParenthesizedExpression(expression)) expression = expression.expression;
      if (isCanonicalAdminStack(expression)) {
        stackCount += 1;
        const first = firstMeaningfulChildIdentity(expression);
        if (first !== "PageHeader" && first !== "pageHeader") {
          failures.push(
            `${name}:${lineOf(file, expression)} Admin page stack must begin with PageHeader/pageHeader before feedback and task surfaces`,
          );
        }
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(file);
  if (stackCount === 0) {
    failures.push(`${name}: route render must expose a canonical flex flex-col gap-6 Admin page stack`);
  }
}

function assertCanonicalEditor(name, source) {
  const file = sourceFile(name, source);
  let shellCount = 0;
  let markdownCount = 0;
  let pickerCount = 0;
  let reviewCount = 0;
  let shellHasNavigator = false;

  function visit(node) {
    if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tag = jsxTag(node);
      if (tag === "DocumentEditorShell") {
        shellCount += 1;
        shellHasNavigator ||= hasAttribute(node, "navigator");
      }
      if (tag === "MarkdownEditor") markdownCount += 1;
      if (tag === "AISuggestionPicker" || tag === "AISuggestionReview") {
        if (tag === "AISuggestionPicker") pickerCount += 1;
        else reviewCount += 1;
        if (!hasAttribute(node, "onRegenerate")) {
          failures.push(
            `${name}:${lineOf(file, node)} ${tag} must bind onRegenerate to a fresh AI request`,
          );
        }
      }
      if (["ContentEditorFrame", "EditorCommandBar", "AiSuggestionControl"].includes(tag)) {
        failures.push(
          `${name}:${lineOf(file, node)} ${tag} is retired presentation; use canonical Gouno UI editor patterns`,
        );
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(file);

  if (shellCount !== 1)
    failures.push(`${name}: editor must render exactly one DocumentEditorShell`);
  if (!source.includes('data-pattern="dedicated-workspace-editor"'))
    failures.push(`${name}: editor must expose the manually reviewed dedicated-workspace-editor contract marker`);
  if (markdownCount !== 1)
    failures.push(`${name}: editor must render exactly one canonical MarkdownEditor`);
  if (pickerCount < 2)
    failures.push(`${name}: title and summary AI must use AISuggestionPicker`);
  if (reviewCount < 1)
    failures.push(`${name}: path/SEO AI must use AISuggestionReview`);
  if (name === "PostEditor.tsx" && !shellHasNavigator)
    failures.push(`${name}: post editor must provide its Outline/History navigator to DocumentEditorShell`);
  if (name === "PageEditor.tsx" && shellHasNavigator)
    failures.push(`${name}: page editor must not copy the post-only navigator`);
  if (!source.includes("renderPreview") || !source.includes("<MarkdownRenderer"))
    failures.push(`${name}: MarkdownEditor preview must stay bound to Blog's MarkdownRenderer`);
  if (!source.includes("EditorMediaSourceDialog"))
    failures.push(`${name}: editor media actions must bind the Blog-owned real media workflow`);
  if (/\bContentEditorFrame\b|\bEditorCommandBar\b/.test(source))
    failures.push(`${name}: retired local editor shell/command presentation must not remain imported or referenced`);
}

function assertCategorySlugPicker(source) {
  const name = "Categories.tsx";
  const file = sourceFile(name, source);
  let pickerCount = 0;

  function visit(node) {
    if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tag = jsxTag(node);
      if (tag === "AISuggestionPicker") {
        pickerCount += 1;
        if (!hasAttribute(node, "onRegenerate")) {
          failures.push(`${name}:${lineOf(file, node)} Slug AISuggestionPicker must support regeneration`);
        }
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(file);
  if (pickerCount < 1) failures.push(`${name}: category Slug AI must use AISuggestionPicker`);
  if (!source.includes('aria-label="AI 生成 Slug 建议"'))
    failures.push(`${name}: category Slug field must expose the icon-only Sparkles AI trigger`);
  if (!source.includes('applyLabel="使用所选 Slug"'))
    failures.push(`${name}: category Slug suggestion must require explicit unified apply`);
}

for (const name of corePages) {
  const source = await readFile(path.join(adminRoot, name), "utf8");
  if (!source.includes("flex flex-col gap-6")) {
    failures.push(
      `${name}: core Admin pages must retain the canonical 24px vertical rhythm`,
    );
  }
  if (collectionPages.has(name)) {
    if (!source.includes("<PageHeader") && !source.includes("const pageHeader")) {
      failures.push(`${name}: route-level PageHeader is required`);
    }
    assertCollectionStack(name, source);
  }
  if (editorPages.has(name)) assertCanonicalEditor(name, source);
}

const categories = await readFile(path.join(adminRoot, "Categories.tsx"), "utf8");
assertCategorySlugPicker(categories);

for (const name of [
  "Categories.tsx",
  "Tags.tsx",
  "Comments.tsx",
  "MediaLibrary.tsx",
  "Users.tsx",
]) {
  const source = await readFile(path.join(adminRoot, name), "utf8");
  if (!source.includes('data-pattern="collection-composition"')) {
    failures.push(
      `${name}: manually reviewed support collection must expose the canonical collection-composition marker`,
    );
  }
}
if (!categories.includes('data-pattern="editor-form-composition"')) {
  failures.push(
    "Categories.tsx: category Drawer form must expose the canonical editor-form-composition marker",
  );
}
for (const marker of [
  "flex items-center gap-2",
  'className="min-w-0 flex-1 type-family-mono"',
]) {
  if (!categories.includes(marker)) {
    failures.push(
      `Categories.tsx: reviewed Slug editor anatomy drifted from Showcase: ${marker}`,
    );
  }
}
const siteSettings = await readFile(path.join(adminRoot, "SiteSettings.tsx"), "utf8");
if (!siteSettings.includes('data-pattern="settings-composition"')) {
  failures.push(
    "SiteSettings.tsx: settings tab body must expose the canonical settings-composition marker",
  );
}

for (const name of ["Dashboard.tsx", "Pages.tsx", "Comments.tsx"]) {
  const source = await readFile(path.join(adminRoot, name), "utf8");
  if (!source.includes("useAppFeedback")) {
    failures.push(
      `${name}: transient operation feedback must use AppFeedback/Notification ownership`,
    );
  }
  if (/\btype\s+Notice\b|\bsetNotice\s*\(/.test(source)) {
    failures.push(
      `${name}: local Notice state must not recreate transient page feedback`,
    );
  }
}

const dashboard = await readFile(path.join(adminRoot, "Dashboard.tsx"), "utf8");
if (!dashboard.includes("<IconButtonLink") || !dashboard.includes('variant="ghost"')) {
  failures.push(
    "Dashboard.tsx: dense Top Posts row actions must retain the Showcase ghost IconButtonLink grammar",
  );
}

for (const marker of [
  "flex w-full items-start justify-between gap-4 p-4 text-left",
  "flex min-w-0 items-start gap-3",
  "mt-1 line-clamp-1",
]) {
  if (!dashboard.includes(marker)) {
    failures.push(
      `Dashboard.tsx: manually reviewed AI alert row anatomy drifted from Showcase: ${marker}`,
    );
  }
}
if (
  dashboard.includes("group-hover:translate-x-0.5") ||
  dashboard.includes("mt-0.5 flex size-9")
) {
  failures.push(
    "Dashboard.tsx: page-local AI alert alignment/hover compensation must not replace canonical row anatomy",
  );
}

for (const name of ["Posts.tsx", "Pages.tsx"]) {
  const source = await readFile(path.join(adminRoot, name), "utf8");
  if (!source.includes('data-pattern="collection-composition"')) {
    failures.push(
      `${name}: reviewed collection page must expose the canonical collection-composition contract marker`,
    );
  }
}

const reviewedTypographyContracts = new Map([
  [
    "Dashboard.tsx",
    {
      required: [
        "type-metric-compact",
        "type-body-sm type-weight-semibold",
        "type-caption type-weight-medium",
        "type-family-mono type-caption",
      ],
      forbidden: [
        "text-xl font-semibold",
        "text-sm font-semibold",
        "text-xs font-medium",
        "font-mono text-xs",
        "text-[10px]",
        "text-[11px]",
      ],
    },
  ],
  [
    "Posts.tsx",
    {
      required: [
        "type-weight-semibold",
        "type-caption text-muted-foreground",
        "type-family-mono type-caption",
      ],
      forbidden: [
        "font-semibold leading-snug",
        "font-mono text-xs",
        "gap-2 text-xs text-muted-foreground",
      ],
    },
  ],
  [
    "Pages.tsx",
    {
      required: [
        "type-body-sm type-weight-semibold",
        "type-caption text-muted-foreground",
        "type-family-mono type-caption",
      ],
      forbidden: [
        "text-sm font-semibold",
        "font-mono text-xs",
        "line-clamp-1 text-xs",
      ],
    },
  ],
]);

const editorFieldChrome = await readFile(
  path.join(root, "components/editor/EditorFieldChrome.tsx"),
  "utf8",
);

for (const marker of [
  'className="cursor-pointer select-none pe-12 type-body-sm type-weight-semibold"',
  'className="absolute end-0 top-2.5 z-10"',
  'className="type-body-sm type-weight-medium"',
]) {
  if (!editorFieldChrome.includes(marker)) {
    failures.push(
      `EditorFieldChrome.tsx: shared editor composition is missing canonical marker ${marker}`,
    );
  }
}
for (const retired of [
  "pr-12 text-sm font-semibold",
  "absolute right-0 top-2.5",
]) {
  if (editorFieldChrome.includes(retired)) {
    failures.push(
      `EditorFieldChrome.tsx: retired raw/physical editor anatomy returned: ${retired}`,
    );
  }
}

for (const name of ["PostEditor.tsx", "PageEditor.tsx"]) {
  const source = await readFile(path.join(adminRoot, name), "utf8");
  if (
    !source.includes('from "../../components/editor/EditorFieldChrome";') ||
    !source.includes("FieldActionHeader") ||
    !source.includes("InspectorSection")
  ) {
    failures.push(
      `${name}: Post/Page editor family must consume shared EditorFieldChrome composition`,
    );
  }
  for (const duplicated of ["function InspectorSection", "function FieldActionHeader"]) {
    if (source.includes(duplicated)) {
      failures.push(
        `${name}: duplicated page-private editor composition returned: ${duplicated}`,
      );
    }
  }
}

const reviewedEditorTypographyContracts = new Map([
  [
    "PostEditor.tsx",
    {
      required: [
        "type-body-sm text-muted-foreground",
        "type-caption type-weight-regular",
        '<Text weight="semibold">属性</Text>',
        '<Text weight="medium">正文</Text>',
        '<Text weight="semibold">\n              服务器最新版本：',
        "max-h-48 overflow-auto rounded-md bg-muted/20 p-3 type-body-sm",
      ],
      forbidden: [
        'className="text-sm font-medium"',
        "text-[11px] font-normal",
        "line-clamp-2 text-xs font-normal leading-5",
        '<Text className="font-semibold">属性</Text>',
        '<Text className="font-medium">正文</Text>',
        '<Text className="font-semibold">',
        "bg-muted/20 p-3 text-sm",
      ],
    },
  ],
  [
    "PageEditor.tsx",
    {
      required: [
        "type-body-sm text-muted-foreground",
        '<Text weight="semibold">属性</Text>',
        '<Text weight="medium">正文</Text>',
      ],
      forbidden: [
        'className="text-sm font-medium"',
        '<Text className="font-semibold">属性</Text>',
        '<Text className="font-medium">正文</Text>',
      ],
    },
  ],
]);

const reviewedSupportTypographyContracts = new Map([
  [
    "Categories.tsx",
    {
      required: [
        "type-body-sm type-weight-semibold",
        "type-family-mono type-caption",
        "type-caption type-leading-relaxed",
      ],
      forbidden: ["text-sm font-semibold", "font-mono text-xs", "text-xs leading-relaxed"],
    },
  ],
  [
    "Tags.tsx",
    {
      required: ["type-body-sm type-weight-semibold"],
      forbidden: ["truncate text-sm font-semibold"],
    },
  ],
  [
    "Comments.tsx",
    {
      required: [
        "type-body-sm type-weight-semibold",
        "type-family-mono type-caption",
        "type-body-sm type-leading-relaxed",
      ],
      forbidden: ["text-sm font-semibold", "font-mono text-xs", "text-sm leading-relaxed"],
    },
  ],
  [
    "Notifications.tsx",
    {
      required: [
        "type-caption type-weight-semibold uppercase type-tracking-label",
        "type-body-sm type-weight-semibold",
        "type-family-mono type-caption",
      ],
      forbidden: ["text-xs font-semibold uppercase tracking-wider", "text-sm font-semibold", "font-mono text-xs"],
    },
  ],
  [
    "MediaLibrary.tsx",
    {
      required: [
        "type-body-sm type-weight-semibold",
        "type-family-mono type-caption",
        "type-family-sans text-primary",
        "type-weight-medium text-primary underline-offset-4 hover:underline",
        "absolute start-2 top-2 z-10",
      ],
      forbidden: [
        "absolute left-2 top-2",
        "truncate text-sm font-semibold",
        "font-mono text-xs",
        "font-sans text-primary",
        "font-medium text-primary underline-offset-4 hover:underline",
      ],
    },
  ],
  [
    "SiteSettings.tsx",
    {
      required: [
        "type-body-sm type-weight-semibold text-primary",
        '<Text size="sm" weight="medium">',
        "type-caption text-muted-foreground",
      ],
      forbidden: ["text-sm font-bold text-primary", '<Text size="sm" className="font-medium">'],
    },
  ],
  [
    "Users.tsx",
    {
      required: [
        "type-body-sm type-weight-semibold text-primary",
        "type-weight-semibold",
        "type-family-mono type-caption",
        '<Text size="xs" tone="muted" leading="relaxed">',
      ],
      forbidden: [
        "text-sm font-semibold text-primary",
        "font-mono text-xs",
        'className="leading-relaxed"',
      ],
    },
  ],
]);

for (const [name, supportContract] of reviewedSupportTypographyContracts) {
  const source = await readFile(path.join(adminRoot, name), "utf8");
  for (const marker of supportContract.required) {
    if (!source.includes(marker)) {
      failures.push(`${name}: manually reviewed support typography contract is missing ${marker}`);
    }
  }
  for (const marker of supportContract.forbidden) {
    if (source.includes(marker)) {
      failures.push(`${name}: retired support typography drift returned: ${marker}`);
    }
  }
}

for (const [name, editorContract] of reviewedEditorTypographyContracts) {
  const source = await readFile(path.join(adminRoot, name), "utf8");
  for (const marker of editorContract.required) {
    if (!source.includes(marker)) {
      failures.push(`${name}: manually reviewed editor typography contract is missing ${marker}`);
    }
  }
  for (const marker of editorContract.forbidden) {
    if (source.includes(marker)) {
      failures.push(`${name}: retired editor typography drift returned: ${marker}`);
    }
  }
}

for (const [name, contract] of reviewedTypographyContracts) {
  const source = await readFile(path.join(adminRoot, name), "utf8");
  for (const marker of contract.required) {
    if (!source.includes(marker)) {
      failures.push(`${name}: manually reviewed Showcase typography contract is missing ${marker}`);
    }
  }
  for (const marker of contract.forbidden) {
    if (source.includes(marker)) {
      failures.push(`${name}: retired raw typography drift returned: ${marker}`);
    }
  }
}

for (const name of await readdir(adminRoot)) {
  if (!name.endsWith(".tsx")) continue;
  const source = await readFile(path.join(adminRoot, name), "utf8");
  const file = sourceFile(name, source);

  function visit(node) {
    if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tag = jsxTag(node);
      if (["button", "select", "textarea"].includes(tag)) {
        failures.push(
          `${name}:${lineOf(file, node)} native ${tag} bypasses canonical @gouno/ui ownership`,
        );
      }
      if (tag === "input") {
        const type = staticAttribute(node, "type") || "text";
        const classes = new Set(staticClassName(node).split(/\s+/));
        const hiddenFileBridge =
          type === "file" && (classes.has("sr-only") || classes.has("hidden"));
        if (type !== "hidden" && !hiddenFileBridge) {
          failures.push(
            `${name}:${lineOf(file, node)} visible native input bypasses canonical @gouno/ui ownership`,
          );
        }
      }
      const classes = new Set(staticClassName(node).split(/\s+/));
      if (classes.has("fixed")) {
        failures.push(
          `${name}:${lineOf(file, node)} product-level fixed positioning is forbidden; overlays and notification stacks belong to @gouno/ui`,
        );
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(file);
}


const csaA003Bindings = [
  {
    path: "pages/admin/Dashboard.tsx",
    required: ["type-family-mono type-caption", "type-weight-medium"],
    retired: ["font-mono type-caption", 'className="font-medium"'],
  },
  {
    path: "pages/admin/PostEditor.tsx",
    required: [
      "text-left type-body-sm whitespace-normal",
      'className="type-family-mono"',
    ],
    retired: [
      "text-left text-sm whitespace-normal",
      'className="font-mono"',
    ],
  },
  {
    path: "pages/admin/PageEditor.tsx",
    required: ['className="type-family-mono"'],
    retired: ['className="font-mono"'],
  },
  {
    path: "pages/admin/Categories.tsx",
    required: ['className="min-w-0 flex-1 type-family-mono"'],
    retired: ['className="min-w-0 flex-1 font-mono"'],
  },
  {
    path: "pages/admin/Tags.tsx",
    required: ['className="shrink-0 type-family-mono"'],
    retired: ['className="shrink-0 font-mono"'],
  },
  {
    path: "pages/admin/MediaLibrary.tsx",
    required: ['className="mt-2 flex flex-col gap-1 type-body-sm"'],
    retired: ['className="mt-2 flex flex-col gap-1 text-sm"'],
  },
  {
    path: "pages/admin/SiteSettings.tsx",
    required: ['className="type-family-mono"'],
    retired: ['className="font-mono"'],
  },
];

for (const contract of csaA003Bindings) {
  const content = await readFile(path.join(root, contract.path), "utf8");
  for (const marker of contract.required) {
    if (!content.includes(marker)) {
      failures.push(
        `${contract.path}: CSA-A003 semantic Typography binding is missing ${marker}`,
      );
    }
  }
  for (const marker of contract.retired) {
    if (content.includes(marker)) {
      failures.push(
        `${contract.path}: retired CSA-A003 raw Typography anatomy returned: ${marker}`,
      );
    }
  }
}

for (const [componentPath, requiredMarker, retiredMarker, minimum] of [
  [
    "components/agent/SkillForm.tsx",
    'className="type-family-mono"',
    'className="font-mono"',
    2,
  ],
  [
    "components/agent/WorkflowWorkspace.tsx",
    "text-left type-weight-regular transition-colors",
    "text-left font-normal transition-colors",
    2,
  ],
]) {
  const content = await readFile(path.join(root, componentPath), "utf8");
  const found = content.split(requiredMarker).length - 1;
  if (found < minimum) {
    failures.push(
      `${componentPath}: CSA-A003 expected at least ${minimum} occurrences of ${requiredMarker}, found ${found}`,
    );
  }
  if (content.includes(retiredMarker)) {
    failures.push(
      `${componentPath}: retired CSA-A003 raw Typography anatomy returned: ${retiredMarker}`,
    );
  }
}

if (failures.length) {
  console.error(
    `Blog Admin parity contract failed:\n${failures.map((item) => `- ${item}`).join("\n")}`,
  );
  process.exit(1);
}

console.log("Blog Admin structural/semantic parity contract passed.");
