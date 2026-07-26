import { CITY_RADIUS, MAP_HALF, EDGE_PORTAL, TOWER_CORNER } from "../game/data.js";

/**
 * Half-empty enemy outposts — sparse tents, ruined fences, few stragglers.
 */
export const OUTPOSTS = [
  // Shinsoo
  {
    id: "ow_ruined_watch",
    mapId: "overworld",
    x: -55,
    z: 70,
    r: 9,
    tents: 1,
    ruined: true,
    mobs: [{ id: "wolf", n: 2 }],
  },
  {
    id: "ow_road_camp",
    mapId: "overworld",
    x: 62,
    z: 8,
    r: 8,
    tents: 1,
    ruined: true,
    mobs: [{ id: "dog", n: 2 }],
  },
  {
    id: "ow_south_ash",
    mapId: "overworld",
    x: 28,
    z: -(CITY_RADIUS + 58),
    r: 10,
    tents: 2,
    ruined: true,
    mobs: [{ id: "wolf", n: 1 }],
  },
  {
    id: "ow_tower_trail",
    mapId: "overworld",
    x: TOWER_CORNER.x - 55,
    z: TOWER_CORNER.z + 50,
    r: 9,
    tents: 1,
    ruined: true,
    mobs: [{ id: "ork", n: 1 }],
  },
  // Seungryong — denser ruins
  {
    id: "val_east_ruin",
    mapId: "valley",
    x: EDGE_PORTAL - 55,
    z: 40,
    r: 10,
    tents: 1,
    ruined: true,
    mobs: [{ id: "bandit", n: 2 }],
  },
  {
    id: "val_south_empty",
    mapId: "valley",
    x: -25,
    z: -(CITY_RADIUS + 55),
    r: 11,
    tents: 2,
    ruined: true,
    mobs: [{ id: "bandit", n: 1 }],
  },
  {
    id: "val_west_watch",
    mapId: "valley",
    x: -(MAP_HALF - 48),
    z: 18,
    r: 9,
    tents: 1,
    ruined: true,
    mobs: [{ id: "soldier", n: 1 }],
  },
  {
    id: "val_cross_trail",
    mapId: "valley",
    x: 48,
    z: -38,
    r: 8,
    tents: 1,
    ruined: true,
    mobs: [],
  },
];

export function outpostsOnMap(mapId) {
  return OUTPOSTS.filter((o) => o.mapId === mapId);
}

export function inOutpost(mapId, x, z, pad = 0) {
  for (const o of outpostsOnMap(mapId)) {
    if (Math.hypot(x - o.x, z - o.z) < o.r + pad) return o;
  }
  return null;
}
