import { readdir, readFile } from 'node:fs/promises';
import { extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../src/', import.meta.url));
const files = [];

async function collect(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await collect(path);
    else if (['.css', '.ts', '.tsx'].includes(extname(entry.name))) files.push(path);
  }
}

await collect(root);
const failures = [];

for (const path of files) {
  const name = relative(root, path);
  const source = await readFile(path, 'utf8');
  if (name.endsWith('.css') && name !== 'styles/tokens.css') {
    source.split('\n').forEach((line, index) => {
      if (/#[\da-f]{3,8}\b|rgba?\(/i.test(line)) failures.push(`${name}:${index + 1} concrete color outside tokens.css`);
      if (/\bwhite\b/i.test(line) && !/white-space/i.test(line)) failures.push(`${name}:${index + 1} literal white outside tokens.css`);
      if (/!important/.test(line)) failures.push(`${name}:${index + 1} !important is not allowed`);
    });
  }
  if (name.endsWith('.tsx') && name !== 'components/ui.tsx' && name !== 'components/ui/Form.tsx' && /<select\b/.test(source)) {
    failures.push(`${name}: native select must use the shared Select component`);
  }
  if (name.endsWith('.css') && name !== 'styles/components.css') {
    source.split('\n').forEach((line, index) => {
      if (/^\.(panel|field|input-field|btn|icon-button|feedback|state)\s*[{,:]/.test(line.trim())) {
        failures.push(`${name}:${index + 1} shared primitive is owned by styles/components.css`);
      }
    });
  }
}

if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}

console.log(`UI contracts passed across ${files.length} source files.`);
