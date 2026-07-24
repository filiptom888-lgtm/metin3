-- Optional: run in Supabase SQL editor for room activity logs / leaderboard
-- Realtime multiplayer works with Broadcast + Presence alone (no tables required).

create table if not exists public.arena_scores (
  id uuid primary key default gen_random_uuid(),
  room_code text not null,
  player_name text not null,
  class_id text not null,
  metins int not null default 0,
  kills int not null default 0,
  created_at timestamptz not null default now()
);

alter table public.arena_scores enable row level security;

create policy "Anyone can insert scores"
  on public.arena_scores for insert
  to anon, authenticated
  with check (true);

create policy "Anyone can read scores"
  on public.arena_scores for select
  to anon, authenticated
  using (true);
