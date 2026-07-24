/** Demon Tower floor templates (Metin-style progressive dungeon) */
export const DEMON_TOWER = {
  id: "demon_tower",
  name: "Demon Tower",
  /** Overworld entrance — far SE map corner (outside city) */
  entrance: { x: 54, z: -54 },
  /** Local origin of the Demon Tower map (separate map root) */
  arena: { x: 0, z: 0 },
  mapId: "demon_tower",
  /** Portal pad offset from arena center (on the platform) */
  portalOffset: { x: 0, z: 9 },
  /** No wild mobs / Metins near the overworld entrance */
  safeRadius: 18,
  maxFloor: 7,
  floors: [
    { floor: 1, name: "Floor 1 — Cursed Hall", mobs: [{ id: "wolf", n: 6 }], boss: null, xp: 80, yang: 400 },
    { floor: 2, name: "Floor 2 — Bone Corridor", mobs: [{ id: "wolf", n: 4 }, { id: "ork", n: 3 }], boss: null, xp: 140, yang: 700 },
    { floor: 3, name: "Floor 3 — Orc Nest", mobs: [{ id: "ork", n: 6 }], boss: null, xp: 220, yang: 1100 },
    { floor: 4, name: "Floor 4 — Blood Gate", mobs: [{ id: "ork", n: 5 }, { id: "elite_ork", n: 1 }], boss: null, xp: 320, yang: 1600 },
    { floor: 5, name: "Floor 5 — Shadow Pit", mobs: [{ id: "elite_ork", n: 2 }, { id: "ork", n: 4 }], boss: null, xp: 450, yang: 2200 },
    { floor: 6, name: "Floor 6 — Infernal Spire", mobs: [{ id: "elite_ork", n: 3 }, { id: "ork", n: 5 }], boss: null, xp: 600, yang: 3000 },
    {
      floor: 7,
      name: "Floor 7 — Demon Lord",
      mobs: [{ id: "elite_ork", n: 2 }],
      boss: { id: "elite_ork", name: "Tower Demon", hpMul: 3, atkMul: 1.6 },
      xp: 1200,
      yang: 8000,
    },
  ],
};

export function floorConfig(n) {
  return DEMON_TOWER.floors.find((f) => f.floor === n) || DEMON_TOWER.floors[0];
}

export function inDemonTowerZone(x, z, pad = 0) {
  const e = DEMON_TOWER.entrance;
  const r = DEMON_TOWER.safeRadius + pad;
  const dx = x - e.x;
  const dz = z - e.z;
  return dx * dx + dz * dz < r * r;
}

/** World position of the floor portal pad */
export function demonPortalWorld() {
  const a = DEMON_TOWER.arena;
  const o = DEMON_TOWER.portalOffset;
  return { x: a.x + o.x, z: a.z + o.z };
}
