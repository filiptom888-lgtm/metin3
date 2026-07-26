import { EDGE_PORTAL, MAP_HALF } from "../game/data.js";
import { BIOME_DEFS, BIOME_EDGE, BIOME_SPAWN_IN, ORC_BIOME_GATES } from "./biomeMaps.js";

/**
 * Bidirectional edge portals between field maps.
 * Spawn is always next to the destination portal (slightly inward so you don't re-enter).
 *
 * Flow: Shinsoo → Seungryong → Orc Isles → Fire / Desert / Snow (from islets)
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
  // Orc islets → biomes
  ...ORC_BIOME_GATES,
  // Biome returns → matching islet spawn
  {
    id: "fire_west",
    mapId: "fire_plains",
    x: -BIOME_EDGE,
    z: 0,
    r: 3.6,
    toMap: "orc_valley",
    spawn: { ...BIOME_DEFS.fire_plains.orcSpawn },
    label: "Portal — Orc Isles",
  },
  {
    id: "desert_west",
    mapId: "desert",
    x: -BIOME_EDGE,
    z: 0,
    r: 3.6,
    toMap: "orc_valley",
    spawn: { ...BIOME_DEFS.desert.orcSpawn },
    label: "Portal — Orc Isles",
  },
  {
    id: "snow_west",
    mapId: "snow",
    x: -BIOME_EDGE,
    z: 0,
    r: 3.6,
    toMap: "orc_valley",
    spawn: { ...BIOME_DEFS.snow.orcSpawn },
    label: "Portal — Orc Isles",
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
