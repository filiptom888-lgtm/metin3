import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";

const WALK_URL = "/models/hero-walk.glb";
const RUN_URL = "/models/hero-run.glb";

let _loader = null;
let _cache = null;
let _loadPromise = null;

function getLoader() {
  if (_loader) return _loader;
  const draco = new DRACOLoader();
  draco.setDecoderPath("https://www.gstatic.com/draco/versioned/decoders/1.5.7/");
  draco.setDecoderConfig({ type: "js" });
  const loader = new GLTFLoader();
  loader.setDRACOLoader(draco);
  _loader = loader;
  return loader;
}

function loadGltf(url) {
  return new Promise((resolve, reject) => {
    getLoader().load(url, resolve, undefined, reject);
  });
}

async function ensureCache() {
  if (_cache) return _cache;
  if (_loadPromise) return _loadPromise;
  _loadPromise = (async () => {
    const walkGltf = await loadGltf(WALK_URL);
    let runClip = null;
    try {
      const runGltf = await loadGltf(RUN_URL);
      runClip = runGltf.animations?.[0] || null;
    } catch {
      runClip = null;
    }
    _cache = {
      template: walkGltf.scene,
      walkClip: walkGltf.animations?.[0] || null,
      runClip,
    };
    return _cache;
  })();
  return _loadPromise;
}

/**
 * Skinned Meshy hero (~1.7m) with walk / run. Bind pose when idle.
 */
export async function loadHeroModel() {
  const cache = await ensureCache();
  return cloneHero(cache);
}

function cloneHero(cache) {
  const root = cloneSkinned(cache.template);
  root.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
      if (o.material) {
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        const cloned = mats.map((m) => {
          const c = m.clone();
          c.roughness = Math.min(0.92, c.roughness ?? 0.75);
          return c;
        });
        o.material = Array.isArray(o.material) ? cloned : cloned[0];
      }
    }
  });

  const wrapper = new THREE.Group();
  wrapper.name = "hero_model";
  wrapper.add(root);

  const mixer = new THREE.AnimationMixer(root);
  const walkAction = cache.walkClip ? mixer.clipAction(cache.walkClip) : null;
  const runAction = cache.runClip ? mixer.clipAction(cache.runClip) : null;

  if (walkAction) {
    walkAction.enabled = true;
    walkAction.setEffectiveWeight(1);
    walkAction.play();
    walkAction.paused = true;
    walkAction.time = 0;
  }
  if (runAction) {
    runAction.enabled = true;
    runAction.setEffectiveWeight(0);
    runAction.play();
    runAction.setEffectiveWeight(0);
  }

  return {
    root: wrapper,
    mixer,
    walkAction,
    runAction,
    mode: "idle",
    ready: true,
    /** @param {number} dt @param {{ moving?: boolean, run?: boolean, attacking?: number }} state */
    update(dt, state = {}) {
      const moving = !!state.moving;
      const run = !!state.run;
      const next = !moving ? "idle" : run ? "run" : "walk";
      if (next !== this.mode) this._setMode(next);

      if (this.walkAction && this.mode === "walk") {
        this.walkAction.setEffectiveTimeScale(1.0);
      }
      if (this.runAction && this.mode === "run") {
        this.runAction.setEffectiveTimeScale(1.05);
      }

      this.mixer.update(dt);
    },
    _setMode(mode) {
      this.mode = mode;
      const fade = 0.18;
      if (mode === "idle") {
        if (this.runAction) this.runAction.fadeOut(fade);
        if (this.walkAction) {
          this.walkAction.fadeIn(fade);
          this.walkAction.paused = true;
          this.walkAction.time = 0;
          this.walkAction.setEffectiveWeight(1);
        }
      } else if (mode === "walk") {
        if (this.walkAction) {
          this.walkAction.paused = false;
          this.walkAction.reset().setEffectiveWeight(1).fadeIn(fade).play();
        }
        if (this.runAction) this.runAction.fadeOut(fade);
      } else if (mode === "run") {
        if (this.runAction) {
          this.runAction.reset().setEffectiveWeight(1).fadeIn(fade).play();
        }
        if (this.walkAction) this.walkAction.fadeOut(fade);
      }
    },
  };
}

/** Quick probe used by tests / UI */
export async function testHeroModelLoad() {
  const ctrl = await loadHeroModel();
  const box = new THREE.Box3().setFromObject(ctrl.root);
  const size = box.getSize(new THREE.Vector3());
  return {
    ok: true,
    hasWalk: !!ctrl.walkAction,
    hasRun: !!ctrl.runAction,
    height: size.y,
    width: size.x,
    depth: size.z,
  };
}
