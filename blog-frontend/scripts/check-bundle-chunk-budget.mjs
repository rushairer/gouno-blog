#!/usr/bin/env node
// Enforce the established Vite 500 kB per-chunk warning as a failing release
// quality gate. Check *all* emitted JavaScript chunks, not just the entry:
// merely moving a monolithic bundle into a renamed vendor chunk is not a fix.
import { readdir, stat } from "node:fs/promises";
import { resolve, join } from "node:path";

const output = resolve(process.cwd(), "dist", "assets");
const MAX_CHUNK_BYTES = 500_000;

const files = (await readdir(output)).filter((name) => name.endsWith(".js"));
if (files.length === 0) {
  throw new Error("Vite emitted no JavaScript chunks: cannot verify bundle budget");
}
const sizes = await Promise.all(
  files.map(async (name) => ({
    name,
    bytes: (await stat(join(output, name))).size,
  })),
);
sizes.sort((a, b) => b.bytes - a.bytes);
for (const item of sizes.slice(0, 8)) {
  console.log(
    `JavaScript chunk ${item.name}: ${(item.bytes / 1000).toFixed(1)} kB`,
  );
}
const oversize = sizes.filter(({ bytes }) => bytes > MAX_CHUNK_BYTES);
if (oversize.length > 0) {
  throw new Error(
    `Vite chunk budget exceeded (500 kB): ${oversize
      .map(({ name, bytes }) => `${name}=${(bytes / 1000).toFixed(1)}kB`)
      .join(", ")}. Split real route/module dependencies; never suppress by raising the warning limit.`,
  );
}
console.log(
  `Verified ${sizes.length} JavaScript chunks <= 500 kB (largest: ${(
    sizes[0].bytes / 1000
  ).toFixed(1)} kB).`,
);
