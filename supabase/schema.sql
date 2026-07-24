-- METIN3 Phase 1 schema
-- Run in Supabase SQL Editor (Dashboard → SQL). Safe to re-run (drops policies, alters).
-- Multi-character accounts; JSON inventory for client sync; relational templates for Edge.

-- Profiles (account metadata)
create table if not exists public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  last_login timestamptz default now(),
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
drop policy if exists "profiles_select_own" on public.profiles;
drop policy if exists "profiles_upsert_own" on public.profiles;
create policy "profiles_select_own" on public.profiles for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "profiles_upsert_own" on public.profiles for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- Characters: many per user (remove old unique(user_id) if present)
create table if not exists public.characters (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 2 and 16),
  class_id text not null check (class_id in ('warrior', 'ninja', 'sura', 'shaman')),
  spec text not null default 'body',
  gender text not null default 'm' check (gender in ('m', 'f')),
  kingdom int not null default 1 check (kingdom between 1 and 3),
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
  respawn_x double precision not null default 0,
  respawn_z double precision not null default 0,
  delete_pin text not null default '0000',
  inventory jsonb not null default '[]'::jsonb,
  equipment jsonb not null default '{}'::jsonb,
  quests jsonb not null default '{}'::jsonb,
  playtime_sec int not null default 0,
  metins int not null default 0,
  kills int not null default 0,
  online boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Migrate from older single-char schema
alter table public.characters add column if not exists spec text not null default 'body';
alter table public.characters add column if not exists gender text not null default 'm';
alter table public.characters add column if not exists kingdom int not null default 1;
alter table public.characters add column if not exists respawn_x double precision not null default 0;
alter table public.characters add column if not exists respawn_z double precision not null default 0;
alter table public.characters add column if not exists delete_pin text not null default '0000';
alter table public.characters add column if not exists quests jsonb not null default '{}'::jsonb;
alter table public.characters add column if not exists playtime_sec int not null default 0;
alter table public.characters add column if not exists online boolean not null default false;

-- Drop one-char-per-user constraint if it exists
do $$
begin
  if exists (
    select 1 from pg_constraint
    where conrelid = 'public.characters'::regclass
      and contype = 'u'
      and pg_get_constraintdef(oid) ilike '%user_id%'
  ) then
    alter table public.characters drop constraint if exists characters_user_id_key;
  end if;
exception when others then
  alter table public.characters drop constraint if exists characters_user_id_key;
end $$;

create index if not exists characters_user_id_idx on public.characters (user_id);

-- Optional derived stats cache
create table if not exists public.character_stats (
  character_id uuid primary key references public.characters (id) on delete cascade,
  atk int default 0,
  matk int default 0,
  def int default 0,
  mdef int default 0,
  aspd real default 1,
  mspd real default 7,
  crit real default 0.05,
  pierce real default 0.02,
  max_hp int default 100,
  max_sp int default 50,
  updated_at timestamptz default now()
);

-- Item templates (readable master data)
create table if not exists public.item_templates (
  id text primary key,
  name text not null,
  slot text not null,
  rarity text not null default 'common',
  data jsonb not null default '{}'::jsonb
);

-- Unique item instances (authority path / Edge)
create table if not exists public.item_instances (
  id uuid primary key default gen_random_uuid(),
  template_id text not null references public.item_templates (id),
  owner_character_id uuid references public.characters (id) on delete set null,
  upgrade_level int not null default 0 check (upgrade_level between 0 and 9),
  bonuses jsonb not null default '[]'::jsonb,
  sockets jsonb not null default '[]'::jsonb,
  bound boolean not null default false,
  qty int not null default 1,
  created_at timestamptz not null default now()
);

create table if not exists public.inventories (
  character_id uuid not null references public.characters (id) on delete cascade,
  slot int not null,
  instance_id uuid references public.item_instances (id) on delete set null,
  primary key (character_id, slot)
);

create table if not exists public.equipment (
  character_id uuid not null references public.characters (id) on delete cascade,
  slot text not null,
  instance_id uuid references public.item_instances (id) on delete set null,
  primary key (character_id, slot)
);

create table if not exists public.monster_templates (
  id text primary key,
  name text not null,
  level int not null default 1,
  data jsonb not null default '{}'::jsonb
);

create table if not exists public.metin_templates (
  id text primary key,
  name text not null,
  level int not null default 1,
  data jsonb not null default '{}'::jsonb
);

create table if not exists public.drop_tables (
  id text primary key,
  entries jsonb not null default '[]'::jsonb
);

create table if not exists public.npc_templates (
  id text primary key,
  name text not null,
  role text not null,
  kingdom int default 0,
  x double precision default 0,
  z double precision default 0
);

create table if not exists public.npc_shop_items (
  npc_id text references public.npc_templates (id) on delete cascade,
  item_id text not null,
  price int not null,
  primary key (npc_id, item_id)
);

create table if not exists public.quests (
  id text primary key,
  name text not null,
  data jsonb not null default '{}'::jsonb
);

create table if not exists public.character_quests (
  character_id uuid references public.characters (id) on delete cascade,
  quest_id text references public.quests (id) on delete cascade,
  state text not null default 'accepted',
  progress int not null default 0,
  primary key (character_id, quest_id)
);

create table if not exists public.upgrade_recipes (
  from_level int primary key check (from_level between 0 and 8),
  chance real not null,
  yang_cost int not null,
  downgrade boolean not null default false,
  destroy_on_fail boolean not null default false
);

-- Later stubs (empty structure)
create table if not exists public.guilds (
  id uuid primary key default gen_random_uuid(),
  name text unique,
  created_at timestamptz default now()
);
create table if not exists public.parties (
  id uuid primary key default gen_random_uuid(),
  leader_character_id uuid,
  created_at timestamptz default now()
);
create table if not exists public.dungeons (
  id text primary key,
  name text not null,
  data jsonb default '{}'::jsonb
);
create table if not exists public.events (
  id text primary key,
  name text not null,
  active boolean default false
);
create table if not exists public.gm_logs (
  id bigserial primary key,
  user_id uuid,
  action text,
  meta jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

-- RLS characters
alter table public.characters enable row level security;
drop policy if exists "characters_select_own" on public.characters;
drop policy if exists "characters_insert_own" on public.characters;
drop policy if exists "characters_update_own" on public.characters;
drop policy if exists "characters_delete_own" on public.characters;

create policy "characters_select_own"
  on public.characters for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "characters_insert_own"
  on public.characters for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "characters_update_own"
  on public.characters for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "characters_delete_own"
  on public.characters for delete to authenticated
  using ((select auth.uid()) = user_id);

grant select, insert, update, delete on table public.characters to authenticated;
grant select, insert, update, delete on table public.characters to anon;

-- Templates readable by authenticated
alter table public.item_templates enable row level security;
alter table public.monster_templates enable row level security;
alter table public.metin_templates enable row level security;
alter table public.drop_tables enable row level security;
alter table public.npc_templates enable row level security;
alter table public.quests enable row level security;
alter table public.upgrade_recipes enable row level security;

drop policy if exists "templates_read" on public.item_templates;
create policy "templates_read" on public.item_templates for select to authenticated using (true);
drop policy if exists "monster_read" on public.monster_templates;
create policy "monster_read" on public.monster_templates for select to authenticated using (true);
drop policy if exists "metin_read" on public.metin_templates;
create policy "metin_read" on public.metin_templates for select to authenticated using (true);
drop policy if exists "drop_read" on public.drop_tables;
create policy "drop_read" on public.drop_tables for select to authenticated using (true);
drop policy if exists "npc_read" on public.npc_templates;
create policy "npc_read" on public.npc_templates for select to authenticated using (true);
drop policy if exists "quest_read" on public.quests;
create policy "quest_read" on public.quests for select to authenticated using (true);
drop policy if exists "upgrade_read" on public.upgrade_recipes;
create policy "upgrade_read" on public.upgrade_recipes for select to authenticated using (true);

-- Item instances: owner only
alter table public.item_instances enable row level security;
drop policy if exists "instances_own" on public.item_instances;
create policy "instances_own" on public.item_instances for all to authenticated
  using (
    owner_character_id is null
    or exists (
      select 1 from public.characters c
      where c.id = owner_character_id and c.user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.characters c
      where c.id = owner_character_id and c.user_id = (select auth.uid())
    )
  );

-- Seed upgrade recipes
insert into public.upgrade_recipes (from_level, chance, yang_cost, downgrade, destroy_on_fail) values
  (0, 0.90, 1000, false, false),
  (1, 0.80, 2500, false, false),
  (2, 0.70, 5000, false, false),
  (3, 0.55, 10000, true, false),
  (4, 0.45, 20000, true, false),
  (5, 0.35, 40000, true, true),
  (6, 0.28, 80000, true, true),
  (7, 0.20, 150000, true, true),
  (8, 0.12, 300000, true, true)
on conflict (from_level) do update set
  chance = excluded.chance,
  yang_cost = excluded.yang_cost,
  downgrade = excluded.downgrade,
  destroy_on_fail = excluded.destroy_on_fail;
