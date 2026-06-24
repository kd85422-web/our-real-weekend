/* ================= 아워리얼위켄드 · app.js =================
 * 로컬 모드(이 기기에만 저장) + 클라우드 모드(부부 공유) 자동 전환.
 *  - config.js 에 Supabase 키가 있고, 공유 코드(space)가 설정되면 → 클라우드
 *  - 그 외 → 로컬(localStorage)
 * ========================================================== */

const KEY='orw_db_v1';
const SPACE_KEY='orw_space';
const RECO_SPACE='__recos__';   // 자동 추천이 채워지는 공유 공간
const COST_LABEL={free:'무료',cheap:'저렴',mid:'보통',high:'넉넉'};
const REGIONS=['서울','경기','인천','강원','충남','충북','전북','전남','경북','경남','제주'];

/* ---------------- 클라우드 레이어 ---------------- */
const Cloud={ sb:null, space:null, mode:'local' };
function buildClient(){
  const c=window.ORW_CONFIG||{};
  Cloud.space=localStorage.getItem(SPACE_KEY)||'';
  if(c.SUPABASE_URL && c.SUPABASE_ANON_KEY && window.supabase){
    try{ Cloud.sb=window.supabase.createClient(c.SUPABASE_URL,c.SUPABASE_ANON_KEY); }catch(e){ Cloud.sb=null; }
  }
  Cloud.mode=(Cloud.sb && Cloud.space)?'cloud':'local';
}
const configPresent=()=>!!(window.ORW_CONFIG&&window.ORW_CONFIG.SUPABASE_URL&&window.ORW_CONFIG.SUPABASE_ANON_KEY);

async function cloudFetch(){
  const [pl,rv]=await Promise.all([
    Cloud.sb.from('places').select('payload').eq('space',Cloud.space),
    Cloud.sb.from('reviews').select('payload').eq('space',Cloud.space)
  ]);
  if(pl.error||rv.error) throw (pl.error||rv.error);
  return {places:(pl.data||[]).map(r=>r.payload), reviews:(rv.data||[]).map(r=>r.payload)};
}
async function cloudFetchRecos(){
  const {data,error}=await Cloud.sb.from('places').select('payload').eq('space',RECO_SPACE);
  if(error) throw error;
  return (data||[]).map(r=>({...r.payload, _reco:true}));
}
async function cloudUpsertPlace(p){ if(Cloud.mode!=='cloud')return;
  const {error}=await Cloud.sb.from('places').upsert({id:p.id,space:Cloud.space,payload:p,updated_at:new Date().toISOString()});
  if(error) toast('동기화 실패 — 잠시 후 다시'); }
async function cloudUpsertReview(r){ if(Cloud.mode!=='cloud')return;
  const {error}=await Cloud.sb.from('reviews').upsert({id:r.id,space:Cloud.space,payload:r,updated_at:new Date().toISOString()});
  if(error) toast('동기화 실패 — 잠시 후 다시'); }
async function cloudPushAll(){ if(Cloud.mode!=='cloud')return;
  await Cloud.sb.from('places').delete().eq('space',Cloud.space);
  await Cloud.sb.from('reviews').delete().eq('space',Cloud.space);
  if(DB.places.length) await Cloud.sb.from('places').upsert(DB.places.map(p=>({id:p.id,space:Cloud.space,payload:p})));
  if(DB.reviews.length) await Cloud.sb.from('reviews').upsert(DB.reviews.map(r=>({id:r.id,space:Cloud.space,payload:r}))); }

let _rt=null, _rtTimer=null;
function subscribeRealtime(){
  if(Cloud.mode!=='cloud') return;
  if(_rt){ Cloud.sb.removeChannel(_rt); _rt=null; }
  _rt=Cloud.sb.channel('orw-'+Cloud.space)
    .on('postgres_changes',{event:'*',schema:'public',table:'places',filter:'space=eq.'+Cloud.space},onRemoteChange)
    .on('postgres_changes',{event:'*',schema:'public',table:'reviews',filter:'space=eq.'+Cloud.space},onRemoteChange)
    .subscribe();
}
function onRemoteChange(){ clearTimeout(_rtTimer); _rtTimer=setTimeout(async()=>{
  try{ const d=await cloudFetch(); DB.places=d.places; DB.reviews=d.reviews; localStorage.setItem(KEY,JSON.stringify(DB)); renderAll(); }catch(e){}
},500); }

/* ---------------- 데이터 ---------------- */
function seed(){
  return { profile:'나', places:[], reviews:[] };
}
let DB;
function saveLocal(){ localStorage.setItem(KEY, JSON.stringify(DB)); }

async function loadData(){
  if(Cloud.mode==='cloud'){
    try{
      const d=await cloudFetch();
      let recos=[]; try{ recos=await cloudFetchRecos(); }catch(e){}
      if(d.places.length===0 && d.reviews.length===0 && recos.length===0){
        DB=seed(); await cloudPushAll();
      } else {
        const map={}; recos.forEach(p=>map[p.id]=p); d.places.forEach(p=>map[p.id]=p);
        DB={profile:'나', places:Object.values(map), reviews:d.reviews};
      }
      saveLocal(); return;
    }catch(e){ toast('클라우드 연결 실패 — 로컬로 동작'); Cloud.mode='local'; }
  }
  try{ DB=JSON.parse(localStorage.getItem(KEY)); }catch(e){}
  if(!DB||!DB.places) { DB=seed(); saveLocal(); }
}

async function resetData(){
  if(!confirm('우리 기록(찜·후기·방문)을 모두 비울까요? 자동 추천 목록은 그대로 유지돼요.')) return;
  if(Cloud.mode==='cloud'){
    try{
      await Cloud.sb.from('places').delete().eq('space',Cloud.space);
      await Cloud.sb.from('reviews').delete().eq('space',Cloud.space);
    }catch(e){}
  }
  localStorage.removeItem(KEY);
  await loadData();
  renderAll(); showOnly('s-home'); setNavActive('s-home'); toast('우리 기록을 비웠어요');
}

/* ---------------- 헬퍼 ---------------- */
const picsum=(s,w=800,h=800)=>`https://picsum.photos/seed/${encodeURIComponent(s)}/${w}/${h}`;
const pimg=(p,w=800,h=800)=>(p&&p.photo&&/^https?:/.test(p.photo))?p.photo:picsum(p?p.seed:'x',w,h);
const $=id=>document.getElementById(id);
const place=id=>DB.places.find(p=>p.id===id);
const reviewsOf=id=>DB.reviews.filter(r=>r.placeId===id).sort((a,b)=>a.author==='나'?-1:1);
const fmtDate=d=>{const x=new Date(d); const w=['일','월','화','수','목','금','토'][x.getDay()]; return `${x.getFullYear()}.${String(x.getMonth()+1).padStart(2,'0')}.${String(x.getDate()).padStart(2,'0')} (${w})`;};
const fmtYmd=s=>s&&s.length===8?`${s.slice(0,4)}.${s.slice(4,6)}.${s.slice(6,8)}`:'';
const fmtRange=(a,b)=>{const s=fmtYmd(a),e=fmtYmd(b); return e&&e!==s?`${s} ~ ${e}`:s;};
const avgRating=id=>{const rs=reviewsOf(id); if(!rs.length) return place(id).rating||0; return (rs.reduce((s,r)=>s+r.rating,0)/rs.length);};
const starStr=n=>'★'.repeat(Math.round(n))+'☆'.repeat(5-Math.round(n));
function toast(msg){const t=$('toast'); t.textContent=msg; t.classList.add('show'); clearTimeout(t._t); t._t=setTimeout(()=>t.classList.remove('show'),1800);}

/* ---------------- 카드 / 행 생성 (template 클론) ---------------- */
function makeCard(p){
  const el=document.getElementById('tpl-card').content.cloneNode(true);
  const card=el.querySelector('.card');
  card.onclick=()=>openDetail(p.id);
  card.querySelector('img').src=pimg(p,400,400);
  const heart=card.querySelector('.heart');
  heart.className='heart'+(p.wished?' on':'');
  heart.onclick=e=>toggleHeart(e,p.id);
  card.querySelector('.tag').textContent=`${p.emoji} ${p.type}`;
  card.querySelector('h3').textContent=p.name;
  card.querySelector('.line').textContent=`${p.source||''}${p.dist?` · 차로 ${p.dist}분`:''}`;
  const price=card.querySelector('.price');
  if(COST_LABEL[p.cost]){
    const b=document.createElement('b'); b.textContent=COST_LABEL[p.cost]; price.appendChild(b);
    price.appendChild(document.createTextNode(` · ⭐ ${avgRating(p.id).toFixed(1)}`));
  } else {
    price.textContent=`⭐ ${avgRating(p.id).toFixed(1)}`;
  }
  return card;
}

function makeRecordRow(p){
  const el=document.getElementById('tpl-record-row').content.cloneNode(true);
  const row=el.querySelector('.row');
  const rs=reviewsOf(p.id);
  const date=rs[0]?.date;
  row.onclick=()=>openDetail(p.id);
  row.querySelector('img').src=pimg(p,200,200);
  row.querySelector('h3').textContent=p.name;
  row.querySelector('.sub').textContent=`${date?fmtDate(date):''} · ${p.loc||''}`;
  const reviewers=row.querySelector('.reviewers');
  rs.forEach(r=>{
    const av=document.createElement('span');
    av.className='av '+(r.author==='나'?'me':'h');
    av.textContent=r.author==='나'?'나':'남';
    reviewers.appendChild(av);
    reviewers.appendChild(document.createTextNode(`★${r.rating} `));
  });
  if(rs.some(r=>r.revisit)){
    const span=document.createElement('span');
    span.style.color='var(--primary)';
    span.textContent='· ♥ 또 가고싶어요';
    reviewers.appendChild(span);
  }
  return row;
}

function makeProgressCard(region, n){
  const el=document.getElementById('tpl-progress-card').content.cloneNode(true);
  const card=el.querySelector('.progress-card');
  card.querySelector('b').textContent=region;
  card.querySelector('span').textContent=`${n}곳 방문`;
  card.querySelector('i').style.width=`${Math.min(100, n*22+10)}%`;
  return card;
}

function makeReviewItem(r){
  const el=document.getElementById('tpl-review').content.cloneNode(true);
  const rev=el.querySelector('.review');
  const av=rev.querySelector('.av');
  av.className='av '+(r.author==='나'?'me':'h');
  av.textContent=r.author==='나'?'나':'남';
  rev.querySelector('.rv-author-name').textContent=r.author==='나'?'아내':'남편';
  rev.querySelector('.when').textContent=` · ${fmtDate(r.date)}`;
  rev.querySelector('.rv-stars').textContent=starStr(r.rating);
  rev.querySelector('p').textContent=r.text;
  const photos=rev.querySelector('.rv-photos');
  if(r.photos&&r.photos.length){
    r.photos.forEach(s=>{ const imgEl=document.createElement('img'); imgEl.src=picsum(s,200,200); photos.appendChild(imgEl); });
  }
  return rev;
}

/* ---------------- 렌더링 ---------------- */
function renderAll(){ renderHome(); renderWish(); renderMap(); renderRecord(); }

function renderHome(){
  const banner=$('home-banner');
  if(Cloud.mode==='cloud'){
    banner.className='banner cloud';
    banner.textContent=`☁️ 부부 공유 중 · 코드 ${Cloud.space} · 설정 ▸`;
  } else {
    banner.className='banner';
    banner.textContent='📱 이 기기에만 저장 중 · 부부 공유 설정하기 ▸';
  }

  const best=DB.places.find(p=>p.best)||DB.places.find(p=>!p.visited)||DB.places[0];
  const bigpick=$('home-bigpick');
  if(best){
    bigpick.style.display='';
    bigpick.onclick=()=>openDetail(best.id);
    $('home-bp-img').src=pimg(best,900,1100);
    const bpHeart=$('home-bp-heart');
    bpHeart.className='heart'+(best.wished?' on':'');
    bpHeart.onclick=e=>toggleHeart(e,best.id);
    $('home-bp-name').textContent=best.name;
    $('home-bp-loc').textContent=[best.loc, best.dist?`차로 ${best.dist}분`:'', COST_LABEL[best.cost], (best.source||'')+' 추천'].filter(Boolean).join(' · ');
  } else {
    bigpick.style.display='none';
  }

  const others=DB.places.filter(p=>!p.visited && p.id!==(best&&best.id) && !p.wished);
  const grid=$('home-grid');
  grid.innerHTML='';
  others.forEach(p=>grid.appendChild(makeCard(p)));
}

function renderWish(){
  const list=DB.places.filter(p=>p.wished);
  $('wish-count').textContent=list.length;
  const grid=$('wish-grid');
  const empty=$('wish-empty');
  grid.innerHTML='';
  if(list.length){
    list.forEach(p=>grid.appendChild(makeCard(p)));
    grid.style.display=''; empty.style.display='none';
  } else {
    grid.style.display='none'; empty.style.display='';
  }
}

function renderRecord(){
  const visited=DB.places.filter(p=>p.visited).sort((a,b)=>{
    const da=reviewsOf(a.id)[0]?.date||'', db=reviewsOf(b.id)[0]?.date||''; return db.localeCompare(da);});
  const uniqCost=[...new Set(DB.reviews.map(r=>r.placeId))].reduce((s,id)=>{
    const r=reviewsOf(id)[0]; return s+(r?.cost||0);},0);

  $('record-count').textContent=visited.length;
  $('record-cost').textContent=(uniqCost/10000).toFixed(0);

  const list=$('record-list');
  const empty=$('record-empty');
  list.innerHTML='';
  if(visited.length){
    visited.forEach(p=>list.appendChild(makeRecordRow(p)));
    list.style.display=''; empty.style.display='none';
  } else {
    list.style.display='none'; empty.style.display='';
  }
}

function renderMap(){
  const counts={};
  DB.places.filter(p=>p.visited).forEach(p=>{counts[p.region]=(counts[p.region]||0)+1;});
  const tier=n=> n>=6?'v3': n>=3?'v2': n>=1?'v1':'';

  $('map-visited').textContent=Object.keys(counts).length;

  ['경기','강원','충남','제주'].forEach(region=>{
    const el=document.getElementById(`reg-${region}`);
    if(el) el.className.baseVal='reg '+tier(counts[region]||0);
  });

  const bars=$('map-bars');
  const empty=$('map-empty');
  bars.innerHTML='';
  const entries=Object.entries(counts).sort((a,b)=>b[1]-a[1]);
  if(entries.length){
    entries.forEach(([region,n])=>bars.appendChild(makeProgressCard(region,n)));
    bars.style.display=''; empty.style.display='none';
  } else {
    bars.style.display='none'; empty.style.display='';
  }
}

/* ---------------- 상세 ---------------- */
let currentId=null, backTo='s-home';
function openDetail(id){
  currentId=id; const p=place(id); if(!p) return;
  const rs=reviewsOf(id);
  const visits=[...new Set(rs.map(r=>r.date))].length;
  const cost=rs.length? rs[0].cost : null;

  $('detail-img').src=pimg(p,900,700);

  const heart=$('detail-heart');
  heart.className='heart'+(p.wished?' on':'');
  heart.onclick=e=>{ toggleHeart(e,p.id); openDetail(p.id); };

  $('detail-name').textContent=p.name;
  $('detail-loc').textContent=[p.loc, p.dist?`차로 ${p.dist}분`:'', (p.source||'')+' 추천'].filter(Boolean).join(' · ');

  const eventdate=$('detail-eventdate');
  if(p.eventStart){ eventdate.textContent=`📅 ${fmtRange(p.eventStart,p.eventEnd)}`; eventdate.style.display=''; }
  else { eventdate.style.display='none'; }

  const pills=$('detail-pills');
  pills.innerHTML='';
  [
    `${p.emoji} ${p.type}`,
    p.indoor?'🏠 실내':'🌤️ 야외',
    COST_LABEL[p.cost]?`💳 ${COST_LABEL[p.cost]}`:null
  ].filter(Boolean).forEach(text=>{
    const span=document.createElement('span'); span.className='pill'; span.textContent=text; pills.appendChild(span);
  });

  const link=$('detail-link');
  if(p.link){
    link.href=p.link;
    link.textContent=(p.source&&p.source.includes('유튜브'))?'▶️ 유튜브에서 보기 →':'🔍 네이버에서 보기 →';
    link.style.display='flex';
  } else { link.style.display='none'; }

  $('detail-rating').textContent=rs.length?avgRating(id).toFixed(1):'-';
  $('detail-visits').textContent=`${visits}번`;
  $('detail-cost').textContent=cost?`${(cost/10000).toFixed(1)}만`:'-';

  const reviewsContainer=$('detail-reviews');
  const noReviews=$('detail-no-reviews');
  reviewsContainer.innerHTML='';
  if(rs.length){
    rs.forEach(r=>reviewsContainer.appendChild(makeReviewItem(r)));
    reviewsContainer.style.display=''; noReviews.style.display='none';
  } else {
    reviewsContainer.style.display='none'; noReviews.style.display='';
  }

  $('detail-cta-title').textContent=p.visited?'다시 다녀오셨나요?':'다녀오셨나요?';
  $('detail-cta-btn').onclick=()=>openForm(p.id);

  showOnly('s-detail');
}
function goBack(){ showOnly(backTo); }

/* ---------------- 후기 작성 ---------------- */
let formState={};
function openForm(id){
  const p=place(id);
  formState={placeId:id, author:DB.profile||'나', rating:5, revisit:true, photos:[]};

  $('form-back').onclick=()=>openDetail(id);
  $('form-place-label').textContent=`${p.emoji} ${p.name}`;
  setAuthor(formState.author);
  setRating(formState.rating);
  $('fText').value='';
  $('fDate').value=new Date().toISOString().slice(0,10);
  $('fCost').value='';
  $('photoBox').innerHTML='<div class="slot" onclick="addPhoto()">＋</div>';
  $('revSwitch').classList.add('on');

  showOnly('s-form');
}
function setAuthor(a){ formState.author=a; document.querySelectorAll('#whoPick button').forEach((b,i)=>b.classList.toggle('on',(i===0)===(a==='나'))); }
function setRating(n){ formState.rating=n; document.querySelectorAll('#starPick span').forEach((s,i)=>s.classList.toggle('on',i<n)); }
function toggleRev(){ formState.revisit=!formState.revisit; $('revSwitch').classList.toggle('on',formState.revisit); }
function addPhoto(){ const s='ph'+Math.floor(Math.random()*99999); formState.photos.push(s);
  const box=$('photoBox'); const el=document.createElement('div'); el.className='slot';
  const imgEl=document.createElement('img'); imgEl.src=picsum(s,200,200); el.appendChild(imgEl); box.appendChild(el); }
async function saveReview(){
  const r={id:'r'+Date.now(), placeId:formState.placeId, author:formState.author,
    rating:formState.rating, text:$('fText').value.trim(), photos:formState.photos,
    date:$('fDate').value||new Date().toISOString().slice(0,10), revisit:formState.revisit,
    cost:parseInt($('fCost').value)||0};
  DB.reviews.push(r);
  const p=place(formState.placeId); p.visited=true; p.wished=false; p.best=false;
  saveLocal(); renderAll(); toast('후기를 저장했어요 ✨'); openDetail(formState.placeId);
  await cloudUpsertReview(r); await cloudUpsertPlace(p);
}

/* ---------------- 장소 추가 ---------------- */
function openAdd(){
  $('add-back').onclick=()=>showOnly(backTo);
  $('aName').value=''; $('aType').value=''; $('aDist').value='';
  $('aCost').value='mid'; $('aIndoor').classList.remove('on');
  showOnly('s-add');
}
async function savePlace(){
  const name=$('aName').value.trim(); if(!name){toast('이름을 입력해주세요'); return;}
  const p={id:'p'+Date.now(), name, emoji:'📍', type:$('aType').value.trim()||'나들이',
    source:'직접 추가', region:$('aRegion').value, loc:$('aRegion').value,
    dist:parseInt($('aDist').value)||30, cost:$('aCost').value, indoor:$('aIndoor').classList.contains('on'),
    seed:'new'+Math.floor(Math.random()*99999), wished:false, visited:false, rating:0};
  DB.places.push(p); saveLocal(); renderAll(); toast('장소를 추가했어요'); openDetail(p.id);
  await cloudUpsertPlace(p);
}

/* ---------------- 설정 (공유) ---------------- */
function openSettings(){
  const cfg=configPresent();
  $('settings-back').onclick=()=>showOnly(backTo);

  const pill=$('settings-status-pill');
  if(Cloud.mode==='cloud'){
    pill.style.borderColor='#1a6b3a'; pill.style.color='#1a6b3a';
    pill.textContent='☁️ 클라우드 공유 켜짐';
  } else {
    pill.style.borderColor='var(--hairline)'; pill.style.color='var(--ink)';
    pill.textContent='📱 로컬 모드 (이 기기에만 저장)';
  }

  $('settings-cloud-section').style.display=cfg?'':'none';
  $('settings-no-cloud-section').style.display=cfg?'none':'';
  if(cfg){
    $('spaceInput').value=Cloud.space||'';
    $('settings-space-btn').textContent=Cloud.space?'코드 변경 & 동기화':'공유 시작하기';
  }

  showOnly('s-settings');
}
async function applySpace(){
  const v=$('spaceInput').value.trim().toLowerCase().replace(/\s+/g,'-');
  if(!v){ toast('공유 코드를 입력해주세요'); return; }
  localStorage.setItem(SPACE_KEY,v);
  buildClient();
  toast('동기화하는 중…');
  await loadData();
  if(Cloud.mode==='cloud') subscribeRealtime();
  renderAll(); openSettings();
  toast(Cloud.mode==='cloud'?'부부 공유가 켜졌어요 ☁️':'연결 실패 — 키를 확인하세요');
}

/* ---------------- 네비게이션 ---------------- */
function showOnly(id){
  document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
  $(id).classList.add('active'); $(id).scrollTop=0;
}
function setNavActive(id){
  document.querySelectorAll('.nav button').forEach(b=>b.classList.toggle('on',b.dataset.screen===id));
}
function nav(id,btn){ backTo=id; showOnly(id); setNavActive(id); }
async function toggleHeart(e,id){ e.stopPropagation(); const p=place(id); p.wished=!p.wished; saveLocal();
  renderAll(); if(e.currentTarget) e.currentTarget.classList.toggle('on',p.wished); await cloudUpsertPlace(p); }

/* ---------------- 시작 ---------------- */
(async function start(){
  buildClient();
  await loadData();
  renderAll();
  if(Cloud.mode==='cloud') subscribeRealtime();
})();
