/**
 * One of each service NPC — placed on open plaza roads (not inside houses).
 * Camera faces +Z roughly; east = +X (right of fountain).
 */
export const NPCS = [
  { id: "quest_elder", name: "Village Elder", role: "quest", kingdom: 0, mapId: "overworld", x: 0, z: 2 },
  { id: "shop", name: "General Goods", role: "shop", kingdom: 0, mapId: "overworld", x: -5.5, z: 0 },
  { id: "smith", name: "Blacksmith", role: "blacksmith", kingdom: 0, mapId: "overworld", x: 5.5, z: 0 },
  { id: "tele", name: "Teleporter", role: "teleport", kingdom: 0, mapId: "overworld", x: 0, z: 9 },
  // Skill path trainer — choose Body/Mental etc. at Lv.5
  { id: "skill_master", name: "Skill Master", role: "skillmaster", kingdom: 0, mapId: "overworld", x: -3.5, z: -5.5 },
  // Metin2-style biologist camp — small tent just outside the north gate
  { id: "biologist", name: "Biologist", role: "biologist", kingdom: 0, mapId: "overworld", x: 5.5, z: 26.5 },
  // Orc Isles — war-tower teleporter (full world warp list)
  {
    id: "orc_tele",
    name: "Isle Gatekeeper",
    role: "teleport",
    kingdom: 0,
    mapId: "orc_valley",
    x: 0,
    z: 14,
  },
  // Yongbi Desert oasis — shop + teleporter in SE town
  {
    id: "desert_shop",
    name: "Oasis Trader",
    role: "shop",
    kingdom: 0,
    mapId: "desert",
    x: 43.5,
    z: 51,
  },
  {
    id: "desert_tele",
    name: "Desert Gatekeeper",
    role: "teleport",
    kingdom: 0,
    mapId: "desert",
    x: 48,
    z: 57.5,
  },
];

/** Shop stock grouped for UI tabs */
export const SHOP_CATALOG = [
  { id: "red_potion", price: 50, tab: "potions" },
  { id: "blue_potion", price: 50, tab: "potions" },
  { id: "orange_potion", price: 200, tab: "potions" },
  { id: "green_potion", price: 280, tab: "potions" },
  { id: "meat", price: 25, tab: "potions" },
  { id: "upgrade_ore", price: 300, tab: "materials" },
  { id: "crystal_shard", price: 900, tab: "materials" },
  { id: "wolf_pelt", price: 40, tab: "materials" },
  { id: "orc_tooth", price: 90, tab: "materials" },
  { id: "fairy_dust", price: 220, tab: "materials" },
  { id: "magic_scroll", price: 650, tab: "materials" },
  // Starters
  { id: "rusty_sword", price: 400, tab: "gear" },
  { id: "starter_daggers", price: 400, tab: "gear" },
  { id: "starter_staff", price: 400, tab: "gear" },
  { id: "wood_shield", price: 350, tab: "gear" },
  // Lv.5 Recruit / Scout / Acolyte sets
  { id: "plate_t05_weapon", price: 900, tab: "gear" },
  { id: "plate_t05_armor", price: 850, tab: "gear" },
  { id: "plate_t05_helmet", price: 500, tab: "gear" },
  { id: "plate_t05_shoes", price: 450, tab: "gear" },
  { id: "plate_t05_shield", price: 550, tab: "gear" },
  { id: "leather_t05_weapon", price: 900, tab: "gear" },
  { id: "leather_t05_armor", price: 800, tab: "gear" },
  { id: "leather_t05_helmet", price: 480, tab: "gear" },
  { id: "leather_t05_shoes", price: 450, tab: "gear" },
  { id: "cloth_t05_weapon", price: 900, tab: "gear" },
  { id: "cloth_t05_armor", price: 800, tab: "gear" },
  { id: "cloth_t05_helmet", price: 480, tab: "gear" },
  { id: "cloth_t05_shoes", price: 450, tab: "gear" },
  { id: "cloth_t05_shield", price: 520, tab: "gear" },
  // Lv.15 Soldier / Stalker / Adept
  { id: "plate_t15_weapon", price: 2800, tab: "gear" },
  { id: "plate_t15_armor", price: 2600, tab: "gear" },
  { id: "leather_t15_weapon", price: 2800, tab: "gear" },
  { id: "leather_t15_armor", price: 2500, tab: "gear" },
  { id: "cloth_t15_weapon", price: 2800, tab: "gear" },
  { id: "cloth_t15_armor", price: 2500, tab: "gear" },
  { id: "jewel_t05_bracelet", price: 350, tab: "gear" },
  { id: "jewel_t05_necklace", price: 350, tab: "gear" },
  { id: "jewel_t05_earring", price: 350, tab: "gear" },
  { id: "copper_bracelet", price: 200, tab: "gear" },
  { id: "copper_earring", price: 180, tab: "gear" },
];

export const SHOP_TABS = [
  { id: "potions", label: "Potions" },
  { id: "materials", label: "Materials" },
  { id: "gear", label: "Gear" },
  { id: "sell", label: "Sell" },
];
