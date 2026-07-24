/** Re-export inventory helpers via InventoryService */
import { InventoryService } from "../services/InventoryService.js";
import { EQUIP_SLOTS as SLOTS, ITEM_TEMPLATES } from "../data/items.js";

export function findInvIndex(inv, uid) {
  return inv.findIndex((x) => x.uid === uid);
}

export function addToInventory(inv, itemId, qty = 1) {
  const ch = { inventory: inv };
  InventoryService.add(ch, itemId, qty);
  return inv;
}

export function removeFromInventory(inv, uid, qty = 1) {
  const ch = { inventory: inv };
  return InventoryService.remove(ch, uid, qty);
}

export function equipFromInventory(ch, uid) {
  return InventoryService.equip(ch, uid);
}

export function unequipSlot(ch, slot) {
  return InventoryService.unequip(ch, slot);
}

export function useConsumable(ch, uid, local) {
  return InventoryService.useConsumable(ch, uid, local);
}

export function getItem(itemId) {
  return ITEM_TEMPLATES[itemId] || null;
}

export { SLOTS };
