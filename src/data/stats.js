/** Hard cap — gear sets go up to this level */
export const MAX_LEVEL = 75;

export function xpForLevel(level) {
  const lv = Math.min(Math.max(1, level), MAX_LEVEL);
  return Math.floor(100 + lv * 55 + lv * lv * 12);
}

export function baseStatsFor(classId, spec) {
  const untrained = {
    warrior: { str: 5, vit: 4, intel: 2, dex: 2 },
    ninja: { str: 3, vit: 2, intel: 1, dex: 5 },
    sura: { str: 4, vit: 3, intel: 3, dex: 2 },
    shaman: { str: 2, vit: 3, intel: 5, dex: 2 },
  };
  const map = {
    warrior: { body: { str: 6, vit: 5, intel: 1, dex: 2 }, mental: { str: 4, vit: 4, intel: 4, dex: 2 } },
    ninja: { blade: { str: 3, vit: 2, intel: 1, dex: 6 }, archery: { str: 2, vit: 2, intel: 2, dex: 6 } },
    sura: { weaponry: { str: 5, vit: 3, intel: 2, dex: 3 }, blackmagic: { str: 2, vit: 3, intel: 6, dex: 2 } },
    shaman: { dragon: { str: 2, vit: 2, intel: 6, dex: 2 }, healing: { str: 1, vit: 3, intel: 6, dex: 2 } },
  };
  if (!spec || spec === "none") return untrained[classId] || { str: 4, vit: 3, intel: 2, dex: 3 };
  return map[classId]?.[spec] || untrained[classId] || { str: 4, vit: 3, intel: 2, dex: 3 };
}

export function deriveCombatStats(ch, equipBonus = {}) {
  const str = ch.str + (equipBonus.str || 0);
  const vit = ch.vit + (equipBonus.vit || 0);
  const intel = ch.intel + (equipBonus.intel || 0);
  const dex = ch.dex + (equipBonus.dex || 0);
  const level = ch.level || 1;

  const maxHp = Math.floor(120 + vit * 20 + level * 14 + (equipBonus.def || 0) * 2);
  const maxSp = Math.floor(80 + intel * 12 + level * 5);
  const atk = Math.floor(10 + str * 2.4 + dex * 0.6 + (equipBonus.atk || 0) + level * 1.6);
  const matk = Math.floor(8 + intel * 2.6 + (equipBonus.matk || 0) + level);
  const def = Math.floor(2 + vit * 1.1 + (equipBonus.def || 0) + level * 0.6);
  const mdef = Math.floor(2 + intel * 0.9 + (equipBonus.mdef || 0));
  const aspd = 1 + dex * 0.012;
  const mspd = 7 + dex * 0.14 + (equipBonus.mspd || 0);
  const crit = Math.min(0.5, 0.04 + dex * 0.009);
  const pierce = Math.min(0.35, 0.02 + dex * 0.005 + str * 0.002);
  const hpRegen = 1 + vit * 0.15;
  const spRegen = 1 + intel * 0.12;

  return { str, vit, intel, dex, maxHp, maxSp, atk, matk, def, mdef, aspd, mspd, crit, pierce, hpRegen, spRegen };
}
