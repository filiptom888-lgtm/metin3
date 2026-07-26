/**
 * Custom Meshy / marketplace GLBs — classes, props, terrain, enemies.
 * Skinned enemies use SkeletonUtils + AnimationMixer; scenery stays static.
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

const PROP_FILES = {
  house_small: "/models/props/house_small.glb",
  house_large: "/models/props/house_large.glb",
  viking_hut: "/models/props/viking_hut.glb",
  wooden_gate: "/models/props/wooden_gate.glb",
  outpost_tent: "/models/props/outpost_tent.glb",
  lampposts: "/models/props/lampposts.glb",
  willow: "/models/terrain/willow.glb",
  trees_row: "/models/terrain/trees_row.glb",
  tree_single: "/models/terrain/tree_single.glb",
};

/** Rigged enemies — keep clips for idle / walk */
const ENEMY_FILES = {
  orc: "/models/enemies/orc.glb",
  orc_boss: "/models/enemies/orc_boss.glb",
  alpha_wolf: "/models/enemies/alpha_wolf.glb",
  wolfman: "/models/enemies/wolfman.glb",
  spider: "/models/enemies/spider.glb",
  phoenix: "/models/enemies/phoenix.glb",
  ophanim: "/models/enemies/demon_tower/ophanim.glb",
};

const cache = new Map();
let ready = false;
let loading = null;

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

function prepStatic(root, { castShadow = false } = {}) {
  root.traverse((o) => {
    if (!o.isMesh) return;
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
  return measureAndGround(root);
}

function loadGltf(loader, url) {
  return new Promise((resolve) => {
    loader.load(url, resolve, undefined, () => resolve(null));
  });
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

function cloneMaterials(root) {
  root.traverse((o) => {
    if (!o.isMesh || !o.material) return;
    o.material = Array.isArray(o.material)
      ? o.material.map((m) => m.clone())
      : o.material.clone();
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

      const staticEntries = [
        ...Object.entries(CLASS_FILES).map(([k, u]) => ["class:" + k, u, false]),
        ...Object.entries(PROP_FILES).map(([k, u]) => ["prop:" + k, u, k === "tree_single"]),
      ];

      await Promise.all(
        staticEntries.map(async ([key, url, skinned]) => {
          const gltf = await loadGltf(loader, url);
          if (!gltf?.scene) return;
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
        })
      );

      await Promise.all(
        Object.entries(ENEMY_FILES).map(async ([key, url]) => {
          const gltf = await loadGltf(loader, url);
          if (!gltf?.scene) return;
          measureAndGround(gltf.scene);
          gltf.scene.traverse((o) => {
            if (o.isMesh) {
              o.castShadow = true;
              o.receiveShadow = true;
            }
          });
          cache.set("enemy:" + key, {
            template: gltf.scene,
            clips: gltf.animations || [],
            skinned: true,
            baseHeight: gltf.scene.userData.baseHeight,
          });
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

  hasEnemy(key) {
    return cache.has("enemy:" + key);
  },

  /** Static class body scaled to target player height (~1.85). */
  classBody(classId, targetHeight = 1.85) {
    const src = cache.get("class:" + classId) || cache.get("class:warrior");
    if (!src) return null;
    const g = src.clone(true);
    cloneMaterials(g);
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
      cloneMaterials(g);
      g.scale.setScalar(scale);
      g.traverse((o) => {
        if (o.isMesh) {
          o.castShadow = false;
          o.receiveShadow = true;
        }
      });
      return g;
    }
    const g = entry.clone(true);
    cloneMaterials(g);
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

  /**
   * Skinned enemy (or class stand-in) with idle/walk mixer.
   * @returns {THREE.Group|null}
   */
  enemyBody(enemyKey, targetHeight, kindLabel) {
    const entry = cache.get("enemy:" + enemyKey);
    if (!entry) return null;

    const model = cloneSkinned(entry.template);
    cloneMaterials(model);
    model.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });

    const base = entry.baseHeight || 1;
    const s = Math.max(0.001, targetHeight / base);
    model.scale.setScalar(s);

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

  /** Map game mob kinds → enemy / class GLB */
  enemyForKind(kind) {
    const k = String(kind || "wolf");
    /** @type {{ key: string, h: number, classId?: string } | null} */
    let spec = null;
    if (k === "dog") spec = { key: "wolfman", h: 1.25 };
    else if (k === "wolf") spec = { key: "wolfman", h: 1.75 };
    else if (k === "alpha_wolf") spec = { key: "alpha_wolf", h: 2.05 };
    else if (k === "ork") spec = { key: "orc", h: 2.35 };
    else if (k === "elite_ork") spec = { key: "orc", h: 2.75 };
    else if (k === "black_ork") spec = { key: "orc_boss", h: 2.9 };
    else if (k === "black_ork_brute") spec = { key: "orc_boss", h: 3.45 };
    else if (k === "orc_chief") spec = { key: "orc_boss", h: 3.9 };
    else if (k === "spider") spec = { key: "spider", h: 1.15 };
    else if (k === "phoenix") spec = { key: "phoenix", h: 3.2 };
    else if (k === "ophanim" || k === "tower_boss") spec = { key: "ophanim", h: 4.6 };
    else if (k === "bandit" || k === "human") spec = { key: "class", h: 1.75, classId: "ninja" };
    else if (k === "soldier") spec = { key: "class", h: 1.85, classId: "warrior" };
    else if (k === "rogue_chief") spec = { key: "class", h: 2.15, classId: "sura" };
    else spec = { key: "wolfman", h: 1.75 };

    if (spec.key === "class") {
      const body = this.classBody(spec.classId, spec.h);
      if (!body) return null;
      const wrapper = new THREE.Group();
      const rig = new THREE.Group();
      wrapper.add(rig);
      rig.add(body);
      wrapper.userData = {
        useGltf: true,
        gltfEnemy: true,
        gltfBody: body,
        mixer: null,
        rig,
        kind: k,
        animPhase: Math.random() * 10,
      };
      return wrapper;
    }

    return this.enemyBody(spec.key, spec.h, k);
  },

  /** Forest tree — willow / single / row (all taller than player). */
  randomForestTree(targetHeight = 9) {
    const roll = Math.random();
    if (roll < 0.42) return this.clonePropToHeight("willow", targetHeight);
    if (roll < 0.78) return this.clonePropToHeight("tree_single", targetHeight * (0.95 + Math.random() * 0.25));
    return this.clonePropToHeight("trees_row", targetHeight * (1.35 + Math.random() * 0.4));
  },
};
