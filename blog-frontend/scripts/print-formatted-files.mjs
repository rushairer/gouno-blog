import { readFile } from "node:fs/promises";

const files = [
  "src/components/ui/Badge.tsx",
  "src/components/ui/Button.tsx",
  "src/components/ui/Dialog.tsx",
  "src/styles/design-system-alignment.css",
];

for (const file of files) {
  const content = await readFile(file);
  const encoded = content.toString("base64");
  const wrapped = encoded.match(/.{1,120}/g)?.join("\n") || "";
  console.log(`FORMATTED_FILE_BEGIN ${file}\n${wrapped}\nFORMATTED_FILE_END ${file}`);
}
