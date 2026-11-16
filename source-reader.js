// Reconstruct positioned text runs. PDF text order is not always reading order,
// especially when Arabic shaping is emitted as one PDF item per glyph.
export function pdfTextFromItems(items){
  const lines=[];
  for(const item of items){
    if(typeof item.str!=='string'||!item.str||!item.transform)continue;
    const x=item.transform[4],y=item.transform[5],height=Math.abs(item.height||item.transform[3]||12);
    let line=lines.find(l=>Math.abs(l.y-y)<Math.max(2,Math.min(height,l.height)*.22));
    if(!line){line={y,height,items:[]};lines.push(line)}
    line.items.push({...item,x,y,height,text:item.str.normalize('NFKC')});
  }
  return lines.sort((a,b)=>b.y-a.y).map(line=>{
    const letters=line.items.map(i=>i.text).join(''),arabic=(letters.match(/[\u0600-\u06ff]/g)||[]).length,latin=(letters.match(/[A-Za-z]/g)||[]).length;
    const rtl=arabic>latin;
    let runs=line.items.sort((a,b)=>rtl?b.x-a.x:a.x-b.x);
    let text='',previous=null;
    // Keep embedded numeric/Latin sequences left-to-right without reversing words.
    if(rtl){
      const arranged=[];
      for(let i=0;i<runs.length;){
        if(/^[A-Za-z0-9\u0660-\u0669\u06f0-\u06f9.,%:/+-]+$/.test(runs[i].text)){
          const chunk=[];while(i<runs.length&&/^[A-Za-z0-9\u0660-\u0669\u06f0-\u06f9.,%:/+-]+$/.test(runs[i].text))chunk.push(runs[i++]);
          if(chunk.length>1)arranged.push({text:chunk.reverse().map(x=>x.text).join(''),x:Math.min(...chunk.map(x=>x.x)),width:Math.max(...chunk.map(x=>x.x+x.width))-Math.min(...chunk.map(x=>x.x)),height:chunk[0].height});
          else arranged.push(chunk[0]);
        }else arranged.push(runs[i++]);
      }
      runs=arranged;
    }
    for(const run of runs){
      if(previous&&!/\s$/.test(text)&&!/^\s/.test(run.text)){
        const gap=rtl?previous.x-(run.x+run.width):run.x-(previous.x+previous.width);
        const arabicGlyphs=rtl&&/^[\u0600-\u06ff]{1,2}$/.test(previous.text)&&/^[\u0600-\u06ff]{1,2}$/.test(run.text);
        if(gap>Math.min(previous.height,run.height)*.18&&!arabicGlyphs)text+=' ';
      }
      text+=run.text;previous=run;
    }
    return text.replace(/[ \t]+/g,' ').trim();
  }).filter(Boolean).join('\n');
}
