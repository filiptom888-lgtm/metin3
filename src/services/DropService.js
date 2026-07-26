import { DROP_TABLES, resolveDropTable } from "../data/drops.js";
import { MONSTERS } from "../data/monsters.js";
import { ItemService } from "./ItemService.js";

/**
 * Global floor-loot scarcity.
 * 1/12 keeps gear rare but mats/pots drop often enough to feel rewarding.
 */
export const DROP_RATE_MUL = 1 / 12;

function rollRows(table, mul) {
  const out = [];
  for (const row of table) {
    if (Math.random() > row.chance * mul) continue;
    const qty = row.qty
      ? row.qty[0] + ((Math.random() * (row.qty[1] - row.qty[0] + 1)) | 0)
      : 1;
    const inst = ItemService.createInstance(row.id, { qty });
    if (inst) out.push(inst);
  }
  return out;
}

export const DropService = {
  /** Floor loot — applies global scarcity + luck */
  roll(tableId, luck = 1) {
    const key = resolveDropTable(tableId);
    const table = DROP_TABLES[key] || DROP_TABLES.wolf;
    return rollRows(table, DROP_RATE_MUL * Math.max(0.2, luck));
  },

  /**
   * Quest / event loot — no global scarcity mul.
   * Pass DROP_TABLES rows or { id, chance, qty }.
   */
  rollEntries(entries, luck = 1) {
    if (!entries?.length) return [];
    return rollRows(entries, Math.max(0.2, luck));
  },

  /** Yang from monster template or kind string */
  yangFor(kindOrTmpl, tier = 1) {
    const tmpl =
      typeof kindOrTmpl === "object" && kindOrTmpl
        ? kindOrTmpl
        : MONSTERS[kindOrTmpl] || null;
    if (tmpl?.yang != null) {
      const base = tmpl.yang;
      return Math.max(1, Math.floor(base * (0.85 + Math.random() * 0.35)));
    }
    const kind = typeof kindOrTmpl === "string" ? kindOrTmpl : "wolf";
    if (kind === "metin") return 400 + tier * 200 + ((Math.random() * 200) | 0);
    if (kind === "orc_chief") return 420 + ((Math.random() * 160) | 0);
    if (kind === "black_ork_brute" || kind === "elite_ork") return 240 + ((Math.random() * 120) | 0);
    if (kind === "black_ork") return 150 + ((Math.random() * 90) | 0);
    if (kind === "ork" || kind === "soldier") return 100 + ((Math.random() * 120) | 0);
    if (kind === "bandit" || kind === "human") return 70 + ((Math.random() * 90) | 0);
    if (kind === "alpha_wolf") return 55 + ((Math.random() * 70) | 0);
    if (kind === "dog") return 18 + ((Math.random() * 30) | 0);
    return 40 + ((Math.random() * 80) | 0);
  },

  /** XP from monster template or kind string */
  xpFor(kindOrTmpl, tier = 1) {
    const tmpl =
      typeof kindOrTmpl === "object" && kindOrTmpl
        ? kindOrTmpl
        : MONSTERS[kindOrTmpl] || null;
    if (tmpl?.exp != null) return tmpl.exp;
    const kind = typeof kindOrTmpl === "string" ? kindOrTmpl : "wolf";
    if (kind === "metin") return 100 + tier * 35;
    if (kind === "orc_chief") return 220;
    if (kind === "black_ork_brute" || kind === "elite_ork") return 140;
    if (kind === "black_ork") return 72;
    if (kind === "ork" || kind === "soldier") return 40;
    if (kind === "bandit" || kind === "human") return 32;
    if (kind === "alpha_wolf") return 30;
    if (kind === "dog") return 12;
    return 22;
  },
};
