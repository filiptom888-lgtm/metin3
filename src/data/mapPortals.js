import { EDGE_PORTAL, MAP_HALF } from "../game/data.js";

/**
 * Bidirectional edge portals between field maps.
 * Spawn is always next to the destination portal (slightly inward so you don't re-enter).
 *
 * Flow: Shinsoo → Seungryong (Area 2) → Orc Isles
 */
const EDGE = EDGE_PORTAL;
const SPAWN_IN = MAP_HALF - 7.5;

export const WORLD_PORTALS = [
  {
    id: "shinsoo_east",
    mapId: "overworld",
    x: EDGE,
    z: 0,
    r: 3.4,
    toMap: "valley",
    spawn: { x: -SPAWN_IN, z: 0 },
    label: "Portal — Seungryong",
  },
  {
    id: "valley_west",
    mapId: "valley",
    x: -EDGE,
    z: 0,
    r: 3.4,
    toMap: "overworld",
    spawn: { x: SPAWN_IN, z: 0 },
    label: "Portal — Shinsoo",
  },
  {
    id: "valley_east",
    mapId: "valley",
    x: EDGE,
    z: 0,
    r: 3.4,
    toMap: "orc_valley",
    spawn: { x: -66, z: 0 },
    label: "Portal — Orc Isles",
  },
  {
    id: "orc_west",
    mapId: "orc_valley",
    x: -68.5,
    z: 0,
    r: 3.6,
    toMap: "valley",
    spawn: { x: SPAWN_IN, z: 0 },
    label: "Portal — Seungryong",
  },
];

export function portalsOnMap(mapId) {
  return WORLD_PORTALS.filter((p) => p.mapId === mapId);
}

export function findPortalNear(mapId, x, z) {
  let best = null;
  let bestD = Infinity;
  for (const p of portalsOnMap(mapId)) {
    const d = Math.hypot(x - p.x, z - p.z);
    if (d < p.r && d < bestD) {
      bestD = d;
      best = p;
    }
  }
  return best;
}
