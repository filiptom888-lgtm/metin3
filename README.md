# METIN3

3D multiplayer Metin arena — Three.js client, Supabase Realtime sync, free Vercel deploy.

## Stack

- **Vite** + **Three.js** (WebGL 3D)
- **Supabase** Auth (anonymous) + Realtime (Presence + Broadcast)
- **Vercel** static hosting

## Multiplayer design

| Channel | Role |
|--------|------|
| Presence | Who’s online, name/class, **host election** (earliest join) |
| `player` broadcast ~12Hz | Positions so everyone sees each other |
| `world` broadcast ~8Hz | Host syncs mobs + metin stones |
| `evt` broadcast | Attacks, damage, kills, toasts |

Small shared map (`48×48`). Host simulates AI; clients interpolate remotes.

## 1. Supabase setup

1. Create a project at [supabase.com](https://supabase.com)
2. **Authentication → Providers → Anonymous** → enable
3. **Database → Replication** / Realtime: ensure Realtime is on (default)
4. Optional SQL (`supabase/schema.sql`) for score inserts
5. **Project Settings → API**: copy Project URL + `anon` key

## 2. Local env

```bash
cp .env.example .env
```

Fill in:

```
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOi...
```

```bash
npm install
npm run dev
```

Open two browser windows → same room code → you should see each other.

## 3. Deploy on Vercel (free)

```bash
npm i -g vercel
vercel
```

Or push to GitHub → Import on [vercel.com](https://vercel.com).

Add env vars in Vercel project settings:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Redeploy after setting env.

## Play flow

1. **Create Room** → get a code → share it  
2. Friends **Join Room** with that code  
3. Waiting room lists everyone  
4. **Only the creator** clicks **Start Match**  
5. Fight together on the small 3D map  

## Controls

| Input | Action |
|--------|--------|
| WASD | Move |
| Mouse | Aim |
| Click / Space | Attack |
| 1–4 | Skills |
| Tab | Scoreboard |

## Vercel env (not the database password!)

In Vercel → Project → Settings → Environment Variables, add:

- `VITE_SUPABASE_URL` = Project URL (Settings → API)  
- `VITE_SUPABASE_ANON_KEY` = `anon` `public` key  

Do **not** put the database password in Vercel — that is only for Postgres tools. The browser uses the anon key.

Also in Supabase: **Authentication → Providers → Anonymous → Enable**.

## Room tip

Share one code from Create Room. Free Realtime is fine for a small party on one map.
