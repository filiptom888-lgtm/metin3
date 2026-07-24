/**
 * One of each service NPC — placed on open plaza roads (not inside houses).
 * Camera faces +Z roughly; east = +X (right of fountain).
 */
export const NPCS = [
  { id: "quest_elder", name: "Village Elder", role: "quest", kingdom: 0, x: 0, z: 2 },
  { id: "shop", name: "General Goods", role: "shop", kingdom: 0, x: -5.5, z: 0 },
  { id: "smith", name: "Blacksmith", role: "blacksmith", kingdom: 0, x: 5.5, z: 0 },
  { id: "tele", name: "Teleporter", role: "teleport", kingdom: 0, x: 0, z: 9 },
];

/** Shop stock grouped for UI tabs */
export const SHOP_CATALOG = [
  { id: "red_potion", price: 50, tab: "potions" },
  { id: "blue_potion", price: 50, tab: "potions" },
  { id: "orange_potion", price: 200, tab: "potions" },
  { id: "upgrade_ore", price: 300, tab: "materials" },
  { id: "rusty_sword", price: 400, tab: "gear" },
  { id: "cloth_vest", price: 250, tab: "gear" },
  { id: "cloth_boots", price: 180, tab: "gear" },
  { id: "wood_shield", price: 350, tab: "gear" },
];

export const SHOP_TABS = [
  { id: "potions", label: "Potions" },
  { id: "materials", label: "Materials" },
  { id: "gear", label: "Gear" },
  { id: "sell", label: "Sell" },
];
