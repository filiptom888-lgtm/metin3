import * as THREE from "three";
import { CLASSES, MAP_HALF, MAP_SIZE, CITY_RADIUS, CITY_GATE, EDGE_PORTAL, TOWER_CORNER } from "./data.js";
import { ORC_BRIDGES, ORC_ISLANDS, ORC_MAP_HALF, ORC_MAP_SIZE } from "../data/orcMap.js";
import { BANDIT_CAMP } from "../data/banditCamp.js";
import { campsOnMap } from "../data/wildCamps.js";
import { outpostsOnMap } from "../data/outposts.js";
import { NatureKit } from "./NatureKit.js";
import { AssetKit } from "./AssetKit.js";
import {
  addBeatenRoadMeshes,
  displaceFieldGround,
  distToRoad,
  fieldHeightAt,
  fieldRoads,
  onBeatenRoad,
  inRiver,
  bridgeCenter,
} from "./terrain.js";
import { riverDef, riverWaterY } from "./rivers.js";

export { fieldHeightAt };

function hexRgb(hex) {
  const h = String(hex || "#888888").replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = parseInt(full, 16) || 0x888888;
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function canvasTex(draw, size = 256, repeatX = 1, repeatY = 1) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  draw(c.getContext("2d"), size);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeatX, repeatY);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function texNoise(base, variance, size = 128) {
  return canvasTex((ctx, s) => {
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < s * 10; i++) {
      const v = (Math.random() * variance) | 0;
      ctx.fillStyle = `rgba(${v},${v},${v},${0.08 + Math.random() * 0.14})`;
      ctx.fillRect(Math.random() * s, Math.random() * s, 2 + Math.random() * 4, 2);
    }
  }, size);
}

/** Cartoon brick with mortar + hairline cracks */
function makeBrickTexture({
  brick = "#8a6a52",
  mortar = "#d8cbb8",
  vary = 28,
  crack = true,
} = {}) {
  const base = hexRgb(brick);
  return canvasTex((ctx, s) => {
    ctx.fillStyle = mortar;
    ctx.fillRect(0, 0, s, s);
    const bw = 28;
    const bh = 14;
    for (let row = 0; row < s / bh + 1; row++) {
      const off = row % 2 ? bw * 0.5 : 0;
      for (let col = -1; col < s / bw + 1; col++) {
        const x = col * bw + off + 1;
        const y = row * bh + 1;
        const dr = ((Math.random() - 0.5) * vary) | 0;
        const dg = ((Math.random() - 0.5) * vary * 0.7) | 0;
        const db = ((Math.random() - 0.5) * vary * 0.5) | 0;
        ctx.fillStyle = `rgb(${base.r + dr | 0},${base.g + dg | 0},${base.b + db | 0})`;
        ctx.fillRect(x, y, bw - 2, bh - 2);
        // soft highlight for cartoon clay look
        ctx.fillStyle = "rgba(255,240,210,0.12)";
        ctx.fillRect(x + 2, y + 1, bw - 8, 3);
      }
    }
    if (crack) {
      ctx.strokeStyle = "rgba(40,28,20,0.35)";
      ctx.lineWidth = 1.2;
      for (let i = 0; i < 14; i++) {
        ctx.beginPath();
        let x = Math.random() * s;
        let y = Math.random() * s;
        ctx.moveTo(x, y);
        for (let j = 0; j < 4; j++) {
          x += (Math.random() - 0.5) * 28;
          y += 6 + Math.random() * 16;
          ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
    }
  }, 256);
}

/** Warm cobblestone plaza */
function makeCobbleTexture(warm = true) {
  return canvasTex((ctx, s) => {
    ctx.fillStyle = warm ? "#6a5a44" : "#5a584e";
    ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 220; i++) {
      const x = Math.random() * s;
      const y = Math.random() * s;
      const rw = 10 + Math.random() * 16;
      const rh = 8 + Math.random() * 12;
      const shade = warm
        ? 140 + ((Math.random() * 50) | 0)
        : 120 + ((Math.random() * 45) | 0);
      ctx.fillStyle = `rgb(${shade},${shade - 18},${shade - 40})`;
      ctx.beginPath();
      ctx.ellipse(x, y, rw, rh, Math.random() * Math.PI, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(50,40,28,0.35)";
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = "rgba(255,230,180,0.08)";
      ctx.beginPath();
      ctx.ellipse(x - 2, y - 2, rw * 0.45, rh * 0.35, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    // moss / cozy patches
    for (let i = 0; i < 18; i++) {
      ctx.fillStyle = "rgba(70,110,55,0.18)";
      ctx.beginPath();
      ctx.ellipse(Math.random() * s, Math.random() * s, 8 + Math.random() * 18, 5 + Math.random() * 10, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }, 256);
}

/** Soft plaster with faint brick peek + wall cracks */
function makePlasterTexture(baseHex = "#c8b090") {
  const base = hexRgb(baseHex);
  return canvasTex((ctx, s) => {
    ctx.fillStyle = `rgb(${base.r},${base.g},${base.b})`;
    ctx.fillRect(0, 0, s, s);
    // mottled plaster
    for (let i = 0; i < 900; i++) {
      const v = ((Math.random() - 0.5) * 36) | 0;
      ctx.fillStyle = `rgba(${base.r + v},${base.g + v},${base.b + v},0.35)`;
      ctx.fillRect(Math.random() * s, Math.random() * s, 3 + Math.random() * 6, 2 + Math.random() * 4);
    }
    // faint brick under plaster
    ctx.strokeStyle = "rgba(90,60,40,0.12)";
    ctx.lineWidth = 1;
    for (let y = 0; y < s; y += 16) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(s, y);
      ctx.stroke();
      const off = (y / 16) % 2 ? 14 : 0;
      for (let x = off; x < s; x += 28) {
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x, y + 16);
        ctx.stroke();
      }
    }
    // cozy cracks
    ctx.strokeStyle = "rgba(60,40,28,0.28)";
    ctx.lineWidth = 1.4;
    for (let i = 0; i < 8; i++) {
      ctx.beginPath();
      let x = 20 + Math.random() * (s - 40);
      let y = 10 + Math.random() * (s - 20);
      ctx.moveTo(x, y);
      for (let j = 0; j < 5; j++) {
        x += (Math.random() - 0.5) * 22;
        y += 8 + Math.random() * 18;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  }, 256);
}

function makeRoofTileTexture(hex = "#7a2e28") {
  const base = hexRgb(hex);
  return canvasTex((ctx, s) => {
    ctx.fillStyle = `rgb(${base.r},${base.g},${base.b})`;
    ctx.fillRect(0, 0, s, s);
    const th = 12;
    for (let row = 0; row < s / th + 1; row++) {
      const off = row % 2 ? 10 : 0;
      for (let col = -1; col < s / 20 + 1; col++) {
        const x = col * 20 + off;
        const y = row * th;
        const dr = ((Math.random() - 0.5) * 24) | 0;
        ctx.fillStyle = `rgb(${base.r + dr | 0},${base.g + (dr * 0.5) | 0},${base.b + (dr * 0.3) | 0})`;
        ctx.beginPath();
        ctx.moveTo(x, y + 2);
        ctx.quadraticCurveTo(x + 10, y + th, x + 20, y + 2);
        ctx.lineTo(x + 20, y);
        ctx.lineTo(x, y);
        ctx.fill();
      }
    }
  }, 128);
}

function makeGrassTexture() {
  return canvasTex((ctx, s) => {
    ctx.fillStyle = "#3f7a38";
    ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 5200; i++) {
      const g = 85 + ((Math.random() * 70) | 0);
      ctx.fillStyle = `rgb(${35 + (g % 28)},${g},${28 + (g % 22)})`;
      ctx.fillRect(Math.random() * s, Math.random() * s, 2, 2);
    }
    // cartoon grass tufts
    for (let i = 0; i < 180; i++) {
      const x = Math.random() * s;
      const y = Math.random() * s;
      ctx.strokeStyle = `rgba(${40 + Math.random() * 40 | 0},${120 + Math.random() * 80 | 0},40,0.55)`;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(x - 2, y - 6, x + (Math.random() - 0.5) * 4, y - 10 - Math.random() * 6);
      ctx.stroke();
    }
    for (let i = 0; i < 24; i++) {
      ctx.fillStyle = "rgba(120, 95, 55, 0.22)";
      ctx.beginPath();
      ctx.ellipse(Math.random() * s, Math.random() * s, 10 + Math.random() * 26, 7 + Math.random() * 14, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    // tiny flower dots
    for (let i = 0; i < 40; i++) {
      ctx.fillStyle = Math.random() < 0.5 ? "rgba(255,210,120,0.55)" : "rgba(240,140,160,0.5)";
      ctx.beginPath();
      ctx.arc(Math.random() * s, Math.random() * s, 1.2 + Math.random(), 0, Math.PI * 2);
      ctx.fill();
    }
  }, 256, MAP_SIZE / 8, MAP_SIZE / 8);
}

function makeDirtTexture() {
  return canvasTex((ctx, s) => {
    ctx.fillStyle = "#7a5634";
    ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 6000; i++) {
      const r = 95 + ((Math.random() * 55) | 0);
      const g = 65 + ((Math.random() * 40) | 0);
      const b = 38 + ((Math.random() * 28) | 0);
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.fillRect(Math.random() * s, Math.random() * s, 2, 2);
    }
    for (let i = 0; i < 36; i++) {
      ctx.fillStyle = "rgba(55, 38, 22, 0.2)";
      ctx.beginPath();
      ctx.ellipse(Math.random() * s, Math.random() * s, 10 + Math.random() * 28, 6 + Math.random() * 14, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    // dry grass wisps
    for (let i = 0; i < 90; i++) {
      ctx.strokeStyle = "rgba(140,120,60,0.35)";
      ctx.beginPath();
      const x = Math.random() * s;
      const y = Math.random() * s;
      ctx.moveTo(x, y);
      ctx.lineTo(x + (Math.random() - 0.5) * 5, y - 8);
      ctx.stroke();
    }
  }, 256, MAP_SIZE / 8, MAP_SIZE / 8);
}

function makeIslandGrassTexture() {
  return canvasTex((ctx, s) => {
    ctx.fillStyle = "#3a5230";
    ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 4000; i++) {
      const g = 60 + ((Math.random() * 55) | 0);
      ctx.fillStyle = `rgb(${30 + (g % 20)},${g},${25 + (g % 18)})`;
      ctx.fillRect(Math.random() * s, Math.random() * s, 2, 2);
    }
  }, 128, 4, 4);
}

function makeSandTexture() {
  return canvasTex((ctx, s) => {
    ctx.fillStyle = "#6a5a3a";
    ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 3500; i++) {
      const v = 140 + ((Math.random() * 50) | 0);
      ctx.fillStyle = `rgb(${v},${v - 25},${v - 55})`;
      ctx.fillRect(Math.random() * s, Math.random() * s, 2, 2);
    }
  }, 128, 3, 3);
}

function mat(color, opts = {}) {
  return new THREE.MeshStandardMaterial({
    color: opts.map ? opts.tint ?? "#ffffff" : color,
    map: opts.map || null,
    roughness: opts.roughness ?? 0.75,
    metalness: opts.metalness ?? 0.08,
    flatShading: opts.flat ?? true,
    emissive: opts.emissive ?? 0x000000,
    emissiveIntensity: opts.emissiveIntensity ?? 0,
    transparent: opts.transparent ?? false,
    opacity: opts.opacity ?? 1,
    depthWrite: opts.depthWrite ?? true,
  });
}

function finalizeMapSmoke(root) {
  const list = [];
  root.traverse((o) => {
    if (o.userData?.smoke) list.push(o);
  });
  root.userData.smokeGroups = list;
}

/** Soft rising chimney smoke — animated via animateWorldSmoke */
function addChimneySmoke(parent, x, y, z, { scale = 1, tint = "#d8d0c4" } = {}) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  g.userData.smoke = true;
  for (let i = 0; i < 4; i++) {
    const puff = new THREE.Mesh(
      new THREE.SphereGeometry((0.16 + i * 0.05) * scale, 6, 5),
      mat(tint, {
        roughness: 1,
        transparent: true,
        opacity: 0.38 - i * 0.05,
        depthWrite: false,
        flat: true,
      })
    );
    puff.position.y = i * 0.28 * scale;
    puff.userData.smokePhase = i * 1.15;
    puff.userData.smokeScale = scale;
    g.add(puff);
  }
  parent.add(g);
  return g;
}

export function animateWorldSmoke(root, t) {
  const list = root?.userData?.smokeGroups;
  if (!list?.length) return;
  for (const group of list) {
    if (!group.visible) continue;
    const sc = group.children[0]?.userData?.smokeScale || 1;
    for (const puff of group.children) {
      if (puff.userData?.smokePhase == null) continue;
      const phase = puff.userData.smokePhase;
      const cycle = ((t * 0.32 + phase) % 2.4) / 2.4;
      puff.position.y = (0.15 + cycle * 2.1) * sc;
      puff.position.x = Math.sin(t * 0.65 + phase) * 0.14 * sc;
      puff.position.z = Math.cos(t * 0.5 + phase * 0.7) * 0.1 * sc;
      const grow = 0.65 + cycle * 1.25;
      puff.scale.setScalar(grow);
      if (puff.material) puff.material.opacity = 0.42 * (1 - cycle) * (0.85 + 0.15 * sc);
    }
  }
}

export function createRenderer(canvas) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: false,
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  renderer.shadowMap.enabled = true;
  // Soft PCF is expensive with dense forests — basic still reads fine
  renderer.shadowMap.type = THREE.BasicShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;
  return renderer;
}

function addWindow(parent, x, y, z, { w = 0.52, h = 0.58, shutters = true } = {}) {
  const frame = new THREE.Mesh(new THREE.BoxGeometry(w + 0.12, h + 0.12, 0.06), mat("#3a2a18", { roughness: 0.85 }));
  frame.position.set(x, y, z);
  parent.add(frame);

  const pane = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, 0.04),
    mat("#f0d070", {
      roughness: 0.35,
      metalness: 0.15,
      emissive: "#c9a040",
      emissiveIntensity: 0.55,
      flat: false,
    })
  );
  pane.position.set(x, y, z + 0.02);
  parent.add(pane);

  // mullion cross
  const mullH = new THREE.Mesh(new THREE.BoxGeometry(w * 0.08, h, 0.05), mat("#4a3420"));
  mullH.position.set(x, y, z + 0.035);
  parent.add(mullH);
  const mullV = new THREE.Mesh(new THREE.BoxGeometry(w, h * 0.08, 0.05), mat("#4a3420"));
  mullV.position.set(x, y, z + 0.035);
  parent.add(mullV);

  if (shutters) {
    for (const side of [-1, 1]) {
      const shut = new THREE.Mesh(
        new THREE.BoxGeometry(w * 0.28, h * 0.95, 0.05),
        mat(side < 0 ? "#6a3a28" : "#5a4a2a", { roughness: 0.88 })
      );
      shut.position.set(x + side * (w * 0.55), y, z + 0.01);
      parent.add(shut);
    }
  }

  // flower box
  const box = new THREE.Mesh(new THREE.BoxGeometry(w * 0.95, 0.12, 0.18), mat("#4a3020"));
  box.position.set(x, y - h * 0.55, z + 0.08);
  parent.add(box);
  for (let i = 0; i < 3; i++) {
    const bloom = new THREE.Mesh(
      new THREE.SphereGeometry(0.06, 5, 4),
      mat(["#e87890", "#f0c060", "#7ec8a0"][i], { emissive: "#402010", emissiveIntensity: 0.12 })
    );
    bloom.position.set(x + (i - 1) * 0.12, y - h * 0.45, z + 0.14);
    parent.add(bloom);
  }
}

function makeBuilding(w, h, d, color, { roofColor = "#8a3a30", smoke = true } = {}) {
  const g = new THREE.Group();
  const plaster = makePlasterTexture(color);
  plaster.repeat.set(Math.max(1.6, w * 0.55), Math.max(1.4, h * 0.55));

  // stone foundation
  const foundation = new THREE.Mesh(
    new THREE.BoxGeometry(w + 0.18, 0.35, d + 0.18),
    mat("#ffffff", { map: makeBrickTexture({ brick: "#7a7060", mortar: "#c8c0b0", crack: true }), roughness: 0.92 })
  );
  foundation.position.y = 0.175;
  foundation.castShadow = true;
  foundation.receiveShadow = true;
  g.add(foundation);

  const body = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    mat("#ffffff", { map: plaster, roughness: 0.9, tint: "#fff6ea" })
  );
  body.position.y = 0.35 + h / 2;
  body.castShadow = true;
  body.receiveShadow = true;
  g.add(body);

  // timber corner beams
  const beamMat = mat("#3a2818", { roughness: 0.88 });
  for (const [sx, sz] of [
    [w / 2, d / 2],
    [-w / 2, d / 2],
    [w / 2, -d / 2],
    [-w / 2, -d / 2],
  ]) {
    const beam = new THREE.Mesh(new THREE.BoxGeometry(0.12, h + 0.1, 0.12), beamMat);
    beam.position.set(sx * 0.98, 0.35 + h / 2, sz * 0.98);
    g.add(beam);
  }

  const roofTex = makeRoofTileTexture(roofColor);
  roofTex.repeat.set(2.2, 2.2);
  const roof = new THREE.Mesh(
    new THREE.ConeGeometry(Math.max(w, d) * 0.78, h * 0.48, 4),
    mat("#ffffff", { map: roofTex, roughness: 0.82, tint: "#ffe8e0" })
  );
  roof.position.y = 0.35 + h + h * 0.18;
  roof.rotation.y = Math.PI / 4;
  roof.castShadow = true;
  roof.userData.isRoof = true;
  g.add(roof);

  // eaves trim
  const eave = new THREE.Mesh(
    new THREE.BoxGeometry(w + 0.35, 0.12, d + 0.35),
    mat("#4a3020", { roughness: 0.85 })
  );
  eave.position.y = 0.35 + h + 0.02;
  g.add(eave);

  // door + frame
  const doorFrame = new THREE.Mesh(new THREE.BoxGeometry(w * 0.3, h * 0.5, 0.1), mat("#3a2414"));
  doorFrame.position.set(0, 0.35 + h * 0.25, d / 2 + 0.02);
  g.add(doorFrame);
  const door = new THREE.Mesh(new THREE.BoxGeometry(w * 0.22, h * 0.42, 0.08), mat("#5a3a22"));
  door.position.set(0, 0.35 + h * 0.21, d / 2 + 0.06);
  g.add(door);
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.04, 6, 5), mat("#c9a040", { metalness: 0.55, roughness: 0.4 }));
  knob.position.set(w * 0.07, 0.35 + h * 0.22, d / 2 + 0.12);
  g.add(knob);

  // front windows
  addWindow(g, -w * 0.28, 0.35 + h * 0.58, d / 2 + 0.04, { w: 0.48, h: 0.52 });
  addWindow(g, w * 0.28, 0.35 + h * 0.58, d / 2 + 0.04, { w: 0.48, h: 0.52 });
  // side window
  if (w > 3.2) {
    const side = new THREE.Group();
    addWindow(side, 0, 0.35 + h * 0.55, 0, { w: 0.42, h: 0.48, shutters: false });
    side.position.set(w / 2 + 0.04, 0, 0);
    side.rotation.y = Math.PI / 2;
    g.add(side);
  }

  // chimney
  const chimX = w * 0.28;
  const chimZ = -d * 0.15;
  const chimH = h * 0.55;
  const chim = new THREE.Mesh(
    new THREE.BoxGeometry(0.45, chimH, 0.45),
    mat("#ffffff", {
      map: makeBrickTexture({ brick: "#8a6a55", mortar: "#d0c4b0" }),
      roughness: 0.9,
    })
  );
  chim.position.set(chimX, 0.35 + h + chimH * 0.35, chimZ);
  chim.castShadow = true;
  g.add(chim);
  const cap = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.12, 0.58), mat("#4a4035"));
  cap.position.set(chimX, 0.35 + h + chimH * 0.35 + chimH * 0.5 + 0.05, chimZ);
  g.add(cap);

  if (smoke) {
    addChimneySmoke(g, chimX, 0.35 + h + chimH * 0.85, chimZ, { scale: 0.85 + Math.random() * 0.3 });
  }

  return g;
}

function addCityWalls(scene) {
  const brickTex = makeBrickTexture({ brick: "#7a7064", mortar: "#cfc6b4", vary: 22 });
  brickTex.repeat.set(1.8, 1.6);
  const stone = mat("#ffffff", { map: brickTex, roughness: 0.88, tint: "#f2ebe0" });
  const roofTile = makeRoofTileTexture("#6b2a22");
  const segs = 52;
  for (let i = 0; i < segs; i++) {
    const a0 = (i / segs) * Math.PI * 2;
    const nearCardinal =
      Math.min(Math.abs(Math.sin(a0)), Math.abs(Math.cos(a0))) < 0.09 &&
      (Math.abs(Math.sin(a0)) > 0.95 || Math.abs(Math.cos(a0)) > 0.95);
    if (nearCardinal) continue;

    const x = Math.cos(a0) * CITY_RADIUS;
    const z = Math.sin(a0) * CITY_RADIUS;
    const wall = new THREE.Mesh(new THREE.BoxGeometry(3.1, 3.5, 1.15), stone);
    wall.position.set(x, 1.75, z);
    wall.lookAt(0, 1.75, 0);
    wall.castShadow = true;
    wall.receiveShadow = true;
    scene.add(wall);

    // battlement teeth
    for (const t of [-0.85, 0, 0.85]) {
      const tooth = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.55, 1.05), stone);
      tooth.position.set(x, 3.75, z);
      tooth.lookAt(0, 3.75, 0);
      // offset sideways in wall-local space via small radial nudge + tangent
      const tx = -Math.sin(a0) * t;
      const tz = Math.cos(a0) * t;
      tooth.position.x += tx;
      tooth.position.z += tz;
      scene.add(tooth);
    }

    // warm arrow-slit glow
    if (i % 3 === 0) {
      const slit = new THREE.Mesh(
        new THREE.BoxGeometry(0.22, 0.7, 0.12),
        mat("#e8c060", { emissive: "#a87820", emissiveIntensity: 0.45, roughness: 0.4 })
      );
      slit.position.set(x * 0.985, 2.1, z * 0.985);
      slit.lookAt(0, 2.1, 0);
      scene.add(slit);
    }

    if (i % 5 === 0) {
      const tower = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.35, 5.4, 6), stone);
      tower.position.set(x * 1.02, 2.7, z * 1.02);
      tower.castShadow = true;
      scene.add(tower);
      const top = new THREE.Mesh(
        new THREE.ConeGeometry(1.45, 1.25, 4),
        mat("#ffffff", { map: roofTile, roughness: 0.85 })
      );
      top.position.set(x * 1.02, 5.75, z * 1.02);
      top.rotation.y = Math.PI / 4;
      scene.add(top);
      // tower window
      const tw = new THREE.Mesh(
        new THREE.BoxGeometry(0.45, 0.55, 0.12),
        mat("#f0d070", { emissive: "#c9a040", emissiveIntensity: 0.5 })
      );
      tw.position.set(x * 0.99, 3.4, z * 0.99);
      tw.lookAt(0, 3.4, 0);
      scene.add(tw);
      addChimneySmoke(scene, x * 1.02, 6.4, z * 1.02, { scale: 0.7, tint: "#c8c0b4" });
    }
  }

  for (const [gx, gz] of [
    [0, CITY_RADIUS],
    [0, -CITY_RADIUS],
    [CITY_RADIUS, 0],
    [-CITY_RADIUS, 0],
  ]) {
    const across = Math.abs(gx) > Math.abs(gz);
    const postL = new THREE.Mesh(new THREE.BoxGeometry(1.35, 4.8, 1.35), stone);
    const postR = postL.clone();
    if (across) {
      postL.position.set(gx, 2.4, gz - CITY_GATE / 2);
      postR.position.set(gx, 2.4, gz + CITY_GATE / 2);
    } else {
      postL.position.set(gx - CITY_GATE / 2, 2.4, gz);
      postR.position.set(gx + CITY_GATE / 2, 2.4, gz);
    }
    scene.add(postL, postR);
    const lintel = new THREE.Mesh(
      new THREE.BoxGeometry(across ? 1.35 : CITY_GATE + 1.8, 1.05, across ? CITY_GATE + 1.8 : 1.35),
      stone
    );
    lintel.position.set(gx, 4.85, gz);
    scene.add(lintel);
    // keystone / cozy lantern under gate
    const lantern = new THREE.Mesh(
      new THREE.SphereGeometry(0.22, 8, 6),
      mat("#f0c060", { emissive: "#c9a040", emissiveIntensity: 0.7, roughness: 0.35 })
    );
    lantern.position.set(gx * 0.96, 4.1, gz * 0.96);
    scene.add(lantern);

    // Decorative wooden gate arches (taller than the player)
    const gateArch = AssetKit.clonePropToHeight("wooden_gate", 5.6);
    if (gateArch) {
      gateArch.position.set(gx * 1.015, 0, gz * 1.015);
      if (across) gateArch.rotation.y = gx > 0 ? Math.PI / 2 : -Math.PI / 2;
      else gateArch.rotation.y = gz > 0 ? 0 : Math.PI;
      gateArch.traverse((o) => {
        if (o.isMesh) {
          o.castShadow = false;
          o.receiveShadow = true;
        }
      });
      scene.add(gateArch);
    }
  }
}

/** Street lamps from GLB + barrels / flower beds */
function addCityCozyProps(scene, { warm = true } = {}) {
  const wood = mat("#5a3a22", { roughness: 0.9 });
  const iron = mat("#3a3830", { roughness: 0.7, metalness: 0.35 });
  const cityLights = [];

  const lanternSpots = [
    [6, 6], [-6, 6], [6, -6], [-6, -6],
    [10, 0], [-10, 0], [0, 10], [0, -10],
    [14, 8], [-14, -8], [8, -14], [-8, 14],
    [12, 12], [-12, 12], [12, -12], [-12, -12],
  ];
  let lampBudget = AssetKit.hasProp("lampposts") ? 6 : 0;
  for (const [lx, lz] of lanternSpots) {
    if (Math.hypot(lx, lz) > CITY_RADIUS - 3) continue;
    if (lampBudget > 0) {
      const lamp = AssetKit.clonePropToHeight("lampposts", 4.6);
      if (lamp) {
        lamp.position.set(lx, 0, lz);
        lamp.rotation.y = Math.atan2(-lx, -lz);
        lamp.traverse((o) => {
          if (o.isMesh) {
            o.castShadow = false;
            o.receiveShadow = true;
          }
        });
        scene.add(lamp);
        lampBudget -= 1;
      }
    } else {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 2.4, 6), iron);
      pole.position.set(lx, 1.2, lz);
      scene.add(pole);
      const lampGlass = mat("#f0d070", { emissive: "#ffb050", emissiveIntensity: 1.1, roughness: 0.4 });
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 6), lampGlass);
      bulb.position.set(lx, 2.35, lz);
      scene.add(bulb);
    }
    const light = new THREE.PointLight(warm ? 0xffc070 : 0xc0d8ff, 0, 22, 1.4);
    light.position.set(lx, 3.2, lz);
    light.name = "torch_light";
    scene.add(light);
    cityLights.push(light);
  }
  if (!scene.userData.torchLights) scene.userData.torchLights = [];
  scene.userData.torchLights.push(...cityLights);

  // barrels + crates near plaza edge
  for (let i = 0; i < 10; i++) {
    const ang = (i / 10) * Math.PI * 2 + 0.4;
    const r = 8.5 + (i % 3) * 0.6;
    const bx = Math.cos(ang) * r;
    const bz = Math.sin(ang) * r;
    if (i % 2 === 0) {
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.38, 0.7, 10), wood);
      barrel.position.set(bx, 0.35, bz);
      barrel.castShadow = false;
      scene.add(barrel);
      const band = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.03, 6, 14), iron);
      band.rotation.x = Math.PI / 2;
      band.position.set(bx, 0.35, bz);
      scene.add(band);
    } else {
      const crate = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.45, 0.55), wood);
      crate.position.set(bx, 0.22, bz);
      crate.rotation.y = ang;
      crate.castShadow = false;
      scene.add(crate);
    }
  }

  // flower rings near fountain
  const petal = warm ? ["#e87890", "#f0c060", "#8bc46a"] : ["#c9a06a", "#a08050", "#6a8a4a"];
  for (let i = 0; i < 16; i++) {
    const ang = (i / 16) * Math.PI * 2;
    const bed = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.5, 0.18, 8), mat("#4a6a38", { roughness: 0.95 }));
    bed.position.set(Math.cos(ang) * 3.6, 0.1, Math.sin(ang) * 3.6);
    scene.add(bed);
    for (let j = 0; j < 3; j++) {
      const f = new THREE.Mesh(
        new THREE.SphereGeometry(0.08, 5, 4),
        mat(petal[(i + j) % petal.length], { emissive: "#302010", emissiveIntensity: 0.1 })
      );
      f.position.set(
        Math.cos(ang) * 3.6 + (j - 1) * 0.12,
        0.28,
        Math.sin(ang) * 3.6 + ((j % 2) - 0.5) * 0.1
      );
      scene.add(f);
    }
  }
}

/** Procedural fallback tree — tall canopy that towers over the ~1.8 player */
function makeFallbackTree(arid = false) {
  const g = new THREE.Group();
  const trunk = mat(arid ? "#4a3820" : "#3a2818");
  const leaf = mat(arid ? "#6a5a28" : "#1e4a22", { roughness: 0.92 });
  const trunkH = arid ? 3.6 : 4.4;
  const t = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.62, trunkH, 8), trunk);
  t.position.y = trunkH * 0.5;
  t.castShadow = false;
  g.add(t);
  const layers = arid
    ? [
        [2.6, 2.0, trunkH * 0.55],
        [2.0, 1.7, trunkH * 0.78],
        [1.35, 1.4, trunkH * 0.98],
        [0.85, 1.1, trunkH * 1.15],
      ]
    : [
        [3.2, 2.2, trunkH * 0.5],
        [2.6, 2.0, trunkH * 0.72],
        [2.0, 1.7, trunkH * 0.92],
        [1.4, 1.4, trunkH * 1.1],
        [0.9, 1.1, trunkH * 1.25],
      ];
  for (const [r, h, y] of layers) {
    const cone = new THREE.Mesh(new THREE.ConeGeometry(r, h, 9), leaf);
    cone.position.y = y;
    cone.castShadow = false;
    g.add(cone);
  }
  return g;
}

function skipWildernessSpot(mapId, x, z, { clearRoad = 2.6 } = {}) {
  if (Math.hypot(x, z) < CITY_RADIUS + 5) return true;
  if (onBeatenRoad(x, z, mapId, clearRoad)) return true;
  if (inRiver(mapId, x, z, 3)) return true;
  if (mapId === "overworld") {
    if (Math.hypot(x - EDGE_PORTAL, z) < 14) return true;
    if (Math.hypot(x - TOWER_CORNER.x, z - TOWER_CORNER.z) < 20) return true;
  }
  if (mapId === "valley") {
    if (Math.hypot(x + EDGE_PORTAL, z) < 14) return true;
    if (Math.hypot(x - EDGE_PORTAL, z) < 14) return true;
    if (Math.hypot(x - BANDIT_CAMP.x, z - BANDIT_CAMP.z) < BANDIT_CAMP.r + 3) return true;
  }
  for (const c of campsOnMap(mapId)) {
    if (Math.hypot(x - c.x, z - c.z) < c.r + 2) return true;
  }
  for (const o of outpostsOnMap(mapId)) {
    if (Math.hypot(x - o.x, z - o.z) < o.r + 2) return true;
  }
  return false;
}

function plantTreeAt(group, x, z, mapId, arid, scaleMul = 1) {
  if (skipWildernessSpot(mapId, x, z, { clearRoad: 3.2 })) return false;
  // Player ~1.8 — Kenney bulk trees (cheap); custom GLBs are landmarks only
  let targetH = (arid ? 6.5 : 7.8) * (0.72 + Math.random() * 0.85) * scaleMul;
  if (Math.random() < 0.12) targetH *= 1.35;
  let tree = NatureKit.randomForestTree(arid, targetH);
  if (!tree) {
    tree = makeFallbackTree(arid);
    const approx = arid ? 6.5 : 8.2;
    tree.scale.setScalar(targetH / approx);
  }
  tree.rotation.y = Math.random() * Math.PI * 2;
  tagFadeTree(tree);
  if (Math.random() < 0.08) {
    tree.traverse((o) => {
      if (o.isMesh) o.castShadow = true;
    });
  }
  placeAtHeight(tree, x, z, mapId);
  group.add(tree);
  if (Math.random() < 0.3) {
    const bushH = 1.35 + Math.random() * 1.4;
    const bush = NatureKit.randomBush(bushH);
    if (bush) {
      const bx = x + (Math.random() - 0.5) * 3.2;
      const bz = z + (Math.random() - 0.5) * 3.2;
      if (!skipWildernessSpot(mapId, bx, bz, { clearRoad: 2.8 })) {
        bush.rotation.y = Math.random() * Math.PI * 2;
        placeAtHeight(bush, bx, bz, mapId);
        group.add(bush);
      }
    }
  }
  return true;
}

/** Dense tree belts lining both sides of every beaten road */
function plantRoadForests(group, mapId, arid) {
  for (const r of fieldRoads(mapId)) {
    const dx = r.x1 - r.x0;
    const dz = r.z1 - r.z0;
    const len = Math.hypot(dx, dz);
    if (len < 3) continue;
    const ux = dx / len;
    const uz = dz / len;
    const px = -uz;
    const pz = ux;
    const steps = Math.max(6, Math.ceil(len / 3.2));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const cx = r.x0 + dx * t;
      const cz = r.z0 + dz * t;
      for (const side of [-1, 1]) {
        const rows = 1 + ((Math.random() * 2) | 0);
        for (let row = 0; row < rows; row++) {
          const offset = r.w * 0.5 + 4.5 + row * 4.0 + Math.random() * 2.6;
          const along = (Math.random() - 0.5) * 2.4;
          const x = cx + px * side * offset + ux * along;
          const z = cz + pz * side * offset + uz * along;
          plantTreeAt(group, x, z, mapId, arid, 1.05 + row * 0.08);
        }
      }
    }
  }
}

/** Large forest patches so open field isn’t empty */
function plantForestPatches(group, mapId, arid, patchCount = 22) {
  for (let p = 0; p < patchCount; p++) {
    const ang = (p / patchCount) * Math.PI * 2 + Math.random() * 0.45;
    const dist = CITY_RADIUS + 14 + Math.random() * (MAP_HALF - CITY_RADIUS - 22);
    const cx = Math.cos(ang) * dist;
    const cz = Math.sin(ang) * dist;
    if (skipWildernessSpot(mapId, cx, cz, { clearRoad: 6 })) continue;
    const nearRoad = distToRoad(cx, cz, mapId);
    const radius = nearRoad < 32 ? 20 + Math.random() * 14 : 14 + Math.random() * 12;
    const trees = nearRoad < 32 ? 70 + ((Math.random() * 45) | 0) : 40 + ((Math.random() * 35) | 0);
    for (let i = 0; i < trees; i++) {
      const a = Math.random() * Math.PI * 2;
      const rr = Math.pow(Math.random(), 0.5) * radius;
      plantTreeAt(group, cx + Math.cos(a) * rr, cz + Math.sin(a) * rr, mapId, arid);
    }
  }
}

/** Deep river water + large plank bridge spanning the channel */
function addFieldRiver(root, mapId) {
  const r = riverDef(mapId);
  const b = bridgeCenter(mapId);
  if (!r || !b) return;

  const dx = r.bx - r.ax;
  const dz = r.bz - r.az;
  const len = Math.hypot(dx, dz);
  const waterY = riverWaterY(mapId);

  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(r.halfW * 2.05, len + 8, 1, 1),
    new THREE.MeshStandardMaterial({
      color: mapId === "valley" ? "#3a6a78" : "#2a6a7a",
      roughness: 0.18,
      metalness: 0.35,
      transparent: true,
      opacity: 0.82,
    })
  );
  water.rotation.x = -Math.PI / 2;
  water.rotation.z = Math.atan2(dx, dz);
  water.position.set((r.ax + r.bx) / 2, waterY, (r.az + r.bz) / 2);
  water.receiveShadow = true;
  water.name = "field_river";
  root.add(water);

  // Soft bank tint strips
  for (const side of [-1, 1]) {
    const bank = new THREE.Mesh(
      new THREE.PlaneGeometry(3.2, len + 4, 1, 1),
      mat(mapId === "valley" ? "#6a5438" : "#4a6a3a", { roughness: 0.95 })
    );
    bank.rotation.x = -Math.PI / 2;
    bank.rotation.z = Math.atan2(dx, dz);
    const nx = -dz / len;
    const nz = dx / len;
    bank.position.set(
      (r.ax + r.bx) / 2 + nx * (r.halfW + 1.2) * side,
      -0.15,
      (r.az + r.bz) / 2 + nz * (r.halfW + 1.2) * side
    );
    bank.receiveShadow = true;
    root.add(bank);
  }

  // Big bridge — deck + rails + posts (deck top = b.deckTop for walking)
  const bridge = new THREE.Group();
  bridge.name = "field_bridge";
  bridge.position.set(b.x, 0, b.z);
  bridge.rotation.y = b.yaw;

  const plankMat = mat("#6a4a28", { roughness: 0.9 });
  const railMat = mat("#4a3218", { roughness: 0.92 });
  const deckThick = 0.45;
  const deck = new THREE.Mesh(new THREE.BoxGeometry(b.across, deckThick, b.along), plankMat);
  deck.position.y = b.deckTop - deckThick * 0.5;
  deck.castShadow = true;
  deck.receiveShadow = true;
  bridge.add(deck);

  // Plank grooves (visual)
  for (let i = -4; i <= 4; i++) {
    const groove = new THREE.Mesh(
      new THREE.BoxGeometry(b.across * 0.98, 0.06, 0.35),
      mat("#5a3a1e", { roughness: 0.95 })
    );
    groove.position.set(0, b.deckTop + 0.02, (i / 4) * (b.along * 0.42));
    bridge.add(groove);
  }

  for (const side of [-1, 1]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(b.across * 0.96, 0.22, 0.28), railMat);
    rail.position.set(0, b.deckTop + 0.85, side * (b.along * 0.48));
    rail.castShadow = true;
    bridge.add(rail);
    for (let p = -3; p <= 3; p++) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.35, 1.35, 0.35), railMat);
      post.position.set((p / 3) * (b.across * 0.42), b.deckTop + 0.5, side * (b.along * 0.48));
      post.castShadow = true;
      bridge.add(post);
    }
  }

  // Stone abutments under each end
  for (const side of [-1, 1]) {
    const abutH = b.deckTop + 0.9;
    const abut = new THREE.Mesh(
      new THREE.BoxGeometry(3.2, abutH, b.along + 1.5),
      mat("#5a564c", { roughness: 0.96 })
    );
    abut.position.set(side * (b.across * 0.5 - 0.6), abutH * 0.5 - 0.35, 0);
    abut.castShadow = true;
    abut.receiveShadow = true;
    bridge.add(abut);
  }

  root.add(bridge);
}

function makeRoadTorch() {
  const g = new THREE.Group();
  const post = new THREE.Mesh(
    new THREE.CylinderGeometry(0.08, 0.12, 1.6, 6),
    mat("#3a2a18", { roughness: 0.95 })
  );
  post.position.y = 0.8;
  post.castShadow = true;
  g.add(post);
  const bowl = new THREE.Mesh(
    new THREE.CylinderGeometry(0.22, 0.18, 0.16, 8),
    mat("#4a3a28", { roughness: 0.85 })
  );
  bowl.position.y = 1.55;
  g.add(bowl);
  const flame = new THREE.Mesh(
    new THREE.SphereGeometry(0.16, 8, 8),
    new THREE.MeshStandardMaterial({
      color: "#ffb040",
      emissive: "#ff6a18",
      emissiveIntensity: 1.4,
      roughness: 0.4,
    })
  );
  flame.position.y = 1.78;
  flame.name = "torch_flame";
  g.add(flame);
  const light = new THREE.PointLight(0xffb060, 0, 28, 1.35);
  light.position.y = 1.85;
  light.name = "torch_light";
  g.add(light);
  return g;
}

function makeAbandonedStone(mapId, arid) {
  const g = new THREE.Group();
  const rock = NatureKit.randomRock(1.1 + Math.random() * 0.6);
  if (rock) {
    g.add(rock);
  } else {
    const m = new THREE.Mesh(
      new THREE.DodecahedronGeometry(0.9 + Math.random() * 0.5, 0),
      mat(arid ? "#5a4a38" : "#4a4840")
    );
    m.castShadow = true;
    m.position.y = 0.45;
    g.add(m);
  }
  // Cracked pillar stub
  const stub = new THREE.Mesh(
    new THREE.CylinderGeometry(0.35, 0.45, 0.7 + Math.random() * 0.5, 6),
    mat(arid ? "#6a5848" : "#5c564c", { roughness: 0.96 })
  );
  stub.position.set(0.7, 0.35, -0.3);
  stub.rotation.z = 0.35;
  stub.castShadow = true;
  g.add(stub);
  if (Math.random() < 0.55) {
    const path = NatureKit.clone("path_stone", 0.9);
    if (path) {
      path.position.set(-0.6, 0.02, 0.4);
      g.add(path);
    }
  }
  void mapId;
  return g;
}

function placeAtHeight(obj, x, z, mapId, yOff = 0) {
  const h = fieldHeightAt(x, z, mapId);
  obj.position.set(x, h + yOff, z);
}

/** Mark canopy for near-camera fade; clone mats so instances don't share opacity */
function tagFadeTree(tree) {
  if (!tree) return tree;
  tree.userData.fadeTree = true;
  tree.traverse((o) => {
    if (!o.isMesh || !o.material) return;
    o.material = Array.isArray(o.material)
      ? o.material.map((m) => m.clone())
      : o.material.clone();
  });
  return tree;
}

/** Sparse custom landmarks — never dense skinned trees near the city */
function dressMapLandmarks(group, mapId, arid = false) {
  // One viking hut homestead far from walls
  const hutSpot = mapId === "overworld" ? [-52, 48] : [-55, -48];
  const [hx, hz] = hutSpot;
  if (!skipWildernessSpot(mapId, hx, hz, { clearRoad: 4 }) && AssetKit.hasProp("viking_hut")) {
    const hut = AssetKit.clonePropToHeight("viking_hut", 6.2);
    if (hut) {
      hut.rotation.y = Math.random() * Math.PI * 2;
      hut.traverse((o) => {
        if (o.isMesh) {
          o.castShadow = false;
          o.receiveShadow = true;
        }
      });
      placeAtHeight(hut, hx, hz, mapId);
      group.add(hut);
      for (let i = 0; i < 2; i++) {
        const ang = (i / 2) * Math.PI * 2 + 0.4;
        plantTreeAt(group, hx + Math.cos(ang) * 9, hz + Math.sin(ang) * 9, mapId, arid, 1.05);
      }
    }
  }

  // Few willows / tree-rows far out (landmarks only)
  const landmarkN = 4;
  for (let i = 0; i < landmarkN; i++) {
    const ang = (i / landmarkN) * Math.PI * 2 + 0.4;
    const r = CITY_RADIUS + 55 + Math.random() * 35;
    const x = Math.cos(ang) * r;
    const z = Math.sin(ang) * r;
    if (skipWildernessSpot(mapId, x, z, { clearRoad: 6 })) continue;
    const tree = AssetKit.landmarkTree(11 + Math.random() * 5);
    if (!tree) continue;
    tree.rotation.y = ang + Math.PI / 2;
    tagFadeTree(tree);
    tree.traverse((o) => {
      if (o.isMesh) o.castShadow = false;
    });
    placeAtHeight(tree, x, z, mapId);
    group.add(tree);
  }
}

/** City houses — house_small for density; at most two house_large landmarks */
function placeCityBuildings(root, { arid = false } = {}) {
  const colors = arid
    ? ["#d2b48c", "#c4a574", "#e0c4a0", "#b8956a", "#cbb08a"]
    : ["#c8b090", "#b8a078", "#d0b898", "#a89070", "#c0a888"];
  const roofs = arid
    ? ["#5a3a28", "#4a3020", "#6a4030"]
    : ["#8a3a30", "#6a3a48", "#7a4a28", "#5a2a28"];
  const layouts = [
    [11, -8],
    [-12, -7],
    [14, 11],
    [12, -13],
    [-15, 10],
    [-13, -14],
    [7, 15],
    [-8, 16],
    [16, 4],
    [-17, -3],
    [5, -16],
    [-6, -17],
    [15, -5],
    [-14, 5],
  ];
  let largeLeft = AssetKit.hasProp("house_large") ? 2 : 0;
  layouts.forEach(([bx, bz], i) => {
    if (Math.hypot(bx, bz) > CITY_RADIUS - 5.5) return;
    if (Math.hypot(bx, bz) < 9) return;
    const useLarge = largeLeft > 0 && (i === 2 || i === 9);
    if (useLarge) largeLeft -= 1;
    const targetH = useLarge ? 8.0 : 6.2 + (i % 4) * 0.45;
    let b = AssetKit.clonePropToHeight(useLarge ? "house_large" : "house_small", targetH);
    if (!b) b = AssetKit.clonePropToHeight("house_small", targetH);
    if (b) {
      b.rotation.y = (i * 0.85) % (Math.PI * 2);
      b.position.set(bx, 0, bz);
      b.traverse((o) => {
        if (o.isMesh) {
          o.castShadow = i % 5 === 0;
          o.receiveShadow = true;
        }
      });
      root.add(b);
      return;
    }
    const proc = makeBuilding(
      3.8 + (i % 3) * 0.8,
      3.4 + (i % 4) * 0.7,
      3.8 + (i % 2) * 1.1,
      colors[i % colors.length],
      { roofColor: roofs[i % roofs.length] }
    );
    proc.position.set(bx, 0, bz);
    proc.rotation.y = (i * 0.7) % Math.PI;
    root.add(proc);
  });
}

/** Dense wilderness: tall forests, big rocks, thick undergrowth */
export function dressFieldWilderness(root, { mapId, arid = false, treeCount = 220, rockCount = 220, bushCount = 200 } = {}) {
  const group = new THREE.Group();
  group.name = "wilderness_dressing";

  plantRoadForests(group, mapId, arid);
  plantForestPatches(group, mapId, arid, arid ? 8 : 10);

  // Fill open field (not only near roads)
  for (let i = 0; i < treeCount; i++) {
    const ang = Math.random() * Math.PI * 2;
    const r = CITY_RADIUS + 8 + Math.random() * (MAP_HALF - CITY_RADIUS - 12);
    const x = Math.cos(ang) * r;
    const z = Math.sin(ang) * r;
    if (distToRoad(x, z, mapId) > 36 && Math.random() > 0.55) continue;
    plantTreeAt(group, x, z, mapId, arid, 0.95 + Math.random() * 0.25);
  }

  for (let i = 0; i < rockCount; i++) {
    const ang = Math.random() * Math.PI * 2;
    const r = CITY_RADIUS + 6 + Math.random() * (MAP_HALF - CITY_RADIUS - 10);
    const x = Math.cos(ang) * r;
    const z = Math.sin(ang) * r;
    if (skipWildernessSpot(mapId, x, z)) continue;
    const targetH = 1.4 + Math.random() * 3.6 + (Math.random() < 0.12 ? 3.5 : 0);
    let rock = NatureKit.randomRock(targetH);
    if (!rock) {
      rock = new THREE.Mesh(
        new THREE.DodecahedronGeometry(0.9 + Math.random() * 1.8, 0),
        mat(arid ? "#6a5848" : "#5c564c")
      );
      rock.castShadow = true;
      rock.position.y = 0.55;
    }
    rock.rotation.y = Math.random() * Math.PI * 2;
    rock.rotation.z = (Math.random() - 0.5) * 0.25;
    placeAtHeight(rock, x, z, mapId);
    group.add(rock);
  }

  for (let i = 0; i < bushCount; i++) {
    const ang = Math.random() * Math.PI * 2;
    const r = CITY_RADIUS + 5 + Math.random() * (MAP_HALF - CITY_RADIUS - 8);
    const x = Math.cos(ang) * r;
    const z = Math.sin(ang) * r;
    if (skipWildernessSpot(mapId, x, z)) continue;
    if (distToRoad(x, z, mapId) > 28 && Math.random() > 0.55) continue;
    const bush = NatureKit.randomBush(1.2 + Math.random() * 1.8);
    if (!bush) continue;
    bush.rotation.y = Math.random() * Math.PI * 2;
    placeAtHeight(bush, x, z, mapId);
    group.add(bush);
  }

  // Extra logs / fences near camps & roads
  for (let i = 0; i < 70; i++) {
    const ang = Math.random() * Math.PI * 2;
    const r = CITY_RADIUS + 10 + Math.random() * (MAP_HALF - CITY_RADIUS - 16);
    const x = Math.cos(ang) * r;
    const z = Math.sin(ang) * r;
    if (skipWildernessSpot(mapId, x, z) && Math.random() > 0.35) continue;
    const key = Math.random() < 0.45 ? "log" : "log_large";
    const log = NatureKit.cloneToHeight(key, 1.1 + Math.random() * 1.6);
    if (!log) continue;
    log.rotation.y = Math.random() * Math.PI;
    placeAtHeight(log, x, z, mapId);
    group.add(log);
  }

  // Landmark cliff chunks for scale
  for (let i = 0; i < 18; i++) {
    const ang = Math.random() * Math.PI * 2;
    const r = CITY_RADIUS + 22 + Math.random() * (MAP_HALF - CITY_RADIUS - 30);
    const x = Math.cos(ang) * r;
    const z = Math.sin(ang) * r;
    if (skipWildernessSpot(mapId, x, z, { clearRoad: 5 })) continue;
    const cliff = NatureKit.cloneToHeight(
      Math.random() < 0.5 ? "cliff_half" : "cliff_block",
      4.5 + Math.random() * 5.5
    );
    if (!cliff) continue;
    cliff.rotation.y = Math.random() * Math.PI * 2;
    placeAtHeight(cliff, x, z, mapId);
    group.add(cliff);
  }

  // Tent camps — small dirt pads under tents only (no giant mud “puddle” rings)
  for (const camp of campsOnMap(mapId)) {
    const campG = new THREE.Group();
    campG.name = `camp_${camp.id}`;

    for (let t = 0; t < camp.tents; t++) {
      const ang = (t / camp.tents) * Math.PI * 2 + 0.4;
      const rr = 3.2 + (t % 2) * 1.4;
      const tx = camp.x + Math.cos(ang) * rr;
      const tz = camp.z + Math.sin(ang) * rr;
      const pad = new THREE.Mesh(
        new THREE.CircleGeometry(1.55, 10),
        mat("#5a4a30", { roughness: 0.96 })
      );
      pad.rotation.x = -Math.PI / 2;
      pad.position.set(tx, fieldHeightAt(tx, tz, mapId) + 0.03, tz);
      pad.receiveShadow = true;
      campG.add(pad);
      const tentKey = t % 2 === 0 ? "tent_open" : "tent_closed";
      let tent = NatureKit.cloneToHeight(tentKey, 2.6 + Math.random() * 0.5);
      if (!tent) tent = NatureKit.cloneToHeight(t % 2 ? "tent_small_closed" : "tent_small_open", 2.2);
      if (!tent) tent = makeBiologistTent();
      tent.rotation.y = ang + Math.PI;
      placeAtHeight(tent, tx, tz, mapId);
      campG.add(tent);
    }

    const fire = NatureKit.cloneToHeight(Math.random() < 0.5 ? "campfire" : "campfire_logs", 1.35);
    if (fire) {
      placeAtHeight(fire, camp.x, camp.z, mapId);
      campG.add(fire);
    } else {
      const pit = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.85, 0.25, 8), mat("#2a2218"));
      placeAtHeight(pit, camp.x, camp.z, mapId, 0.12);
      campG.add(pit);
    }

    for (let f = 0; f < 3; f++) {
      const fence = NatureKit.cloneToHeight("fence", 1.6);
      if (!fence) break;
      const ang = f * 2.1;
      placeAtHeight(fence, camp.x + Math.cos(ang) * (camp.r - 2), camp.z + Math.sin(ang) * (camp.r - 2), mapId);
      fence.rotation.y = ang + Math.PI / 2;
      campG.add(fence);
    }

    group.add(campG);
  }

  // Landmark props from custom models (bigger than the player)
  dressMapLandmarks(group, mapId, arid);

  // Half-empty enemy outposts
  const torchLights = [];
  for (const op of outpostsOnMap(mapId)) {
    const og = new THREE.Group();
    og.name = `outpost_${op.id}`;

    // One heavy outpost tent per site when available
    let placedBigTent = false;
    if (AssetKit.hasProp("outpost_tent")) {
      const big = AssetKit.clonePropToHeight("outpost_tent", 5.8 + Math.random() * 1.2);
      if (big) {
        big.rotation.y = Math.random() * Math.PI * 2;
        placeAtHeight(big, op.x, op.z, mapId);
        big.traverse((o) => {
          if (o.isMesh) {
            o.castShadow = false;
            o.receiveShadow = true;
          }
        });
        og.add(big);
        placedBigTent = true;
      }
    }

    if (!placedBigTent) {
      for (let t = 0; t < (op.tents || 1); t++) {
        const ang = t * 2.2 + 0.5;
        const rr = 2.8 + t;
        const tx = op.x + Math.cos(ang) * rr;
        const tz = op.z + Math.sin(ang) * rr;
        const pad = new THREE.Mesh(
          new THREE.CircleGeometry(1.4, 8),
          mat("#4a3a28", { roughness: 0.97 })
        );
        pad.rotation.x = -Math.PI / 2;
        pad.position.set(tx, fieldHeightAt(tx, tz, mapId) + 0.03, tz);
        pad.receiveShadow = true;
        og.add(pad);
        let tent = NatureKit.cloneToHeight(op.ruined ? "tent_small_open" : "tent_open", 2.4);
        if (!tent) tent = makeBiologistTent();
        tent.rotation.y = ang + Math.PI;
        if (op.ruined) tent.rotation.z = (Math.random() - 0.5) * 0.25;
        placeAtHeight(tent, tx, tz, mapId);
        og.add(tent);
      }
    } else {
      // Small side tent near the big outpost
      const ang = 1.2;
      const tx = op.x + Math.cos(ang) * 6.5;
      const tz = op.z + Math.sin(ang) * 6.5;
      let tent = NatureKit.cloneToHeight("tent_small_closed", 2.3);
      if (tent) {
        tent.rotation.y = ang + Math.PI;
        placeAtHeight(tent, tx, tz, mapId);
        og.add(tent);
      }
    }

    // Dead / sparse fire
    const ash = new THREE.Mesh(
      new THREE.CylinderGeometry(0.7, 0.9, 0.18, 8),
      mat("#2a2218", { roughness: 1 })
    );
    placeAtHeight(ash, op.x + (placedBigTent ? 5.5 : 0), op.z + (placedBigTent ? 2.2 : 0), mapId, 0.08);
    og.add(ash);
    const logs = NatureKit.cloneToHeight("campfire_logs", 1.2);
    if (logs) {
      placeAtHeight(logs, op.x + (placedBigTent ? 5.8 : 0.3), op.z - (placedBigTent ? 1.5 : 0.2), mapId);
      og.add(logs);
    }

    for (let f = 0; f < 4; f++) {
      const fence = NatureKit.cloneToHeight("fence", 1.55);
      if (!fence) break;
      const ang = f * 1.7 + 0.2;
      const broken = op.ruined && f % 2 === 0;
      placeAtHeight(
        fence,
        op.x + Math.cos(ang) * (op.r - 1.5),
        op.z + Math.sin(ang) * (op.r - 1.5),
        mapId
      );
      fence.rotation.y = ang + Math.PI / 2;
      if (broken) {
        fence.rotation.z = 0.55;
        fence.position.y += 0.15;
      }
      og.add(fence);
    }
    group.add(og);
  }

  // Abandoned stones + road torches along beaten paths
  for (const road of fieldRoads(mapId)) {
    const dx = road.x1 - road.x0;
    const dz = road.z1 - road.z0;
    const len = Math.hypot(dx, dz) || 1;
    const steps = Math.max(2, Math.floor(len / 11));
    for (let i = 1; i < steps; i++) {
      const u = i / steps;
      const x = road.x0 + dx * u;
      const z = road.z0 + dz * u;
      const side = i % 2 === 0 ? 1 : -1;
      const nx = (-dz / len) * side * (2.2 + (i % 3) * 0.4);
      const nz = (dx / len) * side * (2.2 + (i % 3) * 0.4);

      // Torches every other step
      if (i % 2 === 1) {
        const torch = makeRoadTorch();
        placeAtHeight(torch, x + nx * 0.85, z + nz * 0.85, mapId);
        group.add(torch);
        const light = torch.getObjectByName("torch_light");
        if (light) torchLights.push(light);
      }

      // Abandoned roadside stones
      if (i % 3 === 0 || Math.random() < 0.35) {
        const stone = makeAbandonedStone(mapId, arid);
        stone.rotation.y = Math.random() * Math.PI;
        placeAtHeight(stone, x + nx * 1.4, z + nz * 1.4, mapId);
        group.add(stone);
      }
    }
  }

  const prev = Array.isArray(root.userData.torchLights) ? root.userData.torchLights : [];
  root.userData.torchLights = [...prev, ...torchLights];
  group.userData.torchLights = torchLights;
  root.add(group);
  return group;
}

/**
 * Irregular mountain rim + distant skirt so the map never ends in a green void.
 * Leaves gaps at edge portals. Breaks the hard square silhouette with foothills.
 */
function makeMountainPeak(h, rockMat, tipMat, foothill = false) {
  const g = new THREE.Group();
  const baseR = foothill ? h * 0.58 : h * 0.4;
  const base = new THREE.Mesh(new THREE.ConeGeometry(baseR, h, foothill ? 5 : 6), rockMat);
  base.position.y = h * 0.5;
  base.castShadow = false;
  base.receiveShadow = false;
  g.add(base);
  if (!foothill && h > 9) {
    const tip = new THREE.Mesh(new THREE.ConeGeometry(baseR * 0.32, h * 0.26, 5), tipMat);
    tip.position.y = h * 0.86;
    tip.castShadow = false;
    g.add(tip);
  }
  if (!foothill) {
    const side = new THREE.Mesh(new THREE.ConeGeometry(baseR * 0.48, h * 0.55, 5), rockMat);
    side.position.set(baseR * 0.55, h * 0.28, baseR * 0.1);
    side.castShadow = false;
    g.add(side);
  }
  return g;
}

function nearPortalGap(x, z, gaps) {
  for (const p of gaps) {
    if (Math.hypot(x - p.x, z - p.z) < (p.w || 16)) return true;
  }
  return false;
}

export function addMapHorizon(root, { half = MAP_HALF, arid = false, portalGaps = [] } = {}) {
  const g = new THREE.Group();
  g.name = "map_horizon";

  // Outer skirt — fills the void beyond the playable tile
  const skirtCol = arid ? "#5a4a32" : "#3a4a30";
  const skirt = new THREE.Mesh(
    new THREE.RingGeometry(half * 0.88, half * 3.4, 72),
    new THREE.MeshStandardMaterial({ color: skirtCol, roughness: 1, flatShading: true })
  );
  skirt.rotation.x = -Math.PI / 2;
  skirt.position.y = -1.1;
  skirt.receiveShadow = true;
  g.add(skirt);

  // Soft haze plate under fog color
  const haze = new THREE.Mesh(
    new THREE.CircleGeometry(half * 3.55, 48),
    new THREE.MeshBasicMaterial({
      color: arid ? "#a89878" : "#8aa090",
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
    })
  );
  haze.rotation.x = -Math.PI / 2;
  haze.position.y = -1.6;
  g.add(haze);

  const rock = mat(arid ? "#6a5848" : "#5c564c", { roughness: 0.97 });
  const tip = mat(arid ? "#c8b898" : "#d0d8cc", { roughness: 0.92 });
  const foot = mat(arid ? "#4a5a30" : "#2a4a28", { roughness: 0.95 });

  const steps = 80;
  for (let i = 0; i < steps; i++) {
    const ang = (i / steps) * Math.PI * 2;
    // Wobbly radius — not a perfect circle/square
    const wobble =
      Math.sin(ang * 2.7) * 7 +
      Math.sin(ang * 6.1 + 1.3) * 4.2 +
      Math.cos(ang * 1.4) * 5;
    const rOut = half + 6 + Math.abs(wobble) * 0.85 + (i % 4) * 2.8;
    const x = Math.cos(ang) * rOut;
    const z = Math.sin(ang) * rOut;
    if (nearPortalGap(x, z, portalGaps)) continue;

    const peakH = 9 + Math.abs(Math.sin(ang * 2.2 + i * 0.15)) * 16 + (i % 6) * 1.4;
    const peak = makeMountainPeak(peakH, rock, tip, false);
    peak.position.set(x, -0.4, z);
    peak.rotation.y = ang + Math.PI * 0.5;
    peak.scale.setScalar(0.9 + (i % 5) * 0.08);
    g.add(peak);

    // Inner foothills bite into the square map edge
    if (i % 2 === 0) {
      const rIn = half - 2 - Math.abs(Math.sin(ang * 3.5)) * 7 - (i % 3) * 1.5;
      const fx = Math.cos(ang) * rIn;
      const fz = Math.sin(ang) * rIn;
      if (nearPortalGap(fx, fz, portalGaps)) continue;
      if (Math.max(Math.abs(fx), Math.abs(fz)) > half - 0.5) continue;
      const hill = makeMountainPeak(3.8 + (i % 4) * 1.8, rock, foot, true);
      hill.position.set(fx, 0, fz);
      hill.rotation.y = ang;
      g.add(hill);
    }
  }

  // Extra mid-ring peaks for depth
  for (let i = 0; i < 36; i++) {
    const ang = (i / 36) * Math.PI * 2 + 0.2;
    const r = half + 18 + Math.sin(ang * 4) * 8 + (i % 3) * 5;
    const x = Math.cos(ang) * r;
    const z = Math.sin(ang) * r;
    if (nearPortalGap(x, z, portalGaps)) continue;
    const peak = makeMountainPeak(14 + (i % 5) * 3, rock, tip, false);
    peak.position.set(x, -0.6, z);
    peak.rotation.y = ang;
    peak.scale.setScalar(1.05 + (i % 3) * 0.1);
    g.add(peak);
  }

  root.add(g);
  return g;
}

export function createScene() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#7ea8c8");
  scene.fog = new THREE.Fog("#9ab4a0", 75, 280);

  const hemi = new THREE.HemisphereLight(0xfff2e0, 0x5a4a28, 0.95);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(0xffe8c8, 1.25);
  sun.position.set(40, 55, 25);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.near = 2;
  sun.shadow.camera.far = 140;
  sun.shadow.camera.left = -55;
  sun.shadow.camera.right = 55;
  sun.shadow.camera.top = 55;
  sun.shadow.camera.bottom = -55;
  sun.shadow.bias = -0.0008;
  sun.shadow.normalBias = 0.04;
  scene.add(sun);
  scene.add(sun.target);

  // Full overworld map root (ground + city + wilderness) — swapped vs dungeon maps
  const overworld = new THREE.Group();
  overworld.name = "overworld";

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(MAP_SIZE, MAP_SIZE, 128, 128),
    new THREE.MeshStandardMaterial({ map: makeGrassTexture(), roughness: 0.95, flatShading: false })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  ground.name = "world_ground";
  displaceFieldGround(ground, "overworld");
  overworld.add(ground);

  const cobble = makeCobbleTexture(true);
  cobble.repeat.set(14, 14);
  const plaza = new THREE.Mesh(
    new THREE.CircleGeometry(CITY_RADIUS - 0.4, 48),
    new THREE.MeshStandardMaterial({ map: cobble, roughness: 0.88, flatShading: false })
  );
  plaza.rotation.x = -Math.PI / 2;
  plaza.position.y = 0.04;
  plaza.receiveShadow = true;
  overworld.add(plaza);

  const roadTex = makeCobbleTexture(true);
  roadTex.repeat.set(8, 1.2);
  const roadMat = mat("#ffffff", { map: roadTex, roughness: 0.9, flat: false, tint: "#e8dcc8" });
  for (const rot of [0, Math.PI / 2]) {
    const road = new THREE.Mesh(new THREE.BoxGeometry(CITY_RADIUS * 2 - 2, 0.07, 4.6), roadMat);
    road.position.y = 0.09;
    road.rotation.y = rot;
    road.receiveShadow = true;
    overworld.add(road);
  }

  const fountain = new THREE.Group();
  const fBrick = makeBrickTexture({ brick: "#8a8070", mortar: "#d8d0c0" });
  const fbase = new THREE.Mesh(
    new THREE.CylinderGeometry(2.3, 2.7, 0.55, 14),
    mat("#ffffff", { map: fBrick, roughness: 0.88 })
  );
  fbase.position.y = 0.28;
  fbase.castShadow = true;
  fountain.add(fbase);
  const water = new THREE.Mesh(
    new THREE.CylinderGeometry(1.65, 1.65, 0.22, 16),
    new THREE.MeshStandardMaterial({
      color: "#4a9cc8",
      roughness: 0.12,
      metalness: 0.4,
      transparent: true,
      opacity: 0.88,
    })
  );
  water.position.y = 0.58;
  fountain.add(water);
  const fpillar = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.38, 2.3, 8), mat("#b0a890"));
  fpillar.position.y = 1.5;
  fountain.add(fpillar);
  const ftop = new THREE.Mesh(
    new THREE.SphereGeometry(0.35, 10, 8),
    mat("#6eb8e0", { emissive: "#2a6a90", emissiveIntensity: 0.25, roughness: 0.25, metalness: 0.4 })
  );
  ftop.position.y = 2.75;
  fountain.add(ftop);
  overworld.add(fountain);

  placeCityBuildings(overworld, { arid: false });

  addCityWalls(overworld);
  addCityCozyProps(overworld, { warm: true });

  addMapHorizon(overworld, {
    half: MAP_HALF,
    arid: false,
    portalGaps: [
      { x: EDGE_PORTAL, z: 0, w: 18 },
      { x: TOWER_CORNER.x, z: TOWER_CORNER.z, w: 22 },
    ],
  });

  // River + big bridge (east road crossing), then roads / wilderness
  addFieldRiver(overworld, "overworld");
  const dirtRoad = new THREE.MeshStandardMaterial({
    map: makeDirtTexture(),
    roughness: 0.94,
    color: "#d2b896",
  });
  addBeatenRoadMeshes(overworld, "overworld", dirtRoad);
  dressFieldWilderness(overworld, {
    mapId: "overworld",
    arid: false,
    treeCount: 70,
    rockCount: 100,
    bushCount: 90,
  });

  // East-edge portal to Seungryong
  const eastPortal = makeMapPortalMesh("#6ec8ff", "Seungryong");
  eastPortal.position.set(EDGE_PORTAL, fieldHeightAt(EDGE_PORTAL, 0, "overworld"), 0);
  eastPortal.rotation.y = -Math.PI / 2;
  overworld.add(eastPortal);
  overworld.userData.edgePortal = eastPortal;
  overworld.userData.mapId = "overworld";
  finalizeMapSmoke(overworld);

  scene.add(overworld);
  return { scene, sun, hemi, overworld, ground };
}

/** Brown second field map — city + wilderness, west portal back to Shinsoo. */
export function makeValleyMapRoot() {
  const root = new THREE.Group();
  root.name = "map_valley";
  root.visible = false;

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(MAP_SIZE, MAP_SIZE, 128, 128),
    new THREE.MeshStandardMaterial({ map: makeDirtTexture(), roughness: 0.96, flatShading: false })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  displaceFieldGround(ground, "valley");
  root.add(ground);

  const cobble = makeCobbleTexture(false);
  cobble.repeat.set(14, 14);
  const plaza = new THREE.Mesh(
    new THREE.CircleGeometry(CITY_RADIUS - 0.4, 48),
    new THREE.MeshStandardMaterial({ map: cobble, roughness: 0.9, flatShading: false })
  );
  plaza.rotation.x = -Math.PI / 2;
  plaza.position.y = 0.04;
  plaza.receiveShadow = true;
  root.add(plaza);

  const roadTex = makeCobbleTexture(false);
  roadTex.repeat.set(8, 1.2);
  const roadMat = mat("#ffffff", { map: roadTex, roughness: 0.92, flat: false, tint: "#d8c8a8" });
  for (const rot of [0, Math.PI / 2]) {
    const road = new THREE.Mesh(new THREE.BoxGeometry(CITY_RADIUS * 2 - 2, 0.07, 4.6), roadMat);
    road.position.y = 0.09;
    road.rotation.y = rot;
    road.receiveShadow = true;
    root.add(road);
  }

  const fountain = new THREE.Group();
  const fBrick = makeBrickTexture({ brick: "#7a6548", mortar: "#c8b898" });
  const fbase = new THREE.Mesh(
    new THREE.CylinderGeometry(2.1, 2.5, 0.5, 14),
    mat("#ffffff", { map: fBrick, roughness: 0.9 })
  );
  fbase.position.y = 0.25;
  fbase.castShadow = true;
  fountain.add(fbase);
  const basin = new THREE.Mesh(
    new THREE.CylinderGeometry(1.4, 1.4, 0.18, 16),
    new THREE.MeshStandardMaterial({ color: "#5a8a92", roughness: 0.22, metalness: 0.35, transparent: true, opacity: 0.82 })
  );
  basin.position.y = 0.52;
  fountain.add(basin);
  root.add(fountain);

  placeCityBuildings(root, { arid: true });

  addCityWalls(root);
  addCityCozyProps(root, { warm: false });

  addMapHorizon(root, {
    half: MAP_HALF,
    arid: true,
    portalGaps: [
      { x: -EDGE_PORTAL, z: 0, w: 18 },
      { x: EDGE_PORTAL, z: 0, w: 18 },
    ],
  });

  addFieldRiver(root, "valley");
  const valleyDirt = new THREE.MeshStandardMaterial({
    map: makeDirtTexture(),
    roughness: 0.94,
    color: "#c9a878",
  });
  addBeatenRoadMeshes(root, "valley", valleyDirt);
  dressFieldWilderness(root, {
    mapId: "valley",
    arid: true,
    treeCount: 75,
    rockCount: 110,
    bushCount: 85,
  });

  // NW rogue hamlet — 2–3 detailed houses
  root.add(makeBanditCampMesh());

  const westPortal = makeMapPortalMesh("#e8b84a", "Shinsoo");
  westPortal.position.set(-EDGE_PORTAL, fieldHeightAt(-EDGE_PORTAL, 0, "valley"), 0);
  westPortal.rotation.y = Math.PI / 2;
  root.add(westPortal);

  const eastPortal = makeMapPortalMesh("#5a8a3a", "Orc Isles");
  eastPortal.position.set(EDGE_PORTAL, fieldHeightAt(EDGE_PORTAL, 0, "valley"), 0);
  eastPortal.rotation.y = -Math.PI / 2;
  root.add(eastPortal);

  root.userData = { mapId: "valley", edgePortal: westPortal, edgePortalEast: eastPortal };
  finalizeMapSmoke(root);

  return root;
}

/** Small cartoon rogue village in Seungryong's NW corner */
function makeBanditCampMesh() {
  const g = new THREE.Group();
  g.name = "bandit_camp";
  g.position.set(BANDIT_CAMP.x, fieldHeightAt(BANDIT_CAMP.x, BANDIT_CAMP.z, "valley"), BANDIT_CAMP.z);

  // Prefer a tall viking hut as the bandit hall, plus GLB side houses
  const hall = AssetKit.clonePropToHeight("viking_hut", 7.2);
  if (hall) {
    hall.position.set(0, 0, -1.2);
    hall.rotation.y = 0.35;
    hall.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = false;
        o.receiveShadow = true;
      }
    });
    g.add(hall);
  }

  const houses = hall
    ? [
        { x: -6.5, z: 3.2, w: 3.6, h: 2.9, d: 3.4, rot: -0.4, color: "#a88860", roof: "#4a2018" },
        { x: 6.2, z: 2.8, w: 3.8, h: 3.0, d: 3.2, rot: 0.1, color: "#c4a070", roof: "#2a1810" },
      ]
    : [
        { x: -3.2, z: -2.4, w: 4.2, h: 3.2, d: 3.6, rot: 0.25, color: "#b8956a", roof: "#3a2418" },
        { x: 3.4, z: -1.8, w: 3.6, h: 2.9, d: 3.4, rot: -0.4, color: "#a88860", roof: "#4a2018" },
        { x: 0.6, z: 3.6, w: 3.8, h: 3.0, d: 3.2, rot: 0.1, color: "#c4a070", roof: "#2a1810" },
      ];
  for (const h of houses) {
    // Small pad under each house only (no giant mud “puddle” ring)
    const pad = new THREE.Mesh(
      new THREE.CircleGeometry(Math.max(h.w, h.d) * 0.55, 12),
      mat("#5a4a30", { roughness: 0.96 })
    );
    pad.rotation.x = -Math.PI / 2;
    pad.position.set(h.x, 0.04, h.z);
    pad.receiveShadow = true;
    g.add(pad);
    let b = AssetKit.clonePropToHeight("house_small", 5.8);
    if (b) {
      b.position.set(h.x, 0, h.z);
      b.rotation.y = h.rot;
      b.traverse((o) => {
        if (o.isMesh) o.receiveShadow = true;
      });
    } else {
      b = makeBuilding(h.w, h.h, h.d, h.color, { roofColor: h.roof, smoke: true });
      b.position.set(h.x, 0, h.z);
      b.rotation.y = h.rot;
    }
    g.add(b);
  }

  // Campfire
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.85, 0.12, 6, 14), mat("#4a4035"));
  ring.rotation.x = Math.PI / 2;
  ring.position.set(0.2, 0.12, 0.4);
  g.add(ring);
  for (let i = 0; i < 5; i++) {
    const log = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 1.1, 5), mat("#3a2818"));
    log.position.set(0.2, 0.2, 0.4);
    log.rotation.z = Math.PI / 2;
    log.rotation.y = (i / 5) * Math.PI;
    g.add(log);
  }
  const flame = new THREE.Mesh(
    new THREE.ConeGeometry(0.35, 0.9, 5),
    mat("#ff8a3a", { emissive: "#c43c2e", emissiveIntensity: 0.85 })
  );
  flame.position.set(0.2, 0.7, 0.4);
  g.add(flame);
  addChimneySmoke(g, 0.2, 1.1, 0.4, { scale: 1.1, tint: "#b8b0a4" });

  // Stolen crates / barrels
  for (const [bx, bz] of [
    [-5.5, 1.2],
    [5.2, 2.0],
    [-1.5, 5.5],
    [4.8, -4.2],
  ]) {
    const crate = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.55, 0.7), mat("#5a3a22"));
    crate.position.set(bx, 0.28, bz);
    crate.rotation.y = Math.random();
    crate.castShadow = true;
    g.add(crate);
  }

  // Rough stake fence around camp
  const stake = mat("#3a2a18", { roughness: 0.9 });
  for (let i = 0; i < 20; i++) {
    const ang = (i / 20) * Math.PI * 2;
    if (i % 5 === 0) continue; // gaps as "gates"
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 1.5, 5), stake);
    p.position.set(Math.cos(ang) * 9.2, 0.75, Math.sin(ang) * 9.2);
    p.castShadow = true;
    g.add(p);
  }

  // Banner pole
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 3.2, 5), stake);
  pole.position.set(-6.2, 1.6, -5.5);
  g.add(pole);
  const banner = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1.8), mat("#6a1818", { roughness: 0.8 }));
  banner.position.set(-5.4, 2.2, -5.5);
  g.add(banner);

  return g;
}

/** Large archipelago field — water, islands, war tower, black-orc hunting grounds. */
export function makeOrcMapRoot() {
  const root = new THREE.Group();
  root.name = "map_orc_valley";
  root.visible = false;

  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(ORC_MAP_SIZE + 40, ORC_MAP_SIZE + 40, 1, 1),
    new THREE.MeshStandardMaterial({
      color: "#1a3a42",
      roughness: 0.22,
      metalness: 0.35,
      transparent: true,
      opacity: 0.92,
    })
  );
  water.rotation.x = -Math.PI / 2;
  water.position.y = -0.35;
  water.receiveShadow = true;
  root.add(water);

  const grassMap = makeIslandGrassTexture();
  const sandMap = makeSandTexture();
  const grass = mat("#ffffff", { map: grassMap, roughness: 0.92, tint: "#c8d8b0" });
  const sand = mat("#ffffff", { map: sandMap, roughness: 0.95, tint: "#e8d8b0" });
  const rockMat = mat("#ffffff", {
    map: makeBrickTexture({ brick: "#4a483e", mortar: "#6a6858", vary: 20, crack: true }),
    roughness: 0.9,
    tint: "#d0cec0",
  });
  const darkRock = mat("#2a2820", { roughness: 0.95 });

  for (const isle of ORC_ISLANDS) {
    const disk = new THREE.Mesh(
      new THREE.CylinderGeometry(isle.r, isle.r + 0.8, 0.55, 28),
      isle.tier === "main" ? grass : sand
    );
    disk.position.set(isle.x, 0.05, isle.z);
    disk.receiveShadow = true;
    disk.castShadow = true;
    root.add(disk);

    // Rocky rim
    const rimCount = isle.tier === "main" ? 18 : 10;
    for (let i = 0; i < rimCount; i++) {
      const ang = (i / rimCount) * Math.PI * 2 + Math.random() * 0.2;
      const rr = isle.r - 0.6 + Math.random() * 1.2;
      const rock = new THREE.Mesh(
        new THREE.DodecahedronGeometry(0.45 + Math.random() * (isle.tier === "main" ? 1.6 : 1.0), 0),
        Math.random() < 0.4 ? darkRock : rockMat
      );
      rock.position.set(isle.x + Math.cos(ang) * rr, 0.35, isle.z + Math.sin(ang) * rr);
      rock.rotation.set(Math.random(), Math.random(), Math.random());
      rock.castShadow = true;
      root.add(rock);
    }

    // Cozy camp clutter on outer islets
    if (isle.tier !== "main" && isle.r > 6) {
      const hut =
        AssetKit.clonePropToHeight("viking_hut", 5.2) ||
        AssetKit.clonePropToHeight("house_small", 4.8);
      if (hut) {
        hut.position.set(isle.x + isle.r * 0.15, 0.2, isle.z - isle.r * 0.1);
        hut.rotation.y = Math.random() * Math.PI;
        hut.traverse((o) => {
          if (o.isMesh) o.receiveShadow = true;
        });
        root.add(hut);
      } else {
        const proc = makeBuilding(2.6, 2.2, 2.4, "#8a7a58", { roofColor: "#3a2a18", smoke: true });
        proc.position.set(isle.x + isle.r * 0.15, 0.2, isle.z - isle.r * 0.1);
        proc.scale.setScalar(0.85);
        root.add(proc);
      }
    }
  }

  // Bridges / reefs — plank look
  const plank = makeBrickTexture({ brick: "#5a4a32", mortar: "#3a3020", vary: 12, crack: false });
  for (const b of ORC_BRIDGES) {
    const dx = b.x2 - b.x1;
    const dz = b.z2 - b.z1;
    const len = Math.hypot(dx, dz);
    const bridge = new THREE.Mesh(
      new THREE.BoxGeometry(b.w, 0.28, len),
      mat("#ffffff", { map: plank, roughness: 0.92, tint: "#d8c8a0" })
    );
    bridge.position.set((b.x1 + b.x2) / 2, 0.02, (b.z1 + b.z2) / 2);
    bridge.rotation.y = Math.atan2(dx, dz);
    bridge.receiveShadow = true;
    root.add(bridge);
  }

  // War tower — very tall, center of main island
  root.add(makeOrcWarTower());

  // Teleporter pad south of the war tower (Isle Gatekeeper)
  const telePad = new THREE.Mesh(
    new THREE.CylinderGeometry(2.4, 2.6, 0.22, 20),
    new THREE.MeshStandardMaterial({
      color: "#4a6a3a",
      emissive: "#2a4a22",
      emissiveIntensity: 0.35,
      roughness: 0.55,
      metalness: 0.25,
    })
  );
  telePad.position.set(0, 0.12, 14);
  telePad.receiveShadow = true;
  root.add(telePad);
  const teleRing = new THREE.Mesh(
    new THREE.TorusGeometry(2.2, 0.08, 8, 28),
    new THREE.MeshStandardMaterial({
      color: "#7dff9a",
      emissive: "#3a8a4a",
      emissiveIntensity: 0.7,
    })
  );
  teleRing.rotation.x = Math.PI / 2;
  teleRing.position.set(0, 0.28, 14);
  root.add(teleRing);
  root.userData.telePad = telePad;

  // Light Kenney forest around the tower
  for (let i = 0; i < 35; i++) {
    const ang = Math.random() * Math.PI * 2;
    const r = 9 + Math.random() * 22;
    const x = Math.cos(ang) * r;
    const z = Math.sin(ang) * r;
    if (Math.hypot(x, z) < 8.5) continue;
    if (Math.hypot(x, z - 14) < 5) continue;
    const h = 7 + Math.random() * 5;
    const tree = NatureKit.randomForestTree(false, h) || makeFallbackTree(false);
    if (!tree) continue;
    tagFadeTree(tree);
    tree.position.set(x, 0, z);
    tree.rotation.y = Math.random() * Math.PI * 2;
    root.add(tree);
  }

  // Outer islet forests
  for (const isle of ORC_ISLANDS) {
    if (isle.tier === "main") continue;
    const n = 3 + ((Math.random() * 3) | 0);
    for (let i = 0; i < n; i++) {
      const ang = Math.random() * Math.PI * 2;
      const r = 2 + Math.random() * (isle.r - 3.2);
      const tree = NatureKit.randomForestTree(false, 6 + Math.random() * 4);
      if (!tree) continue;
      tagFadeTree(tree);
      tree.position.set(isle.x + Math.cos(ang) * r, 0, isle.z + Math.sin(ang) * r);
      tree.rotation.y = Math.random() * Math.PI * 2;
      root.add(tree);
    }
  }

  // Mountain ring around the isles — no flat void box walls
  addMapHorizon(root, {
    half: ORC_MAP_HALF,
    arid: false,
    portalGaps: [{ x: -68.5, z: 0, w: 18 }],
  });

  const westPortal = makeMapPortalMesh("#c47a3a", "Seungryong");
  westPortal.position.set(-68.5, 0, 0);
  westPortal.rotation.y = Math.PI / 2;
  root.add(westPortal);

  root.userData = { mapId: "orc_valley", edgePortal: westPortal };
  finalizeMapSmoke(root);
  return root;
}

function makeOrcWarTower() {
  const g = new THREE.Group();
  g.name = "orc_war_tower";
  const brickDark = makeBrickTexture({ brick: "#4a4038", mortar: "#2a2820", vary: 18 });
  brickDark.repeat.set(3, 4);
  const brickMid = makeBrickTexture({ brick: "#3a3830", mortar: "#1e1c18", vary: 16 });
  brickMid.repeat.set(2.5, 5);
  const stone = mat("#ffffff", { map: brickDark, roughness: 0.9, tint: "#c8c0b0" });
  const dark = mat("#ffffff", { map: brickMid, roughness: 0.92, tint: "#a09888" });
  const banner = mat("#4a1818", { roughness: 0.8 });
  const ember = mat("#c43c2e", { emissive: "#8b1e1e", emissiveIntensity: 0.65 });

  const base = new THREE.Mesh(new THREE.CylinderGeometry(7.5, 9.2, 3.2, 8), stone);
  base.position.y = 1.5;
  base.castShadow = true;
  base.receiveShadow = true;
  g.add(base);

  const mid = new THREE.Mesh(new THREE.CylinderGeometry(5.2, 6.6, 10, 8), dark);
  mid.position.y = 7.5;
  mid.castShadow = true;
  g.add(mid);

  const upper = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 4.6, 9, 8), stone);
  upper.position.y = 16.5;
  upper.castShadow = true;
  g.add(upper);

  const spire = new THREE.Mesh(new THREE.ConeGeometry(2.8, 8, 8), dark);
  spire.position.y = 24.5;
  spire.castShadow = true;
  g.add(spire);

  // Battlements
  for (let i = 0; i < 8; i++) {
    const ang = (i / 8) * Math.PI * 2;
    const tooth = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.6, 1.4), stone);
    tooth.position.set(Math.cos(ang) * 4.8, 21.4, Math.sin(ang) * 4.8);
    tooth.castShadow = true;
    g.add(tooth);
  }

  // Banner poles
  for (const side of [-1, 1]) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 6, 5), dark);
    pole.position.set(side * 5.5, 10, 4.2);
    g.add(pole);
    const cloth = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 3.2), banner);
    cloth.position.set(side * 5.5 + side * 1.0, 10.2, 4.2);
    cloth.rotation.y = side > 0 ? -0.4 : 0.4;
    g.add(cloth);
  }

  // Ember windows with frames
  for (const y of [6, 12, 18]) {
    for (let i = 0; i < 4; i++) {
      const ang = (i / 4) * Math.PI * 2 + 0.4;
      const rr = y < 10 ? 6.0 : y < 16 ? 4.4 : 3.2;
      const frame = new THREE.Mesh(new THREE.BoxGeometry(1.15, 1.45, 0.18), mat("#1a1814"));
      frame.position.set(Math.cos(ang) * rr, y, Math.sin(ang) * rr);
      frame.rotation.y = ang;
      g.add(frame);
      const win = new THREE.Mesh(new THREE.BoxGeometry(0.85, 1.1, 0.16), ember);
      win.position.set(Math.cos(ang) * (rr + 0.02), y, Math.sin(ang) * (rr + 0.02));
      win.rotation.y = ang;
      g.add(win);
    }
  }

  // Braziers + smoke at battlements
  for (let i = 0; i < 4; i++) {
    const ang = (i / 4) * Math.PI * 2;
    const bowl = new THREE.Mesh(
      new THREE.CylinderGeometry(0.55, 0.4, 0.45, 8),
      mat("#2a2018", { roughness: 0.7, metalness: 0.3 })
    );
    bowl.position.set(Math.cos(ang) * 4.2, 22.2, Math.sin(ang) * 4.2);
    g.add(bowl);
    const flame = new THREE.Mesh(
      new THREE.ConeGeometry(0.28, 0.7, 5),
      mat("#ff8a3a", { emissive: "#c43c2e", emissiveIntensity: 0.9 })
    );
    flame.position.set(Math.cos(ang) * 4.2, 22.7, Math.sin(ang) * 4.2);
    g.add(flame);
    addChimneySmoke(g, Math.cos(ang) * 4.2, 23.1, Math.sin(ang) * 4.2, {
      scale: 1.15,
      tint: "#b0a898",
    });
  }

  const light = new THREE.PointLight("#c43c2e", 1.4, 55);
  light.position.set(0, 22, 0);
  g.add(light);

  return g;
}

/** Edge / travel portal — arch + glowing pad */
export function makeMapPortalMesh(color = "#6ec8ff", label = "Portal") {
  const g = new THREE.Group();
  const stone = mat("#5a5348", { roughness: 0.9 });
  const left = new THREE.Mesh(new THREE.BoxGeometry(0.7, 4.2, 0.7), stone);
  left.position.set(-1.6, 2.1, 0);
  left.castShadow = true;
  g.add(left);
  const right = left.clone();
  right.position.x = 1.6;
  g.add(right);
  const lintel = new THREE.Mesh(new THREE.BoxGeometry(4.0, 0.65, 0.75), stone);
  lintel.position.set(0, 4.35, 0);
  lintel.castShadow = true;
  g.add(lintel);

  const glow = new THREE.Mesh(
    new THREE.CylinderGeometry(1.5, 1.5, 0.12, 20),
    new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: 0.85,
      transparent: true,
      opacity: 0.75,
      roughness: 0.3,
    })
  );
  glow.position.y = 0.08;
  g.add(glow);

  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(1.55, 0.08, 8, 28),
    new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.6 })
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.14;
  g.add(ring);

  // Simple floating label
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "rgba(0,0,0,0.45)";
  ctx.fillRect(0, 0, 256, 64);
  ctx.fillStyle = "#f2e6c8";
  ctx.font = "bold 28px Georgia, serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, 128, 32);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false })
  );
  sprite.position.set(0, 5.2, 0);
  sprite.scale.set(4.2, 1.05, 1);
  g.add(sprite);

  g.userData = { glow, ring, label: sprite, kind: "map_portal" };
  return g;
}

/** Separate Demon Tower map — own ground, lighting accent, arena. Not the city. */
export function makeDungeonMapRoot() {
  const root = new THREE.Group();
  root.name = "map_demon_tower";
  root.visible = false;

  const voidFloor = new THREE.Mesh(
    new THREE.CircleGeometry(28, 56),
    new THREE.MeshStandardMaterial({ color: "#0c080a", roughness: 1, metalness: 0.05 })
  );
  voidFloor.rotation.x = -Math.PI / 2;
  voidFloor.position.y = -0.02;
  voidFloor.receiveShadow = true;
  root.add(voidFloor);

  // Ring of void stones so the map edge is obvious
  const stone = mat("#2a1818", { roughness: 0.95 });
  for (let i = 0; i < 24; i++) {
    const ang = (i / 24) * Math.PI * 2;
    const pillar = new THREE.Mesh(new THREE.BoxGeometry(1.4, 5 + (i % 3), 1.4), stone);
    pillar.position.set(Math.cos(ang) * 24, 2.2, Math.sin(ang) * 24);
    pillar.rotation.y = ang;
    pillar.castShadow = true;
    root.add(pillar);
  }

  const ember = new THREE.PointLight("#c43c2e", 1.1, 40);
  ember.position.set(0, 8, 0);
  root.add(ember);
  const cool = new THREE.PointLight("#3a60aa", 0.55, 30);
  cool.position.set(0, 4, 10);
  root.add(cool);

  const arena = makeDemonArenaMesh();
  arena.position.set(0, 0, 0);
  arena.visible = true;
  root.add(arena);

  // Floor label
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 96;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "rgba(0,0,0,0.45)";
  ctx.fillRect(40, 16, 432, 64);
  ctx.font = "bold 28px Cinzel, serif";
  ctx.fillStyle = "#ff6a4a";
  ctx.textAlign = "center";
  ctx.fillText("DEMON TOWER", 256, 44);
  ctx.font = "16px Noto Sans KR, sans-serif";
  ctx.fillStyle = "#e8d48b";
  ctx.fillText("Instance map — clear floor · blue portal", 256, 68);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const title = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  title.position.set(0, 9.5, 0);
  title.scale.set(8, 1.5, 1);
  root.add(title);

  root.userData = {
    kind: "dungeon_map",
    mapId: "demon_tower",
    arena,
    portal: arena.userData.portal,
    portalLabel: arena.userData.portalLabel,
    portalRing: arena.userData.portalRing,
    title,
  };
  return root;
}

export function createCamera() {
  const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 560);
  camera.position.set(0, 5.5, -11);
  return camera;
}

/** Shared floating HP / name sprite for mobs & metins */
export function attachHpBar(root, { y = 1.6, scaleX = 1.8, scaleY = 0.45 } = {}) {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext("2d");
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: true, depthWrite: false })
  );
  sprite.position.y = y;
  sprite.scale.set(scaleX, scaleY, 1);
  root.add(sprite);
  root.userData.hpCanvas = canvas;
  root.userData.hpCtx = ctx;
  root.userData.hpTex = tex;
  root.userData.hpSprite = sprite;
  root.userData.hpKey = "";
  return sprite;
}

export function updateHpBar(mesh, { name = "", hp = 1, maxHp = 1, level = 0, color = "#e23a2e" } = {}) {
  const ctx = mesh.userData?.hpCtx;
  const canvas = mesh.userData?.hpCanvas;
  if (!ctx || !canvas) return;
  const ratio = Math.max(0, Math.min(1, maxHp > 0 ? hp / maxHp : 0));
  const key = `${name}|${level}|${ratio.toFixed(2)}|${Math.ceil(hp)}`;
  if (mesh.userData.hpKey === key) return;
  mesh.userData.hpKey = key;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (name) {
    ctx.font = "bold 18px Cinzel, serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillRect(28, 4, 200, 22);
    ctx.fillStyle = "#ffe9a0";
    const label = level ? `Lv${level} ${name}` : name;
    ctx.fillText(String(label).slice(0, 18), 128, 15);
  }
  ctx.fillStyle = "rgba(0,0,0,0.75)";
  ctx.fillRect(36, 34, 184, 18);
  ctx.strokeStyle = "#c9a227";
  ctx.lineWidth = 2;
  ctx.strokeRect(36, 34, 184, 18);
  const grd = ctx.createLinearGradient(36, 0, 220, 0);
  grd.addColorStop(0, "#4a0000");
  grd.addColorStop(1, ratio > 0.35 ? color : "#ff8844");
  ctx.fillStyle = grd;
  ctx.fillRect(38, 36, 180 * ratio, 14);
  mesh.userData.hpTex.needsUpdate = true;
  if (mesh.userData.hpSprite) mesh.userData.hpSprite.visible = hp < maxHp || true;
}

/** Quest bang / question over NPC heads */
export function attachQuestMarker(root, y = 2.55) {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false })
  );
  sprite.position.y = y;
  sprite.scale.set(0.85, 0.85, 1);
  sprite.visible = false;
  root.add(sprite);
  root.userData.questCanvas = canvas;
  root.userData.questCtx = ctx;
  root.userData.questTex = tex;
  root.userData.questSprite = sprite;
  root.userData.questState = "";
  return sprite;
}

/** Floating hunt / objective beacon for active quests in the field */
export function makeHuntBeacon(color = "#4db0ff", label = "!") {
  const g = new THREE.Group();
  g.name = "hunt_beacon";
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(0.12, 0.35, 4.5, 8),
    new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: 0.85,
      transparent: true,
      opacity: 0.55,
      roughness: 0.4,
    })
  );
  beam.position.y = 2.4;
  g.add(beam);
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.9, 0.08, 8, 20),
    new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: 1.1,
      roughness: 0.35,
    })
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.15;
  g.add(ring);
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, 128, 128);
  ctx.fillStyle = color;
  ctx.font = "bold 72px Cinzel, serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, 64, 64);
  const tex = new THREE.CanvasTexture(canvas);
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false })
  );
  sprite.scale.set(2.2, 2.2, 1);
  sprite.position.y = 5.2;
  g.add(sprite);
  g.userData.spin = ring;
  return g;
}

export function setQuestMarker(mesh, state) {
  // state: "!" | "?" | "done" | "" 
  const sprite = mesh.userData?.questSprite;
  const ctx = mesh.userData?.questCtx;
  const canvas = mesh.userData?.questCanvas;
  if (!sprite || !ctx) return;
  if (mesh.userData.questState === state) return;
  mesh.userData.questState = state;
  if (!state) {
    sprite.visible = false;
    return;
  }
  sprite.visible = true;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const color = state === "!" ? "#ffd24a" : state === "?" ? "#4aa3ff" : "#4ecf8a";
  // glow disc
  const g = ctx.createRadialGradient(64, 64, 8, 64, 64, 56);
  g.addColorStop(0, color);
  g.addColorStop(0.45, color);
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(64, 64, 56, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#1a1208";
  ctx.beginPath();
  ctx.arc(64, 58, 28, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = color;
  ctx.strokeStyle = "#1a1208";
  ctx.lineWidth = 4;
  ctx.font = "bold 64px Cinzel, serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const glyph = state === "done" ? "✓" : state;
  ctx.strokeText(glyph, 64, 60);
  ctx.fillText(glyph, 64, 60);
  mesh.userData.questTex.needsUpdate = true;
}

/** Rigged low-poly humanoid — prefers static class GLBs when AssetKit is ready */
export function makePlayerMesh(classId, isLocal = false) {
  const cls = CLASSES[classId] || CLASSES.warrior;
  const gltfBody = AssetKit.classBody(classId, 1.85);
  if (gltfBody) {
    const root = new THREE.Group();
    const rig = new THREE.Group();
    root.add(rig);
    rig.add(gltfBody);

    const aura = new THREE.Mesh(
      new THREE.RingGeometry(0.5, 0.8, 32),
      new THREE.MeshBasicMaterial({
        color: cls.color,
        transparent: true,
        opacity: isLocal ? 0.5 : 0.3,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
    );
    aura.rotation.x = -Math.PI / 2;
    aura.position.y = 0.04;
    root.add(aura);

    const canvas = document.createElement("canvas");
    canvas.width = 320;
    canvas.height = 96;
    const ctx = canvas.getContext("2d");
    const tex = new THREE.CanvasTexture(canvas);
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false })
    );
    sprite.position.y = 2.45;
    sprite.scale.set(2.8, 0.85, 1);
    root.add(sprite);

    root.userData = {
      ...root.userData,
      useGltf: true,
      gltfBody,
      rig,
      hips: rig,
      aura,
      labelCanvas: canvas,
      labelCtx: ctx,
      labelTex: tex,
      classId,
      animPhase: 0,
      moving: false,
      attacking: 0,
    };
    drawPlate(root, cls.name, cls.name, 1, 1);
    return root;
  }

  const root = new THREE.Group();
  const rig = new THREE.Group();
  root.add(rig);

  const skin = mat("#e0c4a0", { flat: true, roughness: 0.7 });
  const cloth = mat(cls.color, {
    metalness: 0.2,
    roughness: 0.45,
    emissive: cls.color,
    emissiveIntensity: isLocal ? 0.12 : 0.04,
  });
  const dark = mat("#2a2218", { metalness: 0.35, roughness: 0.5 });
  const gold = mat("#d4b84a", { metalness: 0.7, roughness: 0.35, emissive: "#5a4010", emissiveIntensity: 0.2 });

  // Aura
  const aura = new THREE.Mesh(
    new THREE.RingGeometry(0.5, 0.8, 32),
    new THREE.MeshBasicMaterial({
      color: cls.color,
      transparent: true,
      opacity: isLocal ? 0.5 : 0.3,
      side: THREE.DoubleSide,
      depthWrite: false,
    })
  );
  aura.rotation.x = -Math.PI / 2;
  aura.position.y = 0.04;
  root.add(aura);

  const hips = new THREE.Group();
  hips.position.y = 0.95;
  rig.add(hips);

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.65, 0.32), cloth);
  torso.position.y = 0.35;
  torso.castShadow = true;
  hips.add(torso);

  const chestPlate = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.28, 0.36), dark);
  chestPlate.position.y = 0.48;
  hips.add(chestPlate);

  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.15, 6), skin);
  neck.position.y = 0.75;
  hips.add(neck);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 10, 10), skin);
  head.position.y = 0.98;
  head.castShadow = true;
  hips.add(head);

  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.26, 8, 6, 0, Math.PI * 2, 0, Math.PI * 0.55), dark);
  hair.position.y = 1.05;
  hips.add(hair);

  // Arms
  function makeArm(side) {
    const arm = new THREE.Group();
    arm.position.set(side * 0.38, 0.55, 0);
    const upper = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.42, 0.14), cloth);
    upper.position.y = -0.18;
    upper.castShadow = true;
    arm.add(upper);
    const lower = new THREE.Group();
    lower.position.y = -0.4;
    const forearm = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.38, 0.12), skin);
    forearm.position.y = -0.16;
    lower.add(forearm);
    arm.add(lower);
    arm.userData.lower = lower;
    return arm;
  }
  const leftArm = makeArm(-1);
  const rightArm = makeArm(1);
  hips.add(leftArm, rightArm);

  // Weapon in right hand
  const weapon = new THREE.Group();
  weapon.position.set(0, -0.38, 0);
  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 1.15), gold);
  blade.position.z = 0.45;
  weapon.add(blade);
  const hilt = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.22), dark);
  weapon.add(hilt);
  rightArm.userData.lower.add(weapon);

  // Legs
  function makeLeg(side) {
    const leg = new THREE.Group();
    leg.position.set(side * 0.14, 0, 0);
    const thigh = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.45, 0.2), dark);
    thigh.position.y = -0.22;
    thigh.castShadow = true;
    leg.add(thigh);
    const shinG = new THREE.Group();
    shinG.position.y = -0.45;
    const shin = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.42, 0.18), dark);
    shin.position.y = -0.18;
    shinG.add(shin);
    const boot = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.14, 0.32), mat("#1a120c"));
    boot.position.set(0, -0.42, 0.04);
    shinG.add(boot);
    leg.add(shinG);
    leg.userData.shin = shinG;
    return leg;
  }
  const leftLeg = makeLeg(-1);
  const rightLeg = makeLeg(1);
  hips.add(leftLeg, rightLeg);

  // Nameplate
  const canvas = document.createElement("canvas");
  canvas.width = 320;
  canvas.height = 96;
  const ctx = canvas.getContext("2d");
  const tex = new THREE.CanvasTexture(canvas);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
  sprite.position.y = 2.55;
  sprite.scale.set(2.8, 0.85, 1);
  root.add(sprite);

  root.userData = {
    ...root.userData,
    rig,
    hips,
    leftArm,
    rightArm,
    leftLeg,
    rightLeg,
    weapon,
    aura,
    blade,
    labelCanvas: canvas,
    labelCtx: ctx,
    labelTex: tex,
    classId,
    animPhase: 0,
    moving: false,
    attacking: 0,
  };

  drawPlate(root, cls.name, cls.name, 1, 1);
  return root;
}

/**
 * Walk / idle / attack limb animation.
 * @param attackPulse — rising edge: start a new swing of length attackDur
 * @param attacking — remaining attack time (local player); if >0 refreshes countdown
 * @param attackDur — full swing duration for progress curve
 */
export function animateCharacter(
  mesh,
  dt,
  { moving = false, attacking = 0, attackDur = 0, attackPulse = false, speed = 1 } = {}
) {
  const d = mesh.userData;
  if (!d) return;

  if (attackPulse) {
    const dur = Math.max(0.35, attackDur || 0.7);
    d.attacking = dur;
    d.attackDur = dur;
  } else if (attacking > 0) {
    d.attacking = attacking;
    if (attackDur > 0) d.attackDur = attackDur;
  } else {
    d.attacking = Math.max(0, (d.attacking || 0) - dt);
  }
  const inAttack = d.attacking > 0;
  const dur = Math.max(0.35, d.attackDur || 0.7);

  // Static class GLBs — bob / lean only (no skeleton clips)
  if (d.useGltf && d.rig) {
    if (moving) {
      d.animPhase = (d.animPhase || 0) + dt * 9 * speed * (inAttack ? 0.85 : 1);
      const c = Math.cos(d.animPhase);
      d.rig.position.y = Math.abs(c) * 0.05;
      if (!inAttack) d.rig.rotation.y = Math.sin(d.animPhase) * 0.05;
    } else if (!inAttack) {
      d.rig.position.y = Math.sin(performance.now() * 0.003) * 0.015;
      d.rig.rotation.y *= 0.85;
    }
    if (inAttack) {
      const t = 1 - d.attacking / dur;
      const swing = Math.sin(Math.min(1, Math.max(0, t)) * Math.PI);
      d.rig.rotation.y = swing * 0.22;
      if (d.gltfBody) d.gltfBody.rotation.x = swing * 0.12;
      d.rig.position.y = Math.sin(t * Math.PI) * 0.04;
    } else if (d.gltfBody) {
      d.gltfBody.rotation.x *= 0.82;
    }
    if (d.aura) d.aura.rotation.z += dt * 1.6;
    return;
  }

  if (!d.hips || !d.leftLeg) return;

  if (moving) {
    // Keep legs stepping during auto-attack (upper body handles the swing)
    const step = inAttack ? 0.55 : 1;
    d.animPhase = (d.animPhase || 0) + dt * 9 * speed * (inAttack ? 0.85 : 1);
    const s = Math.sin(d.animPhase);
    const c = Math.cos(d.animPhase);
    d.leftLeg.rotation.x = s * 0.7 * step;
    d.rightLeg.rotation.x = -s * 0.7 * step;
    if (d.leftLeg.userData?.shin) d.leftLeg.userData.shin.rotation.x = Math.max(0, -s) * 0.5 * step;
    if (d.rightLeg.userData?.shin) d.rightLeg.userData.shin.rotation.x = Math.max(0, s) * 0.5 * step;
    if (!inAttack) {
      d.leftArm.rotation.x = -s * 0.55;
      d.rightArm.rotation.x = s * 0.55;
    } else {
      d.leftArm.rotation.x = -s * 0.25;
    }
    d.hips.position.y = 0.95 + Math.abs(c) * 0.04 * step;
    if (!inAttack) d.hips.rotation.y = s * 0.06;
  } else if (!inAttack) {
    d.leftLeg.rotation.x *= 0.78;
    d.rightLeg.rotation.x *= 0.78;
    d.leftArm.rotation.x *= 0.78;
    d.rightArm.rotation.x *= 0.82;
    d.hips.position.y += (0.95 - d.hips.position.y) * 0.15;
    d.hips.rotation.y *= 0.85;
    d.hips.position.y = 0.95 + Math.sin(performance.now() * 0.003) * 0.015;
  }

  if (inAttack) {
    // Progress 0→1 over full attack window (windup + recover)
    const t = 1 - d.attacking / dur;
    // Wind-up holds high, release near mid, ease out — Metin-like weight
    const swing = Math.sin(Math.min(1, Math.max(0, t)) * Math.PI) * 1.65;
    d.rightArm.rotation.x = -0.65 - swing;
    d.rightArm.rotation.z = swing * 0.45;
    d.leftArm.rotation.x = (d.leftArm.rotation.x || 0) * 0.4 + (-0.25 + swing * 0.2) * 0.6;
    if (d.weapon) d.weapon.rotation.x = -swing * 0.6;
    d.hips.rotation.y = (d.hips.rotation.y || 0) * 0.35 + swing * 0.14;
    d.hips.position.y = 0.95 + Math.sin(t * Math.PI) * 0.04;
  } else {
    d.rightArm.rotation.z *= 0.75;
    if (d.weapon) d.weapon.rotation.x *= 0.75;
  }

  if (d.aura) d.aura.rotation.z += dt * 1.6;
}

export function drawPlate(mesh, name, classLabel, level = 1, hpRatio = 1) {
  const ctx = mesh.userData.labelCtx;
  const canvas = mesh.userData.labelCanvas;
  if (!ctx) return;
  const ratio = Math.max(0, Math.min(1, hpRatio));
  const key = `${name}|${classLabel}|${level}|${ratio.toFixed(2)}`;
  if (mesh.userData.plateKey === key) return;
  mesh.userData.plateKey = key;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "rgba(0,0,0,0.5)";
  ctx.fillRect(40, 2, 240, 22);
  ctx.fillStyle = "#7dff9a";
  ctx.font = "bold 16px Noto Sans KR, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(`Lv ${level} ${classLabel}`, 160, 13);

  ctx.fillStyle = "#ffe9a0";
  ctx.font = "bold 20px Cinzel, serif";
  ctx.fillText(String(name).slice(0, 14), 160, 40);

  ctx.fillStyle = "rgba(0,0,0,0.75)";
  ctx.fillRect(50, 56, 220, 22);
  ctx.strokeStyle = "#d4b84a";
  ctx.lineWidth = 2;
  ctx.strokeRect(50, 56, 220, 22);
  const grd = ctx.createLinearGradient(50, 0, 270, 0);
  grd.addColorStop(0, "#5a0000");
  grd.addColorStop(1, ratio > 0.3 ? "#e23a2e" : "#ff7050");
  ctx.fillStyle = grd;
  ctx.fillRect(52, 58, 216 * ratio, 18);
  mesh.userData.labelTex.needsUpdate = true;
}

export function setNameplate(mesh, name, hpRatio = 1, level = 1, classId) {
  const cls = CLASSES[classId || mesh.userData.classId] || CLASSES.warrior;
  drawPlate(mesh, name, cls.name, level, hpRatio);
}

/** Attach HUD nameplate to any root (low-poly or skinned GLB). */
export function attachPlayerNameplate(root, classId, y = 2.15) {
  if (!root) return;
  if (root.userData?.labelCanvas) return;
  const canvas = document.createElement("canvas");
  canvas.width = 320;
  canvas.height = 96;
  const ctx = canvas.getContext("2d");
  const tex = new THREE.CanvasTexture(canvas);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
  sprite.position.y = y;
  sprite.scale.set(2.8, 0.85, 1);
  root.add(sprite);
  root.userData = {
    ...root.userData,
    labelCanvas: canvas,
    labelCtx: ctx,
    labelTex: tex,
    classId,
    animPhase: 0,
    attacking: 0,
  };
}

/**
 * Metin stone — squat crystal ~half player height (≈0.95m), wider than tall.
 * Classic Metin2 vibe: chunky glowing rock on a short pedestal, not a tall spike.
 */
export function makeMetinMesh(tier = 1, colorOverride = null) {
  const colors = ["#8b1e1e", "#1e4a8b", "#6b1e8b", "#8b6b1e", "#1e8b4a"];
  const color = colorOverride || colors[(tier - 1) % colors.length];
  const root = new THREE.Group();
  const glowMat = (intensity = 0.85) =>
    new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: intensity,
      metalness: 0.35,
      roughness: 0.28,
      flatShading: true,
    });
  const rockMat = mat("#2a2420", { roughness: 0.92, metalness: 0.08 });

  // Wide low pedestal
  const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.68, 0.22, 7), rockMat);
  pedestal.position.y = 0.11;
  pedestal.castShadow = true;
  pedestal.receiveShadow = true;
  root.add(pedestal);
  const lip = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.58, 0.08, 7), mat("#3a3228", { roughness: 0.85 }));
  lip.position.y = 0.24;
  root.add(lip);

  // Main crystal body — squat icosahedron (wide, short)
  const crystalBaseY = 0.62;
  const crystal = new THREE.Group();
  crystal.position.y = crystalBaseY;
  root.add(crystal);

  const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.42, 0), glowMat(1.05));
  core.castShadow = true;
  crystal.add(core);

  // Faceted shell — slightly larger, translucent-looking via lower opacity not available on standard easily; use second brighter shell
  const shell = new THREE.Mesh(
    new THREE.DodecahedronGeometry(0.52, 0),
    new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: 0.55,
      metalness: 0.5,
      roughness: 0.2,
      flatShading: true,
      transparent: true,
      opacity: 0.82,
    })
  );
  shell.scale.set(1.05, 0.85, 1.05); // wider than tall
  crystal.add(shell);

  // Side crystals hugging the body (not floating high)
  const shard = new THREE.Mesh(new THREE.OctahedronGeometry(0.18, 0), glowMat(0.7));
  shard.position.set(0.38, -0.05, 0.12);
  shard.rotation.set(0.4, 0.6, 0.2);
  crystal.add(shard);

  for (const [x, y, z, s, rx, ry] of [
    [-0.36, -0.08, 0.18, 0.14, 0.5, -0.4],
    [0.22, 0.12, -0.32, 0.12, -0.3, 0.8],
    [-0.15, 0.18, 0.3, 0.1, 0.2, 0.3],
    [0.08, -0.18, -0.28, 0.11, 0.6, -0.5],
  ]) {
    const bit = new THREE.Mesh(new THREE.OctahedronGeometry(s, 0), glowMat(0.55));
    bit.position.set(x, y, z);
    bit.rotation.set(rx, ry, 0.2);
    bit.castShadow = true;
    crystal.add(bit);
  }

  // Inner bright nucleus
  const nucleus = new THREE.Mesh(
    new THREE.SphereGeometry(0.14, 8, 8),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95 })
  );
  crystal.add(nucleus);

  // Soft colored light — short range so it doesn't wash the map
  const light = new THREE.PointLight(color, 1.35, 7, 2);
  light.position.y = crystalBaseY;
  root.add(light);

  // Ground glow disc + rune ring
  const disc = new THREE.Mesh(
    new THREE.CircleGeometry(0.75, 24),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false })
  );
  disc.rotation.x = -Math.PI / 2;
  disc.position.y = 0.04;
  disc.raycast = () => {};
  root.add(disc);

  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.7, 0.92, 28),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.05;
  ring.raycast = () => {};
  root.add(ring);

  const runes = new THREE.Mesh(
    new THREE.TorusGeometry(0.58, 0.03, 6, 20),
    new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.75, roughness: 0.35 })
  );
  runes.rotation.x = Math.PI / 2;
  runes.position.y = 0.28;
  root.add(runes);

  root.add(groundShadow(1.35));

  root.userData.crystal = crystal;
  root.userData.shard = shard;
  root.userData.runes = runes;
  root.userData.glowDisc = disc;
  root.userData.glowRing = ring;
  root.userData.light = light;
  root.userData.nucleus = nucleus;
  root.userData.crystalBaseY = crystalBaseY;
  root.userData.tier = tier;
  root.userData.metinColor = color;

  // HP bar just above the short stone (~1.15m)
  attachHpBar(root, { y: 1.25, scaleX: 1.35, scaleY: 0.38 });
  return root;
}

function groundShadow(scale = 1) {
  const s = new THREE.Mesh(
    new THREE.CircleGeometry(0.55 * scale, 16),
    new THREE.MeshBasicMaterial({ color: "#000000", transparent: true, opacity: 0.32, depthWrite: false })
  );
  s.rotation.x = -Math.PI / 2;
  s.position.y = 0.03;
  // Don't steal combat raycasts from the body
  s.raycast = () => {};
  return s;
}

function addPart(parent, geo, material, x, y, z, rx = 0, ry = 0, rz = 0) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  m.castShadow = true;
  parent.add(m);
  return m;
}

/** Prefer custom enemy GLBs; fall back to procedural low-poly */
export function makeMobMesh(kind = "wolf") {
  const gltf = AssetKit.enemyForKind(kind);
  if (gltf) {
    const isBoss = kind === "orc_chief" || kind === "rogue_chief" || kind === "black_ork_brute" || kind === "ophanim";
    const isWolfish = kind === "wolf" || kind === "dog" || kind === "alpha_wolf";
    gltf.add(groundShadow(isBoss ? 1.6 : isWolfish ? 1.15 : 1.25));
    attachHpBar(gltf, {
      y: isBoss ? 3.4 : isWolfish ? 2.05 : 2.55,
      scaleX: isBoss ? 2.2 : 1.7,
      scaleY: 0.4,
    });
    return gltf;
  }
  if (kind === "ork") return makeOrkMesh({});
  if (kind === "elite_ork") return makeOrkMesh({ elite: true });
  if (kind === "black_ork") return makeOrkMesh({ black: true });
  if (kind === "black_ork_brute") return makeOrkMesh({ black: true, brute: true });
  if (kind === "orc_chief") return makeOrkMesh({ black: true, elite: true, brute: true });
  if (kind === "human" || kind === "bandit" || kind === "soldier" || kind === "rogue_chief") {
    return makeHumanMobMesh({
      soldier: kind === "soldier",
      chief: kind === "rogue_chief",
    });
  }
  if (kind === "dog") return makeWolfMesh({ dog: true });
  if (kind === "alpha_wolf") return makeWolfMesh({ alpha: true });
  return makeWolfMesh();
}

function makeHumanMobMesh({ soldier = false, chief = false } = {}) {
  const root = new THREE.Group();
  const rig = new THREE.Group();
  root.add(rig);
  root.add(groundShadow(chief ? 1.45 : soldier ? 1.2 : 1.05));
  if (chief) root.scale.setScalar(1.22);

  const skin = mat("#d4a882", { roughness: 0.7 });
  const cloth = mat(chief ? "#3a1818" : soldier ? "#6a4a28" : "#4a3a32", { roughness: 0.75 });
  const accent = mat(chief ? "#c43c2e" : soldier ? "#8a8e92" : "#8a3030", {
    metalness: chief ? 0.25 : soldier ? 0.45 : 0.15,
    roughness: 0.5,
    emissive: chief ? "#4a1010" : 0x000000,
    emissiveIntensity: chief ? 0.2 : 0,
  });
  const hair = mat("#2a1a12");
  const pants = mat(soldier || chief ? "#3a3228" : "#2a2824");

  const hips = new THREE.Group();
  hips.position.y = 0.85;
  rig.add(hips);

  addPart(hips, new THREE.BoxGeometry(0.55, 0.7, 0.32), cloth, 0, 0.45, 0);
  addPart(hips, new THREE.BoxGeometry(0.58, 0.18, 0.34), accent, 0, 0.12, 0.02);
  if (chief) {
    // Cape
    addPart(hips, new THREE.BoxGeometry(0.7, 0.85, 0.08), mat("#5a1010"), 0, 0.35, -0.22);
  }
  const head = new THREE.Group();
  head.position.set(0, 0.95, 0);
  hips.add(head);
  addPart(head, new THREE.BoxGeometry(0.32, 0.34, 0.3), skin, 0, 0, 0);
  addPart(head, new THREE.BoxGeometry(0.34, 0.12, 0.32), hair, 0, 0.18, -0.02);
  if (soldier || chief) {
    addPart(head, new THREE.BoxGeometry(0.38, 0.16, 0.38), accent, 0, 0.22, 0);
  }

  function makeArm(side) {
    const arm = new THREE.Group();
    arm.position.set(side * 0.38, 0.7, 0);
    hips.add(arm);
    addPart(arm, new THREE.BoxGeometry(0.14, 0.55, 0.14), cloth, 0, -0.22, 0);
    addPart(arm, new THREE.BoxGeometry(0.12, 0.28, 0.12), skin, 0, -0.55, 0);
    return arm;
  }
  function makeLeg(side) {
    const leg = new THREE.Group();
    leg.position.set(side * 0.16, 0.05, 0);
    hips.add(leg);
    addPart(leg, new THREE.BoxGeometry(0.16, 0.45, 0.16), pants, 0, -0.22, 0);
    const shin = new THREE.Group();
    shin.position.y = -0.42;
    leg.add(shin);
    addPart(shin, new THREE.BoxGeometry(0.14, 0.4, 0.14), pants, 0, -0.15, 0);
    addPart(shin, new THREE.BoxGeometry(0.18, 0.1, 0.28), mat("#1a1410"), 0, -0.38, 0.04);
    leg.userData.shin = shin;
    return leg;
  }

  const leftArm = makeArm(-1);
  const rightArm = makeArm(1);
  const leftLeg = makeLeg(-1);
  const rightLeg = makeLeg(1);

  // Sword / dagger
  const blade = new THREE.Mesh(
    new THREE.BoxGeometry(chief ? 0.1 : 0.08, chief ? 0.75 : 0.55, chief ? 0.1 : 0.08),
    mat(chief ? "#e8d48b" : soldier ? "#b0b8c0" : "#c0a060", { metalness: 0.7, roughness: 0.35 })
  );
  blade.position.set(0, chief ? -0.9 : -0.75, 0.05);
  rightArm.add(blade);

  root.userData = {
    rig,
    hips,
    head,
    leftArm,
    rightArm,
    leftLeg,
    rightLeg,
    kind: chief ? "rogue_chief" : soldier ? "soldier" : "bandit",
    animPhase: Math.random() * 10,
  };
  attachHpBar(root, {
    y: chief ? 2.55 : soldier ? 2.35 : 2.15,
    scaleX: chief ? 2.1 : 1.6,
    scaleY: 0.4,
  });
  return root;
}

function makeWolfMesh({ dog = false, alpha = false } = {}) {
  const root = new THREE.Group();
  const rig = new THREE.Group();
  root.add(rig);
  const scale = dog ? 0.72 : alpha ? 1.18 : 1;
  root.scale.setScalar(scale);
  root.add(groundShadow(dog ? 0.85 : alpha ? 1.25 : 1.1));

  const fur = mat(dog ? "#6a5a42" : alpha ? "#3a4230" : "#5a6248", { roughness: 0.88 });
  const dark = mat(dog ? "#3a3228" : alpha ? "#1e2418" : "#2e3424", { roughness: 0.9 });
  const snout = mat(dog ? "#8a7a60" : "#6a7058", { roughness: 0.7 });
  const eye = mat(dog ? "#c8a060" : alpha ? "#ff6a3a" : "#e8c84a", {
    emissive: dog ? "#6a4010" : alpha ? "#a82810" : "#a87810",
    emissiveIntensity: alpha ? 0.75 : 0.55,
    flat: true,
  });
  const fang = mat("#e8e0d0", { roughness: 0.4 });

  // torso
  const body = addPart(rig, new THREE.BoxGeometry(0.55, 0.42, 0.95), fur, 0, 0.62, 0);
  body.scale.set(1, 1, 1);
  addPart(rig, new THREE.BoxGeometry(0.48, 0.32, 0.55), dark, 0, 0.78, -0.15); // shoulder hump

  // neck + head
  addPart(rig, new THREE.BoxGeometry(0.28, 0.28, 0.32), fur, 0, 0.78, 0.48);
  const head = new THREE.Group();
  head.position.set(0, 0.82, 0.72);
  rig.add(head);
  addPart(head, new THREE.BoxGeometry(0.38, 0.34, 0.4), fur, 0, 0, 0);
  addPart(head, new THREE.BoxGeometry(0.22, 0.18, 0.32), snout, 0, -0.04, 0.28);
  addPart(head, new THREE.BoxGeometry(0.24, 0.06, 0.12), dark, 0, -0.12, 0.34); // jaw
  addPart(head, new THREE.BoxGeometry(0.04, 0.08, 0.04), fang, -0.06, -0.14, 0.4);
  addPart(head, new THREE.BoxGeometry(0.04, 0.08, 0.04), fang, 0.06, -0.14, 0.4);
  addPart(head, new THREE.BoxGeometry(0.07, 0.07, 0.05), eye, -0.14, 0.08, 0.14);
  addPart(head, new THREE.BoxGeometry(0.07, 0.07, 0.05), eye, 0.14, 0.08, 0.14);
  // ears
  addPart(head, new THREE.ConeGeometry(0.08, 0.22, 4), dark, -0.14, 0.24, -0.05, 0, 0, -0.25);
  addPart(head, new THREE.ConeGeometry(0.08, 0.22, 4), dark, 0.14, 0.24, -0.05, 0, 0, 0.25);

  // bushy tail
  const tail = new THREE.Group();
  tail.position.set(0, 0.72, -0.52);
  rig.add(tail);
  addPart(tail, new THREE.ConeGeometry(0.12, 0.55, 5), fur, 0, 0.05, -0.2, 1.1, 0, 0);
  addPart(tail, new THREE.SphereGeometry(0.12, 5, 4), dark, 0, 0.12, -0.42);

  // legs
  const legs = [];
  const foot = mat("#1e2418");
  for (const [lx, lz, front] of [
    [-0.2, 0.28, true],
    [0.2, 0.28, true],
    [-0.2, -0.32, false],
    [0.2, -0.32, false],
  ]) {
    const leg = new THREE.Group();
    leg.position.set(lx, 0.42, lz);
    rig.add(leg);
    addPart(leg, new THREE.BoxGeometry(0.12, 0.28, 0.14), dark, 0, -0.08, 0);
    addPart(leg, new THREE.BoxGeometry(0.1, 0.22, 0.1), fur, 0, -0.28, 0.02);
    addPart(leg, new THREE.BoxGeometry(0.14, 0.08, 0.18), foot, 0, -0.4, 0.04);
    leg.userData.front = front;
    legs.push(leg);
  }

  root.userData = {
    rig,
    head,
    tail,
    legs,
    kind: dog ? "dog" : alpha ? "alpha_wolf" : "wolf",
    animPhase: Math.random() * 10,
  };
  // fur tufts / collar detail
  addPart(rig, new THREE.ConeGeometry(0.14, 0.28, 5), dark, 0, 0.95, 0.15, 0.4, 0, 0);
  addPart(rig, new THREE.ConeGeometry(0.1, 0.2, 4), dark, -0.2, 0.9, 0.05, 0.3, 0, 0.4);
  addPart(rig, new THREE.ConeGeometry(0.1, 0.2, 4), dark, 0.2, 0.9, 0.05, 0.3, 0, -0.4);
  attachHpBar(root, { y: 1.45, scaleX: 1.55, scaleY: 0.4 });
  return root;
}

function makeOrkMesh({ elite = false, black = false, brute = false } = {}) {
  const root = new THREE.Group();
  const rig = new THREE.Group();
  root.add(rig);
  const scale = brute ? (elite ? 1.55 : 1.42) : elite ? 1.18 : 1;
  root.add(groundShadow(scale * 1.15));
  rig.scale.setScalar(scale);

  const skin = mat(
    black ? (brute ? "#141812" : "#1e261c") : elite ? "#3a5a28" : "#4a6a32",
    { roughness: 0.75 }
  );
  const leather = mat(black ? "#2a1e14" : "#5a3a22", { roughness: 0.85 });
  const iron = mat(black ? "#4a4e52" : "#6a6e72", { metalness: 0.55, roughness: 0.4 });
  const dark = mat("#2a2218");
  const eye = mat(black ? "#ff4028" : "#c43c2e", {
    emissive: black ? "#a01808" : "#8b1e1e",
    emissiveIntensity: black ? 0.85 : 0.6,
  });
  const tusk = mat(black ? "#d0c8b0" : "#e8e0d0", { roughness: 0.35 });

  const hips = new THREE.Group();
  hips.position.y = 0.85;
  rig.add(hips);

  addPart(hips, new THREE.BoxGeometry(0.7, 0.75, 0.42), leather, 0, 0.35, 0);
  addPart(hips, new THREE.BoxGeometry(0.76, 0.28, 0.48), iron, 0, 0.55, 0); // chest plate
  if (elite || brute) {
    addPart(
      hips,
      new THREE.BoxGeometry(0.82, 0.12, 0.52),
      mat(black ? "#6a2010" : "#8b6b1e", { metalness: 0.6 }),
      0,
      0.72,
      0
    );
  }

  // head
  const head = new THREE.Group();
  head.position.set(0, 0.95, 0);
  hips.add(head);
  addPart(head, new THREE.BoxGeometry(0.42, 0.4, 0.4), skin, 0, 0, 0);
  addPart(head, new THREE.BoxGeometry(0.48, 0.16, 0.2), dark, 0, 0.18, -0.05); // brow
  addPart(head, new THREE.BoxGeometry(0.08, 0.08, 0.05), eye, -0.12, 0.06, 0.18);
  addPart(head, new THREE.BoxGeometry(0.08, 0.08, 0.05), eye, 0.12, 0.06, 0.18);
  addPart(head, new THREE.ConeGeometry(0.06, 0.22, 4), tusk, -0.12, -0.18, 0.16, 0.6, 0, -0.3);
  addPart(head, new THREE.ConeGeometry(0.06, 0.22, 4), tusk, 0.12, -0.18, 0.16, 0.6, 0, 0.3);
  // ears
  addPart(head, new THREE.BoxGeometry(0.08, 0.16, 0.12), skin, -0.26, 0.05, 0, 0, 0, 0.4);
  addPart(head, new THREE.BoxGeometry(0.08, 0.16, 0.12), skin, 0.26, 0.05, 0, 0, 0, -0.4);

  // arms
  function makeArm(side) {
    const arm = new THREE.Group();
    arm.position.set(side * 0.46, 0.55, 0);
    hips.add(arm);
    addPart(arm, new THREE.BoxGeometry(0.2, 0.45, 0.2), skin, 0, -0.18, 0);
    const lower = new THREE.Group();
    lower.position.y = -0.42;
    arm.add(lower);
    addPart(lower, new THREE.BoxGeometry(0.18, 0.4, 0.18), skin, 0, -0.16, 0);
    arm.userData.lower = lower;
    return arm;
  }
  const leftArm = makeArm(-1);
  const rightArm = makeArm(1);

  // spiked club
  const club = new THREE.Group();
  club.position.set(0, -0.4, 0);
  rightArm.userData.lower.add(club);
  addPart(club, new THREE.CylinderGeometry(0.05, 0.07, 0.85, 5), dark, 0, -0.2, 0.35, 1.2, 0, 0);
  addPart(club, new THREE.BoxGeometry(0.28, 0.28, 0.28), iron, 0, -0.05, 0.75);
  addPart(club, new THREE.ConeGeometry(0.06, 0.14, 4), iron, 0.12, 0.05, 0.8, 0, 0, -0.8);

  // legs
  function makeLeg(side) {
    const leg = new THREE.Group();
    leg.position.set(side * 0.18, 0, 0);
    hips.add(leg);
    addPart(leg, new THREE.BoxGeometry(0.22, 0.4, 0.24), leather, 0, -0.2, 0);
    const shin = new THREE.Group();
    shin.position.y = -0.4;
    leg.add(shin);
    addPart(shin, new THREE.BoxGeometry(0.18, 0.38, 0.2), dark, 0, -0.16, 0);
    addPart(shin, new THREE.BoxGeometry(0.24, 0.1, 0.32), iron, 0, -0.36, 0.04);
    leg.userData.shin = shin;
    return leg;
  }
  const leftLeg = makeLeg(-1);
  const rightLeg = makeLeg(1);

  const kindId = brute && elite
    ? "orc_chief"
    : brute
      ? "black_ork_brute"
      : black
        ? "black_ork"
        : elite
          ? "elite_ork"
          : "ork";
  root.userData = {
    rig,
    hips,
    head,
    leftArm,
    rightArm,
    leftLeg,
    rightLeg,
    club,
    kind: kindId,
    animPhase: Math.random() * 10,
  };
  // shoulder spikes / belt detail
  addPart(hips, new THREE.ConeGeometry(0.08, 0.22, 4), iron, -0.38, 0.7, 0, 0, 0, -0.6);
  addPart(hips, new THREE.ConeGeometry(0.08, 0.22, 4), iron, 0.38, 0.7, 0, 0, 0, 0.6);
  addPart(
    hips,
    new THREE.BoxGeometry(0.75, 0.1, 0.12),
    mat(black ? "#6a2010" : "#8b6b1e", { metalness: 0.5 }),
    0,
    0.05,
    0.22
  );
  if (brute) {
    addPart(hips, new THREE.ConeGeometry(0.1, 0.28, 4), iron, -0.42, 0.85, 0.1, 0, 0, -0.5);
    addPart(hips, new THREE.ConeGeometry(0.1, 0.28, 4), iron, 0.42, 0.85, 0.1, 0, 0, 0.5);
  }
  attachHpBar(root, {
    y: 2.25 * scale + (brute ? 0.15 : 0),
    scaleX: 1.7 + (brute ? 0.35 : 0),
    scaleY: 0.42,
  });
  return root;
}

export function animateMob(mesh, dt, moving = true) {
  const d = mesh.userData;
  if (!d) return;

  // GLB enemies — drive clips or bob class stand-ins
  if (d.gltfEnemy) {
    d.animPhase = (d.animPhase || 0) + dt * (moving ? 9 : 2.2);
    if (d.mixer) {
      const next = moving ? "walk" : "idle";
      if (next !== d.animMode) {
        d.animMode = next;
        const fade = 0.18;
        if (next === "walk" && d.walkAction) {
          d.walkAction.reset().setEffectiveWeight(1).fadeIn(fade).play();
          d.walkAction.paused = false;
          if (d.idleAction) d.idleAction.fadeOut(fade);
        } else if (d.idleAction) {
          d.idleAction.reset().setEffectiveWeight(1).fadeIn(fade).play();
          if (d.walkAction) d.walkAction.fadeOut(fade);
        } else if (d.walkAction) {
          d.walkAction.paused = !moving;
          d.walkAction.setEffectiveWeight(1);
          if (!d.walkAction.isRunning()) d.walkAction.play();
        }
      }
      if (d.walkAction && moving) d.walkAction.setEffectiveTimeScale(1.05);
      d.mixer.update(dt);
    } else if (d.rig) {
      const c = Math.cos(d.animPhase);
      d.rig.position.y = moving ? Math.abs(c) * 0.05 : Math.sin(d.animPhase * 0.5) * 0.015;
      d.rig.rotation.y = moving ? Math.sin(d.animPhase) * 0.05 : d.rig.rotation.y * 0.85;
    }
    return;
  }

  if (!d.rig) return;
  d.animPhase = (d.animPhase || 0) + dt * (moving ? 9 : 2.2);
  const s = Math.sin(d.animPhase);
  const c = Math.cos(d.animPhase);

  if (d.kind === "wolf") {
    if (d.legs) {
      for (let i = 0; i < d.legs.length; i++) {
        const leg = d.legs[i];
        const phase = i % 2 === 0 ? s : -s;
        leg.rotation.x = moving ? phase * 0.55 : phase * 0.08;
      }
    }
    if (d.tail) d.tail.rotation.y = s * (moving ? 0.35 : 0.12);
    if (d.head) d.head.rotation.x = moving ? s * 0.06 : Math.sin(d.animPhase * 0.5) * 0.04;
    d.rig.position.y = moving ? Math.abs(c) * 0.05 : Math.sin(d.animPhase * 0.5) * 0.015;
  } else {
    // orc / human biped
    if (d.leftLeg && d.rightLeg) {
      d.leftLeg.rotation.x = moving ? s * 0.6 : 0;
      d.rightLeg.rotation.x = moving ? -s * 0.6 : 0;
      if (d.leftLeg.userData.shin) d.leftLeg.userData.shin.rotation.x = moving ? Math.max(0, -s) * 0.4 : 0;
      if (d.rightLeg.userData.shin) d.rightLeg.userData.shin.rotation.x = moving ? Math.max(0, s) * 0.4 : 0;
    }
    if (d.leftArm && d.rightArm) {
      d.leftArm.rotation.x = moving ? -s * 0.45 : Math.sin(d.animPhase * 0.4) * 0.05;
      d.rightArm.rotation.x = moving ? s * 0.35 : -0.25 + Math.sin(d.animPhase * 0.35) * 0.05;
      d.rightArm.rotation.z = -0.15;
    }
    if (d.hips) {
      d.hips.position.y = 0.85 + (moving ? Math.abs(c) * 0.04 : Math.sin(d.animPhase * 0.5) * 0.02);
      d.hips.rotation.y = moving ? s * 0.05 : 0;
    }
    if (d.head) d.head.rotation.y = Math.sin(d.animPhase * 0.3) * 0.08;
  }
}

/** Small research tent — Metin2 biologist camp prop */
export function makeBiologistTent(ox = 0, oy = 0, oz = 0) {
  const tent = new THREE.Group();
  tent.position.set(ox, oy, oz);

  const canvas = mat("#6a5a38", { roughness: 0.9 });
  const pole = mat("#3a2a18", { roughness: 0.85 });
  const rope = mat("#8a7040");
  const flap = mat("#4a6a3a", { roughness: 0.85 });

  // A-frame poles
  for (const side of [-1, 1]) {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 2.1, 5), pole);
    p.position.set(side * 0.95, 1.05, 0);
    p.rotation.z = side * 0.55;
    p.castShadow = true;
    tent.add(p);
  }
  // ridge pole
  const ridge = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.4, 5), pole);
  ridge.rotation.z = Math.PI / 2;
  ridge.position.set(0, 1.85, 0);
  tent.add(ridge);

  // canvas roof (two slanted panels)
  for (const side of [-1, 1]) {
    const panel = new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.06, 2.2), canvas);
    panel.position.set(side * 0.48, 1.15, 0);
    panel.rotation.z = side * -0.72;
    panel.castShadow = true;
    panel.receiveShadow = true;
    tent.add(panel);
  }

  // front flap / door
  const door = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.1, 0.04), flap);
  door.position.set(0, 0.55, 1.05);
  tent.add(door);

  // pegs + guy lines
  for (const [x, z] of [
    [-1.2, 1.1],
    [1.2, 1.1],
    [-1.2, -1.1],
    [1.2, -1.1],
  ]) {
    const peg = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.03, 0.25, 5), pole);
    peg.position.set(x, 0.12, z);
    tent.add(peg);
    const line = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 1.6, 4), rope);
    line.position.set(x * 0.55, 0.9, z * 0.45);
    line.rotation.z = x > 0 ? -0.5 : 0.5;
    line.rotation.x = z > 0 ? 0.35 : -0.35;
    tent.add(line);
  }

  // camp crate + specimen jar
  addPart(tent, new THREE.BoxGeometry(0.45, 0.28, 0.35), mat("#5a4030"), -1.15, 0.14, 0.35);
  addPart(tent, new THREE.CylinderGeometry(0.1, 0.1, 0.22, 8), mat("#6ec8a0", { emissive: "#2a6a40", emissiveIntensity: 0.25 }), -1.15, 0.4, 0.35);

  tent.add(groundShadow(2.2));
  return tent;
}

/** Role-based village NPCs */
export function makeNpcMesh(npc) {
  const role = npc.role || "shop";
  const root = new THREE.Group();
  const rig = new THREE.Group();
  root.add(rig);
  root.add(groundShadow(1.05));

  const palette = {
    shop: { cloth: "#3a6b8b", accent: "#c9a227", trim: "#2a4050" },
    blacksmith: { cloth: "#5a4030", accent: "#8a8e92", trim: "#2a1a10" },
    teleport: { cloth: "#4a2e6b", accent: "#6ec8ff", trim: "#2a1840" },
    quest: { cloth: "#6b4a28", accent: "#e8d48b", trim: "#3a2810" },
    biologist: { cloth: "#3a5a3a", accent: "#8bc46a", trim: "#2a3820" },
    skillmaster: { cloth: "#2a3a5a", accent: "#e8b84a", trim: "#1a2438" },
  }[role] || { cloth: "#3a6b4f", accent: "#c9a227", trim: "#1a2a20" };

  const skin = mat("#e0c4a0", { roughness: 0.7 });
  const cloth = mat(palette.cloth, { roughness: 0.65, emissive: palette.cloth, emissiveIntensity: 0.04 });
  const accent = mat(palette.accent, { metalness: 0.45, roughness: 0.4, emissive: palette.accent, emissiveIntensity: 0.15 });
  const trim = mat(palette.trim);
  const hair = mat(
    role === "quest" ? "#c8c0b0" : role === "biologist" ? "#4a3a28" : role === "skillmaster" ? "#e8e0d0" : "#2a2218"
  );

  const hips = new THREE.Group();
  hips.position.y = 0.92;
  rig.add(hips);

  // robe / tunic
  addPart(hips, new THREE.BoxGeometry(0.58, 0.7, 0.34), cloth, 0, 0.32, 0);
  addPart(hips, new THREE.BoxGeometry(0.62, 0.22, 0.38), trim, 0, 0.55, 0);
  if (role === "quest" || role === "teleport" || role === "biologist" || role === "skillmaster") {
    addPart(hips, new THREE.ConeGeometry(0.42, 0.85, 6), cloth, 0, -0.15, 0); // long robe skirt
  }
  if (role === "skillmaster") {
    addPart(hips, new THREE.BoxGeometry(0.5, 0.12, 0.4), accent, 0, 0.58, 0.02);
    addPart(hips, new THREE.BoxGeometry(0.2, 0.35, 0.08), mat("#c9a227", { metalness: 0.5 }), 0, 0.25, 0.22);
  }
  if (role === "biologist") {
    // apron / satchel
    addPart(hips, new THREE.BoxGeometry(0.42, 0.4, 0.08), mat("#d8c8a0"), 0, 0.22, 0.22);
    addPart(hips, new THREE.BoxGeometry(0.22, 0.18, 0.14), trim, 0.28, 0.2, -0.12);
  }

  addPart(hips, new THREE.CylinderGeometry(0.09, 0.11, 0.14, 6), skin, 0, 0.72, 0);
  const head = new THREE.Group();
  head.position.set(0, 0.95, 0);
  hips.add(head);
  addPart(head, new THREE.SphereGeometry(0.22, 10, 10), skin, 0, 0, 0);
  addPart(head, new THREE.SphereGeometry(0.24, 8, 6, 0, Math.PI * 2, 0, Math.PI * 0.55), hair, 0, 0.06, 0);

  if (role === "blacksmith") {
    // leather apron
    addPart(hips, new THREE.BoxGeometry(0.5, 0.55, 0.08), trim, 0, 0.2, 0.2);
    // floor anvil — readable from the plaza
    const anvil = new THREE.Group();
    anvil.position.set(0.85, 0, 0.35);
    root.add(anvil);
    addPart(anvil, new THREE.BoxGeometry(0.55, 0.22, 0.28), accent, 0, 0.45, 0);
    addPart(anvil, new THREE.BoxGeometry(0.35, 0.35, 0.22), mat("#3a3a40", { metalness: 0.6 }), 0, 0.22, 0);
    addPart(anvil, new THREE.BoxGeometry(0.5, 0.08, 0.4), mat("#2a2a30"), 0, 0.04, 0);
  }
  if (role === "shop") {
    // goods pack
    addPart(hips, new THREE.BoxGeometry(0.35, 0.35, 0.22), accent, 0, 0.35, -0.28);
    addPart(hips, new THREE.BoxGeometry(0.12, 0.12, 0.12), mat("#c43c2e"), -0.12, 0.48, -0.28);
  }

  // arms
  function makeArm(side) {
    const arm = new THREE.Group();
    arm.position.set(side * 0.36, 0.52, 0);
    hips.add(arm);
    addPart(arm, new THREE.BoxGeometry(0.13, 0.4, 0.13), cloth, 0, -0.16, 0);
    const lower = new THREE.Group();
    lower.position.y = -0.38;
    arm.add(lower);
    addPart(lower, new THREE.BoxGeometry(0.11, 0.34, 0.11), skin, 0, -0.14, 0);
    arm.userData.lower = lower;
    return arm;
  }
  const leftArm = makeArm(-1);
  const rightArm = makeArm(1);

  let gem = null;
  // role props
  if (role === "blacksmith") {
    const hammer = new THREE.Group();
    hammer.position.set(0, -0.32, 0);
    rightArm.userData.lower.add(hammer);
    addPart(hammer, new THREE.CylinderGeometry(0.035, 0.04, 0.55, 5), trim, 0, -0.1, 0.2, 1.1, 0, 0);
    addPart(hammer, new THREE.BoxGeometry(0.22, 0.14, 0.14), accent, 0, 0.02, 0.48);
  } else if (role === "teleport") {
    const staff = new THREE.Group();
    staff.position.set(0.05, -0.2, 0);
    rightArm.userData.lower.add(staff);
    addPart(staff, new THREE.CylinderGeometry(0.035, 0.04, 1.4, 6), trim, 0, -0.35, 0.15);
    gem = addPart(staff, new THREE.OctahedronGeometry(0.14, 0), accent, 0, 0.4, 0.15);
    gem.material = new THREE.MeshStandardMaterial({
      color: palette.accent,
      emissive: palette.accent,
      emissiveIntensity: 0.85,
      flatShading: true,
    });
    staff.add(new THREE.PointLight(palette.accent, 0.7, 5));
  } else if (role === "quest") {
    const scroll = addPart(rightArm.userData.lower, new THREE.CylinderGeometry(0.06, 0.06, 0.28, 8), accent, 0.05, -0.28, 0.12, 0, 0, 1.2);
    scroll.rotation.z = 1.2;
  } else if (role === "biologist") {
    // clipboard + flask
    const board = addPart(rightArm.userData.lower, new THREE.BoxGeometry(0.22, 0.28, 0.04), mat("#c8b080"), 0.02, -0.22, 0.14);
    board.rotation.x = -0.35;
    addPart(leftArm.userData.lower, new THREE.CylinderGeometry(0.05, 0.06, 0.18, 6), mat("#6ec8a0", { emissive: "#3a8a60", emissiveIntensity: 0.35 }), 0, -0.28, 0.1);
    // tiny spectacles
    addPart(head, new THREE.TorusGeometry(0.06, 0.012, 4, 10), accent, -0.08, 0.02, 0.18, Math.PI / 2, 0, 0);
    addPart(head, new THREE.TorusGeometry(0.06, 0.012, 4, 10), accent, 0.08, 0.02, 0.18, Math.PI / 2, 0, 0);
  } else if (role === "skillmaster") {
    const tome = new THREE.Group();
    tome.position.set(0.02, -0.2, 0.12);
    rightArm.userData.lower.add(tome);
    addPart(tome, new THREE.BoxGeometry(0.28, 0.08, 0.36), mat("#1a2438"), 0, 0, 0);
    addPart(tome, new THREE.BoxGeometry(0.24, 0.02, 0.32), accent, 0, 0.05, 0);
    gem = addPart(tome, new THREE.OctahedronGeometry(0.08, 0), accent, 0, 0.12, 0);
    gem.material = new THREE.MeshStandardMaterial({
      color: palette.accent,
      emissive: palette.accent,
      emissiveIntensity: 0.7,
      flatShading: true,
    });
  } else if (role === "shop") {
    addPart(leftArm.userData.lower, new THREE.BoxGeometry(0.18, 0.14, 0.1), mat("#c43c2e"), 0, -0.28, 0.1);
  }

  if (role === "biologist") {
    root.add(makeBiologistTent(1.9, 0, 0.4));
  }

  // legs
  function makeLeg(side) {
    const leg = new THREE.Group();
    leg.position.set(side * 0.13, 0, 0);
    hips.add(leg);
    addPart(leg, new THREE.BoxGeometry(0.16, 0.42, 0.18), trim, 0, -0.22, 0);
    addPart(leg, new THREE.BoxGeometry(0.18, 0.1, 0.26), darkBoot(), 0, -0.45, 0.04);
    return leg;
  }
  function darkBoot() {
    return mat("#1a1410");
  }
  const leftLeg = makeLeg(-1);
  const rightLeg = makeLeg(1);

  // interaction marker
  const marker = new THREE.Mesh(
    new THREE.RingGeometry(0.55, 0.72, 24),
    new THREE.MeshBasicMaterial({
      color: palette.accent,
      transparent: true,
      opacity: 0.45,
      side: THREE.DoubleSide,
      depthWrite: false,
    })
  );
  marker.rotation.x = -Math.PI / 2;
  marker.position.y = 0.05;
  root.add(marker);

  // nameplate
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext("2d");
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const spriteMat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
  const sprite = new THREE.Sprite(spriteMat);
  sprite.scale.set(2.4, 0.6, 1);
  sprite.position.y = 2.35;
  root.add(sprite);

  const roleLabel =
    {
      shop: "Merchant",
      blacksmith: "Blacksmith",
      teleport: "Teleporter",
      quest: "Elder",
      biologist: "Research",
      skillmaster: "Skills",
    }[role] || "NPC";
  ctx.clearRect(0, 0, 256, 64);
  ctx.fillStyle =
    role === "blacksmith"
      ? "rgba(60,30,10,0.75)"
      : role === "biologist"
        ? "rgba(20,40,20,0.75)"
        : role === "skillmaster"
          ? "rgba(20,30,50,0.78)"
          : "rgba(0,0,0,0.45)";
  ctx.fillRect(20, 8, 216, 48);
  ctx.font = "bold 22px Cinzel, serif";
  ctx.fillStyle = "#e8d48b";
  ctx.textAlign = "center";
  ctx.fillText(npc.name || roleLabel, 128, 30);
  ctx.font = "14px Noto Sans KR, sans-serif";
  ctx.fillStyle = "#c8c0b0";
  ctx.fillText(`E · ${roleLabel}`, 128, 48);
  tex.needsUpdate = true;

  root.userData = {
    rig,
    hips,
    head,
    leftArm,
    rightArm,
    leftLeg,
    rightLeg,
    marker,
    gem,
    npc,
    kind: "npc",
    animPhase: Math.random() * 10,
  };
  attachQuestMarker(root, 2.7);
  return root;
}

export function animateNpc(mesh, dt) {
  const d = mesh.userData;
  if (!d?.hips) return;
  d.animPhase = (d.animPhase || 0) + dt;
  d.hips.position.y = 0.92 + Math.sin(d.animPhase * 1.6) * 0.02;
  if (d.head) d.head.rotation.y = Math.sin(d.animPhase * 0.7) * 0.15;
  if (d.marker) d.marker.rotation.z += dt * 0.8;
  if (d.gem) {
    d.gem.rotation.y += dt * 1.8;
    d.gem.position.y = 0.4 + Math.sin(d.animPhase * 2) * 0.04;
  }
  const qs = d.questSprite;
  if (qs && qs.visible) {
    qs.position.y = 2.7 + Math.sin(d.animPhase * 3) * 0.12;
    qs.material.rotation = Math.sin(d.animPhase * 2) * 0.08;
  }
}

/** City entrance — tall demonic tower players can click / E */
export function makeDemonTowerMesh() {
  const root = new THREE.Group();
  const stone = mat("#3a2a28", { roughness: 0.9 });
  const dark = mat("#1a1010", { roughness: 0.85 });
  const glow = mat("#8b1e1e", { emissive: "#8b1e1e", emissiveIntensity: 0.55, metalness: 0.3 });

  const base = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.8, 1.2, 8), stone);
  base.position.y = 0.6;
  base.castShadow = true;
  base.receiveShadow = true;
  root.add(base);

  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.9, 8.5, 8), dark);
  shaft.position.y = 5.4;
  shaft.castShadow = true;
  root.add(shaft);

  const mid = new THREE.Mesh(new THREE.CylinderGeometry(1.8, 1.6, 1.4, 8), stone);
  mid.position.y = 10.2;
  mid.castShadow = true;
  root.add(mid);

  const top = new THREE.Mesh(new THREE.ConeGeometry(2.2, 3.2, 8), glow);
  top.position.y = 12.5;
  top.castShadow = true;
  root.add(top);

  // horns
  for (const side of [-1, 1]) {
    const horn = new THREE.Mesh(new THREE.ConeGeometry(0.25, 1.8, 5), glow);
    horn.position.set(side * 1.3, 11.2, 0.2);
    horn.rotation.z = side * 0.55;
    root.add(horn);
  }

  // door
  const door = new THREE.Mesh(
    new THREE.BoxGeometry(1.1, 1.8, 0.2),
    new THREE.MeshStandardMaterial({ color: "#0a0606", emissive: "#4a1010", emissiveIntensity: 0.4 })
  );
  door.position.set(0, 1.1, 2.35);
  root.add(door);

  const ring = new THREE.Mesh(
    new THREE.RingGeometry(2.6, 3.1, 32),
    new THREE.MeshBasicMaterial({ color: "#c43c2e", transparent: true, opacity: 0.45, side: THREE.DoubleSide, depthWrite: false })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.08;
  root.add(ring);

  const light = new THREE.PointLight("#c43c2e", 1.4, 16);
  light.position.set(0, 6, 0);
  root.add(light);

  // label sprite
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.fillRect(20, 8, 216, 48);
  ctx.font = "bold 22px Cinzel, serif";
  ctx.fillStyle = "#ff6a4a";
  ctx.textAlign = "center";
  ctx.fillText("Demon Tower", 128, 28);
  ctx.font = "13px Noto Sans KR, sans-serif";
  ctx.fillStyle = "#e8d48b";
  ctx.fillText("SE wilderness · E", 128, 48);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  sprite.position.y = 14.2;
  sprite.scale.set(4.2, 1.05, 1);
  root.add(sprite);

  root.userData = { kind: "demon_tower", ring, top, interactive: true };
  return root;
}

/** Arena platform for Demon Tower floors */
export function makeDemonArenaMesh() {
  const root = new THREE.Group();
  const floor = new THREE.Mesh(
    new THREE.CylinderGeometry(16, 16, 0.4, 40),
    new THREE.MeshStandardMaterial({ color: "#2a1818", roughness: 0.92 })
  );
  floor.position.y = 0.15;
  floor.receiveShadow = true;
  root.add(floor);

  const rim = new THREE.Mesh(
    new THREE.TorusGeometry(16, 0.35, 8, 48),
    new THREE.MeshStandardMaterial({ color: "#8b1e1e", emissive: "#4a1010", emissiveIntensity: 0.4 })
  );
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 0.4;
  root.add(rim);

  for (let i = 0; i < 8; i++) {
    const ang = (i / 8) * Math.PI * 2;
    const pillar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.35, 0.45, 4.5, 6),
      mat("#3a2220", { roughness: 0.9 })
    );
    pillar.position.set(Math.cos(ang) * 14.5, 2.3, Math.sin(ang) * 14.5);
    pillar.castShadow = true;
    root.add(pillar);
    const flame = new THREE.Mesh(
      new THREE.SphereGeometry(0.35, 8, 8),
      new THREE.MeshBasicMaterial({ color: "#ff4422", transparent: true, opacity: 0.8 })
    );
    flame.position.set(Math.cos(ang) * 14.5, 4.7, Math.sin(ang) * 14.5);
    root.add(flame);
  }

  // Walkable floor portal pad (offset set by Game via portalOffset)
  const portal = new THREE.Group();
  const pad = new THREE.Mesh(
    new THREE.CylinderGeometry(2.4, 2.6, 0.25, 28),
    new THREE.MeshStandardMaterial({
      color: "#1a3a66",
      emissive: "#2a6aaa",
      emissiveIntensity: 0.85,
      roughness: 0.45,
    })
  );
  pad.position.y = 0.2;
  pad.receiveShadow = true;
  portal.add(pad);
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(2.35, 0.16, 10, 32),
    new THREE.MeshBasicMaterial({ color: "#7ec8ff", transparent: true, opacity: 0.95 })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.36;
  portal.add(ring);
  const column = new THREE.Mesh(
    new THREE.TorusGeometry(1.35, 0.14, 10, 28),
    new THREE.MeshBasicMaterial({ color: "#9fd4ff", transparent: true, opacity: 0.85 })
  );
  column.position.y = 1.7;
  portal.add(column);
  const glow = new THREE.PointLight("#6ec8ff", 1.6, 14);
  glow.position.set(0, 1.4, 0);
  portal.add(glow);
  // Default local offset; Game repositions to DEMON_TOWER.portalOffset
  portal.position.set(0, 0, 9);
  root.add(portal);

  const pc = document.createElement("canvas");
  pc.width = 256;
  pc.height = 64;
  const pctx = pc.getContext("2d");
  pctx.fillStyle = "rgba(0,0,0,0.6)";
  pctx.fillRect(16, 8, 224, 48);
  pctx.font = "bold 18px Cinzel, serif";
  pctx.fillStyle = "#9fd4ff";
  pctx.textAlign = "center";
  pctx.fillText("Stand here · Next", 128, 38);
  const ptex = new THREE.CanvasTexture(pc);
  ptex.colorSpace = THREE.SRGBColorSpace;
  const psprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: ptex, transparent: true, depthWrite: false }));
  psprite.position.set(0, 3.2, 9);
  psprite.scale.set(3.8, 0.95, 1);
  root.add(psprite);

  root.userData = { portal, portalLabel: psprite, portalRing: ring, kind: "demon_arena" };
  return root;
}

export function makeBoltMesh(color = "#e8d48b") {
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.2, 8, 8),
    new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1.3 })
  );
  mesh.add(new THREE.PointLight(color, 1, 5));
  return mesh;
}
