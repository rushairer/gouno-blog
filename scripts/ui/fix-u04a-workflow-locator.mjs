import { readFile, writeFile } from "node:fs/promises";

const path = "blog-frontend/e2e/ai-workspace-interactions.pw.mjs";
const before = 'getByRole("heading", { name: "Run conclusion" })';
const after = 'getByRole("heading", { name: "Run summary" })';
const source = await readFile(path, "utf8");
if (!source.includes(before)) throw new Error("expected U04a locator source not found");
await writeFile(path, source.replace(before, after));
