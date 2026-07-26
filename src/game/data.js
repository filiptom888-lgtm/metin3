/** Field maps (Shinsoo / Seungryong) — city stays ~22r; wilderness ~4× deeper */
export const MAP_SIZE = 360;
export const MAP_HALF = MAP_SIZE / 2;
/** Safe zone — no wild mobs / metins inside */
export const CITY_RADIUS = 22;
export const CITY_GATE = 4.5;
/** Edge travel portals sit this far from map center on the axis */
export const EDGE_PORTAL = MAP_HALF - 3.5;
/** Demon Tower sits in the SE / top-right wilderness corner */
export const TOWER_CORNER = { x: MAP_HALF - 10, z: -(MAP_HALF - 10) };

export const CLASSES = {
  warrior: {
    id: "warrior",
    name: "Warrior",
    glyph: "武",
    color: "#c43c2e",
    hp: 160,
    sp: 60,
    speed: 7.5,
    atk: 18,
    range: 2.4,
    cd: 0.4,
    skills: [
      { name: "Slash", sp: 12, cd: 2.2, type: "cone" },
      { name: "Whirl", sp: 22, cd: 6, type: "aoe" },
      { name: "Roar", sp: 18, cd: 8, type: "buff" },
      { name: "Charge", sp: 16, cd: 5, type: "dash" },
    ],
  },
  ninja: {
    id: "ninja",
    name: "Ninja",
    glyph: "忍",
    color: "#3a9fd4",
    hp: 110,
    sp: 80,
    speed: 9.5,
    atk: 14,
    range: 2.2,
    cd: 0.28,
    skills: [
      { name: "Fan", sp: 10, cd: 1.8, type: "cone" },
      { name: "Dart", sp: 14, cd: 3.5, type: "bolt" },
      { name: "Smoke", sp: 20, cd: 9, type: "stealth" },
      { name: "Ambush", sp: 24, cd: 7, type: "burst" },
    ],
  },
  sura: {
    id: "sura",
    name: "Sura",
    glyph: "魔",
    color: "#8b3fd4",
    hp: 130,
    sp: 90,
    speed: 8,
    atk: 16,
    range: 2.5,
    cd: 0.36,
    skills: [
      { name: "Curse", sp: 14, cd: 3, type: "dot" },
      { name: "Drain", sp: 16, cd: 5, type: "drain" },
      { name: "Flame", sp: 22, cd: 6.5, type: "aoe" },
      { name: "Enchant", sp: 18, cd: 10, type: "buff" },
    ],
  },
  shaman: {
    id: "shaman",
    name: "Shaman",
    glyph: "灵",
    color: "#4ecf8a",
    hp: 100,
    sp: 110,
    speed: 7.8,
    atk: 12,
    range: 7,
    cd: 0.45,
    skills: [
      { name: "Bolt", sp: 12, cd: 2, type: "bolt" },
      { name: "Heal", sp: 20, cd: 7, type: "heal" },
      { name: "Storm", sp: 28, cd: 8, type: "aoe" },
      { name: "Bless", sp: 16, cd: 9, type: "buff" },
    ],
  },
};

export function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

export function dist2(ax, az, bx, bz) {
  return Math.hypot(ax - bx, az - bz);
}

export function rand(a, b) {
  return a + Math.random() * (b - a);
}

export function uid(prefix = "e") {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
}

export function inCity(x, z) {
  return dist2(x, z, 0, 0) < CITY_RADIUS;
}

/** Random point in wilderness (outside city, outside Demon Tower entrance) */
export function wildPoint(minR = CITY_RADIUS + 6, maxR = MAP_HALF - 6) {
  for (let i = 0; i < 28; i++) {
    const ang = Math.random() * Math.PI * 2;
    const r = rand(minR, maxR);
    const x = Math.cos(ang) * r;
    const z = Math.sin(ang) * r;
    if (Math.hypot(x - TOWER_CORNER.x, z - TOWER_CORNER.z) > 18) return { x, z };
  }
  return { x: CITY_RADIUS + 14, z: CITY_RADIUS + 14 };
}
