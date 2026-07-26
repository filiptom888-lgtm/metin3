/** Single starting city for now (kingdoms kept as a stub for DB compat). */
export const KINGDOMS = [
  { id: 1, name: "Shinsoo", color: "#c43c2e", village: { x: -2, z: 4 } },
];

/** Local city pads (legacy helper — prefer WORLD_WARPS) */
export const CITY_WARPS = [
  { id: "plaza", name: "City Plaza", mapId: "overworld", x: 0, z: 0 },
  { id: "east", name: "East Gate", mapId: "overworld", x: 18, z: 0 },
  { id: "north", name: "North Gate", mapId: "overworld", x: 0, z: 18 },
  { id: "smith", name: "Blacksmith", mapId: "overworld", x: 5.5, z: 0 },
];

/** Full teleporter network — Shinsoo, Seungryong, Orc Isles */
export const WORLD_WARPS = [
  { id: "shinsoo_plaza", name: "Shinsoo · Plaza", mapId: "overworld", x: 0, z: 0 },
  { id: "shinsoo_east", name: "Shinsoo · East Gate", mapId: "overworld", x: 18, z: 0 },
  { id: "shinsoo_north", name: "Shinsoo · North Gate", mapId: "overworld", x: 0, z: 18 },
  { id: "shinsoo_smith", name: "Shinsoo · Blacksmith", mapId: "overworld", x: 5.5, z: 0 },
  { id: "shinsoo_tower", name: "Shinsoo · Demon Tower", mapId: "overworld", x: 170, z: -170 },
  { id: "valley_plaza", name: "Seungryong · Plaza", mapId: "valley", x: 0, z: 0 },
  { id: "valley_west", name: "Seungryong · West Gate", mapId: "valley", x: -170, z: 0 },
  { id: "valley_east", name: "Seungryong · East Gate", mapId: "valley", x: 170, z: 0 },
  { id: "valley_bandits", name: "Seungryong · Rogue Camp", mapId: "valley", x: -148, z: -148 },
  { id: "orc_tower", name: "Orc Isles · War Tower", mapId: "orc_valley", x: 0, z: 14 },
  { id: "orc_west", name: "Orc Isles · West Portal", mapId: "orc_valley", x: -64, z: 0 },
  { id: "orc_fire", name: "Orc Isles · Fire Gate", mapId: "orc_valley", x: 50, z: 46 },
  { id: "orc_desert", name: "Orc Isles · Desert Gate", mapId: "orc_valley", x: 56, z: -40 },
  { id: "orc_snow", name: "Orc Isles · Snow Gate", mapId: "orc_valley", x: 70, z: 6 },
  { id: "fire_portal", name: "Plains of Fire · Portal", mapId: "fire_plains", x: -82, z: 0 },
  { id: "fire_citadel", name: "Plains of Fire · Obsidian Citadel", mapId: "fire_plains", x: -48, z: 50 },
  { id: "desert_portal", name: "Yongbi Desert · Portal", mapId: "desert", x: -82, z: 0 },
  { id: "desert_oasis", name: "Yongbi Desert · Oasis Town", mapId: "desert", x: 48, z: 52 },
  { id: "snow_portal", name: "Mount Sohan · Portal", mapId: "snow", x: -82, z: 0 },
  { id: "snow_village", name: "Mount Sohan · Frost Village", mapId: "snow", x: 50, z: -48 },
];

/** Two Metin2-style skill groups per class — chosen at Skill Master (Lv.5+) */
export const SPECS = {
  warrior: [
    {
      id: "body",
      name: "Body",
      blurb: "Brutal melee — spins, charges, and raw power.",
    },
    {
      id: "mental",
      name: "Mental",
      blurb: "Spirit strikes, bash, and iron defense.",
    },
  ],
  ninja: [
    {
      id: "blade",
      name: "Blade",
      blurb: "Daggers, ambush, and smoke — close-range assassination.",
    },
    {
      id: "archery",
      name: "Archery",
      blurb: "Bows and elemental arrows from range.",
    },
  ],
  sura: [
    {
      id: "weaponry",
      name: "Weaponry",
      blurb: "Enchanted blades, fear, and weapon arts.",
    },
    {
      id: "blackmagic",
      name: "Black Magic",
      blurb: "Dark bolts, flame, curses, and life drain.",
    },
  ],
  shaman: [
    {
      id: "dragon",
      name: "Dragon Power",
      blurb: "Talismans, dragon roar, and lightning magic.",
    },
    {
      id: "healing",
      name: "Healing",
      blurb: "Cure allies, claws of lightning, and swiftness.",
    },
  ],
};

export function validateName(name) {
  const n = (name || "").trim();
  if (n.length < 2 || n.length > 16) return "Name must be 2–16 characters";
  if (!/^[a-zA-Z0-9_]+$/.test(n)) return "Only letters, numbers, underscore";
  const banned = ["admin", "gm", "moderator", "metin2", "fuck"];
  if (banned.some((b) => n.toLowerCase().includes(b))) return "Name not allowed";
  return null;
}

export function villageSpawn(_kingdomId) {
  const k = KINGDOMS[0];
  return { x: k.village.x, z: k.village.z };
}

export function hasSkillPath(spec) {
  return Boolean(spec && spec !== "none");
}
