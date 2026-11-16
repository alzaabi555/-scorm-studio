// Memory-only package mounting. No persistent storage, no application caching.
const packages=new Map();
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));
self.addEventListener('message',e=>{
  if(e.data?.type!=='mount'||!e.source?.url?.startsWith(self.registration.scope))return;
  try{
    if(!/^[a-zA-Z0-9-]+$/.test(e.data.id))throw Error('معرف غير صالح');
    if(!Array.isArray(e.data.files)||e.data.files.length>2000)throw Error('ملفات كثيرة');
    let size=0;const map=new Map();
    for(const [name,data]of e.data.files){
      if(name.startsWith('/')||name.includes('..')||name.includes('\\'))throw Error('مسار غير آمن');
      size+=data.byteLength;if(size>100*1024*1024)throw Error('حزمة كبيرة');
      map.set(name,data);
    }
    if(packages.size>=2)packages.delete(packages.keys().next().value);
    packages.set(e.data.id,map);e.ports[0]?.postMessage({ok:true});
  }catch(error){e.ports[0]?.postMessage({ok:false,error:error.message})}
});
const types={html:'text/html',htm:'text/html',js:'text/javascript',mjs:'text/javascript',css:'text/css',svg:'image/svg+xml',png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',webp:'image/webp',gif:'image/gif',json:'application/json',woff:'font/woff',woff2:'font/woff2',mp3:'audio/mpeg',mp4:'video/mp4',xml:'application/xml',txt:'text/plain',pdf:'application/pdf'};
self.addEventListener('fetch',e=>{
  const prefix=new URL('__packages/',self.registration.scope).href,url=new URL(e.request.url);
  if(!url.href.startsWith(prefix))return;
  e.respondWith((async()=>{
    const rest=url.pathname.slice(new URL(prefix).pathname.length),slash=rest.indexOf('/'),id=rest.slice(0,slash);
    let name=rest.slice(slash+1);try{name=decodeURIComponent(name)}catch{}
    const map=packages.get(id),data=map?.get(name);
    if(!map)return new Response('انتهت ذاكرة معاينة الحزمة. ارجع إلى الأداة وافتح ZIP مجددًا.',{status:410,headers:{'Content-Type':'text/plain; charset=utf-8'}});
    if(!data)return new Response('ملف غير موجود في الحزمة',{status:404});
    return new Response(data,{headers:{'Content-Type':(types[name.split('.').pop()?.toLowerCase()]||'application/octet-stream')+(/\.html?$/i.test(name)?'; charset=utf-8':''),'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
  })());
});
