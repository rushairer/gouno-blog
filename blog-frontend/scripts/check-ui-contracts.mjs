import { readdir, readFile } from "node:fs/promises";
import { extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = fileURLToPath(new URL("../src/", import.meta.url));
const files = [];
const primitiveStyleFiles = new Set([
  "styles/components.css",
  "styles/design-system-alignment.css",
]);

async function collect(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await collect(path);
    else if ([".css", ".ts", ".tsx"].includes(extname(entry.name)))
      files.push(path);
  }
}

await collect(root);
const failures = [];

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

function checkTsxContracts(name, source) {
  if (!name.endsWith(".tsx") || name.includes("__tests__")) return;
  const sourceFile = ts.createSourceFile(
    name,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const sharedPrimitive = name.startsWith("components/ui/");

  function visit(node) {
    if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tag = jsxTagName(node, sourceFile);
      if (!sharedPrimitive && tag === "button") {
        failures.push(
          `${name}:${location(sourceFile, node)} native button must use Button, ButtonLink, or IconButton`,
        );
      }
      if (!sharedPrimitive && tag === "select") {
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
        if (!sharedPrimitive && /(^|\s)badge(?:\s|$)/.test(value)) {
          failures.push(
            `${name}:${location(sourceFile, attribute)} shared badge classes must use Badge`,
          );
        }
      }
    }
    if (
      !sharedPrimitive &&
      ts.isIdentifier(node) &&
      node.text === "buttonClassName"
    ) {
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
  if (name.endsWith(".css") && name !== "styles/tokens.css") {
    source.split("\n").forEach((line, index) => {
      if (/#[\da-f]{3,8}\b|rgba?\(/i.test(line))
        failures.push(`${name}:${index + 1} concrete color outside tokens.css`);
      if (/\bwhite\b/i.test(line) && !/white-space/i.test(line))
        failures.push(`${name}:${index + 1} literal white outside tokens.css`);
      if (/!important/.test(line))
        failures.push(`${name}:${index + 1} !important is not allowed`);
    });
  }
  checkTsxContracts(name, source);
  if (name.endsWith(".css") && !primitiveStyleFiles.has(name)) {
    source.split("\n").forEach((line, index) => {
      if (
        /^\.(panel|field|input-field|btn|icon-button|feedback|state)\s*[{,:]/.test(
          line.trim(),
        )
      ) {
        failures.push(
          `${name}:${index + 1} shared primitive is owned by the design-system style layers`,
        );
      }
    });
  }
}

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log(`UI contracts passed across ${files.length} source files.`);
