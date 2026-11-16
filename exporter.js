import {zipSync,unzipSync,strToU8,strFromU8} from './vendor/fflate.js';
import {APP_NAME,TYPES,esc,validateItem} from './schema.js';
import {lessonRuntime,runtimeCSS} from './runtime.js';
let fontPromise;
async function fontCSS(){
  fontPromise ||= fetch(new URL('./vendor/arabic.woff2',import.meta.url)).then(r=>{if(!r.ok)throw Error('تعذر تحميل الخط');return r.arrayBuffer()}).then(buf=>{
    const bytes=new Uint8Array(buf);let s='';for(let i=0;i<bytes.length;i+=8192)s+=String.fromCharCode(...bytes.subarray(i,i+8192));
    return `@font-face{font-family:StudioArabic;src:url(data:font/woff2;base64,${btoa(s)}) format('woff2');font-weight:100 900}`;
  });
  return fontPromise;
}
export function learnerData(project){
  return {title:project.title,labels:TYPES,settings:{feedback:project.settings.feedback!==false,retry:project.settings.retry!==false},items:project.items.map(q=>{
    const {reviewed,sourceIds,quote,imageId,...rest}=q;
    const source=project.sources.find(s=>s.id===imageId);
    return {...rest,image:source?.image||'',imageAlt:source?.name||''};
  })};
}
export async function lessonHTML(project,previewToken=''){
  const json=JSON.stringify(learnerData(project)).replace(/</g,'\\u003c').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');
  const accent=project.settings.theme==='ocean'?'#285d77':project.settings.theme==='clay'?'#8a5336':'#28634d';
  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(project.title)}</title><style>${await fontCSS()}\n${runtimeCSS}\n:root{--accent:${accent}}</style></head><body><header><small>محتوى تعليمي تفاعلي</small><h1 id="title"></h1></header><div class="progress"><span id="bar"></span></div><div class="layout"><nav id="nav" aria-label="صفحات المحتوى"></nav><main class="content"><article id="activity"></article><div class="footer"><button id="prev">السابق</button><span id="counter"></span><div><button id="next" class="primary">التالي</button><button id="finish" class="primary" hidden>إنهاء المحتوى</button></div></div><p id="completeNote" role="status"></p></main></div><script>(${lessonRuntime.toString()})(${json},${JSON.stringify(previewToken)});</script></body></html>`;
}
export function manifest(title,paths,launch='index.html'){
  const id='lesson_'+Date.now();
  return `<?xml version="1.0" encoding="UTF-8"?>
<manifest identifier="${id}" version="1.0" xmlns="http://www.imsproject.org/xsd/imscp_rootv1p1p2" xmlns:adlcp="http://www.adlnet.org/xsd/adlcp_rootv1p2" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
<metadata><schema>ADL SCORM</schema><schemaversion>1.2</schemaversion></metadata>
<organizations default="ORG"><organization identifier="ORG"><title>${esc(title)}</title><item identifier="ITEM" identifierref="RES"><title>${esc(title)}</title></item></organization></organizations>
<resources><resource identifier="RES" type="webcontent" adlcp:scormtype="sco" href="${esc(launch)}">${paths.map(p=>`<file href="${esc(p)}"/>`).join('')}</resource></resources></manifest>`;
}
export function assertExport(project){
  if(!project.items.length)throw Error('أضف محتوى أولًا');
  if(!project.title.trim())throw Error('اكتب عنوان المشروع');
  for(const q of project.items){
    const errors=validateItem(q,project.sources);
    if(errors.length)throw Error(`${q.title}: ${errors[0]}`);
    if(!q.reviewed)throw Error('اعتمد جميع العناصر بعد مراجعتها قبل التصدير');
  }
}
export async function scormZIP(project){
  assertExport(project);
  const html=await lessonHTML(project);
  return zipSync({'index.html':strToU8(html),'imsmanifest.xml':strToU8(manifest(project.title,['index.html']))},{level:6});
}
export function download(content,name,type='application/octet-stream'){
  const blob=content instanceof Blob?content:new Blob([content],{type}),url=URL.createObjectURL(blob);
  const a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
}
export function safePath(path){
  if(typeof path!=='string'||!path||path.length>600||path.startsWith('/')||path.includes('\\')||path.includes('\0')||/^[A-Za-z]+:/.test(path))throw Error('مسار ملف غير آمن');
  let decoded=path;try{decoded=decodeURIComponent(path)}catch{throw Error('مسار ملف غير صالح')}
  if(decoded.split('/').some(p=>p==='..'||p==='.')||decoded.includes('\\')||decoded.startsWith('/'))throw Error('مسار ملف غير آمن');
  return path;
}
export function readZIP(buffer){
  if(buffer.byteLength>50*1024*1024)throw Error('أقصى حجم للملف المضغوط 50 MB');
  let total=0,count=0;
  const files=unzipSync(new Uint8Array(buffer),{filter:file=>{
    safePath(file.name);
    count++;total+=file.originalSize;
    if(count>2000||total>100*1024*1024)throw Error('الحزمة تتجاوز 2000 ملف أو 100 MB بعد الفك');
    return !file.name.endsWith('/');
  }});
  return files;
}
export function parseManifest(files){
  if(!files['imsmanifest.xml'])throw Error('يجب أن يكون imsmanifest.xml في جذر الحزمة');
  const text=strFromU8(files['imsmanifest.xml']);
  if(/<!DOCTYPE|<!ENTITY/i.test(text))throw Error('تعريفات XML الخارجية غير مسموحة');
  const xml=new DOMParser().parseFromString(text,'application/xml');
  if(xml.querySelector('parsererror'))throw Error('ملف التعريف XML غير صالح');
  const version=xml.getElementsByTagNameNS('*','schemaversion')[0]?.textContent?.trim();
  if(version!=='1.2')throw Error('هذه المعاينة تدعم SCORM 1.2 فقط');
  const resources=[...xml.getElementsByTagNameNS('*','resource')],items=[...xml.getElementsByTagNameNS('*','item')];
  const launchItems=items.map(item=>{
    const res=resources.find(r=>r.getAttribute('identifier')===item.getAttribute('identifierref'));
    if(!res||!res.getAttribute('href'))return null;
    if(res.getAttribute('xml:base')||xml.documentElement.getAttribute('xml:base'))throw Error('الحزم ذات xml:base غير مدعومة في هذه النسخة');
    const href=res.getAttribute('href');const path=href.split(/[?#]/)[0];safePath(path);
    if(!files[path]&&!files[decodeURIComponent(path)])throw Error(`ملف التشغيل غير موجود: ${path}`);
    return {title:item.getElementsByTagNameNS('*','title')[0]?.textContent||path,href};
  }).filter(Boolean);
  if(!launchItems.length)throw Error('لم يُعثر على عنصر قابل للتشغيل');
  return launchItems;
}
export function packHTML(files,pages,title){
  if(!pages.length)throw Error('اختر صفحة HTML واحدة على الأقل');
  const out={};
  for(const [p,data] of Object.entries(files))out['content/'+safePath(p)]=data;
  const pageJSON=JSON.stringify(pages).replace(/</g,'\\u003c');
  const html=`<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><style>body{margin:0;font:16px sans-serif}header{display:flex;gap:8px;padding:12px;background:#edf3ec}button,select{padding:10px;font:inherit}iframe{width:100%;height:calc(100vh - 90px);border:0}</style><header><select id="pages" aria-label="صفحات الدرس"></select><button id="prev">السابق</button><button id="next">التالي</button><button id="done">إنهاء المحتوى</button></header><iframe id="frame" title="الدرس"></iframe><script>(${htmlWrapper.toString()})(${pageJSON});</script></html>`;
  out['index.html']=strToU8(html);
  out['imsmanifest.xml']=strToU8(manifest(title,Object.keys(out)));
  return zipSync(out,{level:6});
}
function htmlWrapper(pages){
  let api=null,w=window,i=0,done=false;
  for(let n=0;n<20;n++)try{if(w.API){api=w.API;break}if(w.parent===w)break;w=w.parent}catch{break}
  const call=(fn,...a)=>{try{return api?.[fn](...a)}catch{return ''}};
  call('LMSInitialize','');if(!['completed','passed'].includes(call('LMSGetValue','cmi.core.lesson_status')))call('LMSSetValue','cmi.core.lesson_status','incomplete');
  const old=+call('LMSGetValue','cmi.core.lesson_location');if(Number.isInteger(old)&&old>=0&&old<pages.length)i=old;
  const select=document.getElementById('pages'),frame=document.getElementById('frame');
  pages.forEach((p,n)=>{const o=document.createElement('option');o.value=n;o.textContent=p;select.append(o)});
  function show(){select.value=i;frame.src='content/'+pages[i];call('LMSSetValue','cmi.core.lesson_location',String(i));call('LMSCommit','')}
  select.onchange=()=>{i=+select.value;show()};
  document.getElementById('prev').onclick=()=>{i=Math.max(0,i-1);show()};
  document.getElementById('next').onclick=()=>{i=Math.min(pages.length-1,i+1);show()};
  function complete(){call('LMSSetValue','cmi.core.lesson_status','completed');call('LMSCommit','');document.getElementById('done').textContent='تم الإكمال'}
  document.getElementById('done').onclick=complete;
  window.SCORMBridge={complete,setScore:()=>false,setStatus:s=>{if(s==='completed')complete()},saveState:()=>false,getState:()=>null};
  window.addEventListener('pagehide',()=>{if(!done){done=true;call('LMSCommit','');call('LMSFinish','')}});
  show();
}
