const fs=require('node:fs');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const root=path.join(__dirname,'..');
const files=['server.js','public/app.js','public/core.js','scripts/generate-demo.js','scripts/check.js','tests/core.test.js','tests/repeat.test.js','tests/editor.test.cjs','tests/server.test.js'];
for(const file of files){const result=spawnSync(process.execPath,['--check',path.join(root,file)],{stdio:'inherit'});if(result.status!==0)process.exit(result.status||1);}
const html=fs.readFileSync(path.join(root,'public/index.html'),'utf8');
const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
if(new Set(ids).size!==ids.length)throw new Error('Duplicate HTML control IDs');
const source=fs.readFileSync(path.join(root,'public/app.js'),'utf8');
for(const [,id] of source.matchAll(/\$\('([^']+)'\)/g))if(!ids.includes(id))throw new Error('Missing HTML control: '+id);
console.log('JavaScript syntax and HTML control references passed.');
