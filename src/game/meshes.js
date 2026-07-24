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

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(MAP_SIZE, MAP_SIZE, 64, 64),
    new THREE.MeshStandardMaterial({ map: makeGrassTexture(), roughness: 0.95 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  const stoneTex = texNoise("#8a7a5c", 40);
  stoneTex.repeat.set(10, 10);
  const plaza = new THREE.Mesh(
    new THREE.CircleGeometry(CITY_RADIUS - 0.4, 48),
    new THREE.MeshStandardMaterial({ map: stoneTex, roughness: 0.9 })
  );
  plaza.rotation.x = -Math.PI / 2;
  plaza.position.y = 0.04;
  plaza.receiveShadow = true;
  scene.add(plaza);

  const roadMat = mat("#6a5f4e", { roughness: 0.95, flat: false });
  for (const rot of [0, Math.PI / 2]) {
    const road = new THREE.Mesh(new THREE.BoxGeometry(CITY_RADIUS * 2 - 2, 0.06, 4.4), roadMat);
    road.position.y = 0.08;
    road.rotation.y = rot;
    road.receiveShadow = true;
    scene.add(road);
  }

  // Fountain
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
  scene.add(fountain);

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
    scene.add(b);
  });

  addCityWalls(scene);

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
    scene.add(w);
  }

  const leaf = mat("#2d5a28");
  const trunk = mat("#3a2818");
  for (let i = 0; i < 80; i++) {
    const ang = Math.random() * Math.PI * 2;
    const r = CITY_RADIUS + 6 + Math.random() * (MAP_HALF - CITY_RADIUS - 8);
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
    g.position.set(Math.cos(ang) * r, 0, Math.sin(ang) * r);
    g.scale.setScalar(0.8 + Math.random() * 0.55);
    scene.add(g);
  }

  const rockMat = mat("#5c564c");
  for (let i = 0; i < 45; i++) {
    const ang = Math.random() * Math.PI * 2;
    const r = CITY_RADIUS + 5 + Math.random() * 42;
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.55 + Math.random() * 1.3, 0), rockMat);
    rock.position.set(Math.cos(ang) * r, 0.45, Math.sin(ang) * r);
    rock.rotation.set(Math.random(), Math.random(), Math.random());
    rock.castShadow = true;
    scene.add(rock);
  }

  return { scene, sun };
}

export function createCamera() {
  const camera = new THREE.PerspectiveCamera(40, window.innerWidth / window.innerHeight, 0.1, 200);
  camera.position.set(0, 28, 28);
  return camera;
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

export function makeMetinMesh(tier = 1) {
  const colors = ["#8b1e1e", "#1e4a8b", "#6b1e8b", "#8b6b1e", "#1e8b4a"];
  const color = colors[(tier - 1) % colors.length];
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
  return root;
}

export function makeMobMesh(kind = "wolf") {
  const root = new THREE.Group();
  const rig = new THREE.Group();
  root.add(rig);

  if (kind === "ork") {
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.85, 1.1, 0.55), mat("#5a3a22"));
    body.position.y = 1.0;
    body.castShadow = true;
    rig.add(body);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.45, 0.45), mat("#4a2e18"));
    head.position.y = 1.75;
    rig.add(head);
    const club = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.14, 1.1, 5), mat("#3a2810"));
    club.position.set(0.55, 1.1, 0.2);
    club.rotation.z = -0.5;
    rig.add(club);
  } else {
    // wolf-ish quadruped
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, 0.7, 4, 6), mat("#4a5538"));
    body.rotation.z = Math.PI / 2;
    body.position.set(0, 0.55, 0);
    body.castShadow = true;
    rig.add(body);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.3, 0.4), mat("#3a4528"));
    head.position.set(0, 0.65, 0.55);
    rig.add(head);
    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.45, 5), mat("#3a4528"));
    tail.position.set(0, 0.6, -0.55);
    tail.rotation.x = Math.PI / 2;
    rig.add(tail);
    for (const [lx, lz] of [
      [-0.18, 0.28],
      [0.18, 0.28],
      [-0.18, -0.28],
      [0.18, -0.28],
    ]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.45, 5), mat("#2a3218"));
      leg.position.set(lx, 0.22, lz);
      rig.add(leg);
    }
  }

  root.userData.rig = rig;
  root.userData.kind = kind;
  root.userData.animPhase = Math.random() * 10;
  return root;
}

export function animateMob(mesh, dt, moving = true) {
  const d = mesh.userData;
  if (!d?.rig) return;
  d.animPhase = (d.animPhase || 0) + dt * (moving ? 9 : 2);
  const s = Math.sin(d.animPhase);
  d.rig.position.y = moving ? Math.abs(s) * 0.08 : Math.sin(d.animPhase * 0.5) * 0.02;
  d.rig.rotation.z = moving ? s * 0.08 : 0;
}

export function makeBoltMesh(color = "#e8d48b") {
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.2, 8, 8),
    new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1.3 })
  );
  mesh.add(new THREE.PointLight(color, 1, 5));
  return mesh;
}
