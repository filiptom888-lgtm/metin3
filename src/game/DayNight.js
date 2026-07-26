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
  // Keep a readable floor — never pitch black
  const day = Math.max(0.18, Math.min(1, sunH * 0.78 + 0.28));
  const night = 1 - day;
  return { t, day, night, sunH };
}

/**
 * Apply day/night to scene lights + fog. Dungeons stay fixed.
 * Night is a cozy warm twilight, not a black void.
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

  // Soft dusk blush → cozy indigo/amber night (readable, not black)
  const duskAmt = Math.max(0, 1 - Math.abs(day - 0.35) * 3.2) * 0.4;
  _bg.set(dayBg).lerp(_tmp.set("#1a2438"), night * 0.72);
  _bg.lerp(_tmp.set("#6a3a28"), duskAmt * 0.55);
  _bg.lerp(_tmp.set("#243044"), night * 0.25); // lift midnight a bit
  _fog.set(dayFog).lerp(_tmp.set("#1c2838"), night * 0.65);
  _fog.lerp(_tmp.set("#4a3428"), duskAmt * 0.45);

  scene.background.copy(_bg);
  if (scene.fog) {
    scene.fog.color.copy(_fog);
    // Softer fog at night so the world stays visible
    scene.fog.near = (map.fogNear || 50) * (0.85 + night * 0.15);
    scene.fog.far = (map.fogFar || 200) * (0.85 + day * 0.2);
  }

  const ang = t * Math.PI * 2;
  // Keep a gentle moon arc even at "night"
  const elev = Math.max(0.22, sunH * 0.85 + 0.28);
  sun.position.set(Math.cos(ang) * 85, elev * 72, Math.sin(ang) * 50);
  // Dim warm moonlight instead of near-off sun
  sun.intensity = 0.35 + day * 1.05;
  _sun.set("#c8d4f0").lerp(_tmp.set("#ffe8c8"), day);
  _sun.lerp(_tmp.set("#ffd0a0"), night * 0.55); // warm moon tint
  sun.color.copy(_sun);

  // Cozy hemisphere fill — warm amber ground bounce at night
  hemi.intensity = 0.55 + day * 0.55;
  _sky.set("#2a3448").lerp(_tmp.set("#fff2e0"), day);
  _sky.lerp(_tmp.set("#3a3048"), night * 0.35);
  _ground.set("#2a2218").lerp(_tmp.set("#5a4a28"), day);
  _ground.lerp(_tmp.set("#3a2818"), night * 0.4);
  hemi.color.copy(_sky);
  hemi.groundColor.copy(_ground);

  // Torches: soft warm pools (stronger + longer at night)
  const torchI = night > 0.05 ? 0.55 + night * 1.65 : 0;
  for (const l of torchLights) {
    if (!l) continue;
    l.intensity = torchI;
    l.visible = torchI > 0.08;
    // Widen cozy glow without harsh falloff
    if (l.distance != null) l.distance = 26;
    if (l.decay != null) l.decay = 1.35;
    if (l.color) l.color.setHex(0xffb060);
  }

  return { t, day, night };
}
