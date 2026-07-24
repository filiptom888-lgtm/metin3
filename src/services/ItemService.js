import { ITEM_TEMPLATES, RARITY_COLOR } from "../data/items.js";
import { rollBonuses } from "../data/bonuses.js";

export const ItemService = {
  RARITY_COLOR,
  getTemplate(id) {
    return ITEM_TEMPLATES[id] || null;
  },
  createInstance(templateId, { upgrade = 0, qty = 1 } = {}) {
    const t = ITEM_TEMPLATES[templateId];
    if (!t) return null;
    return {
      uid: `ii_${Math.random().toString(36).slice(2, 11)}`,
      itemId: templateId,
      qty: t.stackable ? qty : 1,
      upgrade: upgrade,
      bonuses: t.slot === "consumable" ? [] : rollBonuses(t.rarity),
      sockets: [],
      bound: false,
    };
  },
  displayName(inst) {
    const t = ITEM_TEMPLATES[inst.itemId];
    if (!t) return "?";
    const up = inst.upgrade > 0 ? ` +${inst.upgrade}` : "";
    return `${t.name}${up}`;
  },
  canEquip(inst, ch) {
    const t = ITEM_TEMPLATES[inst.itemId];
    if (!t || t.slot === "consumable") return "Cannot equip";
    if (t.levelReq && ch.level < t.levelReq) return `Requires Lv.${t.levelReq}`;
    if (t.classReq && t.classReq.length && !t.classReq.includes(ch.classId)) return "Wrong class";
    return null;
  },
  upgradeBonusAtk(inst) {
    return (inst.upgrade || 0) * 3;
  },
};
