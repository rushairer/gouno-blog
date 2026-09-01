import { readdir, readFile } from "node:fs/promises";
import { extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = fileURLToPath(new URL("../src/", import.meta.url));
const files = [];

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
          const childTag = jsxTagName(child, sourceFile);
          if (childTag && (childTag === "svg" || /^[A-Z]/.test(childTag))) {
            failures.push(
              `${name}:${location(sourceFile, child)} ${tag} icons must use the icon prop, not children`,
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
        const initializer = attribute.initializer;
        const value =
          initializer && ts.isStringLiteral(initializer)
            ? initializer.text
            : "";
        if (/(^|\s)btn(?:\s|$)/.test(value)) {
          failures.push(
            `${name}:${location(sourceFile, attribute)} shared button classes must use Button or ButtonLink`,
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
  if (name.endsWith(".css") && name !== "styles/components.css") {
    source.split("\n").forEach((line, index) => {
      if (
        /^\.(panel|field|input-field|btn|icon-button|feedback|state)\s*[{,:]/.test(
          line.trim(),
        )
      ) {
        failures.push(
          `${name}:${index + 1} shared primitive is owned by styles/components.css`,
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
