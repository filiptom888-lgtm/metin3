import { UPGRADE_TABLE } from "../data/upgrades.js";
import { ITEM_TEMPLATES } from "../data/items.js";

export const UpgradeService = {
  /** Local resolve; prefer Edge Function when deployed */
  tryUpgrade(ch, uid) {
    const inst = ch.inventory.find((x) => x.uid === uid) || Object.values(ch.equipment).find((x) => x?.uid === uid);
    if (!inst) return { ok: false, msg: "Item not found" };
    const t = ITEM_TEMPLATES[inst.itemId];
    if (!t || t.slot === "consumable") return { ok: false, msg: "Cannot upgrade" };
    const level = inst.upgrade || 0;
    if (level >= 9) return { ok: false, msg: "Already +9" };
    const recipe = UPGRADE_TABLE[level];
    if (ch.gold < recipe.yang) return { ok: false, msg: "Not enough Yang" };
    ch.gold -= recipe.yang;
    const roll = Math.random();
    if (roll <= recipe.chance) {
      inst.upgrade = level + 1;
      return { ok: true, msg: `Success! Now +${inst.upgrade}`, upgrade: inst.upgrade };
    }
    if (recipe.destroyOnFail && roll > recipe.chance + 0.35) {
      // destroy from inventory
      ch.inventory = ch.inventory.filter((x) => x.uid !== uid);
      for (const slot of Object.keys(ch.equipment)) {
        if (ch.equipment[slot]?.uid === uid) delete ch.equipment[slot];
      }
      return { ok: false, msg: "Upgrade failed — item destroyed!", destroyed: true };
    }
    if (recipe.downgrade && level > 0) {
      inst.upgrade = level - 1;
      return { ok: false, msg: `Failed — downgraded to +${inst.upgrade}`, upgrade: inst.upgrade };
    }
    return { ok: false, msg: "Upgrade failed", upgrade: level };
  },

  async tryUpgradeRemote(supabase, payload) {
    if (!supabase) return this.tryUpgrade(payload.ch, payload.uid);
    try {
      const { data, error } = await supabase.functions.invoke("upgrade-item", { body: payload });
      if (error || !data) return this.tryUpgrade(payload.ch, payload.uid);
      return data;
    } catch {
      return this.tryUpgrade(payload.ch, payload.uid);
    }
  },
};
