import { execFileSync } from 'node:child_process';
import { readFileSync, mkdirSync, copyFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'../..');
const ui=path.join(root,'packages/ui');
execFileSync('npm',['run','build'],{cwd:ui,stdio:'inherit'});
const packed=JSON.parse(execFileSync('npm',['pack','--json'],{cwd:ui,encoding:'utf8'}))[0];
const archive=path.join(ui,packed.filename);
const sha256=createHash('sha256').update(readFileSync(archive)).digest('hex');
const targets=process.argv.slice(2);
if(!targets.length)throw new Error('Pass frontend directories explicitly');
for(const arg of targets){const dir=path.resolve(arg);mkdirSync(path.join(dir,'vendor'),{recursive:true});copyFileSync(archive,path.join(dir,'vendor',packed.filename));writeFileSync(path.join(dir,'vendor/ui-manifest.json'),JSON.stringify({name:packed.name,version:packed.version,archive:packed.filename,sha256,integrity:packed.integrity,source:'gouno-blog/packages/ui'},null,2)+'\n');const p=path.join(dir,'package.json');const json=JSON.parse(readFileSync(p));json.dependencies['@gouno/ui']=`file:vendor/${packed.filename}`;writeFileSync(p,JSON.stringify(json,null,2)+'\n');}
