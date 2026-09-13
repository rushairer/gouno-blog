import { readFile, writeFile } from "node:fs/promises";

const path = "blog-frontend/e2e/ai-workspace-interactions.pw.mjs";
let source = await readFile(path, "utf8");
const replacements = [
  [
    '  await workflowRunRow.getByRole("button", { name: "Inspect" }).click();',
    '  await workflowRunRow.getByLabel("Inspect", { exact: true }).click();',
  ],
  [
    '  const dialog = page.getByRole("dialog");\n  await expect(dialog).toBeVisible();\n  await expect(dialog).toContainText("Copy Skill");\n  await expect(dialog.getByRole("textbox", { name: "Copied Skill name" })).toHaveValue(\n    "Editorial Operations Copy",\n  );',
    '  const copiedSkillName = page.getByRole("textbox", { name: "Copied Skill name" });\n  await expect(copiedSkillName).toBeVisible();\n  await expect(copiedSkillName).toHaveValue("Editorial Operations Copy");',
  ],
  [
    '  await expect(page.getByLabel("API Key")).toBeRequired();',
    '  await expect(page.getByLabel("API Key")).toHaveAttribute("required", "");',
  ],
];
for (const [before, after] of replacements) {
  if (!source.includes(before)) throw new Error(`expected source not found: ${before}`);
  source = source.replace(before, after);
}
await writeFile(path, source);
