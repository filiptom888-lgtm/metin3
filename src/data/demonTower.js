/** Demon Tower floor templates (Metin-style progressive dungeon) */
export const DEMON_TOWER = {
  id: "demon_tower",
  name: "Demon Tower",
  /** Entrance in the city */
  entrance: { x: 0, z: 14 },
  /** Instance arena (map corner) */
  arena: { x: 42, z: -42 },
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
