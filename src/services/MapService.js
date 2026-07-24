/** Named maps — overworld vs instance dungeons */
export const MAPS = {
  overworld: {
    id: "overworld",
    name: "Kingdom",
    half: 60,
    background: "#7a9a68",
    fog: "#8aaa72",
    fogNear: 50,
    fogFar: 115,
  },
  demon_tower: {
    id: "demon_tower",
    name: "Demon Tower",
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

  isOverworld() {
    return this.currentId === "overworld";
  },

  isDungeon() {
    return this.currentId !== "overworld";
  },

  set(id) {
    if (!MAPS[id]) return MAPS.overworld;
    this.currentId = id;
    return this.current;
  },
};
