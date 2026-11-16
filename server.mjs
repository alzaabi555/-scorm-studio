import http from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {timingSafeEqual} from 'node:crypto';
import {generateGemini} from './api.mjs';
const dir=path.dirname(fileURLToPath(import.meta.url)),root=process.argv.includes('--dist')?path.join(dir,'dist'):dir;
const port=Number(process.env.PORT)||3000,limiter=new Map();
const allowedOrigin=(process.env.ALLOWED_ORIGIN||'').replace(/\/$/,'');
const access=process.env.STUDIO_ACCESS_TOKEN||'';
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.woff2':'font/woff2','.json':'application/json','.txt':'text/plain; charset=utf-8','.md':'text/markdown; charset=utf-8'};
const publicFiles=new Set(['index.html','app.js','style.css','schema.js','runtime.js','exporter.js','demo.js','config.js','source-reader.js','sw.js','legacy-player.html','legacy-player.js']);
function json(res,status,obj){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(obj))}
function equal(a,b){const x=Buffer.from(a),y=Buffer.from(b);return x.length===y.length&&timingSafeEqual(x,y)}
async function body(req){
  if(!req.headers['content-type']?.includes('application/json'))throw Object.assign(Error('استخدم application/json'),{status:415});
  let total=0;const parts=[];
  for await(const chunk of req){total+=chunk.length;if(total>8*1024*1024)throw Object.assign(Error('الطلب أكبر من 8 MB'),{status:413});parts.push(chunk)}
  try{return JSON.parse(Buffer.concat(parts).toString('utf8'))}catch{throw Object.assign(Error('JSON غير صالح'),{status:400})}
}
http.createServer(async(req,res)=>{
  res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
  let pathname;try{pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname)}catch{return json(res,400,{error:'مسار غير صالح'})}
  if(pathname.startsWith('/api/')){
    const origin=req.headers.origin;
    const sameOrigin=origin&&[ `http://${req.headers.host}`,`https://${req.headers.host}`].includes(origin);
    if(origin&&!sameOrigin&&origin!==allowedOrigin)return json(res,403,{error:'هذا الأصل غير مسموح. اضبط ALLOWED_ORIGIN على الخادم.'});
    if(origin){res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Vary','Origin')}
    res.setHeader('Access-Control-Allow-Methods','POST, OPTIONS');res.setHeader('Access-Control-Allow-Headers','Content-Type, Authorization');
    if(req.method==='OPTIONS'){res.writeHead(204);return res.end()}
    if(req.method!=='POST')return json(res,405,{error:'استخدم POST'});
    const route=pathname.slice(5);
    if(route==='health')return json(res,200,{ready:!!process.env.GEMINI_API_KEY,version:'2.0.0'});
    if(!['generate','extract'].includes(route))return json(res,404,{error:'مسار غير موجود'});
    const local=['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress);
    if((access&&!equal(req.headers.authorization||'',`Bearer ${access}`))||(!access&&!local))return json(res,401,{error:'أدخل رمز وصول الخدمة الخاصة. النشر العام يتطلب STUDIO_ACCESS_TOKEN.'});
    const identity=req.socket.remoteAddress,now=Date.now(),prev=limiter.get(identity)||{count:0,at:now};
    if(now-prev.at>3600000){prev.count=0;prev.at=now}
    if(prev.count>=30)return json(res,429,{error:'الحد 30 طلبًا في الساعة لهذا الاتصال.'});
    prev.count++;limiter.set(identity,prev);
    for(const [id,v]of limiter)if(now-v.at>3600000)limiter.delete(id);
    try{return json(res,200,await generateGemini(route,await body(req)))}catch(e){return json(res,e.status||400,{error:e.name==='TimeoutError'?'انتهت مهلة المزود. قلل عدد العناصر وحاول مجددًا.':e.message})}
  }
  if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);return res.end()}
  const name=pathname==='/'?'index.html':pathname.slice(1);
  if(name.includes('..')||name.includes('\\')||!(publicFiles.has(name)||/^vendor\/[A-Za-z0-9._-]+$/.test(name))){res.writeHead(404);return res.end('Not found')}
  try{const file=path.join(root,name);if(!(await stat(file)).isFile())throw Error();const bytes=await readFile(file);res.writeHead(200,{'Content-Type':mime[path.extname(name)]||'text/plain','Cache-Control':'no-cache'});res.end(req.method==='HEAD'?undefined:bytes)}catch{res.writeHead(404);res.end('Not found')}
}).listen(port,'0.0.0.0',()=>console.log(`Studio 2.0 listening on port ${port}. AI ${process.env.GEMINI_API_KEY?'configured':'not configured'}.`));
