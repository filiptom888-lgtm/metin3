/** Orc Isles — larger field map east of Seungryong (Area 2). */
export const ORC_MAP_HALF = 80;
export const ORC_MAP_SIZE = ORC_MAP_HALF * 2;

/**
 * Walkable land disks. Main island holds the war tower;
 * outer islets hold black orcs. West islet has the return portal.
 */
export const ORC_ISLANDS = [
  { id: "main", x: 0, z: 0, r: 32, tier: "main" },
  { id: "west", x: -58, z: 0, r: 15, tier: "gate" },
  { id: "ne", x: 42, z: 38, r: 13, tier: "mid" },
  { id: "se", x: 48, z: -32, r: 12, tier: "mid" },
  { id: "nw", x: -28, z: 50, r: 11, tier: "outer" },
  { id: "sw", x: -34, z: -48, r: 12, tier: "outer" },
  { id: "east", x: 62, z: 6, r: 10, tier: "outer" },
  { id: "north", x: 8, z: 60, r: 10, tier: "outer" },
  { id: "south", x: 4, z: -58, r: 11, tier: "outer" },
];

/** Narrow walkable reefs / bridges between islands */
export const ORC_BRIDGES = [
  { x1: -32, z1: 0, x2: -43, z2: 0, w: 3.8 }, // main ↔ west
  { x1: 28, z1: 18, x2: 36, z2: 30, w: 3.4 }, // main ↔ ne
  { x1: 30, z1: -16, x2: 40, z2: -26, w: 3.4 }, // main ↔ se
  { x1: -12, z1: 28, x2: -22, z2: 42, w: 3.2 }, // main ↔ nw
  { x1: -14, z1: -30, x2: -26, z2: -42, w: 3.2 }, // main ↔ sw
  { x1: 30, z1: 4, x2: 52, z2: 6, w: 3.1 }, // main ↔ east
];

export function onOrcIsland(x, z, margin = 0) {
  for (const isle of ORC_ISLANDS) {
    if (Math.hypot(x - isle.x, z - isle.z) <= isle.r + margin) return isle;
  }
  return null;
}

function onOrcBridge(x, z) {
  for (const b of ORC_BRIDGES) {
    const dx = b.x2 - b.x1;
    const dz = b.z2 - b.z1;
    const len = Math.hypot(dx, dz) || 1;
    const t = Math.max(0, Math.min(1, ((x - b.x1) * dx + (z - b.z1) * dz) / (len * len)));
    const px = b.x1 + dx * t;
    const pz = b.z1 + dz * t;
    // Slightly wider than visual so feet don't slip into the water
    if (Math.hypot(x - px, z - pz) <= b.w * 0.72) return true;
  }
  return false;
}

export function onOrcLand(x, z, margin = 0.6) {
  return Boolean(onOrcIsland(x, z, margin) || onOrcBridge(x, z));
}

/** Push a point back onto the nearest walkable land. */
export function clampToOrcLand(x, z) {
  if (onOrcLand(x, z, 0.2)) return { x, z };
  let best = null;
  let bestD = Infinity;
  for (const isle of ORC_ISLANDS) {
    const d = Math.hypot(x - isle.x, z - isle.z);
    const edge = Math.max(0.5, isle.r - 0.8);
    if (d < bestD) {
      bestD = d;
      if (d < 0.01) best = { x: isle.x + edge, z: isle.z };
      else {
        const s = edge / d;
        best = { x: isle.x + (x - isle.x) * s, z: isle.z + (z - isle.z) * s };
      }
    }
  }
  return best || { x: 0, z: 18 };
}

/** Random point on land for a spawn tier. */
export function orcSpawnPoint(zone = "mid") {
  let pool;
  if (zone === "near") pool = ORC_ISLANDS.filter((i) => i.tier === "main");
  else if (zone === "mid") pool = ORC_ISLANDS.filter((i) => i.tier === "main" || i.tier === "mid");
  else pool = ORC_ISLANDS.filter((i) => i.tier === "mid" || i.tier === "outer" || i.tier === "gate");

  for (let attempt = 0; attempt < 40; attempt++) {
    const isle = pool[(Math.random() * pool.length) | 0];
    const ang = Math.random() * Math.PI * 2;
    // Prefer outer ring of each island (away from tower / portal pad)
    const minR = isle.tier === "main" ? 12 : 3;
    const maxR = isle.r - 2.2;
    if (maxR <= minR) continue;
    const r = minR + Math.random() * (maxR - minR);
    const x = isle.x + Math.cos(ang) * r;
    const z = isle.z + Math.sin(ang) * r;
    // Keep clear of west portal pad
    if (Math.hypot(x + 68.5, z) < 8) continue;
    // Keep clear of war tower core
    if (isle.tier === "main" && Math.hypot(x, z) < 9) continue;
    // Keep clear of Isle Gatekeeper teleporter pad (0, 14)
    if (Math.hypot(x, z - 14) < 5.5) continue;
    return { x, z };
  }
  return { x: 18, z: 14 };
}
