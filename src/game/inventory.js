import { getItem, makeInstance, SLOTS } from "./items.js";

export function findInvIndex(inv, uid) {
  return inv.findIndex((x) => x.uid === uid);
}

export function addToInventory(inv, itemId, qty = 1) {
  const def = getItem(itemId);
  if (!def) return inv;
  if (def.slot === "consumable") {
    const existing = inv.find((x) => x.itemId === itemId);
    if (existing) {
      existing.qty += qty;
      return inv;
    }
  }
  inv.push(makeInstance(def, qty));
  return inv;
}

export function removeFromInventory(inv, uid, qty = 1) {
  const i = findInvIndex(inv, uid);
  if (i < 0) return null;
  const stack = inv[i];
  const removed = { ...stack, qty };
  stack.qty -= qty;
  if (stack.qty <= 0) inv.splice(i, 1);
  return removed;
}

export function equipFromInventory(ch, uid) {
  const stack = ch.inventory.find((x) => x.uid === uid);
  if (!stack) return "Item not found";
  const def = getItem(stack.itemId);
  if (!def || def.slot === "consumable") return "Cannot equip";
  const slot = def.slot;
  // unequip existing back to bag
  const prev = ch.equipment[slot];
  if (prev) {
    const prevId = typeof prev === "string" ? prev : prev.itemId;
    addToInventory(ch.inventory, prevId, 1);
  }
  ch.equipment[slot] = { itemId: stack.itemId, uid: stack.uid };
  removeFromInventory(ch.inventory, uid, 1);
  return null;
}

export function unequipSlot(ch, slot) {
  const prev = ch.equipment[slot];
  if (!prev) return "Empty";
  const itemId = typeof prev === "string" ? prev : prev.itemId;
  addToInventory(ch.inventory, itemId, 1);
  delete ch.equipment[slot];
  return null;
}

export function useConsumable(ch, uid, local) {
  const stack = ch.inventory.find((x) => x.uid === uid);
  if (!stack) return "Missing";
  const def = getItem(stack.itemId);
  if (!def || def.slot !== "consumable") return "Not usable";
  if (def.heal) local.hp = Math.min(local.maxHp, local.hp + def.heal);
  if (def.mana) local.sp = Math.min(local.maxSp, local.sp + def.mana);
  removeFromInventory(ch.inventory, uid, 1);
  return null;
}

export { SLOTS, getItem };
