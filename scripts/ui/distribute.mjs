import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  copyFileSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../..');
const ui = path.join(root, 'packages/ui');
execFileSync('npm', ['run', 'build'], { cwd: ui, stdio: 'inherit' });
const packed = JSON.parse(
  execFileSync('npm', ['pack', '--json'], { cwd: ui, encoding: 'utf8' }),
)[0];
const sourceArchive = path.join(ui, packed.filename);
const archiveName = `gouno-ui-legacy-${packed.version}.tgz`;
const archiveBytes = readFileSync(sourceArchive);
const sha256 = createHash('sha256').update(archiveBytes).digest('hex');
const integrity = `sha512-${createHash('sha512').update(archiveBytes).digest('base64')}`;
const targets = process.argv.slice(2);

if (!targets.length) throw new Error('Pass frontend directories explicitly');

for (const arg of targets) {
  const dir = path.resolve(arg);
  const vendor = path.join(dir, 'vendor');
  const spec = `file:vendor/${archiveName}`;
  mkdirSync(vendor, { recursive: true });

  for (const name of readdirSync(vendor)) {
    if (
      name.startsWith('gouno-ui-legacy-') &&
      name.endsWith('.tgz') &&
      name !== archiveName
    ) {
      unlinkSync(path.join(vendor, name));
    }
  }
  copyFileSync(sourceArchive, path.join(vendor, archiveName));
  writeFileSync(
    path.join(vendor, 'legacy-ui-manifest.json'),
    `${JSON.stringify(
      {
        name: packed.name,
        alias: '@gouno/ui-legacy',
        version: packed.version,
        archive: archiveName,
        sha256,
        integrity,
        source: 'gouno-blog/packages/ui',
      },
      null,
      2,
    )}\n`,
  );

  const packagePath = path.join(dir, 'package.json');
  const json = JSON.parse(readFileSync(packagePath, 'utf8'));
  json.dependencies['@gouno/ui-legacy'] = spec;
  writeFileSync(packagePath, `${JSON.stringify(json, null, 2)}\n`);

  const lockPath = path.join(dir, 'package-lock.json');
  try {
    const lock = JSON.parse(readFileSync(lockPath, 'utf8'));
    lock.packages ??= {};
    lock.packages[''] ??= {};
    lock.packages[''].dependencies ??= {};
    lock.packages[''].dependencies['@gouno/ui-legacy'] = spec;
    const uiPackage = lock.packages['node_modules/@gouno/ui-legacy'];
    if (uiPackage) {
      uiPackage.version = packed.version;
      uiPackage.resolved = spec;
      uiPackage.integrity = integrity;
    }
    writeFileSync(lockPath, `${JSON.stringify(lock, null, 2)}\n`);
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
}
