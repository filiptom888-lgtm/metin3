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
  bridgeAbutments,
  bridgeSurfaceAt,
  inDeepRiver,
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
    const abut = bridgeAbutments("overworld");
    if (abut?.a && abut?.b) {
      // Pick west/east abutments by world X
      const west = abut.a.x <= abut.b.x ? abut.a : abut.b;
      const east = abut.a.x <= abut.b.x ? abut.b : abut.a;
      roads.push({ x0: CITY_RADIUS - 1, z0: 0, x1: west.x, z1: west.z, w: 5.2 });
      roads.push({ x0: east.x, z0: east.z, x1: EDGE_PORTAL, z1: 0, w: 5.2 });
    } else {
      roads.push({ x0: CITY_RADIUS - 1, z0: 0, x1: EDGE_PORTAL, z1: 0, w: 5.2 });
    }
    roads.push({ x0: 0, z0: CITY_RADIUS - 1, x1: 0, z1: CITY_RADIUS + 36, w: 4.2 });
    roads.push({ x0: 0, z0: -(CITY_RADIUS - 1), x1: 0, z1: -(CITY_RADIUS + 40), w: 4.2 });
    roads.push({
      x0: CITY_RADIUS * 0.7,
      z0: -CITY_RADIUS * 0.7,
      x1: TOWER_CORNER.x - 14,
      z1: TOWER_CORNER.z + 14,
      w: 3.6,
    });
    roads.push({ x0: 40, z0: 35, x1: 90, z1: -20, w: 3.4 });
  } else if (mapId === "valley") {
    const abut = bridgeAbutments("valley");
    roads.push({ x0: -(CITY_RADIUS - 1), z0: 0, x1: -EDGE_PORTAL, z1: 0, w: 5.2 });
    if (abut?.a && abut?.b) {
      const west = abut.a.x <= abut.b.x ? abut.a : abut.b;
      const east = abut.a.x <= abut.b.x ? abut.b : abut.a;
      roads.push({ x0: CITY_RADIUS - 1, z0: 0, x1: west.x, z1: west.z, w: 4.6 });
      roads.push({ x0: east.x, z0: east.z, x1: EDGE_PORTAL, z1: 0, w: 4.6 });
    } else {
      roads.push({ x0: CITY_RADIUS - 1, z0: 0, x1: EDGE_PORTAL, z1: 0, w: 5.2 });
    }
    roads.push({ x0: 0, z0: CITY_RADIUS - 1, x1: 0, z1: CITY_RADIUS + 36, w: 4.2 });
    roads.push({ x0: 0, z0: -(CITY_RADIUS - 1), x1: 0, z1: -(CITY_RADIUS + 42), w: 4.2 });
    roads.push({
      x0: -(CITY_RADIUS * 0.65),
      z0: -(CITY_RADIUS * 0.65),
      x1: -(MAP_HALF - 40),
      z1: -(MAP_HALF - 40),
      w: 3.8,
    });
    roads.push({ x0: -50, z0: 40, x1: 55, z1: 70, w: 3.4 });
    roads.push({ x0: 30, z0: -45, x1: 85, z1: -15, w: 3.2 });
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
 * Ground height for field maps. City basin stays nearly flat; soft rolls farther out.
 */
export function fieldHeightAt(x, z, mapId = "overworld") {
  if (mapId !== "overworld" && mapId !== "valley") return 0;

  // Deck + approach ramps (must win over river carve)
  const bridgeH = bridgeSurfaceAt(mapId, x, z);
  if (bridgeH != null) return bridgeH;

  const dCity = Math.hypot(x, z);
  if (dCity < CITY_RADIUS + 2.5) return 0;
  if (onBeatenRoad(x, z, mapId, 1.1)) {
    // Roads follow gentle terrain but never dive into the river
    if (inRiver(mapId, x, z, -2)) return 0.05;
    const fade = Math.min(1, (dCity - CITY_RADIUS - 2.5) / 28);
    const n = fbm(x * 0.028 + 10, z * 0.028 + 4) * 0.9 - 0.4;
    return Math.max(0, n) * fade * 0.22;
  }
  if (mapId === "overworld" && Math.hypot(x - EDGE_PORTAL, z) < 10) return 0;
  if (mapId === "valley" && (Math.hypot(x - EDGE_PORTAL, z) < 10 || Math.hypot(x + EDGE_PORTAL, z) < 10))
    return 0;
  if (mapId === "overworld" && Math.hypot(x - TOWER_CORNER.x, z - TOWER_CORNER.z) < 16) return 0;

  // Wide flat hunting basin around the city — hills only ramp in past ~55–60m
  const basinEnd = 58;
  const mid = Math.min(1, Math.max(0, (dCity - CITY_RADIUS - 2.5) / (basinEnd - CITY_RADIUS - 2.5)));
  const t = mid * mid * (3 - 2 * mid); // smoothstep 0→1

  // Low-frequency rolls only (high-freq noise looked like square mesas)
  const n =
    fbm(x * 0.018 + 10, z * 0.018 + 4) * 1.05 +
    fbm(x * 0.042 - 3, z * 0.042 + 7) * 0.28 -
    0.52;
  const baseAmp = mapId === "valley" ? 0.38 : 0.32;
  const outerAmp = mapId === "valley" ? 1.05 : 0.9;
  let hill = Math.max(0, n) * (baseAmp + t * (outerAmp - baseAmp));
  // Keep the inner half of the basin almost pancake-flat
  hill *= 0.08 + 0.92 * t;

  const edgeDist = MAP_HALF - Math.max(Math.abs(x), Math.abs(z));
  // Soft rise into the mountain rim (outer ring only)
  const rim = edgeDist < 32 ? Math.pow(1 - edgeDist / 32, 1.5) * 3.8 : 0;
  let h = hill + rim * Math.min(1, t + 0.35);

  // Carve river channel
  const dig = riverCarve(mapId, x, z);
  if (dig > 0) h -= dig;

  // Never sink below the visual ground for walkable surfaces
  if (h < 0 && !inRiver(mapId, x, z, 1.5)) h = 0;
  return h;
}

/** True if inside the mountain foothill band (not walkable). */
export function inMountainRim(x, z, half = MAP_HALF) {
  const edgeDist = half - Math.max(Math.abs(x), Math.abs(z));
  // Match foothill placement (~half-4 inward); leave portal corridors open via isFieldWalkable
  return edgeDist < 14;
}

/** True if a field position is walkable (bridge OK, deep river / mountain rim blocked). */
export function isFieldWalkable(mapId, x, z) {
  if (mapId !== "overworld" && mapId !== "valley") return true;
  if (bridgeSurfaceAt(mapId, x, z) != null) return true;
  if (onRiverBridge(mapId, x, z, 0.5)) return true;
  if (inDeepRiver(mapId, x, z)) return false;
  // Block clipping into mountain foothills (except portal gaps near map edge)
  if (inMountainRim(x, z)) {
    const nearPortal =
      (mapId === "overworld" && Math.hypot(x - EDGE_PORTAL, z) < 14) ||
      (mapId === "valley" &&
        (Math.hypot(x - EDGE_PORTAL, z) < 14 || Math.hypot(x + EDGE_PORTAL, z) < 14)) ||
      (mapId === "overworld" && Math.hypot(x - TOWER_CORNER.x, z - TOWER_CORNER.z) < 18);
    if (!nearPortal) return false;
  }
  return true;
}

/**
 * Keep movement on banks / bridge — slide along axes if the full step is blocked.
 */
export function clampFieldWalk(mapId, x, z, fromX, fromZ) {
  if (mapId !== "overworld" && mapId !== "valley") return { x, z };
  if (isFieldWalkable(mapId, x, z)) return { x, z };
  if (isFieldWalkable(mapId, x, fromZ)) return { x, z: fromZ };
  if (isFieldWalkable(mapId, fromX, z)) return { x: fromX, z };
  return { x: fromX, z: fromZ };
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

/**
 * Layered dirt roads that follow terrain — bed + worn center + soft shoulders.
 * `dirtMat` is the main packed earth; shoulder/edge mats are derived if omitted.
 */
export function addBeatenRoadMeshes(root, mapId, dirtMat, edgeMat = null) {
  const group = new THREE.Group();
  group.name = "beaten_roads";
  const shoulder =
    edgeMat ||
    new THREE.MeshStandardMaterial({
      color: "#5a6a38",
      roughness: 0.98,
      transparent: true,
      opacity: 0.78,
    });
  const ruts = new THREE.MeshStandardMaterial({
    color: "#6a4a28",
    roughness: 0.97,
    map: dirtMat?.map || null,
  });

  for (const r of fieldRoads(mapId)) {
    const dx = r.x1 - r.x0;
    const dz = r.z1 - r.z0;
    const len = Math.hypot(dx, dz);
    if (len < 2) continue;
    const yaw = Math.atan2(dx, dz);
    const segs = Math.max(6, Math.ceil(len / 4.5));
    for (let i = 0; i < segs; i++) {
      const t0 = i / segs;
      const t1 = (i + 1) / segs;
      const x0 = r.x0 + dx * t0;
      const z0 = r.z0 + dz * t0;
      const x1 = r.x0 + dx * t1;
      const z1 = r.z0 + dz * t1;
      const mx = (x0 + x1) / 2;
      const mz = (z0 + z1) / 2;
      if (inRiver(mapId, mx, mz, -1) && !onRiverBridge(mapId, mx, mz)) continue;
      const h0 = fieldHeightAt(x0, z0, mapId);
      const h1 = fieldHeightAt(x1, z1, mapId);
      const h = (h0 + h1) / 2;
      const segLen = Math.hypot(x1 - x0, z1 - z0) + 0.2;
      const slope = Math.atan2(h1 - h0, segLen || 1);

      // Soft grass/dirt shoulder under the road (wider)
      const bed = new THREE.Mesh(new THREE.BoxGeometry(segLen, 0.05, r.w + 2.4), shoulder);
      bed.position.set(mx, h + 0.02, mz);
      bed.rotation.y = yaw;
      bed.rotation.x = -slope * 0.12;
      bed.receiveShadow = true;
      group.add(bed);

      // Main packed path
      const path = new THREE.Mesh(new THREE.BoxGeometry(segLen, 0.08, r.w), dirtMat);
      path.position.set(mx, h + 0.055, mz);
      path.rotation.y = yaw;
      path.rotation.x = -slope * 0.12;
      path.receiveShadow = true;
      group.add(path);

      // Worn center ruts (two thin strips)
      {
        const plen = Math.hypot(dx, dz) || 1;
        const px = -dz / plen;
        const pz = dx / plen;
        for (const side of [-1, 1]) {
          const rut = new THREE.Mesh(new THREE.BoxGeometry(segLen * 0.98, 0.04, 0.42), ruts);
          rut.position.set(mx + px * side * 0.6, h + 0.09, mz + pz * side * 0.6);
          rut.rotation.y = yaw;
          rut.rotation.x = -slope * 0.12;
          rut.receiveShadow = true;
          group.add(rut);
        }
      }
    }
  }
  root.add(group);
  return group;
}

export { riverDef, bridgeCenter, inRiver, onRiverBridge, inDeepRiver, bridgeSurfaceAt };
