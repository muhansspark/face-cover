import {clamp,coverage,paintMosaic,exportSize} from './core.js';
import {zipSync} from './vendor/fflate.js';
const $=id=>document.getElementById(id),canvas=$('canvas'),ctx=canvas.getContext('2d');
$('photos').tabIndex=0;$('photos').setAttribute('aria-label','사진 목록. 사진 선택 후 Delete 키로 제외합니다.');
const copy=x=>structuredClone(x),pause=()=>new Promise(r=>setTimeout(r,0));
const bytes=n=>n>=1048576?(n/1048576).toFixed(1)+' MB':Math.round(n/1024)+' KB';
let defaults={shape:'rect',effect:'mosaic',strength:16,margin:25,task:'mask'};
let exportDefaults={preset:'report',format:'jpeg',quality:80,maxWidth:1600,maxHeight:1600};
let items=[],item=null,photo=null,result=null,selection=null,mode='select',phase='preview',comparing=false,gesture=null,selectToken=0,queueRunning=false,exporting=false,detector=null,detectorSerial=0;
const jobs=new Map(),timers=new Map();
let renderQueue=Promise.resolve();
function status(message,error=false){$('status').textContent=message;$('status').classList.toggle('error',error);}
function ready(){return item?.state==='ready'&&photo&&!exporting;}
function editable(){return ready()&&phase==='edit'&&item.settings.task==='mask';}
function remember(){item.history.push(copy(item.boxes));if(item.history.length>40)item.history.shift();}
function settingsFor(box){return {...item.settings,...box?.settings};}
function invalidate(target=item){
  if(!target)return;target.revision++;target.reviewed=false;target.blob=null;
  if(target===item&&phase==='edit')target.applied=false;
  if(target===item){comparing=false;result?.close();result=null;syncControls();render();}
  clearTimeout(timers.get(target.id));timers.set(target.id,setTimeout(()=>updateOutput(target),180));list();
}
function list(){
  if($('photos').contains(document.activeElement))$('photos').focus({preventScroll:true});
  $('photos').replaceChildren();
  for(const p of items){const button=document.createElement('button');button.className='photo-card';button.classList.toggle('active',p===item);button.disabled=exporting;button.setAttribute('aria-pressed',String(p===item));
    if(p.thumb){const img=document.createElement('img');img.src=p.thumb;img.alt=p.applied?'처리 결과 축소 미리보기':'원본 사진 축소 미리보기';button.append(img);}
    const text=document.createElement('span'),name=document.createElement('strong'),state=document.createElement('small');name.textContent=p.file.name;
    state.textContent=p.state==='queued'?'대기 중':p.state==='processing'?'변환·검출 중':p.state==='error'?'처리 실패':p.reviewed?'✓ 확인 완료':p.settings.task==='convert'?'변환 결과 확인':p.detectError?'검출 실패 · 직접 확인':!p.boxes.length?'얼굴 미검출 · 확인 필요':'확인 필요 · '+p.boxes.length+'개 영역';
    state.className=p.reviewed?'done':p.state==='error'||p.detectError?'warning':'';text.append(name,state);button.append(text);button.title=p.error||p.file.name;button.onclick=()=>selectPhoto(p.id);$('photos').append(button);
  }
  const count=items.filter(p=>p.reviewed&&p.blob).length,waiting=items.filter(p=>['processing','queued'].includes(p.state)).length;
  $('photoCount').textContent=items.length+'장';$('batchProgress').textContent=`확인 완료 ${count} / ${items.length}장`+(waiting?` · 처리 대기 ${waiting}장`:'');
  $('zip').disabled=exporting||!count;$('zip').textContent=`확인한 ${count}장 ZIP 저장`;
  $('removePhoto').disabled=!item||exporting||item.state==='processing';$('retry').disabled=!item||exporting||['queued','processing'].includes(item.state);
}
function syncControls(){
  const ok=ready(),edit=editable();
  $('editQuick').hidden=false;$('editQuick').disabled=!ok||(phase==='preview'&&item?.settings.task==='convert');$('editQuick').textContent=phase==='edit'?(item?.settings.task==='convert'?'변환 실행':'가리기 실행'):'영역 수정';
  for(const id of ['select','add','detect'])$(id).disabled=!edit;
  $('remove').disabled=!edit||!selection;$('undo').disabled=!edit||!item.history.length;
  $('preview').disabled=!ok;$('preview').hidden=phase==='preview';$('back').hidden=phase!=='preview';$('back').disabled=!ok||item?.settings.task==='convert';
  $('preview').textContent=item?.settings.task==='convert'?'변환 실행 →':'가리기 실행 →';
  $('compare').hidden=phase!=='preview';$('compare').disabled=!ok;$('compare').setAttribute('aria-pressed',String(comparing));$('compare').textContent=comparing?'처리 결과로 돌아가기':'원본 비교';
  $('select').setAttribute('aria-pressed',String(mode==='select'));$('add').setAttribute('aria-pressed',String(mode==='add'));
  $('savePanel').hidden=!ok||phase!=='preview';$('reviewed').checked=!!item?.reviewed;$('reviewed').disabled=!ok||comparing||!item?.blob||!result;
  $('save').disabled=!ok||comparing||!item?.reviewed||!item?.blob;$('next').disabled=exporting;
  $('zoom').disabled=!ok;$('pick').disabled=exporting;
  $('count').textContent=(item?.boxes.length||0)+'개';$('regions').replaceChildren();
  for(const [i,b] of (item?.boxes||[]).entries()){const button=document.createElement('button');button.textContent=`영역 ${i+1} · ${b.kind==='auto'?'자동':'직접 추가'}${b.settings?' · 개별 설정':''}`;button.classList.toggle('selected',b.id===selection);button.disabled=!edit;button.onclick=()=>{selection=b.id;mode='select';$('target').value='region';fillSettings();syncControls();render();};$('regions').append(button);}
  const targetMissing=$('target').value==='region'&&!selection;
  for(const id of ['shape','effect','strength','margin'])$(id).disabled=exporting||targetMissing||item?.settings.task==='convert';
  for(const id of ['task','target','applyAll','overwrite','preset','format','maxWidth','maxHeight'])$(id).disabled=exporting;
  $('quality').disabled=exporting||$('format').value==='png';$('qualityValue').textContent=$('format').value==='png'?'PNG 자동 압축':$('quality').value+'%';
  $('step1').classList.toggle('active',phase==='edit');$('step2').classList.toggle('active',phase==='preview');$('step3').classList.toggle('active',!!item?.reviewed);
}
function fillSettings(){
  const s=$('target').value==='region'?settingsFor(item?.boxes.find(b=>b.id===selection)):(item?.settings||defaults);
  for(const id of ['shape','effect','strength','margin'])$(id).value=s[id];
  $('task').value=item?.settings.task||defaults.task;$('strengthValue').textContent=s.strength;$('marginValue').textContent=s.margin+'%';
  const e=item?.export||exportDefaults;for(const id of ['preset','format','quality','maxWidth','maxHeight'])$(id).value=e[id];$('customSize').hidden=e.preset!=='custom';
  syncControls();
}
function render(){
  if(!photo){canvas.hidden=true;$('empty').hidden=!!item;return;}
  canvas.hidden=false;$('empty').hidden=true;
  const scale=Math.min(1,1600/Math.max(photo.width,photo.height));const w=Math.round(photo.width*scale),h=Math.round(photo.height*scale);if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}
  const viewport=$('viewport'),factor=$('zoom').value==='fit'?Math.min((viewport.clientWidth-32)/photo.width,(viewport.clientHeight-32)/photo.height,1):Number($('zoom').value);
  canvas.style.width=Math.max(1,photo.width*factor)+'px';canvas.style.height=Math.max(1,photo.height*factor)+'px';ctx.clearRect(0,0,w,h);
  if(phase==='preview'&&!comparing){if(result)ctx.drawImage(result,0,0,w,h);else{ctx.fillStyle='#edf1ee';ctx.fillRect(0,0,w,h);ctx.fillStyle='#365e4e';ctx.font='20px sans-serif';ctx.fillText('저장 결과를 준비하고 있어요…',20,50);}return;}
  ctx.drawImage(photo,0,0,w,h);if(comparing||item.settings.task==='convert')return;
  const ratio=w/parseFloat(canvas.style.width),unit=photo.width/w;
  for(const box of item.boxes){const s=settingsFor(box),r=coverage(box,s.margin,photo.width,photo.height),on=selection===box.id;
    ctx.strokeStyle=box.kind==='auto'?'#2875e3':'#d87a16';ctx.fillStyle=box.kind==='auto'?'#2875e31c':'#d87a161c';ctx.lineWidth=(on?3:2)*ratio;ctx.beginPath();
    if(s.shape==='ellipse')ctx.ellipse((r.x+r.w/2)/unit,(r.y+r.h/2)/unit,r.w/2/unit,r.h/2/unit,0,0,Math.PI*2);
    else if(s.shape==='circle')ctx.arc((r.x+r.w/2)/unit,(r.y+r.h/2)/unit,Math.min(r.w,r.h)/2/unit,0,Math.PI*2);
    else ctx.rect(r.x/unit,r.y/unit,r.w/unit,r.h/unit);ctx.fill();ctx.stroke();
    if(on){ctx.setLineDash([4*ratio,3*ratio]);ctx.strokeRect(box.x/unit,box.y/unit,box.w/unit,box.h/unit);ctx.setLineDash([]);ctx.fillStyle='white';for(const [x,y] of [[box.x,box.y],[box.x+box.w,box.y],[box.x,box.y+box.h],[box.x+box.w,box.y+box.h]]){ctx.fillRect(x/unit-5*ratio,y/unit-5*ratio,10*ratio,10*ratio);ctx.strokeRect(x/unit-5*ratio,y/unit-5*ratio,10*ratio,10*ratio);}}
  }canvas.style.cursor=mode==='add'?'crosshair':'default';
}
async function showResult(p){
  if(p!==item||!p.blob)return;const revision=p.revision,token=selectToken,blob=p.blob;
  const bitmap=await createImageBitmap(blob);if(p!==item||revision!==p.revision||token!==selectToken){bitmap.close();return;}result?.close();result=bitmap;
  $('sizeInfo').textContent=`원본 ${bytes(p.file.size)} → 저장 ${bytes(blob.size)} · ${bitmap.width} × ${bitmap.height}px`+(blob.size>p.file.size?' (원본보다 큼)':'');syncControls();render();
}
async function selectPhoto(id){
  if(exporting)return;const p=items.find(p=>p.id===id);if(!p)return;
  const token=++selectToken;item=p;selection=null;gesture=null;mode='select';phase='edit';comparing=false;$('target').value='photo';
  photo?.close();photo=null;result?.close();result=null;$('filename').textContent=p.file.name;$('dimensions').textContent='';$('sizeInfo').textContent=p.error||'저장 결과를 준비하고 있어요.';fillSettings();list();render();
  if(!p.source){status(p.error||'사진을 변환하고 얼굴을 찾고 있어요.',p.state==='error');return;}
  try{const bitmap=await createImageBitmap(p.source,{imageOrientation:'from-image'});if(token!==selectToken){bitmap.close();return;}photo=bitmap;$('dimensions').textContent=`${bitmap.width} × ${bitmap.height}px`;syncControls();render();if(p.blob)await showResult(p);else if(p.state==='ready')updateOutput(p);
    if(!p.applied)$('sizeInfo').textContent='영역 확인 후 실행하면 저장 용량을 계산해요.';
    status(p.detectError?'자동 검출에 실패했어요. 영역 추가로 직접 지정해주세요.':p.settings.task==='convert'?'원본을 확인한 뒤 변환 실행을 눌러주세요.':p.applied?'처리 결과를 확인해주세요. 빠진 얼굴은 영역 수정에서 추가할 수 있어요.':p.boxes.length?'가릴 영역을 먼저 확인·수정한 뒤 가리기 실행을 눌러주세요.':'얼굴을 찾지 못했어요. 가릴 얼굴이 없는지 확인하거나 직접 추가해주세요.',p.detectError);
  }catch{status('사진을 표시하지 못했어요. 다시 처리를 눌러주세요.',true);}
}
async function decode(file){
  try{return {bitmap:await createImageBitmap(file,{imageOrientation:'from-image'}),source:file};}catch{
    if(!/\.(heic|heif)$/i.test(file.name)&&!['image/heic','image/heif'].includes(file.type))throw Error('지원하지 않거나 손상된 사진입니다.');
    const {heicTo}=await import('./vendor/heic-to.js');const source=await heicTo({blob:file,type:'image/png'});return {source,bitmap:await createImageBitmap(source)};
  }
}
async function findFaces(bitmap){
  detector??=new Worker('./detector.js');const id=++detectorSerial,transferred=await createImageBitmap(bitmap);
  return new Promise((resolve,reject)=>{const timer=setTimeout(()=>fail(),60000);const fail=()=>{clearTimeout(timer);detector?.terminate();detector=null;reject(Error('얼굴 검출 실패'));};detector.onerror=fail;detector.onmessage=({data})=>{if(data.id!==id)return;if(data.error){fail();return;}clearTimeout(timer);resolve(data.boxes.map(b=>({...b,id:crypto.randomUUID()})));};detector.postMessage({bitmap:transferred,id},[transferred]);});
}
async function addFiles(files){
  if(exporting)return;let total=items.reduce((s,p)=>s+p.file.size,0),skipped=0;
  for(const file of files){if(items.length>=40||file.size>30*1024*1024||total+file.size>300*1024*1024||!(/\.(heic|heif|jpe?g|png|webp)$/i.test(file.name)||/^image\/(jpeg|png|webp|heic|heif)$/.test(file.type))){skipped++;continue;}
    total+=file.size;items.push({id:crypto.randomUUID(),file,source:null,boxes:[],history:[],settings:copy(defaults),export:copy(exportDefaults),custom:false,revision:0,reviewed:false,state:'queued',thumb:null,blob:null});}
  list();if(!item&&items.length)selectPhoto(items[0].id);if(skipped)status(`${skipped}개 파일은 제외했어요. 지원 형식·한 장 30MB·총 300MB·40장 제한을 확인해주세요.`,true);processQueue();
}
async function processQueue(){
  if(queueRunning)return;queueRunning=true;
  try{let p;while((p=items.find(p=>p.state==='queued'))){p.state='processing';p.error='';list();let bitmap;
    try{const decoded=await decode(p.file);bitmap=decoded.bitmap;
      if(bitmap.width*bitmap.height>24000000||Math.max(bitmap.width,bitmap.height)>16000)throw Error('2,400만 화소·한 변 16,000px 이하 사진을 사용해주세요.');
      const resident=items.reduce((sum,q)=>sum+q.file.size+(q!==p&&q.source&&q.source!==q.file?q.source.size:0)+(q.blob?.size||0),0);
      if(resident+(decoded.source!==p.file?decoded.source.size:0)>400*1024*1024)throw Error('작업 메모리 한도에 도달했어요. 저장한 사진을 목록에서 제외한 후 다시 처리해주세요.');
      p.source=decoded.source;p.width=bitmap.width;p.height=bitmap.height;p.detectError=false;
      if(p.settings.task==='mask'){try{const found=await findFaces(bitmap);p.boxes=[...p.boxes.filter(b=>b.kind==='manual'),...found];}catch{p.detectError=true;}p.detected=true;}
      p.state='ready';p.applied=false;
      const thumb=document.createElement('canvas'),scale=Math.min(1,160/Math.max(bitmap.width,bitmap.height));thumb.width=Math.max(1,Math.round(bitmap.width*scale));thumb.height=Math.max(1,Math.round(bitmap.height*scale));thumb.getContext('2d').drawImage(bitmap,0,0,thumb.width,thumb.height);const preview=await blobFrom(thumb,'image/jpeg',.65);if(p.thumb)URL.revokeObjectURL(p.thumb);p.thumb=URL.createObjectURL(preview);thumb.width=thumb.height=1;
      if(item===p)await selectPhoto(p.id);
    }catch(error){p.state='error';p.error='변환 실패: '+error.message;if(item===p)status(p.error,true);}
    finally{bitmap?.close();list();syncControls();await pause();}
  }}finally{queueRunning=false;list();}
}
const blobFrom=(canvas,type,quality)=>new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(Error('이미지 저장 실패')),type,quality));
async function bake(source,boxes,settings,options){
  const bitmap=await createImageBitmap(source,{imageOrientation:'from-image'}),full=document.createElement('canvas'),scaled=document.createElement('canvas');
  try{full.width=bitmap.width;full.height=bitmap.height;paintMosaic(full,bitmap,settings.task==='convert'?[]:boxes,settings.strength,settings.margin,settings);
    let maxWidth=options.maxWidth,maxHeight=options.maxHeight;if(options.preset==='original')maxWidth=maxHeight=Infinity;else if(options.preset==='report')maxWidth=maxHeight=1600;else if(options.preset==='small')maxWidth=maxHeight=1200;
    const size=exportSize(full.width,full.height,maxWidth,maxHeight);scaled.width=size.width;scaled.height=size.height;const c=scaled.getContext('2d');if(options.format==='jpeg'){c.fillStyle='#fff';c.fillRect(0,0,scaled.width,scaled.height);}c.imageSmoothingQuality='high';c.drawImage(full,0,0,scaled.width,scaled.height);
    return await blobFrom(scaled,options.format==='jpeg'?'image/jpeg':'image/png',options.quality/100);
  }finally{bitmap.close();full.width=full.height=scaled.width=scaled.height=1;}
}
async function updateOutput(p){
  if(!p.source||p.state!=='ready'||!items.includes(p)||!p.applied)return;
  if(jobs.has(p.id))return jobs.get(p.id);
  const job=renderQueue.then(async()=>{do{if(!items.includes(p)||p.state!=='ready'||!p.source||!p.applied)return;const revision=p.revision,settings=copy(p.settings),options=copy(p.export),boxes=copy(p.boxes);try{
    await pause();const blob=await bake(p.source,boxes,settings,options);if(!items.includes(p))return;if(revision!==p.revision)continue;
    p.blob=blob;const image=await createImageBitmap(blob),thumb=document.createElement('canvas'),scale=Math.min(1,160/Math.max(image.width,image.height));thumb.width=Math.max(1,Math.round(image.width*scale));thumb.height=Math.max(1,Math.round(image.height*scale));thumb.getContext('2d').drawImage(image,0,0,thumb.width,thumb.height);image.close();const tb=await blobFrom(thumb,'image/jpeg',.65);thumb.width=thumb.height=1;
    if(revision!==p.revision)continue;if(p.thumb)URL.revokeObjectURL(p.thumb);p.thumb=URL.createObjectURL(tb);list();if(item===p)await showResult(p);return;
  }catch(error){p.blob=null;p.reviewed=false;if(item===p)status('저장 결과 준비 실패: '+error.message,true);return;}}while(items.includes(p));});
  renderQueue=job.catch(()=>{});
  jobs.set(p.id,job);try{await job;}finally{jobs.delete(p.id);}
}
function changeSettings(){
  const values={shape:$('shape').value,effect:$('effect').value,strength:+$('strength').value,margin:+$('margin').value};
  if(item){if($('target').value==='region'){const box=item.boxes.find(b=>b.id===selection);if(!box)return;remember();box.settings=values;}else{Object.assign(item.settings,values);item.custom=true;}invalidate();}
  else Object.assign(defaults,values);$('strengthValue').textContent=values.strength;$('marginValue').textContent=values.margin+'%';
}
function changeExport(event){
  const options=item?item.export:exportDefaults;
  const previous=JSON.stringify(options);
  if(event.target.id==='preset'){options.preset=$('preset').value;if(options.preset==='report'){options.format='jpeg';options.quality=80;options.maxWidth=options.maxHeight=1600;}if(options.preset==='small'){options.format='jpeg';options.quality=70;options.maxWidth=options.maxHeight=1200;}}
  else{options.format=$('format').value;options.quality=+$('quality').value;options.maxWidth=clamp(+$('maxWidth').value||1600,100,16000);options.maxHeight=clamp(+$('maxHeight').value||1600,100,16000);}
  if(item&&JSON.stringify(options)!==previous){item.custom=true;invalidate();}fillSettings();
}
function point(e){const r=canvas.getBoundingClientRect();return{x:clamp((e.clientX-r.left)*photo.width/r.width,0,photo.width),y:clamp((e.clientY-r.top)*photo.height/r.height,0,photo.height)};}
canvas.onpointerdown=e=>{
  if(!editable()||e.button!==0)return;const p=point(e),threshold=12*photo.width/canvas.getBoundingClientRect().width,current=item.boxes.find(b=>b.id===selection);let corner=null;
  if(current&&mode==='select')for(const [key,x,y] of [['nw',current.x,current.y],['ne',current.x+current.w,current.y],['sw',current.x,current.y+current.h],['se',current.x+current.w,current.y+current.h]])if(Math.hypot(p.x-x,p.y-y)<threshold)corner=key;
  const hit=mode==='select'?[...item.boxes].reverse().find(b=>{const r=coverage(b,settingsFor(b).margin,photo.width,photo.height);return p.x>=r.x&&p.x<=r.x+r.w&&p.y>=r.y&&p.y<=r.y+r.h;}):null;
  if(mode!=='add'&&!corner&&!hit){selection=null;syncControls();render();return;}remember();
  if(mode==='add'){const b={id:crypto.randomUUID(),kind:'manual',x:p.x,y:p.y,w:0,h:0};item.boxes.push(b);selection=b.id;gesture={type:'add',start:p};}
  else{selection=corner?current.id:hit.id;gesture={type:corner?'resize':'move',corner,start:p,original:copy(item.boxes.find(b=>b.id===selection))};}
  gesture.pointerId=e.pointerId;canvas.setPointerCapture(e.pointerId);item.reviewed=false;syncControls();render();
};
canvas.onpointermove=e=>{if(!gesture||e.pointerId!==gesture.pointerId)return;const p=point(e),b=item.boxes.find(b=>b.id===selection),g=gesture;
  if(g.type==='add'){b.x=Math.min(g.start.x,p.x);b.y=Math.min(g.start.y,p.y);b.w=Math.abs(p.x-g.start.x);b.h=Math.abs(p.y-g.start.y);}
  else if(g.type==='move'){b.x=clamp(g.original.x+p.x-g.start.x,0,photo.width-b.w);b.y=clamp(g.original.y+p.y-g.start.y,0,photo.height-b.h);}
  else{const o=g.original,anchor={x:g.corner.includes('w')?o.x+o.w:o.x,y:g.corner.includes('n')?o.y+o.h:o.y};b.x=Math.min(anchor.x,p.x);b.y=Math.min(anchor.y,p.y);b.w=Math.min(Math.max(3,Math.abs(p.x-anchor.x)),photo.width-b.x);b.h=Math.min(Math.max(3,Math.abs(p.y-anchor.y)),photo.height-b.y);}render();};
canvas.onpointerup=e=>{if(!gesture||e.pointerId!==gesture.pointerId)return;const b=item.boxes.find(b=>b.id===selection);if(!b||b.w<3||b.h<3){item.boxes=item.history.pop();selection=null;}gesture=null;canvas.releasePointerCapture(e.pointerId);invalidate();};
canvas.onpointercancel=()=>{if(gesture){item.boxes=item.history.pop();gesture=null;selection=null;invalidate();}};
$('pick').onclick=$('empty').onclick=()=>$('file').click();$('file').onchange=e=>{addFiles([...e.target.files]);e.target.value='';};
for(const name of ['dragenter','dragover'])$('viewport').addEventListener(name,e=>{e.preventDefault();$('viewport').classList.add('dragover');});$('viewport').ondragleave=()=>$('viewport').classList.remove('dragover');$('viewport').ondrop=e=>{e.preventDefault();$('viewport').classList.remove('dragover');addFiles([...e.dataTransfer.files]);};
$('select').onclick=()=>{mode='select';syncControls();render();};$('add').onclick=()=>{mode='add';selection=null;$('target').value='photo';fillSettings();render();status('가릴 부분을 드래그해주세요. 선택한 모양으로 적용됩니다.');};
$('remove').onclick=()=>{if(!editable()||!selection)return;remember();item.boxes=item.boxes.filter(b=>b.id!==selection);selection=null;invalidate();};$('undo').onclick=()=>{if(!editable()||!item.history.length)return;item.boxes=item.history.pop();selection=null;invalidate();};
$('detect').onclick=()=>{if(!editable())return;remember();item.state='queued';invalidate();processQueue();};
$('retry').onclick=()=>{if(!item||exporting)return;item.state='queued';invalidate();processQueue();};
$('preview').onclick=()=>{if(!ready())return;item.applied=true;phase='preview';comparing=false;selection=null;syncControls();render();updateOutput(item);};$('back').onclick=()=>{phase='edit';comparing=false;syncControls();render();};
$('editQuick').onclick=()=>phase==='edit'?$('preview').click():$('back').click();
$('compare').onclick=()=>{comparing=!comparing;syncControls();render();};
$('target').onchange=()=>{fillSettings();render();};for(const id of ['shape','effect','strength','margin'])$(id).oninput=changeSettings;
$('task').onchange=()=>{const s=item?item.settings:defaults;s.task=$('task').value;if(item){item.custom=true;phase='edit';if(s.task==='mask'&&!item.detected&&item.state==='ready')item.state='queued';invalidate();processQueue();}fillSettings();};
$('applyAll').onclick=()=>{defaults=copy(item?.settings||defaults);exportDefaults=copy(item?.export||exportDefaults);const replace=$('overwrite').value==='replace';let changed=0;
  for(const p of items){if(p!==item&&p.custom&&!replace)continue;p.settings=copy(defaults);p.export=copy(exportDefaults);if(replace){p.boxes.forEach(b=>delete b.settings);p.custom=false;}if(p.settings.task==='mask'&&!p.detected&&p.state==='ready')p.state='queued';invalidate(p);changed++;}processQueue();fillSettings();status(`${changed}장에 설정을 적용했어요. 변경된 사진은 다시 확인해주세요.`);};
for(const id of ['preset','format','quality','maxWidth','maxHeight'])$(id).addEventListener(id==='quality'?'input':'change',changeExport);
$('reviewed').onchange=()=>{if(!ready()||comparing||!item.blob||!result)return;item.reviewed=$('reviewed').checked;syncControls();list();};
$('next').onclick=()=>{const index=items.indexOf(item);const next=[...items.slice(index+1),...items.slice(0,index)].find(p=>p.state==='ready'&&!p.reviewed);if(next)selectPhoto(next.id);else status('현재 확인할 수 있는 미확인 사진이 없어요.');};
$('removePhoto').onclick=()=>{if(!item||item.state==='processing'||exporting)return;const old=item,index=items.indexOf(old);items=items.filter(p=>p!==old);clearTimeout(timers.get(old.id));if(old.thumb)URL.revokeObjectURL(old.thumb);old.source=null;old.blob=null;selectToken++;photo?.close();result?.close();photo=result=null;item=null;if(items.length)selectPhoto(items[Math.min(index,items.length-1)].id);else{fillSettings();list();render();$('filename').textContent='사진을 추가해주세요';$('dimensions').textContent='';}};
function download(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);}
const outputName=(p,index='')=>(index?index+'_':'')+p.file.name.replace(/\.[^.]+$/,'').replace(/[<>:"/\\|?*\x00-\x1f]/g,'_')+(p.settings.task==='convert'?'_변환':'_가림')+(p.export.format==='jpeg'?'.jpg':'.png');
$('save').onclick=()=>{if(!item?.reviewed||!item.blob||comparing)return;download(item.blob,outputName(item));status('이 사진의 다운로드를 시작했어요.');};
$('zip').onclick=async()=>{const confirmed=items.filter(p=>p.reviewed&&p.blob);if(!confirmed.length||exporting)return;
  if(confirmed.reduce((n,p)=>n+p.blob.size,0)>200*1024*1024){status('ZIP 결과가 200MB를 넘어요. 저장 용량을 줄이거나 개별 저장해주세요.',true);return;}
  exporting=true;syncControls();list();status(`확인한 ${confirmed.length}장을 ZIP으로 묶고 있어요.`);
  try{const entries=Object.create(null);for(const [i,p] of confirmed.entries()){entries[outputName(p,String(i+1).padStart(2,'0'))]=new Uint8Array(await p.blob.arrayBuffer());await pause();}const zipped=zipSync(entries,{level:0});download(new Blob([zipped],{type:'application/zip'}),'얼굴가리기_확인완료.zip');status(`확인한 ${confirmed.length}장 저장을 시작했어요. 나머지 ${items.length-confirmed.length}장은 제외했습니다.`);}catch{status('ZIP 저장에 실패했어요. 개별 저장하거나 사진 수를 줄여주세요.',true);}finally{exporting=false;syncControls();list();}
};
$('zoom').onchange=render;new ResizeObserver(render).observe($('viewport'));
document.addEventListener('keydown',e=>{if(['INPUT','SELECT','TEXTAREA'].includes(document.activeElement.tagName)||document.activeElement.isContentEditable||gesture)return;if(e.key==='Delete'&&!e.repeat){if($('photos').contains(document.activeElement)){if(!$('removePhoto').disabled)$('removePhoto').click();}else if(editable()&&selection)$('remove').click();e.preventDefault();}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'&&editable()){$('undo').click();e.preventDefault();}if(e.key==='Escape'){selection=null;mode='select';syncControls();render();}});
if('serviceWorker'in navigator&&location.protocol!=='file:')navigator.serviceWorker.register('./sw.js').then(async()=>{await navigator.serviceWorker.ready;$('offline').textContent='오프라인 사용 준비 완료';}).catch(()=>{$('offline').textContent='오프라인 캐시 준비 실패 · 연결 상태 확인';});
fillSettings();list();
