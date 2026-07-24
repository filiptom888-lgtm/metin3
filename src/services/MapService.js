/** Named maps — field kingdoms + instance dungeons */
export const MAPS = {
  overworld: {
    id: "overworld",
    name: "Shinsoo",
    kind: "field",
    half: 60,
    background: "#7a9a68",
    fog: "#8aaa72",
    fogNear: 50,
    fogFar: 115,
  },
  valley: {
    id: "valley",
    name: "Seungryong",
    kind: "field",
    half: 60,
    background: "#8a6a48",
    fog: "#9a7a52",
    fogNear: 48,
    fogFar: 112,
  },
  demon_tower: {
    id: "demon_tower",
    name: "Demon Tower",
    kind: "dungeon",
    half: 18,
    background: "#0e0608",
    fog: "#1a0a10",
    fogNear: 14,
    fogFar: 42,
  },
};

export const MapService = {
  currentId: "overworld",

  get current() {
    return MAPS[this.currentId] || MAPS.overworld;
  },

  is(id) {
    return this.currentId === id;
  },

  /** Shinsoo / first kingdom map specifically */
  isOverworld() {
    return this.currentId === "overworld";
  },

  /** Any open field map (not a dungeon instance) */
  isField(id = this.currentId) {
    const m = MAPS[id] || this.current;
    return m.kind === "field";
  },

  isDungeon(id = this.currentId) {
    const m = MAPS[id] || this.current;
    return m.kind === "dungeon";
  },

  set(id) {
    if (!MAPS[id]) return MAPS.overworld;
    this.currentId = id;
    return this.current;
  },
};
