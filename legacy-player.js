(()=>{
  let initialized=false,finished=false,error='0';
  const values={'cmi.core.lesson_status':'not attempted','cmi.core.lesson_location':'','cmi.suspend_data':'','cmi.core.entry':'ab-initio','cmi.core.lesson_mode':'normal','cmi.core.credit':'no-credit','cmi.core.total_time':'0000:00:00'};
  const status=document.getElementById('status');
  const setError=(n)=>{error=String(n);return 'false'};
  window.API={
    LMSInitialize(a){if(a!=='')return setError(201);if(initialized||finished)return setError(101);initialized=true;error='0';status.textContent='اتصال تجريبي نشط';return 'true'},
    LMSFinish(a){if(!initialized||finished)return setError(301);if(a!=='')return setError(201);finished=true;error='0';status.textContent='انتهت الجلسة التجريبية';return 'true'},
    LMSGetValue(k){if(!initialized||finished){setError(301);return ''}error='0';if(/student_id|student_name|score|interactions/.test(k))return '';return values[k]??''},
    LMSSetValue(k,v){if(!initialized||finished)return setError(301);error='0';if(/student_id|student_name|score|interactions/.test(k))return 'true';values[k]=String(v);if(k==='cmi.core.lesson_status')status.textContent=`الحالة: ${v}`;return 'true'},
    LMSCommit(a){if(!initialized||finished)return setError(301);if(a!=='')return setError(201);error='0';return 'true'},
    LMSGetLastError(){return error},
    LMSGetErrorString(n){return ({0:'No error',101:'General exception',201:'Invalid argument',301:'Not initialized'})[n]||'Unsupported'},
    LMSGetDiagnostic(){return error}
  };
  const params=new URLSearchParams(location.search),id=params.get('id'),launch=params.get('launch');
  if(!id||!/^[a-zA-Z0-9-]+$/.test(id)||!launch||launch.includes('..')||launch.startsWith('/')||launch.includes('\\')||/^[a-z]+:/i.test(launch)){status.textContent='مسار تشغيل غير صالح';return}
  document.getElementById('content').src=`./__packages/${id}/${launch}`;
})();
