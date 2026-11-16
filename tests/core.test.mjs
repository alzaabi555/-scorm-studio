import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {newProject,readProject,validateItem,blankItem,generationPrompt,acceptGeneration} from '../schema.js';
import {demoProject} from '../demo.js';
import {safePath,manifest,readZIP,scormZIP,lessonHTML,packHTML,learnerData} from '../exporter.js';
import {strFromU8,strToU8,zipSync} from '../vendor/fflate.js';
import {generateGemini,extractImage} from '../api.mjs';
import {pdfTextFromItems} from '../source-reader.js';
globalThis.fetch=async()=>({ok:true,arrayBuffer:async()=>{const b=await readFile(new URL('../vendor/arabic.woff2',import.meta.url));return b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength)}});
test('all ten authored templates pass content validation',()=>{
  const p=demoProject();assert.equal(p.items.length,10);for(const q of p.items)assert.deepEqual(validateItem(q,p.sources,true),[]);
});
test('project roundtrip keeps content, sources and approvals',()=>{
  const p=demoProject();p.items.forEach(q=>q.reviewed=true);assert.deepEqual(readProject(JSON.parse(JSON.stringify(p))).items,p.items);
});
test('unsafe imported identifiers and image protocols rejected',()=>{
  const p=demoProject();p.sources[0].id='" onclick="alert(1)';assert.throws(()=>readProject(p));
  const x=demoProject();x.sources[0].image='javascript:alert(1)';assert.throws(()=>readProject(x));
});
test('broken answer and duplicated choice rejected',()=>{
  const q=blankItem();q.prompt='سؤال';q.options=['a','a'];q.correct=[4];assert.ok(validateItem(q).length>=2);
});
test('generation prompt includes only selected text; validates requested counts',()=>{
  const p=demoProject(),input={title:p.title,sources:p.sources,settings:{...p.settings,mode:'questions',counts:{mcq:2}}};
  assert.ok(generationPrompt(input).includes('المصادر:'));
  assert.throws(()=>generationPrompt({...input,settings:{mode:'questions',counts:{cards:3}}}));
  assert.throws(()=>generationPrompt({...input,settings:{mode:'questions',counts:{mcq:31}}}));
});
test('source quote, output count, types and duplicate questions checked',()=>{
  const p=demoProject(),data={title:p.title,sources:p.sources,settings:{...p.settings,mode:'questions',counts:{mcq:1}}};
  const q=p.items[1];assert.equal(acceptGeneration({items:[q]},data).items.length,1);
  assert.throws(()=>acceptGeneration({items:[{...q,quote:'معلومة غير موجودة'}]},data));
  assert.throws(()=>acceptGeneration({items:[q,q]},data));assert.throws(()=>acceptGeneration({items:[p.items[0]]},data));
});
test('safe ZIP paths reject traversal, absolute, encoded and backslash paths',()=>{
  for(const p of ['../bad','/a','a\\b','a/%2e%2e/b','C:bad','a/./b'])assert.throws(()=>safePath(p));
  assert.equal(safePath('assets/صورة.png'),'assets/صورة.png');
  assert.throws(()=>readZIP(zipSync({'../escape.js':strToU8('x')})));
});
test('SCORM manifest escapes XML and references launch file at root',()=>{
  const m=manifest('علم & معرفة',['index.html']);assert.ok(m.includes('علم &amp; معرفة'));assert.ok(m.includes('adlcp:scormtype="sco"'));assert.ok(m.includes('href="index.html"'));
});
test('export rejects unapproved or malformed content',async()=>{
  await assert.rejects(scormZIP(demoProject()),/اعتمد/);
  const p=demoProject();p.items.forEach(q=>q.reviewed=true);p.items[1].correct=[999];await assert.rejects(scormZIP(p));
});
test('SCORM ZIP contains offline HTML and no authoring sources or credentials',async()=>{
  const p=demoProject();p.items.forEach(q=>q.reviewed=true);p.sources.push({id:'private',name:'private',page:1,text:'SECRET_SOURCE_NOT_FOR_LEARNER',selected:false});p.settings.endpoint='SECRET_ENDPOINT';
  const files=readZIP(await scormZIP(p));assert.deepEqual(Object.keys(files).sort(),['imsmanifest.xml','index.html']);
  const html=strFromU8(files['index.html']);assert.ok(html.includes('data:font/woff2;base64,'));assert.ok(!html.includes('SECRET_'));assert.ok(!html.includes('cmi.core.score'));assert.ok(!html.includes('student_name'));
});
test('HTML script closing payload safely serialized',async()=>{
  const p=demoProject();p.items[0].body='</script><script>alert(1)</script>';const html=await lessonHTML(p);assert.ok(!html.includes('</script><script>alert'));assert.ok(html.includes('\\u003c/script>'));
});
test('HTML folder packaging retains relative resources',()=>{
  const files=readZIP(packHTML({'pages/start.html':strToU8('<h1>A</h1>'),'assets/a.css':strToU8('body{}')},['pages/start.html'],'درس'));
  assert.ok(files['content/pages/start.html']);assert.ok(files['content/assets/a.css']);assert.ok(files['imsmanifest.xml']);
});
test('Gemini adapter request contract and safe provider errors',async()=>{
  const p=demoProject(),data={title:p.title,sources:p.sources,settings:{...p.settings,mode:'questions',counts:{mcq:1}}};
  let request;const out=await generateGemini('generate',data,{key:'test-placeholder',fetchFn:async(url,init)=>{request={url,...init};return {ok:true,json:async()=>({candidates:[{content:{parts:[{text:JSON.stringify({items:[p.items[1]],warnings:[],title:p.title})}]}}]})}}});
  assert.equal(out.items.length,1);assert.ok(request.url.startsWith('https://generativelanguage.googleapis.com/'));assert.ok(JSON.parse(request.body).generationConfig.responseJsonSchema);
  await assert.rejects(generateGemini('generate',data,{key:'',fetchFn:()=>{throw Error('must not call')}}),/GEMINI_API_KEY/);
  await assert.rejects(generateGemini('generate',data,{key:'test',fetchFn:async()=>({ok:false,status:403})}),/اعتماد/);
});
test('image extraction rejects remote URLs and nonimages',()=>{
  assert.throws(()=>extractImage({image:'https://example.com/file'}));assert.throws(()=>extractImage({image:'data:text/html;base64,AAAA'}));assert.equal(extractImage({image:'data:image/png;base64,AAAA'}).mimeType,'image/png');
});
test('PDF Arabic positioned glyphs join in reading order; English stays left-to-right',()=>{
  const items=[{str:'ء',transform:[1,0,0,12,10,100],width:8},{str:'ﺎ',transform:[1,0,0,12,18,100],width:8},{str:'ﻣ',transform:[1,0,0,12,26,100],width:8}];
  assert.equal(pdfTextFromItems(items),'ماء');
  assert.equal(pdfTextFromItems([{str:'Water',transform:[1,0,0,12,10,100],width:30},{str:'cycle',transform:[1,0,0,12,50,100],width:30}]),'Water cycle');
});
