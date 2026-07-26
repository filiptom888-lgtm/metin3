/**
 * Field terrain helpers — hills, rivers, beaten roads, height sampling.
 */
import * as THREE from "three";
import { CITY_RADIUS, EDGE_PORTAL, MAP_HALF, TOWER_CORNER } from "./data.js";
import {
  inRiver,
  onRiverBridge,
  riverCarve,
  riverDef,
  bridgeCenter,
} from "./rivers.js";

function hash2(ix, iz) {
  const n = Math.sin(ix * 127.1 + iz * 311.7) * 43758.5453123;
  return n - Math.floor(n);
}

function valueNoise(x, z) {
  const x0 = Math.floor(x);
  const z0 = Math.floor(z);
  const fx = x - x0;
  const fz = z - z0;
  const ux = fx * fx * (3 - 2 * fx);
  const uz = fz * fz * (3 - 2 * fz);
  const a = hash2(x0, z0);
  const b = hash2(x0 + 1, z0);
  const c = hash2(x0, z0 + 1);
  const d = hash2(x0 + 1, z0 + 1);
  return a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz;
}

function fbm(x, z) {
  let v = 0;
  let a = 0.55;
  let f = 1;
  for (let i = 0; i < 4; i++) {
    v += valueNoise(x * f, z * f) * a;
    a *= 0.5;
    f *= 2.05;
  }
  return v;
}

/** Axis-aligned beaten roads: city gates → edge portals (+ trails). East Shinsoo road stops at bridge approaches. */
export function fieldRoads(mapId) {
  const roads = [];
  if (mapId === "overworld") {
    const b = bridgeCenter("overworld");
    const westX = b ? b.x - b.across * 0.5 - 1 : 70;
    const eastX = b ? b.x + b.across * 0.5 + 1 : 85;
    // East gate → bridge west abutment
    roads.push({ x0: CITY_RADIUS - 1, z0: 0, x1: westX, z1: 0, w: 3.6 });
    // Bridge east abutment → Seungryong portal
    roads.push({ x0: eastX, z0: 0, x1: EDGE_PORTAL, z1: 0, w: 3.6 });
    roads.push({ x0: 0, z0: CITY_RADIUS - 1, x1: 0, z1: CITY_RADIUS + 28, w: 2.8 });
    roads.push({ x0: 0, z0: -(CITY_RADIUS - 1), x1: 0, z1: -(CITY_RADIUS + 34), w: 2.8 });
    roads.push({
      x0: CITY_RADIUS * 0.7,
      z0: -CITY_RADIUS * 0.7,
      x1: TOWER_CORNER.x - 14,
      z1: TOWER_CORNER.z + 14,
      w: 2.4,
    });
    roads.push({ x0: 40, z0: 35, x1: 90, z1: -20, w: 2.2 });
  } else if (mapId === "valley") {
    const b = bridgeCenter("valley");
    // Main E–W roads; bridge covers the river cut near SE
    roads.push({ x0: -(CITY_RADIUS - 1), z0: 0, x1: -EDGE_PORTAL, z1: 0, w: 3.6 });
    if (b) {
      const approachZ = b.z;
      roads.push({ x0: CITY_RADIUS - 1, z0: 0, x1: b.x - 8, z1: approachZ * 0.15, w: 3.2 });
      roads.push({ x0: b.x + 8, z0: approachZ * 0.15, x1: EDGE_PORTAL, z1: 0, w: 3.2 });
    } else {
      roads.push({ x0: CITY_RADIUS - 1, z0: 0, x1: EDGE_PORTAL, z1: 0, w: 3.6 });
    }
    roads.push({ x0: 0, z0: CITY_RADIUS - 1, x1: 0, z1: CITY_RADIUS + 32, w: 2.8 });
    roads.push({ x0: 0, z0: -(CITY_RADIUS - 1), x1: 0, z1: -(CITY_RADIUS + 38), w: 2.8 });
    roads.push({
      x0: -(CITY_RADIUS * 0.65),
      z0: -(CITY_RADIUS * 0.65),
      x1: -(MAP_HALF - 40),
      z1: -(MAP_HALF - 40),
      w: 2.5,
    });
    roads.push({ x0: -50, z0: 40, x1: 55, z1: 70, w: 2.2 });
    roads.push({ x0: 30, z0: -45, x1: 85, z1: -15, w: 2.1 });
  }
  return roads;
}

export function distToRoad(x, z, mapId) {
  let best = Infinity;
  for (const r of fieldRoads(mapId)) {
    const dx = r.x1 - r.x0;
    const dz = r.z1 - r.z0;
    const len2 = dx * dx + dz * dz || 1;
    let t = ((x - r.x0) * dx + (z - r.z0) * dz) / len2;
    t = Math.max(0, Math.min(1, t));
    const px = r.x0 + dx * t;
    const pz = r.z0 + dz * t;
    const d = Math.hypot(x - px, z - pz) - r.w * 0.5;
    if (d < best) best = d;
  }
  return best;
}

export function onBeatenRoad(x, z, mapId, pad = 0.4) {
  return distToRoad(x, z, mapId) < pad;
}

/**
 * Ground height for field maps. City + roads + bridge decks stay walkable.
 */
export function fieldHeightAt(x, z, mapId = "overworld") {
  if (mapId !== "overworld" && mapId !== "valley") return 0;
  if (onRiverBridge(mapId, x, z)) {
    return bridgeCenter(mapId)?.deckY ?? 1.2;
  }
  const dCity = Math.hypot(x, z);
  if (dCity < CITY_RADIUS + 2.5) return 0;
  if (onBeatenRoad(x, z, mapId, 1.1)) {
    // Roads follow gentle terrain but never dive into the river
    if (inRiver(mapId, x, z, -2)) return 0.05;
    const fade = Math.min(1, (dCity - CITY_RADIUS - 2.5) / 16);
    const n = fbm(x * 0.035 + 10, z * 0.035 + 4) * 1.2 - 0.5;
    return Math.max(0, n) * fade * 0.35;
  }
  if (mapId === "overworld" && Math.hypot(x - EDGE_PORTAL, z) < 10) return 0;
  if (mapId === "valley" && (Math.hypot(x - EDGE_PORTAL, z) < 10 || Math.hypot(x + EDGE_PORTAL, z) < 10)) return 0;
  if (mapId === "overworld" && Math.hypot(x - TOWER_CORNER.x, z - TOWER_CORNER.z) < 16) return 0;

  const fade = Math.min(1, (dCity - CITY_RADIUS - 2.5) / 16);
  const n =
    fbm(x * 0.035 + 10, z * 0.035 + 4) * 2.4 +
    fbm(x * 0.09 - 3, z * 0.09 + 7) * 0.95 -
    1.25;
  let hill = Math.max(0, n) * (mapId === "valley" ? 2.2 : 1.85);
  const edgeDist = MAP_HALF - Math.max(Math.abs(x), Math.abs(z));
  const rim = edgeDist < 14 ? (1 - edgeDist / 14) * 1.5 : 0;
  let h = (hill + rim) * fade;

  // Carve river channel
  const dig = riverCarve(mapId, x, z);
  if (dig > 0) h -= dig;

  return h;
}

/** Displace PlaneGeometry positions for hills + river. */
export function displaceFieldGround(groundMesh, mapId) {
  const geo = groundMesh.geometry;
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const lx = pos.getX(i);
    const ly = pos.getY(i);
    const wx = lx;
    const wz = -ly;
    const h = fieldHeightAt(wx, wz, mapId);
    pos.setZ(i, h);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  groundMesh.userData.mapId = mapId;
  groundMesh.userData.heightFn = true;
}

/** Place dirt road meshes that follow terrain height (segmented). */
export function addBeatenRoadMeshes(root, mapId, dirtMat) {
  const group = new THREE.Group();
  group.name = "beaten_roads";
  for (const r of fieldRoads(mapId)) {
    const dx = r.x1 - r.x0;
    const dz = r.z1 - r.z0;
    const len = Math.hypot(dx, dz);
    if (len < 2) continue;
    const segs = Math.max(4, Math.ceil(len / 6));
    for (let i = 0; i < segs; i++) {
      const t0 = i / segs;
      const t1 = (i + 1) / segs;
      const x0 = r.x0 + dx * t0;
      const z0 = r.z0 + dz * t0;
      const x1 = r.x0 + dx * t1;
      const z1 = r.z0 + dz * t1;
      const mx = (x0 + x1) / 2;
      const mz = (z0 + z1) / 2;
      // Don't lay road deck into the river — bridge handles that
      if (inRiver(mapId, mx, mz, -1) && !onRiverBridge(mapId, mx, mz)) continue;
      const h0 = fieldHeightAt(x0, z0, mapId);
      const h1 = fieldHeightAt(x1, z1, mapId);
      const h = (h0 + h1) / 2;
      const segLen = Math.hypot(x1 - x0, z1 - z0);
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(segLen + 0.15, 0.07, r.w), dirtMat);
      mesh.position.set(mx, h + 0.04, mz);
      mesh.rotation.y = Math.atan2(dx, dz);
      // Pitch to follow slope
      const slope = Math.atan2(h1 - h0, segLen || 1);
      mesh.rotation.x = -slope * 0.15;
      mesh.receiveShadow = true;
      group.add(mesh);
    }
  }
  root.add(group);
  return group;
}

export { riverDef, bridgeCenter, inRiver, onRiverBridge };
