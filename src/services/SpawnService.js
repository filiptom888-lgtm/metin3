import { MONSTERS } from "../data/monsters.js";
import { METINS } from "../data/metins.js";
import { CITY_RADIUS } from "../game/data.js";
import { MAP_HALF } from "../game/data.js";
import { inDemonTowerZone } from "../data/demonTower.js";

function wildPoint(mapId, minR, maxR) {
  for (let attempt = 0; attempt < 28; attempt++) {
    const ang = Math.random() * Math.PI * 2;
    const r = minR + Math.random() * (maxR - minR);
    const p = { x: Math.cos(ang) * r, z: Math.sin(ang) * r };
    // Keep Demon Tower approach clear on Shinsoo only
    if (mapId === "overworld" && inDemonTowerZone(p.x, p.z)) continue;
    // Keep east/west edge portals clear
    if (mapId === "overworld" && Math.hypot(p.x - 56.5, p.z) < 8) continue;
    if (mapId === "valley" && Math.hypot(p.x + 56.5, p.z) < 8) continue;
    return p;
  }
  return { x: -(CITY_RADIUS + 12), z: CITY_RADIUS + 12 };
}

function monstersForMap(mapId) {
  return Object.values(MONSTERS).filter((m) => {
    if (!m.maps) return mapId === "overworld";
    return m.maps.includes(mapId);
  });
}

export const SpawnService = {
  monsters: MONSTERS,
  metins: METINS,
  pickMobTemplate(mapId = "overworld", levelBias = 1) {
    const pool = monstersForMap(mapId).filter((m) => m.level <= levelBias + 8);
    const list = pool.length ? pool : monstersForMap(mapId);
    return list[(Math.random() * list.length) | 0] || MONSTERS.wolf;
  },
  pickMetinTemplate() {
    const list = Object.values(METINS);
    return list[(Math.random() * list.length) | 0];
  },
  seedWild(mapId = "overworld", level = 1) {
    const mobs = [];
    const metins = [];
    const mobCount = mapId === "valley" ? 22 : 24;
    for (let i = 0; i < mobCount; i++) {
      const p = wildPoint(mapId, CITY_RADIUS + 5, MAP_HALF - 6);
      const t = this.pickMobTemplate(mapId, level);
      mobs.push({ ...p, templateId: t.id, mapId });
    }
    // Metins on both field maps (fewer in the valley)
    const metinCount = mapId === "valley" ? 4 : 6;
    for (let i = 0; i < metinCount; i++) {
      const p = wildPoint(mapId, CITY_RADIUS + 10, MAP_HALF - 8);
      const t = this.pickMetinTemplate();
      metins.push({ ...p, templateId: t.id, mapId });
    }
    return { mobs, metins };
  },
};
