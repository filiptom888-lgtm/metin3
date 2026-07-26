/**
 * Kenney Nature Kit (CC0) — preload + clone helpers for field dressing.
 */
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

const BASE = "/models/nature/";

const FILES = {
  tree_oak: "tree_oak.glb",
  tree_oak_dark: "tree_oak_dark.glb",
  tree_detailed: "tree_detailed.glb",
  tree_detailed_dark: "tree_detailed_dark.glb",
  tree_pine_tall: "tree_pineTallA_detailed.glb",
  tree_pine_tall_b: "tree_pineTallB_detailed.glb",
  tree_pine_round: "tree_pineRoundC.glb",
  tree_pine_small: "tree_pineSmallB.glb",
  tree_simple: "tree_simple.glb",
  tree_tall: "tree_tall.glb",
  tree_fat: "tree_fat.glb",
  tree_cone_dark: "tree_cone_dark.glb",
  tree_plateau: "tree_plateau.glb",
  tree_thin: "tree_thin.glb",
  tent_open: "tent_detailedOpen.glb",
  tent_closed: "tent_detailedClosed.glb",
  tent_small_open: "tent_smallOpen.glb",
  tent_small_closed: "tent_smallClosed.glb",
  campfire: "campfire_stones.glb",
  campfire_logs: "campfire_logs.glb",
  rock_large_a: "rock_largeA.glb",
  rock_large_b: "rock_largeB.glb",
  rock_small_a: "rock_smallA.glb",
  rock_small_b: "rock_smallB.glb",
  cliff_half: "cliff_half_rock.glb",
  cliff_block: "cliff_blockHalf_rock.glb",
  bush: "plant_bush.glb",
  bush_detailed: "plant_bushDetailed.glb",
  bush_large: "plant_bushLarge.glb",
  log: "log.glb",
  log_large: "log_large.glb",
  path_stone: "path_stone.glb",
  fence: "fence_simple.glb",
};

const GREEN_TREES = [
  "tree_oak",
  "tree_detailed",
  "tree_pine_tall",
  "tree_pine_tall_b",
  "tree_pine_round",
  "tree_tall",
  "tree_fat",
  "tree_simple",
  "tree_plateau",
];
/** Fuller canopy set for dense forests (no stick-thin models) */
const FOREST_TREES = [
  "tree_oak",
  "tree_detailed",
  "tree_pine_tall",
  "tree_pine_tall_b",
  "tree_pine_round",
  "tree_fat",
  "tree_tall",
  "tree_plateau",
];
const DRY_TREES = [
  "tree_oak_dark",
  "tree_detailed_dark",
  "tree_cone_dark",
  "tree_pine_small",
  "tree_plateau",
  "tree_detailed_dark",
];
const DRY_FOREST = [
  "tree_oak_dark",
  "tree_detailed_dark",
  "tree_cone_dark",
  "tree_pine_small",
  "tree_plateau",
];

const cache = new Map();
let ready = false;
let loading = null;

function prep(root) {
  root.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
      if (o.material) {
        o.material = o.material.clone();
        o.material.side = THREE.FrontSide;
      }
    }
  });
  // Kenney models are authored around ~1 unit; normalize footprint
  const box = new THREE.Box3().setFromObject(root);
  const size = new THREE.Vector3();
  box.getSize(size);
  const h = Math.max(0.01, size.y);
  root.userData.baseHeight = h;
  // Sit on ground (Kenney often centered)
  root.position.y -= box.min.y;
  return root;
}

export const NatureKit = {
  get ready() {
    return ready;
  },

  async preload() {
    if (ready) return true;
    if (loading) return loading;
    loading = (async () => {
      const loader = new GLTFLoader();
      const entries = Object.entries(FILES);
      await Promise.all(
        entries.map(
          ([key, file]) =>
            new Promise((resolve) => {
              loader.load(
                BASE + file,
                (gltf) => {
                  const root = gltf.scene || gltf.scenes?.[0];
                  if (root) {
                    prep(root);
                    cache.set(key, root);
                  }
                  resolve();
                },
                undefined,
                () => resolve()
              );
            })
        )
      );
      ready = cache.size > 0;
      return ready;
    })();
    return loading;
  },

  has(key) {
    return cache.has(key);
  },

  clone(key, scale = 1) {
    const src = cache.get(key);
    if (!src) return null;
    const g = src.clone(true);
    g.scale.setScalar(scale);
    g.traverse((o) => {
      if (o.isMesh && o.material) o.material = o.material.clone();
    });
    return g;
  },

  randomTree(arid = false, scale = 1) {
    const list = arid ? DRY_TREES : GREEN_TREES;
    for (let i = 0; i < 6; i++) {
      const key = list[(Math.random() * list.length) | 0];
      const m = this.clone(key, scale);
      if (m) return m;
    }
    return null;
  },

  /** Dense forest canopy trees (prefer bulky models). */
  randomForestTree(arid = false, scale = 1) {
    const list = arid ? DRY_FOREST : FOREST_TREES;
    for (let i = 0; i < 8; i++) {
      const key = list[(Math.random() * list.length) | 0];
      const m = this.clone(key, scale);
      if (m) return m;
    }
    return this.randomTree(arid, scale);
  },

  randomRock(scale = 1) {
    const keys = ["rock_large_a", "rock_large_b", "rock_small_a", "rock_small_b", "cliff_half", "cliff_block"];
    for (let i = 0; i < 6; i++) {
      const m = this.clone(keys[(Math.random() * keys.length) | 0], scale);
      if (m) return m;
    }
    return null;
  },

  randomBush(scale = 1) {
    const keys = ["bush", "bush_detailed", "bush_large"];
    for (let i = 0; i < 4; i++) {
      const m = this.clone(keys[(Math.random() * keys.length) | 0], scale);
      if (m) return m;
    }
    return null;
  },
};
