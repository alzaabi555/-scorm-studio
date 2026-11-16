import {mkdir,copyFile,access} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.dirname(fileURLToPath(import.meta.url));
const required=['index.html','style.css','zip.js','sw.js','app.js','runtime.html','demo.html','player.html','player.js'];
for(const name of required){try{await access(path.join(root,name))}catch(e){throw Error('Missing original SCORM Studio file: '+name)}}
await mkdir(path.join(root,'dist'),{recursive:true});
for(const name of required)await copyFile(path.join(root,name),path.join(root,'dist',name));
try{await copyFile(path.join(root,'.nojekyll'),path.join(root,'dist','.nojekyll'))}catch(e){}
console.log('Static site copied to dist. No application bundling or external dependencies required.');
