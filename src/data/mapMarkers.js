/**
 * World-map overlays: hunt rings, miniboss zones, quest target → map.
 */
import { SPAWN_ZONES } from "./monsters.js";
import { BANDIT_CAMP } from "./banditCamp.js";
import { MAP_HALF, CITY_RADIUS, TOWER_CORNER } from "../game/data.js";
import { NPCS } from "./npcs.js";

/** Quest kill/metin target → where to look on the map */
export const QUEST_HUNT = {
  wolf: { mapId: "overworld", zone: "mid", label: "Wolves", color: "#c8e080" },
  dog: { mapId: "overworld", zone: "near", label: "Dogs", color: "#b0a070" },
  ork: { mapId: "overworld", zone: "edge", label: "Orcs", color: "#8bc46a" },
  bandit: { mapId: "valley", zone: "near", label: "Bandits", color: "#e8b84a" },
  soldier: { mapId: "valley", zone: "edge", label: "Soldiers", color: "#d4a060" },
  black_ork: { mapId: "orc_valley", zone: "near", label: "Black Orcs", color: "#6a8a4a" },
  metin: { mapId: null, zone: "mid", label: "Metins", color: "#c43c2e", allField: true },
};

/** Fixed miniboss / elite spawn areas shown on the map */
export const MINIBOSS_AREAS = [
  {
    id: "alpha_wolf",
    name: "Alpha Wolves",
    mapId: "overworld",
    zone: "mid",
    color: "#e07040",
  },
  {
    id: "elite_ork",
    name: "Orc Captains",
    mapId: "overworld",
    zone: "edge",
    color: "#c43c2e",
  },
  {
    id: "rogue_chief",
    name: "Rogue Chief",
    mapId: "valley",
    x: BANDIT_CAMP.x,
    z: BANDIT_CAMP.z,
    r: BANDIT_CAMP.r || 14,
    color: "#ff5a3a",
    point: true,
  },
  {
    id: "soldier_edge",
    name: "Desert Soldiers",
    mapId: "valley",
    zone: "edge",
    color: "#d4883a",
  },
  {
    id: "black_ork_brute",
    name: "Black Orc Brutes",
    mapId: "orc_valley",
    zone: "mid",
    color: "#a05030",
  },
  {
    id: "orc_chief",
    name: "Orc War Chief",
    mapId: "orc_valley",
    zone: "edge",
    color: "#ff3a2a",
  },
];

/** Metin stones can appear in mid+edge wilderness (not in city) */
export function metinSpawnRing(mapId) {
  const rings = SPAWN_ZONES[mapId];
  if (!rings) return null;
  const half = mapId === "orc_valley" ? 80 : MAP_HALF;
  return {
    minR: Math.max(CITY_RADIUS + 8, rings.mid.minR),
    maxR: Math.min(half - 6, rings.edge.maxR),
  };
}

export function zoneRing(mapId, zone) {
  const rings = SPAWN_ZONES[mapId];
  if (!rings?.[zone]) return null;
  const half = mapId === "orc_valley" ? 80 : MAP_HALF;
  const r = rings[zone];
  return {
    minR: r.minR,
    maxR: Math.min(half - 4, r.maxR),
  };
}

export function questHuntFor(quest) {
  if (!quest) return null;
  const hunt = QUEST_HUNT[quest.target];
  if (!hunt) return null;
  return { ...hunt, questId: quest.id, name: quest.name, giver: quest.giver };
}

export function npcsOnMap(mapId) {
  return NPCS.filter((n) => (n.mapId || "overworld") === mapId);
}

export { TOWER_CORNER };
