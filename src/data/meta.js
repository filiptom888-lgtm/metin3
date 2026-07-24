/** Kingdoms, name rules, spawn points */
export const KINGDOMS = [
  { id: 1, name: "Shinsoo", color: "#c43c2e", village: { x: -8, z: 6 } },
  { id: 2, name: "Chunjo", color: "#e8b84a", village: { x: 8, z: 6 } },
  { id: 3, name: "Jinno", color: "#3a9fd4", village: { x: 0, z: -10 } },
];

export const SPECS = {
  warrior: [
    { id: "body", name: "Body" },
    { id: "mental", name: "Mental" },
  ],
  ninja: [
    { id: "blade", name: "Blade" },
    { id: "archery", name: "Archery" },
  ],
  sura: [
    { id: "weaponry", name: "Weaponry" },
    { id: "blackmagic", name: "Black Magic" },
  ],
  shaman: [
    { id: "dragon", name: "Dragon" },
    { id: "healing", name: "Healing" },
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

export function villageSpawn(kingdomId) {
  const k = KINGDOMS.find((x) => x.id === Number(kingdomId)) || KINGDOMS[0];
  return { x: k.village.x, z: k.village.z };
}
