-- Authority path for METIN3 Phase 1
--
-- Client may predict VFX. Trusted mutations go through Edge Functions with
-- service role on the server only. Never accept client-sent absolute damage,
-- free items, or upgrade success flags.
--
-- Functions (stubs under supabase/functions/):
--   combat-hit   — validate attacker/target, apply CombatService formulas, return damage
--   resolve-drop — roll drop table server-side, create item_instances
--   upgrade-item — lock row, yang check, +0..+9 recipe, mutate instance
--   claim-quest  — verify progress, grant rewards once
--
-- Fallback: while undeployed, client CombatService / UpgradeService / DropService
-- run locally and log; wire invoke() when functions are live.

export const AUTHORITY = {
  combatHit: "combat-hit",
  resolveDrop: "resolve-drop",
  upgradeItem: "upgrade-item",
  claimQuest: "claim-quest",
};
