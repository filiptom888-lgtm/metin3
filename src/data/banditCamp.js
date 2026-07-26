import { MAP_HALF } from "../game/data.js";

/**
 * Small rogue hamlet — unused NW corner of Seungryong (valley).
 * Far from east/west edge portals; 2–3 houses + respawning bandits + chief.
 */
export const BANDIT_CAMP = {
  mapId: "valley",
  /** Camp center — NW wilderness */
  x: -(MAP_HALF - 32),
  z: -(MAP_HALF - 32),
  /** Spawn / clear radius around camp */
  r: 18,
  /** Target pack size on initial seed (excludes chief) */
  packSize: 8,
  /** Keep at least this many pack members on seed */
  packMin: 5,
  /** Extra supports that spawn with the chief on respawn */
  supportOnBoss: 4,
};

export function inBanditCamp(x, z, pad = 0) {
  const c = BANDIT_CAMP;
  return Math.hypot(x - c.x, z - c.z) < c.r + pad;
}

/** Random point around the hamlet (not on the house cluster) */
export function banditCampPoint(minR = 5, maxR = BANDIT_CAMP.r - 2) {
  const c = BANDIT_CAMP;
  const ang = Math.random() * Math.PI * 2;
  const r = minR + Math.random() * Math.max(0.5, maxR - minR);
  return { x: c.x + Math.cos(ang) * r, z: c.z + Math.sin(ang) * r };
}
