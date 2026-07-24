/**
 * Bidirectional edge portals between field maps.
 * Spawn is always next to the destination portal (slightly inward so you don't re-enter).
 */
export const WORLD_PORTALS = [
  {
    id: "shinsoo_east",
    mapId: "overworld",
    x: 56.5,
    z: 0,
    r: 3.4,
    toMap: "valley",
    spawn: { x: -52.5, z: 0 },
    label: "Portal — Seungryong",
  },
  {
    id: "valley_west",
    mapId: "valley",
    x: -56.5,
    z: 0,
    r: 3.4,
    toMap: "overworld",
    spawn: { x: 52.5, z: 0 },
    label: "Portal — Shinsoo",
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
