import { readdir, readFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const frontendRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const assetsDirectory = resolve(frontendRoot, process.argv[2] ?? "dist/assets");
const javascriptFiles = (await readdir(assetsDirectory))
  .filter((file) => file.endsWith(".js"))
  .map((file) => resolve(assetsDirectory, file));

const graph = new Map();
const staticImportPattern =
  /(?:^|;)\s*import\s*(?:[^'";]+?\s*from\s*)?['"]([^'"]+)['"]/g;

for (const file of javascriptFiles) {
  const source = await readFile(file, "utf8");
  const dependencies = [];

  for (const match of source.matchAll(staticImportPattern)) {
    if (!match[1].startsWith(".")) continue;
    dependencies.push(resolve(dirname(file), match[1]));
  }

  graph.set(file, dependencies);
}

const visited = new Set();
const visiting = new Set();
const path = [];

function findCycle(file) {
  if (visiting.has(file)) {
    const cycleStart = path.indexOf(file);
    return [...path.slice(cycleStart), file];
  }
  if (visited.has(file) || !graph.has(file)) return null;

  visiting.add(file);
  path.push(file);

  for (const dependency of graph.get(file)) {
    const cycle = findCycle(dependency);
    if (cycle) return cycle;
  }

  path.pop();
  visiting.delete(file);
  visited.add(file);
  return null;
}

for (const file of javascriptFiles) {
  const cycle = findCycle(file);
  if (!cycle) continue;

  console.error(
    `Static chunk dependency cycle detected: ${cycle.map((entry) => basename(entry)).join(" -> ")}`,
  );
  process.exit(1);
}

console.log(
  `Verified ${javascriptFiles.length} JavaScript chunks have no static dependency cycles.`,
);
