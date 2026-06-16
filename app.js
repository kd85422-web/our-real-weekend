/* ================= 아워리얼위켄드 · app.js =================
 * 로컬 모드(이 기기에만 저장) + 클라우드 모드(부부 공유) 자동 전환.
 *  - config.js 에 Supabase 키가 있고, 공유 코드(space)가 설정되면 → 클라우드
 *  - 그 외 → 로컬(localStorage)
 * ========================================================== */

const KEY='orw_db_v1';
const SPACE_KEY='orw_space';
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
  return {
    profile:'나',
    places:[
      {id:'p1', name:'한강 야간 러닝 & 플로깅', emoji:'🏃', type:'체험', source:'스레드', region:'서울', loc:'서울 여의도', dist:25, cost:'free', indoor:false, seed:'marathon', best:true, wished:false, visited:false, rating:0},
      {id:'p2', name:"성수동 '여름 한정' 팝업스토어", emoji:'🎪', type:'팝업', source:'인스타', region:'서울', loc:'서울 성동구', dist:40, cost:'free', indoor:true, seed:'popup', wished:false, visited:false, rating:4.7},
      {id:'p3', name:'가평 수목원 여름 빛축제', emoji:'🌿', type:'나들이', source:'유튜브', region:'경기', loc:'경기 가평', dist:80, cost:'mid', indoor:false, seed:'gapyeong2', wished:false, visited:false, rating:4.8},
      {id:'p4', name:'뚝섬 플리마켓', emoji:'🛍️', type:'마켓', source:'인스타', region:'서울', loc:'서울 광진구', dist:30, cost:'free', indoor:false, seed:'flea', wished:false, visited:false, rating:4.5},
      {id:'p5', name:'커플 도자기 원데이클래스', emoji:'🎨', type:'클래스', source:'스레드', region:'경기', loc:'경기 양평', dist:45, cost:'mid', indoor:true, seed:'pottery', wished:false, visited:false, rating:4.9},
      {id:'p6', name:'수원 등불 야행', emoji:'🎏', type:'축제', source:'유튜브', region:'경기', loc:'경기 수원', dist:50, cost:'cheap', indoor:false, seed:'festival', wished:false, visited:false, rating:4.6},
      {id:'p7', name:'경의선숲길 자전거', emoji:'🚴', type:'체험', source:'인스타', region:'서울', loc:'서울 마포구', dist:20, cost:'cheap', indoor:false, seed:'cycle', wished:false, visited:false, rating:4.4},
      {id:'p8', name:'DDP 미디어아트展', emoji:'🖼️', type:'전시', source:'유튜브', region:'서울', loc:'서울 중구', dist:35, cost:'mid', indoor:true, seed:'exhibit', wished:false, visited:false, rating:4.7},
      {id:'p9', name:'강화도 동막해변', emoji:'🏖️', type:'바다', source:'인스타', region:'인천', loc:'인천 강화', dist:90, cost:'free', indoor:false, seed:'namhae', wished:true, visited:false, rating:4.5},
      {id:'p10', name:'포천 산정호수', emoji:'🌿', type:'자연', source:'유튜브', region:'경기', loc:'경기 포천', dist:80, cost:'cheap', indoor:false, seed:'pocheon', wished:true, visited:false, rating:4.6},
      {id:'p11', name:'강릉 안목해변 카페거리', emoji:'☕', type:'카페', source:'스레드', region:'강원', loc:'강원 강릉', dist:150, cost:'mid', indoor:false, seed:'cafestreet', wished:true, visited:false, rating:4.7},
      {id:'p12', name:'가평 아침고요수목원', emoji:'🌸', type:'자연', source:'유튜브', region:'경기', loc:'경기 가평', dist:80, cost:'mid', indoor:false, seed:'gapyeong', wished:false, visited:true, rating:0},
      {id:'p13', name:'양평 두물머리', emoji:'☕', type:'카페', source:'인스타', region:'경기', loc:'경기 양평', dist:50, cost:'free', indoor:false, seed:'yangpyeong', wished:false, visited:true, rating:0},
      {id:'p14', name:'인천 월미도', emoji:'🏖️', type:'바다', source:'유튜브', region:'인천', loc:'인천 중구', dist:60, cost:'cheap', indoor:false, seed:'incheon', wished:false, visited:true, rating:0},
      {id:'p15', name:'파주 헤이리마을', emoji:'🚗', type:'드라이브', source:'인스타', region:'경기', loc:'경기 파주', dist:70, cost:'mid', indoor:false, seed:'paju', wished:false, visited:true, rating:0}
    ],
    reviews:[
      {id:'r1', placeId:'p12', author:'나', rating:5, text:'꽃 너무 예뻤어! 산책로가 길어서 천천히 도는 맛이 있었어 🌸', photos:['gapyeong','garden2'], date:'2026-05-31', revisit:true, cost:32000},
      {id:'r2', placeId:'p12', author:'남편', rating:4, text:'경치는 좋은데 사람이 좀 많았음. 그래도 또 가고 싶다 👍', photos:[], date:'2026-05-31', revisit:true, cost:32000},
      {id:'r3', placeId:'p13', author:'나', rating:4.5, text:'노을이 최고였어 🌅', photos:['yangpyeong'], date:'2026-05-17', revisit:true, cost:18000},
      {id:'r4', placeId:'p13', author:'남편', rating:5, text:'커피 맛집 발견. 또 가자', photos:[], date:'2026-05-17', revisit:true, cost:18000},
      {id:'r5', placeId:'p14', author:'나', rating:4, text:'바닷바람 좋았다', photos:[], date:'2026-05-03', revisit:false, cost:25000},
      {id:'r6', placeId:'p14', author:'남편', rating:4.5, text:'회 먹은 게 신의 한 수 🐟', photos:['incheon'], date:'2026-05-03', revisit:true, cost:25000},
      {id:'r7', placeId:'p15', author:'나', rating:3.5, text:'아기자기한데 좀 멀어', photos:[], date:'2026-04-19', revisit:false, cost:40000},
      {id:'r8', placeId:'p15', author:'남편', rating:4, text:'책방 구경 재밌었음', photos:[], date:'2026-04-19', revisit:true, cost:40000}
    ]
  };
}
let DB;
function saveLocal(){ localStorage.setItem(KEY, JSON.stringify(DB)); }

async function loadData(){
  if(Cloud.mode==='cloud'){
    try{
      const d=await cloudFetch();
      if(d.places.length===0 && d.reviews.length===0){ DB=seed(); await cloudPushAll(); }
      else { DB={profile:'나',places:d.places,reviews:d.reviews}; }
      saveLocal(); return;
    }catch(e){ toast('클라우드 연결 실패 — 로컬로 동작'); Cloud.mode='local'; }
  }
  try{ DB=JSON.parse(localStorage.getItem(KEY)); }catch(e){}
  if(!DB||!DB.places) { DB=seed(); saveLocal(); }
}

async function resetData(){
  DB=seed(); saveLocal();
  if(Cloud.mode==='cloud'){ try{ await cloudPushAll(); }catch(e){} }
  renderAll(); showOnly('s-home'); setNavActive('s-home'); toast('샘플 데이터로 초기화했어요');
}

/* ---------------- 헬퍼 ---------------- */
const img=(s,w=800,h=800)=>`https://picsum.photos/seed/${encodeURIComponent(s)}/${w}/${h}`;
const $=id=>document.getElementById(id);
const place=id=>DB.places.find(p=>p.id===id);
const reviewsOf=id=>DB.reviews.filter(r=>r.placeId===id).sort((a,b)=>a.author==='나'?-1:1);
const fmtDate=d=>{const x=new Date(d); const w=['일','월','화','수','목','금','토'][x.getDay()]; return `${x.getFullYear()}.${String(x.getMonth()+1).padStart(2,'0')}.${String(x.getDate()).padStart(2,'0')} (${w})`;};
const avgRating=id=>{const rs=reviewsOf(id); if(!rs.length) return place(id).rating||0; return (rs.reduce((s,r)=>s+r.rating,0)/rs.length);};
const starStr=n=>'★'.repeat(Math.round(n))+'☆'.repeat(5-Math.round(n));
function toast(msg){const t=$('toast'); t.textContent=msg; t.classList.add('show'); clearTimeout(t._t); t._t=setTimeout(()=>t.classList.remove('show'),1800);}
function esc(s){return (s||'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));}

/* ---------------- 공통 UI ---------------- */
function bannerHTML(){
  if(Cloud.mode==='cloud')
    return `<div class="banner cloud" onclick="openSettings()">☁️ 부부 공유 중 · 코드 ${esc(Cloud.space)} · 설정 ▸</div>`;
  return `<div class="banner" onclick="openSettings()">📱 이 기기에만 저장 중 · 부부 공유 설정하기 ▸</div>`;
}

/* ---------------- 렌더링 ---------------- */
function renderAll(){ renderHome(); renderWish(); renderMap(); renderRecord(); }

function cardHTML(p){
  return `<div class="card" onclick="openDetail('${p.id}')">
    <div class="ph"><img src="${img(p.seed,400,400)}" loading="lazy">
      <button class="heart ${p.wished?'on':''}" onclick="toggleHeart(event,'${p.id}')">♥</button>
      <div class="tag">${p.emoji} ${esc(p.type)}</div></div>
    <h3>${esc(p.name)}</h3>
    <div class="line">${esc(p.source)} · 차로 ${p.dist}분</div>
    <div class="price"><b>${COST_LABEL[p.cost]||''}</b> · ⭐ ${avgRating(p.id).toFixed(1)}</div>
  </div>`;
}

function renderHome(){
  const best=DB.places.find(p=>p.best) || DB.places.find(p=>!p.visited) || DB.places[0];
  const others=DB.places.filter(p=>!p.visited && p.id!==(best&&best.id) && !p.wished);
  $('s-home').innerHTML=`
    ${bannerHTML()}
    <div class="topbar">
      <div><div class="wm">아워리얼위켄드</div><div class="sub">이번 주말, 어디 가볼까요?</div></div>
      <div class="acts">
        <button class="iconbtn" onclick="openAdd()" title="장소 추가">＋</button>
        <button class="iconbtn" onclick="openSettings()" title="설정">⚙️</button>
      </div>
    </div>
    ${best?`<div class="bigpick" onclick="openDetail('${best.id}')">
      <img src="${img(best.seed,900,1100)}">
      <div class="bp-grad"></div>
      <div class="bp-badge">이번 주 BEST</div>
      <button class="heart ${best.wished?'on':''}" onclick="toggleHeart(event,'${best.id}')">♥</button>
      <div class="bp-meta"><h2>${esc(best.name)}</h2>
        <div class="bp-loc">📍 ${esc(best.loc)} · 차로 ${best.dist}분 · ${COST_LABEL[best.cost]} · ${esc(best.source)} 화제</div></div>
      <div class="bp-chev">›</div>
    </div>`:''}
    <div class="sec" style="padding-top:24px;"><h2>다른 추천</h2><div class="h-sub">이번 주 화제인 행사·체험·나들이</div></div>
    <div class="grid">${others.map(cardHTML).join('')}</div>
    <div style="height:24px;"></div>`;
}

function renderWish(){
  const list=DB.places.filter(p=>p.wished);
  $('s-wish').innerHTML=`
    <div class="topbar dark"><div><div class="wm">찜한 곳</div><div class="sub">다음에 가보고 싶은 곳 ${list.length}</div></div></div>
    ${list.length? `<div class="grid" style="padding-top:18px;">${list.map(cardHTML).join('')}</div><div style="height:24px;"></div>`
      : `<div class="empty">아직 찜한 곳이 없어요.<br>마음에 드는 곳의 ♥를 눌러보세요.</div>`}`;
}

function renderRecord(){
  const visited=DB.places.filter(p=>p.visited).sort((a,b)=>{
    const da=reviewsOf(a.id)[0]?.date||'', db=reviewsOf(b.id)[0]?.date||''; return db.localeCompare(da);});
  const uniqCost=[...new Set(DB.reviews.map(r=>r.placeId))].reduce((s,id)=>{
    const r=reviewsOf(id)[0]; return s+(r?.cost||0);},0);
  $('s-record').innerHTML=`
    <div class="topbar dark"><div><div class="wm">우리의 기록</div>
      <div class="sub">함께 다녀온 곳 ${visited.length} · 누적 지출 ${(uniqCost/10000).toFixed(0)}만원</div></div></div>
    ${visited.length? visited.map(p=>{
      const rs=reviewsOf(p.id); const date=rs[0]?.date;
      const rev=rs.map(r=>`<span class="av ${r.author==='나'?'me':'h'}">${r.author==='나'?'나':'남'}</span>★${r.rating}`).join(' ');
      const again=rs.some(r=>r.revisit)?' · <span style="color:var(--primary);">♥ 또 가고싶어요</span>':'';
      return `<div class="row" onclick="openDetail('${p.id}')">
        <img src="${img(p.seed,200,200)}">
        <div class="info"><h3>${esc(p.name)}</h3>
          <div class="sub">${date?fmtDate(date):''} · ${esc(p.loc)}</div>
          <div class="reviewers">${rev}${again}</div></div></div>`;
    }).join('') : `<div class="empty">아직 다녀온 곳이 없어요.<br>다녀온 곳에 후기를 남겨보세요.</div>`}`;
}

function renderMap(){
  const counts={};
  DB.places.filter(p=>p.visited).forEach(p=>{counts[p.region]=(counts[p.region]||0)+1;});
  const tier=n=> n>=6?'v3': n>=3?'v2': n>=1?'v1':'';
  const polyClass=r=>'reg '+tier(counts[r]||0);
  const visitedTotal=Object.keys(counts).length;
  const bars=Object.entries(counts).sort((a,b)=>b[1]-a[1]).map(([r,n])=>{
    const pct=Math.min(100, n*22+10);
    return `<div class="progress-card"><div class="top"><b>${r}</b><span>${n}곳 방문</span></div>
      <div class="bar"><i style="width:${pct}%"></i></div></div>`;}).join('') ||
    `<div class="empty">아직 색칠된 지역이 없어요.</div>`;
  $('s-map').innerHTML=`
    <div class="topbar dark"><div><div class="wm">우리의 발자취</div>
      <div class="sub">전국 11개 지역 중 ${visitedTotal}곳 방문</div></div></div>
    <div class="map-wrap">
      <div class="legend"><span><i style="background:#ffd1da;"></i>1~2회</span><span><i style="background:#ff8da3;"></i>3~5회</span><span><i style="background:#ff385c;"></i>6회+</span></div>
      <svg class="korea" viewBox="0 0 210 320" xmlns="http://www.w3.org/2000/svg">
        <path class="base" d="M52,70 L96,46 L150,44 L172,60 L175,115 L170,165 L156,190 L142,212 L110,216 L88,250 L64,218 L48,190 L33,150 L38,108 Z"/>
        <polygon class="${polyClass('경기')}" points="52,70 96,46 116,86 100,104 64,104 47,86"/>
        <polygon class="${polyClass('강원')}" points="96,46 150,44 172,60 175,115 150,120 118,104 116,86"/>
        <polygon class="${polyClass('충남')}" points="38,108 64,104 92,116 88,140 58,152 35,148"/>
        <ellipse class="${polyClass('제주')}" cx="80" cy="288" rx="22" ry="11"/>
        <circle cx="74" cy="78" r="3" fill="#fff"/>
        <text x="74" y="92" font-size="9" fill="#fff" text-anchor="middle" font-weight="700">경기</text>
        <text x="140" y="86" font-size="9" fill="#666" text-anchor="middle" font-weight="700">강원</text>
        <text x="80" y="291" font-size="8" fill="#a8a8a8" text-anchor="middle" font-weight="700">제주</text>
      </svg>
      ${bars}
    </div>`;
}

/* ---------------- 상세 ---------------- */
let currentId=null, backTo='s-home';
function openDetail(id){
  currentId=id; const p=place(id); if(!p) return; const rs=reviewsOf(id);
  const visits=[...new Set(rs.map(r=>r.date))].length;
  const cost=rs.length? reviewsOf(id)[0].cost : null;
  const reviewsHTML = rs.length ? rs.map(r=>`
    <div class="review"><span class="av ${r.author==='나'?'me':'h'}">${r.author==='나'?'나':'남'}</span>
      <div class="rv-body"><b>${r.author==='나'?'아내':'남편'}<span class="when">· ${fmtDate(r.date)}</span></b>
        <div class="rv-stars">${starStr(r.rating)}</div>
        <p>${esc(r.text)}</p>
        ${r.photos&&r.photos.length?`<div class="rv-photos">${r.photos.map(s=>`<img src="${img(s,200,200)}">`).join('')}</div>`:''}
      </div></div>`).join('') : `<p style="color:var(--muted);font-size:14px;">아직 후기가 없어요. 다녀왔다면 첫 후기를 남겨보세요!</p>`;
  $('s-detail').innerHTML=`
    <div class="detail-photo"><img src="${img(p.seed,900,700)}">
      <button class="back" onclick="goBack()">←</button>
      <button class="heart ${p.wished?'on':''}" style="top:44px;right:16px;width:36px;height:36px;font-size:18px;" onclick="toggleHeart(event,'${p.id}');openDetail('${p.id}')">♥</button>
    </div>
    <div class="detail-body">
      <h1>${esc(p.name)}</h1>
      <div class="loc">${esc(p.loc)} · 차로 ${p.dist}분 · ${esc(p.source)} 화제</div>
      <div class="pills">
        <span class="pill">${p.emoji} ${esc(p.type)}</span>
        <span class="pill">${p.indoor?'🏠 실내':'🌤️ 야외'}</span>
        <span class="pill">💳 ${COST_LABEL[p.cost]}</span>
      </div>
      <div class="divider"></div>
      <div class="stat-row">
        <div class="stat"><div class="big">${rs.length?avgRating(id).toFixed(1):'-'}</div><div class="lbl">우리 평점</div></div>
        <div class="stat"><div class="big">${visits}번</div><div class="lbl">다녀온 횟수</div></div>
        <div class="stat"><div class="big">${cost?(cost/10000).toFixed(1)+'만':'-'}</div><div class="lbl">지출</div></div>
      </div>
      <div class="divider"></div>
      <h2 style="font-size:18px;font-weight:700;margin-bottom:14px;">우리의 후기</h2>
      ${reviewsHTML}
    </div>
    <div class="cta">
      <div class="p"><b>${p.visited?'다시 다녀오셨나요?':'다녀오셨나요?'}</b><br>
        <span style="color:var(--muted);font-size:13px;">후기를 남겨보세요</span></div>
      <button class="btn" onclick="openForm('${p.id}')">후기 쓰기</button>
    </div>`;
  showOnly('s-detail');
}
function goBack(){ showOnly(backTo); }

/* ---------------- 후기 작성 ---------------- */
let formState={};
function openForm(id){
  const p=place(id);
  formState={placeId:id, author:DB.profile||'나', rating:5, revisit:true, photos:[]};
  $('s-form').innerHTML=`
    <div class="topbar dark" style="padding-top:44px;"><div style="display:flex;align-items:center;gap:12px;">
      <span style="cursor:pointer;font-size:20px;" onclick="openDetail('${id}')">←</span>
      <div class="wm" style="font-size:18px;">후기 작성</div></div></div>
    <div class="form-body">
      <div style="font-size:15px;font-weight:600;margin-bottom:16px;">${p.emoji} ${esc(p.name)}</div>
      <div class="field" style="margin-bottom:8px;"><label>누구의 후기인가요?</label></div>
      <div class="who" id="whoPick">
        <button class="${formState.author==='나'?'on':''}" onclick="setAuthor('나')">🙋‍♀️ 나</button>
        <button class="${formState.author==='남편'?'on':''}" onclick="setAuthor('남편')">🙋‍♂️ 남편</button>
      </div>
      <div class="field"><label>별점</label><div class="stars-pick" id="starPick">${[1,2,3,4,5].map(i=>`<span class="${i<=formState.rating?'on':''}" onclick="setRating(${i})">★</span>`).join('')}</div></div>
      <div class="field"><label>한 줄 후기</label><textarea id="fText" placeholder="오늘 어땠나요? 솔직하게 남겨보세요"></textarea></div>
      <div class="field"><label>사진 (선택)</label>
        <div class="photo-add" id="photoBox"><div class="slot" onclick="addPhoto()">＋</div></div>
        <div class="hint">데모에서는 임의 사진이 들어가요. 실제 업로드는 다음 단계에서 연결합니다.</div></div>
      <div class="field"><label>방문일</label><input type="date" id="fDate" value="${new Date().toISOString().slice(0,10)}"></div>
      <div class="field"><label>지출 (원, 선택)</label><input type="number" id="fCost" placeholder="예: 30000" inputmode="numeric"></div>
      <div class="field toggle"><label style="margin:0;">또 가고 싶어요</label>
        <div class="switch ${formState.revisit?'on':''}" id="revSwitch" onclick="toggleRev()"><i></i></div></div>
    </div>
    <div class="cta"><button class="btn full" onclick="saveReview()">후기 저장하기</button></div>`;
  showOnly('s-form');
}
function setAuthor(a){formState.author=a; document.querySelectorAll('#whoPick button').forEach((b,i)=>b.classList.toggle('on',(i===0)===(a==='나')));}
function setRating(n){formState.rating=n; document.querySelectorAll('#starPick span').forEach((s,i)=>s.classList.toggle('on',i<n));}
function toggleRev(){formState.revisit=!formState.revisit; $('revSwitch').classList.toggle('on',formState.revisit);}
function addPhoto(){const s='ph'+Math.floor(Math.random()*99999); formState.photos.push(s);
  const box=$('photoBox'); const el=document.createElement('div'); el.className='slot'; el.innerHTML=`<img src="${img(s,200,200)}">`; box.appendChild(el);}
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
  $('s-add').innerHTML=`
    <div class="topbar dark" style="padding-top:44px;"><div style="display:flex;align-items:center;gap:12px;">
      <span style="cursor:pointer;font-size:20px;" onclick="showOnly(backTo)">←</span>
      <div class="wm" style="font-size:18px;">장소 추가</div></div></div>
    <div class="form-body">
      <div class="field"><label>장소·행사 이름</label><input id="aName" placeholder="예: 남산 케이블카"></div>
      <div class="field"><label>지역</label><select id="aRegion">${REGIONS.map(r=>`<option>${r}</option>`).join('')}</select></div>
      <div class="field"><label>유형</label><input id="aType" placeholder="예: 나들이 / 팝업 / 체험"></div>
      <div class="field"><label>집에서 거리 (분)</label><input id="aDist" type="number" placeholder="예: 40" inputmode="numeric"></div>
      <div class="field"><label>예상 비용</label><select id="aCost">
        <option value="free">무료</option><option value="cheap">저렴</option><option value="mid" selected>보통</option><option value="high">넉넉</option></select></div>
      <div class="field toggle"><label style="margin:0;">실내인가요?</label>
        <div class="switch" id="aIndoor" onclick="this.classList.toggle('on')"><i></i></div></div>
    </div>
    <div class="cta"><button class="btn full" onclick="savePlace()">추가하기</button></div>`;
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
  $('s-settings').innerHTML=`
    <div class="topbar dark" style="padding-top:44px;"><div style="display:flex;align-items:center;gap:12px;">
      <span style="cursor:pointer;font-size:20px;" onclick="showOnly(backTo)">←</span>
      <div class="wm" style="font-size:18px;">설정 · 부부 공유</div></div></div>
    <div class="form-body">
      <div class="field">
        <label>현재 상태</label>
        <div class="pill" style="display:inline-block;border-color:${Cloud.mode==='cloud'?'#1a6b3a':'var(--hairline)'};color:${Cloud.mode==='cloud'?'#1a6b3a':'var(--ink)'};">
          ${Cloud.mode==='cloud'?'☁️ 클라우드 공유 켜짐':'📱 로컬 모드 (이 기기에만 저장)'}
        </div>
      </div>
      ${cfg?`
      <div class="field">
        <label>공유 코드</label>
        <input id="spaceInput" placeholder="예: minji-junho" value="${esc(Cloud.space)}">
        <div class="hint">부부가 <b>같은 코드</b>를 입력하면 같은 기록을 공유해요. 남편에게 이 코드를 알려주세요.</div>
      </div>
      <div class="cta" style="position:static;border:0;padding:0 0 18px;">
        <button class="btn full" onclick="applySpace()">${Cloud.space?'코드 변경 & 동기화':'공유 시작하기'}</button>
      </div>`
      :`
      <div class="field">
        <div class="hint" style="font-size:13px;line-height:1.6;">
          아직 클라우드 키가 설정되지 않았어요. 부부 공유를 켜려면
          <b>config.js</b> 에 Supabase URL/Key 를 입력하고 다시 배포하세요.
          (자세한 방법은 프로젝트의 <b>README.md</b> 참고)
        </div>
      </div>`}
      <div class="divider"></div>
      <div class="field">
        <label>데이터</label>
        <button class="btn ghost full" onclick="resetData()">샘플 데이터로 초기화</button>
        <div class="hint">${Cloud.mode==='cloud'?'클라우드의 이 공유 코드 데이터도 초기화됩니다.':'이 기기의 데이터가 초기화됩니다.'}</div>
      </div>
    </div>`;
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
