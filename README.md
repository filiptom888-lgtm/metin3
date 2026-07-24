# METIN3

3D open-world Metin-style arena — Three.js + Supabase Realtime + saved progression. Deploy free on Vercel.

## Play flow

1. Enter name + class → **Enter the Kingdom**
2. Everyone shares **one open world** (no rooms)
3. Hunt outside city walls, loot gear, allocate stats, equip items
4. Progress auto-saves ~every 20s (and on menu Save)

### Controls

| Key | Action |
|-----|--------|
| WASD | Move |
| Click / Space | Attack |
| 1–4 | Skills |
| F | Pick up loot |
| C | Character / stats |
| I | Inventory / equip |
| Esc | Menu (save / leave) |
| Tab | Who's online |
| Right-click item | Drop |

## Supabase setup

1. Enable **Authentication → Anonymous**
2. SQL Editor → run [`supabase/schema.sql`](supabase/schema.sql)
3. Env (local `.env` + Vercel):

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
vercel
```

Push to GitHub; Vercel redeploys automatically.
