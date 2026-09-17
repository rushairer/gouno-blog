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

function staticAttribute(node, attributeName) {
  const attribute = jsxAttributes(node).properties.find(
    (item) => ts.isJsxAttribute(item) && item.name.text === attributeName,
  );
  if (!attribute || !ts.isJsxAttribute(attribute) || !attribute.initializer)
    return "";
  if (ts.isStringLiteral(attribute.initializer))
    return attribute.initializer.text;
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
      while (ts.isParenthesizedExpression(expression))
        expression = expression.expression;
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
    failures.push(
      `${name}: route render must expose a canonical flex flex-col gap-6 Admin page stack`,
    );
  }
}

for (const name of corePages) {
  const source = await readFile(path.join(adminRoot, name), "utf8");
  if (
    !source.includes("flex flex-col gap-6") &&
    !source.includes("ContentEditorFrame")
  ) {
    failures.push(
      `${name}: core Admin pages must use the canonical 24px vertical rhythm or ContentEditorFrame workspace grammar`,
    );
  }
  if (collectionPages.has(name)) {
    if (
      !source.includes("<PageHeader") &&
      !source.includes("const pageHeader")
    ) {
      failures.push(`${name}: route-level PageHeader is required`);
    }
    assertCollectionStack(name, source);
  }
  if (name === "PostEditor.tsx" || name === "PageEditor.tsx") {
    if (!source.includes("<ContentEditorFrame"))
      failures.push(`${name}: editor must use ContentEditorFrame`);
    if (!source.includes("<EditorCommandBar"))
      failures.push(`${name}: editor must use EditorCommandBar`);
  }
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

const categories = await readFile(
  path.join(adminRoot, "Categories.tsx"),
  "utf8",
);
if (!categories.includes("AISuggestionPicker")) {
  failures.push(
    "Categories.tsx: Slug AI must use canonical AISuggestionPicker",
  );
}

const dashboard = await readFile(path.join(adminRoot, "Dashboard.tsx"), "utf8");
if (
  !dashboard.includes("<IconButtonLink") ||
  !dashboard.includes('variant="ghost"')
) {
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
