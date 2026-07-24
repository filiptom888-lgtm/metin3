import { NPCS, SHOP_CATALOG } from "../data/npcs.js";
import { InventoryService } from "./InventoryService.js";
import { ITEM_TEMPLATES } from "../data/items.js";
import { UpgradeService } from "./UpgradeService.js";

export const NpcService = {
  list: NPCS,
  near(x, z, maxDist = 4) {
    return NPCS.filter((n) => Math.hypot(n.x - x, n.z - z) <= maxDist);
  },
  buy(ch, itemId) {
    const offer = SHOP_CATALOG.find((o) => o.id === itemId);
    if (!offer) return "Not sold here";
    if (ch.gold < offer.price) return "Not enough Yang";
    ch.gold -= offer.price;
    InventoryService.add(ch, itemId, 1);
    return null;
  },
  sell(ch, uid) {
    const stack = ch.inventory.find((x) => x.uid === uid);
    if (!stack) return "Missing";
    const t = ITEM_TEMPLATES[stack.itemId];
    if (!t) return "Invalid";
    const price = Math.floor((t.sell || 10) * (1 + (stack.upgrade || 0) * 0.15));
    InventoryService.remove(ch, uid, 1);
    ch.gold += price;
    return null;
  },
  upgrade(ch, uid) {
    return UpgradeService.tryUpgrade(ch, uid);
  },
};
