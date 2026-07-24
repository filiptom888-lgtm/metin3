import * as THREE from "three";
import { CLASSES, MAP_HALF, MAP_SIZE } from "./data.js";

function makeGrassTexture() {
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#3d6b3a";
  ctx.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 900; i++) {
    const x = Math.random() * 128;
    const y = Math.random() * 128;
    const shade = 40 + ((Math.random() * 50) | 0);
    ctx.fillStyle = `rgb(${shade},${90 + (shade % 40)},${35 + (shade % 20)})`;
    ctx.fillRect(x, y, 2, 2);
  }
  // dirt patches
  for (let i = 0; i < 12; i++) {
    ctx.fillStyle = "rgba(120, 95, 55, 0.35)";
    ctx.beginPath();
    ctx.ellipse(Math.random() * 128, Math.random() * 128, 10 + Math.random() * 18, 6 + Math.random() * 10, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(MAP_SIZE / 6, MAP_SIZE / 6);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
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
  renderer.toneMappingExposure = 1.12;
  return renderer;
}

export function createScene() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#87a070");
  scene.fog = new THREE.Fog("#9bb07a", 28, 62);

  const hemi = new THREE.HemisphereLight(0xdde8ff, 0x4a3a20, 0.95);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(0xfff0d0, 1.25);
  sun.position.set(22, 35, 14);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 2;
  sun.shadow.camera.far = 90;
  sun.shadow.camera.left = -34;
  sun.shadow.camera.right = 34;
  sun.shadow.camera.top = 34;
  sun.shadow.camera.bottom = -34;
  scene.add(sun);

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(MAP_SIZE, MAP_SIZE, 48, 48),
    new THREE.MeshStandardMaterial({
      map: makeGrassTexture(),
      roughness: 0.95,
      metalness: 0,
    })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // Stone plaza near center (village feel)
  const plaza = new THREE.Mesh(
    new THREE.CircleGeometry(7.5, 32),
    new THREE.MeshStandardMaterial({ color: "#8a7a5c", roughness: 0.9 })
  );
  plaza.rotation.x = -Math.PI / 2;
  plaza.position.y = 0.03;
  plaza.receiveShadow = true;
  scene.add(plaza);

  // City wall segments / pillars like screenshot
  const stone = new THREE.MeshStandardMaterial({ color: "#6e6a60", roughness: 0.88, flatShading: true });
  for (let i = 0; i < 10; i++) {
    const ang = (i / 10) * Math.PI * 2;
    const r = 20;
    const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.7, 3.2 + (i % 3), 6), stone);
    pillar.position.set(Math.cos(ang) * r, 1.6, Math.sin(ang) * r);
    pillar.castShadow = true;
    pillar.receiveShadow = true;
    scene.add(pillar);
  }

  // Boundary low walls
  const wallMat = new THREE.MeshStandardMaterial({ color: "#5a564c", roughness: 0.92 });
  const wallGeo = new THREE.BoxGeometry(MAP_SIZE + 1, 1.6, 0.7);
  for (const [x, z, ry] of [
    [0, -MAP_HALF, 0],
    [0, MAP_HALF, 0],
    [-MAP_HALF, 0, Math.PI / 2],
    [MAP_HALF, 0, Math.PI / 2],
  ]) {
    const w = new THREE.Mesh(wallGeo, wallMat);
    w.position.set(x, 0.8, z);
    w.rotation.y = ry;
    w.castShadow = true;
    w.receiveShadow = true;
    scene.add(w);
  }

  // Rocks / trees-ish
  const rockMat = new THREE.MeshStandardMaterial({ color: "#5c564c", roughness: 1, flatShading: true });
  for (let i = 0; i < 22; i++) {
    const ang = Math.random() * Math.PI * 2;
    const r = 9 + Math.random() * 12;
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.5 + Math.random() * 0.5, 0), rockMat);
    rock.position.set(Math.cos(ang) * r, 0.4, Math.sin(ang) * r);
    rock.rotation.set(Math.random(), Math.random(), Math.random());
    rock.castShadow = true;
    scene.add(rock);
  }

  const leaf = new THREE.MeshStandardMaterial({ color: "#2f5a28", roughness: 0.85 });
  const trunk = new THREE.MeshStandardMaterial({ color: "#3a2818", roughness: 1 });
  for (let i = 0; i < 16; i++) {
    const ang = (i / 16) * Math.PI * 2 + 0.2;
    const r = 14 + (i % 4);
    const g = new THREE.Group();
    const t = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.22, 1.2, 5), trunk);
    t.position.y = 0.6;
    t.castShadow = true;
    g.add(t);
    const canopy = new THREE.Mesh(new THREE.ConeGeometry(0.9, 2.2, 6), leaf);
    canopy.position.y = 2.1;
    canopy.castShadow = true;
    g.add(canopy);
    g.position.set(Math.cos(ang) * r, 0, Math.sin(ang) * r);
    scene.add(g);
  }

  return { scene, sun };
}

/** Classic Metin-ish high isometric camera */
export function createCamera() {
  const camera = new THREE.PerspectiveCamera(42, window.innerWidth / window.innerHeight, 0.1, 140);
  camera.position.set(0, 22, 22);
  return camera;
}

export function makePlayerMesh(classId, isLocal = false) {
  const cls = CLASSES[classId] || CLASSES.warrior;
  const root = new THREE.Group();

  // Foot aura (buff circle like Metin2)
  const aura = new THREE.Mesh(
    new THREE.RingGeometry(0.55, 0.85, 32),
    new THREE.MeshBasicMaterial({
      color: cls.color,
      transparent: true,
      opacity: isLocal ? 0.55 : 0.35,
      side: THREE.DoubleSide,
      depthWrite: false,
    })
  );
  aura.rotation.x = -Math.PI / 2;
  aura.position.y = 0.05;
  root.add(aura);
  root.userData.aura = aura;

  const body = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.32, 0.7, 4, 8),
    new THREE.MeshStandardMaterial({
      color: cls.color,
      roughness: 0.4,
      metalness: 0.25,
      emissive: cls.color,
      emissiveIntensity: isLocal ? 0.15 : 0.06,
    })
  );
  body.position.y = 0.85;
  body.castShadow = true;
  root.add(body);

  // Armor plate
  const armor = new THREE.Mesh(
    new THREE.BoxGeometry(0.55, 0.45, 0.35),
    new THREE.MeshStandardMaterial({ color: "#2a2418", metalness: 0.5, roughness: 0.45 })
  );
  armor.position.y = 1.05;
  armor.castShadow = true;
  root.add(armor);

  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.26, 12, 12),
    new THREE.MeshStandardMaterial({ color: "#e0c8a8", roughness: 0.65 })
  );
  head.position.y = 1.55;
  head.castShadow = true;
  root.add(head);

  const blade = new THREE.Mesh(
    new THREE.BoxGeometry(0.07, 0.07, 1.15),
    new THREE.MeshStandardMaterial({
      color: "#e8d48b",
      metalness: 0.85,
      roughness: 0.25,
      emissive: "#5a4010",
      emissiveIntensity: 0.25,
    })
  );
  blade.position.set(0.42, 1.0, 0.4);
  root.add(blade);

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

  root.userData.labelCanvas = canvas;
  root.userData.labelCtx = ctx;
  root.userData.labelTex = tex;
  root.userData.body = body;
  root.userData.blade = blade;
  root.userData.classId = classId;

  drawPlate(root, cls.name, cls.name, 1, 1);
  return root;
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

  // guild-ish / level line
  ctx.fillStyle = "rgba(0,0,0,0.45)";
  ctx.fillRect(40, 2, 240, 22);
  ctx.fillStyle = "#7dff9a";
  ctx.font = "bold 16px Noto Sans KR, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(`Lv ${level} ${classLabel}`, 160, 13);

  // name
  ctx.fillStyle = "#ffe9a0";
  ctx.font = "bold 20px Cinzel, serif";
  ctx.fillText(String(name).slice(0, 14), 160, 40);

  // HP bar — thick and readable
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
    new THREE.OctahedronGeometry(1.25, 0),
    new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: 0.7,
      metalness: 0.35,
      roughness: 0.22,
      flatShading: true,
    })
  );
  crystal.position.y = 1.45;
  crystal.castShadow = true;
  root.add(crystal);

  const glow = new THREE.PointLight(color, 1.8, 12);
  glow.position.y = 1.5;
  root.add(glow);

  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(0.85, 1.1, 0.4, 6),
    new THREE.MeshStandardMaterial({ color: "#2a2218", roughness: 0.9 })
  );
  base.position.y = 0.2;
  base.receiveShadow = true;
  root.add(base);

  // ground rune ring
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(1.2, 1.55, 24),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.45, side: THREE.DoubleSide })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.06;
  root.add(ring);

  root.userData.crystal = crystal;
  root.userData.tier = tier;
  return root;
}

export function makeMobMesh(kind = "wolf") {
  const root = new THREE.Group();
  const color = kind === "ork" ? "#6b4a2a" : "#4a5a38";
  const body = new THREE.Mesh(
    kind === "ork"
      ? new THREE.BoxGeometry(0.95, 1.25, 0.75)
      : new THREE.CapsuleGeometry(0.38, 0.35, 3, 6),
    new THREE.MeshStandardMaterial({ color, roughness: 0.85, flatShading: true })
  );
  body.position.y = kind === "ork" ? 0.75 : 0.55;
  body.castShadow = true;
  root.add(body);
  root.userData.body = body;
  return root;
}

export function makeBoltMesh(color = "#e8d48b") {
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.18, 8, 8),
    new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1.2 })
  );
  const light = new THREE.PointLight(color, 0.8, 4);
  mesh.add(light);
  return mesh;
}
