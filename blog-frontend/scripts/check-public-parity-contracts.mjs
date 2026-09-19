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
  if (!source.includes("sticky top-0 layer-shell")) {
    failures.push(`${name}: sticky public header must use the canonical semantic shell layer`);
  }
  if (/sticky top-0 z-\d+/.test(source)) {
    failures.push(`${name}: raw z-index ownership is retired for the public shell header`);
  }
  if (
    !source.includes("type-body-lg type-weight-semibold type-tracking-title") ||
    !source.includes("type-caption text-muted-foreground")
  ) {
    failures.push(`${name}: PublicShell brand/footer typography must consume canonical semantic roles`);
  }
  if (/\b(?:text-lg|text-sm|text-xs|font-semibold|tracking-tight)\b/.test(source)) {
    failures.push(`${name}: PublicShell must not recreate canonical typography with raw metric utilities`);
  }
}

{
  const name = "pages/Home.tsx";
  const source = sources.get(name);
  const file = parse(name, source);

  if (!importsFrom(file, "@gouno/ui/core", "Heading")) {
    failures.push(`${name}: Public Home headings must use Core Heading`);
  }
  if (/<h[1-6]\b/.test(source)) {
    failures.push(`${name}: Public Home must not recreate heading typography with raw h1-h6`);
  }
  if (!source.includes('variant="display"') || !source.includes("type-reading-lead")) {
    failures.push(`${name}: Home must use the canonical display Typography role and reading lead rhythm`);
  }
}

{
  const name = "components/reading/ArticleTeaser.tsx";
  const source = sources.get(name);
  const file = parse(name, source);

  if (!importsFrom(file, "@gouno/ui/core", "Heading")) {
    failures.push(`${name}: Article teasers must use Core Heading`);
  }
  if (/<h[1-6]\b/.test(source)) {
    failures.push(`${name}: Article teasers must not recreate heading typography with raw h1-h6`);
  }
  if (!source.includes('featured ? "hero" : compact ? "compact" : "section"')) {
    failures.push(`${name}: teaser title variants must stay aligned with the canonical Showcase hierarchy`);
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
  if (!source.includes("edge-s-accent") || !source.includes("border-s-primary/40")) {
    failures.push(`${name}: reading blockquotes must use the canonical logical-start accent edge`);
  }
  if (/border-l-4\b/.test(source)) {
    failures.push(`${name}: physical left-border reading accents are retired`);
  }
  if (!importsFrom(file, "@gouno/ui/core", "Heading")) {
    failures.push(`${name}: Markdown headings must use Core Heading semantic roles`);
  }
  if (/<h[1-6]\b/.test(source)) {
    failures.push(`${name}: MarkdownRenderer must not recreate heading typography with raw heading elements`);
  }
  if (!source.includes("type-reading-body")) {
    failures.push(`${name}: Markdown reading rhythm must use the canonical reading-body role`);
  }
}

{
  const name = "pages/PostDetail.tsx";
  const source = sources.get(name);
  const file = parse(name, source);

  if (!importsFrom(file, "@gouno/ui/core", "Anchor")) {
    failures.push(`${name}: article TOC must delegate navigation behavior to Core Anchor`);
  }
  if (!importsFrom(file, "@gosso/client", "ApiError")) {
    failures.push(`${name}: article lifecycle must distinguish HTTP 404 from transport/server failures`);
  }
  if (!source.includes("postLoadError instanceof ApiError && postLoadError.status === 404")) {
    failures.push(`${name}: only an explicit article 404 may enter the NotFound path`);
  }
  if (!source.includes("setNotFound(false)") || !source.includes("setNotFound(true)")) {
    failures.push(`${name}: article retry must own an explicit resettable NotFound state`);
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
  if (!source.includes("fixed inset-x-0 top-0 layer-shell h-1 bg-muted")) {
    failures.push(`${name}: reading progress must use the canonical semantic shell layer`);
  }
  if (/fixed inset-x-0 top-0 z-\d+ h-1 bg-muted/.test(source)) {
    failures.push(`${name}: reading progress must not own a raw global z-index`);
  }
  if (!importsFrom(file, "@gouno/ui/core", "Heading")) {
    failures.push(`${name}: article section headings must use Core Heading`);
  }
  if (/<h[1-6]\b/.test(source)) {
    failures.push(`${name}: Article Detail must not recreate canonical heading typography with raw h1-h6`);
  }
  if (!source.includes('aria-labelledby="article-community"')) {
    failures.push(`${name}: community must remain an explicit ground-level article section`);
  }
}

{
  const name = "pages/CustomPageView.tsx";
  const source = sources.get(name);
  const file = parse(name, source);

  if (!importsFrom(file, "@gosso/client", "ApiError")) {
    failures.push(`${name}: custom page lifecycle must distinguish HTTP 404 from transport/server failures`);
  }
  if (!source.includes("reason instanceof ApiError && reason.status === 404")) {
    failures.push(`${name}: only an explicit 404 may enter the NotFound/About fallback path`);
  }
  if (!importsFrom(file, "@gouno/ui/core", "Anchor")) {
    failures.push(`${name}: custom page TOC must delegate navigation behavior to Core Anchor`);
  }
  if (!source.includes("<Skeleton") || source.includes("<Spinner")) {
    failures.push(`${name}: known document anatomy must use route-shaped Skeleton loading`);
  }
  if (!source.includes('title="页面载入失败"') || !source.includes("setReloadKey")) {
    failures.push(`${name}: fatal document load failures must preserve an explicit retry state`);
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
