import { TOWER_CORNER } from "../game/data.js";

/** Demon Tower — 7 slower floors; floor 7 is a 6-Metin party trial + forge reward */
export const DEMON_TOWER = {
  id: "demon_tower",
  name: "Demon Tower",
  /** Overworld entrance — top-right (SE) wilderness corner */
  entrance: { x: TOWER_CORNER.x, z: TOWER_CORNER.z },
  /** Local origin of the Demon Tower map (separate map root) */
  arena: { x: 0, z: 0 },
  mapId: "demon_tower",
  /** Portal pad offset from arena center (on the platform) */
  portalOffset: { x: 0, z: 9 },
  /** Tower smith stands opposite the exit portal */
  smithPos: { x: 0, z: -7.5 },
  /** Blessed forge uses per player after floor 7 */
  smithUses: 3,
  /** Exit warp — Shinsoo plaza */
  exitCity: { mapId: "overworld", x: 0, z: 0 },
  /** No wild mobs / Metins near the overworld entrance */
  safeRadius: 22,
  maxFloor: 7,
  floors: [
    {
      floor: 1,
      name: "Floor 1 — Cursed Hall",
      mobs: [{ id: "wolf", n: 3 }],
      boss: null,
      hpMul: 1.55,
      xp: 140,
      yang: 600,
    },
    {
      floor: 2,
      name: "Floor 2 — Bone Corridor",
      mobs: [{ id: "wolf", n: 2 }, { id: "ork", n: 2 }],
      boss: null,
      hpMul: 1.7,
      xp: 220,
      yang: 950,
    },
    {
      floor: 3,
      name: "Floor 3 — Orc Nest",
      mobs: [{ id: "ork", n: 3 }],
      boss: null,
      hpMul: 1.9,
      xp: 320,
      yang: 1400,
    },
    {
      floor: 4,
      name: "Floor 4 — Blood Gate",
      mobs: [{ id: "ork", n: 2 }, { id: "elite_ork", n: 1 }],
      boss: null,
      hpMul: 2.1,
      xp: 450,
      yang: 2000,
    },
    {
      floor: 5,
      name: "Floor 5 — Shadow Pit",
      mobs: [{ id: "elite_ork", n: 2 }],
      boss: null,
      hpMul: 2.35,
      xp: 620,
      yang: 2800,
    },
    {
      floor: 6,
      name: "Floor 6 — Infernal Spire",
      mobs: [{ id: "elite_ork", n: 1 }],
      boss: { id: "elite_ork", name: "Spire Captain", hpMul: 2.8, atkMul: 1.35 },
      hpMul: 2.5,
      xp: 900,
      yang: 4200,
    },
    {
      floor: 7,
      name: "Floor 7 — Metin Crucible",
      mobs: [],
      boss: null,
      /** Six stones the party must shatter together */
      metins: [{ id: "tower", n: 6 }],
      smith: true,
      xp: 2200,
      yang: 14000,
    },
  ],
};

/** Temporary NPC after floor 7 — not in the world NPC list */
export const TOWER_SMITH_NPC = {
  id: "tower_smith",
  name: "Infernal Blacksmith",
  role: "blacksmith",
  towerSmith: true,
  mapId: "demon_tower",
  x: 0,
  z: -7.5,
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
