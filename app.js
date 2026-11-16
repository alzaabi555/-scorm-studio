import {APP_NAME,TYPES,MODES,uid,esc,blankItem,newProject,readProject,validateItem,generationPrompt,acceptGeneration} from './schema.js';
import {lessonHTML,scormZIP,assertExport,download,readZIP,parseManifest,packHTML,safePath} from './exporter.js';
import {demoProject} from './demo.js';
import {DEFAULT_API_BASE} from './config.js';
import {pdfTextFromItems} from './source-reader.js';

const $=s=>document.querySelector(s);
let project=newProject(),step='source',selectedItem=0,dirty=false,busy=false,apiBase=DEFAULT_API_BASE,accessToken='',cloudConsent=false,previewToken='',previewSize='desktop',logs=[],legacyFiles={},legacyPages=[],legacyLaunches=[],legacyName='',legacyId='',toastTimer,previewRevision=0;
let checks={layout:false,answers:false,mobile:false};
const STEPS=[['source','المحتوى المصدر'],['design','خيارات الإنتاج'],['editor','تحرير المحتوى'],['preview','المعاينة والتجربة'],['export','التصدير']];
const modeNames={questions:'أسئلة فقط',activities:'أنشطة فقط',explanation:'شرح تفاعلي',mixed:'درس / مزيج مخصص'};
const stepTitles={source:['ابدأ من محتواك','أضف ملف الدرس، ثم اختر ما تريد تحويله إلى تجربة تفاعلية.'],design:['ماذا تريد أن تنتج؟','أنت تحدد الأنواع والأعداد. لن نضيف شرحًا أو أنشطة لم تطلبها.'],editor:['مساحتك للتأليف والمراجعة','عدّل كل عنصر، وراجع إجاباته ومصدره قبل اعتماده للتصدير.'],preview:['جرّب المحتوى كما سيظهر للطالب','معاينة للتفاعل والعرض فقط. لا تُجمع أسماء أو درجات هنا.'],export:['محتواك جاهز للخطوة التالية','راجع العناصر، ثم نزّل الحزمة وارفعها إلى منصتك التعليمية.'],legacy:['أدوات HTML وSCORM','تغليف ملفات HTML القائمة أو تشغيل حزمة SCORM 1.2 موثوقة.']};
function mark(invalidateChecks=true){dirty=true;const el=$('#saveState');if(el)el.textContent='تغييرات غير محفوظة';if(invalidateChecks)checks={layout:false,answers:false,mobile:false}}
function toast(text){clearTimeout(toastTimer);$('#toast').textContent=text;$('#toast').className='show';toastTimer=setTimeout(()=>$('#toast').className='',4500)}
function message(text,error=false){const el=$('#status');if(el){el.className=`notice ${error?'error':''}`;el.textContent=text}else toast(text)}
function button(action,text,cls='',extra=''){return `<button data-action="${action}" class="${cls}" ${extra}>${text}</button>`}
function closeModal(){$('#modal').close()}
function modal(title,body,foot=''){
  $('#modalBody').innerHTML=`<div class="modal-head"><h2>${esc(title)}</h2>${button('close-modal','إغلاق','quiet')}</div>${body}<div id="modalStatus" role="status"></div>${foot?`<div class="modal-foot">${foot}</div>`:''}`;
  if(!$('#modal').open)$('#modal').showModal();
}
function modalError(e){const el=$('#modalStatus');el.className='notice error';el.textContent=e.message||String(e)}
async function work(fn,label='جارٍ المعالجة…'){
  if(busy)return;busy=true;message(label);document.body.setAttribute('aria-busy','true');
  try{await fn()}catch(e){message(e.message||String(e),true)}
  finally{busy=false;document.body.removeAttribute('aria-busy')}
}
function render(){
  const info=stepTitles[step];
  $('#app').innerHTML=`<div class="shell">
  <aside class="sidebar"><div class="brand">${APP_NAME}<small>INTERACTIVE LEARNING STUDIO / 2.0</small></div>
  <div><div class="side-label">مساحة التأليف</div><nav class="steps" aria-label="مراحل التأليف">${STEPS.map(([id,name],i)=>`<button class="step ${step===id?'active':''}" data-step="${id}" aria-current="${step===id?'step':'false'}"><span class="num">${i+1}</span>${name}</button>`).join('')}</nav></div>
  <div class="side-bottom">${button('legacy','أدوات HTML وSCORM','quiet')}${button('settings','إعداد خدمة التوليد','quiet')}${button('help','دليل الاستخدام','quiet')}<div class="spacer"></div><small>للمعلم، من الفكرة إلى الحزمة.<br>لا حسابات طلبة، ولا سجلات درجات.</small></div></aside>
  <div class="workspace-shell"><header class="topbar"><div><div class="breadcrumbs">مشروعاتي / <span>${esc(project.title)}</span></div><span id="saveState" class="save-status">${dirty?'تغييرات غير محفوظة':'احفظ نسخة مشروع للعودة إلى عملك'}</span></div><div class="actions">${button('settings','إعداد التوليد','quiet')}${button('open-project','فتح مشروع')}${button('save-project','حفظ المشروع')}${button('go-preview','معاينة','primary')}</div></header>
  <main id="workspace"><div class="page-head"><div><div class="eyebrow">${step==='legacy'?'أدوات مساندة':`الخطوة ${STEPS.findIndex(x=>x[0]===step)+1} من 5`}</div><h1>${info[0]}</h1><p>${info[1]}</p></div><span class="pill"><span class="dot"></span> SCORM 1.2</span></div><div id="status" role="status"></div><div id="view"></div></main></div></div>`;
  ({source:renderSource,design:renderDesign,editor:renderEditor,preview:renderPreview,export:renderExport,legacy:renderLegacy})[step]();
  if(window.innerWidth<=760)$('.step.active')?.scrollIntoView({block:'nearest',inline:'center'});
  window.scrollTo(0,0);
}
function selectedSources(){return project.sources.filter(s=>s.selected&&s.text.trim())}
function renderSource(){
  $('#view').innerHTML=`<div class="columns"><div>
  <section class="panel"><div class="panel-head"><h2>أضف مصدر الدرس</h2><span class="small">PDF · PNG · JPG · TXT</span></div>
  <div class="dropzone" id="dropzone" role="button" tabindex="0" aria-label="رفع ملفات المحتوى"><div class="file-symbol" aria-hidden="true">↑</div><h3>اسحب ملفاتك إلى هنا</h3><p>أو اختر ملف PDF أو صورًا من جهازك</p>${button('upload-source','اختيار الملفات','primary')}<small>حتى 20 MB لكل ملف · حتى 40 صفحة PDF</small></div>
  <div class="divider">أو ابدأ بنص</div>${button('paste-text','كتابة النص أو لصقه','full')}
  <input id="sourceInput" class="file-input" type="file" multiple accept=".pdf,.png,.jpg,.jpeg,.webp,.txt">
  </section>
  <section class="panel"><div class="panel-head"><h2>مصادر المشروع <span class="muted">(${project.sources.length})</span></h2><span class="small"><b class="source-selected-count">${selectedSources().length}</b> مصدر نصّي محدد</span></div>
  ${project.sources.length?`<div class="source-list">${project.sources.map(s=>`<div class="source-row"><input type="checkbox" data-source-toggle="${esc(s.id)}" aria-label="اختيار ${esc(s.name)} صفحة ${s.page}" ${s.selected?'checked':''}><span class="file-tag">${s.image?'IMG':'TXT'}</span><div class="info"><h3>${esc(s.name)}</h3><small>صفحة ${s.page} · ${s.text.length} حرف ${!s.text.trim()?'· يحتاج قراءة الصورة':''}</small></div><div class="actions">${button('review-source','مراجعة النص','','data-id="'+s.id+'"')}${button('delete-source','حذف','quiet danger','data-id="'+s.id+'"')}</div></div>`).join('')}</div>`:`<p class="small">ستظهر هنا الصفحات المستوردة. حدد فقط الأجزاء التي تريد استخدامها في الإنتاج.</p>`}
  </section></div>
  <aside class="aside-guide"><section class="panel"><h2>جرّب قبل أن تبدأ</h2><div class="sample"><div class="sample-label">علوم · نموذج قابل للتحرير</div><h3>رحلة قطرة ماء</h3><p class="small">شرح وأسئلة وأنشطة عن دورة الماء.</p><div class="sample-cycle"><span>التبخر</span><span>التكاثف</span><span>الهطول</span><span>التجمع</span></div><small>10 قوالب تفاعلية في مشروع واحد</small></div>${button('load-demo','فتح المشروع التجريبي','full')}</section><section class="panel"><h2>من المصدر إلى التفاعل</h2><ul class="help-list"><li><b>راجع النص أولًا</b>صحح الأرقام والمصطلحات قبل الإنتاج.</li><li><b>اختر ما تحتاجه</b>سؤال واحد أو درس كامل؛ القرار لك.</li><li><b>أنت تعتمد النتيجة</b>المسودة لا تُصدّر قبل مراجعتك.</li></ul></section></aside></div>
  <div class="bottom-bar"><span class="muted small">قراءة PDF النصي تتم محليًا. القراءة الذكية للصور تتطلب خدمة وموافقتك.</span><div class="actions">${button('load-demo','تجربة مثال','quiet')}${button('go-design','التالي: خيارات الإنتاج','primary')}</div></div>`;
  const drop=$('#dropzone');
  drop.ondragover=e=>{e.preventDefault();drop.classList.add('drag')};
  drop.ondragleave=()=>drop.classList.remove('drag');
  drop.ondrop=e=>{e.preventDefault();drop.classList.remove('drag');importSources(e.dataTransfer.files)};
  drop.onclick=e=>{if(!e.target.closest('button'))$('#sourceInput').click()};
  drop.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();$('#sourceInput').click()}};
  $('#sourceInput').onchange=e=>importSources(e.target.files);
}
function renderDesign(){
  const settings=project.settings,types=MODES[settings.mode]||MODES.questions,total=Object.values(settings.counts).reduce((a,b)=>a+b,0);
  $('#view').innerHTML=`<div class="columns"><div><section class="panel"><div class="panel-head"><h2>عرّف مشروعك</h2></div><div class="fields">
  <div class="field wide"><label for="projectTitle">عنوان المحتوى</label><input id="projectTitle" data-project="title" value="${esc(project.title)}"></div>
  <div class="field"><label for="subject">المادة</label><input id="subject" data-project="subject" value="${esc(project.subject)}" placeholder="مثل: العلوم"></div>
  <div class="field"><label for="grade">الصف / الفئة المستهدفة</label><input id="grade" data-project="grade" value="${esc(project.grade)}" placeholder="مثل: الصف الخامس"></div></div></section>
  <section class="panel"><div class="panel-head"><h2>اختر شكل الناتج</h2></div><div class="mode-tabs" role="group" aria-label="نمط الإنتاج">${Object.entries(modeNames).map(([id,name])=>`<button data-mode="${id}" class="${settings.mode===id?'active':''}" aria-pressed="${settings.mode===id}">${name}</button>`).join('')}</div>
  <div class="type-grid">${types.map(t=>`<div class="type-row"><label for="count-${t}">${TYPES[t]}</label><input id="count-${t}" data-count="${t}" type="number" min="0" max="20" value="${settings.counts[t]||0}" aria-label="عدد ${TYPES[t]}"></div>`).join('')}</div><p class="small" style="margin-top:16px">ضع صفرًا لاستبعاد النوع. حتى 30 عنصرًا في كل دفعة.</p>
  <div class="spacer"></div><div class="fields"><div><label for="difficulty">الصعوبة المستهدفة</label><select id="difficulty" data-setting="difficulty">${['سهلة','متوسطة','متقدمة'].map(v=>`<option ${v===settings.difficulty?'selected':''}>${v}</option>`).join('')}</select></div>
  <div><label for="level">المستوى المعرفي</label><select id="level" data-setting="level">${['تذكر','فهم','تطبيق','استنتاج وتعليل','مزيج'].map(v=>`<option ${v===settings.level?'selected':''}>${v}</option>`).join('')}</select></div>
  <div><label for="optionCount">خيارات السؤال</label><select id="optionCount" data-setting="optionCount">${[3,4,5].map(n=>`<option value="${n}" ${n===settings.optionCount?'selected':''}>${n} خيارات</option>`).join('')}</select></div>
  <div><label for="theme">هوية العرض</label><select id="theme" data-setting="theme"><option value="forest" ${settings.theme==='forest'?'selected':''}>أخضر هادئ</option><option value="ocean" ${settings.theme==='ocean'?'selected':''}>أزرق بحري</option><option value="clay" ${settings.theme==='clay'?'selected':''}>ترابي دافئ</option></select></div>
  <div class="wide"><label for="instructions">توجيهات إضافية للمعلم</label><textarea id="instructions" data-setting="instructions" placeholder="مثل: ركّز على المقارنة بين المفاهيم، واستخدم لغة بسيطة.">${esc(settings.instructions)}</textarea></div></div>
  <div class="actions"><label class="check-inline"><input type="checkbox" data-setting="feedback" ${settings.feedback?'checked':''}>عرض التصحيح / الإجابة النموذجية</label><label class="check-inline"><input type="checkbox" data-setting="retry" ${settings.retry?'checked':''}>السماح بإعادة المحاولة</label></div></section></div>
  <aside><section class="panel"><h2>ملخص الطلب</h2><div class="summary-row"><span>المصادر المعتمدة للاستخدام</span><b>${selectedSources().length}</b></div><div class="summary-row"><span>نمط الإنتاج</span><b>${modeNames[settings.mode]}</b></div><div class="summary-row"><span>العناصر المطلوبة</span><b id="totalCount">${total}</b></div><div class="notice">الإنتاج من المحتوى المحدد فقط. إن لم يكفِ المصدر، تظهر ملاحظة بدل اختلاق معلومات.</div>${button('generate','إنتاج المسودة','primary full')}<div class="spacer"></div>${button('download-prompt','تنزيل طلب جاهز لـ AI Studio','full')}${button('import-draft','استيراد مسودة JSON','quiet full')}<p class="small">يمكن التأليف يدويًا أو نقل الطلب إلى AI Studio إذا لم تضبط خدمة التوليد المباشر.</p></section>
  <section class="panel"><h2>تفضل التأليف بنفسك؟</h2><p class="small">ابدأ بعنصر فارغ، وأضف نصوصك وإجاباتك دون استخدام الذكاء الاصطناعي.</p><div class="spacer"></div>${button('add-item','إضافة عنصر يدوي','full')}</section></aside></div>
  <div class="bottom-bar">${button('go-source','السابق: المصادر','quiet')}${button('go-editor','الانتقال إلى المحرر')}</div>`;
}
function payload(singleType){
  const settings=structuredClone(project.settings);
  if(singleType){settings.mode=MODES.questions.includes(singleType)?'questions':singleType==='explanation'?'explanation':'activities';settings.counts={[singleType]:1};settings.instructions+=`\nإعادة صياغة عنصر واحد دون تكرار: ${project.items[selectedItem]?.prompt||''}`}
  const data={title:project.title,subject:project.subject,grade:project.grade,settings,sources:selectedSources().map(({id,name,page,text})=>({id,name,page,text}))};
  generationPrompt(data);return data;
}
async function apiRequest(route,data){
  const base=apiBase.trim().replace(/\/$/,'');
  if(base&&!/^https:\/\//.test(base)&&!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(base)&&!/^\/(?!\/)/.test(base)&&!/^port\/\d+$/.test(base))throw Error('عنوان الخدمة يجب أن يبدأ بـ HTTPS');
  let response;
  try{response=await fetch(`${base}/api/${route}`,{method:'POST',headers:{'Content-Type':'application/json',...(accessToken?{'Authorization':`Bearer ${accessToken}`}:{})},body:JSON.stringify(data),signal:AbortSignal.timeout(180000)})}
  catch(e){throw Error(e.name==='TimeoutError'?'انتهت مهلة الخدمة؛ قلّل عدد العناصر وحاول مجددًا.':'تعذر الاتصال بخدمة التوليد. اضبط عنوان الخدمة، أو استخدم نقل طلب AI Studio.')}
  const type=response.headers.get('content-type')||'';
  if(!type.includes('application/json'))throw Error('خدمة التوليد غير متاحة على هذا العنوان. GitHub Pages يحتاج خدمة خلفية منفصلة أو استيراد مسودة JSON.');
  const result=await response.json();
  if(!response.ok)throw Error(result.error||'تعذر تنفيذ طلب التوليد');
  return result;
}
function askConsent(action){
  modal('الموافقة على معالجة المحتوى',`<p>سيُرسل ${action==='ocr'?'صورة الصفحة المختارة':'النص المحدد وإعدادات الإنتاج'} إلى خدمة الذكاء الاصطناعي لإتمام طلبك. لا تُرسل ملفات المشروع الأخرى أو أسماء طلبة.</p><div class="notice">أرسل فقط محتوى تملك حق استخدامه. لا تضف أي بيانات شخصية إلى المصدر.</div><label class="check-inline"><input id="cloudConsent" type="checkbox">أوافق خلال هذه الجلسة على إرسال المحتوى الذي أطلب توليده أو قراءته إلى الخدمة المضبوطة.</label>`,button('cancel-consent','إلغاء')+button('confirm-consent','متابعة','primary',`data-next="${action}"`));
}
async function generate(single=false){
  let req;try{req=payload(single?project.items[selectedItem].type:null)}catch(e){return message(e.message,true)}
  if(!cloudConsent){askConsent(single?'regenerate':'generate');return}
  if(project.items.length&&!single){
    modal('إضافة مسودة جديدة',`<p>لديك ${project.items.length} عنصرًا حاليًا. سيُضاف الناتج الجديد إلى نهاية المشروع، ولن تُحذف تعديلاتك.</p>`,button('close-modal','إلغاء')+button('run-generate','إنتاج وإضافة','primary'));return;
  }
  await runGeneration(req,single);
}
async function runGeneration(req,single=false){
  const targetId=single?project.items[selectedItem]?.id:null,projectId=project.id;
  await work(async()=>{
    const result=acceptGeneration(await apiRequest('generate',req),req);
    if(!result.items.length)throw Error(result.warnings.join(' ')||'لم ينتج المصدر عناصر مناسبة. جرّب تقليل العدد.');
    if(project.id!==projectId)throw Error('تغير المشروع أثناء التوليد؛ لم تُضف المسودة.');
    if(single){const i=project.items.findIndex(q=>q.id===targetId);if(i<0)throw Error('لم يعد العنصر موجودًا');project.items.splice(i,1,result.items[0]);selectedItem=i}
    else{if(project.items.length+result.items.length>100)throw Error('الحد الأقصى 100 عنصر بالمشروع. قلّل عدد العناصر الجديدة.');selectedItem=project.items.length;project.items.push(...result.items)}
    mark();step='editor';render();message(result.warnings.length?result.warnings.join('\n'):'تم إنتاج مسودة من مصادرك. راجعها واعتمدها عنصرًا عنصرًا.');
  },'يجري تحليل المصدر وصياغة العناصر المطلوبة. قد يستغرق ذلك دقيقة أو أكثر…');
}
function renderEditor(){
  if(!project.items.length){
    $('#view').innerHTML=`<section class="panel empty"><h2>ابدأ بعنصر، أو أنتج مسودة من محتواك</h2><p>كل سؤال أو نشاط سيظهر هنا قابلًا للتعديل، مع الإجابة والتغذية الراجعة ومرجع المصدر.</p><div class="actions" style="justify-content:center">${button('go-design','إعداد الإنتاج','primary')}${button('add-item','إضافة عنصر يدوي')}${button('load-demo','فتح المثال')}</div></section>`;return;
  }
  selectedItem=Math.max(0,Math.min(selectedItem,project.items.length-1));const q=project.items[selectedItem],errors=validateItem(q,project.sources);
  $('#view').innerHTML=`<div class="editor-toolbar"><div class="actions"><span class="pill">${project.items.length} عنصرًا</span><span class="small">${project.items.filter(x=>x.reviewed).length} معتمد</span></div><div class="actions">${button('add-item','+ إضافة عنصر')}${button('approve-all','مراجعة واعتماد الكل')}${button('go-preview','معاينة المحتوى','primary')}</div></div>
  <div class="editor-layout"><aside class="panel outline" aria-label="عناصر المحتوى">${project.items.map((x,i)=>`<button class="outline-item ${i===selectedItem?'active':''}" data-select-item="${i}"><span>${i+1}. ${esc(x.title||TYPES[x.type])}</span><small>${TYPES[x.type]} ${x.reviewed?'· معتمد':'· مسودة'}</small></button>`).join('')}</aside>
  <section class="panel"><div class="panel-head"><h2>${TYPES[q.type]}</h2><div class="actions">${button('move-up','↑','quiet',`aria-label="نقل العنصر للأعلى" ${selectedItem===0?'disabled':''}`)}${button('move-down','↓','quiet',`aria-label="نقل العنصر للأسفل" ${selectedItem===project.items.length-1?'disabled':''}`)}${button('duplicate-item','نسخ','quiet')}${button('delete-item','حذف','quiet danger')}</div></div>
  <div class="stack"><div><label for="itemTitle">عنوان العنصر</label><input id="itemTitle" data-item="title" value="${esc(q.title)}"></div>
  ${q.type==='explanation'?`<div><label for="itemBody">نص الشرح</label><textarea id="itemBody" data-item="body" style="min-height:260px">${esc(q.body)}</textarea></div>`:`<div><label for="itemPrompt">${q.type==='cards'?'تعليمات البطاقات (اختياري)':'نص السؤال / تعليمات النشاط'}</label><textarea id="itemPrompt" data-item="prompt">${esc(q.prompt)}</textarea></div>`}
  ${['mcq','multi','truefalse','order'].includes(q.type)?`<div><label>${q.type==='order'?'الخطوات بالترتيب الصحيح (ستُخلط في العرض)':'الخيارات والإجابة الصحيحة'}</label>${q.options.map((o,i)=>`<div class="option-row">${q.type!=='order'?`<input type="${q.type==='multi'?'checkbox':'radio'}" name="correct" data-correct="${i}" aria-label="الخيار ${i+1} صحيح" ${q.correct.includes(i)?'checked':''}>`:`<span>${i+1}</span>`}<input data-option="${i}" aria-label="نص الخيار ${i+1}" value="${esc(o)}" ${q.type==='truefalse'?'readonly':''}>${q.type==='truefalse'?'':button('remove-option','حذف','quiet',`data-index="${i}"`)}</div>`).join('')}${q.type==='truefalse'?'':button('add-option','+ إضافة خيار / خطوة','quiet')}</div>`:''}
  ${['fill','short'].includes(q.type)?`<div><label for="itemAnswer">${q.type==='fill'?'الإجابة الصحيحة (افصل البدائل المقبولة بعلامة |)':'الإجابة النموذجية للمقارنة الذاتية'}</label><textarea id="itemAnswer" data-item="answer">${esc(q.answer)}</textarea></div>`:''}
  ${['match','classify','cards'].includes(q.type)?`<div><label>${q.type==='match'?'المفهوم ↔ الإجابة':q.type==='classify'?'العنصر ↔ الفئة':'عنوان البطاقة ↔ محتواها'}</label>${q.pairs.map((pair,i)=>`<div class="pair-row"><input data-pair-left="${i}" aria-label="الطرف الأول ${i+1}" value="${esc(pair.left)}"><input data-pair-right="${i}" aria-label="الطرف الثاني ${i+1}" value="${esc(pair.right)}">${button('remove-pair','حذف','quiet',`data-index="${i}"`)}</div>`).join('')}${button('add-pair','+ إضافة زوج','quiet')}</div>`:''}
  ${!['explanation','cards'].includes(q.type)?`<div class="fields"><div><label for="feedback">التغذية الراجعة</label><textarea id="feedback" data-item="feedback">${esc(q.feedback)}</textarea></div><div><label for="hint">تلميح (اختياري)</label><textarea id="hint" data-item="hint">${esc(q.hint)}</textarea></div></div>`:''}
  <details><summary>المصدر والصورة المرتبطة</summary><div class="spacer"></div><label for="itemSource">مرجع المصدر</label><select id="itemSource" data-item-source><option value="">عنصر كتبه المعلم دون ربط مصدر</option>${project.sources.map(s=>`<option value="${esc(s.id)}" ${q.sourceIds.includes(s.id)?'selected':''}>${esc(s.name)} · صفحة ${s.page}</option>`).join('')}</select><div class="spacer"></div><label for="itemQuote">اقتباس حرفي من المصدر</label><textarea id="itemQuote" data-item="quote">${esc(q.quote)}</textarea><label for="itemImage">صورة داخل العنصر</label><select id="itemImage" data-item="imageId"><option value="">بدون صورة</option>${project.sources.filter(s=>s.image).map(s=>`<option value="${esc(s.id)}" ${q.imageId===s.id?'selected':''}>${esc(s.name)} · صفحة ${s.page}</option>`).join('')}</select></details></div>
  <div id="itemErrors" class="notice ${errors.length?'warn':''}">${errors.length?errors.map(esc).join('<br>'):q.reviewed?'تم اعتماد العنصر. أي تعديل سيعيده إلى مسودة.':'راجع الصياغة والإجابة والمصدر ثم اعتمد العنصر.'}</div>
  <div class="editor-footer">${button('regenerate-item','إعادة توليد هذا العنصر')}<div class="actions">${button('change-type','تغيير النوع','quiet')}${button('approve-item',q.reviewed?'إلغاء الاعتماد':'اعتماد العنصر',q.reviewed?'':'primary')}</div></div></section></div>`;
}
function editedItem(){const q=project.items[selectedItem];q.reviewed=false;mark();const e=$('#itemErrors');if(e){e.className='notice';e.textContent='تغيّر المحتوى. راجعه وأعد اعتماده.'}const btn=$('[data-action="approve-item"]');if(btn){btn.textContent='اعتماد العنصر';btn.className='primary'}}
function addItemDialog(change=false){
  modal(change?'تغيير نوع العنصر':'إضافة عنصر جديد',`<label for="newType">نوع المحتوى</label><select id="newType">${Object.entries(TYPES).map(([id,name])=>`<option value="${id}">${name}</option>`).join('')}</select>${change?'<div class="notice warn">سيُحتفظ بالعنوان ونص السؤال فقط. راجع الحقول الجديدة وأعد تحديد الإجابة.</div>':''}`,button('close-modal','إلغاء')+button(change?'confirm-change-type':'confirm-add-item',change?'تغيير النوع':'إضافة','primary'));
}
async function renderPreview(){
  const revision=++previewRevision;
  if(!project.items.length){$('#view').innerHTML=`<section class="panel empty"><h2>لا توجد عناصر للمعاينة بعد</h2><p>أنشئ المحتوى أو افتح المشروع التجريبي.</p>${button('load-demo','فتح المثال','primary')}</section>`;return}
  const bad=project.items.map((q,i)=>({i,errors:validateItem(q,project.sources)})).filter(x=>x.errors.length);
  if(bad.length){$('#view').innerHTML=`<section class="panel"><h2>أكمل هذه العناصر قبل المعاينة</h2><div class="notice warn">${bad.map(x=>`${x.i+1}. ${esc(x.errors[0])}`).join('<br>')}</div>${button('go-editor','العودة إلى المحرر','primary')}</section>`;return}
  $('#view').innerHTML=`<div class="preview-bar"><div class="segmented"><button data-size="desktop" class="${previewSize==='desktop'?'active':''}">حاسوب</button><button data-size="phone" class="${previewSize==='phone'?'active':''}">هاتف</button></div><div class="actions">${button('reset-preview','إعادة التجربة')}${button('go-editor','العودة للتحرير')}${button('go-export','التصدير','primary')}</div></div><div class="preview-well ${previewSize==='phone'?'phone':''}"><iframe id="lessonFrame" title="معاينة المحتوى التفاعلي" sandbox="allow-scripts"></iframe></div>
  <div class="spacer"></div><div class="fields"><section class="panel checklist"><h2>مراجعة جودة المحتوى</h2><div class="spacer"></div>${[['layout','راجعت النصوص والصور والتنقل'],['answers','جرّبت الأسئلة وإجاباتها ورسائل التصحيح'],['mobile','راجعت العرض على شاشة الهاتف']].map(([id,label])=>`<label><input type="checkbox" data-check="${id}" ${checks[id]?'checked':''}>${label}</label>`).join('')}<label for="notes">ملاحظات المعلم</label><textarea id="notes" data-project="notes">${esc(project.notes)}</textarea>${button('review-report','تنزيل تقرير المراجعة','quiet')}</section><section class="panel"><h2>سجل تجربة الاتصال</h2><p class="small">محاكاة للحالة والموضع فقط، وليست منصة تعليمية أو سجل طلبة.</p><div class="spacer"></div><div id="logs" class="logs">جارٍ تشغيل المعاينة…</div></section></div>`;
  logs=[];previewToken=uid();
  try{const html=await lessonHTML(project,previewToken);if(revision!==previewRevision||step!=='preview')return;$('#lessonFrame').srcdoc=html}catch(e){message(e.message,true)}
}
function renderExport(){
  const errors=project.items.flatMap((q,i)=>validateItem(q,project.sources).map(e=>`العنصر ${i+1}: ${e}`)),unreviewed=project.items.filter(q=>!q.reviewed).length;
  const ready=project.items.length>0&&!errors.length&&!unreviewed;
  $('#view').innerHTML=`<div class="columns"><div><section class="panel"><div class="panel-head"><h2>تصدير المحتوى</h2><span class="pill">${ready?'جاهز للتصدير':'بحاجة إلى مراجعة'}</span></div>
  <div class="notice ${ready?'':'warn'}">${!project.items.length?'أضف عناصر أولًا.':errors.length?errors.map(esc).join('<br>'):unreviewed?`${unreviewed} عنصرًا لم تعتمدها بعد. راجعها من المحرر.`:'جميع العناصر مكتملة ومعتمدة. اختبر الحزمة أيضًا على منصتك قبل إتاحتها للطلبة.'}</div>
  <div class="export-options"><div class="export-option"><div><h3>حزمة SCORM 1.2</h3><p class="small">ملف ZIP واحد جاهز للرفع إلى نشاط SCORM في منصتك.</p></div>${button('export-scorm','تنزيل SCORM','primary',ready?'':'disabled')}</div>
  <div class="export-option"><div><h3>صفحة ويب مستقلة</h3><p class="small">ملف HTML يتضمن الخط والصور والتفاعل، دون طلبات توليد.</p></div>${button('export-html','تنزيل HTML','',ready?'':'disabled')}</div>
  <div class="export-option"><div><h3>نسخة المشروع القابلة للتحرير</h3><p class="small">تشمل المصادر والمسودات والتعديلات. للمعلم، وليست للطلبة.</p></div>${button('save-project','حفظ المشروع JSON')}</div></div></section>
  <section class="panel"><h2>بيانات الحزمة</h2><div class="spacer"></div><div class="fields"><div><label for="exportTitle">عنوان المحتوى</label><input id="exportTitle" data-project="title" value="${esc(project.title)}"></div><div><label>صيغة التصدير</label><input value="SCORM 1.2 · وحدة تعليمية واحدة" readonly aria-label="صيغة التصدير"></div></div><div class="notice">تتواصل الحزمة مع المنصة لتسجيل الإكمال وآخر صفحة فقط. لا تطلب أسماء طلبة، ولا ترسل درجات إلى أداة التأليف.</div></section></div>
  <aside><section class="panel"><h2>بعد التنزيل</h2><ul class="help-list"><li><b>ارفع ZIP كما هو</b>لا تفك ضغط حزمة SCORM قبل رفعها إلى المنصة.</li><li><b>جرّب دور المتعلم</b>تحقق من التشغيل والتنقل والإكمال.</li><li><b>احتفظ بالمشروع</b>ملف JSON يسمح بإعادة التحرير لاحقًا.</li></ul><div class="spacer"></div>${button('legacy','فتح حزمة للتجربة','full')}</section></aside></div>`;
}
async function importSources(files){
  const chosen=[...files];if(!chosen.length)return;
  await work(async()=>{
    for(const file of chosen){
      if(file.size>20*1024*1024)throw Error(`${file.name}: الحد الأقصى 20 MB`);
      if(project.sources.length>=100)throw Error('الحد الأقصى 100 مصدر في المشروع');
      if(/\.pdf$/i.test(file.name)){
        message(`تجري قراءة ${file.name} محليًا…`);
        const pdfjs=await import('./vendor/pdf.mjs');pdfjs.GlobalWorkerOptions.workerSrc=new URL('./vendor/pdf.worker.mjs',import.meta.url).href;
        const pdf=await pdfjs.getDocument({data:new Uint8Array(await file.arrayBuffer()),isEvalSupported:false,useSystemFonts:true}).promise;
        if(pdf.numPages>40){await pdf.destroy();throw Error('اختر ملف PDF لا يتجاوز 40 صفحة، أو قسّم الملف إلى أجزاء.')}
        if(project.sources.length+pdf.numPages>100){await pdf.destroy();throw Error('سيؤدي الملف إلى تجاوز 100 مصدر')}
        for(let page=1;page<=pdf.numPages;page++){
          const p=await pdf.getPage(page),content=await p.getTextContent(),text=pdfTextFromItems(content.items);
          const viewport=p.getViewport({scale:1}),scale=Math.min(1.6,1300/viewport.width),v=p.getViewport({scale}),canvas=document.createElement('canvas');
          canvas.width=v.width;canvas.height=v.height;
          await p.render({canvasContext:canvas.getContext('2d'),viewport:v}).promise;
          project.sources.push({id:uid(),name:file.name,page,text,selected:true,image:canvas.toDataURL('image/jpeg',.82)});
          canvas.width=1;canvas.height=1;p.cleanup();
        }await pdf.destroy();
      }else if(/\.(png|jpe?g|webp)$/i.test(file.name)){
        const image=await imageData(file);
        project.sources.push({id:uid(),name:file.name,page:1,text:'',image,selected:true});
      }else if(/\.txt$/i.test(file.name)){project.sources.push({id:uid(),name:file.name,page:1,text:(await file.text()).slice(0,150000),selected:true})}
      else throw Error('نوع غير مدعوم. استخدم PDF أو PNG أو JPG أو WEBP أو TXT.');
      mark();
    }
    render();message('أضيفت المصادر. افتح «مراجعة النص» لتصحيح القراءة أو قراءة الصور ذكيًا.');
  },'جارٍ استيراد المحتوى…');
  if(step==='source'&&project.sources.length&&!$('#sourceInput'))render();
}
async function imageData(file){
  const bitmap=await createImageBitmap(file);
  const scale=Math.min(1,1800/Math.max(bitmap.width,bitmap.height)),c=document.createElement('canvas');c.width=Math.round(bitmap.width*scale);c.height=Math.round(bitmap.height*scale);
  c.getContext('2d').drawImage(bitmap,0,0,c.width,c.height);bitmap.close();return c.toDataURL('image/jpeg',.9);
}
function reviewSource(id){
  const s=project.sources.find(s=>s.id===id);if(!s)return;
  modal(`مراجعة المصدر · صفحة ${s.page}`,`<div class="source-review"><div>${s.image?`<img src="${s.image}" alt="الصفحة الأصلية من ${esc(s.name)}">`:`<div class="notice">${esc(s.name)}</div>`}<div class="spacer"></div>${s.image?button('ocr-source','قراءة الصورة بالذكاء الاصطناعي','full',`data-id="${s.id}"`):''}<p class="small">راجع الأرقام والمعادلات والمصطلحات. النص غير المقروء لا يُستكمل بالتخمين.</p></div><div><label for="sourceText">النص المعتمد للإنتاج</label><textarea id="sourceText">${esc(s.text)}</textarea><div class="notice">يمكنك حذف الفقرات غير المطلوبة من النص قبل الإنتاج.</div></div></div>`,button('close-modal','إلغاء')+button('save-source','حفظ النص','primary',`data-id="${s.id}"`));
}
let pendingOCR='';
async function ocrSource(id){
  pendingOCR=id;
  if(!cloudConsent){askConsent('ocr');return}
  reviewSource(id);$('#modalStatus').className='notice';$('#modalStatus').textContent='تجري قراءة الصورة…';
  const btn=$('[data-action="ocr-source"]');btn.disabled=true;
  try{
    const s=project.sources.find(s=>s.id===id),res=await apiRequest('extract',{image:s.image});
    if(typeof res.text!=='string')throw Error('لم يرجع نص صالح من الخدمة');
    if($('#sourceText'))$('#sourceText').value=res.text;
    $('#modalStatus').textContent='اكتملت القراءة. راجع النص ثم اضغط «حفظ النص».';
  }catch(e){modalError(e)}finally{if(btn)btn.disabled=false}
}
function settingsDialog(){
  modal('خدمة التوليد الذكي',`<div class="stack"><p>تعمل أدوات التحرير والتصدير دون خدمة ذكاء اصطناعي. التوليد وقراءة الصور يحتاجان خدمة خلفية تحفظ مفتاح Gemini سرًا.</p><div><label for="apiBase">عنوان الخدمة الخلفية (اتركه فارغًا للخادم نفسه)</label><input id="apiBase" class="ltr" value="${esc(apiBase)}" placeholder="https://your-service.example"></div><div><label for="accessToken">رمز وصول الخدمة الخاصة (اختياري)</label><input type="password" id="accessToken" value="${esc(accessToken)}" autocomplete="off"><small>ليس مفتاح Gemini. يُحفظ في ذاكرة الجلسة فقط، ولا يدخل في ملف المشروع.</small></div><div class="notice">في GitHub Pages اضبط عنوان خدمة منفصلة، أو استخدم «تنزيل طلب جاهز لـ AI Studio» ثم استورد JSON الناتج. لا تضع مفتاح Gemini في ملفات الواجهة.</div></div>`,button('test-api','اختبار الاتصال')+button('save-settings','حفظ لهذه الجلسة','primary'));
}
function inputFile(accept,callback){
  const input=document.createElement('input');input.type='file';input.accept=accept;input.onchange=async()=>{if(input.files[0])try{await callback(input.files[0])}catch(e){message(e.message,true)}};input.click();
}
function report(){
  const text=`# تقرير مراجعة المحتوى\n\nالعنوان: ${project.title}\n\nعدد العناصر: ${project.items.length}\n\nالمعتمد: ${project.items.filter(q=>q.reviewed).length}\n\n## مراجعة المعلم\n\n- النصوص والتنقل: ${checks.layout?'تمت المراجعة':'لم تؤكد'}\n- الأسئلة والإجابات: ${checks.answers?'تمت المراجعة':'لم تؤكد'}\n- عرض الهاتف: ${checks.mobile?'تمت المراجعة':'لم تؤكد'}\n\n## الملاحظات\n\n${project.notes||'لا توجد ملاحظات.'}\n\n## النطاق\n\nهذا تقرير يدوي لجودة المحتوى وليس تقييم درجات طلبة أو شهادة مطابقة SCORM.\n`;
  download(text,'content-review.md','text/markdown;charset=utf-8');
}
function renderLegacy(){
  $('#view').innerHTML=`<div class="fields"><section class="panel"><h2>تغليف مشروع HTML</h2><p class="small">استورد المجلد كاملًا للحفاظ على الصور وCSS وJavaScript والمسارات النسبية.</p><div class="spacer"></div>${button('import-folder','اختيار مجلد HTML','primary')}<input id="folderInput" type="file" webkitdirectory multiple class="file-input"><div class="spacer"></div><div id="legacyList">${Object.keys(legacyFiles).length?legacyListHTML():'<p class="small">لا توجد ملفات مستوردة.</p>'}</div><div class="spacer"></div>${button('export-legacy','تنزيل حزمة HTML إلى SCORM','',legacyPages.length?'':'disabled')}</section>
  <section class="panel"><h2>فتح حزمة SCORM 1.2</h2><p class="small">يقرأ ملف التعريف ويشغّل محتوى الحزمة بالمسارات الأصلية.</p><div class="notice warn">شغّل الحزم التي تثق بها فقط. هذه المعاينة تنفّذ JavaScript للحزمة، وليست عزلًا أمنيًا للمحتوى المجهول. يُفضّل موقع مخصص.</div><label class="check-inline"><input id="trustPackage" type="checkbox">أثق بمصدر الحزمة وأوافق على تشغيلها</label><div class="spacer"></div>${button('open-scorm','اختيار حزمة ZIP','primary')}<p class="small">تتطلب المعاينة Service Worker عبر HTTPS أو localhost. قد تمنعها نافذة AI Studio؛ افتح الموقع المنشور.</p></section></div>
  <div id="legacyPreview"></div>`;
  $('#folderInput').onchange=e=>work(async()=>{
    const files=[...e.target.files];if(files.length>2000||files.reduce((n,f)=>n+f.size,0)>100*1024*1024)throw Error('المجلد يتجاوز الحدود: 2000 ملف أو 100 MB');
    const imported={};
    for(const file of files){const p=safePath(file.webkitRelativePath.split('/').slice(1).join('/')||file.name);imported[p]=new Uint8Array(await file.arrayBuffer())}
    const pages=Object.keys(imported).filter(p=>/\.html?$/i.test(p)).sort();
    if(!pages.length)throw Error('لم يُعثر على صفحات HTML');
    legacyFiles=imported;legacyPages=pages;legacyName=files[0].webkitRelativePath.split('/')[0]||'محتوى HTML';render();message('تم استيراد المشروع. حدد صفحات التنقل ورتبها؛ جميع الملفات المساندة ستُضمّن.');
  });
}
function legacyListHTML(){return `<label for="legacyTitle">عنوان الحزمة</label><input id="legacyTitle" value="${esc(legacyName)}"><div class="spacer"></div>${Object.keys(legacyFiles).filter(p=>/\.html?$/i.test(p)).map(p=>`<label class="check-inline"><input type="checkbox" data-legacy-page="${esc(p)}" ${legacyPages.includes(p)?'checked':''}>${esc(p)}</label>`).join('')}<label for="legacyOrder">ترتيب الصفحات (مسار في كل سطر)</label><textarea id="legacyOrder" class="ltr">${esc(legacyPages.join('\n'))}</textarea><small>${Object.keys(legacyFiles).length} ملفًا سيُضمّن. احذف الملفات الحساسة من المجلد قبل استيراده.</small>`}
async function startLegacy(file){
  if(!$('#trustPackage')?.checked)throw Error('حدد موافقتك على تشغيل محتوى موثوق أولًا');
  legacyFiles=readZIP(await file.arrayBuffer());legacyLaunches=parseManifest(legacyFiles);
  if(!('serviceWorker'in navigator)||!window.isSecureContext)throw Error('افتح الأداة عبر HTTPS أو localhost لمعاينة حزم ZIP');
  const reg=await navigator.serviceWorker.register('./sw.js',{scope:'./'});
  await Promise.race([navigator.serviceWorker.ready,new Promise((_,reject)=>setTimeout(()=>reject(Error('تعذر تفعيل Service Worker في هذه البيئة')),10000))]);
  if(!navigator.serviceWorker.controller)await Promise.race([new Promise(resolve=>navigator.serviceWorker.addEventListener('controllerchange',resolve,{once:true})),new Promise((_,reject)=>setTimeout(()=>reject(Error('أعد فتح الأداة من رابطها المباشر لتفعيل معاينة الحزم')),8000))]);
  legacyId=uid();
  const channel=new MessageChannel();
  const ready=new Promise((resolve,reject)=>{const t=setTimeout(()=>reject(Error('تعذر نقل ملفات الحزمة إلى المعاينة')),8000);channel.port1.onmessage=e=>{clearTimeout(t);e.data.ok?resolve():reject(Error(e.data.error||'خطأ في المعاينة'))}});
  navigator.serviceWorker.controller.postMessage({type:'mount',id:legacyId,files:Object.entries(legacyFiles)},[channel.port2]);await ready;
  $('#legacyPreview').innerHTML=`<div class="spacer"></div><section class="panel"><div class="panel-head"><h2>معاينة الحزمة المستوردة</h2>${button('reset-legacy','إعادة تشغيل')}</div><label for="legacyLaunch">عنصر التشغيل</label><select id="legacyLaunch">${legacyLaunches.map((x,i)=>`<option value="${i}">${esc(x.title)}</option>`).join('')}</select><div class="spacer"></div><iframe id="legacyFrame" title="معاينة حزمة SCORM موثوقة" style="width:100%;height:720px;border:1px solid var(--line)" sandbox="allow-scripts allow-same-origin allow-forms allow-downloads"></iframe></section>`;
  $('#legacyLaunch').onchange=launchLegacy;launchLegacy();
}
function launchLegacy(){const launch=legacyLaunches[+$('#legacyLaunch').value];$('#legacyFrame').src=`./legacy-player.html?id=${encodeURIComponent(legacyId)}&launch=${encodeURIComponent(launch.href)}`}
document.addEventListener('click',async e=>{
  const nav=e.target.closest('[data-step]');if(nav){step=nav.dataset.step;render();return}
  const mode=e.target.closest('[data-mode]');if(mode){project.settings.mode=mode.dataset.mode;project.settings.counts={[MODES[mode.dataset.mode][0]]:5};mark();renderDesign();return}
  const outline=e.target.closest('[data-select-item]');if(outline){selectedItem=+outline.dataset.selectItem;renderEditor();return}
  const size=e.target.closest('[data-size]');if(size){previewSize=size.dataset.size;$('.preview-well')?.classList.toggle('phone',previewSize==='phone');document.querySelectorAll('[data-size]').forEach(b=>b.classList.toggle('active',b.dataset.size===previewSize));return}
  const b=e.target.closest('[data-action]');if(!b)return;
  const action=b.dataset.action;
  if(busy&&action!=='close-modal'){toast('انتظر اكتمال العملية الحالية');return}
  try{
    if(action.startsWith('go-')){step=action.slice(3);render();return}
    const q=project.items[selectedItem];
    switch(action){
      case 'close-modal':case 'cancel-consent':closeModal();break;
      case 'settings':settingsDialog();break;
      case 'save-settings':apiBase=$('#apiBase').value.trim().replace(/\/$/,'');accessToken=$('#accessToken').value.trim();cloudConsent=false;closeModal();toast('حُفظ إعداد الخدمة لهذه الجلسة فقط');break;
      case 'test-api':{
        apiBase=$('#apiBase').value.trim().replace(/\/$/,'');accessToken=$('#accessToken').value.trim();
        try{const res=await apiRequest('health',{});$('#modalStatus').className='notice';$('#modalStatus').textContent=res.ready?'الخدمة متصلة وجاهزة للتوليد.':'الخادم يعمل، لكن مفتاح خدمة التوليد لم يُضبط.'}catch(err){modalError(err)}break;
      }
      case 'load-demo':
        if(dirty||project.items.length||project.sources.length)modal('فتح المشروع التجريبي','<p>سيستبدل المشروع التجريبي العمل المفتوح. احفظ نسخة مشروع أولًا إذا أردت الاحتفاظ به.</p>',button('save-project','حفظ المشروع الحالي')+button('confirm-demo','فتح المثال','primary'));
        else{project=demoProject();mark();step='editor';render()}break;
      case 'confirm-demo':project=demoProject();mark();closeModal();step='editor';render();break;
      case 'upload-source':$('#sourceInput').click();break;
      case 'paste-text':modal('إضافة محتوى نصّي','<label for="textName">عنوان المصدر</label><input id="textName" value="نص الدرس"><div class="spacer"></div><label for="pastedText">محتوى الدرس</label><textarea id="pastedText" style="min-height:280px" placeholder="ألصق هنا النص الذي تريد استخدامه في إنتاج الأسئلة والأنشطة."></textarea>',button('add-text','إضافة النص','primary'));break;
      case 'add-text':{const text=$('#pastedText').value.trim();if(!text)return modalError(Error('أدخل نصًا أولًا'));project.sources.push({id:uid(),name:$('#textName').value||'نص الدرس',page:1,text,selected:true});mark();closeModal();render();break}
      case 'review-source':reviewSource(b.dataset.id);break;
      case 'save-source':{const s=project.sources.find(s=>s.id===b.dataset.id);s.text=$('#sourceText').value;project.items.filter(q=>q.sourceIds.includes(s.id)).forEach(q=>q.reviewed=false);mark();closeModal();render();break}
      case 'delete-source':modal('حذف المصدر','<p>ستُزال الإشارة إليه من العناصر المرتبطة، وتعود هذه العناصر إلى حالة المسودة. هل تريد المتابعة؟</p>',button('close-modal','إلغاء')+button('confirm-delete-source','حذف','danger',`data-id="${b.dataset.id}"`));break;
      case 'confirm-delete-source':{const id=b.dataset.id;project.sources=project.sources.filter(s=>s.id!==id);project.items.forEach(q=>{if(q.sourceIds.includes(id)||q.imageId===id){q.sourceIds=q.sourceIds.filter(x=>x!==id);q.quote='';if(q.imageId===id)q.imageId='';q.reviewed=false}});mark();closeModal();render();break}
      case 'ocr-source':await ocrSource(b.dataset.id);break;
      case 'confirm-consent':
        if(!$('#cloudConsent').checked){modalError(Error('الموافقة مطلوبة قبل الإرسال'));break}
        cloudConsent=true;closeModal();if(b.dataset.next==='ocr')await ocrSource(pendingOCR);else await generate(b.dataset.next==='regenerate');break;
      case 'generate':await generate();break;
      case 'run-generate':closeModal();await runGeneration(payload());break;
      case 'regenerate-item':await generate(true);break;
      case 'download-prompt':download(generationPrompt(payload()),'ai-studio-authoring-prompt.txt','text/plain;charset=utf-8');message('أرفق الطلب في AI Studio واطلب تنزيل الاستجابة JSON، ثم استوردها من الزر المخصص.');break;
      case 'import-draft':inputFile('.json',async file=>{if(file.size>5*1024*1024)throw Error('مسودة JSON أكبر من 5 MB');const data=JSON.parse(await file.text()),result=acceptGeneration(data,payload());if(project.items.length+result.items.length>100)throw Error('الحد الأقصى 100 عنصر');project.items.push(...result.items);selectedItem=Math.max(0,project.items.length-result.items.length);mark();step='editor';render();message(result.warnings.join('\n')||'تم استيراد المسودة. راجع العناصر قبل اعتمادها.')});break;
      case 'add-item':addItemDialog();break;
      case 'confirm-add-item':if(project.items.length>=100)return modalError(Error('الحد الأقصى 100 عنصر'));project.items.push(blankItem($('#newType').value));selectedItem=project.items.length-1;mark();closeModal();step='editor';render();break;
      case 'change-type':addItemDialog(true);break;
      case 'confirm-change-type':project.items[selectedItem]={...blankItem($('#newType').value),id:q.id,title:q.title,prompt:q.prompt,sourceIds:q.sourceIds,quote:q.quote};mark();closeModal();renderEditor();break;
      case 'duplicate-item':if(project.items.length>=100)throw Error('الحد الأقصى 100 عنصر');project.items.splice(selectedItem+1,0,{...structuredClone(q),id:uid(),reviewed:false});selectedItem++;mark();renderEditor();break;
      case 'delete-item':modal('حذف العنصر',`<p>هل تريد حذف «${esc(q.title)}» من المشروع؟</p>`,button('close-modal','إلغاء')+button('confirm-delete-item','حذف العنصر','danger'));break;
      case 'confirm-delete-item':project.items.splice(selectedItem,1);mark();closeModal();renderEditor();break;
      case 'move-up':case 'move-down':{const j=selectedItem+(action==='move-up'?-1:1);if(j>=0&&j<project.items.length){[project.items[j],project.items[selectedItem]]=[project.items[selectedItem],project.items[j]];selectedItem=j;mark();renderEditor()}break}
      case 'add-option':if(q.options.length<10){q.options.push('');editedItem();renderEditor()}else toast('الحد الأقصى 10 خيارات');break;
      case 'remove-option':{const i=+b.dataset.index;if(q.options.length<=2)throw Error('يجب الإبقاء على خيارين');q.options.splice(i,1);q.correct=q.correct.filter(n=>n!==i).map(n=>n>i?n-1:n);editedItem();renderEditor();break}
      case 'add-pair':if(q.pairs.length<12){q.pairs.push({left:'',right:''});editedItem();renderEditor()}break;
      case 'remove-pair':if(q.pairs.length<=2)throw Error('يجب الإبقاء على زوجين');q.pairs.splice(+b.dataset.index,1);editedItem();renderEditor();break;
      case 'approve-item':{const errors=validateItem(q,project.sources);if(errors.length){$('#itemErrors').className='notice error';$('#itemErrors').textContent=errors.join(' · ');break}q.reviewed=!q.reviewed;mark();renderEditor();break}
      case 'approve-all':modal('اعتماد جميع العناصر',`<p>اعتمادك يؤكد أنك راجعت الصياغة والإجابات والمصادر لجميع العناصر. الفحص البرمجي لا يتحقق من صحة المعلومات التربوية.</p><label class="check-inline"><input type="checkbox" id="reviewAll">راجعت جميع العناصر وأوافق على اعتمادها.</label>`,button('close-modal','العودة للمراجعة')+button('confirm-approve-all','اعتماد الكل','primary'));break;
      case 'confirm-approve-all':{
        if(!$('#reviewAll').checked)return modalError(Error('أكد المراجعة أولًا'));
        const bad=project.items.flatMap((q,i)=>validateItem(q,project.sources).map(x=>`${i+1}: ${x}`));if(bad.length)return modalError(Error(bad.join('\n')));
        project.items.forEach(q=>q.reviewed=true);mark();closeModal();renderEditor();break;
      }
      case 'reset-preview':renderPreview();break;
      case 'review-report':report();break;
      case 'save-project':download(JSON.stringify(project,null,2),'studio-project.json','application/json');dirty=false;$('#saveState').textContent='نُزّلت نسخة المشروع';toast('احفظ ملف JSON للعودة إلى عملك');break;
      case 'open-project':if(dirty)modal('فتح مشروع آخر','<p>احفظ نسخة العمل الحالي قبل فتح مشروع آخر. لن يدمج الاستيراد المشروعين.</p>',button('save-project','حفظ الحالي')+button('confirm-open-project','اختيار مشروع','primary'));else openProject();break;
      case 'confirm-open-project':closeModal();openProject();break;
      case 'export-scorm':await work(async()=>{download(await scormZIP(project),'interactive-lesson-scorm12.zip','application/zip');message('تم تنزيل حزمة SCORM 1.2. ارفع ZIP كما هو إلى المنصة.')},'جارٍ إنشاء الحزمة…');break;
      case 'export-html':await work(async()=>{assertExport(project);download(await lessonHTML(project),'interactive-lesson.html','text/html');message('تم تنزيل صفحة الويب المستقلة.')});break;
      case 'legacy':step='legacy';render();break;
      case 'import-folder':$('#folderInput').click();break;
      case 'export-legacy':{const pages=$('#legacyOrder').value.split('\n').map(x=>x.trim()).filter(Boolean);if(pages.some(p=>!legacyFiles[p]||!/\.html?$/i.test(p)))throw Error('قائمة التشغيل تحتوي مسارًا غير موجود');if(new Set(pages).size!==pages.length)throw Error('توجد صفحة مكررة');download(packHTML(legacyFiles,pages,$('#legacyTitle').value||'درس HTML'),'html-project-scorm12.zip','application/zip');message('نُزّلت حزمة مشروع HTML. جرّب تشغيلها على منصتك.');break}
      case 'open-scorm':if(!$('#trustPackage').checked)throw Error('وافق على تشغيل الحزمة الموثوقة أولًا');inputFile('.zip',file=>work(()=>startLegacy(file),'جارٍ فتح الحزمة…'));break;
      case 'reset-legacy':launchLegacy();break;
      case 'help':modal('دليل سريع',`<div class="help-content"><h3>المصدر ثم الناتج</h3><p>ارفع ملفك، وراجع النص، ثم حدد الأنواع والأعداد. التوليد يعتمد على خدمة مضبوطة، ولا توجد نتائج تلقائية وهمية عند غيابها.</p><h3>التحرير والاعتماد</h3><p>يمكنك إنشاء كل الأنواع يدويًا. أي تعديل يُلغي اعتماد العنصر حتى تراجعه مجددًا.</p><h3>حفظ المشروع</h3><p>استخدم «حفظ المشروع» لتنزيل JSON. لا يوجد حفظ تلقائي سحابي أو محلي؛ إغلاق الصفحة دون حفظ يفقد العمل.</p><h3>SCORM</h3><p>تُضمّن الموارد المختارة في الحزمة. لا تعتمد الدروس على خدمة التوليد وقت التعلم، ولا تسجل أداة التأليف درجات أو أسماء طلبة.</p><h3>حدود مهمة</h3><p>الأسئلة المفتوحة للمقارنة الذاتية. OCR يحتاج مراجعة. معاينة ZIP الموثوق تتطلب Service Worker. اختبر كل حزمة على منصتك المستهدفة.</p></div>`);break;
    }
  }catch(err){message(err.message,true)}
});
function openProject(){inputFile('.json',async file=>{if(file.size>70*1024*1024)throw Error('ملف المشروع أكبر من 70 MB');project=readProject(JSON.parse(await file.text()));selectedItem=0;dirty=false;checks={layout:false,answers:false,mobile:false};step=project.items.length?'editor':'source';render();message('تم فتح المشروع.')})}
document.addEventListener('input',e=>{
  const el=e.target;
  if(el.dataset.project){project[el.dataset.project]=el.value;mark(el.dataset.project!=='notes')}
  if(el.dataset.setting){project.settings[el.dataset.setting]=el.type==='checkbox'?el.checked:el.dataset.setting==='optionCount'?+el.value:el.value;mark()}
  if(el.dataset.count){project.settings.counts[el.dataset.count]=Math.max(0,Math.min(20,parseInt(el.value)||0));mark();$('#totalCount').textContent=Object.values(project.settings.counts).reduce((a,b)=>a+b,0)}
  const q=project.items[selectedItem];if(!q)return;
  if(el.dataset.item){q[el.dataset.item]=el.value;editedItem()}
  if(el.dataset.option!==undefined){q.options[+el.dataset.option]=el.value;editedItem()}
  if(el.dataset.pairLeft!==undefined){q.pairs[+el.dataset.pairLeft].left=el.value;editedItem()}
  if(el.dataset.pairRight!==undefined){q.pairs[+el.dataset.pairRight].right=el.value;editedItem()}
});
document.addEventListener('change',e=>{
  const el=e.target,q=project.items[selectedItem];
  if(el.dataset.sourceToggle){project.sources.find(s=>s.id===el.dataset.sourceToggle).selected=el.checked;mark();const n=$('.source-selected-count');if(n)n.textContent=selectedSources().length}
  if(el.dataset.correct!==undefined&&q){const i=+el.dataset.correct;q.correct=q.type==='multi'?(el.checked?[...q.correct,i]:q.correct.filter(n=>n!==i)):[i];editedItem()}
  if(el.hasAttribute('data-item-source')&&q){q.sourceIds=el.value?[el.value]:[];q.quote='';editedItem();const t=$('#itemQuote');if(t)t.value=''}
  if(el.dataset.check){checks[el.dataset.check]=el.checked}
  if(el.dataset.legacyPage){legacyPages=el.checked?[...legacyPages,el.dataset.legacyPage]:legacyPages.filter(p=>p!==el.dataset.legacyPage);$('#legacyOrder').value=legacyPages.join('\n');$('[data-action="export-legacy"]').disabled=!legacyPages.length}
});
window.addEventListener('message',e=>{
  if(e.source!==$('#lessonFrame')?.contentWindow||e.data?.studioPreview!==previewToken)return;
  logs.push(`${e.data.method}(${String(e.data.value).slice(0,300)})`);if(logs.length>100)logs.shift();if($('#logs'))$('#logs').textContent=logs.join('\n');
});
render();
