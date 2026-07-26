/**
 * Quest definitions.
 * giver: NPC id (quest_elder | biologist)
 * requires: previous quest id must be claimed (optional chain)
 * type: kill | metin
 * target: wolf | ork | black_ork | bandit | soldier | metin
 *
 * reward:
 *   xp, yang
 *   item / itemQty  — legacy single item
 *   items: [{ id, qty }]
 *   loot: [{ id, chance, qty? }] — bonus roll on claim (no floor scarcity)
 */
export const QUESTS = [
  // ── Village Elder ──────────────────────────────────────────
  {
    id: "q_wolves",
    name: "Cull the Pack",
    giver: "quest_elder",
    levelReq: 1,
    type: "kill",
    target: "wolf",
    count: 5,
    reward: {
      xp: 200,
      yang: 800,
      items: [
        { id: "red_potion", qty: 5 },
        { id: "meat", qty: 3 },
      ],
    },
    desc: "Wild wolves threaten the roads. Slay 5 outside the walls.",
  },
  {
    id: "q_wolves_hunt",
    name: "Hunt Continues",
    giver: "quest_elder",
    requires: "q_wolves",
    levelReq: 3,
    type: "kill",
    target: "wolf",
    count: 12,
    reward: {
      xp: 380,
      yang: 1500,
      items: [
        { id: "orange_potion", qty: 3 },
        { id: "leather_cap", qty: 1 },
        { id: "wolf_pelt", qty: 4 },
      ],
    },
    desc: "The pack still howls. Bring down 12 more wolves.",
  },
  {
    id: "q_metin",
    name: "Shatter Stone",
    giver: "quest_elder",
    levelReq: 5,
    type: "metin",
    target: "metin",
    count: 1,
    reward: {
      xp: 550,
      yang: 2800,
      items: [
        { id: "upgrade_ore", qty: 3 },
        { id: "crystal_shard", qty: 2 },
      ],
      loot: [
        { id: "green_potion", chance: 0.7 },
        { id: "copper_earring", chance: 0.35 },
      ],
    },
    desc: "Destroy any Metin stone in the wilderness and report back.",
  },
  {
    id: "q_orks",
    name: "Orc Threat",
    giver: "quest_elder",
    levelReq: 8,
    type: "kill",
    target: "ork",
    count: 8,
    reward: {
      xp: 750,
      yang: 4500,
      items: [
        { id: "jewel_t15_bracelet", qty: 1 },
        { id: "orange_potion", qty: 4 },
        { id: "orc_tooth", qty: 3 },
      ],
      loot: [
        { id: "plate_t15_weapon", chance: 0.35 },
        { id: "leather_t15_weapon", chance: 0.35 },
        { id: "cloth_t15_weapon", chance: 0.35 },
      ],
    },
    desc: "Orc warriors gather beyond the gate. Defeat 8 of them.",
  },
  {
    id: "q_bandits",
    name: "Valley Bandits",
    giver: "quest_elder",
    levelReq: 10,
    type: "kill",
    target: "bandit",
    count: 10,
    reward: {
      xp: 950,
      yang: 6000,
      items: [
        { id: "blue_potion", qty: 5 },
        { id: "upgrade_ore", qty: 2 },
        { id: "jewel_t15_necklace", qty: 1 },
      ],
      loot: [
        { id: "plate_t15_armor", chance: 0.4 },
        { id: "leather_t15_armor", chance: 0.4 },
        { id: "cloth_t15_armor", chance: 0.4 },
      ],
    },
    desc: "Travel east to Seungryong and thin the bandits — 10 kills.",
  },
  {
    id: "q_black_orks",
    name: "Isles of Tusks",
    giver: "quest_elder",
    requires: "q_bandits",
    levelReq: 18,
    type: "kill",
    target: "black_ork",
    count: 12,
    reward: {
      xp: 1400,
      yang: 9000,
      items: [
        { id: "green_potion", qty: 3 },
        { id: "upgrade_ore", qty: 4 },
        { id: "jewel_t25_bracelet", qty: 1 },
      ],
      loot: [
        { id: "plate_t25_weapon", chance: 0.3 },
        { id: "leather_t25_weapon", chance: 0.3 },
        { id: "cloth_t25_weapon", chance: 0.3 },
        { id: "plate_t25_armor", chance: 0.25 },
        { id: "leather_t25_armor", chance: 0.25 },
        { id: "cloth_t25_armor", chance: 0.25 },
      ],
    },
    desc: "From Seungryong, take the east portal to the Orc Isles. Slay 12 Black Orcs.",
  },

  // ── Biologist research chain ───────────────────────────────
  {
    id: "q_bio_wolves",
    name: "Wolf Specimens",
    giver: "biologist",
    levelReq: 1,
    type: "kill",
    target: "wolf",
    count: 8,
    reward: {
      xp: 240,
      yang: 1000,
      items: [
        { id: "red_potion", qty: 4 },
        { id: "wolf_pelt", qty: 5 },
      ],
    },
    desc: "Cull 8 Wild Wolves so I can study their remains.",
  },
  {
    id: "q_bio_orks",
    name: "Orc Tissue Study",
    giver: "biologist",
    requires: "q_bio_wolves",
    levelReq: 6,
    type: "kill",
    target: "ork",
    count: 6,
    reward: {
      xp: 520,
      yang: 2600,
      items: [
        { id: "orange_potion", qty: 3 },
        { id: "orc_tooth", qty: 4 },
        { id: "bone_necklace", qty: 1 },
      ],
    },
    desc: "Collect samples from 6 Orc Warriors. Mind the tusks.",
  },
  {
    id: "q_bio_bandits",
    name: "Human Behavior",
    giver: "biologist",
    requires: "q_bio_orks",
    levelReq: 10,
    type: "kill",
    target: "bandit",
    count: 8,
    reward: {
      xp: 700,
      yang: 3500,
      items: [
        { id: "blue_potion", qty: 4 },
        { id: "hunter_boots", qty: 1 },
      ],
    },
    desc: "Observe — and thin — 8 bandits in the brown valley.",
  },
  {
    id: "q_bio_metin",
    name: "Stone Residue",
    giver: "biologist",
    requires: "q_bio_bandits",
    levelReq: 12,
    type: "metin",
    target: "metin",
    count: 1,
    reward: {
      xp: 1000,
      yang: 5500,
      items: [
        { id: "upgrade_ore", qty: 4 },
        { id: "crystal_shard", qty: 3 },
        { id: "fairy_dust", qty: 2 },
      ],
      loot: [{ id: "magic_scroll", chance: 0.5 }],
    },
    desc: "Shatter a Metin and bring the crystalline residue to my tent.",
  },
  {
    id: "q_bio_black_orks",
    name: "Dark Blood Samples",
    giver: "biologist",
    requires: "q_bio_metin",
    levelReq: 20,
    type: "kill",
    target: "black_ork",
    count: 10,
    reward: {
      xp: 1600,
      yang: 10000,
      items: [
        { id: "green_potion", qty: 5 },
        { id: "orc_tooth", qty: 6 },
        { id: "iron_helm", qty: 1 },
      ],
      loot: [
        { id: "tiger_fang", chance: 0.2 },
        { id: "upgrade_ore", chance: 1, qty: [2, 3] },
      ],
    },
    desc: "Bring samples from 10 Black Orcs on the isles. Their blood runs darker.",
  },
];
