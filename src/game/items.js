/** Item definitions + drop tables (Metin-style gear) */

export const SLOTS = ["weapon", "armor", "helmet", "shoes", "bracelet", "necklace"];

export const ITEMS = {
  // Weapons
  rusty_sword: { id: "rusty_sword", name: "Rusty Sword", slot: "weapon", rarity: "common", atk: 4, str: 1, icon: "⚔", sell: 40 },
  iron_blade: { id: "iron_blade", name: "Iron Blade", slot: "weapon", rarity: "uncommon", atk: 10, str: 2, icon: "⚔", sell: 180 },
  tiger_fang: { id: "tiger_fang", name: "Tiger Fang", slot: "weapon", rarity: "rare", atk: 18, str: 3, dex: 2, icon: "⚔", sell: 600 },
  dragon_edge: { id: "dragon_edge", name: "Dragon Edge", slot: "weapon", rarity: "epic", atk: 28, str: 5, vit: 2, icon: "⚔", sell: 2000 },
  spirit_staff: { id: "spirit_staff", name: "Spirit Staff", slot: "weapon", rarity: "rare", atk: 12, intel: 5, icon: "🔱", sell: 700 },
  shadow_daggers: { id: "shadow_daggers", name: "Shadow Daggers", slot: "weapon", rarity: "rare", atk: 14, dex: 5, icon: "🗡", sell: 650 },

  // Armor
  cloth_vest: { id: "cloth_vest", name: "Cloth Vest", slot: "armor", rarity: "common", def: 3, vit: 1, icon: "🛡", sell: 35 },
  leather_armor: { id: "leather_armor", name: "Leather Armor", slot: "armor", rarity: "uncommon", def: 8, vit: 2, dex: 1, icon: "🛡", sell: 160 },
  plate_mail: { id: "plate_mail", name: "Plate Mail", slot: "armor", rarity: "rare", def: 16, vit: 4, str: 1, icon: "🛡", sell: 550 },
  mystic_robe: { id: "mystic_robe", name: "Mystic Robe", slot: "armor", rarity: "rare", def: 10, intel: 4, vit: 2, icon: "🥋", sell: 520 },

  // Helmet
  leather_cap: { id: "leather_cap", name: "Leather Cap", slot: "helmet", rarity: "common", def: 2, icon: "⛑", sell: 25 },
  iron_helm: { id: "iron_helm", name: "Iron Helm", slot: "helmet", rarity: "uncommon", def: 6, vit: 1, icon: "⛑", sell: 120 },
  war_crown: { id: "war_crown", name: "War Crown", slot: "helmet", rarity: "rare", def: 11, str: 2, vit: 2, icon: "👑", sell: 480 },

  // Shoes
  cloth_boots: { id: "cloth_boots", name: "Cloth Boots", slot: "shoes", rarity: "common", def: 1, dex: 1, icon: "👢", sell: 20 },
  hunter_boots: { id: "hunter_boots", name: "Hunter Boots", slot: "shoes", rarity: "uncommon", def: 4, dex: 3, icon: "👢", sell: 140 },
  wind_greaves: { id: "wind_greaves", name: "Wind Greaves", slot: "shoes", rarity: "rare", def: 7, dex: 5, icon: "👢", sell: 450 },

  // Accessories
  copper_bracelet: { id: "copper_bracelet", name: "Copper Bracelet", slot: "bracelet", rarity: "common", atk: 2, icon: "💍", sell: 30 },
  jade_bracelet: { id: "jade_bracelet", name: "Jade Bracelet", slot: "bracelet", rarity: "rare", atk: 6, intel: 2, icon: "💍", sell: 400 },
  bone_necklace: { id: "bone_necklace", name: "Bone Necklace", slot: "necklace", rarity: "uncommon", vit: 2, str: 1, icon: "📿", sell: 150 },
  soul_amulet: { id: "soul_amulet", name: "Soul Amulet", slot: "necklace", rarity: "epic", vit: 4, intel: 3, atk: 4, icon: "📿", sell: 1800 },

  // Consumables
  red_potion: { id: "red_potion", name: "Red Potion", slot: "consumable", rarity: "common", heal: 80, icon: "🧪", sell: 15 },
  blue_potion: { id: "blue_potion", name: "Blue Potion", slot: "consumable", rarity: "common", mana: 50, icon: "🧪", sell: 15 },
  orange_potion: { id: "orange_potion", name: "Orange Potion", slot: "consumable", rarity: "uncommon", heal: 200, icon: "🧪", sell: 60 },
};

const WOLF_DROPS = [
  { id: "red_potion", chance: 0.35, qty: [1, 2] },
  { id: "blue_potion", chance: 0.2, qty: [1, 1] },
  { id: "cloth_vest", chance: 0.08 },
  { id: "rusty_sword", chance: 0.06 },
  { id: "leather_cap", chance: 0.07 },
  { id: "cloth_boots", chance: 0.07 },
  { id: "copper_bracelet", chance: 0.05 },
];

const ORK_DROPS = [
  { id: "red_potion", chance: 0.4, qty: [1, 3] },
  { id: "orange_potion", chance: 0.12 },
  { id: "leather_armor", chance: 0.1 },
  { id: "iron_blade", chance: 0.08 },
  { id: "iron_helm", chance: 0.08 },
  { id: "hunter_boots", chance: 0.07 },
  { id: "bone_necklace", chance: 0.06 },
];

const METIN_DROPS = [
  { id: "orange_potion", chance: 0.5, qty: [1, 3] },
  { id: "plate_mail", chance: 0.12 },
  { id: "tiger_fang", chance: 0.1 },
  { id: "war_crown", chance: 0.1 },
  { id: "wind_greaves", chance: 0.1 },
  { id: "jade_bracelet", chance: 0.1 },
  { id: "spirit_staff", chance: 0.08 },
  { id: "shadow_daggers", chance: 0.08 },
  { id: "mystic_robe", chance: 0.08 },
  { id: "dragon_edge", chance: 0.03 },
  { id: "soul_amulet", chance: 0.025 },
];

export function rollDrops(kind, tier = 1) {
  const table = kind === "metin" ? METIN_DROPS : kind === "ork" ? ORK_DROPS : WOLF_DROPS;
  const out = [];
  const boost = kind === "metin" ? 1 + tier * 0.08 : 1;
  for (const row of table) {
    if (Math.random() > row.chance * boost) continue;
    const def = ITEMS[row.id];
    if (!def) continue;
    const qty = row.qty ? randInt(row.qty[0], row.qty[1]) : 1;
    out.push(makeInstance(def, qty));
  }
  // always some yang on ground represented as gold pickup separately
  return out;
}

export function makeInstance(def, qty = 1) {
  return {
    uid: `it_${Math.random().toString(36).slice(2, 10)}`,
    itemId: def.id,
    qty,
  };
}

export function getItem(itemId) {
  return ITEMS[itemId] || null;
}

function randInt(a, b) {
  return a + ((Math.random() * (b - a + 1)) | 0);
}

export const RARITY_COLOR = {
  common: "#c8c8c8",
  uncommon: "#4ecf8a",
  rare: "#4aa3ff",
  epic: "#c45cff",
};
