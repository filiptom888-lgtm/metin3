import { CLASSES } from "./data.js";
import { InventoryService } from "../services/InventoryService.js";
import { CombatService } from "../services/CombatService.js";
import { xpForLevel, baseStatsFor, MAX_LEVEL } from "../data/stats.js";
import { villageSpawn } from "../data/meta.js";
import { ItemService } from "../services/ItemService.js";

export { xpForLevel };

export function createNewCharacter(name, classId, opts = {}) {
  const cls = CLASSES[classId] || CLASSES.warrior;
  // Skill path is chosen later at the Skill Master (Lv.5+) — Metin2 style
  const spec = opts.spec && opts.spec !== "none" ? opts.spec : "none";
  const kingdom = opts.kingdom || 1;
  const spawn = villageSpawn(kingdom);
  const base = baseStatsFor(cls.id, spec);
  const ch = {
    name: name.slice(0, 16),
    classId: cls.id,
    spec,
    gender: opts.gender || "m",
    kingdom,
    level: 1,
    xp: 0,
    xpNext: xpForLevel(1),
    gold: 500,
    str: base.str,
    vit: base.vit,
    intel: base.intel,
    dex: base.dex,
    statPoints: 5,
    x: spawn.x,
    z: spawn.z,
    respawnX: spawn.x,
    respawnZ: spawn.z,
    deletePin: opts.deletePin || "0000",
    inventory: [],
    equipment: {},
    quests: {},
    playtimeSec: 0,
    metins: 0,
    kills: 0,
  };
  InventoryService.add(ch, "red_potion", 5);
  InventoryService.add(ch, "blue_potion", 3);
  InventoryService.add(ch, starterWeapon(classId), 1);
  InventoryService.add(ch, "cloth_vest", 1);
  InventoryService.add(ch, "upgrade_ore", 2);
  return ch;
}

function defaultSpec(_classId) {
  return "none";
}

function starterWeapon(classId) {
  if (classId === "shaman") return "starter_staff";
  if (classId === "ninja") return "starter_daggers";
  return "rusty_sword";
}

export function equipBonuses(equipment = {}) {
  return InventoryService.equipBonuses({ equipment });
}

export function derivedStats(ch) {
  const eq = InventoryService.equipBonuses(ch);
  const d = CombatService.derive(ch, eq);
  return {
    ...d,
    speed: d.mspd,
    eq,
  };
}

export function applyLevelUps(ch, gainedXp) {
  ch.xp += gainedXp;
  ch.xpNext = xpForLevel(ch.level);
  let ups = 0;
  while (ch.xp >= ch.xpNext && ch.level < MAX_LEVEL) {
    ch.xp -= ch.xpNext;
    ch.level += 1;
    ups += 1;
    ch.statPoints += 3;
    ch.xpNext = xpForLevel(ch.level);
  }
  if (ch.level >= MAX_LEVEL) {
    ch.level = MAX_LEVEL;
    ch.xp = Math.min(ch.xp, ch.xpNext - 1);
  }
  return ups;
}

export function toDbRow(userId, ch) {
  return {
    id: ch.id,
    user_id: userId,
    name: ch.name,
    class_id: ch.classId,
    spec: ch.spec,
    gender: ch.gender || "m",
    kingdom: ch.kingdom || 1,
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
    respawn_x: ch.respawnX ?? ch.x,
    respawn_z: ch.respawnZ ?? ch.z,
    delete_pin: ch.deletePin || "0000",
    inventory: ch.inventory,
    equipment: ch.equipment,
    quests: ch.quests || {},
    playtime_sec: ch.playtimeSec || 0,
    metins: ch.metins,
    kills: ch.kills,
    updated_at: new Date().toISOString(),
  };
}

export function fromDbRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    dbId: row.id,
    name: row.name,
    classId: row.class_id,
    spec: row.spec || "none",
    gender: row.gender || "m",
    kingdom: row.kingdom || 1,
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
    respawnX: row.respawn_x ?? row.x,
    respawnZ: row.respawn_z ?? row.z,
    deletePin: row.delete_pin || "0000",
    inventory: row.inventory || [],
    equipment: row.equipment || {},
    quests: row.quests || {},
    playtimeSec: row.playtime_sec || 0,
    metins: row.metins || 0,
    kills: row.kills || 0,
  };
}

export { ItemService };
