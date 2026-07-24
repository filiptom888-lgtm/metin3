import { DROP_TABLES } from "../data/drops.js";
import { ItemService } from "./ItemService.js";

export const DropService = {
  roll(tableId, luck = 1) {
    const table = DROP_TABLES[tableId] || DROP_TABLES.wolf;
    const out = [];
    for (const row of table) {
      if (Math.random() > row.chance * luck) continue;
      const qty = row.qty ? row.qty[0] + ((Math.random() * (row.qty[1] - row.qty[0] + 1)) | 0) : 1;
      const inst = ItemService.createInstance(row.id, { qty });
      if (inst) out.push(inst);
    }
    return out;
  },
  yangFor(kind, tier = 1) {
    if (kind === "metin") return 400 + tier * 200 + ((Math.random() * 200) | 0);
    if (kind === "ork" || kind === "elite") return 100 + ((Math.random() * 120) | 0);
    return 40 + ((Math.random() * 80) | 0);
  },
  xpFor(kind, tier = 1) {
    if (kind === "metin") return 100 + tier * 35;
    if (kind === "ork") return 40;
    return 22;
  },
};
