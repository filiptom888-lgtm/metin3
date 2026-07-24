const POOL = [
  { stat: "str", min: 1, max: 3 },
  { stat: "vit", min: 1, max: 3 },
  { stat: "intel", min: 1, max: 3 },
  { stat: "dex", min: 1, max: 3 },
  { stat: "atk", min: 2, max: 6 },
  { stat: "def", min: 2, max: 5 },
  { stat: "maxHp", min: 20, max: 60 },
];

export function rollBonuses(rarity = "common") {
  const count = rarity === "epic" ? 3 : rarity === "rare" ? 2 : rarity === "uncommon" ? 1 : Math.random() < 0.35 ? 1 : 0;
  const out = [];
  const used = new Set();
  for (let i = 0; i < count; i++) {
    const p = POOL[(Math.random() * POOL.length) | 0];
    if (used.has(p.stat)) continue;
    used.add(p.stat);
    out.push({
      stat: p.stat,
      value: p.min + ((Math.random() * (p.max - p.min + 1)) | 0),
    });
  }
  return out;
}
