/**
 * Mob / metin floor-drop tables.
 * chance = base rate before DropService.DROP_RATE_MUL.
 * Keep consumables/mats common-ish; gear uncommon; rare/epic scarce.
 */
export const DROP_TABLES = {
  dog: [
    { id: "meat", chance: 0.55, qty: [1, 2] },
    { id: "red_potion", chance: 0.32 },
    { id: "cloth_boots", chance: 0.04 },
    { id: "jewel_t05_bracelet", chance: 0.02 },
  ],
  wolf: [
    { id: "meat", chance: 0.4, qty: [1, 2] },
    { id: "wolf_pelt", chance: 0.32 },
    { id: "red_potion", chance: 0.38, qty: [1, 2] },
    { id: "blue_potion", chance: 0.18 },
    { id: "leather_t05_helmet", chance: 0.04 },
    { id: "cloth_t05_shoes", chance: 0.04 },
    { id: "plate_t05_shoes", chance: 0.035 },
    { id: "rusty_sword", chance: 0.04 },
    { id: "jewel_t05_bracelet", chance: 0.035 },
    { id: "upgrade_ore", chance: 0.07 },
  ],
  ork: [
    { id: "orc_tooth", chance: 0.34 },
    { id: "meat", chance: 0.22 },
    { id: "red_potion", chance: 0.36, qty: [1, 3] },
    { id: "orange_potion", chance: 0.16 },
    { id: "upgrade_ore", chance: 0.14 },
    { id: "plate_t15_weapon", chance: 0.05 },
    { id: "leather_t15_weapon", chance: 0.05 },
    { id: "cloth_t15_weapon", chance: 0.045 },
    { id: "plate_t15_armor", chance: 0.045 },
    { id: "leather_t15_armor", chance: 0.045 },
    { id: "cloth_t15_armor", chance: 0.04 },
    { id: "jewel_t15_necklace", chance: 0.04 },
    { id: "plate_t05_shield", chance: 0.04 },
  ],
  /** Captains / brutes — Lv.25 set pieces */
  elite_ork: [
    { id: "orc_tooth", chance: 0.45, qty: [1, 2] },
    { id: "orange_potion", chance: 0.28, qty: [1, 2] },
    { id: "green_potion", chance: 0.12 },
    { id: "upgrade_ore", chance: 0.28, qty: [1, 3] },
    { id: "plate_t25_weapon", chance: 0.08 },
    { id: "leather_t25_weapon", chance: 0.08 },
    { id: "cloth_t25_weapon", chance: 0.07 },
    { id: "plate_t25_armor", chance: 0.07 },
    { id: "leather_t25_armor", chance: 0.07 },
    { id: "cloth_t25_armor", chance: 0.06 },
    { id: "jewel_t25_bracelet", chance: 0.05 },
    { id: "plate_t25_shield", chance: 0.05 },
  ],
  /** Orc Isles — black orcs → Lv.25–40 */
  black_ork: [
    { id: "orc_tooth", chance: 0.4, qty: [1, 2] },
    { id: "orange_potion", chance: 0.22 },
    { id: "green_potion", chance: 0.1 },
    { id: "upgrade_ore", chance: 0.2, qty: [1, 2] },
    { id: "plate_t25_helmet", chance: 0.07 },
    { id: "leather_t25_shoes", chance: 0.07 },
    { id: "cloth_t25_helmet", chance: 0.06 },
    { id: "plate_t40_weapon", chance: 0.035 },
    { id: "leather_t40_weapon", chance: 0.035 },
    { id: "cloth_t40_weapon", chance: 0.03 },
    { id: "jewel_t25_earring", chance: 0.05 },
  ],
  /** War chiefs — Lv.40–60 tease */
  orc_chief: [
    { id: "orc_tooth", chance: 0.55, qty: [2, 3] },
    { id: "green_potion", chance: 0.25, qty: [1, 2] },
    { id: "upgrade_ore", chance: 0.4, qty: [2, 4] },
    { id: "crystal_shard", chance: 0.22, qty: [1, 2] },
    { id: "plate_t40_armor", chance: 0.08 },
    { id: "leather_t40_armor", chance: 0.08 },
    { id: "cloth_t40_armor", chance: 0.07 },
    { id: "plate_t60_weapon", chance: 0.03 },
    { id: "leather_t60_weapon", chance: 0.03 },
    { id: "cloth_t60_weapon", chance: 0.025 },
    { id: "jewel_t40_necklace", chance: 0.05 },
    { id: "plate_t75_weapon", chance: 0.01 },
  ],
  bandit: [
    { id: "red_potion", chance: 0.4, qty: [1, 2] },
    { id: "blue_potion", chance: 0.24 },
    { id: "orange_potion", chance: 0.12 },
    { id: "yang_pouch", chance: 0.07 },
    { id: "upgrade_ore", chance: 0.12 },
    { id: "leather_t15_armor", chance: 0.07 },
    { id: "leather_t15_helmet", chance: 0.06 },
    { id: "plate_t15_shoes", chance: 0.05 },
    { id: "cloth_t15_shoes", chance: 0.05 },
    { id: "jewel_t15_bracelet", chance: 0.05 },
    { id: "leather_t15_weapon", chance: 0.04 },
  ],
  rogue_chief: [
    { id: "orange_potion", chance: 0.7, qty: [2, 4] },
    { id: "green_potion", chance: 0.45 },
    { id: "yang_pouch", chance: 0.35, qty: [1, 2] },
    { id: "upgrade_ore", chance: 0.55, qty: [2, 5] },
    { id: "skill_book", chance: 0.28 },
    { id: "leather_t40_armor", chance: 0.14 },
    { id: "leather_t40_weapon", chance: 0.12 },
    { id: "plate_t40_helmet", chance: 0.1 },
    { id: "jewel_t40_necklace", chance: 0.12 },
    { id: "treasure_box", chance: 0.1 },
  ],
  metin: [
    { id: "orange_potion", chance: 0.55, qty: [1, 3] },
    { id: "green_potion", chance: 0.28 },
    { id: "crystal_shard", chance: 0.4, qty: [1, 3] },
    { id: "upgrade_ore", chance: 0.5, qty: [1, 4] },
    // Skill books — main Metin reward for raising path skills
    { id: "skill_book", chance: 0.55, qty: [1, 2] },
    { id: "skill_book_grand", chance: 0.12 },
    { id: "fairy_dust", chance: 0.22 },
    { id: "magic_scroll", chance: 0.16 },
    { id: "lightning_charm", chance: 0.12 },
    { id: "treasure_box", chance: 0.07 },
    { id: "plate_t25_armor", chance: 0.08 },
    { id: "leather_t25_armor", chance: 0.08 },
    { id: "cloth_t25_armor", chance: 0.08 },
    { id: "plate_t40_weapon", chance: 0.06 },
    { id: "leather_t40_weapon", chance: 0.06 },
    { id: "cloth_t40_weapon", chance: 0.06 },
    { id: "plate_t60_helmet", chance: 0.04 },
    { id: "leather_t60_shoes", chance: 0.04 },
    { id: "cloth_t60_helmet", chance: 0.04 },
    { id: "jewel_t40_bracelet", chance: 0.07 },
    { id: "jewel_t60_necklace", chance: 0.035 },
    { id: "plate_t75_armor", chance: 0.015 },
    { id: "leather_t75_weapon", chance: 0.015 },
    { id: "cloth_t75_weapon", chance: 0.015 },
  ],
};

/** Resolve monster template id / kind → drop table key */
export function resolveDropTable(id) {
  if (!id) return "wolf";
  if (DROP_TABLES[id]) return id;
  if (id === "human") return "bandit";
  if (id === "alpha_wolf") return "wolf";
  if (id === "soldier") return "bandit";
  if (id === "black_ork_brute") return "elite_ork";
  if (id === "elite_ork") return "elite_ork";
  if (id === "orc_chief") return "orc_chief";
  if (id === "black_ork") return "black_ork";
  if (id === "ork" || id === "elite") return "ork";
  return id;
}
