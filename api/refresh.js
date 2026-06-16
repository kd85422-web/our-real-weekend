/* ============================================================
 * /api/refresh  ·  주간 자동 추천 갱신 (Vercel Serverless Function)
 * ------------------------------------------------------------
 * 한국관광공사 행사 API + 유튜브 Data API 에서 이번 주 행사·화제를 모아
 * Supabase 의 추천 전용 공간(__recos__)에 채워 넣습니다.
 * vercel.json 의 cron 으로 주 1회 자동 실행되고, 브라우저로
 * /api/refresh 를 직접 열어 수동 실행할 수도 있습니다.
 *
 * 필요한 Vercel 환경변수 (Project Settings → Environment Variables):
 *   SUPABASE_URL          예) https://xxxx.supabase.co
 *   SUPABASE_KEY          publishable(또는 anon) 키
 *   TOUR_API_KEY          data.go.kr "국문 관광정보 서비스" 디코딩 인증키
 *   YOUTUBE_API_KEY       (선택) 없으면 유튜브 단계는 건너뜀
 *   HOME_LAT, HOME_LNG    (선택) 집 좌표. 기본 서울시청
 *   RECO_SPACE            (선택) 기본 "__recos__"
 * ============================================================ */

const AREA = { '1':'서울','2':'인천','31':'경기','32':'강원','33':'충북','34':'충남',
  '35':'경북','36':'경남','37':'전북','38':'전남','39':'제주','6':'부산','4':'대구','5':'광주','3':'대전','7':'울산','8':'세종' };
const AREA_CODES = ['1','31','2']; // 서울·경기·인천 (수도권 당일치기)

function ymd(d){ return `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`; }
function decodeEntities(s){ return (s||'').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'"); }
function haversineMin(lat1,lng1,lat2,lng2){
  if(!lat2||!lng2) return null;
  const R=6371, toRad=x=>x*Math.PI/180;
  const dLat=toRad(lat2-lat1), dLng=toRad(lng2-lng1);
  const a=Math.sin(dLat/2)**2+Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLng/2)**2;
  const km=2*R*Math.asin(Math.sqrt(a));
  return Math.max(10, Math.round(km*1.4)+10); // 직선거리 → 대략 운전 분
}

async function fetchFestivals(key, home){
  const out=[]; const diag=[];
  const start=new Date(); start.setDate(start.getDate()-3); // 진행 중인 것도 포함
  for(const area of AREA_CODES){
    const url=`https://apis.data.go.kr/B551011/KorService2/searchFestival2`
      +`?serviceKey=${encodeURIComponent(key)}&MobileOS=ETC&MobileApp=OurRealWeekend`
      +`&_type=json&numOfRows=30&pageNo=1&arrange=A&eventStartDate=${ymd(start)}&areaCode=${area}`;
    const d={area, status:null, resultCode:null, resultMsg:null, total:null, note:null};
    try{
      const r=await fetch(url); d.status=r.status;
      const text=await r.text();
      let j; try{ j=JSON.parse(text); }
      catch(e){ d.note='JSON 아님(에러 응답일 수 있음): '+text.replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim().slice(0,180); diag.push(d); continue; }
      d.resultCode=j?.response?.header?.resultCode; d.resultMsg=j?.response?.header?.resultMsg;
      d.total=j?.response?.body?.totalCount;
      let items=j?.response?.body?.items?.item || [];
      if(!Array.isArray(items)) items=items?[items]:[];
      for(const it of items){
        if(!it || !it.title) continue;
        const lat=parseFloat(it.mapy), lng=parseFloat(it.mapx);
        out.push({
          id:'tour'+it.contentid,
          name:decodeEntities(it.title),
          emoji:'🎏', type:'축제·행사', source:'관광공사',
          region:AREA[String(it.areacode)]||AREA[area]||'',
          loc:(it.addr1||'').split(' ').slice(0,2).join(' ')||AREA[area]||'',
          dist:haversineMin(home.lat,home.lng,lat,lng),
          cost:'', indoor:false,
          photo:it.firstimage||it.firstimage2||'', seed:'fest'+it.contentid,
          eventStart:it.eventstartdate, eventEnd:it.eventenddate,
          best:false, wished:false, visited:false, rating:0
        });
      }
    }catch(e){ d.note='요청 실패: '+String(e&&e.message||e); }
    diag.push(d);
  }
  out.sort((a,b)=>(a.eventStart||'').localeCompare(b.eventStart||''));
  const withPhoto=out.filter(p=>p.photo), noPhoto=out.filter(p=>!p.photo);
  return { places:[...withPhoto, ...noPhoto].slice(0,12), diag };
}

async function fetchYoutube(key){
  if(!key) return [];
  const q=encodeURIComponent('수도권 주말 가볼만한곳 팝업 행사');
  const url=`https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&order=date`
    +`&maxResults=6&regionCode=KR&relevanceLanguage=ko&q=${q}&key=${key}`;
  try{
    const r=await fetch(url); const j=await r.json();
    return (j.items||[]).filter(v=>v.id&&v.id.videoId).map(v=>({
      id:'yt'+v.id.videoId,
      name:decodeEntities(v.snippet.title).slice(0,42),
      emoji:'🔥', type:'화제 영상', source:'유튜브',
      region:'', loc:'유튜브 화제', dist:null, cost:'', indoor:false,
      photo:v.snippet.thumbnails?.high?.url||v.snippet.thumbnails?.default?.url||'',
      seed:'yt'+v.id.videoId, link:'https://youtu.be/'+v.id.videoId,
      best:false, wished:false, visited:false, rating:0
    }));
  }catch(e){ return []; }
}

async function sbDeleteRecos(base,key,space){
  await fetch(`${base}/rest/v1/places?space=eq.${encodeURIComponent(space)}`,{
    method:'DELETE', headers:{apikey:key, Authorization:'Bearer '+key, Prefer:'return=minimal'}});
}
async function sbInsert(base,key,rows){
  if(!rows.length) return;
  await fetch(`${base}/rest/v1/places`,{
    method:'POST',
    headers:{apikey:key, Authorization:'Bearer '+key, 'Content-Type':'application/json', Prefer:'return=minimal'},
    body:JSON.stringify(rows)});
}

module.exports = async (req, res) => {
  const SB=process.env.SUPABASE_URL, KEY=process.env.SUPABASE_KEY;
  const TOUR=process.env.TOUR_API_KEY, YT=process.env.YOUTUBE_API_KEY;
  const SPACE=process.env.RECO_SPACE||'__recos__';
  const home={lat:parseFloat(process.env.HOME_LAT)||37.5663, lng:parseFloat(process.env.HOME_LNG)||126.9779};
  if(!SB||!KEY) return res.status(500).json({ok:false, error:'SUPABASE_URL / SUPABASE_KEY 환경변수가 필요합니다.'});
  if(!TOUR) return res.status(500).json({ok:false, error:'TOUR_API_KEY 환경변수가 필요합니다.'});

  try{
    const fr=await fetchFestivals(TOUR, home);
    const fests=fr.places;
    const tubes=await fetchYoutube(YT);
    const places=[...fests, ...tubes];
    if(places.length===0) return res.status(200).json({ok:true, count:0,
      note:'가져온 항목이 없습니다. 아래 diag 의 resultMsg/note 를 확인하세요.', diag:fr.diag});

    // 가장 가깝거나 가장 임박한 행사를 이번 주 BEST 로
    const best = fests.find(p=>p.dist!=null) || fests[0] || places[0];
    if(best) best.best=true;

    const rows=places.map(p=>({id:p.id, space:SPACE, payload:p}));
    await sbDeleteRecos(SB,KEY,SPACE);
    await sbInsert(SB,KEY,rows);

    res.status(200).json({ok:true, count:rows.length, festivals:fests.length, youtube:tubes.length,
      best:best&&best.name, updatedAt:new Date().toISOString(), diag:fr.diag});
  }catch(e){
    res.status(500).json({ok:false, error:String(e&&e.message||e)});
  }
};
