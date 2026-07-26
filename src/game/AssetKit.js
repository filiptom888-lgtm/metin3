/**
 * Custom Meshy / marketplace GLBs — staged load for fast world enter.
 * Critical props block boot; enemies/heavy props load in background / on demand.
 */
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";

const CLASS_FILES = {
  warrior: "/models/classes/warrior.glb",
  ninja: "/models/classes/ninja.glb",
  sura: "/models/classes/sura.glb",
  shaman: "/models/classes/shaman.glb",
};

/** Block world enter — cheap city props only */
const CRITICAL_PROPS = {
  house_small: "/models/props/house_small.glb",
  wooden_gate: "/models/props/wooden_gate.glb",
};

/** Background — other classes only (no heavy scenery/enemies at boot) */
const BACKGROUND_PROPS = {};

/** Only special animated boss — never field trash */
const ENEMY_FILES = {
  ophanim: "/models/enemies/demon_tower/ophanim.glb",
};

const cache = new Map();
const enemyLoadPromises = new Map();
let criticalReady = false;
let backgroundStarted = false;
let criticalLoading = null;
let _loader = null;

function getLoader() {
  if (!_loader) _loader = new GLTFLoader();
  return _loader;
}

function measureAndGround(root) {
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  const size = new THREE.Vector3();
  box.getSize(size);
  root.userData.baseHeight = Math.max(0.01, size.y);
  root.userData.baseWidth = Math.max(0.01, size.x);
  root.userData.baseDepth = Math.max(0.01, size.z);
  root.position.y -= box.min.y;
  return root;
}

function prepStatic(root) {
  root.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = false;
    o.receiveShadow = true;
    if (o.material) {
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      const cloned = mats.map((m) => {
        const c = m.clone();
        if ("side" in c) c.side = THREE.FrontSide;
        if ("roughness" in c) c.roughness = Math.min(0.95, c.roughness ?? 0.8);
        return c;
      });
      o.material = Array.isArray(o.material) ? cloned : cloned[0];
    }
  });
  return measureAndGround(root);
}

function loadGltf(url) {
  return new Promise((resolve) => {
    getLoader().load(url, resolve, undefined, () => resolve(null));
  });
}

async function cacheStaticProp(key, url, skinned = false) {
  if (cache.has(key)) return true;
  const gltf = await loadGltf(url);
  if (!gltf?.scene) return false;
  if (skinned) {
    measureAndGround(gltf.scene);
    cache.set(key, {
      template: gltf.scene,
      clips: gltf.animations || [],
      skinned: true,
      baseHeight: gltf.scene.userData.baseHeight,
    });
  } else {
    prepStatic(gltf.scene);
    cache.set(key, gltf.scene);
  }
  return true;
}

async function cacheClass(classId) {
  const key = "class:" + classId;
  if (cache.has(key)) return true;
  const url = CLASS_FILES[classId];
  if (!url) return false;
  const gltf = await loadGltf(url);
  if (!gltf?.scene) return false;
  prepStatic(gltf.scene);
  cache.set(key, gltf.scene);
  return true;
}

function pickClip(clips, patterns) {
  if (!clips?.length) return null;
  for (const p of patterns) {
    const re = typeof p === "string" ? new RegExp(p, "i") : p;
    const hit = clips.find((c) => re.test(c.name || ""));
    if (hit) return hit;
  }
  return clips[0] || null;
}

function kindToEnemyKey(kind) {
  const k = String(kind || "");
  if (k === "ophanim" || k === "tower_boss") return "ophanim";
  return null;
}

export const AssetKit = {
  get ready() {
    return criticalReady;
  },

  /** Fast path: one class + cheap city props. */
  async preloadCritical(preferredClassId = "warrior") {
    if (criticalReady) return true;
    if (criticalLoading) return criticalLoading;
    criticalLoading = (async () => {
      const classId = CLASS_FILES[preferredClassId] ? preferredClassId : "warrior";
      await Promise.all([
        cacheClass(classId),
        ...Object.entries(CRITICAL_PROPS).map(([k, u]) => cacheStaticProp("prop:" + k, u)),
      ]);
      criticalReady = cache.has("prop:house_small") || cache.has("class:" + classId);
      return criticalReady;
    })();
    return criticalLoading;
  },

  /** Full preload kept for compatibility — critical then background. */
  async preload() {
    await this.preloadCritical("warrior");
    this.preloadBackground();
    return criticalReady;
  },

  /** Non-blocking: other classes, heavy props, no enemies (those are lazy). */
  preloadBackground() {
    if (backgroundStarted) return;
    backgroundStarted = true;
    (async () => {
      for (const id of Object.keys(CLASS_FILES)) {
        await cacheClass(id);
      }
      for (const [k, u] of Object.entries(BACKGROUND_PROPS)) {
        const skinned = k === "tree_single";
        await cacheStaticProp("prop:" + k, u, skinned);
      }
    })().catch((err) => console.warn("[AssetKit bg]", err));
  },

  /** Ensure a class model is available (for char select / remotes). */
  async ensureClass(classId) {
    return cacheClass(classId || "warrior");
  },

  /** Lazy-load one enemy GLB the first time that kind is needed. */
  async ensureEnemy(enemyKey) {
    const key = "enemy:" + enemyKey;
    if (cache.has(key)) return true;
    if (enemyLoadPromises.has(key)) return enemyLoadPromises.get(key);
    const url = ENEMY_FILES[enemyKey];
    if (!url) return false;
    const p = (async () => {
      const gltf = await loadGltf(url);
      if (!gltf?.scene) return false;
      measureAndGround(gltf.scene);
      gltf.scene.traverse((o) => {
        if (o.isMesh) {
          o.castShadow = true;
          o.receiveShadow = true;
        }
      });
      cache.set(key, {
        template: gltf.scene,
        clips: gltf.animations || [],
        skinned: true,
        baseHeight: gltf.scene.userData.baseHeight,
      });
      return true;
    })();
    enemyLoadPromises.set(key, p);
    return p;
  },

  /** Kick ophanim load when approaching / entering Demon Tower */
  preloadTowerBoss() {
    return this.ensureEnemy("ophanim");
  },

  /** @deprecated field enemies are procedural — no-op kept for callers */
  preloadCommonEnemies() {},

  hasClass(classId) {
    return cache.has("class:" + classId);
  },

  hasProp(key) {
    return cache.has("prop:" + key);
  },

  hasEnemy(key) {
    return cache.has("enemy:" + key);
  },

  classBody(classId, targetHeight = 1.85) {
    const src = cache.get("class:" + classId) || cache.get("class:warrior");
    if (!src) return null;
    // Share materials — clone geometry graph only
    const g = src.clone(true);
    g.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
    const base = src.userData.baseHeight || 2;
    g.scale.setScalar(Math.max(0.35, targetHeight / base));
    g.name = `class_${classId}`;
    return g;
  },

  cloneProp(key, scale = 1) {
    const entry = cache.get("prop:" + key);
    if (!entry) return null;
    if (entry.skinned) {
      const g = cloneSkinned(entry.template);
      g.scale.setScalar(scale);
      g.traverse((o) => {
        if (o.isMesh) {
          o.castShadow = false;
          o.receiveShadow = true;
        }
      });
      return g;
    }
    // Share materials across instances (big FPS win)
    const g = entry.clone(true);
    g.scale.setScalar(scale);
    return g;
  },

  clonePropToHeight(key, targetHeight) {
    const entry = cache.get("prop:" + key);
    if (!entry) return null;
    const base = entry.skinned
      ? entry.baseHeight || entry.template?.userData?.baseHeight || 1
      : entry.userData?.baseHeight || 1;
    return this.cloneProp(key, Math.max(0.02, targetHeight / base));
  },

  enemyBody(enemyKey, targetHeight, kindLabel) {
    const entry = cache.get("enemy:" + enemyKey);
    if (!entry) return null;

    const model = cloneSkinned(entry.template);
    model.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });

    const base = entry.baseHeight || 1;
    model.scale.setScalar(Math.max(0.001, targetHeight / base));

    const wrapper = new THREE.Group();
    wrapper.name = `enemy_${enemyKey}`;
    wrapper.add(model);

    const mixer = new THREE.AnimationMixer(model);
    const idleClip = pickClip(entry.clips, [
      /^idle$/i,
      /ANM_IDLE/i,
      /howl/i,
      /intimidation/i,
      /action/i,
      /take/i,
      /scene/i,
    ]);
    const walkClip = pickClip(entry.clips, [
      /^walk$/i,
      /ANM_WALK/i,
      /ANM_RUN/i,
      /walking/i,
      /running/i,
      /intimidation walk/i,
      /take/i,
    ]);
    const attackClip = pickClip(entry.clips, [/attack/i, /ANM_.*ATTACK/i, /roar/i]);

    const idleAction = idleClip ? mixer.clipAction(idleClip) : null;
    const walkAction = walkClip ? mixer.clipAction(walkClip) : null;
    const attackAction = attackClip ? mixer.clipAction(attackClip) : null;

    if (idleAction) {
      idleAction.enabled = true;
      idleAction.setEffectiveWeight(1);
      idleAction.play();
    } else if (walkAction) {
      walkAction.enabled = true;
      walkAction.setEffectiveWeight(1);
      walkAction.play();
      walkAction.paused = true;
    }

    wrapper.userData = {
      useGltf: true,
      gltfEnemy: true,
      mixer,
      idleAction,
      walkAction,
      attackAction,
      animMode: "idle",
      rig: wrapper,
      kind: kindLabel || enemyKey,
      animPhase: Math.random() * 10,
    };
    return wrapper;
  },

  /** Only ophanim GLB — all other kinds return null (procedural meshes). */
  enemyForKind(kind) {
    const enemyKey = kindToEnemyKey(kind);
    if (!enemyKey) return null;
    if (!this.hasEnemy(enemyKey)) {
      this.ensureEnemy(enemyKey).catch(() => {});
      return null;
    }
    return this.enemyBody(enemyKey, 4.6, String(kind || "ophanim"));
  },
};

