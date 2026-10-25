const $=(s)=>document.querySelector(s);
const drop=$('#drop'),presetSel=$('#preset'),go=$('#go'),cancelBtn=$('#cancelBtn'),list=$('#list'),encInfo=$('#encInfo');
let queue=[],running=false;

const fmtMB=n=>n>=1048576?(n/1048576).toFixed(1)+' MB':Math.max(1,Math.round(n/1024))+' KB';
const fmtDur=s=>{s=Math.round(s);return Math.floor(s/60)+':'+String(s%60).padStart(2,'0');};

async function init(){
  const {presets,encoder,ready}=await ssak.presets();
  if(!ready){encInfo.textContent='⚠ ffmpeg/ffprobe가 없습니다 — resources/bin을 확인하세요';encInfo.className='st err';return;}
  for(const p of presets){
    const o=document.createElement('option');
    o.value=p.key;o.textContent=p.label+' — '+p.description;
    presetSel.appendChild(o);
  }
  encInfo.textContent='인코더: '+encoder;
  updateGo();
}
function updateGo(){go.disabled=!queue.length||running;cancelBtn.disabled=!running;}

function addFiles(paths){
  for(const p of paths){
    if(queue.some(q=>q.path===p))continue;
    queue.push({path:p,state:'대기',info:null});
    renderItem(queue[queue.length-1]);
  }
  updateGo();
  // 비동기 프로브 — 파일별로
  for(const q of queue){ if(!q.info&&!q.probing){q.probing=true;ssak.probe(q.path).then(i=>{q.info=i;renderItem(q);}).catch(()=>{q.info={error:true};renderItem(q);});} }
}

function renderItem(q){
  let el=document.getElementById('q-'+encodeURIComponent(q.path));
  if(!el){
    el=document.createElement('div');el.className='card';
    el.id='q-'+encodeURIComponent(q.path);
    el.innerHTML=`<div class="frow"><div class="grow"><div class="fname"></div><div class="fmeta"></div><div class="bar"><i></i></div></div><span class="badge"></span></div>`;
    list.appendChild(el);
  }
  el.querySelector('.fname').textContent=q.path.split(/[\\/]/).pop();
  const meta=q.info?(q.info.error?'읽기 실패':`${fmtMB(q.info.size)} · ${fmtDur(q.info.duration)} · ${(q.info.bitrate/1000).toFixed(0)} kbps`):'분석 중…';
  el.querySelector('.fmeta').textContent=(q.outMsg?meta+' → '+q.outMsg:meta);
  el.querySelector('.bar i').style.width=(q.pct||0)+'%';
  const b=el.querySelector('.badge');
  b.textContent=q.state;b.className='badge'+(q.state==='완료'?' ok':q.state==='실패'||q.state==='취소'?' err':'');
  if(q.state==='완료'&&q.output){b.style.cursor='pointer';b.title='폴더에서 보기';b.onclick=()=>ssak.reveal(q.output);}
}

drop.addEventListener('click',async()=>{addFiles(await ssak.selectFiles());});
['dragover','dragenter'].forEach(ev=>drop.addEventListener(ev,e=>{e.preventDefault();drop.classList.add('over');}));
['dragleave','drop'].forEach(ev=>drop.addEventListener(ev,e=>{e.preventDefault();drop.classList.remove('over');}));
drop.addEventListener('drop',e=>{
  const fs=[...e.dataTransfer.files].map(f=>{try{return ssak.pathForFile(f);}catch{return null;}}).filter(Boolean);
  addFiles(fs);
});

let curQ=null;
ssak.onProgress(p=>{if(curQ){curQ.pct=Math.round(p.ratio*100);renderItem(curQ);}});

go.addEventListener('click',async()=>{
  running=true;updateGo();
  for(const q of queue){
    if(q.state==='완료')continue;
    curQ=q;q.state='진행';renderItem(q);
    try{
      const r=await ssak.transcode({input:q.path,presetKey:presetSel.value});
      q.state='완료';q.pct=100;q.output=r.output;q.outMsg=fmtMB(r.outSize)+' 저장됨';
    }catch(e){
      q.state=String(e.message||e).includes('취소')?'취소':'실패';
      q.outMsg=String(e.message||e).split('\n')[0];
    }
    renderItem(q);
    if(q.state==='취소')break;
  }
  curQ=null;running=false;updateGo();
});
cancelBtn.addEventListener('click',()=>ssak.cancel());
$('#adbar').addEventListener('click',()=>ssak.openExternal('https://www.offcut.dev/?utm_source=ssakssak_compressor&utm_medium=app_banner'));
init();
