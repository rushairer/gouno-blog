import { readFile, writeFile } from "node:fs/promises";

const path = "blog-frontend/e2e/ai-workspace-interactions.pw.mjs";
let source = await readFile(path, "utf8");

const replacements = [
  [
    '  await expect(page.getByRole("list", { name: "Workflow run list" })).toBeVisible();\n  await page.getByRole("button", { name: "Inspect" }).first().click();',
    '  const workflowRunList = page.getByRole("list", { name: "Workflow run list" });\n  await expect(workflowRunList).toBeVisible();\n  const workflowRunRow = workflowRunList\n    .getByRole("listitem")\n    .filter({ hasText: "Run #201" });\n  await workflowRunRow.getByRole("button", { name: "Inspect" }).click();',
  ],
  [
    '  const dialog = page.getByRole("dialog", { name: "Copy Skill" });\n  await expect(dialog).toBeVisible();',
    '  const dialog = page.getByRole("dialog");\n  await expect(dialog).toBeVisible();\n  await expect(dialog).toContainText("Copy Skill");',
  ],
  [
    '  await expect(page.getByText("OpenAI Primary")).toBeVisible();\n  await expect(page.getByText("Primary Embeddings")).toBeVisible();',
    '  await expect(page.getByText("OpenAI Primary", { exact: true })).toBeVisible();',
  ],
  [
    '  await expect(page.getByLabel("API Key")).toBeRequired();\n  await expectNoDocumentOverflow(page);',
    '  await expect(page.getByLabel("API Key")).toBeRequired();\n  await page.getByRole("tab", { name: "Knowledge index" }).click();\n  await expect(page.getByText("Primary Embeddings", { exact: true })).toBeVisible();\n  expect(new URL(page.url()).searchParams.get("section")).toBe("knowledge");\n  await expectNoDocumentOverflow(page);',
  ],
];

for (const [before, after] of replacements) {
  if (!source.includes(before)) throw new Error(`expected source not found: ${before}`);
  source = source.replace(before, after);
}

await writeFile(path, source);
