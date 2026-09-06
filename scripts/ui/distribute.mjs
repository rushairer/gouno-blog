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
for(const arg of targets){
  const dir=path.resolve(arg);
  const spec=`file:vendor/${packed.filename}`;
  mkdirSync(path.join(dir,'vendor'),{recursive:true});
  copyFileSync(archive,path.join(dir,'vendor',packed.filename));
  writeFileSync(path.join(dir,'vendor/ui-manifest.json'),JSON.stringify({name:packed.name,version:packed.version,archive:packed.filename,sha256,integrity:packed.integrity,source:'gouno-blog/packages/ui'},null,2)+'\n');
  const packagePath=path.join(dir,'package.json');
  const json=JSON.parse(readFileSync(packagePath));
  json.dependencies['@gouno/ui']=spec;
  writeFileSync(packagePath,JSON.stringify(json,null,2)+'\n');

  const lockPath=path.join(dir,'package-lock.json');
  try {
    const lock=JSON.parse(readFileSync(lockPath));
    lock.packages ??= {};
    lock.packages[''] ??= {};
    lock.packages[''].dependencies ??= {};
    lock.packages[''].dependencies['@gouno/ui']=spec;
    const uiPackage=lock.packages['node_modules/@gouno/ui'];
    if(uiPackage){
      uiPackage.resolved=spec;
      uiPackage.integrity=packed.integrity;
    }
    writeFileSync(lockPath,JSON.stringify(lock,null,2)+'\n');
  } catch(error) {
    if(error?.code!=='ENOENT') throw error;
  }
}
