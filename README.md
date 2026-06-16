# 아워리얼위켄드 (Our Real Weekend)

주말마다 당일치기로 갈 곳을 추천받고, 다녀온 뒤 부부가 각자 후기를 남기며,
전국 지도에 발자취를 색칠해 나가는 웹 앱.

- **홈** — 이번 주 BEST 한 곳(큰 카드) + 다른 추천(2열 그리드), 장소 직접 추가
- **찜** — 가보고 싶은 곳 모음 (♥)
- **지도** — 방문한 지역 자동 색칠 + 지역별 달성률
- **기록** — 방문 타임라인 + 부부 각자 후기·별점·사진·지출
- **부부 공유** — Supabase로 두 기기가 같은 기록을 실시간 공유 (선택)

기본은 **로컬 모드**(이 기기에만 저장)로 바로 작동하고,
Supabase 키 + 공유 코드를 넣으면 **클라우드 공유**가 켜집니다.

---

## 폴더 구성

```
our-real-weekend/
├── index.html          앱 화면 골격
├── styles.css          디자인 (에어비앤비 스타일)
├── app.js              앱 로직 + 로컬/클라우드 데이터 레이어
├── config.js           ← Supabase 키 입력 (여기만 채우면 됨)
├── supabase_schema.sql Supabase 테이블 생성 SQL
├── vercel.json         배포 설정
└── README.md
```

---

## 1단계 · 지금 바로 써보기 (로컬)

별도 설정 없이 `index.html` 을 브라우저로 열면 끝.
샘플 장소가 들어 있어 바로 둘러볼 수 있습니다. (데이터는 이 브라우저에만 저장)

> 로컬 서버로 열고 싶다면 폴더에서:
> `python3 -m http.server 5500` → 브라우저에서 `http://localhost:5500`

---

## 2단계 · 부부 공유 켜기 (Supabase)

부부가 각자 폰에서 같은 기록을 보려면 무료 Supabase를 연결합니다.

1. **프로젝트 생성** — [supabase.com](https://supabase.com) 가입 → New project (카드 불필요).
2. **테이블 만들기** — 대시보드 좌측 **SQL Editor** → `supabase_schema.sql` 내용을 붙여넣고 **RUN**.
3. **키 복사** — 좌측 **Project Settings → API** 에서
   - `Project URL`
   - `anon` `public` key
4. **config.js 에 입력**:
   ```js
   window.ORW_CONFIG = {
     SUPABASE_URL: "https://여기.supabase.co",
     SUPABASE_ANON_KEY: "여기에-anon-key"
   };
   ```
5. 앱을 열고 우측 상단 **⚙️ 설정 → 공유 코드** 에 둘만 아는 코드(예: `minji-junho`)를 입력 → **공유 시작하기**.
6. **남편도 같은 앱(같은 주소)에서 같은 코드**를 입력하면 → 두 기기가 같은 기록을 실시간 공유 ✨

> `anon` 키는 외부에 노출돼도 되는 공개용 키라 config.js에 넣어도 안전합니다.
> 다만 비공개성을 위해 **공유 코드는 추측하기 어렵게** 정하세요.
> 더 강한 보안이 필요하면 추후 Supabase Auth(로그인)를 붙일 수 있어요.

---

## 3단계 · 폰에서 접속하게 배포 (Vercel)

### 방법 A — GitHub + Vercel (자동 배포, 추천)

```bash
cd our-real-weekend
git init && git add . && git commit -m "init: our real weekend"
# GitHub에 새 저장소를 만든 뒤
git remote add origin https://github.com/<아이디>/our-real-weekend.git
git push -u origin main
```

1. [vercel.com](https://vercel.com) 가입 → **Add New → Project** → 방금 만든 GitHub 저장소 Import.
2. 프레임워크 설정 없이 그대로 **Deploy** (정적 사이트라 빌드 불필요).
3. 발급된 주소(예: `our-real-weekend.vercel.app`)를 폰에서 열기.
4. 이후 `git push` 할 때마다 자동 재배포됩니다.

### 방법 B — Vercel CLI

```bash
npm i -g vercel
cd our-real-weekend
vercel        # 안내에 따라 진행
vercel --prod # 운영 배포
```

> **폰 홈 화면에 추가**: 배포 주소를 사파리/크롬에서 연 뒤 "홈 화면에 추가"를 하면
> 앱처럼 전체화면으로 쓸 수 있어요.

---

## 다음에 붙이면 좋은 것 (로드맵)

- **실제 추천 연동** — 유튜브 Data API / 웹 검색으로 최신 행사·체험 자동 수집
  (인스타·스레드는 공식 API 제약이 커서 직접 큐레이션 + 검색 조합이 현실적)
- **사진 실제 업로드** — Supabase Storage 연결 (지금은 데모용 임의 이미지)
- **정확한 지도** — 시·도 GeoJSON 또는 카카오맵으로 정밀 색칠
- **로그인** — Supabase Auth로 보안 강화

---

## 데이터 구조 (참고)

`places` / `reviews` 두 테이블에 `id`, `space`(공유 코드), `payload`(jsonb) 저장.
앱은 화면에서 쓰는 객체를 그대로 `payload`에 담아 동기화합니다.

- **place**: `{id, name, emoji, type, source, region, loc, dist, cost, indoor, seed, best, wished, visited, rating}`
- **review**: `{id, placeId, author('나'|'남편'), rating, text, photos[], date, revisit, cost}`
