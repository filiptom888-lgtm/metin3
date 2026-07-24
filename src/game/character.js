import { CLASSES } from "./data.js";
import { getItem, SLOTS } from "./items.js";

export function xpForLevel(level) {
  return Math.floor(100 + level * 55 + level * level * 12);
}

export function createNewCharacter(name, classId) {
  const cls = CLASSES[classId] || CLASSES.warrior;
  const base = baseStats(classId);
  return {
    name: name.slice(0, 16),
    classId: cls.id,
    level: 1,
    xp: 0,
    xpNext: xpForLevel(1),
    gold: 200,
    str: base.str,
    vit: base.vit,
    intel: base.intel,
    dex: base.dex,
    statPoints: 3,
    x: 0,
    z: 0,
    inventory: [
      { uid: "start_pot1", itemId: "red_potion", qty: 5 },
      { uid: "start_pot2", itemId: "blue_potion", qty: 3 },
      { uid: "start_wep", itemId: starterWeapon(classId), qty: 1 },
      { uid: "start_arm", itemId: "cloth_vest", qty: 1 },
    ],
    equipment: {},
    metins: 0,
    kills: 0,
  };
}

function baseStats(classId) {
  switch (classId) {
    case "ninja":
      return { str: 2, vit: 2, intel: 1, dex: 5 };
    case "sura":
      return { str: 3, vit: 3, intel: 3, dex: 2 };
    case "shaman":
      return { str: 1, vit: 2, intel: 5, dex: 2 };
    default:
      return { str: 5, vit: 4, intel: 1, dex: 2 };
  }
}

function starterWeapon(classId) {
  if (classId === "shaman") return "spirit_staff";
  if (classId === "ninja") return "shadow_daggers";
  return "rusty_sword";
}

export function equipBonuses(equipment = {}) {
  const b = { atk: 0, def: 0, str: 0, vit: 0, intel: 0, dex: 0 };
  for (const slot of SLOTS) {
    const uid = equipment[slot];
    if (!uid) continue;
    // equipment map stores itemId or {itemId} — we store itemId string in slot
  }
  // equipment values are item instance refs: { itemId } or itemId
  for (const key of Object.keys(equipment)) {
    const ref = equipment[key];
    if (!ref) continue;
    const itemId = typeof ref === "string" ? ref : ref.itemId;
    const def = getItem(itemId);
    if (!def) continue;
    b.atk += def.atk || 0;
    b.def += def.def || 0;
    b.str += def.str || 0;
    b.vit += def.vit || 0;
    b.intel += def.intel || 0;
    b.dex += def.dex || 0;
  }
  return b;
}

export function derivedStats(ch) {
  const eq = equipBonuses(ch.equipment);
  const str = ch.str + eq.str;
  const vit = ch.vit + eq.vit;
  const intel = ch.intel + eq.intel;
  const dex = ch.dex + eq.dex;
  const cls = CLASSES[ch.classId] || CLASSES.warrior;

  const maxHp = Math.floor(cls.hp + vit * 18 + ch.level * 12 + eq.def * 2);
  const maxSp = Math.floor(cls.sp + intel * 10 + ch.level * 4);
  const atk = Math.floor(cls.atk + str * 2.2 + dex * 0.8 + eq.atk + ch.level * 1.5);
  const def = Math.floor(eq.def + vit * 0.8 + ch.level * 0.5);
  const speed = cls.speed + dex * 0.12;
  const crit = Math.min(0.45, 0.05 + dex * 0.008 + (ch.classId === "ninja" ? 0.08 : 0));

  return { str, vit, intel, dex, maxHp, maxSp, atk, def, speed, crit, eq };
}

export function applyLevelUps(ch, gainedXp) {
  ch.xp += gainedXp;
  ch.xpNext = xpForLevel(ch.level);
  let ups = 0;
  while (ch.xp >= ch.xpNext && ch.level < 99) {
    ch.xp -= ch.xpNext;
    ch.level += 1;
    ups += 1;
    ch.statPoints += 3;
    ch.xpNext = xpForLevel(ch.level);
  }
  return ups;
}

export function toDbRow(userId, ch) {
  return {
    user_id: userId,
    name: ch.name,
    class_id: ch.classId,
    level: ch.level,
    xp: ch.xp,
    gold: ch.gold,
    str: ch.str,
    vit: ch.vit,
    intel: ch.intel,
    dex: ch.dex,
    stat_points: ch.statPoints,
    x: ch.x,
    z: ch.z,
    inventory: ch.inventory,
    equipment: ch.equipment,
    metins: ch.metins,
    kills: ch.kills,
    updated_at: new Date().toISOString(),
  };
}

export function fromDbRow(row) {
  if (!row) return null;
  return {
    dbId: row.id,
    name: row.name,
    classId: row.class_id,
    level: row.level,
    xp: row.xp,
    xpNext: xpForLevel(row.level),
    gold: row.gold,
    str: row.str,
    vit: row.vit,
    intel: row.intel,
    dex: row.dex,
    statPoints: row.stat_points,
    x: row.x,
    z: row.z,
    inventory: row.inventory || [],
    equipment: row.equipment || {},
    metins: row.metins || 0,
    kills: row.kills || 0,
  };
}
