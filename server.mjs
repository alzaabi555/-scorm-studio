import http from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const args=process.argv.slice(2);
function option(name){const i=args.indexOf(name);if(i>=0)return args[i+1];return args.find(x=>x.startsWith(name+'='))?.slice(name.length+1)}
const port=Number(option('--port')||process.env.PORT||3000);
const host=option('--host')||process.env.HOST||'0.0.0.0';
if(!Number.isInteger(port)||port<1||port>65535)throw Error('Invalid port');
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),args.includes('--dist')?'dist':'.');
const allowed=new Set(['index.html','style.css','zip.js','sw.js','app.js','runtime.html','demo.html','player.html','player.js','.nojekyll']);
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8'};
const server=http.createServer(async(req,res)=>{
  const send=(status,text)=>{res.writeHead(status,{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store'});res.end(text)};
  if(req.method!=='GET'&&req.method!=='HEAD'){res.setHeader('Allow','GET, HEAD');return send(405,'Method not allowed')}
  try{
    const u=new URL(req.url,'http://localhost');
    const name=decodeURIComponent(u.pathname)==='/'?'index.html':decodeURIComponent(u.pathname).slice(1);
    if(!allowed.has(name))return send(404,'Not found');
    const file=path.join(root,name);
    const body=await readFile(file);
    res.writeHead(200,{'Content-Type':types[path.extname(name)]||'application/octet-stream','Content-Length':body.length,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
    res.end(req.method==='HEAD'?undefined:body);
  }catch(e){send(e.code==='ENOENT'?404:400,e.code==='ENOENT'?'File missing. Keep the original SCORM Studio static files.':'Invalid request')}
});
server.on('error',e=>{console.error(e.message);process.exit(1)});
server.listen(port,host,()=>console.log(`SCORM Studio listening on http://${host}:${port}`));
