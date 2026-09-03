import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const fromRoot = (...parts) => path.join(projectRoot, ...parts);

function indent(source) {
  return source
    .trim()
    .split("\n")
    .map((line) => (line ? `  ${line}` : ""))
    .join("\n");
}

function splitLeadingImports(source) {
  const imports = [];
  let remaining = source.trimStart();

  while (remaining.startsWith("@import ")) {
    const newline = remaining.indexOf("\n");
    const statement = (newline < 0 ? remaining : remaining.slice(0, newline)).trim();
    if (!statement.endsWith(";")) throw new Error("Unterminated CSS import");
    if (!statement.includes("tailwindcss")) imports.push(statement);
    remaining = newline < 0 ? "" : remaining.slice(newline + 1).trimStart();
  }

  return { imports, remaining };
}

function removeStandaloneBoxSizing(source) {
  return source.replace(
    /^(?:\*\s*,\s*\*::before\s*,\s*\*::after|\*)\s*\{\s*box-sizing:\s*border-box;\s*\}\s*/,
    "",
  );
}

async function migrateIndex() {
  const file = fromRoot("src/index.css");
  const original = await readFile(file, "utf8");
  if (original.includes("@layer components")) return;

  const { imports, remaining } = splitLeadingImports(original);
  const rest = removeStandaloneBoxSizing(remaining);
  const componentMarker = rest.indexOf(".app-container {");
  if (componentMarker < 0) {
    throw new Error("Unable to locate .app-container component boundary");
  }

  const base = rest.slice(0, componentMarker);
  const components = rest.slice(componentMarker);
  const migrated = [
    imports.join("\n"),
    `@layer base {\n${indent(base)}\n}`,
    `@layer components {\n${indent(components)}\n}`,
  ]
    .filter(Boolean)
    .join("\n\n");

  await writeFile(file, `${migrated}\n`);
}

async function wrapFile(relativePath, layer, transform = (source) => source) {
  const file = fromRoot(relativePath);
  const source = await readFile(file, "utf8");
  if (source.includes(`@layer ${layer}`)) return;
  const prepared = transform(source);
  await writeFile(file, `@layer ${layer} {\n${indent(prepared)}\n}\n`);
}

async function updateMain() {
  const file = fromRoot("src/main.tsx");
  let source = await readFile(file, "utf8");
  if (source.includes("./styles/tailwind.css")) return;

  source = source.replace(
    'import "./styles/tokens.css";\nimport "./styles/base.css";\nimport "./index.css";\nimport "./styles/redesign.css";\nimport "./styles/components.css";\nimport "./styles/design-system-alignment.css";',
    'import "./styles/tailwind.css";\nimport "./styles/tokens.css";\nimport "./styles/base.css";\nimport "./index.css";\nimport "./styles/redesign.css";\nimport "./styles/components.css";\nimport "./styles/design-system-alignment.css";\nimport "./styles/accessibility.css";',
  );
  if (!source.includes("./styles/tailwind.css")) {
    throw new Error("Unable to update CSS import order in src/main.tsx");
  }
  await writeFile(file, source);
}

async function updatePackage() {
  const file = fromRoot("package.json");
  const manifest = JSON.parse(await readFile(file, "utf8"));
  manifest.scripts["lint:css"] = "node scripts/check-css-cascade.mjs";
  manifest.scripts.quality =
    "npm run format:check && npm run lint && npm run lint:ui && npm run lint:css && tsc -b && npm run test:coverage && npm run build";
  await writeFile(file, `${JSON.stringify(manifest, null, 2)}\n`);
}

async function updateDesignSystem() {
  const file = fromRoot("DESIGN_SYSTEM.md");
  let source = await readFile(file, "utf8");
  if (source.includes("## CSS cascade isolation")) return;

  source = source.replace(
    "## Repository boundaries",
    `## CSS cascade isolation\n\n- Tailwind is imported exactly once from \`src/styles/tailwind.css\`, which must be the first CSS entry loaded by \`main.tsx\`.\n- Global document defaults live in \`@layer base\`; reusable product styles live in \`@layer components\`; semantic variables live in \`@layer theme\`.\n- Accessibility overrides that must outrank utilities live in the final \`overrides\` layer.\n- Unlayered source rules and standalone universal spacing resets are rejected by \`npm run lint:css\`.\n\n## Repository boundaries`,
  );
  await writeFile(file, source);
}

await writeFile(
  fromRoot("src/styles/tailwind.css"),
  '@import "tailwindcss";\n\n@layer overrides;\n',
);
await writeFile(
  fromRoot("src/styles/accessibility.css"),
  `@layer overrides {\n  @media (prefers-reduced-motion: reduce) {\n    *,\n    *::before,\n    *::after {\n      scroll-behavior: auto !important;\n      animation-duration: 0.01ms !important;\n      animation-iteration-count: 1 !important;\n      transition-duration: 0.01ms !important;\n    }\n  }\n}\n`,
);

await migrateIndex();
await wrapFile("src/styles/tokens.css", "theme");
await wrapFile("src/styles/base.css", "base", removeStandaloneBoxSizing);
await wrapFile("src/styles/redesign.css", "components");
await wrapFile("src/styles/components.css", "components");
await wrapFile("src/styles/design-system-alignment.css", "components");
await wrapFile("src/styles/agent-console.css", "components");
await updateMain();
await updatePackage();
await updateDesignSystem();

console.log("Gouno Blog CSS cascade migration completed.");
