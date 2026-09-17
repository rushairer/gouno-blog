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

if (failures.length) {
  console.error(
    `Blog Admin parity contract failed:\n${failures.map((item) => `- ${item}`).join("\n")}`,
  );
  process.exit(1);
}

console.log("Blog Admin structural/semantic parity contract passed.");
