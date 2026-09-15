import { readFile } from "node:fs/promises";
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

function sourceFile(name, source) {
  return ts.createSourceFile(name, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
}

function lineOf(file, node) {
  return file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1;
}

function jsxTag(node) {
  if (ts.isJsxElement(node)) return node.openingElement.tagName.getText();
  if (ts.isJsxSelfClosingElement(node)) return node.tagName.getText();
  return "";
}

function staticClassName(node) {
  const attrs = ts.isJsxElement(node) ? node.openingElement.attributes : node.attributes;
  const attribute = attrs.properties.find(
    (item) => ts.isJsxAttribute(item) && item.name.text === "className",
  );
  if (!attribute || !ts.isJsxAttribute(attribute) || !attribute.initializer) return "";
  if (ts.isStringLiteral(attribute.initializer)) return attribute.initializer.text;
  if (
    ts.isJsxExpression(attribute.initializer) &&
    attribute.initializer.expression &&
    (ts.isStringLiteral(attribute.initializer.expression) ||
      ts.isNoSubstitutionTemplateLiteral(attribute.initializer.expression))
  ) return attribute.initializer.expression.text;
  return "";
}

for (const name of corePages) {
  const source = await readFile(path.join(adminRoot, name), "utf8");
  if (!source.includes("flex flex-col gap-6") && !source.includes("ContentEditorFrame")) {
    failures.push(`${name}: core Admin pages must use the canonical 24px vertical rhythm or ContentEditorFrame workspace grammar`);
  }
  if (name === "Dashboard.tsx" || name === "Posts.tsx" || name === "Pages.tsx") {
    const header = source.indexOf("<PageHeader");
    if (header < 0) failures.push(`${name}: route-level PageHeader is required`);
    const firstSurface = source.indexOf('<Card padding="base"');
    if (firstSurface >= 0 && header >= firstSurface) {
      failures.push(`${name}: PageHeader must precede task surfaces`);
    }
  }
  if (name === "PostEditor.tsx" || name === "PageEditor.tsx") {
    if (!source.includes("<ContentEditorFrame")) failures.push(`${name}: editor must use ContentEditorFrame`);
    if (!source.includes("<EditorCommandBar")) failures.push(`${name}: editor must use EditorCommandBar`);
  }
}

for (const name of ["Pages.tsx", "Comments.tsx"]) {
  const source = await readFile(path.join(adminRoot, name), "utf8");
  if (!source.includes("useAppFeedback")) failures.push(`${name}: transient operation feedback must use AppFeedback/Notification ownership`);
  if (/\btype\s+Notice\b|\bsetNotice\s*\(/.test(source)) {
    failures.push(`${name}: local Notice state must not recreate transient page feedback`);
  }
}

for (const name of await (await import("node:fs/promises")).readdir(adminRoot)) {
  if (!name.endsWith(".tsx")) continue;
  const source = await readFile(path.join(adminRoot, name), "utf8");
  const file = sourceFile(name, source);

  function visit(node) {
    if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tag = jsxTag(node);
      if (["button", "select", "textarea"].includes(tag)) {
        failures.push(`${name}:${lineOf(file, node)} native ${tag} bypasses canonical @gouno/ui ownership`);
      }
      if (tag === "input") {
        const attrs = ts.isJsxElement(node) ? node.openingElement.attributes : node.attributes;
        const typeAttr = attrs.properties.find(
          (item) => ts.isJsxAttribute(item) && item.name.text === "type",
        );
        const type =
          typeAttr && ts.isJsxAttribute(typeAttr) && typeAttr.initializer && ts.isStringLiteral(typeAttr.initializer)
            ? typeAttr.initializer.text
            : "text";
        if (type !== "hidden") failures.push(`${name}:${lineOf(file, node)} visible native input bypasses canonical @gouno/ui ownership`);
      }
      const classes = staticClassName(node).split(/\s+/);
      if (classes.includes("fixed")) {
        failures.push(`${name}:${lineOf(file, node)} product-level fixed positioning is forbidden; overlays and notification stacks belong to @gouno/ui`);
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(file);
}

if (failures.length) {
  console.error(`Blog Admin parity contract failed:\n${failures.map((item) => `- ${item}`).join("\n")}`);
  process.exit(1);
}

console.log("Blog Admin structural/semantic parity contract passed.");
