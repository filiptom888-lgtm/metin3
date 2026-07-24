import * as THREE from "three";
import { CLASSES, MAP_HALF, MAP_SIZE, CITY_RADIUS, CITY_GATE } from "./data.js";

function texNoise(base, variance, size = 128) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d");
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < size * 8; i++) {
    const v = (Math.random() * variance) | 0;
    ctx.fillStyle = `rgba(${v},${v},${v},${0.08 + Math.random() * 0.12})`;
    ctx.fillRect(Math.random() * size, Math.random() * size, 2 + Math.random() * 4, 2);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function makeGrassTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#3a6b35";
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 4000; i++) {
    const g = 70 + ((Math.random() * 70) | 0);
    ctx.fillStyle = `rgb(${40 + (g % 30)},${g},${30 + (g % 25)})`;
    ctx.fillRect(Math.random() * 256, Math.random() * 256, 2, 2);
  }
  for (let i = 0; i < 20; i++) {
    ctx.fillStyle = "rgba(110, 90, 50, 0.28)";
    ctx.beginPath();
    ctx.ellipse(Math.random() * 256, Math.random() * 256, 12 + Math.random() * 30, 8 + Math.random() * 16, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(MAP_SIZE / 8, MAP_SIZE / 8);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function mat(color, opts = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: opts.roughness ?? 0.75,
    metalness: opts.metalness ?? 0.08,
    flatShading: opts.flat ?? true,
    emissive: opts.emissive ?? 0x000000,
    emissiveIntensity: opts.emissiveIntensity ?? 0,
  });
}

export function createRenderer(canvas) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  return renderer;
}

function makeBuilding(w, h, d, color) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color, { roughness: 0.9 }));
  body.position.y = h / 2;
  body.castShadow = true;
  body.receiveShadow = true;
  g.add(body);

  const roof = new THREE.Mesh(
    new THREE.ConeGeometry(Math.max(w, d) * 0.72, h * 0.45, 4),
    mat("#7a2e28", { roughness: 0.85 })
  );
  roof.position.y = h + h * 0.18;
  roof.rotation.y = Math.PI / 4;
  roof.castShadow = true;
  g.add(roof);

  const door = new THREE.Mesh(new THREE.BoxGeometry(w * 0.22, h * 0.42, 0.08), mat("#2a1a10"));
  door.position.set(0, h * 0.21, d / 2 + 0.02);
  g.add(door);

  const win = new THREE.Mesh(
    new THREE.PlaneGeometry(0.5, 0.55),
    new THREE.MeshStandardMaterial({ color: "#c9a040", emissive: "#a87820", emissiveIntensity: 0.35 })
  );
  win.position.set(w * 0.28, h * 0.55, d / 2 + 0.03);
  g.add(win);
  return g;
}

function addCityWalls(scene) {
  const stone = mat("#5c574e", { roughness: 0.92 });
  const segs = 52;
  for (let i = 0; i < segs; i++) {
    const a0 = (i / segs) * Math.PI * 2;
    const nearCardinal =
      Math.min(
        Math.abs(Math.sin(a0)),
        Math.abs(Math.cos(a0))
      ) < 0.09 &&
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

    if (i % 5 === 0) {
      const tower = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.35, 5.4, 6), stone);
      tower.position.set(x * 1.02, 2.7, z * 1.02);
      tower.castShadow = true;
      scene.add(tower);
      const top = new THREE.Mesh(new THREE.ConeGeometry(1.45, 1.25, 4), mat("#6b2a22"));
      top.position.set(x * 1.02, 5.75, z * 1.02);
      top.rotation.y = Math.PI / 4;
      scene.add(top);
    }
  }

  for (const [gx, gz] of [
    [0, CITY_RADIUS],
    [0, -CITY_RADIUS],
    [CITY_RADIUS, 0],
    [-CITY_RADIUS, 0],
  ]) {
    const across = Math.abs(gx) > Math.abs(gz);
    const postL = new THREE.Mesh(new THREE.BoxGeometry(1.25, 4.6, 1.25), stone);
    const postR = postL.clone();
    if (across) {
      postL.position.set(gx, 2.3, gz - CITY_GATE / 2);
      postR.position.set(gx, 2.3, gz + CITY_GATE / 2);
    } else {
      postL.position.set(gx - CITY_GATE / 2, 2.3, gz);
      postR.position.set(gx + CITY_GATE / 2, 2.3, gz);
    }
    scene.add(postL, postR);
    const lintel = new THREE.Mesh(
      new THREE.BoxGeometry(across ? 1.25 : CITY_GATE + 1.6, 0.95, across ? CITY_GATE + 1.6 : 1.25),
      stone
    );
    lintel.position.set(gx, 4.7, gz);
    scene.add(lintel);
  }
}

export function createScene() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#7a9a68");
  scene.fog = new THREE.Fog("#8aaa72", 50, 115);

  scene.add(new THREE.HemisphereLight(0xe8f0ff, 0x4a3a22, 0.9));

  const sun = new THREE.DirectionalLight(0xfff2d8, 1.3);
  sun.position.set(40, 55, 25);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 5;
  sun.shadow.camera.far = 160;
  sun.shadow.camera.left = -75;
  sun.shadow.camera.right = 75;
  sun.shadow.camera.top = 75;
  sun.shadow.camera.bottom = -75;
  scene.add(sun);

  // Full overworld map root (ground + city + wilderness) — swapped vs dungeon maps
  const overworld = new THREE.Group();
  overworld.name = "overworld";

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(MAP_SIZE, MAP_SIZE, 64, 64),
    new THREE.MeshStandardMaterial({ map: makeGrassTexture(), roughness: 0.95 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  ground.name = "world_ground";
  overworld.add(ground);

  const stoneTex = texNoise("#8a7a5c", 40);
  stoneTex.repeat.set(10, 10);
  const plaza = new THREE.Mesh(
    new THREE.CircleGeometry(CITY_RADIUS - 0.4, 48),
    new THREE.MeshStandardMaterial({ map: stoneTex, roughness: 0.9 })
  );
  plaza.rotation.x = -Math.PI / 2;
  plaza.position.y = 0.04;
  plaza.receiveShadow = true;
  overworld.add(plaza);

  const roadMat = mat("#6a5f4e", { roughness: 0.95, flat: false });
  for (const rot of [0, Math.PI / 2]) {
    const road = new THREE.Mesh(new THREE.BoxGeometry(CITY_RADIUS * 2 - 2, 0.06, 4.4), roadMat);
    road.position.y = 0.08;
    road.rotation.y = rot;
    road.receiveShadow = true;
    overworld.add(road);
  }

  const fountain = new THREE.Group();
  const fbase = new THREE.Mesh(new THREE.CylinderGeometry(2.3, 2.7, 0.5, 12), mat("#7a7568"));
  fbase.position.y = 0.25;
  fbase.castShadow = true;
  fountain.add(fbase);
  const water = new THREE.Mesh(
    new THREE.CylinderGeometry(1.65, 1.65, 0.22, 16),
    new THREE.MeshStandardMaterial({
      color: "#3a8ab8",
      roughness: 0.15,
      metalness: 0.45,
      transparent: true,
      opacity: 0.85,
    })
  );
  water.position.y = 0.55;
  fountain.add(water);
  const fpillar = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.38, 2.3, 8), mat("#9a9080"));
  fpillar.position.y = 1.45;
  fountain.add(fpillar);
  overworld.add(fountain);

  const colors = ["#6a5a48", "#5a4a3a", "#7a6a55", "#4a4035"];
  const layouts = [
    [8, 7], [11, -8], [-10, 9], [-12, -7],
    [14, 11], [12, -13], [-15, 10], [-13, -14],
    [7, 15], [-8, 16], [16, 4], [-17, -3],
    [5, -16], [-6, -17], [15, -5], [-14, 5],
  ];
  layouts.forEach(([bx, bz], i) => {
    if (Math.hypot(bx, bz) > CITY_RADIUS - 5.5) return;
    if (Math.hypot(bx, bz) < 5) return;
    const b = makeBuilding(3.8 + (i % 3) * 0.8, 3.4 + (i % 4) * 0.7, 3.8 + (i % 2) * 1.1, colors[i % colors.length]);
    b.position.set(bx, 0, bz);
    b.rotation.y = (i * 0.7) % Math.PI;
    overworld.add(b);
  });

  addCityWalls(overworld);

  const cliff = mat("#4a453c", { roughness: 1 });
  const wallGeo = new THREE.BoxGeometry(MAP_SIZE + 2, 2.6, 1.5);
  for (const [x, z, ry] of [
    [0, -MAP_HALF, 0],
    [0, MAP_HALF, 0],
    [-MAP_HALF, 0, Math.PI / 2],
    [MAP_HALF, 0, Math.PI / 2],
  ]) {
    const w = new THREE.Mesh(wallGeo, cliff);
    w.position.set(x, 1.3, z);
    w.rotation.y = ry;
    w.castShadow = true;
    overworld.add(w);
  }

  const leaf = mat("#2d5a28");
  const trunk = mat("#3a2818");
  for (let i = 0; i < 80; i++) {
    const ang = Math.random() * Math.PI * 2;
    const r = CITY_RADIUS + 6 + Math.random() * (MAP_HALF - CITY_RADIUS - 8);
    // Keep SE corner clear for Demon Tower entrance
    const x = Math.cos(ang) * r;
    const z = Math.sin(ang) * r;
    if (Math.hypot(x - 54, z + 54) < 16) continue;
    const g = new THREE.Group();
    const t = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.28, 1.5, 5), trunk);
    t.position.y = 0.75;
    t.castShadow = true;
    g.add(t);
    const c1 = new THREE.Mesh(new THREE.SphereGeometry(1.15, 6, 5), leaf);
    c1.position.y = 2.2;
    c1.castShadow = true;
    g.add(c1);
    const c2 = new THREE.Mesh(new THREE.SphereGeometry(0.8, 6, 5), leaf);
    c2.position.set(0.45, 2.75, -0.25);
    g.add(c2);
    g.position.set(x, 0, z);
    g.scale.setScalar(0.8 + Math.random() * 0.55);
    overworld.add(g);
  }

  const rockMat = mat("#5c564c");
  for (let i = 0; i < 45; i++) {
    const ang = Math.random() * Math.PI * 2;
    const r = CITY_RADIUS + 5 + Math.random() * 42;
    const x = Math.cos(ang) * r;
    const z = Math.sin(ang) * r;
    if (Math.hypot(x - 54, z + 54) < 14) continue;
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.55 + Math.random() * 1.3, 0), rockMat);
    rock.position.set(x, 0.45, z);
    rock.rotation.set(Math.random(), Math.random(), Math.random());
    rock.castShadow = true;
    overworld.add(rock);
  }

  scene.add(overworld);
  return { scene, sun, overworld, ground };
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
  const camera = new THREE.PerspectiveCamera(42, window.innerWidth / window.innerHeight, 0.1, 220);
  camera.position.set(0, 28, 28);
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

/** Rigged low-poly humanoid with animatable limbs */
export function makePlayerMesh(classId, isLocal = false) {
  const cls = CLASSES[classId] || CLASSES.warrior;
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

/** Walk / idle / attack limb animation */
export function animateCharacter(mesh, dt, { moving = false, attacking = 0, speed = 1 } = {}) {
  const d = mesh.userData;
  if (!d?.hips) return;

  if (attacking > 0) {
    d.attacking = attacking;
  }
  d.attacking = Math.max(0, (d.attacking || 0) - dt);

  if (moving) {
    d.animPhase = (d.animPhase || 0) + dt * 10 * speed;
    const s = Math.sin(d.animPhase);
    const c = Math.cos(d.animPhase);
    d.leftLeg.rotation.x = s * 0.7;
    d.rightLeg.rotation.x = -s * 0.7;
    d.leftLeg.userData.shin.rotation.x = Math.max(0, -s) * 0.5;
    d.rightLeg.userData.shin.rotation.x = Math.max(0, s) * 0.5;
    d.leftArm.rotation.x = -s * 0.55;
    d.rightArm.rotation.x = s * 0.55;
    d.hips.position.y = 0.95 + Math.abs(c) * 0.04;
    d.hips.rotation.y = s * 0.06;
  } else if (d.attacking <= 0) {
    // ease to idle
    d.leftLeg.rotation.x *= 0.8;
    d.rightLeg.rotation.x *= 0.8;
    d.leftArm.rotation.x *= 0.8;
    d.rightArm.rotation.x *= 0.85;
    d.hips.position.y += (0.95 - d.hips.position.y) * 0.15;
    d.hips.rotation.y *= 0.85;
    // idle breathe
    d.hips.position.y = 0.95 + Math.sin(performance.now() * 0.003) * 0.015;
  }

  if (d.attacking > 0) {
    const t = 1 - d.attacking / 0.28;
    const swing = Math.sin(t * Math.PI) * 1.4;
    d.rightArm.rotation.x = -0.4 - swing;
    d.rightArm.rotation.z = swing * 0.35;
    d.weapon.rotation.x = -swing * 0.5;
  } else {
    d.rightArm.rotation.z *= 0.8;
    d.weapon.rotation.x *= 0.8;
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

export function makeMetinMesh(tier = 1, colorOverride = null) {
  const colors = ["#8b1e1e", "#1e4a8b", "#6b1e8b", "#8b6b1e", "#1e8b4a"];
  const color = colorOverride || colors[(tier - 1) % colors.length];
  const root = new THREE.Group();

  const crystal = new THREE.Mesh(
    new THREE.OctahedronGeometry(1.35, 0),
    new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: 0.75,
      metalness: 0.4,
      roughness: 0.2,
      flatShading: true,
    })
  );
  crystal.position.y = 1.55;
  crystal.castShadow = true;
  root.add(crystal);

  const shard = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.55, 0),
    new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.5, flatShading: true })
  );
  shard.position.set(0.7, 1.2, 0.3);
  root.add(shard);

  root.add(new THREE.PointLight(color, 2, 14));

  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 1.2, 0.45, 6), mat("#2a2218"));
  base.position.y = 0.22;
  base.receiveShadow = true;
  root.add(base);

  const ring = new THREE.Mesh(
    new THREE.RingGeometry(1.3, 1.7, 28),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.5, side: THREE.DoubleSide })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.07;
  root.add(ring);

  root.userData.crystal = crystal;
  root.userData.shard = shard;
  root.userData.tier = tier;
  // extra shards for detail
  for (const [x, y, z, s] of [
    [-0.75, 1.1, 0.2, 0.35],
    [0.2, 2.1, -0.3, 0.4],
    [-0.3, 0.9, -0.7, 0.28],
  ]) {
    const bit = new THREE.Mesh(
      new THREE.OctahedronGeometry(s, 0),
      new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.4, flatShading: true })
    );
    bit.position.set(x, y, z);
    bit.castShadow = true;
    root.add(bit);
  }
  const runes = new THREE.Mesh(
    new THREE.TorusGeometry(1.05, 0.04, 6, 24),
    new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.6 })
  );
  runes.rotation.x = Math.PI / 2;
  runes.position.y = 0.55;
  root.add(runes);
  root.userData.runes = runes;
  attachHpBar(root, { y: 3.1, scaleX: 2.2, scaleY: 0.5 });
  return root;
}

function groundShadow(scale = 1) {
  const s = new THREE.Mesh(
    new THREE.CircleGeometry(0.55 * scale, 16),
    new THREE.MeshBasicMaterial({ color: "#000000", transparent: true, opacity: 0.32, depthWrite: false })
  );
  s.rotation.x = -Math.PI / 2;
  s.position.y = 0.03;
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

/** Stylized low-poly wolf / orc (not collider primitives) */
export function makeMobMesh(kind = "wolf") {
  if (kind === "ork" || kind === "elite_ork") return makeOrkMesh(kind === "elite_ork");
  return makeWolfMesh();
}

function makeWolfMesh() {
  const root = new THREE.Group();
  const rig = new THREE.Group();
  root.add(rig);
  root.add(groundShadow(1.1));

  const fur = mat("#5a6248", { roughness: 0.88 });
  const dark = mat("#2e3424", { roughness: 0.9 });
  const snout = mat("#6a7058", { roughness: 0.7 });
  const eye = mat("#e8c84a", { emissive: "#a87810", emissiveIntensity: 0.55, flat: true });
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
    kind: "wolf",
    animPhase: Math.random() * 10,
  };
  // fur tufts / collar detail
  addPart(rig, new THREE.ConeGeometry(0.14, 0.28, 5), dark, 0, 0.95, 0.15, 0.4, 0, 0);
  addPart(rig, new THREE.ConeGeometry(0.1, 0.2, 4), dark, -0.2, 0.9, 0.05, 0.3, 0, 0.4);
  addPart(rig, new THREE.ConeGeometry(0.1, 0.2, 4), dark, 0.2, 0.9, 0.05, 0.3, 0, -0.4);
  attachHpBar(root, { y: 1.45, scaleX: 1.55, scaleY: 0.4 });
  return root;
}

function makeOrkMesh(elite = false) {
  const root = new THREE.Group();
  const rig = new THREE.Group();
  root.add(rig);
  root.add(groundShadow(elite ? 1.35 : 1.15));

  const scale = elite ? 1.18 : 1;
  rig.scale.setScalar(scale);

  const skin = mat(elite ? "#3a5a28" : "#4a6a32", { roughness: 0.75 });
  const leather = mat("#5a3a22", { roughness: 0.85 });
  const iron = mat("#6a6e72", { metalness: 0.55, roughness: 0.4 });
  const dark = mat("#2a2218");
  const eye = mat("#c43c2e", { emissive: "#8b1e1e", emissiveIntensity: 0.6 });
  const tusk = mat("#e8e0d0", { roughness: 0.35 });

  const hips = new THREE.Group();
  hips.position.y = 0.85;
  rig.add(hips);

  addPart(hips, new THREE.BoxGeometry(0.7, 0.75, 0.42), leather, 0, 0.35, 0);
  addPart(hips, new THREE.BoxGeometry(0.76, 0.28, 0.48), iron, 0, 0.55, 0); // chest plate
  if (elite) addPart(hips, new THREE.BoxGeometry(0.82, 0.12, 0.52), mat("#8b6b1e", { metalness: 0.6 }), 0, 0.72, 0);

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

  root.userData = {
    rig,
    hips,
    head,
    leftArm,
    rightArm,
    leftLeg,
    rightLeg,
    club,
    kind: elite ? "elite_ork" : "ork",
    animPhase: Math.random() * 10,
  };
  // shoulder spikes / belt detail
  addPart(hips, new THREE.ConeGeometry(0.08, 0.22, 4), iron, -0.38, 0.7, 0, 0, 0, -0.6);
  addPart(hips, new THREE.ConeGeometry(0.08, 0.22, 4), iron, 0.38, 0.7, 0, 0, 0, 0.6);
  addPart(hips, new THREE.BoxGeometry(0.75, 0.1, 0.12), mat("#8b6b1e", { metalness: 0.5 }), 0, 0.05, 0.22);
  attachHpBar(root, { y: elite ? 2.55 : 2.25, scaleX: 1.7, scaleY: 0.42 });
  return root;
}

export function animateMob(mesh, dt, moving = true) {
  const d = mesh.userData;
  if (!d?.rig) return;
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
    // orc biped
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
  }[role] || { cloth: "#3a6b4f", accent: "#c9a227", trim: "#1a2a20" };

  const skin = mat("#e0c4a0", { roughness: 0.7 });
  const cloth = mat(palette.cloth, { roughness: 0.65, emissive: palette.cloth, emissiveIntensity: 0.04 });
  const accent = mat(palette.accent, { metalness: 0.45, roughness: 0.4, emissive: palette.accent, emissiveIntensity: 0.15 });
  const trim = mat(palette.trim);
  const hair = mat(role === "quest" ? "#c8c0b0" : "#2a2218");

  const hips = new THREE.Group();
  hips.position.y = 0.92;
  rig.add(hips);

  // robe / tunic
  addPart(hips, new THREE.BoxGeometry(0.58, 0.7, 0.34), cloth, 0, 0.32, 0);
  addPart(hips, new THREE.BoxGeometry(0.62, 0.22, 0.38), trim, 0, 0.55, 0);
  if (role === "quest" || role === "teleport") {
    addPart(hips, new THREE.ConeGeometry(0.42, 0.85, 6), cloth, 0, -0.15, 0); // long robe skirt
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
  } else if (role === "shop") {
    addPart(leftArm.userData.lower, new THREE.BoxGeometry(0.18, 0.14, 0.1), mat("#c43c2e"), 0, -0.28, 0.1);
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

  const roleLabel = { shop: "Merchant", blacksmith: "Blacksmith", teleport: "Teleporter", quest: "Elder" }[role] || "NPC";
  ctx.clearRect(0, 0, 256, 64);
  ctx.fillStyle = "rgba(0,0,0,0.45)";
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
