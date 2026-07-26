/**
 * Custom Meshy / marketplace GLBs — characters, buildings, terrain accents.
 * Skips rigged skeletons; static meshes only (bob / lean done in code).
 */
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

const CLASS_FILES = {
  warrior: "/models/classes/warrior.glb",
  ninja: "/models/classes/ninja.glb",
  sura: "/models/classes/sura.glb",
  shaman: "/models/classes/shaman.glb",
};

const PROP_FILES = {
  house_small: "/models/props/house_small.glb",
  viking_hut: "/models/props/viking_hut.glb",
  wooden_gate: "/models/props/wooden_gate.glb",
  outpost_tent: "/models/props/outpost_tent.glb",
  willow: "/models/terrain/willow.glb",
  trees_row: "/models/terrain/trees_row.glb",
};

const cache = new Map();
let ready = false;
let loading = null;

function prep(root, { castShadow = false } = {}) {
  root.traverse((o) => {
    if (!o.isMesh) return;
    // Never enable skinned playback — freeze as static scenery / body
    o.castShadow = castShadow;
    o.receiveShadow = !!castShadow;
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
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  const size = new THREE.Vector3();
  box.getSize(size);
  root.userData.baseHeight = Math.max(0.01, size.y);
  root.userData.baseWidth = Math.max(0.01, size.x);
  root.userData.baseDepth = Math.max(0.01, size.z);
  // Sit on y=0
  root.position.y -= box.min.y;
  return root;
}

function loadOne(loader, url) {
  return new Promise((resolve) => {
    loader.load(
      url,
      (gltf) => {
        const root = gltf.scene || gltf.scenes?.[0];
        if (!root) {
          resolve(null);
          return;
        }
        // Drop animations — we don't play clips on these assets
        resolve(prep(root));
      },
      undefined,
      () => resolve(null)
    );
  });
}

export const AssetKit = {
  get ready() {
    return ready;
  },

  async preload() {
    if (ready) return true;
    if (loading) return loading;
    loading = (async () => {
      const loader = new GLTFLoader();
      const entries = [
        ...Object.entries(CLASS_FILES).map(([k, u]) => ["class:" + k, u]),
        ...Object.entries(PROP_FILES).map(([k, u]) => ["prop:" + k, u]),
      ];
      await Promise.all(
        entries.map(async ([key, url]) => {
          const root = await loadOne(loader, url);
          if (root) cache.set(key, root);
        })
      );
      ready = cache.size > 0;
      return ready;
    })();
    return loading;
  },

  hasClass(classId) {
    return cache.has("class:" + classId);
  },

  hasProp(key) {
    return cache.has("prop:" + key);
  },

  /** Static class body scaled to target player height (~1.85). */
  classBody(classId, targetHeight = 1.85) {
    const src = cache.get("class:" + classId) || cache.get("class:warrior");
    if (!src) return null;
    const g = src.clone(true);
    g.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
        if (o.material) {
          o.material = Array.isArray(o.material)
            ? o.material.map((m) => m.clone())
            : o.material.clone();
        }
      }
    });
    const base = src.userData.baseHeight || 2;
    const s = Math.max(0.35, targetHeight / base);
    g.scale.setScalar(s);
    g.name = `class_${classId}`;
    return g;
  },

  cloneProp(key, scale = 1) {
    const src = cache.get("prop:" + key);
    if (!src) return null;
    const g = src.clone(true);
    g.traverse((o) => {
      if (o.isMesh && o.material) {
        o.material = Array.isArray(o.material)
          ? o.material.map((m) => m.clone())
          : o.material.clone();
      }
    });
    g.scale.setScalar(scale);
    return g;
  },

  /** Scale prop so authored height becomes targetHeight world units. */
  clonePropToHeight(key, targetHeight) {
    const src = cache.get("prop:" + key);
    if (!src) return null;
    const base = src.userData.baseHeight || 1;
    return this.cloneProp(key, Math.max(0.05, targetHeight / base));
  },
};
