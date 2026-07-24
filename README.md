# METIN3

3D open-world Metin-style arena — Vite + Three.js + Supabase (Auth / Realtime / Postgres / Edge) + Vercel.

## Phase 1 loop

Login → multi-character select/create (kingdom · gender · class · spec) → village spawn → hunt mobs/Metins → unique loot → equip → stats/skills → NPC shop / blacksmith +0–+9 → quests → death town/here → save.

## Controls

| Key | Action |
|-----|--------|
| WASD | Move |
| Click / Space | Attack |
| 1–4 | Skills |
| F | Pick up loot |
| E | Talk to NPC |
| Q | Quest log |
| C | Character / stats |
| I | Inventory / equip |
| Esc | Menu (save / leave) |
| Tab | Who's online |

## Supabase setup

1. Enable **Authentication → Anonymous** (and Email if you want accounts)
2. SQL Editor → run the full [`supabase/schema.sql`](supabase/schema.sql) (multi-char; drops old `unique(user_id)` if present)
3. Optional Edge Functions (trusted upgrades/hits/drops/quests):

```bash
supabase functions deploy upgrade-item
supabase functions deploy combat-hit
supabase functions deploy resolve-drop
supabase functions deploy claim-quest
```

See [`docs/AUTHORITY.md`](docs/AUTHORITY.md) — client predicts VFX; Edge is source of truth when deployed. Until then, client services fall back locally.

4. Env (local `.env` / `.env.local` + Vercel Project Settings):

```
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=your_publishable_or_anon_key
VITE_SUPABASE_PUBLISHABLE_KEY=your_publishable_or_anon_key
```

Do **not** put the database password in Vercel.

## Deploy

```bash
npm i
npm run build
```

Push to GitHub; Vercel redeploys automatically. Checklist map: [`docs/REQUIREMENTS.md`](docs/REQUIREMENTS.md).
