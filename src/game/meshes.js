import * as THREE from "three";
import { CLASSES, MAP_HALF, MAP_SIZE } from "./data.js";

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
  renderer.toneMappingExposure = 1.05;
  return renderer;
}

export function createScene() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#0a1210");
  scene.fog = new THREE.FogExp2("#0a1210", 0.028);

  const hemi = new THREE.HemisphereLight(0xb8d4c8, 0x1a1008, 0.85);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(0xffe2b0, 1.15);
  sun.position.set(18, 28, 10);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 80;
  sun.shadow.camera.left = -30;
  sun.shadow.camera.right = 30;
  sun.shadow.camera.top = 30;
  sun.shadow.camera.bottom = -30;
  scene.add(sun);

  const fill = new THREE.PointLight(0x2f6b4f, 0.55, 60);
  fill.position.set(-10, 8, -8);
  scene.add(fill);

  // Ground
  const groundMat = new THREE.MeshStandardMaterial({
    color: "#1a2e24",
    roughness: 0.92,
    metalness: 0.05,
  });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(MAP_SIZE, MAP_SIZE, 32, 32), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // Checker tint via second overlay
  const grid = new THREE.GridHelper(MAP_SIZE, MAP_SIZE / 2, 0x2f6b4f, 0x14241c);
  grid.position.y = 0.02;
  grid.material.opacity = 0.35;
  grid.material.transparent = true;
  scene.add(grid);

  // Boundary walls (low)
  const wallMat = new THREE.MeshStandardMaterial({ color: "#24352c", roughness: 0.9 });
  const wallGeo = new THREE.BoxGeometry(MAP_SIZE + 1, 1.2, 0.6);
  for (const [x, z, ry] of [
    [0, -MAP_HALF, 0],
    [0, MAP_HALF, 0],
    [-MAP_HALF, 0, Math.PI / 2],
    [MAP_HALF, 0, Math.PI / 2],
  ]) {
    const w = new THREE.Mesh(wallGeo, wallMat);
    w.position.set(x, 0.6, z);
    w.rotation.y = ry;
    w.castShadow = true;
    w.receiveShadow = true;
    scene.add(w);
  }

  // Decor rocks / pillars
  const rockMat = new THREE.MeshStandardMaterial({ color: "#2a322c", roughness: 1 });
  for (let i = 0; i < 18; i++) {
    const ang = (i / 18) * Math.PI * 2;
    const r = 16 + (i % 3) * 2.5;
    const rock = new THREE.Mesh(
      new THREE.DodecahedronGeometry(0.6 + (i % 4) * 0.2, 0),
      rockMat
    );
    rock.position.set(Math.cos(ang) * r, 0.5, Math.sin(ang) * r);
    rock.rotation.set(Math.random(), Math.random(), Math.random());
    rock.castShadow = true;
    rock.receiveShadow = true;
    scene.add(rock);
  }

  // Center shrine ring
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(4.5, 0.12, 8, 48),
    new THREE.MeshStandardMaterial({ color: "#c9a227", emissive: "#5a4010", emissiveIntensity: 0.35, metalness: 0.6, roughness: 0.35 })
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.08;
  scene.add(ring);

  return { scene, sun };
}

export function createCamera() {
  const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 120);
  camera.position.set(0, 14, 16);
  return camera;
}

export function makePlayerMesh(classId, isLocal = false) {
  const cls = CLASSES[classId] || CLASSES.warrior;
  const root = new THREE.Group();

  const body = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.35, 0.85, 4, 8),
    new THREE.MeshStandardMaterial({
      color: cls.color,
      roughness: 0.45,
      metalness: 0.2,
      emissive: cls.color,
      emissiveIntensity: isLocal ? 0.12 : 0.05,
    })
  );
  body.position.y = 0.95;
  body.castShadow = true;
  root.add(body);

  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.28, 12, 12),
    new THREE.MeshStandardMaterial({ color: "#e8e0d0", roughness: 0.7 })
  );
  head.position.y = 1.75;
  head.castShadow = true;
  root.add(head);

  const blade = new THREE.Mesh(
    new THREE.BoxGeometry(0.08, 0.08, 1.1),
    new THREE.MeshStandardMaterial({ color: "#e8d48b", metalness: 0.8, roughness: 0.3, emissive: "#5a4010", emissiveIntensity: 0.2 })
  );
  blade.position.set(0.45, 1.1, 0.35);
  root.add(blade);

  // Name plate placeholder (updated externally via CSS2D or canvas — we use sprites)
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "rgba(0,0,0,0.45)";
  ctx.fillRect(0, 0, 256, 64);
  ctx.fillStyle = "#e8d48b";
  ctx.font = "bold 28px Cinzel, serif";
  ctx.textAlign = "center";
  ctx.fillText(cls.name, 128, 40);
  const tex = new THREE.CanvasTexture(canvas);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
  sprite.position.y = 2.35;
  sprite.scale.set(2.2, 0.55, 1);
  root.add(sprite);
  root.userData.labelCanvas = canvas;
  root.userData.labelCtx = ctx;
  root.userData.labelTex = tex;
  root.userData.body = body;
  root.userData.blade = blade;

  return root;
}

export function setNameplate(mesh, text) {
  const ctx = mesh.userData.labelCtx;
  const canvas = mesh.userData.labelCanvas;
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "rgba(0,0,0,0.5)";
  ctx.fillRect(0, 0, 256, 64);
  ctx.fillStyle = "#e8d48b";
  ctx.font = "bold 26px Cinzel, serif";
  ctx.textAlign = "center";
  ctx.fillText(String(text).slice(0, 16), 128, 40);
  mesh.userData.labelTex.needsUpdate = true;
}

export function makeMetinMesh(tier = 1) {
  const colors = ["#8b1e1e", "#1e4a8b", "#6b1e8b", "#8b6b1e", "#1e8b4a"];
  const color = colors[(tier - 1) % colors.length];
  const root = new THREE.Group();

  const crystal = new THREE.Mesh(
    new THREE.OctahedronGeometry(1.1, 0),
    new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: 0.55,
      metalness: 0.35,
      roughness: 0.25,
      flatShading: true,
    })
  );
  crystal.position.y = 1.3;
  crystal.castShadow = true;
  root.add(crystal);

  const glow = new THREE.PointLight(color, 1.4, 10);
  glow.position.y = 1.4;
  root.add(glow);

  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(0.7, 0.95, 0.35, 6),
    new THREE.MeshStandardMaterial({ color: "#1a140e", roughness: 0.9 })
  );
  base.position.y = 0.18;
  base.receiveShadow = true;
  root.add(base);

  root.userData.crystal = crystal;
  root.userData.tier = tier;
  return root;
}

export function makeMobMesh(kind = "wolf") {
  const root = new THREE.Group();
  const color = kind === "ork" ? "#6b4a2a" : "#5a6b4a";
  const body = new THREE.Mesh(
    kind === "ork"
      ? new THREE.BoxGeometry(0.9, 1.2, 0.7)
      : new THREE.CapsuleGeometry(0.35, 0.4, 3, 6),
    new THREE.MeshStandardMaterial({ color, roughness: 0.85 })
  );
  body.position.y = kind === "ork" ? 0.7 : 0.55;
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
