// Serialized into learner HTML. Keep this function self-contained.
export function lessonRuntime(data, previewToken=''){
  const $=id=>document.getElementById(id);
  const E=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const norm=s=>String(s).trim().replace(/[\u064B-\u065F\u0670]/g,'').replace(/\s+/g,' ').toLowerCase();
  let index=0,api=null,connected=false,finished=false,completed=false;
  const answers={},orders={},checked={},visited=new Set(),start=Date.now();
  const emit=(method,value)=>{if(previewToken)parent.postMessage({studioPreview:previewToken,method,value},'*')};
  function findAPI(w){
    for(let n=0;w&&n<20;n++){try{if(w.API)return w.API;if(w.parent===w)break;w=w.parent}catch{break}}
    return null;
  }
  function call(method,...args){
    emit(method,args.join(' | '));
    if(api)try{return api[method](...args)}catch{return 'false'}
    return method==='LMSGetValue'?'':'true';
  }
  if(!previewToken){api=findAPI(window);if(!api)try{api=findAPI(window.opener)}catch{}}
  connected=previewToken?true:!!api;
  if(connected){
    call('LMSInitialize','');
    const old=call('LMSGetValue','cmi.core.lesson_status');
    completed=old==='completed'||old==='passed';
    if(!old||old==='not attempted')call('LMSSetValue','cmi.core.lesson_status','incomplete');
    const pos=parseInt(call('LMSGetValue','cmi.core.lesson_location'),10);
    if(Number.isInteger(pos)&&pos>=0&&pos<data.items.length)index=pos;
  }
  function save(){if(connected){call('LMSSetValue','cmi.core.lesson_location',String(index));call('LMSCommit','')}}
  function finish(){
    if(finished)return;
    if(connected){const sec=Math.floor((Date.now()-start)/1000);call('LMSSetValue','cmi.core.session_time',`${String(Math.floor(sec/3600)).padStart(2,'0')}:${String(Math.floor(sec/60)%60).padStart(2,'0')}:${String(sec%60).padStart(2,'0')}`);call('LMSCommit','');call('LMSFinish','')}
    finished=true;
  }
  function shuffle(list){const a=[...list];for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a}
  function current(){return data.items[index]}
  function render(){
    const q=current();if(!q){$('activity').textContent='لا يوجد محتوى.';return}
    visited.add(q.id);
    $('counter').textContent=`${index+1} / ${data.items.length}`;
    $('bar').style.width=`${(index+1)/data.items.length*100}%`;
    $('nav').innerHTML=data.items.map((x,i)=>`<button class="${i===index?'active':''}" data-go="${i}" aria-current="${i===index?'step':'false'}">${i+1}. ${E(x.title)}</button>`).join('');
    $('prev').disabled=index===0;$('next').disabled=index===data.items.length-1;
    $('finish').hidden=index!==data.items.length-1;
    const a=answers[q.id];let html=`<div class="type-label">${E(data.labels[q.type]||q.type)}</div><h2>${E(q.title)}</h2>`;
    if(q.image)html+=`<img class="lesson-image" src="${E(q.image)}" alt="${E(q.imageAlt||'صورة من محتوى الدرس')}">`;
    if(q.type==='explanation'){
      html+=`<div class="body-text">${E(q.body)}</div><p class="hint-text">انتقل إلى الصفحة التالية عند الانتهاء من القراءة.</p>`;
    }else if(q.type==='cards'){
      html+=`<p>${E(q.prompt||'اضغط على البطاقة لعرض المعلومة.')}</p><div class="cards">${q.pairs.map((p,i)=>`<details><summary>${E(p.left)}</summary><div class="body-text">${E(p.right)}</div></details>`).join('')}</div>`;
    }else{
      html+=`<p class="question">${E(q.prompt)}</p>`;
      if(['mcq','multi','truefalse'].includes(q.type)){
        html+=`<fieldset><legend class="sr">${E(q.prompt)}</legend>${q.options.map((o,i)=>`<label class="option ${Array.isArray(a)&&a.includes(i)?'selected':''}"><input type="${q.type==='multi'?'checkbox':'radio'}" name="choice" value="${i}" ${Array.isArray(a)&&a.includes(i)?'checked':''} ${(checked[q.id]&&!data.settings.retry)?'disabled':''}><span>${E(o)}</span></label>`).join('')}</fieldset>`;
      }else if(['fill','short'].includes(q.type)){
        html+=`<label for="answer">${q.type==='short'?'اكتب إجابتك ثم قارنها بالإجابة النموذجية':'اكتب الإجابة'}</label><textarea id="answer" ${(checked[q.id]&&!data.settings.retry)?'disabled':''}>${E(a||'')}</textarea>`;
      }else if(q.type==='order'){
        if(!orders[q.id]){
          orders[q.id]=shuffle(q.options.map((_,i)=>i));
          if(orders[q.id].every((v,i)=>v===i)&&orders[q.id].length>1)orders[q.id].reverse();
        }
        html+=`<p class="hint-text">استخدم السهمين لترتيب الخطوات من الأعلى إلى الأسفل.</p><div class="order-list">${orders[q.id].map((v,i)=>`<div class="order-row"><span>${i+1}</span><b>${E(q.options[v])}</b><button data-up="${i}" aria-label="نقل الخطوة إلى الأعلى" ${i===0?'disabled':''}>↑</button><button data-down="${i}" aria-label="نقل الخطوة إلى الأسفل" ${i===q.options.length-1?'disabled':''}>↓</button></div>`).join('')}</div>`;
      }else if(['match','classify'].includes(q.type)){
        const choices=q.type==='match'?q.pairs.map(p=>p.right):[...new Set(q.pairs.map(p=>p.right))];
        if(!orders[q.id])orders[q.id]=shuffle(choices);
        html+=q.pairs.map((p,i)=>`<label class="match-row"><span>${E(p.left)}</span><select data-pair="${i}" ${(checked[q.id]&&!data.settings.retry)?'disabled':''}><option value="">اختر ${q.type==='classify'?'الفئة':'الإجابة'}</option>${orders[q.id].map(c=>`<option value="${E(c)}" ${a?.[i]===c?'selected':''}>${E(c)}</option>`).join('')}</select></label>`).join('');
      }
      html+=`<div class="controls"><button id="check" class="primary" ${checked[q.id]&&!data.settings.retry?'disabled':''}>${q.type==='short'?'عرض الإجابة النموذجية':'تحقق من الإجابة'}</button>${data.settings.retry?'<button id="retry">إعادة المحاولة</button>':''}${q.hint?'<button id="hintBtn">تلميح</button>':''}</div><div id="feedback" role="status" aria-live="polite"></div><div id="hintBox"></div>`;
    }
    $('activity').innerHTML=html;
    document.querySelectorAll('[data-go]').forEach(b=>b.onclick=()=>{index=+b.dataset.go;render();save()});
    document.querySelectorAll('input[name=choice]').forEach(b=>b.onchange=()=>{
      answers[q.id]=[...document.querySelectorAll('input[name=choice]:checked')].map(el=>+el.value);
      document.querySelectorAll('.option').forEach(el=>el.classList.toggle('selected',el.querySelector('input').checked));
    });
    if($('answer'))$('answer').oninput=e=>answers[q.id]=e.target.value;
    document.querySelectorAll('[data-pair]').forEach(el=>el.onchange=()=>{answers[q.id]||=[];answers[q.id][+el.dataset.pair]=el.value});
    for(const attr of ['up','down'])document.querySelectorAll(`[data-${attr}]`).forEach(b=>b.onclick=()=>{
      if(checked[q.id]&&!data.settings.retry)return;
      const i=+b.dataset[attr],j=i+(attr==='up'?-1:1),arr=orders[q.id];[arr[i],arr[j]]=[arr[j],arr[i]];render();
    });
    if($('check'))$('check').onclick=check;
    if($('retry'))$('retry').onclick=()=>{delete answers[q.id];delete checked[q.id];delete orders[q.id];render()};
    if($('hintBtn'))$('hintBtn').onclick=()=>{$('hintBox').textContent=q.hint;$('hintBox').className='feedback neutral'};
    if(checked[q.id])showResult(checked[q.id]);
  }
  function showResult(r){
    const el=$('feedback');if(!el)return;
    el.className=`feedback ${r.kind}`;
    el.textContent=r.text;
  }
  function check(){
    const q=current(),a=answers[q.id];let ok=false;
    if(['mcq','multi','truefalse'].includes(q.type)){
      if(!a?.length)return showResult({kind:'neutral',text:'اختر إجابتك أولًا.'});
      ok=a.length===q.correct.length&&q.correct.every(n=>a.includes(n));
    }else if(['fill','short'].includes(q.type)){
      if(!String(a||'').trim())return showResult({kind:'neutral',text:'اكتب إجابتك أولًا.'});
      ok=q.answer.split('|').some(x=>norm(x)===norm(a));
    }else if(q.type==='order')ok=orders[q.id].every((v,i)=>v===i);
    else {if(q.pairs.some((_,i)=>!a?.[i]))return showResult({kind:'neutral',text:'أكمل جميع الاختيارات أولًا.'});ok=q.pairs.every((p,i)=>a[i]===p.right)}
    const r=q.type==='short'
      ?{kind:'neutral',text:data.settings.feedback?`إجابة نموذجية للمقارنة الذاتية: ${q.answer}`:'تمت الإجابة. لا يوجد تصحيح آلي لهذا السؤال.'}
      :!data.settings.feedback?{kind:'neutral',text:'تمت الإجابة. التصحيح غير معروض في هذا النشاط.'}
      :{kind:ok?'success':'error',text:`${ok?'إجابة صحيحة.':'تحتاج الإجابة إلى مراجعة.'} ${q.feedback||''}`};
    checked[q.id]=r;showResult(r);
    if(!data.settings.retry)document.querySelectorAll('#activity input,#activity select,#activity textarea,#check,[data-up],[data-down]').forEach(el=>el.disabled=true);
  }
  $('title').textContent=data.title;
  $('prev').onclick=()=>{if(index>0){index--;render();save()}};
  $('next').onclick=()=>{if(index<data.items.length-1){index++;render();save()}};
  $('finish').onclick=()=>{
    if(!completed){completed=true;if(connected){call('LMSSetValue','cmi.core.lesson_status','completed');call('LMSCommit','')}}
    $('completeNote').textContent='انتهيت من المحتوى. يمكنك العودة إلى أي صفحة للمراجعة.';
    $('finish').disabled=true;
  };
  window.addEventListener('pagehide',finish);
  window.addEventListener('beforeunload',finish);
  render();
}
export const runtimeCSS=`
:root{--accent:#28634d;--ink:#203c35;--bg:#f5f6ef;--muted:#63716b;--line:#dbe2d7}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.9 StudioArabic,sans-serif}button,input,select,textarea{font:inherit}button{min-height:44px;cursor:pointer;border:1px solid var(--line);background:white;border-radius:6px;color:var(--ink);padding:8px 16px;font-size:14px}button:disabled{opacity:.5;cursor:default}button:focus-visible,summary:focus-visible{outline:3px solid #5f8b65;outline-offset:3px}.primary{background:var(--accent);color:white;border-color:var(--accent)}header{padding:24px 32px;background:white;border-bottom:1px solid var(--line)}header small{color:var(--muted);font-size:12px}h1{font-size:22px;margin:4px 0;line-height:1.7}h2{font-size:24px;margin:8px 0 20px}p{margin:8px 0}button:hover:not(:disabled){filter:brightness(.95)}.progress{height:4px;background:#e2e8df}.progress span{display:block;background:var(--accent);height:100%;width:0}.layout{display:grid;grid-template-columns:210px minmax(0,1fr);max-width:1250px;margin:auto;gap:24px;padding:24px}nav{display:flex;flex-direction:column;gap:8px}nav button{text-align:right;background:transparent;border:0;font-size:13px}nav button.active{background:#e1ebdf;color:var(--accent);font-weight:700}.content{min-width:0}article{background:white;border:1px solid var(--line);padding:32px;border-radius:10px;min-height:350px}.type-label{color:var(--accent);font-size:12px;font-weight:700}.question{font-size:18px;margin-bottom:24px}.body-text{white-space:pre-wrap;line-height:2.2}.hint-text{font-size:13px;color:var(--muted);margin-top:20px}.option{display:flex;gap:12px;align-items:center;border:1px solid var(--line);border-radius:6px;padding:12px 16px;margin:8px 0;cursor:pointer}.option.selected{background:#edf4e9;border-color:#80a37e}input{accent-color:var(--accent);width:18px;height:18px}fieldset{border:0;padding:0;margin:0}.controls{display:flex;gap:8px;margin-top:24px;flex-wrap:wrap}.feedback{padding:16px;margin-top:20px;border-radius:6px;white-space:pre-wrap}.success{color:#245934;background:#e8f3e6}.error{color:#8d3737;background:#fff0eb}.neutral{background:#f0f2e9;color:#475c44}textarea,select{padding:12px;border:1px solid #bac9b7;border-radius:6px;background:white;color:var(--ink);max-width:100%;font-size:16px}textarea{width:100%;min-height:120px;resize:vertical}.match-row{display:grid;grid-template-columns:1fr 1fr;align-items:center;gap:16px;margin:12px 0}.order-row{display:flex;gap:12px;align-items:center;background:#f6f7f1;padding:8px;border-radius:6px;margin:8px 0}.order-row b{flex:1;font-weight:500}.order-row button{padding:8px 14px}.cards{display:grid;gap:12px;margin-top:24px}details{border:1px solid var(--line);border-radius:6px}summary{cursor:pointer;min-height:52px;padding:12px 16px;font-weight:600}details>div{padding:0 16px 16px;color:var(--muted)}.lesson-image{max-width:100%;max-height:350px;object-fit:contain;display:block;margin:16px auto}.footer{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-top:20px;flex-wrap:wrap}.footer div{display:flex;gap:8px}#completeNote{color:var(--accent);font-size:14px;margin:16px 0}.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0)}[hidden]{display:none!important}
@media(max-width:700px){header{padding:16px 20px}h1{font-size:19px}.layout{display:block;padding:16px}nav{flex-direction:row;overflow:auto;margin-bottom:16px}nav button{white-space:nowrap;max-width:210px;overflow:hidden;text-overflow:ellipsis;flex-shrink:0}article{padding:20px}h2{font-size:21px}.question{font-size:17px}.match-row{grid-template-columns:1fr;gap:4px}.order-row{gap:8px}.order-row b{font-size:14px}.order-row button{padding:8px 12px}}
`;
