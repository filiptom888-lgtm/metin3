import { CITY_RADIUS, MAP_HALF, EDGE_PORTAL, TOWER_CORNER } from "../game/data.js";

/**
 * Small tent camps with pack enemies — dress Shinsoo / Seungryong wilderness.
 */
export const WILD_CAMPS = [
  // —— Shinsoo ——
  {
    id: "shin_north_scout",
    mapId: "overworld",
    x: 12,
    z: CITY_RADIUS + 42,
    r: 11,
    tents: 2,
    mobs: [{ id: "wolf", n: 5 }],
  },
  {
    id: "shin_south_hunt",
    mapId: "overworld",
    x: -18,
    z: -(CITY_RADIUS + 48),
    r: 12,
    tents: 3,
    mobs: [{ id: "wolf", n: 4 }],
  },
  {
    id: "shin_se_trail",
    mapId: "overworld",
    x: TOWER_CORNER.x - 38,
    z: TOWER_CORNER.z + 42,
    r: 13,
    tents: 3,
    mobs: [{ id: "wolf", n: 5 }],
  },
  {
    id: "shin_ne_grove",
    mapId: "overworld",
    x: EDGE_PORTAL - 45,
    z: 55,
    r: 12,
    tents: 2,
    mobs: [{ id: "wolf", n: 4 }],
  },
  {
    id: "shin_west_ruin",
    mapId: "overworld",
    x: -(CITY_RADIUS + 55),
    z: 22,
    r: 11,
    tents: 2,
    mobs: [{ id: "wolf", n: 4 }],
  },

  // —— Seungryong (denser) ——
  {
    id: "valley_east_caravan",
    mapId: "valley",
    x: EDGE_PORTAL - 40,
    z: -28,
    r: 13,
    tents: 3,
    mobs: [
      { id: "bandit", n: 3 },
      { id: "soldier", n: 2 },
    ],
  },
  {
    id: "valley_south_outpost",
    mapId: "valley",
    x: 35,
    z: -(CITY_RADIUS + 50),
    r: 14,
    tents: 4,
    mobs: [
      { id: "bandit", n: 4 },
      { id: "soldier", n: 2 },
    ],
  },
  {
    id: "valley_north_ridge",
    mapId: "valley",
    x: -25,
    z: CITY_RADIUS + 52,
    r: 13,
    tents: 3,
    mobs: [
      { id: "bandit", n: 3 },
      { id: "wolf", n: 2 },
    ],
  },
  {
    id: "valley_sw_camp",
    mapId: "valley",
    x: -(MAP_HALF - 48),
    z: 40,
    r: 12,
    tents: 3,
    mobs: [
      { id: "bandit", n: 3 },
      { id: "soldier", n: 1 },
    ],
  },
  {
    id: "valley_mid_raid",
    mapId: "valley",
    x: 55,
    z: 48,
    r: 12,
    tents: 2,
    mobs: [
      { id: "bandit", n: 2 },
      { id: "soldier", n: 2 },
    ],
  },
  {
    id: "valley_near_west",
    mapId: "valley",
    x: -(CITY_RADIUS + 38),
    z: -30,
    r: 11,
    tents: 2,
    mobs: [{ id: "bandit", n: 4 }],
  },
];

export function campsOnMap(mapId) {
  return WILD_CAMPS.filter((c) => c.mapId === mapId);
}

export function inWildCamp(mapId, x, z, pad = 0) {
  for (const c of campsOnMap(mapId)) {
    if (Math.hypot(x - c.x, z - c.z) < c.r + pad) return c;
  }
  return null;
}

export function wildCampPoint(camp, minR = 3, maxR = null) {
  const hi = maxR ?? camp.r - 2;
  const ang = Math.random() * Math.PI * 2;
  const r = minR + Math.random() * Math.max(0.5, hi - minR);
  return { x: camp.x + Math.cos(ang) * r, z: camp.z + Math.sin(ang) * r };
}
