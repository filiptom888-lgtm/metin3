/**
 * Field rivers — carved channels + bridge crossings for Shinsoo / Seungryong.
 */
import { CITY_RADIUS, EDGE_PORTAL, MAP_HALF } from "./data.js";

/** @typedef {{ ax:number, az:number, bx:number, bz:number, halfW:number, depth:number, bridgeT:number, deckY:number }} RiverDef */

/** @type {Record<string, RiverDef>} */
export const FIELD_RIVERS = {
  // Shinsoo — cuts the east road to Seungryong; must use the bridge
  overworld: {
    ax: 48,
    az: -105,
    bx: 108,
    bz: 95,
    halfW: 16, // ~32m wide channel
    depth: 5.2,
    bridgeT: 0.525, // crosses east Shinsoo road (z≈0)
    deckY: 1.35,
  },
  // Seungryong — diagonal cut south of city toward east portal
  valley: {
    ax: -20,
    az: -110,
    bx: 110,
    bz: 40,
    halfW: 14,
    depth: 4.8,
    bridgeT: 0.55,
    deckY: 1.25,
  },
};

function segProj(x, z, ax, az, bx, bz) {
  const dx = bx - ax;
  const dz = bz - az;
  const len2 = dx * dx + dz * dz || 1;
  let t = ((x - ax) * dx + (z - az) * dz) / len2;
  t = Math.max(0, Math.min(1, t));
  const px = ax + dx * t;
  const pz = az + dz * t;
  return { t, px, pz, dist: Math.hypot(x - px, z - pz), len: Math.sqrt(len2), dx, dz };
}

export function riverDef(mapId) {
  return FIELD_RIVERS[mapId] || null;
}

/** Signed distance into river channel (0 = bank edge, negative outside). */
export function riverChannelDist(mapId, x, z) {
  const r = FIELD_RIVERS[mapId];
  if (!r) return Infinity;
  const { dist } = segProj(x, z, r.ax, r.az, r.bx, r.bz);
  return dist - r.halfW;
}

export function inRiver(mapId, x, z, pad = 0) {
  return riverChannelDist(mapId, x, z) < pad;
}

export function bridgeCenter(mapId) {
  const r = FIELD_RIVERS[mapId];
  if (!r) return null;
  const dx = r.bx - r.ax;
  const dz = r.bz - r.az;
  return {
    x: r.ax + dx * r.bridgeT,
    z: r.az + dz * r.bridgeT,
    yaw: Math.atan2(dx, dz),
    across: r.halfW * 2 + 10,
    along: 9.5,
    deckY: r.deckY,
    river: r,
  };
}

/** On the wooden deck (walkable flat). */
export function onRiverBridge(mapId, x, z) {
  const b = bridgeCenter(mapId);
  if (!b) return false;
  const c = Math.cos(-b.yaw);
  const s = Math.sin(-b.yaw);
  const lx = (x - b.x) * c - (z - b.z) * s;
  const lz = (x - b.x) * s + (z - b.z) * c;
  return Math.abs(lx) < b.across * 0.5 && Math.abs(lz) < b.along * 0.5;
}

/**
 * Height carve for river. Returns delta to subtract from base hill height
 * (positive number = how much to dig). Bridge returns special via onRiverBridge.
 */
export function riverCarve(mapId, x, z) {
  const r = FIELD_RIVERS[mapId];
  if (!r) return 0;
  if (Math.hypot(x, z) < CITY_RADIUS + 6) return 0;
  const { dist } = segProj(x, z, r.ax, r.az, r.bx, r.bz);
  const bank = r.halfW;
  if (dist > bank + 10) return 0;
  // Smooth banks → deep center
  const u = Math.max(0, 1 - dist / (bank + 8));
  const bowl = u * u * (3 - 2 * u); // smoothstep
  const center = Math.max(0, 1 - dist / bank);
  return r.depth * (bowl * 0.35 + center * center * 0.9);
}

export function riverWaterY(mapId) {
  const r = FIELD_RIVERS[mapId];
  if (!r) return -1;
  return -r.depth * 0.62;
}

/** Keep portals / city clear of river endpoints */
export function riverAvoidPortal(mapId, x, z) {
  if (mapId === "overworld" && Math.hypot(x - EDGE_PORTAL, z) < 12) return true;
  if (mapId === "valley" && (Math.hypot(x - EDGE_PORTAL, z) < 12 || Math.hypot(x + EDGE_PORTAL, z) < 12)) return true;
  if (Math.max(Math.abs(x), Math.abs(z)) > MAP_HALF - 4) return true;
  return false;
}
