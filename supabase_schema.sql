-- ============================================================
-- 아워리얼위켄드 · Supabase 스키마
-- Supabase 대시보드 > SQL Editor 에 붙여넣고 RUN 하세요.
-- ============================================================

-- 장소 테이블
create table if not exists public.places (
  id          text primary key,
  space       text not null,
  payload     jsonb not null,
  updated_at  timestamptz default now()
);

-- 후기 테이블
create table if not exists public.reviews (
  id          text primary key,
  space       text not null,
  payload     jsonb not null,
  updated_at  timestamptz default now()
);

-- 공유 코드(space)로 빠르게 조회
create index if not exists places_space_idx  on public.places (space);
create index if not exists reviews_space_idx on public.reviews (space);

-- ------------------------------------------------------------
-- RLS (행 수준 보안)
-- 부부 둘만 쓰는 비공개 앱이라 anon 키로 읽기/쓰기를 허용합니다.
-- 공유 코드(space)를 아는 사람만 해당 데이터를 다룰 수 있습니다.
-- 보안을 더 높이려면 추후 Supabase Auth(로그인)를 붙이세요.
-- ------------------------------------------------------------
alter table public.places  enable row level security;
alter table public.reviews enable row level security;

drop policy if exists "anon all places"  on public.places;
drop policy if exists "anon all reviews" on public.reviews;

create policy "anon all places"  on public.places  for all using (true) with check (true);
create policy "anon all reviews" on public.reviews for all using (true) with check (true);

-- ------------------------------------------------------------
-- 실시간 동기화 (두 기기가 서로의 변경을 바로 반영)
-- 보통 기본 publication(supabase_realtime)에 테이블만 추가하면 됩니다.
-- 이미 추가되어 있으면 에러가 날 수 있는데 무시해도 됩니다.
-- ------------------------------------------------------------
alter publication supabase_realtime add table public.places;
alter publication supabase_realtime add table public.reviews;
