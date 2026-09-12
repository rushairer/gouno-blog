import { readFile, writeFile } from "node:fs/promises";

const targets = [
  "src/components/agent/AgentRunRecords.tsx",
  "src/components/agent/WorkflowRunRecords.tsx",
];

for (const path of targets) {
  const source = await readFile(path, "utf8");
  const pattern = /<button\s+type="button"\s+className="min-w-0 flex-1 text-left"\s+onClick=\{([^}]+)\}\s*>([\s\S]*?)<\/button>/g;
  const matches = [...source.matchAll(pattern)];
  if (matches.length !== 1) {
    throw new Error(`${path}: expected one record-row native button, found ${matches.length}`);
  }
  const next = source.replace(pattern, (_match, onClick, children) => {
    const inlineChildren = children
      .replaceAll("<div", "<span")
      .replaceAll("</div>", "</span>");
    return `<Button\n  type="button"\n  variant="ghost"\n  className="h-auto min-w-0 flex-1 justify-start p-0 text-left hover:bg-transparent"\n  onClick={${onClick}}\n>${inlineChildren}</Button>`;
  });
  await writeFile(path, next);
}
