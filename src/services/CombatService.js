import { deriveCombatStats } from "../data/stats.js";

/** Client-side formulas; Edge Function is source of truth when wired */
export const CombatService = {
  derive: deriveCombatStats,

  rollHit({ attacker, defender, skillMul = 1, isMagic = false }) {
    const missChance = Math.max(0.02, 0.08 - (attacker.dex || 0) * 0.004 + (defender.dex || 0) * 0.003);
    if (Math.random() < missChance) return { hit: false, kind: "miss", damage: 0 };

    const atk = isMagic ? attacker.matk : attacker.atk;
    const def = isMagic ? defender.mdef || 0 : defender.def || 0;
    let raw = atk * skillMul;

    const crit = Math.random() < (attacker.crit || 0.05);
    const pierce = Math.random() < (attacker.pierce || 0.02);
    if (crit) raw *= 1.75;
    if (!pierce) raw = Math.max(1, raw - def * 0.55);
    else raw = Math.max(1, raw - def * 0.15);

    return {
      hit: true,
      kind: crit ? "crit" : pierce ? "pierce" : "hit",
      damage: Math.floor(raw),
    };
  },

  applyPlayerDamage(hp, amount) {
    return Math.max(0, hp - Math.max(1, amount));
  },
};
