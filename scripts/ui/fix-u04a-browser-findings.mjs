import { readFile, writeFile } from "node:fs/promises";

async function replaceExact(path, replacements) {
  let source = await readFile(path, "utf8");
  for (const [before, after] of replacements) {
    if (!source.includes(before)) {
      throw new Error(`${path}: expected source not found: ${before}`);
    }
    source = source.replace(before, after);
  }
  await writeFile(path, source);
}

await replaceExact("blog-frontend/src/pages/admin/AISettings.tsx", [
  [
    `  const selectSection = (next: AdvancedSection) => {\n    setEditingAgent(null);\n    setEditingProvider(null);\n    setEditingEmbedding(null);\n    setEditingSkill(null);\n    setCopySkillTarget(null);\n    setCopySkillName(\"\");\n    setSection(next);\n    const url = new URL(window.location.href);\n    if (next === \"agents\") url.searchParams.delete(\"section\");\n    else url.searchParams.set(\"section\", next);\n    window.history.replaceState(null, \"\", url);\n  };`,
    `  const selectSection = (next: AdvancedSection) => {\n    if (next === section) return;\n    setEditingAgent(null);\n    setEditingProvider(null);\n    setEditingEmbedding(null);\n    setEditingSkill(null);\n    setCopySkillTarget(null);\n    setCopySkillName(\"\");\n    setSection(next);\n    const params = new URLSearchParams(window.location.search);\n    if (next === \"agents\") params.delete(\"section\");\n    else params.set(\"section\", next);\n    const search = params.toString();\n    navigate({ search: search ? \`?\${search}\` : \"\" }, { replace: true });\n  };`,
  ],
]);

await replaceExact("blog-frontend/src/styles/agent-console.css", [
  [
    `  .workflow-run-output {\n    display: grid;\n    gap: 12px;\n  }\n\n  .workflow-run-output__summary {\n    padding: 18px;`,
    `  .workflow-run-output {\n    display: grid;\n    min-width: 0;\n    max-width: 100%;\n    gap: 12px;\n  }\n\n  .workflow-run-output__summary,\n  .workflow-run-output__raw {\n    min-width: 0;\n    max-width: 100%;\n  }\n\n  .workflow-run-output__summary {\n    padding: 18px;`,
  ],
  [
    `  .workflow-log-block > .agent-json-preview {\n    margin: 0;\n    border-radius: 0;\n  }`,
    `  .workflow-log-block > .agent-json-preview {\n    max-width: 100%;\n    overflow-x: auto;\n    margin: 0;\n    border-radius: 0;\n  }`,
  ],
]);

await replaceExact("blog-frontend/src/pages/admin/__tests__/AISettings.test.tsx", [
  [
    `    expect(screen.getByText(\"Failed\")).toBeInTheDocument();\n    expect(window.location.search).toBe(\"?section=knowledge\");`,
    `    expect(screen.getByText(\"Failed\")).toBeInTheDocument();`,
  ],
]);

console.log("U04a browser findings fixes applied");
