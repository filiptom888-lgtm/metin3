import { MONSTERS, SPAWN_ZONES, zoneAtDistance } from "../data/monsters.js";
import { METINS, metinsForMap } from "../data/metins.js";
import { inDemonTowerZone } from "../data/demonTower.js";
import { orcSpawnPoint } from "../data/orcMap.js";
import { EDGE_PORTAL } from "../game/data.js";
import { BANDIT_CAMP, banditCampPoint, inBanditCamp } from "../data/banditCamp.js";
import { campsOnMap, inWildCamp, wildCampPoint } from "../data/wildCamps.js";

function wildPoint(mapId, minR, maxR) {
  if (mapId === "orc_valley") {
    const mid = (minR + maxR) / 2;
    const zone = mid < 30 ? "near" : mid < 50 ? "mid" : "edge";
    return orcSpawnPoint(zone);
  }
  const edge = EDGE_PORTAL;
  for (let attempt = 0; attempt < 40; attempt++) {
    const ang = Math.random() * Math.PI * 2;
    const r = minR + Math.random() * Math.max(0.5, maxR - minR);
    const p = { x: Math.cos(ang) * r, z: Math.sin(ang) * r };
    if (mapId === "overworld" && inDemonTowerZone(p.x, p.z)) continue;
    if (mapId === "overworld" && Math.hypot(p.x - edge, p.z) < 10) continue;
    if (mapId === "valley" && Math.hypot(p.x + edge, p.z) < 10) continue;
    if (mapId === "valley" && Math.hypot(p.x - edge, p.z) < 10) continue;
    // Keep rogue hamlet / tent camps for their own packs
    if (mapId === BANDIT_CAMP.mapId && inBanditCamp(p.x, p.z, 4)) continue;
    if (inWildCamp(mapId, p.x, p.z, 3)) continue;
    return p;
  }
  const mid = (minR + maxR) / 2;
  return { x: -mid, z: mid };
}

function pickWeighted(entries) {
  const total = entries.reduce((s, e) => s + e.w, 0);
  let roll = Math.random() * total;
  for (const e of entries) {
    roll -= e.w;
    if (roll <= 0) return e.id;
  }
  return entries[entries.length - 1]?.id;
}

function overworldWeights(zone, level) {
  if (zone === "near") {
    return [
      { id: "dog", w: 70 },
      { id: "wolf", w: 30 },
    ];
  }
  if (zone === "mid") {
    return [
      { id: "wolf", w: 62 },
      { id: "dog", w: 12 },
      { id: "alpha_wolf", w: level >= 5 ? 22 : 0 },
      { id: "ork", w: level >= 10 ? 8 : 0 },
    ].filter((e) => e.w > 0);
  }
  return [
    { id: "ork", w: level >= 6 ? 40 : 20 },
    { id: "wolf", w: 28 },
    { id: "alpha_wolf", w: level >= 8 ? 22 : 0 },
    { id: "elite_ork", w: level >= 22 ? 10 : 0 },
  ].filter((e) => e.w > 0);
}

function valleyWeights(zone, level) {
  if (zone === "near") {
    return [
      { id: "bandit", w: 80 },
      { id: "soldier", w: level >= 14 ? 20 : 0 },
    ].filter((e) => e.w > 0);
  }
  if (zone === "mid") {
    return [
      { id: "bandit", w: 55 },
      { id: "soldier", w: level >= 12 ? 45 : 20 },
    ];
  }
  return [
    { id: "soldier", w: 65 },
    { id: "bandit", w: 35 },
  ];
}

function orcValleyWeights(zone, level) {
  if (zone === "near") {
    return [
      { id: "black_ork", w: 70 },
      { id: "ork", w: 30 },
    ];
  }
  if (zone === "mid") {
    return [
      { id: "black_ork", w: 45 },
      { id: "black_ork_brute", w: level >= 18 ? 35 : 20 },
      { id: "ork", w: 15 },
      { id: "elite_ork", w: level >= 24 ? 12 : 0 },
    ].filter((e) => e.w > 0);
  }
  return [
    { id: "black_ork_brute", w: 40 },
    { id: "black_ork", w: 25 },
    { id: "elite_ork", w: 20 },
    { id: "orc_chief", w: level >= 28 ? 15 : 5 },
  ].filter((e) => e.w > 0);
}

export const SpawnService = {
  monsters: MONSTERS,
  metins: METINS,

  zoneAt(mapId, x, z) {
    return zoneAtDistance(mapId, Math.hypot(x, z));
  },

  pickMobForZone(mapId = "overworld", zone = "mid", levelBias = 1) {
    const weights =
      mapId === "orc_valley"
        ? orcValleyWeights(zone, levelBias)
        : mapId === "valley"
          ? valleyWeights(zone, levelBias)
          : overworldWeights(zone, levelBias);
    const id =
      pickWeighted(weights) ||
      (mapId === "orc_valley" ? "black_ork" : mapId === "valley" ? "bandit" : "wolf");
    return MONSTERS[id] || MONSTERS.wolf;
  },

  pickMobTemplate(mapId = "overworld", levelBias = 1) {
    return this.pickMobForZone(mapId, "mid", levelBias);
  },

  pickKindAt(mapId, x, z, levelBias = 1) {
    const zone = this.zoneAt(mapId, x, z);
    return this.pickMobForZone(mapId, zone, levelBias).id;
  },

  /** Random metin for a map's level band */
  pickMetinTemplate(mapId = "overworld") {
    const list = metinsForMap(mapId);
    const pool = list.length ? list : Object.values(METINS);
    return pool[(Math.random() * pool.length) | 0];
  },

  /** Soft cap — few stones per field */
  metinCap(mapId = "overworld") {
    return mapId === "orc_valley" ? 3 : 2;
  },

  seedMetinCount(mapId = "overworld") {
    return mapId === "orc_valley" ? 2 : 2;
  },

  /** Wild packs: groups of 3 every 3–4 min (faster with more players on that map) */
  wildRespawnInterval(playerCount = 1) {
    const n = Math.max(1, playerCount | 0);
    if (n >= 3) return 120 + Math.random() * 60; // 2–3 min
    if (n === 2) return 165 + Math.random() * 45; // ~2.75–3.5 min
    return 195 + Math.random() * 45; // 3.25–4 min
  },

  /** Rogue Chief — a bit slower than wild packs */
  bossRespawnInterval(playerCount = 1) {
    const n = Math.max(1, playerCount | 0);
    if (n >= 3) return 150 + Math.random() * 60; // 2.5–3.5 min
    if (n === 2) return 195 + Math.random() * 45;
    return 225 + Math.random() * 60; // 3.75–4.75 min
  },

  /** Rare metin refill when below cap */
  metinRespawnInterval(playerCount = 1) {
    const n = Math.max(1, playerCount | 0);
    if (n >= 3) return 240 + Math.random() * 90; // 4–5.5 min
    return 300 + Math.random() * 120; // 5–7 min
  },

  /** Soft population cap for wild (excludes camp / metin waves still add) */
  wildMobCap(mapId = "overworld") {
    return mapId === "orc_valley" ? 32 : mapId === "valley" ? 45 : 48;
  },

  pointInZone(mapId, zone) {
    if (mapId === "orc_valley") return orcSpawnPoint(zone);
    if (zone === "camp") return banditCampPoint();
    const rings = SPAWN_ZONES[mapId] || SPAWN_ZONES.overworld;
    const ring = rings[zone] || rings.mid;
    return wildPoint(mapId, ring.minR, ring.maxR);
  },

  /** Initial rogue hamlet pack — chief + 5–10 bandits */
  seedBanditCamp() {
    const mobs = [];
    const n = BANDIT_CAMP.packMin + ((Math.random() * (BANDIT_CAMP.packSize - BANDIT_CAMP.packMin + 1)) | 0);
    for (let i = 0; i < n; i++) {
      const p = banditCampPoint(5, BANDIT_CAMP.r - 2);
      mobs.push({
        ...p,
        templateId: Math.random() < 0.28 ? "soldier" : "bandit",
        mapId: BANDIT_CAMP.mapId,
        zone: "camp",
        camp: true,
      });
    }
    const chiefAt = banditCampPoint(3, 7);
    mobs.push({
      ...chiefAt,
      templateId: "rogue_chief",
      mapId: BANDIT_CAMP.mapId,
      zone: "camp",
      camp: true,
    });
    return mobs;
  },

  /** Tent camps scattered around Shinsoo / Seungryong */
  seedWildCamps(mapId) {
    const mobs = [];
    for (const camp of campsOnMap(mapId)) {
      for (const pack of camp.mobs || []) {
        for (let i = 0; i < (pack.n || 1); i++) {
          const p = wildCampPoint(camp, 2.5, camp.r - 1.5);
          mobs.push({
            ...p,
            templateId: pack.id,
            mapId,
            zone: "camp",
            camp: true,
            campId: camp.id,
          });
        }
      }
    }
    return mobs;
  },

  seedWild(mapId = "overworld", level = 1) {
    const mobs = [];
    const metins = [];

    const plan =
      mapId === "orc_valley"
        ? [
            { zone: "near", count: 12 },
            { zone: "mid", count: 14 },
            { zone: "edge", count: 12 },
          ]
        : mapId === "valley"
          ? [
              { zone: "near", count: 16 },
              { zone: "mid", count: 18 },
              { zone: "edge", count: 16 },
            ]
          : [
              { zone: "near", count: 18 },
              { zone: "mid", count: 20 },
              { zone: "edge", count: 18 },
            ];

    for (const { zone, count } of plan) {
      for (let i = 0; i < count; i++) {
        const p = this.pointInZone(mapId, zone);
        const t = this.pickMobForZone(mapId, zone, level);
        mobs.push({ ...p, templateId: t.id, mapId, zone });
      }
    }

    if (mapId === BANDIT_CAMP.mapId) {
      mobs.push(...this.seedBanditCamp());
    }
    if (mapId === "overworld" || mapId === "valley") {
      mobs.push(...this.seedWildCamps(mapId));
    }

    const metinCount = this.seedMetinCount(mapId);
    for (let i = 0; i < metinCount; i++) {
      const zone = Math.random() < 0.4 ? "mid" : "edge";
      const p = this.pointInZone(mapId, zone);
      const t = this.pickMetinTemplate(mapId);
      metins.push({ ...p, templateId: t.id, mapId });
    }
    return { mobs, metins };
  },
};
