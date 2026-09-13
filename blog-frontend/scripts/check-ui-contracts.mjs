import { access, readdir, readFile } from "node:fs/promises";
import { extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const root = fileURLToPath(new URL("../src/", import.meta.url));
const files = [];
const retiredProductStyles = new Set([
  "index.css",
  "styles/app.css",
  "styles/base.css",
  "styles/components.css",
  "styles/design-system-alignment.css",
  "styles/redesign.css",
  "styles/tokens.css",
]);
const retiredProductComponents = new Set([
  "components/ConfirmActionModal.tsx",
  "components/taxonomy/CategoryForm.tsx",
]);
const retiredVendoredAssets = ["public/ui-bootstrap.js", "public/favicon.svg"];
const agentConsoleStyleConsumers = new Set([
  "pages/admin/AISettings.tsx",
  "pages/admin/AIOperations.tsx",
]);
const editorStyleConsumer = "components/editor/ContentEditorFrame.tsx";
const canonicalUiModules = new Set([
  "@gouno/ui/core",
  "@gouno/ui/theme",
  "@gouno/ui/patterns",
  "@gouno/ui/gouno",
]);
const canonicalBrandIconModule =
  /^@gouno\/ui\/brand-icons\/[a-z0-9-]+\.svg$/;
const canonicalRootAllowlist = new Set(["cn"]);
const directRadixImport = /(?:\bfrom\s+|\bimport\s*\(\s*)["']@radix-ui\//;
const nativeBrowserDialogs = new Set(["alert", "confirm", "prompt"]);
const rawElevationPattern =
  /(^|[\s"'`])(?:[a-z-]+:)*shadow-(?:xs|sm|md|lg|xl|2xl)(?=[\s"'`]|$)/;
const canonicalPrimitiveSelector =
  /^\.(?:panel|field|input-field|btn|btn__label|icon-button|feedback|state|tab|tab-list|ui-card|choice-button|badge)(?=$|[\s:{,[.#>+~])/;
const agentConsoleStyleImport = /(?:^|\/)styles\/agent-console\.css$/;
const editorStyleImport = /(?:^|\/)styles\/editor\.css$/;
const retiredEditorPrimitiveSelector = /(?:^|[\s>+~,])\.(?:btn|btn__label|choice-button|feedback)(?=$|[\s:{,[.#>+~])/;

async function collect(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await collect(path);
    else if ([".css", ".ts", ".tsx"].includes(extname(entry.name)))
      files.push(path);
  }
}

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

await collect(root);
const failures = [];

for (const relativePath of retiredVendoredAssets) {
  if (await exists(join(projectRoot, relativePath))) {
    failures.push(
      `${relativePath}: vendored Gouno UI runtime/brand asset must not be reintroduced; source it from the installed @gouno/ui release`,
    );
  }
}

function jsxTagName(node, sourceFile) {
  if (ts.isJsxElement(node))
    return node.openingElement.tagName.getText(sourceFile);
  if (ts.isJsxSelfClosingElement(node)) return node.tagName.getText(sourceFile);
  return null;
}

function location(sourceFile, node) {
  return (
    sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1
  );
}

function buttonChildIcon(node, sourceFile) {
  let icon = null;
  function visitChild(child) {
    if (icon || !child) return;
    if (ts.isParenthesizedExpression(child)) {
      visitChild(child.expression);
      return;
    }
    if (ts.isJsxFragment(child)) {
      child.children.forEach(visitChild);
      return;
    }
    const tag = jsxTagName(child, sourceFile);
    if (tag && (tag === "svg" || /^[A-Z]/.test(tag))) {
      icon = child;
      return;
    }
    if (ts.isJsxExpression(child) && child.expression) {
      visitChild(child.expression);
      return;
    }
    if (ts.isConditionalExpression(child)) {
      visitChild(child.whenTrue);
      visitChild(child.whenFalse);
    }
  }
  visitChild(node);
  return icon;
}

function staticClassName(attribute) {
  const initializer = attribute.initializer;
  if (!initializer) return "";
  if (ts.isStringLiteral(initializer)) return initializer.text;
  if (
    ts.isJsxExpression(initializer) &&
    initializer.expression &&
    (ts.isStringLiteral(initializer.expression) ||
      ts.isNoSubstitutionTemplateLiteral(initializer.expression))
  ) {
    return initializer.expression.text;
  }
  return "";
}

function checkUiImports(name, source) {
  if (!name.endsWith(".ts") && !name.endsWith(".tsx")) return;
  const sourceFile = ts.createSourceFile(
    name,
    source,
    ts.ScriptTarget.Latest,
    true,
    name.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );

  for (const statement of sourceFile.statements) {
    if (
      !ts.isImportDeclaration(statement) ||
      !ts.isStringLiteral(statement.moduleSpecifier)
    )
      continue;
    const moduleName = statement.moduleSpecifier.text;

    if (directRadixImport.test(`from \"${moduleName}\"`)) {
      failures.push(
        `${name}:${location(sourceFile, statement)} direct @radix-ui imports bypass @gouno/ui ownership; consume the canonical Gouno UI primitive instead`,
      );
      continue;
    }

    if (
      agentConsoleStyleImport.test(moduleName) &&
      !agentConsoleStyleConsumers.has(name)
    ) {
      failures.push(
        `${name}:${location(sourceFile, statement)} agent-console.css is feature-scoped to AI Settings and AI Operations`,
      );
    }

    if (editorStyleImport.test(moduleName) && name !== editorStyleConsumer) {
      failures.push(
        `${name}:${location(sourceFile, statement)} editor.css is feature-scoped to ContentEditorFrame`,
      );
    }

    if (!moduleName.startsWith("@gouno/ui")) continue;

    if (canonicalBrandIconModule.test(moduleName)) continue;

    if (moduleName === "@gouno/ui-legacy") {
      failures.push(
        `${name}:${location(sourceFile, statement)} legacy Gouno UI imports are no longer supported`,
      );
      continue;
    }

    if (moduleName !== "@gouno/ui" && !canonicalUiModules.has(moduleName)) {
      failures.push(
        `${name}:${location(sourceFile, statement)} unsupported Gouno UI import entrypoint ${moduleName}`,
      );
      continue;
    }

    const clause = statement.importClause;
    if (!clause) continue;
    if (
      clause.name ||
      (clause.namedBindings && !ts.isNamedImports(clause.namedBindings))
    ) {
      failures.push(
        `${name}:${location(sourceFile, statement)} Gouno UI imports must use named exports from governed entrypoints`,
      );
      continue;
    }
    if (!clause.namedBindings) continue;

    if (moduleName === "@gouno/ui") {
      for (const element of clause.namedBindings.elements) {
        const imported = element.propertyName?.text ?? element.name.text;
        if (!canonicalRootAllowlist.has(imported)) {
          failures.push(
            `${name}:${location(sourceFile, element)} ${imported} must import from its canonical @gouno/ui layer subpath`,
          );
        }
      }
    }
  }
}

function checkBrowserDialogContracts(name, source) {
  if (
    (!name.endsWith(".ts") && !name.endsWith(".tsx")) ||
    name.includes("__tests__")
  )
    return;

  const sourceFile = ts.createSourceFile(
    name,
    source,
    ts.ScriptTarget.Latest,
    true,
    name.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );

  function visit(node) {
    if (ts.isCallExpression(node)) {
      const expression = node.expression;
      let dialogName = "";
      if (
        ts.isPropertyAccessExpression(expression) &&
        ts.isIdentifier(expression.expression) &&
        expression.expression.text === "window" &&
        nativeBrowserDialogs.has(expression.name.text)
      ) {
        dialogName = expression.name.text;
      } else if (
        ts.isIdentifier(expression) &&
        nativeBrowserDialogs.has(expression.text)
      ) {
        dialogName = expression.text;
      }

      if (dialogName) {
        failures.push(
          `${name}:${location(sourceFile, node)} native browser ${dialogName}() is forbidden; use controlled @gouno/ui feedback or modal primitives`,
        );
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
}

function checkTsxContracts(name, source) {
  if (!name.endsWith(".tsx") || name.includes("__tests__")) return;
  const sourceFile = ts.createSourceFile(
    name,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );

  function visit(node) {
    if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tag = jsxTagName(node, sourceFile);
      if (tag === "button") {
        failures.push(
          `${name}:${location(sourceFile, node)} native button must use Button, ButtonLink, or IconButton`,
        );
      }
      if (tag === "select") {
        failures.push(
          `${name}:${location(sourceFile, node)} native select must use the shared Select component`,
        );
      }
      if (
        ts.isJsxElement(node) &&
        ["Button", "ButtonLink", "ChoiceButton"].includes(tag)
      ) {
        for (const child of node.children) {
          const icon = buttonChildIcon(child, sourceFile);
          if (icon) {
            failures.push(
              `${name}:${location(sourceFile, icon)} ${tag} icons must use the icon prop, not children`,
            );
          }
        }
      }
      const attributes = ts.isJsxElement(node)
        ? node.openingElement.attributes
        : node.attributes;
      for (const attribute of attributes.properties) {
        if (
          !ts.isJsxAttribute(attribute) ||
          attribute.name.text !== "className"
        )
          continue;
        const value = staticClassName(attribute);
        if (/(^|\s)btn(?:\s|$)/.test(value)) {
          failures.push(
            `${name}:${location(sourceFile, attribute)} shared button classes must use Button or ButtonLink`,
          );
        }
        if (/(^|\s)badge(?:\s|$)/.test(value)) {
          failures.push(
            `${name}:${location(sourceFile, attribute)} shared badge classes must use Badge`,
          );
        }
      }
    }
    if (ts.isIdentifier(node) && node.text === "buttonClassName") {
      failures.push(
        `${name}:${location(sourceFile, node)} buttonClassName is internal to the shared Button primitive`,
      );
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
}

for (const path of files) {
  const name = relative(root, path);
  const source = await readFile(path, "utf8");

  if (retiredProductStyles.has(name)) {
    failures.push(
      `${name}: retired legacy stylesheet must not be reintroduced; canonical tokens and primitives are owned by @gouno/ui`,
    );
  }

  if (retiredProductComponents.has(name)) {
    failures.push(
      `${name}: retired compatibility component must not be reintroduced; use canonical @gouno/ui composition directly`,
    );
  }

  if (name.endsWith(".css")) {
    source.split("\n").forEach((line, index) => {
      const selector = line.trim();
      if (/#[\da-f]{3,8}\b|rgba?\(/i.test(line))
        failures.push(
          `${name}:${index + 1} concrete color is product-local; use canonical @gouno/ui semantic tokens`,
        );
      if (/\bwhite\b/i.test(line) && !/white-space/i.test(line))
        failures.push(
          `${name}:${index + 1} literal white is product-local; use canonical @gouno/ui semantic tokens`,
        );
      if (/!important/.test(line))
        failures.push(`${name}:${index + 1} !important is not allowed`);
      if (canonicalPrimitiveSelector.test(selector)) {
        failures.push(
          `${name}:${index + 1} canonical primitive selector must be owned by @gouno/ui, not product CSS`,
        );
      }
      if (selector.includes("[data-slot=")) {
        failures.push(
          `${name}:${index + 1} canonical data-slot selectors must be owned by @gouno/ui, not product CSS`,
        );
      }
      if (
        name === "styles/editor.css" &&
        retiredEditorPrimitiveSelector.test(selector)
      ) {
        failures.push(
          `${name}:${index + 1} editor feature CSS must target product-owned classes instead of retired primitive internals`,
        );
      }
    });
  }

  if (name.startsWith("pages/admin/") && name.endsWith(".tsx")) {
    source.split("\n").forEach((line, index) => {
      if (rawElevationPattern.test(line)) {
        failures.push(
          `${name}:${index + 1} Blog Admin product surfaces must use semantic elevation instead of raw shadow sizes`,
        );
      }
    });
  }
  checkUiImports(name, source);
  checkBrowserDialogContracts(name, source);
  checkTsxContracts(name, source);
}

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log(
  `UI contracts passed across ${files.length} source files; canonical Gouno UI owns shared CSS primitives and data-slot selectors.`,
);
