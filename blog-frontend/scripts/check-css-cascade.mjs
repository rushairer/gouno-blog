import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const sourceRoot = fileURLToPath(new URL("../src/", import.meta.url));
const tailwindEntry = "styles/tailwind.css";
const allowedBlockAtRules = new Set([
  "@layer",
  "@font-face",
  "@property",
  "@keyframes",
  "@-webkit-keyframes",
  "@counter-style",
]);
const allowedStatementAtRules = [
  "@charset",
  "@import",
  "@layer",
  "@source",
  "@config",
  "@plugin",
  "@custom-variant",
];

async function collectCssFiles(directory, prefix = "") {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const relativePath = path.posix.join(prefix, entry.name);
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectCssFiles(absolutePath, relativePath)));
    } else if (entry.isFile() && entry.name.endsWith(".css")) {
      files.push({ absolutePath, relativePath });
    }
  }

  return files.sort((left, right) =>
    left.relativePath.localeCompare(right.relativePath),
  );
}

function withoutComments(value) {
  return value.replace(/\/\*[\s\S]*?\*\//g, "").trim();
}

function atRuleName(prelude) {
  return prelude.match(/^@[\w-]+/)?.[0] ?? "";
}

function shortPrelude(prelude) {
  return prelude.replace(/\s+/g, " ").slice(0, 100);
}

function inspectTopLevelBlocks(source, relativePath, failures) {
  let depth = 0;
  let parenDepth = 0;
  let statementStart = 0;
  let quote = "";
  let escaped = false;
  let inComment = false;

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    const next = source[index + 1];

    if (inComment) {
      if (character === "*" && next === "/") {
        inComment = false;
        index += 1;
      }
      continue;
    }

    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (character === "\\") {
        escaped = true;
      } else if (character === quote) {
        quote = "";
      }
      continue;
    }

    if (character === "/" && next === "*") {
      inComment = true;
      index += 1;
      continue;
    }

    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }

    if (character === "(") {
      parenDepth += 1;
      continue;
    }
    if (character === ")") {
      parenDepth = Math.max(0, parenDepth - 1);
      continue;
    }
    if (parenDepth > 0) continue;

    if (character === "{") {
      const prelude = withoutComments(source.slice(statementStart, index));
      if (depth === 0 && prelude) {
        const name = atRuleName(prelude);
        if (!name || !allowedBlockAtRules.has(name)) {
          failures.push(
            `${relativePath}: unlayered top-level block "${shortPrelude(prelude)}"`,
          );
        }
      }
      depth += 1;
      statementStart = index + 1;
      continue;
    }

    if (character === "}") {
      depth -= 1;
      if (depth < 0) {
        failures.push(`${relativePath}: unmatched closing brace`);
        depth = 0;
      }
      statementStart = index + 1;
      continue;
    }

    if (character === ";" && depth === 0) {
      const statement = withoutComments(source.slice(statementStart, index));
      if (
        statement &&
        !allowedStatementAtRules.some((prefix) => statement.startsWith(prefix))
      ) {
        failures.push(
          `${relativePath}: unlayered top-level statement "${shortPrelude(statement)}"`,
        );
      }
      statementStart = index + 1;
    }
  }

  if (depth !== 0) {
    failures.push(`${relativePath}: unbalanced braces (${depth})`);
  }

  const trailing = withoutComments(source.slice(statementStart));
  if (trailing) {
    failures.push(
      `${relativePath}: trailing unparsed CSS "${shortPrelude(trailing)}"`,
    );
  }
}

const failures = [];
const cssFiles = await collectCssFiles(sourceRoot);
let tailwindImports = 0;

for (const file of cssFiles) {
  const source = await readFile(file.absolutePath, "utf8");
  const imports =
    source.match(/@import\s+(?:url\()?\s*["']tailwindcss["']/g) ?? [];
  tailwindImports += imports.length;

  if (file.relativePath === tailwindEntry) {
    if (imports.length !== 1) {
      failures.push(`${tailwindEntry}: must own exactly one Tailwind import`);
    }
  } else if (imports.length > 0) {
    failures.push(
      `${file.relativePath}: Tailwind must only be imported by ${tailwindEntry}`,
    );
  }

  source.split("\n").forEach((line, index) => {
    if (line.includes("!important")) {
      failures.push(
        `${file.relativePath}:${index + 1}: !important is forbidden in source styles`,
      );
    }
  });

  inspectTopLevelBlocks(source, file.relativePath, failures);
}

if (tailwindImports !== 1) {
  failures.push(`expected one Tailwind import across src, found ${tailwindImports}`);
}

const mainSource = await readFile(path.join(sourceRoot, "main.tsx"), "utf8");
const cssImports = [
  ...mainSource.matchAll(/^\s*import\s+["']([^"']+\.css)["'];?/gm),
].map((match) => match[1]);
if (cssImports[0] !== "./styles/tailwind.css") {
  failures.push(
    `main.tsx: first CSS import must be ./styles/tailwind.css, found ${cssImports[0] ?? "none"}`,
  );
}
if (cssImports.at(-1) !== "./styles/accessibility.css") {
  failures.push(
    `main.tsx: final CSS import must be ./styles/accessibility.css, found ${cssImports.at(-1) ?? "none"}`,
  );
}

if (failures.length > 0) {
  console.error("CSS cascade isolation failed:\n");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log(`CSS cascade isolation passed across ${cssFiles.length} stylesheets.`);
}
