/**
 * Field rivers — carved channels + bridge crossings for Shinsoo / Seungryong.
 */
import { CITY_RADIUS, EDGE_PORTAL, MAP_HALF } from "./data.js";

/** @typedef {{ ax:number, az:number, bx:number, bz:number, halfW:number, depth:number, bridgeT:number, deckY:number }} RiverDef */

/** Deck plank thickness (matches meshes.js BoxGeometry height). */
export const BRIDGE_DECK_THICK = 0.45;

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
    deckY: 1.35, // deck center Y
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
    // Aligns bridge local +Z with river flow (Three.js Ry)
    yaw: Math.atan2(dx, dz),
    across: r.halfW * 2 + 10,
    along: 11, // road-width span (slightly generous for walking)
    deckY: r.deckY,
    deckTop: r.deckY + BRIDGE_DECK_THICK * 0.5,
    river: r,
  };
}

/**
 * World → bridge-local (matches Three.js group.rotation.y = yaw).
 * local X = across the river, local Z = along the channel / road width.
 */
export function bridgeLocal(mapId, x, z) {
  const b = bridgeCenter(mapId);
  if (!b) return null;
  const c = Math.cos(b.yaw);
  const s = Math.sin(b.yaw);
  const dx = x - b.x;
  const dz = z - b.z;
  return {
    b,
    // Inverse of Ry: lx = c*dx - s*dz, lz = s*dx + c*dz
    lx: c * dx - s * dz,
    lz: s * dx + c * dz,
  };
}

/** World position of a bridge-local point. */
export function bridgeWorld(mapId, lx, lz) {
  const b = bridgeCenter(mapId);
  if (!b) return null;
  const c = Math.cos(b.yaw);
  const s = Math.sin(b.yaw);
  return {
    x: b.x + c * lx + s * lz,
    z: b.z - s * lx + c * lz,
  };
}

/** Abutment centers at each end of the deck (for road approaches). */
export function bridgeAbutments(mapId) {
  const b = bridgeCenter(mapId);
  if (!b) return null;
  const half = b.across * 0.5 - 0.5;
  return {
    a: bridgeWorld(mapId, -half, 0),
    b: bridgeWorld(mapId, half, 0),
    center: b,
  };
}

/**
 * On the wooden deck (walkable flat).
 * @param {number} [pad] expands the footprint slightly
 */
export function onRiverBridge(mapId, x, z, pad = 0.35) {
  const loc = bridgeLocal(mapId, x, z);
  if (!loc) return false;
  const { b, lx, lz } = loc;
  return Math.abs(lx) < b.across * 0.5 + pad && Math.abs(lz) < b.along * 0.5 + pad;
}

/**
 * Walk height on deck / approach ramps, or null if not on bridge structure.
 */
export function bridgeSurfaceAt(mapId, x, z) {
  const loc = bridgeLocal(mapId, x, z);
  if (!loc) return null;
  const { b, lx, lz } = loc;
  const halfA = b.across * 0.5;
  const halfL = b.along * 0.5;
  const top = b.deckTop;

  // Full deck
  if (Math.abs(lx) <= halfA && Math.abs(lz) <= halfL) return top;

  // End ramps off abutments (along across-axis), keep road width
  const rampLen = 7.5;
  if (Math.abs(lz) <= halfL + 0.6) {
    const overhang = Math.abs(lx) - halfA;
    if (overhang > 0 && overhang < rampLen) {
      const t = 1 - overhang / rampLen;
      const s = t * t * (3 - 2 * t); // smoothstep
      return top * s; // blend down to bank (~0)
    }
  }
  return null;
}

/** Deep channel — not walkable unless on the bridge deck/ramp. */
export function inDeepRiver(mapId, x, z) {
  if (!FIELD_RIVERS[mapId]) return false;
  if (onRiverBridge(mapId, x, z, 0.5)) return false;
  if (bridgeSurfaceAt(mapId, x, z) != null) return false;
  return riverCarve(mapId, x, z) > 1.05;
}

/**
 * Height carve for river. Returns delta to subtract from base hill height.
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
