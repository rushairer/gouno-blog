import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import ts from "typescript";

const root = fileURLToPath(new URL("../src/", import.meta.url));
const failures = [];

const publicFiles = [
  "layouts/PublicShell.tsx",
  "pages/Home.tsx",
  "pages/ArticleIndex.tsx",
  "pages/Categories.tsx",
  "pages/Tags.tsx",
  "pages/Archive.tsx",
  "pages/PostDetail.tsx",
  "pages/CustomPageView.tsx",
  "pages/AccountNotifications.tsx",
  "pages/Settings.tsx",
  "pages/NotFound.tsx",
  "components/MarkdownRenderer.tsx",
  "components/reading/ArticleTeaser.tsx",
  "components/reading/DiscoveryIndexLoading.tsx",
];

function parse(name, source) {
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

function jsxTag(node, file) {
  if (ts.isJsxElement(node)) return node.openingElement.tagName.getText(file);
  if (ts.isJsxSelfClosingElement(node)) return node.tagName.getText(file);
  return "";
}

function jsxAttributes(node) {
  return ts.isJsxElement(node)
    ? node.openingElement.attributes
    : node.attributes;
}

function staticAttribute(node, name) {
  const attribute = jsxAttributes(node).properties.find(
    (item) => ts.isJsxAttribute(item) && item.name.text === name,
  );
  if (!attribute || !ts.isJsxAttribute(attribute) || !attribute.initializer) {
    return "";
  }
  if (ts.isStringLiteral(attribute.initializer)) return attribute.initializer.text;
  if (
    ts.isJsxExpression(attribute.initializer) &&
    attribute.initializer.expression &&
    (ts.isStringLiteral(attribute.initializer.expression) ||
      ts.isNoSubstitutionTemplateLiteral(attribute.initializer.expression))
  ) {
    return attribute.initializer.expression.text;
  }
  return "";
}

function importsFrom(file, moduleName, importedName) {
  return file.statements.some((statement) => {
    if (
      !ts.isImportDeclaration(statement) ||
      !ts.isStringLiteral(statement.moduleSpecifier) ||
      statement.moduleSpecifier.text !== moduleName
    ) {
      return false;
    }
    const bindings = statement.importClause?.namedBindings;
    if (!bindings || !ts.isNamedImports(bindings)) return false;
    return bindings.elements.some(
      (element) => (element.propertyName?.text ?? element.name.text) === importedName,
    );
  });
}

function countTag(file, tagName, predicate = () => true) {
  let count = 0;
  function visit(node) {
    if (
      (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) &&
      jsxTag(node, file) === tagName &&
      predicate(node)
    ) {
      count += 1;
    }
    ts.forEachChild(node, visit);
  }
  visit(file);
  return count;
}

const sources = new Map();
for (const name of publicFiles) {
  sources.set(name, await readFile(path.join(root, name), "utf8"));
}

for (const [name, source] of sources) {
  const file = parse(name, source);

  function visit(node) {
    if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tag = jsxTag(node, file);
      const line = lineOf(file, node);

      if (["AppShell", "PageContainer"].includes(tag)) {
        failures.push(
          `${name}:${line} Public/Account routes must not use Admin ${tag} grammar`,
        );
      }

      if (["button", "select", "textarea"].includes(tag)) {
        failures.push(
          `${name}:${line} native visual ${tag} bypasses canonical @gouno/ui ownership`,
        );
      }

      if (tag === "input") {
        const type = staticAttribute(node, "type") || "text";
        if (type !== "hidden") {
          failures.push(
            `${name}:${line} visible native input bypasses canonical @gouno/ui ownership`,
          );
        }
      }

      if (
        ["Button", "ButtonLink", "IconButton", "IconButtonLink", "Input", "Textarea"].includes(tag)
      ) {
        const classes = staticAttribute(node, "className");
        if (/(?:^|\s)!(?:size-|h-|w-|min-h-|rounded|p[trblxy]?\b)/.test(classes)) {
          failures.push(
            `${name}:${line} ${tag} must not override canonical control geometry with important utilities`,
          );
        }
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(file);
}

{
  const name = "layouts/PublicShell.tsx";
  const source = sources.get(name);
  const file = parse(name, source);

  if (countTag(file, "header") !== 1) {
    failures.push(`${name}: PublicShell must own exactly one semantic header`);
  }
  if (
    countTag(file, "main", (node) => staticAttribute(node, "id") === "public-main") !== 1
  ) {
    failures.push(`${name}: PublicShell must own main#public-main`);
  }
  if (countTag(file, "footer") !== 1) {
    failures.push(`${name}: PublicShell must own exactly one semantic footer`);
  }
  if (countTag(file, "Drawer") !== 1) {
    failures.push(`${name}: PublicShell must own the mobile navigation Drawer`);
  }
  if (
    countTag(
      file,
      "nav",
      (node) => staticAttribute(node, "aria-label") === "主导航",
    ) !== 1
  ) {
    failures.push(`${name}: desktop navigation must retain aria-label="主导航"`);
  }
  if (
    countTag(
      file,
      "nav",
      (node) => staticAttribute(node, "aria-label") === "移动导航",
    ) !== 1
  ) {
    failures.push(`${name}: mobile navigation must retain aria-label="移动导航"`);
  }
  if (!source.includes('label="打开主导航"')) {
    failures.push(`${name}: canonical mobile navigation trigger is required`);
  }
}

{
  const name = "components/MarkdownRenderer.tsx";
  const source = sources.get(name);
  const file = parse(name, source);

  if (!importsFrom(file, "@gouno/ui/core", "CodeBlock")) {
    failures.push(`${name}: Markdown code frames must use Core CodeBlock`);
  }
  if (source.includes("navigator.clipboard")) {
    failures.push(`${name}: clipboard ownership belongs to Core CodeBlock`);
  }
  if (/function\s+CodeBlock\s*\(/.test(source)) {
    failures.push(`${name}: local CodeBlock recreation is forbidden`);
  }
  if (/shadow-(?:sm|md|lg|xl|2xl)/.test(source)) {
    failures.push(`${name}: MarkdownRenderer must not recreate canonical code elevation`);
  }
}

{
  const name = "pages/PostDetail.tsx";
  const source = sources.get(name);
  const file = parse(name, source);

  if (!importsFrom(file, "@gouno/ui/core", "Anchor")) {
    failures.push(`${name}: article TOC must delegate navigation behavior to Core Anchor`);
  }
  if (
    countTag(
      file,
      "Card",
      (node) => staticAttribute(node, "as") === "article",
    ) !== 1
  ) {
    failures.push(`${name}: Article Detail must expose one dominant Card as="article" reading surface`);
  }
  if (!source.includes("<MarkdownRenderer")) {
    failures.push(`${name}: Article Detail must render through the Blog-local Markdown renderer`);
  }
  if (!source.includes("commentsError") || !source.includes("commentsLoading")) {
    failures.push(
      `${name}: comment loading/failure must be modeled separately from successful Empty state`,
    );
  }
  if (!source.includes('aria-labelledby="article-community"')) {
    failures.push(`${name}: community must remain an explicit ground-level article section`);
  }
}

{
  const name = "pages/AccountNotifications.tsx";
  const source = sources.get(name);
  if (!source.includes("loadError") || !source.includes("mutationError")) {
    failures.push(
      `${name}: persistent page-load errors and transient mutation errors must remain separate`,
    );
  }
  if (!source.includes("notificationsApi.markAllRead")) {
    failures.push(`${name}: supported mark-all-read behavior must remain wired`);
  }
  if (!source.includes("<Skeleton")) {
    failures.push(`${name}: known notification anatomy must use route-shaped loading`);
  }
}

{
  const name = "pages/Settings.tsx";
  const source = sources.get(name);
  const file = parse(name, source);
  const forbiddenAccountForms = new Set([
    "Input",
    "Textarea",
    "Checkbox",
    "Switch",
    "Form",
    "FormField",
    "PasswordForm",
    "MFAForm",
    "PasskeyManager",
    "LoginForm",
  ]);

  function visit(node) {
    if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tag = jsxTag(node, file);
      if (forbiddenAccountForms.has(tag)) {
        failures.push(
          `${name}:${lineOf(file, node)} Blog Account Settings must not absorb GOSSO identity/security forms (${tag})`,
        );
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(file);

  if (!source.includes("getGossoAdminURL") || !source.includes("<ButtonLink")) {
    failures.push(`${name}: Account Settings must retain the explicit GOSSO ownership handoff`);
  }
}

if (failures.length) {
  console.error(
    `Blog Public/Account parity contract failed:\n${failures.map((item) => `- ${item}`).join("\n")}`,
  );
  process.exit(1);
}

console.log(
  `Blog Public/Account structural/semantic parity contract passed across ${publicFiles.length} governed source files.`,
);
