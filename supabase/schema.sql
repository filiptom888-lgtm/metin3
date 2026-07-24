-- Run in Supabase SQL Editor (Dashboard → SQL)
-- Enables saved characters, inventory, equipment for METIN3 open world.

create table if not exists public.characters (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 2 and 16),
  class_id text not null check (class_id in ('warrior', 'ninja', 'sura', 'shaman')),
  level int not null default 1 check (level >= 1 and level <= 99),
  xp int not null default 0 check (xp >= 0),
  gold int not null default 0 check (gold >= 0),
  str int not null default 1,
  vit int not null default 1,
  intel int not null default 1,
  dex int not null default 1,
  stat_points int not null default 0,
  x double precision not null default 0,
  z double precision not null default 0,
  inventory jsonb not null default '[]'::jsonb,
  equipment jsonb not null default '{}'::jsonb,
  metins int not null default 0,
  kills int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id)
);

create index if not exists characters_user_id_idx on public.characters (user_id);

alter table public.characters enable row level security;

drop policy if exists "characters_select_own" on public.characters;
drop policy if exists "characters_insert_own" on public.characters;
drop policy if exists "characters_update_own" on public.characters;
drop policy if exists "characters_delete_own" on public.characters;

create policy "characters_select_own"
  on public.characters for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "characters_insert_own"
  on public.characters for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "characters_update_own"
  on public.characters for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "characters_delete_own"
  on public.characters for delete
  to authenticated
  using ((select auth.uid()) = user_id);

grant select, insert, update, delete on table public.characters to authenticated;
grant select, insert, update, delete on table public.characters to anon;

-- Optional: drop old arena_scores if unused
-- drop table if exists public.arena_scores;
