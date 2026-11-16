import {mkdir,copyFile,cp,rm} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=path.dirname(fileURLToPath(import.meta.url)),dest=path.join(root,'dist');
await rm(dest,{recursive:true,force:true});await mkdir(dest,{recursive:true});
for(const file of ['index.html','app.js','style.css','schema.js','runtime.js','exporter.js','demo.js','config.js','source-reader.js','sw.js','legacy-player.html','legacy-player.js'])await copyFile(path.join(root,file),path.join(dest,file));
await cp(path.join(root,'vendor'),path.join(dest,'vendor'),{recursive:true});
await copyFile(path.join(root,'.nojekyll'),path.join(dest,'.nojekyll'));
console.log('Static build ready: dist/. Server configuration and secrets are not included.');
