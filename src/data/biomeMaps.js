/**
 * Biome fields reached from Orc Isles islets (fire / desert / snow).
 * Not 1:1 Metin2 — simpler hubs with return portals to the isles.
 */
export const BIOME_HALF = 90;
export const BIOME_SIZE = BIOME_HALF * 2;
export const BIOME_EDGE = BIOME_HALF - 3.5;
export const BIOME_SPAWN_IN = BIOME_HALF - 7.5;

/** Visual + fog presets used by MapService + mesh builders */
export const BIOME_DEFS = {
  fire_plains: {
    id: "fire_plains",
    name: "Plains of Fire",
    half: BIOME_HALF,
    background: "#2a1410",
    fog: "#4a2214",
    fogNear: 38,
    fogFar: 135,
    ground: "#3a2214",
    groundTint: "#5a3020",
    accent: "#c43c2e",
    portalColor: "#ff6a30",
    returnLabel: "Orc Isles",
    orcSpawn: { x: 48, z: 44 },
    props: "lava",
  },
  desert: {
    id: "desert",
    name: "Yongbi Desert",
    half: BIOME_HALF,
    background: "#c4a878",
    fog: "#d0b888",
    fogNear: 42,
    fogFar: 145,
    ground: "#c9a878",
    groundTint: "#e0c490",
    accent: "#a07840",
    portalColor: "#e8c060",
    returnLabel: "Orc Isles",
    orcSpawn: { x: 54, z: -38 },
    props: "sand",
  },
  snow: {
    id: "snow",
    name: "Mount Sohan",
    half: BIOME_HALF,
    background: "#a8c0d8",
    fog: "#c0d4e8",
    fogNear: 40,
    fogFar: 140,
    ground: "#e8eef4",
    groundTint: "#f2f6fa",
    accent: "#6a9aba",
    portalColor: "#a8d8ff",
    returnLabel: "Orc Isles",
    orcSpawn: { x: 68, z: 6 },
    props: "snow",
  },
};

/**
 * Portal pads on Orc Isles → biome maps.
 * Placed on outer islets so the main island stays the war hub.
 */
export const ORC_BIOME_GATES = [
  {
    id: "orc_ne_fire",
    mapId: "orc_valley",
    x: 50,
    z: 46,
    r: 3.8,
    toMap: "fire_plains",
    spawn: { x: -BIOME_SPAWN_IN, z: 0 },
    label: "Portal — Plains of Fire",
    color: "#ff6a30",
  },
  {
    id: "orc_se_desert",
    mapId: "orc_valley",
    x: 56,
    z: -40,
    r: 3.8,
    toMap: "desert",
    spawn: { x: -BIOME_SPAWN_IN, z: 0 },
    label: "Portal — Yongbi Desert",
    color: "#e8c060",
  },
  {
    id: "orc_east_snow",
    mapId: "orc_valley",
    x: 70,
    z: 6,
    r: 3.8,
    toMap: "snow",
    spawn: { x: -BIOME_SPAWN_IN, z: 0 },
    label: "Portal — Mount Sohan",
    color: "#a8d8ff",
  },
];

export function isBiomeMap(id) {
  return Boolean(BIOME_DEFS[id]);
}

export function biomeIds() {
  return Object.keys(BIOME_DEFS);
}
