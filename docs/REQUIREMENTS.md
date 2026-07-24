# METIN3 Requirements Map

Architecture: **Vite client + Supabase (Auth, Postgres, Realtime, Edge Functions) + Vercel**.  
Checklist “PHP services” map to `src/services/*` + Edge Functions. Branding is original (not Metin2 assets).

Status: `done` | `phase1` | `later`

| # | System | Status | Service / notes |
|---|--------|--------|-----------------|
| 1 | Account / Character | phase1 | AuthService, CharacterService — multi-char, kingdom, gender, save location |
| 2 | Classes + specializations | phase1 | SkillService + data/skills.js — Lycan later |
| 3 | Character stats | phase1 | CombatService / CharacterService — core attrs + derived |
| 4 | Leveling 1–99 | phase1 | EXP curve, death penalty; party share later |
| 5 | Combat | phase1 | CombatService + host AI; Edge combat-hit stub |
| 6 | Monsters | phase1 | data/monsters.js + SpawnService |
| 7 | Metin stones | phase1 | Named types, waves, drops |
| 8 | Maps | phase1 | One open world + kingdom villages; multi-map later |
| 9 | NPCs | phase1 | Shop, blacksmith, teleporter; biologist later |
| 10 | Inventory | phase1 | Unique item_instances |
| 11 | Equipment | phase1 | Core slots; costume/mount/pet later |
| 12 | Blacksmith +0–+9 | phase1 | UpgradeService + Edge upgrade-item |
| 13 | Item bonuses | phase1 | Random bonuses on drop |
| 14 | Sockets | later | ItemService sockets |
| 15 | Skills trees M/G/P | phase1 basic | Full book system later |
| 16–18 | Horse / Mount / Pet | later | stubs |
| 19 | Quests | phase1 | QuestService starter set |
| 20 | Biologist | later | |
| 21 | Drop system | phase1 | DropService |
| 22 | Yang economy | phase1 | |
| 23–24 | Trade / private shops | later | |
| 25–26 | Party / Guild | later | schema stubs |
| 27–29 | PvP / Karma / Kingdom PvP | later | kingdom select in phase1 |
| 30–31 | Dungeons / Demon Tower | later | |
| 32–33 | Fishing / Mining | later | |
| 34 | Potions | phase1 | |
| 35 | Warehouse | later | NPC stub |
| 36–37 | Friends / Chat channels | later | local/system chat exists |
| 38 | Death | phase1 | Town / here respawn |
| 39–42 | Boss / Events / Ranking / Item shop | later | |
| 43–44 | GM / Logs | later | gm_logs stub |
| 45–46 | Anti-cheat / unique instances | phase1 | instances + Edge path |
| 47–48 | Server architecture / master tables | phase1 | this layout |

## Phase 1 play loop

Village → wild → mobs → Metins → loot instances → equip → stats/skills → NPC shop/blacksmith → quests → death/respawn → save.
