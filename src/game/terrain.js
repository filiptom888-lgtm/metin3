/**
 * Field terrain helpers — hills, beaten roads, height sampling for Shinsoo / Seungryong.
 */
import * as THREE from "three";
import { CITY_RADIUS, EDGE_PORTAL, MAP_HALF, TOWER_CORNER } from "./data.js";

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

/** Axis-aligned beaten roads: city gates → edge portals (+ a few cross trails) */
export function fieldRoads(mapId) {
  const roads = [];
  const halfLen = MAP_HALF - CITY_RADIUS - 1;
  if (mapId === "overworld") {
    // East gate → Seungryong portal
    roads.push({ x0: CITY_RADIUS - 1, z0: 0, x1: EDGE_PORTAL, z1: 0, w: 3.6 });
    // North / south stubs out of gates
    roads.push({ x0: 0, z0: CITY_RADIUS - 1, x1: 0, z1: CITY_RADIUS + 28, w: 2.8 });
    roads.push({ x0: 0, z0: -(CITY_RADIUS - 1), x1: 0, z1: -(CITY_RADIUS + 34), w: 2.8 });
    // Diagonal trail toward Demon Tower corner
    roads.push({
      x0: CITY_RADIUS * 0.7,
      z0: -CITY_RADIUS * 0.7,
      x1: TOWER_CORNER.x - 14,
      z1: TOWER_CORNER.z + 14,
      w: 2.4,
    });
    // Random mid wilderness connector
    roads.push({ x0: 40, z0: 35, x1: 90, z1: -20, w: 2.2 });
  } else if (mapId === "valley") {
    roads.push({ x0: -(CITY_RADIUS - 1), z0: 0, x1: -EDGE_PORTAL, z1: 0, w: 3.6 });
    roads.push({ x0: CITY_RADIUS - 1, z0: 0, x1: EDGE_PORTAL, z1: 0, w: 3.6 });
    roads.push({ x0: 0, z0: CITY_RADIUS - 1, x1: 0, z1: CITY_RADIUS + 32, w: 2.8 });
    roads.push({ x0: 0, z0: -(CITY_RADIUS - 1), x1: 0, z1: -(CITY_RADIUS + 38), w: 2.8 });
    // Trail toward NW bandit country
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
  void halfLen;
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
 * Ground height for field maps. City + roads stay flat for gameplay clarity.
 */
export function fieldHeightAt(x, z, mapId = "overworld") {
  if (mapId !== "overworld" && mapId !== "valley") return 0;
  const dCity = Math.hypot(x, z);
  if (dCity < CITY_RADIUS + 2.5) return 0;
  if (onBeatenRoad(x, z, mapId, 1.1)) return 0;
  if (mapId === "overworld" && Math.hypot(x - EDGE_PORTAL, z) < 10) return 0;
  if (mapId === "valley" && (Math.hypot(x - EDGE_PORTAL, z) < 10 || Math.hypot(x + EDGE_PORTAL, z) < 10)) return 0;
  if (mapId === "overworld" && Math.hypot(x - TOWER_CORNER.x, z - TOWER_CORNER.z) < 16) return 0;

  const fade = Math.min(1, (dCity - CITY_RADIUS - 2.5) / 16);
  const n =
    fbm(x * 0.035 + 10, z * 0.035 + 4) * 2.8 +
    fbm(x * 0.09 - 3, z * 0.09 + 7) * 1.1 -
    1.4;
  const hill = Math.max(0, n) * (mapId === "valley" ? 2.6 : 2.2);
  // Soft rim near map edge
  const edgeDist = MAP_HALF - Math.max(Math.abs(x), Math.abs(z));
  const rim = edgeDist < 14 ? (1 - edgeDist / 14) * 1.8 : 0;
  return (hill + rim) * fade;
}

/** Displace PlaneGeometry positions (local Y before rotation → world up after). */
export function displaceFieldGround(groundMesh, mapId) {
  const geo = groundMesh.geometry;
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const lx = pos.getX(i);
    const ly = pos.getY(i); // in plane space, Y is "up" before rot… actually PlaneGeometry is XY, rotated -90 so local Z becomes world Y
    // PlaneGeometry lies in XY; after rotation.x=-PI/2, local Y → world -Z, local Z → world Y
    // attributes: x,y on plane → after rot, x stays X, y becomes -Z, z becomes Y
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

/** Place dirt road meshes along corridors */
export function addBeatenRoadMeshes(root, mapId, dirtMat) {
  const group = new THREE.Group();
  group.name = "beaten_roads";
  for (const r of fieldRoads(mapId)) {
    const dx = r.x1 - r.x0;
    const dz = r.z1 - r.z0;
    const len = Math.hypot(dx, dz);
    if (len < 2) continue;
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(len, 0.06, r.w),
      dirtMat
    );
    mesh.position.set((r.x0 + r.x1) / 2, 0.05, (r.z0 + r.z1) / 2);
    mesh.rotation.y = Math.atan2(dx, dz);
    mesh.receiveShadow = true;
    group.add(mesh);

    // Worn edge strips
    const edge = new THREE.Mesh(
      new THREE.BoxGeometry(len * 0.98, 0.04, r.w + 1.1),
      dirtMat.clone()
    );
    edge.material.color = new THREE.Color("#6a5a38");
    edge.material.opacity = 0.85;
    edge.material.transparent = true;
    edge.position.copy(mesh.position);
    edge.position.y = 0.03;
    edge.rotation.y = mesh.rotation.y;
    edge.receiveShadow = true;
    group.add(edge);
  }
  root.add(group);
  return group;
}
