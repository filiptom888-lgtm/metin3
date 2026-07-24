/** Thin re-export — templates live in src/data */
export {
  ITEM_TEMPLATES as ITEMS,
  EQUIP_SLOTS as SLOTS,
  RARITY_COLOR,
} from "../data/items.js";
export { DropService } from "../services/DropService.js";
export { ItemService } from "../services/ItemService.js";

import { ITEM_TEMPLATES } from "../data/items.js";
import { DropService } from "../services/DropService.js";
import { ItemService } from "../services/ItemService.js";

export function getItem(itemId) {
  return ITEM_TEMPLATES[itemId] || null;
}

export function rollDrops(kind, tier = 1) {
  const tableId = kind === "metin" ? "metin" : kind === "ork" || kind === "elite_ork" ? "ork" : "wolf";
  return DropService.roll(tableId, kind === "metin" ? 1 + tier * 0.08 : 1);
}

export function makeInstance(def, qty = 1) {
  const id = typeof def === "string" ? def : def.id;
  return ItemService.createInstance(id, { qty });
}
