import { ItemService } from "./ItemService.js";
import { ITEM_TEMPLATES } from "../data/items.js";
import { setBonusForCount } from "../data/gearSets.js";

export const InventoryService = {
  add(ch, templateId, qty = 1) {
    const t = ITEM_TEMPLATES[templateId];
    if (!t) return false;
    if (t.stackable) {
      const existing = ch.inventory.find((x) => x.itemId === templateId && !x.upgrade);
      if (existing) {
        existing.qty += qty;
        return true;
      }
    }
    const inst = ItemService.createInstance(templateId, { qty });
    if (!inst) return false;
    ch.inventory.push(inst);
    return true;
  },
  remove(ch, uid, qty = 1) {
    const i = ch.inventory.findIndex((x) => x.uid === uid);
    if (i < 0) return null;
    const stack = ch.inventory[i];
    const out = { ...stack, qty };
    stack.qty -= qty;
    if (stack.qty <= 0) ch.inventory.splice(i, 1);
    return out;
  },
  equip(ch, uid) {
    const stack = ch.inventory.find((x) => x.uid === uid);
    if (!stack) return "Missing item";
    const err = ItemService.canEquip(stack, ch);
    if (err) return err;
    const t = ITEM_TEMPLATES[stack.itemId];
    const prev = ch.equipment[t.slot];
    if (prev) {
      ch.inventory.push(typeof prev === "object" ? prev : ItemService.createInstance(prev));
    }
    ch.equipment[t.slot] = { ...stack, qty: 1 };
    this.remove(ch, uid, 1);
    return null;
  },
  unequip(ch, slot) {
    const prev = ch.equipment[slot];
    if (!prev) return "Empty";
    ch.inventory.push(typeof prev === "object" ? prev : ItemService.createInstance(prev));
    delete ch.equipment[slot];
    return null;
  },
  useConsumable(ch, uid, local) {
    const stack = ch.inventory.find((x) => x.uid === uid);
    if (!stack) return "Missing";
    const t = ITEM_TEMPLATES[stack.itemId];
    if (!t || t.slot !== "consumable") return "Not usable";
    // Skill books are applied from the Skills panel (Esc → Skills)
    if (t.skillBook) {
      return { skillBook: true, uid, itemId: stack.itemId, grand: !!t.grandMaster };
    }
    if (t.heal) local.hp = Math.min(local.maxHp, local.hp + t.heal);
    if (t.mana) local.sp = Math.min(local.maxSp, local.sp + t.mana);
    this.remove(ch, uid, 1);
    return null;
  },
  equipBonuses(ch) {
    const b = { atk: 0, matk: 0, def: 0, mdef: 0, str: 0, vit: 0, intel: 0, dex: 0, mspd: 0 };
    const setCounts = Object.create(null);
    for (const ref of Object.values(ch.equipment || {})) {
      if (!ref) continue;
      const id = ref.itemId || ref;
      const t = ITEM_TEMPLATES[id];
      if (!t) continue;
      const up = (ref.upgrade || 0) * 3;
      b.atk += (t.atk || 0) + up;
      b.matk += t.matk || 0;
      b.def += (t.def || 0) + Math.floor(up / 2);
      b.mdef += t.mdef || 0;
      b.str += t.str || 0;
      b.vit += t.vit || 0;
      b.intel += t.intel || 0;
      b.dex += t.dex || 0;
      if (t.mspd) b.mspd += t.mspd;
      for (const bon of ref.bonuses || []) {
        if (b[bon.stat] != null) b[bon.stat] += bon.value;
        else if (bon.stat === "maxHp") b.vit += Math.floor(bon.value / 18);
      }
      if (t.setId) setCounts[t.setId] = (setCounts[t.setId] || 0) + 1;
    }
    // Best matching set bonus (2+ pieces)
    let best = {};
    for (const n of Object.values(setCounts)) {
      const bonus = setBonusForCount(n);
      if ((bonus.atk || 0) + (bonus.def || 0) > (best.atk || 0) + (best.def || 0)) best = bonus;
    }
    for (const [k, v] of Object.entries(best)) {
      if (b[k] != null) b[k] += v;
    }
    return b;
  },
};
