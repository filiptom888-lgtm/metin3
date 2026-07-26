import { supabase } from "../net/supabase.js";
import { KINGDOMS, SPECS, validateName, villageSpawn } from "../data/meta.js";
import { xpForLevel, baseStatsFor } from "../data/stats.js";
import { ITEM_TEMPLATES } from "../data/items.js";
import { ItemService } from "./ItemService.js";

export const CharacterService = {
  KINGDOMS,
  SPECS,

  validateName,

  async list(userId) {
    if (!supabase) {
      const raw = localStorage.getItem("metin3_chars");
      return raw ? JSON.parse(raw) : [];
    }
    const { data, error } = await supabase
      .from("characters")
      .select("*")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false });
    if (error) throw error;
    return (data || []).map(fromRow);
  },

  async create(userId, opts) {
    const nameErr = validateName(opts.name);
    if (nameErr) throw new Error(nameErr);
    const spawn = villageSpawn(opts.kingdom);
    const spec = opts.spec && opts.spec !== "none" ? opts.spec : "none";
    const base = baseStatsFor(opts.classId, spec);
    const ch = {
      user_id: userId,
      name: opts.name.trim(),
      class_id: opts.classId,
      spec,
      gender: opts.gender || "m",
      kingdom: opts.kingdom || 1,
      level: 1,
      xp: 0,
      gold: 500,
      str: base.str,
      vit: base.vit,
      intel: base.intel,
      dex: base.dex,
      stat_points: 5,
      x: spawn.x,
      z: spawn.z,
      respawn_x: spawn.x,
      respawn_z: spawn.z,
      delete_pin: opts.deletePin || "0000",
      inventory: starterInventory(opts.classId),
      equipment: { __hotbarPotions: ["red_potion", "blue_potion"], __skillLevels: {} },
      quests: {},
      playtime_sec: 0,
    };

    if (!supabase) {
      const local = {
        ...ch,
        id: crypto.randomUUID(),
        user_id: userId,
        xpNext: xpForLevel(1),
        hotbarPotions: defaultHotbar(),
        skillLevels: {},
      };
      const client = toClient(local);
      client.inventory = starterInventory(opts.classId);
      client.hotbarPotions = defaultHotbar();
      client.skillLevels = {};
      const list = await this.list(userId);
      list.push(client);
      localStorage.setItem("metin3_chars", JSON.stringify(list));
      return client;
    }

    const { data, error } = await supabase.from("characters").insert(ch).select("*").single();
    if (error) throw error;
    return fromRow(data);
  },

  async remove(userId, characterId, pin) {
    if (!supabase) {
      const list = (await this.list(userId)).filter((c) => {
        if (c.id !== characterId) return true;
        return c.deletePin !== pin;
      });
      // only remove if pin matched
      const before = await this.list(userId);
      const target = before.find((c) => c.id === characterId);
      if (!target || target.deletePin !== pin) throw new Error("Wrong PIN");
      localStorage.setItem(
        "metin3_chars",
        JSON.stringify(before.filter((c) => c.id !== characterId))
      );
      return;
    }
    const { data: row } = await supabase
      .from("characters")
      .select("delete_pin")
      .eq("id", characterId)
      .eq("user_id", userId)
      .single();
    if (!row || row.delete_pin !== pin) throw new Error("Wrong PIN");
    const { error } = await supabase.from("characters").delete().eq("id", characterId).eq("user_id", userId);
    if (error) throw error;
  },

  async save(userId, ch) {
    const row = toRow(userId, ch);
    if (!supabase) {
      const list = await this.list(userId);
      const i = list.findIndex((c) => c.id === ch.id);
      if (i >= 0) list[i] = ch;
      else list.push(ch);
      localStorage.setItem("metin3_chars", JSON.stringify(list));
      return { ok: true };
    }
    const { error } = await supabase.from("characters").upsert(row, { onConflict: "id" });
    if (error) return { ok: false, reason: error.message };
    return { ok: true };
  },
};

function starterInventory(classId) {
  const mk = (itemId, qty) => ({
    uid: `ii_${Math.random().toString(36).slice(2, 9)}`,
    itemId,
    qty,
    upgrade: 0,
    bonuses: [],
    sockets: [],
    bound: false,
  });
  let wep = "rusty_sword";
  let armor = "scale_armor";
  if (classId === "ninja") {
    wep = "starter_daggers";
    armor = "leather_armor";
  } else if (classId === "shaman") {
    wep = "starter_staff";
    armor = "cloth_vest";
  } else {
    // warrior / sura — light starter, buy Recruit set at Lv.5
    wep = "rusty_sword";
    armor = null;
  }
  const bag = [mk("red_potion", 5), mk("blue_potion", 3), mk(wep, 1), mk("upgrade_ore", 2)];
  if (armor) bag.push(mk(armor, 1));
  if (classId === "warrior" || classId === "sura") bag.push(mk("wood_shield", 1));
  return bag;
}

function fromRow(row) {
  return toClient({
    id: row.id,
    user_id: row.user_id,
    name: row.name,
    classId: row.class_id,
    spec: row.spec,
    gender: row.gender,
    kingdom: row.kingdom,
    level: row.level,
    xp: row.xp,
    gold: row.gold,
    str: row.str,
    vit: row.vit,
    intel: row.intel,
    dex: row.dex,
    statPoints: row.stat_points,
    x: row.x,
    z: row.z,
    respawnX: row.respawn_x,
    respawnZ: row.respawn_z,
    deletePin: row.delete_pin,
    inventory: row.inventory || [],
    equipment: stripEquipMeta(row.equipment || {}),
    hotbarPotions: readHotbar(row.equipment),
    skillLevels: readSkillLevels(row.equipment),
    quests: row.quests || {},
    playtimeSec: row.playtime_sec || 0,
    metins: row.metins || 0,
    kills: row.kills || 0,
    xpNext: xpForLevel(row.level),
  });
}

function defaultHotbar() {
  return ["red_potion", "blue_potion"];
}

function readHotbar(equipment) {
  const hb = equipment?.__hotbarPotions;
  if (Array.isArray(hb) && hb.length >= 2) return [hb[0] || null, hb[1] || null];
  return defaultHotbar();
}

function readSkillLevels(equipment) {
  const sl = equipment?.__skillLevels;
  if (sl && typeof sl === "object" && !Array.isArray(sl)) return { ...sl };
  return {};
}

function stripEquipMeta(equipment) {
  if (!equipment || typeof equipment !== "object") return {};
  const { __hotbarPotions, __skillLevels, ...rest } = equipment;
  return rest;
}

function withHotbarMeta(ch) {
  const base = stripEquipMeta(ch.equipment || {});
  return {
    ...base,
    __hotbarPotions: Array.isArray(ch.hotbarPotions) ? ch.hotbarPotions : defaultHotbar(),
    __skillLevels:
      ch.skillLevels && typeof ch.skillLevels === "object" ? ch.skillLevels : {},
  };
}

function sanitizeStack(raw) {
  if (!raw) return null;
  if (typeof raw === "string") return ItemService.createInstance(raw);
  const id = raw.itemId || raw.id;
  if (!id || !ITEM_TEMPLATES[id]) return null;
  const qtyN = Number(raw.qty);
  return {
    ...raw,
    itemId: id,
    qty: Number.isFinite(qtyN) && qtyN > 0 ? Math.floor(qtyN) : 1,
    upgrade: Number(raw.upgrade) || 0,
    bonuses: Array.isArray(raw.bonuses) ? raw.bonuses : [],
    sockets: Array.isArray(raw.sockets) ? raw.sockets : [],
    uid: raw.uid || `ii_${Math.random().toString(36).slice(2, 11)}`,
  };
}

function sanitizeInventory(list) {
  if (!Array.isArray(list)) return [];
  return list.map(sanitizeStack).filter(Boolean);
}

function sanitizeEquipment(equip) {
  const clean = stripEquipMeta(equip || {});
  const out = {};
  for (const [slot, ref] of Object.entries(clean)) {
    const s = sanitizeStack(ref);
    if (s) out[slot] = { ...s, qty: 1 };
  }
  return out;
}

function toClient(ch) {
  const equip = ch.equipment || {};
  return {
    id: ch.id,
    name: ch.name,
    classId: ch.classId || ch.class_id,
    spec: ch.spec,
    gender: ch.gender || "m",
    kingdom: ch.kingdom || 1,
    level: ch.level || 1,
    xp: ch.xp || 0,
    xpNext: ch.xpNext || xpForLevel(ch.level || 1),
    gold: ch.gold || 0,
    str: ch.str,
    vit: ch.vit,
    intel: ch.intel,
    dex: ch.dex,
    statPoints: ch.statPoints ?? ch.stat_points ?? 0,
    x: ch.x ?? 0,
    z: ch.z ?? 0,
    respawnX: ch.respawnX ?? ch.respawn_x ?? ch.x ?? 0,
    respawnZ: ch.respawnZ ?? ch.respawn_z ?? ch.z ?? 0,
    deletePin: ch.deletePin || ch.delete_pin || "0000",
    inventory: sanitizeInventory(ch.inventory),
    equipment: sanitizeEquipment(equip),
    hotbarPotions: ch.hotbarPotions || readHotbar(equip),
    skillLevels: ch.skillLevels || readSkillLevels(equip),
    quests: ch.quests || {},
    playtimeSec: ch.playtimeSec || ch.playtime_sec || 0,
    metins: ch.metins || 0,
    kills: ch.kills || 0,
  };
}

function toRow(userId, ch) {
  return {
    id: ch.id,
    user_id: userId,
    name: ch.name,
    class_id: ch.classId,
    spec: ch.spec,
    gender: ch.gender,
    kingdom: ch.kingdom,
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
    respawn_x: ch.respawnX,
    respawn_z: ch.respawnZ,
    delete_pin: ch.deletePin || "0000",
    inventory: ch.inventory,
    equipment: withHotbarMeta(ch),
    quests: ch.quests,
    playtime_sec: ch.playtimeSec || 0,
    metins: ch.metins || 0,
    kills: ch.kills || 0,
    updated_at: new Date().toISOString(),
  };
}
