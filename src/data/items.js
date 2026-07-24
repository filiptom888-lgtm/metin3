export const RARITY_COLOR = {
  common: "#c8c8c8",
  uncommon: "#4ecf8a",
  rare: "#4aa3ff",
  epic: "#c45cff",
};

export const EQUIP_SLOTS = ["weapon", "armor", "helmet", "shoes", "bracelet", "necklace", "shield", "earring"];

export const ITEM_TEMPLATES = {
  rusty_sword: { id: "rusty_sword", name: "Rusty Sword", slot: "weapon", rarity: "common", atk: 5, str: 1, sell: 40, levelReq: 1, classReq: ["warrior", "sura"], icon: "⚔" },
  iron_blade: { id: "iron_blade", name: "Iron Blade", slot: "weapon", rarity: "uncommon", atk: 12, str: 2, sell: 180, levelReq: 10, classReq: ["warrior", "sura"], icon: "⚔" },
  tiger_fang: { id: "tiger_fang", name: "Tiger Fang", slot: "weapon", rarity: "rare", atk: 20, str: 3, dex: 2, sell: 600, levelReq: 25, classReq: ["warrior", "ninja", "sura"], icon: "⚔" },
  dragon_edge: { id: "dragon_edge", name: "Dragon Edge", slot: "weapon", rarity: "epic", atk: 32, str: 5, vit: 2, sell: 2200, levelReq: 45, classReq: ["warrior"], icon: "⚔" },
  spirit_staff: { id: "spirit_staff", name: "Spirit Staff", slot: "weapon", rarity: "rare", atk: 8, matk: 18, intel: 5, sell: 700, levelReq: 15, classReq: ["shaman"], icon: "🔱" },
  shadow_daggers: { id: "shadow_daggers", name: "Shadow Daggers", slot: "weapon", rarity: "rare", atk: 16, dex: 5, sell: 650, levelReq: 15, classReq: ["ninja"], icon: "🗡" },
  longbow: { id: "longbow", name: "Longbow", slot: "weapon", rarity: "uncommon", atk: 11, dex: 3, sell: 200, levelReq: 12, classReq: ["ninja"], icon: "🏹" },

  cloth_vest: { id: "cloth_vest", name: "Cloth Vest", slot: "armor", rarity: "common", def: 4, vit: 1, sell: 35, icon: "🛡" },
  leather_armor: { id: "leather_armor", name: "Leather Armor", slot: "armor", rarity: "uncommon", def: 10, vit: 2, dex: 1, sell: 160, levelReq: 8, icon: "🛡" },
  plate_mail: { id: "plate_mail", name: "Plate Mail", slot: "armor", rarity: "rare", def: 18, vit: 4, str: 1, sell: 550, levelReq: 28, classReq: ["warrior", "sura"], icon: "🛡" },
  mystic_robe: { id: "mystic_robe", name: "Mystic Robe", slot: "armor", rarity: "rare", def: 11, mdef: 8, intel: 4, sell: 520, levelReq: 20, classReq: ["shaman"], icon: "🥋" },

  leather_cap: { id: "leather_cap", name: "Leather Cap", slot: "helmet", rarity: "common", def: 2, sell: 25, icon: "⛑" },
  iron_helm: { id: "iron_helm", name: "Iron Helm", slot: "helmet", rarity: "uncommon", def: 7, vit: 1, sell: 120, levelReq: 10, icon: "⛑" },
  war_crown: { id: "war_crown", name: "War Crown", slot: "helmet", rarity: "rare", def: 12, str: 2, vit: 2, sell: 480, levelReq: 30, icon: "👑" },

  cloth_boots: { id: "cloth_boots", name: "Cloth Boots", slot: "shoes", rarity: "common", def: 1, dex: 1, sell: 20, icon: "👢" },
  hunter_boots: { id: "hunter_boots", name: "Hunter Boots", slot: "shoes", rarity: "uncommon", def: 4, dex: 3, sell: 140, levelReq: 10, icon: "👢" },
  wind_greaves: { id: "wind_greaves", name: "Wind Greaves", slot: "shoes", rarity: "rare", def: 8, dex: 5, mspd: 0.4, sell: 450, levelReq: 28, icon: "👢" },

  wood_shield: { id: "wood_shield", name: "Wood Shield", slot: "shield", rarity: "common", def: 5, sell: 50, classReq: ["warrior", "sura", "shaman"], icon: "🛡" },
  copper_bracelet: { id: "copper_bracelet", name: "Copper Bracelet", slot: "bracelet", rarity: "common", atk: 2, sell: 30, icon: "💍" },
  jade_bracelet: { id: "jade_bracelet", name: "Jade Bracelet", slot: "bracelet", rarity: "rare", atk: 6, intel: 2, sell: 400, levelReq: 22, icon: "💍" },
  bone_necklace: { id: "bone_necklace", name: "Bone Necklace", slot: "necklace", rarity: "uncommon", vit: 2, str: 1, sell: 150, icon: "📿" },
  soul_amulet: { id: "soul_amulet", name: "Soul Amulet", slot: "necklace", rarity: "epic", vit: 4, intel: 3, atk: 4, sell: 1800, levelReq: 40, icon: "📿" },
  copper_earring: { id: "copper_earring", name: "Copper Earring", slot: "earring", rarity: "common", matk: 2, sell: 28, icon: "👂" },

  red_potion: { id: "red_potion", name: "Red Potion", slot: "consumable", rarity: "common", heal: 90, sell: 15, stackable: true, icon: "🧪" },
  blue_potion: { id: "blue_potion", name: "Blue Potion", slot: "consumable", rarity: "common", mana: 55, sell: 15, stackable: true, icon: "🧪" },
  orange_potion: { id: "orange_potion", name: "Orange Potion", slot: "consumable", rarity: "uncommon", heal: 220, sell: 60, stackable: true, icon: "🧪" },
  upgrade_ore: { id: "upgrade_ore", name: "Upgrade Ore", slot: "consumable", rarity: "uncommon", sell: 80, stackable: true, icon: "⛏" },
};

// alias used by older code paths
export const ITEMS = ITEM_TEMPLATES;
