import * as THREE from "three";
import { MapService } from "../services/MapService.js";

/** Full day length in real seconds (~8 min) */
export const DAY_LENGTH = 480;

const _bg = new THREE.Color();
const _fog = new THREE.Color();
const _sun = new THREE.Color();
const _sky = new THREE.Color();
const _ground = new THREE.Color();
const _tmp = new THREE.Color();

/** 0 midnight → 0.25 dawn → 0.5 noon → 0.75 dusk */
export function dayPhase(worldTime) {
  const t = (((worldTime % DAY_LENGTH) + DAY_LENGTH) % DAY_LENGTH) / DAY_LENGTH;
  const sunH = Math.sin(t * Math.PI * 2 - Math.PI / 2);
  const day = Math.max(0, Math.min(1, sunH * 0.92 + 0.08));
  const night = 1 - day;
  return { t, day, night, sunH };
}

/**
 * Apply day/night to scene lights + fog. Dungeons stay fixed.
 * @returns {{ t:number, day:number, night:number }}
 */
export function applyDayNight(scene, sun, hemi, worldTime, torchLights = []) {
  if (!scene || !sun || !hemi) return { t: 0.5, day: 1, night: 0 };
  const map = MapService.current;
  if (!map || map.kind === "dungeon") {
    for (const l of torchLights) {
      if (l) {
        l.intensity = 0;
        l.visible = false;
      }
    }
    return { t: 0.5, day: 0.15, night: 0.85 };
  }

  const { t, day, night, sunH } = dayPhase(worldTime);
  const dayBg = map.background || "#7a9a68";
  const dayFog = map.fog || "#8aaa72";

  // Night ↔ day blend with a purple dusk shoulder
  const duskAmt = Math.max(0, 1 - Math.abs(day - 0.25) * 4) * 0.35;
  _bg.set(dayBg).lerp(_tmp.set("#0a1020"), night * 0.92);
  _bg.lerp(_tmp.set("#5a3048"), duskAmt);
  _fog.set(dayFog).lerp(_tmp.set("#121828"), night * 0.9);
  _fog.lerp(_tmp.set("#4a3040"), duskAmt);

  scene.background.copy(_bg);
  if (scene.fog) {
    scene.fog.color.copy(_fog);
    scene.fog.near = (map.fogNear || 50) * (0.9 + night * 0.2);
    scene.fog.far = (map.fogFar || 200) * (0.72 + day * 0.28);
  }

  const ang = t * Math.PI * 2;
  const elev = Math.max(0.06, sunH * 0.95 + 0.12);
  sun.position.set(Math.cos(ang) * 85, elev * 72, Math.sin(ang) * 50);
  sun.intensity = 0.1 + day * 1.25;
  _sun.set("#6a7ab0").lerp(_tmp.set("#ffe8c8"), day);
  sun.color.copy(_sun);

  hemi.intensity = 0.2 + day * 0.9;
  _sky.set("#1a2440").lerp(_tmp.set("#fff2e0"), day);
  _ground.set("#0a0810").lerp(_tmp.set("#5a4a28"), day);
  hemi.color.copy(_sky);
  hemi.groundColor.copy(_ground);

  const torchI = night > 0.08 ? 0.2 + night * 1.4 : 0;
  for (const l of torchLights) {
    if (!l) continue;
    l.intensity = torchI;
    l.visible = torchI > 0.05;
  }

  return { t, day, night };
}
