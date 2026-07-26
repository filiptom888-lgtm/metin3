/**
 * Class gear sets — Metin2-style lines:
 *   plate   → Warrior + Sura (metal)
 *   leather → Ninja
 *   cloth   → Shaman
 *
 * Tiers: Lv.5 / 15 / 25 / 40 / 60 / 75 (max level).
 * Sprites reuse existing icons so UI stays filled.
 */

export const GEAR_TIERS = [
  { level: 5, key: "t05", rarity: "common", mul: 1.0 },
  { level: 15, key: "t15", rarity: "uncommon", mul: 1.55 },
  { level: 25, key: "t25", rarity: "uncommon", mul: 2.15 },
  { level: 40, key: "t40", rarity: "rare", mul: 3.1 },
  { level: 60, key: "t60", rarity: "rare", mul: 4.4 },
  { level: 75, key: "t75", rarity: "epic", mul: 5.8 },
];

const LINES = {
  plate: {
    id: "plate",
    name: "War",
    classes: ["warrior", "sura"],
    prefixes: ["Recruit", "Soldier", "Knight", "Champion", "Warlord", "Dragon"],
    weaponNoun: "Blade",
    armorNoun: "Plate",
    helmNoun: "Helm",
    shoesNoun: "Greaves",
    shieldNoun: "Shield",
    hasShield: true,
    icons: {
      weapon: { icon: "⚔", sprite: "/icons/items/iron_blade.svg" },
      armor: { icon: "🛡", sprite: "/icons/items/scale_armor.svg" },
      helmet: { icon: "⛑", sprite: "/icons/items/iron_helm.svg" },
      shoes: { icon: "👢", sprite: "/icons/items/hunter_boots.svg" },
      shield: { icon: "🛡", sprite: "/icons/items/iron_shield.svg" },
    },
    // higher tiers swap to stronger-looking sprites
    iconUp: {
      3: {
        weapon: { icon: "⚔", sprite: "/icons/items/steel_blade.svg" },
        armor: { icon: "🛡", sprite: "/icons/items/plate_mail.svg" },
        helmet: { icon: "👑", sprite: "/icons/items/war_crown.svg" },
        shoes: { icon: "👢", sprite: "/icons/items/wind_greaves.svg" },
        shield: { icon: "🛡", sprite: "/icons/items/iron_shield.svg" },
      },
      5: {
        weapon: { icon: "⚔", sprite: "/icons/items/dragon_edge.svg" },
        armor: { icon: "🛡", sprite: "/icons/items/plate_mail.svg" },
        helmet: { icon: "👑", sprite: "/icons/items/war_crown.svg" },
        shoes: { icon: "👢", sprite: "/icons/items/wind_greaves.svg" },
        shield: { icon: "🛡", sprite: "/icons/items/iron_shield.svg" },
      },
    },
    stats: (mul, slot) => {
      if (slot === "weapon") return { atk: Math.round(7 * mul), str: Math.max(1, Math.round(1.2 * mul)) };
      if (slot === "armor") return { def: Math.round(7 * mul), vit: Math.max(1, Math.round(1.1 * mul)), str: Math.max(0, Math.round(0.4 * mul)) };
      if (slot === "helmet") return { def: Math.round(4 * mul), vit: Math.max(1, Math.round(0.7 * mul)) };
      if (slot === "shoes") return { def: Math.round(3 * mul), dex: Math.max(1, Math.round(0.6 * mul)) };
      if (slot === "shield") return { def: Math.round(5 * mul), vit: Math.max(1, Math.round(0.5 * mul)) };
      return {};
    },
  },
  leather: {
    id: "leather",
    name: "Hunt",
    classes: ["ninja"],
    prefixes: ["Scout", "Stalker", "Assassin", "Shadow", "Phantom", "Void"],
    weaponNoun: "Daggers",
    armorNoun: "Leather",
    helmNoun: "Hood",
    shoesNoun: "Boots",
    hasShield: false,
    icons: {
      weapon: { icon: "🗡", sprite: "/icons/items/shadow_daggers.svg" },
      armor: { icon: "🛡", sprite: "/icons/items/leather_armor.svg" },
      helmet: { icon: "⛑", sprite: "/icons/items/leather_cap.svg" },
      shoes: { icon: "👢", sprite: "/icons/items/hunter_boots.svg" },
    },
    iconUp: {
      2: {
        weapon: { icon: "🗡", sprite: "/icons/items/moon_blade.svg" },
        armor: { icon: "🛡", sprite: "/icons/items/leather_armor.svg" },
        helmet: { icon: "⛑", sprite: "/icons/items/leather_cap.svg" },
        shoes: { icon: "👢", sprite: "/icons/items/wind_greaves.svg" },
      },
      4: {
        weapon: { icon: "🗡", sprite: "/icons/items/tiger_fang.svg" },
        armor: { icon: "🛡", sprite: "/icons/items/leather_armor.svg" },
        helmet: { icon: "⛑", sprite: "/icons/items/spirit_hood.svg" },
        shoes: { icon: "👢", sprite: "/icons/items/wind_greaves.svg" },
      },
    },
    stats: (mul, slot) => {
      if (slot === "weapon") return { atk: Math.round(6.5 * mul), dex: Math.max(1, Math.round(1.6 * mul)) };
      if (slot === "armor") return { def: Math.round(5.5 * mul), dex: Math.max(1, Math.round(1.3 * mul)), vit: Math.max(1, Math.round(0.6 * mul)) };
      if (slot === "helmet") return { def: Math.round(3.2 * mul), dex: Math.max(1, Math.round(0.9 * mul)) };
      if (slot === "shoes") return { def: Math.round(2.6 * mul), dex: Math.max(1, Math.round(1.4 * mul)), mspd: +(0.08 * mul).toFixed(2) };
      return {};
    },
  },
  cloth: {
    id: "cloth",
    name: "Spirit",
    classes: ["shaman"],
    prefixes: ["Acolyte", "Adept", "Mystic", "Oracle", "Celestial", "Immortal"],
    weaponNoun: "Staff",
    armorNoun: "Robe",
    helmNoun: "Circlet",
    shoesNoun: "Sandals",
    shieldNoun: "Talisman",
    hasShield: true,
    icons: {
      weapon: { icon: "🔱", sprite: "/icons/items/spirit_staff.svg" },
      armor: { icon: "🥋", sprite: "/icons/items/mystic_robe.svg" },
      helmet: { icon: "⛑", sprite: "/icons/items/spirit_hood.svg" },
      shoes: { icon: "👢", sprite: "/icons/items/cloth_boots.svg" },
      shield: { icon: "📿", sprite: "/icons/items/soul_amulet.svg" },
    },
    iconUp: {
      3: {
        weapon: { icon: "🔱", sprite: "/icons/items/spirit_staff.svg" },
        armor: { icon: "🥋", sprite: "/icons/items/mystic_robe.svg" },
        helmet: { icon: "👑", sprite: "/icons/items/war_crown.svg" },
        shoes: { icon: "👢", sprite: "/icons/items/wind_greaves.svg" },
        shield: { icon: "📿", sprite: "/icons/items/soul_amulet.svg" },
      },
    },
    stats: (mul, slot) => {
      if (slot === "weapon") return { atk: Math.round(3.5 * mul), matk: Math.round(8 * mul), intel: Math.max(1, Math.round(1.5 * mul)) };
      if (slot === "armor") return { def: Math.round(4.5 * mul), mdef: Math.round(4 * mul), intel: Math.max(1, Math.round(1.2 * mul)), vit: Math.max(1, Math.round(0.5 * mul)) };
      if (slot === "helmet") return { def: Math.round(2.8 * mul), mdef: Math.round(3 * mul), intel: Math.max(1, Math.round(0.9 * mul)) };
      if (slot === "shoes") return { def: Math.round(2.2 * mul), intel: Math.max(1, Math.round(0.6 * mul)), dex: Math.max(1, Math.round(0.4 * mul)) };
      if (slot === "shield") return { mdef: Math.round(5 * mul), intel: Math.max(1, Math.round(0.8 * mul)), def: Math.round(2 * mul) };
      return {};
    },
  },
};

function sellFor(level, rarity, slot) {
  const base = { weapon: 80, armor: 70, helmet: 45, shoes: 40, shield: 50 }[slot] || 40;
  const rMul = { common: 1, uncommon: 1.8, rare: 3.2, epic: 6 }[rarity] || 1;
  return Math.round(base * (level / 5) * rMul);
}

function pickIcons(line, tierIndex, slot) {
  let pack = line.icons[slot];
  for (const [minIdx, up] of Object.entries(line.iconUp || {})) {
    if (tierIndex >= Number(minIdx) && up[slot]) pack = up[slot];
  }
  return pack || { icon: "·" };
}

function makePiece(line, tier, tierIndex, slot, noun) {
  const id = `${line.id}_${tier.key}_${slot}`;
  const prefix = line.prefixes[tierIndex];
  const name = `${prefix} ${noun}`;
  const icons = pickIcons(line, tierIndex, slot);
  const stats = line.stats(tier.mul, slot);
  return {
    id,
    name,
    slot,
    rarity: tier.rarity,
    levelReq: tier.level,
    classReq: [...line.classes],
    setId: `${line.id}_${tier.key}`,
    setName: `${prefix} ${line.name} Set`,
    sell: sellFor(tier.level, tier.rarity, slot),
    icon: icons.icon,
    sprite: icons.sprite,
    ...stats,
  };
}

/** Build all set gear templates */
export function buildGearSetItems() {
  const out = {};
  const setIndex = [];

  GEAR_TIERS.forEach((tier, tierIndex) => {
    for (const line of Object.values(LINES)) {
      const pieces = [];
      const w = makePiece(line, tier, tierIndex, "weapon", line.weaponNoun);
      const a = makePiece(line, tier, tierIndex, "armor", line.armorNoun);
      const h = makePiece(line, tier, tierIndex, "helmet", line.helmNoun);
      const s = makePiece(line, tier, tierIndex, "shoes", line.shoesNoun);
      out[w.id] = w;
      out[a.id] = a;
      out[h.id] = h;
      out[s.id] = s;
      pieces.push(w.id, a.id, h.id, s.id);
      if (line.hasShield) {
        const sh = makePiece(line, tier, tierIndex, "shield", line.shieldNoun);
        out[sh.id] = sh;
        pieces.push(sh.id);
      }
      setIndex.push({
        setId: `${line.id}_${tier.key}`,
        setName: `${line.prefixes[tierIndex]} ${line.name} Set`,
        level: tier.level,
        line: line.id,
        classes: line.classes,
        pieces,
      });
    }

    // Shared jewelry per tier (all classes)
    const jMul = tier.mul;
    const jPrefix = ["Copper", "Silver", "Jade", "Gold", "Crystal", "Dragon"][tierIndex];
    const bracelet = {
      id: `jewel_${tier.key}_bracelet`,
      name: `${jPrefix} Bracelet`,
      slot: "bracelet",
      rarity: tier.rarity,
      levelReq: tier.level,
      atk: Math.round(2 * jMul),
      matk: Math.round(1.5 * jMul),
      sell: sellFor(tier.level, tier.rarity, "bracelet"),
      icon: "💍",
      sprite: tierIndex >= 3 ? "/icons/items/jade_bracelet.svg" : "/icons/items/copper_bracelet.svg",
      setId: `jewel_${tier.key}`,
      setName: `${jPrefix} Trinkets`,
    };
    const necklace = {
      id: `jewel_${tier.key}_necklace`,
      name: `${jPrefix} Necklace`,
      slot: "necklace",
      rarity: tier.rarity,
      levelReq: tier.level,
      vit: Math.max(1, Math.round(0.9 * jMul)),
      str: Math.max(0, Math.round(0.4 * jMul)),
      intel: Math.max(0, Math.round(0.4 * jMul)),
      sell: sellFor(tier.level, tier.rarity, "necklace"),
      icon: "📿",
      sprite: tierIndex >= 4 ? "/icons/items/soul_amulet.svg" : "/icons/items/bone_necklace.svg",
      setId: `jewel_${tier.key}`,
      setName: `${jPrefix} Trinkets`,
    };
    const earring = {
      id: `jewel_${tier.key}_earring`,
      name: `${jPrefix} Earring`,
      slot: "earring",
      rarity: tier.rarity,
      levelReq: tier.level,
      matk: Math.round(2.2 * jMul),
      intel: Math.max(0, Math.round(0.5 * jMul)),
      dex: Math.max(0, Math.round(0.3 * jMul)),
      sell: sellFor(tier.level, tier.rarity, "earring"),
      icon: "👂",
      sprite: tierIndex >= 2 ? "/icons/items/gold_earring.svg" : "/icons/items/copper_earring.svg",
      setId: `jewel_${tier.key}`,
      setName: `${jPrefix} Trinkets`,
    };
    out[bracelet.id] = bracelet;
    out[necklace.id] = necklace;
    out[earring.id] = earring;
    setIndex.push({
      setId: `jewel_${tier.key}`,
      setName: `${jPrefix} Trinkets`,
      level: tier.level,
      line: "jewel",
      classes: ["warrior", "ninja", "sura", "shaman"],
      pieces: [bracelet.id, necklace.id, earring.id],
    });
  });

  return { items: out, sets: setIndex };
}

const built = buildGearSetItems();
export const GEAR_SET_ITEMS = built.items;
export const GEAR_SET_INDEX = built.sets;

/** 2+ pieces of same set → small bonus (applied in InventoryService.equipBonuses) */
export const SET_BONUSES = {
  2: { def: 2, atk: 1 },
  3: { def: 4, atk: 3, vit: 1 },
  4: { def: 7, atk: 5, vit: 2, dex: 1 },
  5: { def: 10, atk: 8, vit: 3, str: 1, intel: 1 },
};

export function setBonusForCount(n) {
  if (n >= 5) return { ...SET_BONUSES[5] };
  if (n >= 4) return { ...SET_BONUSES[4] };
  if (n >= 3) return { ...SET_BONUSES[3] };
  if (n >= 2) return { ...SET_BONUSES[2] };
  return {};
}
