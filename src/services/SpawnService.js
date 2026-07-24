import { MONSTERS } from "../data/monsters.js";
import { METINS } from "../data/metins.js";
import { CITY_RADIUS } from "../game/data.js";
import { MAP_HALF } from "../game/data.js";

function wildPoint(minR, maxR) {
  const ang = Math.random() * Math.PI * 2;
  const r = minR + Math.random() * (maxR - minR);
  return { x: Math.cos(ang) * r, z: Math.sin(ang) * r };
}

export const SpawnService = {
  monsters: MONSTERS,
  metins: METINS,
  pickMobTemplate(levelBias = 1) {
    const list = Object.values(MONSTERS).filter((m) => m.level <= levelBias + 5);
    return list[(Math.random() * list.length) | 0] || MONSTERS.wolf;
  },
  pickMetinTemplate() {
    const list = Object.values(METINS);
    return list[(Math.random() * list.length) | 0];
  },
  seedWild(level = 1) {
    const mobs = [];
    const metins = [];
    for (let i = 0; i < 24; i++) {
      const p = wildPoint(CITY_RADIUS + 5, MAP_HALF - 6);
      const t = this.pickMobTemplate(level);
      mobs.push({ ...p, templateId: t.id });
    }
    for (let i = 0; i < 6; i++) {
      const p = wildPoint(CITY_RADIUS + 10, MAP_HALF - 8);
      const t = this.pickMetinTemplate();
      metins.push({ ...p, templateId: t.id });
    }
    return { mobs, metins };
  },
};
