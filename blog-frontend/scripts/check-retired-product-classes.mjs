import { readdir, readFile } from "node:fs/promises";
import { extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = fileURLToPath(new URL("../src/", import.meta.url));
const files = [];
const retiredClasses = new Set([
  "public-container",
  "state-page",
  "state-card",
  "state__actions",
  "simple-page__body",
  "form-error",
  "loading",
]);

async function collect(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await collect(path);
    else if (extname(entry.name) === ".tsx") files.push(path);
  }
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

await collect(root);
const failures = [];

for (const path of files) {
  const name = relative(root, path);
  const source = await readFile(path, "utf8");
  const sourceFile = ts.createSourceFile(
    name,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );

  function visit(node) {
    if (ts.isJsxAttribute(node) && node.name.text === "className") {
      const value = staticClassName(node);
      for (const token of value.split(/\s+/).filter(Boolean)) {
        if (!retiredClasses.has(token)) continue;
        const line =
          sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line +
          1;
        failures.push(
          `${name}:${line} retired product compatibility class ${token} must not be reintroduced; use canonical @gouno/ui composition or explicit layout utilities`,
        );
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
}

if (failures.length) {
  console.error("Retired product class contract violations:\n");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Retired product class contract passed.");
