import { cp, mkdir, readFile, writeFile, readdir } from 'node:fs/promises';
import path from 'node:path';
await mkdir('dist/fonts', { recursive: true });
for (const file of ['tokens.css','base.css','bootstrap.js']) await cp(`src/${file}`, `dist/${file}`);
for (const [pkg, file] of [['@fontsource-variable/inter','inter-latin-wght-normal.woff2'],['@fontsource/jetbrains-mono','jetbrains-mono-latin-400-normal.woff2']]) await cp(`node_modules/${pkg}/files/${file}`, `dist/fonts/${file}`);
for (const pkg of ['@fontsource-variable/inter','@fontsource/jetbrains-mono']) await cp(`node_modules/${pkg}/LICENSE`, `dist/fonts/${pkg.split('/').pop()}-LICENSE`);
async function fix(dir) { for (const item of await readdir(dir,{withFileTypes:true})) { const p=path.join(dir,item.name); if(item.isDirectory()) await fix(p); else if (/\.(js|ts)$/.test(p)) { let s=await readFile(p,'utf8'); s=s.replace(/(from\s+|import\s*)(['"])(@\/|\.\.?\/)([^'"]+)\2/g,(all,lead,q,prefix,rest)=> { let target=prefix==='@/'?path.relative(path.dirname(p),path.join('dist',rest)):prefix+rest; if(!target.startsWith('.')) target='./'+target; if(!/\.[a-z]+$/.test(target)) target+='.js'; return lead+q+target+q; }); await writeFile(p,s); } } }
await fix('dist');
