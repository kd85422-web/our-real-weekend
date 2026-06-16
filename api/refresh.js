/* ============================================================
 * /api/refresh  ·  주간 자동 추천 갱신 (Vercel Serverless Function)
 * ------------------------------------------------------------
 * 네이버 검색 API로 "요즘 핫한" 수도권 맛집·카페·체험·팝업·전시·나들이
 * 장소를 모아(리뷰 많은 순), 실제 사진을 붙이고, 집에서 가까운 순으로
 * Supabase 추천 공간(__recos__)에 채웁니다.
 *
 * 필요한 Vercel 환경변수:
 *   SUPABASE_URL, SUPABASE_KEY        (필수)
 *   NAVER_ID, NAVER_SECRET            (필수) 네이버 개발자센터 검색 API 키
 *   YOUTUBE_API_KEY                   (선택) '화제 영상' 추가용
 *   HOME_LAT, HOME_LNG                (선택) 집/출발 좌표. 가까운 순 기준. 기본 서울시청
 *   RECO_SPACE                        (선택) 기본 "__recos__"
 * ============================================================ */

// 취향별 검색어 묶음 (주마다 일부를 돌려가며 다양하게)
// 판교에서 1시간 이내(지하철·자가용) 나들이 — 서울 핫플 + 수도권 명소 위주
const QUERY_SETS = {
  food:   ['성수 맛집','연남동 맛집','익선동 맛집','한남동 맛집','망원동 카페','용산 맛집','잠실 맛집','광교 카페','수원 행궁동 맛집','용인 보정동 카페거리'],
  play:   ['서울 원데이클래스','성수 이색체험','홍대 방탈출','한강 카약 체험','도자기 클래스 서울','용인 에버랜드','과천 서울랜드'],
  popup:  ['성수 팝업스토어','더현대서울 팝업','잠실 롯데월드몰 팝업','서울 전시회','디뮤지엄 전시','국립현대미술관 서울'],
  walk:   ['서울숲 나들이','석촌호수 산책','북촌한옥마을','남산 나들이','양평 두물머리','가평 아침고요수목원','광교호수공원'],
};

function weekIndex(){ return Math.floor(Date.now()/(7*864e5)); }
// 매주 각 카테고리에서 3개씩 회전 선택 → 다양하고 신선하게
function activeQueries(){
  const w=weekIndex(), out=[];
  for(const k of Object.keys(QUERY_SETS)){
    const arr=QUERY_SETS[k];
    for(let i=0;i<3;i++) out.push({cat:k, q:arr[(w+i)%arr.length]});
  }
  return out;
}

function stripTags(s){ return (s||'').replace(/<[^>]+>/g,'').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'").trim(); }
function hashId(s){ let h=0; for(let i=0;i<s.length;i++){ h=(h*31+s.charCodeAt(i))|0; } return 'nv'+Math.abs(h); }
function haversineMin(lat1,lng1,lat2,lng2){
  if(!lat2||!lng2) return null;
  const R=6371, toRad=x=>x*Math.PI/180;
  const dLat=toRad(lat2-lat1), dLng=toRad(lng2-lng1);
  const a=Math.sin(dLat/2)**2+Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLng/2)**2;
  return Math.max(5, Math.round(2*R*Math.asin(Math.sqrt(a))*1.4)+5);
}
// 네이버 local의 mapx/mapy → 경위도 (정수×1e7 형태면 나눠줌)
function toLonLat(mapx, mapy){
  let lon=parseFloat(mapx), lat=parseFloat(mapy);
  if(lon>180) lon=lon/1e7;
  if(lat>90)  lat=lat/1e7;
  return {lon, lat};
}
function classify(category){
  const c=category||'';
  if(/카페|디저트|베이커리|빵/.test(c)) return {type:'카페', emoji:'☕', indoor:true};
  if(/팝업/.test(c))                    return {type:'팝업', emoji:'🎪', indoor:true};
  if(/전시|미술|박물|갤러리/.test(c))    return {type:'전시', emoji:'🖼️', indoor:true};
  if(/공방|체험|클래스|공예|스튜디오/.test(c)) return {type:'체험', emoji:'🎨', indoor:true};
  if(/공원|산|하천|해변|수목|관광|자연/.test(c)) return {type:'나들이', emoji:'🌿', indoor:false};
  if(/음식|식당|한식|일식|양식|중식|고기|술집|주점|뷔페/.test(c)) return {type:'맛집', emoji:'🍽️', indoor:true};
  return {type:'나들이', emoji:'📍', indoor:false};
}
function catLabel(cat){ return ({food:'맛집·카페', play:'체험', popup:'팝업·전시', walk:'나들이'})[cat]||''; }

async function naverGet(path, id, secret){
  const r=await fetch('https://openapi.naver.com/v1/search/'+path,{
    headers:{'X-Naver-Client-Id':id, 'X-Naver-Client-Secret':secret}});
  const text=await r.text();
  let j=null; try{ j=JSON.parse(text); }catch(e){}
  return {status:r.status, json:j, raw:text};
}

async function fetchNaverPlaces(id, secret, home){
  const byId={}; const diag=[];
  for(const {cat,q} of activeQueries()){
    const res=await naverGet(`local.json?query=${encodeURIComponent(q)}&display=5&sort=comment`, id, secret);
    const d={q, status:res.status, count:0, note:null};
    if(res.status!==200){ d.note=(res.json&&res.json.errorMessage)||res.raw.slice(0,120); diag.push(d); continue; }
    const items=res.json?.items||[];
    items.forEach((it,idx)=>{
      const name=stripTags(it.title); if(!name) return;
      const {lon,lat}=toLonLat(it.mapx, it.mapy);
      const meta=classify(it.category);
      const addr=it.roadAddress||it.address||'';
      const id2=hashId(it.link||name+addr);
      const dist=haversineMin(home.lat,home.lng,lat,lon);
      const prev=byId[id2];
      byId[id2]={
        id:id2, name,
        emoji:meta.emoji, type:meta.type, source:'네이버',
        category:catLabel(cat),
        region:(addr.split(' ')[0]||'').replace('특별시','').replace('광역시','').replace('도',''),
        loc:addr.split(' ').slice(0,3).join(' '),
        dist, cost:'', indoor:meta.indoor,
        photo:'', seed:id2,
        link:it.link||'',
        _rank: prev? Math.min(prev._rank, idx) : idx,   // 리뷰 많은 순 위치 = 핫함
        best:false, wished:false, visited:false, rating:0
      };
    });
    d.count=items.length; diag.push(d);
  }
  // 1시간 이내(대략)만 남기고, '핫한 순(리뷰 많은 순)'으로 — 거리는 보조
  let out=Object.values(byId).filter(p=>p.dist==null || p.dist<=80);
  out.sort((a,b)=> (a._rank-b._rank) || ((a.dist||999)-(b.dist||999)));
  out=out.slice(0,12);
  out.forEach(p=>delete p._rank);
  // 대표 사진 붙이기 (네이버 이미지검색)
  for(const p of out){
    try{
      const im=await naverGet(`image.json?query=${encodeURIComponent(p.name+' '+(p.region||''))}&display=1&sort=sim&filter=medium`, id, secret);
      const t=im.json?.items?.[0];
      if(t) p.photo=t.thumbnail||t.link||'';
    }catch(e){}
    delete p._lat; delete p._lon;
  }
  return { places:out, diag };
}

async function fetchYoutube(key){
  if(!key) return [];
  const q=encodeURIComponent('수도권 주말 가볼만한곳 핫플 맛집');
  const url=`https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&order=date`
    +`&maxResults=4&regionCode=KR&relevanceLanguage=ko&q=${q}&key=${key}`;
  try{
    const r=await fetch(url); const j=await r.json();
    return (j.items||[]).filter(v=>v.id&&v.id.videoId).map(v=>({
      id:'yt'+v.id.videoId, name:stripTags(v.snippet.title).slice(0,42),
      emoji:'🔥', type:'화제 영상', source:'유튜브', category:'화제',
      region:'', loc:'유튜브 화제', dist:null, cost:'', indoor:false,
      photo:v.snippet.thumbnails?.high?.url||v.snippet.thumbnails?.default?.url||'',
      seed:'yt'+v.id.videoId, link:'https://youtu.be/'+v.id.videoId,
      best:false, wished:false, visited:false, rating:0
    }));
  }catch(e){ return []; }
}

async function sbDeleteRecos(base,key,space){
  const r=await fetch(`${base}/rest/v1/places?space=eq.${encodeURIComponent(space)}`,{
    method:'DELETE', headers:{apikey:key, Authorization:'Bearer '+key, Prefer:'return=minimal'}});
  return {status:r.status, body:r.ok?'':(await r.text()).slice(0,300)};
}
async function sbInsert(base,key,rows){
  if(!rows.length) return {status:'skip', body:''};
  const r=await fetch(`${base}/rest/v1/places`,{
    method:'POST',
    headers:{apikey:key, Authorization:'Bearer '+key, 'Content-Type':'application/json', Prefer:'return=minimal'},
    body:JSON.stringify(rows)});
  return {status:r.status, body:r.ok?'':(await r.text()).slice(0,400)};
}

module.exports = async (req, res) => {
  const SB=process.env.SUPABASE_URL, KEY=process.env.SUPABASE_KEY;
  const NID=process.env.NAVER_ID, NSEC=process.env.NAVER_SECRET, YT=process.env.YOUTUBE_API_KEY;
  const SPACE=process.env.RECO_SPACE||'__recos__';
  // 기본 출발 기준점: 판교역 (환경변수 HOME_LAT/LNG로 덮어쓸 수 있음)
  const home={lat:parseFloat(process.env.HOME_LAT)||37.3947, lng:parseFloat(process.env.HOME_LNG)||127.1112};
  if(!SB||!KEY) return res.status(500).json({ok:false, error:'SUPABASE_URL / SUPABASE_KEY 환경변수가 필요합니다.'});
  if(!NID||!NSEC) return res.status(500).json({ok:false, error:'NAVER_ID / NAVER_SECRET 환경변수가 필요합니다.'});

  try{
    const nr=await fetchNaverPlaces(NID, NSEC, home);
    const places=nr.places;
    const tubes=await fetchYoutube(YT);
    const all=[...places, ...tubes];
    if(all.length===0) return res.status(200).json({ok:false, count:0,
      note:'가져온 장소가 없습니다. 아래 diag 의 status/note 를 확인하세요(보통 네이버 키 문제).', diag:nr.diag});

    const best = places.find(p=>p.photo) || places[0] || all[0];
    if(best) best.best=true;

    const rows=all.map(p=>({id:p.id, space:SPACE, payload:p}));
    const del=await sbDeleteRecos(SB,KEY,SPACE);
    const ins=await sbInsert(SB,KEY,rows);
    const wrote=ins.status>=200 && ins.status<300;

    res.status(200).json({ok:wrote, count:rows.length, written:wrote, space:SPACE,
      places:places.length, youtube:tubes.length, best:best&&best.name,
      insertStatus:ins.status, insertError: wrote?undefined:ins.body,
      updatedAt:new Date().toISOString()});
  }catch(e){
    res.status(500).json({ok:false, error:String(e&&e.message||e)});
  }
};
