/** Named maps — one city field + Seungryong + Orc Isles + dungeon */
export const MAPS = {
  overworld: {
    id: "overworld",
    name: "Shinsoo",
    kind: "field",
    half: 126,
    background: "#7ea8c8",
    fog: "#9ab0a0",
    fogNear: 48,
    fogFar: 165,
  },
  valley: {
    id: "valley",
    name: "Seungryong",
    kind: "field",
    half: 126,
    background: "#c4a878",
    fog: "#c0b090",
    fogNear: 45,
    fogFar: 155,
  },
  orc_valley: {
    id: "orc_valley",
    name: "Orc Isles",
    kind: "field",
    half: 80,
    background: "#5a6a70",
    fog: "#4a5a58",
    fogNear: 35,
    fogFar: 130,
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
