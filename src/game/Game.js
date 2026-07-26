import { CLASSES, MAP_HALF, clamp, dist2, rand, uid, wildPoint, CITY_RADIUS, inCity } from "./data.js";
import {
  createRenderer,
  createScene,
  createCamera,
  fieldHeightAt,
  makePlayerMesh,
  makeMetinMesh,
  makeMobMesh,
  makeNpcMesh,
  makeDemonTowerMesh,
  makeDungeonMapRoot,
  makeValleyMapRoot,
  makeOrcMapRoot,
  makeBoltMesh,
  setNameplate,
  animateCharacter,
  animateMob,
  animateNpc,
  animateWorldSmoke,
  updateHpBar,
  setQuestMarker,
  makeHuntBeacon,
} from "./meshes.js";
import { clampFieldWalk, isFieldWalkable } from "./terrain.js";
import { bridgeCenter } from "./rivers.js";
import { applyDayNight, DAY_LENGTH } from "./DayNight.js";
import { questHuntFor, zoneRing } from "../data/mapMarkers.js";
import { NPCS } from "../data/npcs.js";
import { FxSystem } from "./fx.js";
import { derivedStats, applyLevelUps } from "./character.js";
import { getItem, RARITY_COLOR } from "./items.js";
import { clampToOrcLand } from "../data/orcMap.js";
import {
  equipFromInventory,
  unequipSlot,
  useConsumable,
  removeFromInventory,
} from "./inventory.js";
import { CombatService } from "../services/CombatService.js";
import { DropService } from "../services/DropService.js";
import { InventoryService } from "../services/InventoryService.js";
import { QuestService } from "../services/QuestService.js";
import { NpcService } from "../services/NpcService.js";
import { SpawnService } from "../services/SpawnService.js";
import { SkillService } from "../services/SkillService.js";
import { PartyService } from "../services/PartyService.js";
import { PvPService } from "../services/PvPService.js";
import { TradeService } from "../services/TradeService.js";
import { DungeonService } from "../services/DungeonService.js";
import { MAPS, MapService } from "../services/MapService.js";
import { DEMON_TOWER, demonPortalWorld, TOWER_SMITH_NPC } from "../data/demonTower.js";
import { findPortalNear } from "../data/mapPortals.js";
import { BANDIT_CAMP, banditCampPoint } from "../data/banditCamp.js";
import { MONSTERS } from "../data/monsters.js";
import { METINS } from "../data/metins.js";
import { QUESTS } from "../data/quests.js";
import { audio } from "../audio/Audio.js";
import * as THREE from "three";

export class Game {
  constructor(canvas, ui, net) {
    this.canvas = canvas;
    this.ui = ui;
    this.net = net;
    this.running = false;
    this.profile = null;

    this.renderer = createRenderer(canvas);
    const { scene, overworld, sun, hemi } = createScene();
    this.scene = scene;
    this.sun = sun || null;
    this.hemi = hemi || null;
    this.overworld = overworld || null;
    this.worldTime = DAY_LENGTH * 0.32; // late morning start
    this.huntMarkerRoot = new THREE.Group();
    this.huntMarkerRoot.name = "hunt_markers";
    this.scene.add(this.huntMarkerRoot);
    this.dungeonRoot = null;
    this.towerSmithMesh = null;
    this.towerSmithNpc = null;
    this.valleyRoot = null;
    this.orcRoot = null;
    this.arenaMesh = null;
    this.nearWorldPortal = null;
    this.camera = createCamera();
    this.fx = new FxSystem(scene);
    MapService.set("overworld");

    this.keys = new Set();
    this.mouse = { x: 0, y: 0, down: false, ndc: new THREE.Vector2() };
    this.raycaster = new THREE.Raycaster();
    this.groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    this.aim = new THREE.Vector3();
    this.aimEntity = null;
    this._aimProj = new THREE.Vector3();
    this._aimGround = new THREE.Vector3();
    this._prevHighlight = null;
    // Ground reticule so facing/hits match the cursor
    this.aimMarker = new THREE.Mesh(
      new THREE.RingGeometry(0.35, 0.55, 24),
      new THREE.MeshBasicMaterial({
        color: "#e8d48b",
        transparent: true,
        opacity: 0.85,
        depthWrite: false,
      })
    );
    this.aimMarker.rotation.x = -Math.PI / 2;
    this.aimMarker.position.y = 0.06;
    this.aimMarker.visible = false;
    this.scene.add(this.aimMarker);

    this.local = null;
    this.localMesh = null;
    this.heroCtrl = null;
    this.remotes = new Map(); // id -> { mesh, state, target }
    this.mobs = new Map();
    this.metins = new Map();
    this.bolts = [];
    this.particles = [];
    this.casts = []; // delayed attack / skill resolutions (cast time)
    this.loot = new Map();
    this.character = null;
    this.saveTimer = 0;
    this.onCharacterChange = () => {};
    this.onOpenNpc = () => {};
    this.onOpenTower = () => {};
    this.onPartyChange = () => {};
    this.onDungeonChange = () => {};
    this.nearNpc = null;
    this.nearTower = false;
    this.nearPortal = false;
    this.pendingDeath = false;
    this.npcMeshes = [];
    this.towerMesh = null;
    this._dtFloorMobs = 0;

    // Metin2-style third person: behind + slightly above, not isometric
    this.camDist = 11.5;
    this.camDistTarget = 11.5;
    this.camYaw = Math.PI; // behind character facing +Z
    this.camPitch = 0.42; // ~24° elevation
    this.camOffset = new THREE.Vector3(0, 5, -10);
    this.time = 0;
    this.sendAcc = 0;
    this.worldAcc = 0;
    this.presenceAcc = 0;
    /** @deprecated — split into wild / metin / chief timers */
    this.waveTimer = 0;
    this.wildRespawnTimer = 45;
    this.metinRespawnTimer = 90;
    this.chiefRespawnTimer = 0;
    this._last = 0;
    this._raf = 0;
    this._orbiting = false;
    this._lastOrbitX = 0;
    this._lastOrbitY = 0;

    this._onKeyDown = (e) => {
      const k = e.key.toLowerCase();
      this.keys.add(k);
      if ([" ", "tab"].includes(k) || e.key === "Tab") e.preventDefault();
      if (e.key === "Tab") this.ui.setScoreboard(true);
      if (k === "e" && !this.pendingDeath) {
        if (this.nearPortal) this.useDemonPortal();
        else if (this.nearWorldPortal) this.useWorldPortal(this.nearWorldPortal);
        else if (this.nearTower) this.onOpenTower();
        else if (this.nearNpc) this.onOpenNpc(this.nearNpc);
      }
    };
    this._onKeyUp = (e) => {
      this.keys.delete(e.key.toLowerCase());
      if (e.key === "Tab") this.ui.setScoreboard(false);
    };
    this._onMove = (e) => {
      const rect = canvas.getBoundingClientRect();
      this.mouse.x = e.clientX - rect.left;
      this.mouse.y = e.clientY - rect.top;
      this.mouse.ndc.x = (this.mouse.x / rect.width) * 2 - 1;
      this.mouse.ndc.y = -(this.mouse.y / rect.height) * 2 + 1;
      if (this._orbiting) {
        const dx = e.clientX - this._lastOrbitX;
        const dy = e.clientY - this._lastOrbitY;
        this._lastOrbitX = e.clientX;
        this._lastOrbitY = e.clientY;
        this.camYaw -= dx * 0.0055;
        this.camPitch = clamp(this.camPitch + dy * 0.0035, 0.16, 0.72);
      }
    };
    this._onDown = (e) => {
      if (e.button === 0) {
        if (this.running && !this.pendingDeath) {
          // Click player → context menu (Challenge / Trade / Party) — don't start auto-attack
          if (this._tryClickPlayer()) {
            this.mouse.down = false;
            return;
          }
          this._tryClickTower();
        }
        this.mouse.down = true;
      }
      if (e.button === 1 || e.button === 2) {
        this._orbiting = true;
        this._lastOrbitX = e.clientX;
        this._lastOrbitY = e.clientY;
      }
    };
    this._onUp = (e) => {
      if (e.button === 0) this.mouse.down = false;
      if (e.button === 1 || e.button === 2) this._orbiting = false;
    };
    this._onWheel = (e) => {
      if (!this.running) return;
      e.preventDefault();
      const dir = Math.sign(e.deltaY);
      this.camDistTarget = clamp(this.camDistTarget + dir * 1.6, 5.5, 20);
    };
    this._onResize = () => this.resize();

    // Net hooks (onPeers is wired from main so lobby UI can share it)
    net.onPlayerState = (s) => this.onRemotePlayer(s);
    net.onWorldState = (w) => this.onWorldState(w);
    net.onEvent = (e) => this.onNetEvent(e);
    net.onHostChange = (isHost) => {
      this.ui.setHost(isHost);
      if (isHost) {
        this.ui.toast("You are arena host");
        if (this.running && this.metins.size === 0 && this.mobs.size === 0) this.seedWorld();
      } else {
        this.ui.toast("Host migrated");
      }
    };
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  /** Surface height for current field map (hills). Dungeons / orc stay flat. */
  groundY(x, z, mapId = MapService.currentId) {
    if (mapId !== "overworld" && mapId !== "valley") return 0;
    return fieldHeightAt(x, z, mapId);
  }

  start(profile, character) {
    this.stop(false);
    this.profile = profile;
    this.character = character;
    this.running = true;
    this.time = 0;
    this.clearWorldEntities();
    this.fx?.clear();

    // Never carry a phantom duel / invite into a fresh session
    PvPService.end();
    TradeService.pendingInvite = null;
    this.ui.clearSocialCombat?.();

    const cls = CLASSES[character.classId];
    const d = derivedStats(character);
    QuestService.ensure(character);
    this.pendingDeath = false;
    this.ui.hideDeath?.();
    this.local = {
      id: profile.id,
      name: character.name,
      classId: character.classId,
      color: cls.color,
      x: character.x ?? 0,
      z: character.z ?? 0,
      y: 0,
      rot: 0,
      moving: false,
      hp: d.maxHp,
      maxHp: d.maxHp,
      sp: d.maxSp,
      maxSp: d.maxSp,
      level: character.level,
      atk: d.atk,
      matk: d.matk,
      def: d.def,
      mdef: d.mdef,
      dex: d.dex,
      speed: d.speed,
      crit: d.crit,
      pierce: d.pierce,
      range: cls.range,
      atkCd: 0,
      skillCd: [0, 0, 0, 0, 0, 0], // 0-3 skills, 4-5 potion hotbar
      buffUntil: 0,
      buffMul: 1,
      stealthUntil: 0,
      invulnUntil: 0,
      recoverUntil: 0,
      metins: character.metins || 0,
      kills: character.kills || 0,
      gold: character.gold || 0,
      attacking: 0,
      attackDur: 0,
      mapId: "overworld",
    };

    if (!Array.isArray(this.character.hotbarPotions) || this.character.hotbarPotions.length < 2) {
      this.character.hotbarPotions = ["red_potion", "blue_potion"];
    }
    if (!this.character.skillLevels || typeof this.character.skillLevels !== "object") {
      this.character.skillLevels = {};
    }

    this.localMesh = makePlayerMesh(character.classId, true);
    setNameplate(this.localMesh, character.name, 1, character.level, character.classId);
    this.scene.add(this.localMesh);
    // Snap third-person cam behind the hero on spawn
    this.camYaw = this.local.rot + Math.PI;
    this.camPitch = 0.42;
    this.camDist = 11.5;
    this.camDistTarget = 11.5;
    {
      const flat = Math.cos(this.camPitch) * this.camDist;
      const height = Math.sin(this.camPitch) * this.camDist;
      const gy0 = this.groundY(this.local.x, this.local.z);
      this.camera.position.set(
        this.local.x + Math.sin(this.camYaw) * flat,
        gy0 + height,
        this.local.z + Math.cos(this.camYaw) * flat
      );
      this.camera.lookAt(this.local.x, gy0 + 1.35, this.local.z);
      this.camera.fov = 50;
      this.camera.updateProjectionMatrix();
    }
    this.spawnDemonTower();
    this.spawnNpcs();

    this.bindInput(true);
    this.resize();
    this.ui.bindLocal(this.local, cls);
    this.ui.setRoom("WORLD");
    this.ui.setHost(this.net.isHost);
    this.onCharacterChange(this.character, this.local);

    setTimeout(() => {
      if (this.net.isHost && this.metins.size === 0) this.seedWorld();
    }, 500);

    this._last = performance.now();
    this._raf = requestAnimationFrame((t) => this.loop(t));
  }

  syncDerived() {
    if (!this.character || !this.local) return;
    const d = derivedStats(this.character);
    const hpRatio = this.local.hp / this.local.maxHp;
    const spRatio = this.local.sp / this.local.maxSp;
    this.local.maxHp = d.maxHp;
    this.local.maxSp = d.maxSp;
    this.local.atk = d.atk;
    this.local.matk = d.matk;
    this.local.def = d.def;
    this.local.mdef = d.mdef;
    this.local.dex = d.dex;
    this.local.speed = d.speed;
    this.local.crit = d.crit;
    this.local.pierce = d.pierce;
    this.local.level = this.character.level;
    this.local.hp = Math.max(1, Math.min(d.maxHp, Math.ceil(d.maxHp * hpRatio)));
    this.local.sp = Math.min(d.maxSp, Math.ceil(d.maxSp * spRatio));
    this.local.gold = this.character.gold;
    this.local.metins = this.character.metins;
    this.local.kills = this.character.kills;
    this.onCharacterChange(this.character, this.local);
  }

  persistToCharacter() {
    if (!this.character || !this.local) return;
    this.character.x = this.local.x;
    this.character.z = this.local.z;
    this.character.gold = this.local.gold;
    this.character.metins = this.local.metins;
    this.character.kills = this.local.kills;
    this.character.level = this.local.level;
  }

  spawnNpcs() {
    for (const m of this.npcMeshes) m.parent?.remove(m);
    this.npcMeshes = [];
    for (const npc of NpcService.list) {
      const mapId = npc.mapId || "overworld";
      const parent =
        mapId === "orc_valley"
          ? this.orcRoot || this.scene
          : mapId === "valley"
            ? this.valleyRoot || this.scene
            : this.overworld || this.scene;
      const mesh = makeNpcMesh(npc);
      mesh.position.set(npc.x, 0, npc.z);
      mesh.rotation.y = Math.atan2(-npc.x, -npc.z || 1);
      mesh.userData.mapId = mapId;
      parent.add(mesh);
      this.npcMeshes.push(mesh);
    }
    this.refreshQuestMarkers();
  }

  /** Warp to any field map destination (teleporter NPC). */
  teleportTo(mapId, x, z, label = "destination") {
    if (!this.local || DungeonService.isInside()) return;
    const toMap = mapId || "overworld";
    if (toMap !== MapService.currentId) {
      this.switchMap(toMap);
      if (this.net.isHost) this.seedWorld(toMap);
      this.net.sendEvent({
        type: "map_travel",
        from: this.local.id,
        mapId: toMap,
        x,
        z,
      });
    }
    this.local.x = x;
    this.local.z = z;
    this.local.rot = Math.atan2(-x, -z || 1);
    if (this.localMesh) {
      this.localMesh.position.set(x, 0, z);
      this.localMesh.rotation.y = this.local.rot;
    }
    this.nearNpc = null;
    this.ui.toast?.(`Teleported to ${label}`);
  }

  spawnDemonTower() {
    const ow = this.overworld || this.scene;
    if (this.towerMesh) ow.remove(this.towerMesh);
    if (this.dungeonRoot) this.scene.remove(this.dungeonRoot);
    if (this.valleyRoot) this.scene.remove(this.valleyRoot);
    if (this.orcRoot) this.scene.remove(this.orcRoot);

    // Overworld landmark only
    this.towerMesh = makeDemonTowerMesh();
    this.towerMesh.position.set(DEMON_TOWER.entrance.x, 0, DEMON_TOWER.entrance.z);
    ow.add(this.towerMesh);

    // Separate dungeon map root (own ground + arena)
    this.dungeonRoot = makeDungeonMapRoot();
    this.arenaMesh = this.dungeonRoot.userData.arena;
    const off = DEMON_TOWER.portalOffset;
    if (this.arenaMesh?.userData?.portal) {
      this.arenaMesh.userData.portal.position.set(off.x, 0, off.z);
      this.arenaMesh.userData.portal.visible = false;
    }
    if (this.arenaMesh?.userData?.portalLabel) {
      this.arenaMesh.userData.portalLabel.position.set(off.x, 3.2, off.z);
      this.arenaMesh.userData.portalLabel.visible = false;
    }
    this.scene.add(this.dungeonRoot);

    // Field maps: Seungryong + Orc Isles
    this.valleyRoot = makeValleyMapRoot();
    this.scene.add(this.valleyRoot);
    this.orcRoot = makeOrcMapRoot();
    this.scene.add(this.orcRoot);

    this.switchMap("overworld");
  }

  /** True map switch — field maps + Demon Tower instance */
  switchMap(mapId) {
    const map = MapService.set(mapId);
    if (this.overworld) this.overworld.visible = mapId === "overworld";
    if (this.valleyRoot) this.valleyRoot.visible = mapId === "valley";
    if (this.orcRoot) this.orcRoot.visible = mapId === "orc_valley";
    if (this.dungeonRoot) this.dungeonRoot.visible = mapId === "demon_tower";
    if (this.local) this.local.mapId = mapId;
    if (this.scene) {
      this.scene.background = new THREE.Color(map.background);
      this.scene.fog = new THREE.Fog(map.fog, map.fogNear, map.fogFar);
    }
    this.ui.setMap?.(map.name, mapId);
    this._syncEntityMapVisibility();
    this.refreshHuntMarkers();
    // Hide remotes that are on another map
    for (const [, r] of this.remotes) {
      const mid = r.target?.mapId || r.state?.mapId || "overworld";
      if (r.mesh) r.mesh.visible = mid === mapId && !r.target?.stealth;
    }
  }

  _collectTorchLights() {
    const lights = [];
    for (const root of [this.overworld, this.valleyRoot, this.orcRoot]) {
      if (!root?.visible) continue;
      const list = root.userData?.torchLights;
      if (Array.isArray(list)) lights.push(...list);
    }
    return lights;
  }

  /** Field beacons for active quest hunt zones + turn-in NPCs */
  refreshHuntMarkers() {
    if (!this.huntMarkerRoot) return;
    while (this.huntMarkerRoot.children.length) {
      this.huntMarkerRoot.remove(this.huntMarkerRoot.children[0]);
    }
    const ch = this.character;
    if (!ch) return;
    QuestService.ensure(ch);
    const mid = MapService.currentId;
    const active = QuestService.activeList(ch);
    for (const aq of active) {
      const q = QUESTS.find((x) => x.id === aq.id) || aq;
      const isBio = (q.giver || "quest_elder") === "biologist";
      const color = aq.state === "completed" ? "#7dff9a" : isBio ? "#7dff9a" : "#4db0ff";

      if (aq.state === "completed") {
        const npc = NPCS.find((n) => n.id === (q.giver || "quest_elder"));
        if (npc && (npc.mapId || "overworld") === mid) {
          const beacon = makeHuntBeacon(color, "?");
          beacon.position.set(npc.x, this.groundY(npc.x, npc.z, mid) + 0.1, npc.z);
          this.huntMarkerRoot.add(beacon);
        }
        continue;
      }

      const hunt = questHuntFor(q);
      if (!hunt) continue;
      const huntMap = hunt.allField ? mid : hunt.mapId;
      if (huntMap !== mid && !hunt.allField) continue;
      if (hunt.allField && mid !== "overworld" && mid !== "valley" && mid !== "orc_valley") continue;
      const ring = zoneRing(huntMap || mid, hunt.zone || "mid");
      if (!ring) continue;
      const midR = (ring.minR + ring.maxR) / 2;
      // Two beacons on the hunt ring so the objective is easy to spot
      for (const [ang, glyph] of [
        [0.2, "!"],
        [Math.PI * 0.85, "!"],
      ]) {
        const x = Math.cos(ang) * midR;
        const z = Math.sin(ang) * midR;
        const beacon = makeHuntBeacon(color, glyph);
        beacon.position.set(x, this.groundY(x, z, mid) + 0.1, z);
        this.huntMarkerRoot.add(beacon);
      }
    }
  }

  _syncEntityMapVisibility() {
    const mid = MapService.currentId;
    const inDungeon = MapService.isDungeon();
    for (const [, mob] of this.mobs) {
      if (!mob.mesh) continue;
      if (mob.dungeon) mob.mesh.visible = inDungeon;
      else mob.mesh.visible = !inDungeon && (mob.mapId || "overworld") === mid;
    }
    for (const [, met] of this.metins) {
      if (!met.mesh) continue;
      if (met.dungeon) met.mesh.visible = inDungeon;
      else met.mesh.visible = !inDungeon && (met.mapId || "overworld") === mid;
    }
    for (const [, l] of this.loot) {
      if (!l.mesh) continue;
      l.mesh.visible = !inDungeon && (l.mapId || "overworld") === mid;
    }
  }

  /** Walk into an edge portal — teleport to the other map beside its return portal. */
  useWorldPortal(portal) {
    if (!this.local || !portal || DungeonService.isInside()) return;
    if (this._portalCd && this.time < this._portalCd) return;
    this._portalCd = this.time + 1.6;

    const toMap = portal.toMap;
    const spawn = portal.spawn;
    this.switchMap(toMap);
    this.local.x = spawn.x;
    this.local.z = spawn.z;
    this.local.rot = Math.atan2(-spawn.x, -spawn.z);
    if (this.localMesh) {
      this.localMesh.position.set(spawn.x, 0, spawn.z);
      this.localMesh.rotation.y = this.local.rot;
    }
    this.nearWorldPortal = null;

    if (this.net.isHost) this.seedWorld(toMap);
    this.net.sendEvent({
      type: "map_travel",
      from: this.local.id,
      mapId: toMap,
      x: spawn.x,
      z: spawn.z,
    });
    this.ui.toast(`Entered ${MapService.current.name}`);
    audio.sfx("skill");
  }

  _tryClickTower() {
    if (!this.local || this.pendingDeath) return;
    if (DungeonService.isInside() && DungeonService.run?.cleared) {
      this.raycaster.setFromCamera(this.mouse.ndc, this.camera);
      const portal = this.arenaMesh?.userData?.portal;
      if (portal?.visible) {
        const hits = this.raycaster.intersectObject(portal, true);
        if (hits.length) {
          this.useDemonPortal();
          return;
        }
      }
      return;
    }
    if (!this.towerMesh || DungeonService.isInside()) return;
    this.raycaster.setFromCamera(this.mouse.ndc, this.camera);
    const hits = this.raycaster.intersectObject(this.towerMesh, true);
    if (
      hits.length &&
      dist2(this.local.x, this.local.z, DEMON_TOWER.entrance.x, DEMON_TOWER.entrance.z) < 14
    ) {
      this.onOpenTower();
    }
  }

  /** Local client owns Demon Tower combat while inside (host world sync must not wipe it). */
  isDungeonAuthority() {
    return DungeonService.isInside();
  }

  _setDungeonMapActive(active) {
    this.switchMap(active ? "demon_tower" : "overworld");
  }

  useDemonPortal() {
    if (!DungeonService.isInside()) return;
    if (!DungeonService.run?.cleared) {
      this.ui.toast("Clear the floor first");
      return;
    }
    // Cooldown so standing on the pad does not spam
    if (this._portalCd && this.time < this._portalCd) return;
    this._portalCd = this.time + 1.4;
    if (DungeonService.canAdvance()) {
      this.advanceDemonFloor();
      return;
    }
    if (DungeonService.isFinal()) {
      this.ui.toast("Demon Tower conquered!");
      this.exitDemonTower();
    }
  }

  refreshQuestMarkers() {
    const ch = this.character;
    if (!ch) return;
    QuestService.ensure(ch);
    for (const mesh of this.npcMeshes) {
      const npc = mesh.userData?.npc;
      if (!npc || (npc.role !== "quest" && npc.role !== "biologist")) {
        setQuestMarker(mesh, "");
        continue;
      }
      const mine = QUESTS.filter((q) => (q.giver || "quest_elder") === npc.id);
      let best = "";
      for (const q of mine) {
        if (ch.quests[q.id]?.state === "completed") {
          best = "done";
          break;
        }
      }
      if (!best) {
        for (const q of mine) {
          if (!QuestService.canAccept(ch, q)) continue;
          best = "!";
          break;
        }
      }
      if (!best) {
        for (const q of mine) {
          if (ch.quests[q.id]?.state === "accepted") {
            best = "?";
            break;
          }
        }
      }
      setQuestMarker(mesh, best);
    }
  }

  bindInput(on) {
    const fn = on ? "addEventListener" : "removeEventListener";
    window[fn]("keydown", this._onKeyDown);
    window[fn]("keyup", this._onKeyUp);
    window[fn]("resize", this._onResize);
    this.canvas[fn]("mousemove", this._onMove);
    this.canvas[fn]("mousedown", this._onDown);
    window[fn]("mouseup", this._onUp);
    this.canvas[fn]("wheel", this._onWheel, { passive: false });
    this.canvas[fn]("contextmenu", prevent);
  }

  stop(unbind = true) {
    this.running = false;
    cancelAnimationFrame(this._raf);
    if (unbind) this.bindInput(false);
    this.clearWorldEntities();
    const ow = this.overworld || this.scene;
    for (const m of this.npcMeshes || []) ow.remove(m);
    this.npcMeshes = [];
    if (this.towerMesh) {
      ow.remove(this.towerMesh);
      this.towerMesh = null;
    }
    if (this.dungeonRoot) {
      this.scene.remove(this.dungeonRoot);
      this.dungeonRoot = null;
      this.arenaMesh = null;
    }
    MapService.set("overworld");
    DungeonService.exit();
    if (this.localMesh) {
      this.scene.remove(this.localMesh);
      this.localMesh = null;
    }
    for (const [, r] of this.remotes) this.scene.remove(r.mesh);
    this.remotes.clear();
    this.local = null;
    this.pendingDeath = false;
    PvPService.end();
    TradeService.pendingInvite = null;
    this.ui.clearSocialCombat?.();
    this.ui.hideDeath?.();
  }

  _peerOnline(id) {
    if (!id || id === this.local?.id) return false;
    if (this.remotes.has(id)) return true;
    return !!this.net?.peers?.has?.(id);
  }

  /** Cancel duel/invite if the other player is gone (or you're alone). */
  _pruneDuelAgainstMissingPeers(peerIds) {
    const localId = this.local?.id;
    if (!localId) return;
    const alive = peerIds instanceof Set ? peerIds : new Set(peerIds || []);

    if (PvPService.pendingChallenge) {
      const from = PvPService.pendingChallenge.from;
      if (!from || from === localId || !alive.has(from)) {
        PvPService.pendingChallenge = null;
        this.ui.hideSocialInvite?.();
      }
    }

    if (PvPService.duel) {
      const opp = PvPService.opponentId(localId);
      if (!opp || !alive.has(opp)) {
        PvPService.end();
        this.ui.hideDuelCountdown?.();
        this.ui.hideSocialInvite?.();
        this.onDuelChange?.(null);
        this.ui.toast?.("Duel cancelled — opponent left");
      }
    }
  }

  clearWorldEntities() {
    for (const [, m] of this.mobs) this.scene.remove(m.mesh);
    for (const [, m] of this.metins) this.scene.remove(m.mesh);
    for (const b of this.bolts) this.scene.remove(b.mesh);
    for (const [, l] of this.loot) this.scene.remove(l.mesh);
    this.mobs.clear();
    this.metins.clear();
    this.bolts = [];
    this.loot.clear();
  }

  seedWorld(mapId = MapService.currentId) {
    if (DungeonService.isInside() || !MapService.isField(mapId)) return;
    const existingMobs = [...this.mobs.values()].filter(
      (m) => !m.dungeon && (m.mapId || "overworld") === mapId
    ).length;
    if (existingMobs > 0) return;
    const seed = SpawnService.seedWild(mapId, this.character?.level || 1);
    for (const m of seed.metins) this.spawnMetin(m.x, m.z, m.templateId, mapId);
    for (const m of seed.mobs) this.spawnMob(m.x, m.z, m.templateId, mapId, { camp: !!m.camp });
    if (mapId === MapService.currentId) {
      this.ui.toast(
        mapId === "orc_valley"
          ? "Black orcs hold the isles — the war tower looms"
          : mapId === "valley"
            ? "Bandits roam Seungryong — rogue camp NW · east to Orc Isles"
            : "Dogs & wolves by the walls — east portal to Seungryong"
      );
    }
    this._syncEntityMapVisibility();
  }

  // —— Party ——
  inviteToParty(targetId) {
    if (!this.local) return;
    const err = PartyService.invite(targetId, {
      id: this.local.id,
      name: this.local.name,
      classId: this.local.classId,
      level: this.local.level,
    });
    if (err) {
      this.ui.toast(err);
      return;
    }
    this.net.sendEvent({
      type: "party_invite",
      from: this.local.id,
      fromName: this.local.name,
      to: targetId,
      party: PartyService.party,
    });
    this.ui.toast("Party invite sent");
    this.onPartyChange(PartyService.party);
  }

  acceptPartyInvite() {
    const inv = PartyService.pendingInvite;
    if (!inv || !this.local) return;
    PartyService.applyRemoteParty(inv.party);
    PartyService.addMember({
      id: this.local.id,
      name: this.local.name,
      classId: this.local.classId,
      level: this.local.level,
    });
    this.net.sendEvent({ type: "party_sync", party: PartyService.party, from: this.local.id });
    PartyService.pendingInvite = null;
    this.ui.toast(`Joined ${inv.fromName}'s party`);
    this.onPartyChange(PartyService.party);
  }

  declinePartyInvite() {
    PartyService.pendingInvite = null;
    this.onPartyChange(PartyService.party);
  }

  leaveParty() {
    if (!this.local || !PartyService.party) return;
    const remaining = PartyService.leaveLocal(this.local.id);
    this.net.sendEvent({ type: "party_leave", from: this.local.id, party: remaining });
    this.ui.toast("Left party");
    this.onPartyChange(null);
  }

  // —— Click player / duel / trade ——
  _tryClickPlayer() {
    if (!this.local || DungeonService.isInside()) return false;
    const hit = this._raycastPlayerUnderCursor();
    if (!hit) {
      this.ui.hidePlayerContext?.();
      return false;
    }
    const d = dist2(this.local.x, this.local.z, hit.x, hit.z);
    if (d > 12) {
      this.ui.toast("Get closer to interact");
      return true;
    }
    this.selectedPlayerId = hit.id;
    this.ui.showPlayerContext?.({
      id: hit.id,
      name: hit.name,
      level: hit.level,
      x: this.mouse.x,
      y: this.mouse.y,
    });
    return true;
  }

  _raycastPlayerUnderCursor() {
    const meshes = [];
    const byMesh = new Map();
    for (const [id, r] of this.remotes) {
      const mid = r.target?.mapId || r.state?.mapId || "overworld";
      if (mid !== MapService.currentId) continue;
      if (r.target?.stealth) continue;
      if (!r.mesh?.visible) continue;
      meshes.push(r.mesh);
      byMesh.set(r.mesh, id);
    }
    if (!meshes.length) return null;
    this.raycaster.setFromCamera(this.mouse.ndc, this.camera);
    const hits = this.raycaster.intersectObjects(meshes, true);
    for (const h of hits) {
      if (h.object?.isSprite) continue;
      for (const [mesh, id] of byMesh) {
        if (this._meshContains(mesh, h.object)) {
          const r = this.remotes.get(id);
          const st = r?.target || r?.state || {};
          return {
            id,
            name: st.name || "Player",
            level: st.level || 1,
            x: st.x ?? r.state.x,
            z: st.z ?? r.state.z,
            mesh: r.mesh,
            ref: { id, ...st, hp: st.hp ?? 100 },
          };
        }
      }
    }
    return null;
  }

  _duelOpponentTarget() {
    if (!this.local) return null;
    const oid = PvPService.opponentId(this.local.id);
    if (!oid || !PvPService.isDueling(this.local.id)) return null;
    const r = this.remotes.get(oid);
    if (!r) return null;
    const st = r.target || r.state || {};
    const mid = st.mapId || "overworld";
    if (mid !== MapService.currentId) return null;
    return {
      type: "player",
      ref: { id: oid, hp: st.hp ?? 1, name: st.name || PvPService.opponentName(this.local.id) },
      x: st.x ?? r.state.x,
      z: st.z ?? r.state.z,
    };
  }

  challengePlayer(targetId) {
    if (!this.local) return;
    const err = PvPService.canChallenge(this.local.id, targetId);
    if (err) {
      this.ui.toast(err);
      return;
    }
    this.net.sendEvent({
      type: "duel_invite",
      from: this.local.id,
      fromName: this.local.name,
      to: targetId,
    });
    this.ui.toast("Challenge sent");
    this.ui.hidePlayerContext?.();
  }

  acceptDuel() {
    const inv = PvPService.pendingChallenge;
    if (!inv || !this.local) return;
    if (!this._peerOnline(inv.from)) {
      PvPService.pendingChallenge = null;
      this.ui.hideSocialInvite?.();
      this.ui.toast("Challenger is no longer online");
      return;
    }
    const id = `duel_${Date.now().toString(36)}`;
    this.net.sendEvent({
      type: "duel_accept",
      from: this.local.id,
      fromName: this.local.name,
      to: inv.from,
      toName: inv.fromName,
      duelId: id,
    });
    PvPService.beginCountdown({
      id,
      a: inv.from,
      b: this.local.id,
      aName: inv.fromName,
      bName: this.local.name,
    });
    this.ui.hideSocialInvite?.();
    this.ui.showDuelCountdown?.(5, false);
    this.onDuelChange?.(PvPService.duel);
  }

  declineDuel() {
    const inv = PvPService.pendingChallenge;
    if (inv && this.local) {
      this.net.sendEvent({ type: "duel_decline", from: this.local.id, to: inv.from });
    }
    PvPService.pendingChallenge = null;
    this.ui.hideDuelCountdown?.();
    this.ui.hideSocialInvite?.();
    this.ui.toast("Challenge declined");
  }

  endDuel(reason = "", winnerId = null) {
    if (!PvPService.duel || !this.local) return;
    const duel = PvPService.duel;
    const opp = PvPService.opponentName(this.local.id);
    this.net.sendEvent({
      type: "duel_end",
      from: this.local.id,
      duelId: duel.id,
      a: duel.a,
      b: duel.b,
      winnerId,
      reason,
    });
    PvPService.end();
    this.ui.hideDuelCountdown?.();
    this.onDuelChange?.(null);
    if (reason !== "defeat") {
      if (winnerId === this.local.id) this.ui.toast(`Duel won vs ${opp}!`);
      else if (winnerId) this.ui.toast(`Duel lost vs ${opp}`);
      else this.ui.toast(reason || "Duel ended");
    }
    if (this.local.hp < this.local.maxHp * 0.35) {
      this.local.hp = Math.max(this.local.hp, Math.floor(this.local.maxHp * 0.35));
    }
  }

  inviteTrade(targetId) {
    if (!this.local) return;
    const err = TradeService.canInvite(this.local.id, targetId);
    if (err) {
      this.ui.toast(err);
      return;
    }
    this.net.sendEvent({
      type: "trade_invite",
      from: this.local.id,
      fromName: this.local.name,
      to: targetId,
    });
    this.ui.toast("Trade request sent");
    this.ui.hidePlayerContext?.();
  }

  acceptTrade() {
    const inv = TradeService.pendingInvite;
    if (!inv || !this.local) return;
    const id = `trd_${Date.now().toString(36)}`;
    this.net.sendEvent({
      type: "trade_accept",
      from: this.local.id,
      fromName: this.local.name,
      to: inv.from,
      toName: inv.fromName,
      tradeId: id,
    });
    TradeService.open(id, inv.from, inv.fromName);
    this.ui.hideSocialInvite?.();
    this.onTradeChange?.(TradeService.session);
  }

  declineTrade() {
    const inv = TradeService.pendingInvite;
    if (inv && this.local) {
      this.net.sendEvent({ type: "trade_decline", from: this.local.id, to: inv.from });
    }
    TradeService.pendingInvite = null;
    this.ui.hideSocialInvite?.();
    this.ui.toast("Trade declined");
  }

  tradeOfferItem(uid) {
    if (!this.character || !TradeService.session) return;
    const err = TradeService.offerItem(this.character, uid);
    if (err) {
      this.ui.toast(err);
      return;
    }
    this._broadcastTradeOffer();
    this.onTradeChange?.(TradeService.session);
    this.onCharacterChange?.(this.character, this.local);
  }

  tradeWithdrawItem(uid) {
    if (!this.character || !TradeService.session) return;
    const err = TradeService.withdrawItem(this.character, uid);
    if (err) {
      this.ui.toast(err);
      return;
    }
    this._broadcastTradeOffer();
    this.onTradeChange?.(TradeService.session);
    this.onCharacterChange?.(this.character, this.local);
  }

  tradeSetYang(amount) {
    if (!this.character || !TradeService.session) return;
    const err = TradeService.setYang(this.character, amount);
    if (err) {
      this.ui.toast(err);
      return;
    }
    this._broadcastTradeOffer();
    this.onTradeChange?.(TradeService.session);
  }

  tradeToggleLock() {
    const s = TradeService.session;
    if (!s || !this.local) return;
    const next = !s.myLock;
    TradeService.setLock(true, next);
    this.net.sendEvent({
      type: "trade_lock",
      from: this.local.id,
      tradeId: s.id,
      locked: next,
    });
    this.onTradeChange?.(s);
  }

  tradeConfirm() {
    const s = TradeService.session;
    if (!s || !this.local) return;
    const err = TradeService.setConfirm(true, true);
    if (err) {
      this.ui.toast(err);
      return;
    }
    this.net.sendEvent({ type: "trade_confirm", from: this.local.id, tradeId: s.id });
    this.onTradeChange?.(s);
    if (TradeService.bothConfirmed()) this._finishTrade();
  }

  tradeCancel() {
    const s = TradeService.session;
    if (!this.local) return;
    if (s) {
      this.net.sendEvent({ type: "trade_cancel", from: this.local.id, tradeId: s.id });
    }
    TradeService.cancelRestore(this.character);
    this.onTradeChange?.(null);
    this.onCharacterChange?.(this.character, this.local);
    this.ui.toast("Trade cancelled");
  }

  _broadcastTradeOffer() {
    const s = TradeService.session;
    if (!s || !this.local) return;
    const payload = TradeService.myOfferPayload();
    this.net.sendEvent({
      type: "trade_offer",
      from: this.local.id,
      tradeId: s.id,
      items: payload.items,
      yang: payload.yang,
    });
  }

  _finishTrade() {
    if (!this.character || !TradeService.session) return;
    const err = TradeService.execute(this.character);
    if (err) {
      this.ui.toast(err);
      return;
    }
    this.local.gold = this.character.gold;
    this.onTradeChange?.(null);
    this.onCharacterChange?.(this.character, this.local);
    this.ui.toast("Trade complete");
    this.ui.requestSave?.(false);
  }

  // —— Demon Tower ——
  enterDemonTower({ withParty = false } = {}) {
    if (!this.local) return;
    if (DungeonService.isInside()) {
      this.ui.toast("Already inside the Demon Tower");
      return;
    }
    const gate = DungeonService.canEnter(this.local.id, { withParty });
    if (!gate.ok) {
      this.ui.toast(gate.reason);
      return;
    }

    // Snapshot party before enter (leader pulls everyone on this list)
    const partySnap =
      withParty && PartyService.party
        ? {
            id: PartyService.party.id,
            leaderId: PartyService.party.leaderId,
            members: PartyService.party.members.map((m) => ({ ...m })),
          }
        : null;
    const members = partySnap?.members?.length
      ? partySnap.members
      : [{ id: this.local.id, name: this.local.name }];
    const memberIds = members.map((m) => m.id);
    const partyId = partySnap?.id || null;

    const run = DungeonService.start({
      leaderId: this.local.id,
      partyId,
    });
    this._beginDungeonFloor(1, true);
    const floorCfg = DungeonService.floorConfig(1);

    const payload = {
      type: "dt_enter",
      from: this.local.id,
      instanceId: run.instanceId,
      floor: 1,
      cfg: floorCfg,
      arena: DEMON_TOWER.arena,
      mapId: "demon_tower",
      partyId,
      leaderId: this.local.id,
      members: memberIds,
      party: partySnap,
      // Spawn slots so every client lands on the same pad layout
      slots: members.map((m, i) => ({
        id: m.id,
        ...DungeonService.arenaPos(i, members.length),
      })),
    };

    // Reliable pull — party members must receive this to switch maps
    if (this.net.sendEventReliable) this.net.sendEventReliable(payload);
    else this.net.sendEvent(payload);

    audio.sfx("buff");
    if (withParty && memberIds.length > 1) {
      this.ui.toast(`Pulling party (${memberIds.length}) into Demon Tower`);
    } else {
      this.ui.toast("Switched to Demon Tower map — Floor 1");
    }
    this.onDungeonChange(DungeonService.run);
  }

  /** Called on party members when leader starts a run */
  joinDemonTower(payload) {
    if (!this.local) return;
    if (DungeonService.isInside()) {
      // Already inside same instance — just sync floor
      if (payload.instanceId && DungeonService.run?.instanceId === payload.instanceId) {
        if (payload.floor && payload.floor !== DungeonService.run.floor) {
          this._beginDungeonFloor(payload.floor, false);
          if (payload.cfg) this._spawnDungeonFloor(payload.cfg);
        }
      }
      return;
    }
    DungeonService.start({
      leaderId: payload.leaderId,
      partyId: payload.partyId,
      instanceId: payload.instanceId,
    });
    if (payload.party) PartyService.applyRemoteParty(payload.party);

    this._beginDungeonFloor(payload.floor || 1, false);

    // Land on assigned party slot if provided
    const slot = (payload.slots || []).find((s) => s.id === this.local.id);
    if (slot) {
      this.local.x = slot.x;
      this.local.z = slot.z;
    }
    this.local.mapId = "demon_tower";

    if (payload.cfg) this._spawnDungeonFloor(payload.cfg);
    // Immediate pose sync so leader sees you on the dungeon map
    this.net.sendPlayer?.({
      id: this.local.id,
      name: this.local.name,
      classId: this.local.classId,
      x: this.local.x,
      z: this.local.z,
      rot: this.local.rot || 0,
      hp: this.local.hp,
      maxHp: this.local.maxHp,
      level: this.local.level,
      mapId: "demon_tower",
      t: this.time,
    });
    this.ui.toast(`Party warped to Demon Tower — Floor ${payload.floor || 1}`);
    this.onDungeonChange(DungeonService.run);
    this.onPartyChange(PartyService.party);
  }

  /** True if this local player should be pulled by a dt_enter payload */
  _shouldJoinDemonEnter(e) {
    if (!this.local || !e) return false;
    if ((e.members || []).includes(this.local.id)) return true;
    if (e.party?.members?.some((m) => m.id === this.local.id)) return true;
    if (e.partyId && PartyService.party?.id === e.partyId && PartyService.isInParty(this.local.id)) {
      return true;
    }
    return false;
  }

  _beginDungeonFloor(floor, isLeader) {
    const cfg = DungeonService.setFloor(floor);
    this._clearDungeonMobs();
    // Clear wild entities while inside (local instance view)
    for (const [id, m] of [...this.mobs]) {
      if (!m.dungeon) {
        this.scene.remove(m.mesh);
        this.mobs.delete(id);
      }
    }
    for (const [id, m] of [...this.metins]) {
      this.scene.remove(m.mesh);
      this.metins.delete(id);
    }
    this._setDungeonMapActive(true);
    if (this.arenaMesh?.userData?.portal) this.arenaMesh.userData.portal.visible = false;
    if (this.arenaMesh?.userData?.portalLabel) this.arenaMesh.userData.portalLabel.visible = false;

    // Teleport whole party onto the dungeon map pad
    const members =
      (DungeonService.run?.partyId && PartyService.party?.members) ||
      PartyService.party?.members ||
      [{ id: this.local.id }];
    const idx = Math.max(0, members.findIndex((m) => m.id === this.local.id));
    const pos = DungeonService.arenaPos(idx < 0 ? 0 : idx, Math.max(1, members.length));
    this.local.x = pos.x;
    this.local.z = pos.z;
    this.local.invulnUntil = this.time + 1.4;
    this._portalCd = this.time + 0.8;

    // Leader (or solo) spawns the floor; party followers wait for dt_floor / payload.cfg
    if (isLeader) {
      this._spawnDungeonFloor(cfg);
      this.net.sendEvent({
        type: "dt_floor",
        from: this.local.id,
        instanceId: DungeonService.run.instanceId,
        floor,
        cfg,
        arena: DEMON_TOWER.arena,
      });
    }
    this.onDungeonChange(DungeonService.run);
  }

  _spawnDungeonFloor(cfg) {
    this._removeTowerSmith();
    const a = DEMON_TOWER.arena;
    let spawned = 0;
    const floorHp = cfg.hpMul || 1 + (cfg.floor - 1) * 0.2;
    for (const row of cfg.mobs || []) {
      for (let i = 0; i < row.n; i++) {
        const ang = Math.random() * Math.PI * 2;
        const r = 4 + Math.random() * 7;
        const id = this.spawnMob(a.x + Math.cos(ang) * r, a.z + Math.sin(ang) * r, row.id, "demon_tower");
        const mob = this.mobs.get(id);
        if (mob) {
          mob.dungeon = true;
          mob.mapId = "demon_tower";
          if (mob.mesh) mob.mesh.visible = true;
          mob.hp = Math.floor(mob.hp * floorHp);
          mob.maxHp = mob.hp;
          spawned++;
        }
      }
    }
    if (cfg.boss) {
      const id = this.spawnMob(a.x, a.z + 3, cfg.boss.id, "demon_tower");
      const mob = this.mobs.get(id);
      if (mob) {
        mob.dungeon = true;
        mob.boss = true;
        mob.mapId = "demon_tower";
        if (mob.mesh) mob.mesh.visible = true;
        mob.hp = Math.floor(mob.hp * (cfg.boss.hpMul || 2));
        mob.maxHp = mob.hp;
        mob.atk = Math.floor(mob.atk * (cfg.boss.atkMul || 1.4));
        spawned++;
      }
    }
    // Floor 7 crucible — ring of Metin stones
    for (const row of cfg.metins || []) {
      const n = row.n || 6;
      for (let i = 0; i < n; i++) {
        const ang = (i / n) * Math.PI * 2 + Math.PI / n;
        const r = 6.2;
        const id = this.spawnMetin(
          a.x + Math.cos(ang) * r,
          a.z + Math.sin(ang) * r,
          row.id || "tower",
          "demon_tower",
          { dungeon: true, force: true, hpMul: 1.15 }
        );
        const met = this.metins.get(id);
        if (met) {
          met.dungeon = true;
          if (met.mesh) met.mesh.visible = true;
          spawned++;
        }
      }
    }
    this._dtFloorMobs = spawned;
    if (DungeonService.run) DungeonService.run.cleared = spawned === 0;
  }

  _clearDungeonMobs() {
    for (const [id, m] of [...this.mobs]) {
      if (m.dungeon) {
        this.scene.remove(m.mesh);
        this.mobs.delete(id);
      }
    }
    for (const [id, m] of [...this.metins]) {
      if (m.dungeon) {
        this.scene.remove(m.mesh);
        this.metins.delete(id);
      }
    }
    this._removeTowerSmith();
    this._dtFloorMobs = 0;
  }

  _spawnTowerSmith() {
    if (this.towerSmithMesh || !this.dungeonRoot) return;
    const npc = {
      ...TOWER_SMITH_NPC,
      x: DEMON_TOWER.smithPos?.x ?? TOWER_SMITH_NPC.x,
      z: DEMON_TOWER.smithPos?.z ?? TOWER_SMITH_NPC.z,
    };
    this.towerSmithNpc = npc;
    const mesh = makeNpcMesh(npc);
    mesh.position.set(npc.x, 0, npc.z);
    mesh.userData.npc = npc;
    mesh.visible = true;
    this.dungeonRoot.add(mesh);
    this.towerSmithMesh = mesh;
    const members =
      PartyService.party?.members?.map((m) => m.id) ||
      (this.local ? [this.local.id] : []);
    DungeonService.enableSmith(members);
    if (this.local) DungeonService.smithUsesLeft(this.local.id);
    this.ui.toast("Infernal Blacksmith appears — 3 blessed upgrades each");
    this.net.sendEvent({
      type: "dt_smith",
      from: this.local?.id,
      instanceId: DungeonService.run?.instanceId,
      members,
    });
  }

  _removeTowerSmith() {
    if (this.towerSmithMesh) {
      this.towerSmithMesh.parent?.remove(this.towerSmithMesh);
      this.towerSmithMesh = null;
    }
    this.towerSmithNpc = null;
  }

  _checkDungeonClear() {
    if (!DungeonService.run || DungeonService.run.cleared) return;
    let alive = 0;
    for (const [, m] of this.mobs) if (m.dungeon && m.hp > 0) alive++;
    for (const [, m] of this.metins) if (m.dungeon && m.hp > 0) alive++;
    if (alive === 0) {
      DungeonService.markCleared();
      const cfg = DungeonService.floorConfig(DungeonService.run.floor);
      if (this.local && cfg) {
        this.local.gold += cfg.yang;
        this.character.gold = this.local.gold;
        applyLevelUps(this.character, cfg.xp);
        this.syncDerived();
        this.ui.toast(`Floor ${cfg.floor} cleared! +${cfg.yang} Yang`);
        audio.sfx("level");
      }
      if (cfg?.smith || DungeonService.isFinal()) {
        this._spawnTowerSmith();
      }
      this.onDungeonChange(DungeonService.run);
      this.net.sendEvent({
        type: "dt_cleared",
        from: this.local?.id,
        instanceId: DungeonService.run.instanceId,
        floor: DungeonService.run.floor,
        smith: !!(cfg?.smith || DungeonService.isFinal()),
      });
    }
  }

  advanceDemonFloor() {
    if (!DungeonService.canAdvance()) {
      if (DungeonService.isFinal() && DungeonService.run?.cleared) {
        this.ui.toast("Demon Tower conquered!");
        this.exitDemonTower();
        return;
      }
      this.ui.toast("Clear the floor first");
      return;
    }
    const next = DungeonService.run.floor + 1;
    this._beginDungeonFloor(next, true);
    const cfg = DungeonService.floorConfig(next);
    const members = PartyService.party?.members || [{ id: this.local.id }];
    const payload = {
      type: "dt_advance",
      from: this.local.id,
      instanceId: DungeonService.run.instanceId,
      floor: next,
      cfg,
      arena: DEMON_TOWER.arena,
      mapId: "demon_tower",
      party: PartyService.party,
      members: members.map((m) => m.id),
      slots: members.map((m, i) => ({
        id: m.id,
        ...DungeonService.arenaPos(i, members.length),
      })),
    };
    if (this.net.sendEventReliable) this.net.sendEventReliable(payload);
    else this.net.sendEvent(payload);
    this.ui.toast(`Portal — Floor ${next}`);
  }

  exitDemonTower() {
    if (!DungeonService.isInside()) return;
    this._clearDungeonMobs();
    DungeonService.exit();
    this.nearPortal = false;
    if (this.arenaMesh?.userData?.portal) this.arenaMesh.userData.portal.visible = false;
    if (this.arenaMesh?.userData?.portalLabel) this.arenaMesh.userData.portalLabel.visible = false;
    this._setDungeonMapActive(false);
    // Whole party → Shinsoo plaza; tower instance resets
    const exit = DEMON_TOWER.exitCity || { x: 0, z: 0 };
    this.local.x = exit.x;
    this.local.z = exit.z;
    this.local.mapId = "overworld";
    this.local.invulnUntil = this.time + 2;
    const members = PartyService.memberIds();
    if (!members.includes(this.local.id)) members.push(this.local.id);
    const exitPayload = {
      type: "dt_exit",
      from: this.local.id,
      members,
      mapId: "overworld",
      exit: { x: exit.x, z: exit.z },
      reset: true,
    };
    if (this.net.sendEventReliable) this.net.sendEventReliable(exitPayload);
    else this.net.sendEvent(exitPayload);
    this.ui.toast(
      PartyService.size() > 1
        ? "Demon Tower cleared — party returned to Shinsoo"
        : "Demon Tower cleared — returned to Shinsoo"
    );
    this.onDungeonChange(null);
    if (this.net.isHost) setTimeout(() => this.seedWorld("overworld"), 400);
  }

  /** Idle pulse / spin for squat Metin stones */
  _animateMetin(m, dt) {
    const ud = m.mesh?.userData;
    if (!ud?.crystal) return;
    const baseY = ud.crystalBaseY ?? 0.62;
    const bob = Math.sin(m.pulse) * 0.05;
    ud.crystal.rotation.y += dt * 1.1;
    ud.crystal.position.y = baseY + bob;
    if (ud.shard) {
      ud.shard.rotation.y -= dt * 1.8;
      ud.shard.rotation.z = Math.sin(m.pulse * 1.3) * 0.25;
    }
    if (ud.runes) ud.runes.rotation.z += dt * 0.9;
    if (ud.nucleus) {
      const s = 0.9 + Math.sin(m.pulse * 2.2) * 0.18;
      ud.nucleus.scale.setScalar(s);
    }
    if (ud.light) {
      ud.light.intensity = 1.15 + Math.sin(m.pulse * 2) * 0.35;
      ud.light.position.y = baseY + bob;
    }
    if (ud.glowDisc?.material) {
      ud.glowDisc.material.opacity = 0.16 + Math.sin(m.pulse * 1.6) * 0.08;
    }
    if (ud.glowRing?.material) {
      ud.glowRing.material.opacity = 0.45 + Math.sin(m.pulse * 1.6) * 0.12;
      ud.glowRing.scale.setScalar(0.95 + Math.sin(m.pulse) * 0.06);
    }
  }

  spawnMetin(x, z, templateIdOrTier = "battle", mapId = MapService.currentId, opts = {}) {
    let tmpl =
      typeof templateIdOrTier === "number"
        ? Object.values(METINS).find((t) => t.tier === templateIdOrTier) || METINS.battle
        : METINS[templateIdOrTier] || SpawnService.pickMetinTemplate(mapId);
    // Enforce map tier — never place a wrong-band stone (unless forced / dungeon)
    if (!opts.force && tmpl.maps && !tmpl.maps.includes(mapId)) {
      const fallback = SpawnService.pickMetinTemplate(mapId);
      return this.spawnMetin(x, z, fallback.id, mapId, opts);
    }
    const id = uid("met");
    const mesh = makeMetinMesh(tmpl.tier, tmpl.color);
    mesh.position.set(x, this.groundY(x, z, mapId), z);
    const dungeon = !!opts.dungeon || mapId === "demon_tower";
    mesh.visible = dungeon ? MapService.isDungeon() : mapId === MapService.currentId && !MapService.isDungeon();
    this.scene.add(mesh);
    this.metins.set(id, {
      id,
      x,
      z,
      tier: tmpl.tier,
      templateId: tmpl.id,
      name: tmpl.name,
      level: tmpl.level,
      dropTable: tmpl.drop_table,
      hp: Math.floor(tmpl.hp * (opts.hpMul || 1)),
      maxHp: Math.floor(tmpl.hp * (opts.hpMul || 1)),
      mesh,
      pulse: rand(0, 10),
      spawnT: dungeon ? 9999 : 3,
      wave: dungeon ? 0 : tmpl.wave || 3,
      mapId,
      dungeon,
    });
    return id;
  }

  _playersOnMap(players, mapId) {
    return players.filter((p) => (p.mapId || "overworld") === mapId).length;
  }

  /** Spawn a tight group of 3 wild mobs (not camp, not from metin) */
  _spawnWildGroup(mapId, level) {
    const zones = ["near", "mid", "edge"];
    const zone = zones[(Math.random() * zones.length) | 0];
    const base = SpawnService.pointInZone(mapId, zone);
    const kind = SpawnService.pickMobForZone(mapId, zone, level).id;
    for (let i = 0; i < 3; i++) {
      const ang = (i / 3) * Math.PI * 2 + Math.random() * 0.4;
      const r = 1.2 + Math.random() * 1.8;
      let x = base.x + Math.cos(ang) * r;
      let z = base.z + Math.sin(ang) * r;
      if (mapId === "orc_valley") {
        const land = clampToOrcLand(x, z);
        x = land.x;
        z = land.z;
      }
      this.spawnMob(x, z, kind, mapId, { fromMetin: false });
    }
  }

  /** Rogue Chief returns with 4 supporting bandits */
  _respawnRogueChief(playerCount) {
    const p = banditCampPoint(3, 8);
    this.spawnMob(p.x, p.z, "rogue_chief", BANDIT_CAMP.mapId, { camp: true, boss: true });
    for (let i = 0; i < BANDIT_CAMP.supportOnBoss; i++) {
      const s = banditCampPoint(5, BANDIT_CAMP.r - 2);
      this.spawnMob(s.x, s.z, Math.random() < 0.35 ? "soldier" : "bandit", BANDIT_CAMP.mapId, {
        camp: true,
      });
    }
    this.chiefRespawnTimer = 0;
    if (MapService.is("valley")) {
      this.ui.toast("The Rogue Chief returns with reinforcements");
    }
  }

  spawnMob(x, z, kind = "wolf", mapId = MapService.currentId, opts = {}) {
    const tmpl = MONSTERS[kind] || MONSTERS.wolf;
    const id = uid("mob");
    const mesh = makeMobMesh(tmpl.id || tmpl.kind || kind);
    mesh.position.set(x, this.groundY(x, z, mapId), z);
    mesh.visible = !MapService.isDungeon() && mapId === MapService.currentId;
    this.scene.add(mesh);
    this.mobs.set(id, {
      id,
      kind: tmpl.kind || kind,
      templateId: tmpl.id,
      x,
      z,
      homeX: x,
      homeZ: z,
      hp: tmpl.hp,
      maxHp: tmpl.hp,
      speed: tmpl.speed,
      atk: tmpl.atk,
      def: tmpl.def || 0,
      aggro: tmpl.aggro ?? 16,
      leash: tmpl.leash ?? 28,
      dropTable: tmpl.drop_table,
      atkT: rand(0.5, 1.2),
      mesh,
      targetId: null,
      mapId,
      camp: !!opts.camp,
      boss: !!opts.boss || tmpl.rank === "boss",
      fromMetin: !!opts.fromMetin,
    });
    return id;
  }

  _entityOnCurrentMap(ent) {
    if (!ent) return false;
    if (ent.dungeon) return MapService.isDungeon();
    return !MapService.isDungeon() && (ent.mapId || "overworld") === MapService.currentId;
  }

  loop(now) {
    if (!this.running) return;
    const dt = Math.min(0.05, (now - this._last) / 1000);
    this._last = now;
    this.time += dt;
    this.worldTime += dt;
    this.update(dt);
    this.renderer.render(this.scene, this.camera);
    this._raf = requestAnimationFrame((t) => this.loop(t));
  }

  updateAim() {
    // Face the ground point under the cursor — never snap facing onto a nearby mob
    this.raycaster.setFromCamera(this.mouse.ndc, this.camera);
    if (this.raycaster.ray.intersectPlane(this.groundPlane, this._aimGround)) {
      this.aim.copy(this._aimGround);
    }
    if (this.aimMarker) {
      this.aimMarker.visible = !!this.local && !this.pendingDeath;
      this.aimMarker.position.x = this.aim.x;
      this.aimMarker.position.z = this.aim.z;
    }
    this.aimEntity = this._pickEnemyAtCursor();
    this._updateAimHighlight();
  }

  /** Enemy the cursor is actually on / pointing at (mesh hit, else closest to ground aim). */
  _pickEnemyAtCursor() {
    const meshHit = this._raycastEnemyUnderCursor();
    if (meshHit) return meshHit;

    // Closest enemy to the ground aim point (must be near the reticule — not screen soft-lock)
    const aimX = this.aim.x;
    const aimZ = this.aim.z;
    let best = null;
    let bestD = 2.15; // world units from cursor ground point

    const consider = (type, ref, x, z, pad) => {
      if (!this._entityOnCurrentMap(ref) || ref.hp <= 0) return;
      const dAim = dist2(aimX, aimZ, x, z);
      if (dAim > bestD + pad) return;
      if (dAim < bestD) {
        bestD = dAim;
        best = { type, ref, x, z };
      }
    };

    for (const [, m] of this.mobs) consider("mob", m, m.x, m.z, 0.15);
    for (const [, m] of this.metins) {
      if (DungeonService.isInside() && !m.dungeon) continue;
      if (!DungeonService.isInside() && m.dungeon) continue;
      consider("metin", m, m.x, m.z, 0.55);
    }
    const opp = this._duelOpponentTarget();
    if (opp) consider("player", opp.ref, opp.x, opp.z, 0.35);
    return best;
  }

  _raycastEnemyUnderCursor() {
    const meshes = [];
    for (const [, m] of this.mobs) {
      if (m.hp > 0 && m.mesh?.visible && this._entityOnCurrentMap(m)) meshes.push(m.mesh);
    }
    for (const [, m] of this.metins) {
      if (m.hp > 0 && m.mesh?.visible && this._entityOnCurrentMap(m)) meshes.push(m.mesh);
    }
    const duelOpp = this._duelOpponentTarget();
    if (duelOpp) {
      const r = this.remotes.get(duelOpp.ref.id);
      if (r?.mesh?.visible) meshes.push(r.mesh);
    }
    if (!meshes.length) return null;
    this.raycaster.setFromCamera(this.mouse.ndc, this.camera);
    const hits = this.raycaster.intersectObjects(meshes, true);
    for (const h of hits) {
      if (h.object?.isSprite) continue;
      if (duelOpp) {
        const r = this.remotes.get(duelOpp.ref.id);
        if (r && this._meshContains(r.mesh, h.object)) return duelOpp;
      }
      for (const [, m] of this.mobs) {
        if (this._meshContains(m.mesh, h.object)) {
          return { type: "mob", ref: m, x: m.x, z: m.z };
        }
      }
      for (const [, m] of this.metins) {
        if (this._meshContains(m.mesh, h.object)) {
          return { type: "metin", ref: m, x: m.x, z: m.z };
        }
      }
    }
    return null;
  }

  _updateAimHighlight() {
    let nextMesh = null;
    if (this.aimEntity?.type === "player") {
      nextMesh = this.remotes.get(this.aimEntity.ref?.id)?.mesh || null;
    } else if (this.aimEntity?.ref?.mesh) {
      nextMesh = this.aimEntity.ref.mesh;
    }
    if (this._prevHighlightMesh && this._prevHighlightMesh !== nextMesh) {
      this._setMeshHighlight(this._prevHighlightMesh, false);
    }
    if (nextMesh) this._setMeshHighlight(nextMesh, true);
    this._prevHighlightMesh = nextMesh;
  }

  _setMeshHighlight(mesh, on) {
    if (!mesh) return;
    mesh.traverse((o) => {
      if (!o.isMesh || !o.material || o.material.opacity < 1) return;
      if (on) {
        if (o.userData._hiEmissive == null) {
          o.userData._hiEmissive = o.material.emissive?.getHex?.() ?? 0;
          o.userData._hiIntensity = o.material.emissiveIntensity ?? 0;
        }
        o.material.emissive?.setHex?.(0xffcc66);
        o.material.emissiveIntensity = 0.35;
      } else if (o.userData._hiEmissive != null) {
        o.material.emissive?.setHex?.(o.userData._hiEmissive);
        o.material.emissiveIntensity = o.userData._hiIntensity ?? 0;
        delete o.userData._hiEmissive;
        delete o.userData._hiIntensity;
      }
    });
  }

  _meshContains(root, node) {
    if (!root || !node) return false;
    let o = node;
    while (o) {
      if (o === root) return true;
      o = o.parent;
    }
    return false;
  }

  /**
   * Enemy under / at the cursor if in reach.
   * Facing always uses ground aim — this only chooses who takes the hit.
   */
  pickAimedTarget(p, range) {
    // Fresh pick at attack time (cursor may have moved)
    const aimed = this._pickEnemyAtCursor();
    this.aimEntity = aimed;
    if (!aimed) return null;
    const pad = aimed.type === "metin" ? 1.6 : 1.1;
    const d = dist2(p.x, p.z, aimed.x, aimed.z);
    if (d <= range + pad) return aimed;

    // Out of reach of reticule target — allow a single enemy in a tight cone toward cursor
    const face = Math.atan2(this.aim.x - p.x, this.aim.z - p.z);
    let best = null;
    let bestD = range + pad;
    const consider = (type, ref, x, z, extra) => {
      if (!this._entityOnCurrentMap(ref) || ref.hp <= 0) return;
      const dPlayer = dist2(p.x, p.z, x, z);
      if (dPlayer > range + extra) return;
      if (!this.inCone(p.x, p.z, face, x, z, range + extra, 0.28)) return;
      if (dPlayer < bestD) {
        bestD = dPlayer;
        best = { type, ref, x, z };
      }
    };
    for (const [, m] of this.mobs) consider("mob", m, m.x, m.z, 1.0);
    for (const [, m] of this.metins) {
      if (DungeonService.isInside() && !m.dungeon) continue;
      if (!DungeonService.isInside() && m.dungeon) continue;
      consider("metin", m, m.x, m.z, 1.4);
    }
    const opp = this._duelOpponentTarget();
    if (opp) consider("player", opp.ref, opp.x, opp.z, 1.0);
    return best;
  }

  update(dt) {
    const p = this.local;
    if (!p) return;

    // Duel countdown 5 → 0
    if (PvPService.duel?.state === "countdown") {
      const tick = PvPService.tickCountdown(dt);
      if (tick === "start") {
        this.ui.showDuelCountdown?.(0, true);
        this.ui.toast("Fight!");
        audio.sfx("skill");
        this.onDuelChange?.(PvPService.duel);
      } else if (typeof tick === "number") {
        this.ui.showDuelCountdown?.(tick, false);
        audio.sfx("ui");
      } else if (PvPService.duel.countdown === 5 && PvPService.duel.countdownAcc < dt + 0.01) {
        this.ui.showDuelCountdown?.(5, false);
      }
    }

    this.updateAim();

    if (this.pendingDeath) {
      this.casts = [];
      p.recoverUntil = 0;
      p.attacking = 0;
      this.ui.updateHud(p, this.character);
      this.fx?.update(dt);
      return;
    }

    // Timers
    p.atkCd = Math.max(0, p.atkCd - dt);
    p.attacking = Math.max(0, p.attacking - dt);
    for (let i = 0; i < p.skillCd.length; i++) p.skillCd[i] = Math.max(0, p.skillCd[i] - dt);
    p.sp = Math.min(p.maxSp, p.sp + 5 * dt);
    if (this.time > p.buffUntil) p.buffMul = 1;
    this._updateCasts(dt);

    // Move — WASD relative to camera (W = into the world, Metin2-style)
    let ix = 0;
    let iz = 0;
    if (this.keys.has("w") || this.keys.has("arrowup")) iz += 1;
    if (this.keys.has("s") || this.keys.has("arrowdown")) iz -= 1;
    if (this.keys.has("a") || this.keys.has("arrowleft")) ix -= 1;
    if (this.keys.has("d") || this.keys.has("arrowright")) ix += 1;
    const stealth = this.time < p.stealthUntil;
    const castingSkill = this.casts.some((c) => c.kind === "skill");
    const castingBasic = this.casts.some((c) => c.kind === "basic");
    const recovering = this.time < (p.recoverUntil || 0);
    let moveMul = 1;
    if (castingSkill) moveMul = 0.32;
    else if (castingBasic) moveMul = 0.88;
    else if (recovering) moveMul = p.recoverIsBasic ? 0.94 : 0.62;
    const speed = p.speed * p.buffMul * (stealth ? 1.25 : 1) * moveMul;
    if (ix || iz) {
      const len = Math.hypot(ix, iz) || 1;
      ix /= len;
      iz /= len;
      const yaw = this.camYaw;
      const fx = -Math.sin(yaw);
      const fz = -Math.cos(yaw);
      const rx = Math.cos(yaw);
      const rz = -Math.sin(yaw);
      const ox = p.x;
      const oz = p.z;
      p.x += (fx * iz + rx * ix) * speed * dt;
      p.z += (fz * iz + rz * ix) * speed * dt;
      const mapId = MapService.currentId;
      if (mapId === "overworld" || mapId === "valley") {
        const clamped = clampFieldWalk(mapId, p.x, p.z, ox, oz);
        p.x = clamped.x;
        p.z = clamped.z;
      }
      p.moving = Math.hypot(p.x - ox, p.z - oz) > 0.0001;
    } else {
      p.moving = false;
    }
    if (MapService.is("demon_tower")) {
      // Keep players on the dungeon platform
      const a = DEMON_TOWER.arena;
      const dPad = dist2(p.x, p.z, a.x, a.z);
      if (dPad > 15.2) {
        const pull = 15.2 / (dPad || 1);
        p.x = a.x + (p.x - a.x) * pull;
        p.z = a.z + (p.z - a.z) * pull;
      }
    } else {
      const half = MapService.current.half || MAP_HALF;
      p.x = clamp(p.x, -half + 1.2, half - 1.2);
      p.z = clamp(p.z, -half + 1.2, half - 1.2);
      if (MapService.is("orc_valley")) {
        const land = clampToOrcLand(p.x, p.z);
        p.x = land.x;
        p.z = land.z;
      } else if (MapService.is("overworld") || MapService.is("valley")) {
        // If somehow stuck in the river under a bridge, snap onto the deck
        const mid = MapService.currentId;
        if (!isFieldWalkable(mid, p.x, p.z)) {
          const b = bridgeCenter(mid);
          if (b && Math.hypot(p.x - b.x, p.z - b.z) < b.across * 0.7) {
            p.x = b.x;
            p.z = b.z;
          } else {
            const rescued = clampFieldWalk(mid, p.x, p.z, p.x + 0.01, p.z + 0.01);
            // Nudge toward city if still stuck
            if (!isFieldWalkable(mid, rescued.x, rescued.z)) {
              const ang = Math.atan2(-p.x, -p.z);
              for (let s = 1; s <= 12; s++) {
                const nx = p.x + Math.sin(ang) * s * 1.5;
                const nz = p.z + Math.cos(ang) * s * 1.5;
                if (isFieldWalkable(mid, nx, nz)) {
                  p.x = nx;
                  p.z = nz;
                  break;
                }
              }
            } else {
              p.x = rescued.x;
              p.z = rescued.z;
            }
          }
        }
      }
    }
    // Smooth turn toward cursor / locked combat target
    const held = this.casts.find((c) => c.faceAim);
    const wantRot = this._aimFacing(p, held?.targetId, held?.targetKind);
    const turnRate = castingSkill ? 20 : castingBasic || recovering ? 16 : 12;
    p.rot = dampAngle(p.rot, wantRot, turnRate, dt);

    // NPC / tower / portal proximity (NPCs can live on any field map)
    let near =
      MapService.isField() && !DungeonService.isInside()
        ? NpcService.near(p.x, p.z, 3.5, MapService.currentId)[0] || null
        : null;
    // Infernal Blacksmith after floor 7
    if (
      !near &&
      DungeonService.isInside() &&
      DungeonService.run?.smithReady &&
      this.towerSmithNpc &&
      dist2(p.x, p.z, this.towerSmithNpc.x, this.towerSmithNpc.z) < 3.8
    ) {
      near = this.towerSmithNpc;
    }
    this.nearNpc = near;
    this.nearTower =
      MapService.isOverworld() &&
      !DungeonService.isInside() &&
      dist2(p.x, p.z, DEMON_TOWER.entrance.x, DEMON_TOWER.entrance.z) < 7.5;
    const portalPos = demonPortalWorld();
    const portalDist = dist2(p.x, p.z, portalPos.x, portalPos.z);
    this.nearPortal =
      DungeonService.isInside() && !!DungeonService.run?.cleared && portalDist < 2.8;
    this.nearWorldPortal =
      MapService.isField() && !DungeonService.isInside()
        ? findPortalNear(MapService.currentId, p.x, p.z)
        : null;

    // Standing on the portal pad auto-triggers (except final floor — forge first)
    if (this.nearPortal && !DungeonService.isFinal()) {
      this.useDemonPortal();
      this.ui.setNpcPrompt?.({ name: "Portal — ascending…" });
    } else if (this.nearWorldPortal) {
      this.ui.setNpcPrompt?.({ name: `${this.nearWorldPortal.label} — walk in / E` });
      this.useWorldPortal(this.nearWorldPortal);
    } else if (DungeonService.isInside() && DungeonService.run?.cleared && portalDist < 8) {
      this.ui.setNpcPrompt?.({
        name: DungeonService.isFinal()
          ? "Exit to Shinsoo (E) · forge at the Infernal Smith"
          : "Blue portal — walk in / E",
      });
    } else if (near?.towerSmith) {
      const left = DungeonService.smithUsesLeft(p.id);
      this.ui.setNpcPrompt?.({ name: `Infernal Blacksmith — forge (E) · ${left} uses left` });
    } else if (this.nearTower) {
      this.ui.setNpcPrompt?.({ name: "Demon Tower — Enter (E)" });
    } else {
      this.ui.setNpcPrompt?.(near);
    }

    // Pulse edge portal rings + cozy chimney smoke
    for (const root of [this.overworld, this.valleyRoot, this.orcRoot]) {
      if (!root) continue;
      for (const key of ["edgePortal", "edgePortalEast"]) {
        const ep = root.userData?.[key];
        if (ep?.userData?.ring) ep.userData.ring.rotation.z += dt * 1.2;
      }
      if (root.visible) animateWorldSmoke(root, this.time);
    }

    // Demon Tower floor clear check + VFX
    if (DungeonService.isInside()) {
      this._checkDungeonClear();
      if (this.arenaMesh?.userData?.portal) {
        const show = !!DungeonService.run?.cleared;
        this.arenaMesh.userData.portal.visible = show;
        if (this.arenaMesh.userData.portalLabel) this.arenaMesh.userData.portalLabel.visible = show;
        if (show) {
          const ring = this.arenaMesh.userData.portalRing;
          if (ring) ring.rotation.z += dt * 1.8;
          const col = this.arenaMesh.userData.portal.children?.find?.(
            (c) => c.geometry?.type === "TorusGeometry" && c.position.y > 1
          );
          if (col) col.rotation.y += dt * 1.5;
        }
      }
    }

    // Basic attacks: only blocked by an active cast (recover is light — cadence from atkCd)
    // Skills: still blocked through recovery
    const castingAny = this.casts.length > 0;
    const skillBusy = castingAny || (recovering && !p.recoverIsBasic);
    if ((this.mouse.down || this.keys.has(" ")) && p.atkCd <= 0 && !castingAny) {
      this.doAttack();
    }
    for (let i = 0; i < 4; i++) {
      if (this.keys.has(String(i + 1)) && p.skillCd[i] <= 0 && !skillBusy) {
        this.keys.delete(String(i + 1));
        this.castSkill(i);
      }
    }
    for (let i = 0; i < 2; i++) {
      const key = String(i + 5);
      if (this.keys.has(key) && (p.skillCd[4 + i] || 0) <= 0) {
        this.keys.delete(key);
        this.useHotbarPotion(i);
      }
    }
    if (this.keys.has("f")) {
      this.keys.delete("f");
      this.tryPickup();
    }

    // Mesh + animation — smooth elevation so bridges/hills don't pop
    const gy = this.groundY(p.x, p.z);
    if (p.y == null || Number.isNaN(p.y)) p.y = gy;
    const climb = Math.min(1, 14 * dt);
    // Allow faster drop onto deck when stepping onto bridge
    const drop = Math.min(1, 22 * dt);
    p.y += (gy - p.y) * (gy >= p.y ? climb : drop);
    this.localMesh.position.set(p.x, p.y, p.z);
    this.localMesh.rotation.y = p.rot;
    this.aimMarker.position.y = p.y + 0.06;
    this.localMesh.visible = !stealth || Math.sin(this.time * 20) > -0.2;
    setNameplate(this.localMesh, p.name, p.hp / p.maxHp, p.level, p.classId);
    animateCharacter(this.localMesh, dt, {
      moving: p.moving,
      attacking: p.attacking,
      attackDur: p.attackDur,
      speed: p.buffMul,
    });

    // Day / night (field maps) — road torches glow after dusk
    applyDayNight(this.scene, this.sun, this.hemi, this.worldTime, this._collectTorchLights());

    // Stay behind while moving; free orbit when idle / RMB drag
    if (!this._orbiting && p.moving) {
      const behind = p.rot + Math.PI;
      this.camYaw = dampAngle(this.camYaw, behind, 3.4, dt);
    }
    this.camDist += (this.camDistTarget - this.camDist) * Math.min(1, 9 * dt);
    const dist = this.camDist;
    const pitch = this.camPitch;
    const flat = Math.cos(pitch) * dist;
    const height = Math.sin(pitch) * dist;
    this.camOffset.set(
      Math.sin(this.camYaw) * flat,
      height,
      Math.cos(this.camYaw) * flat
    );
    const desired = new THREE.Vector3(p.x, gy, p.z).add(this.camOffset);
    this.camera.position.lerp(desired, 1 - Math.pow(0.0008, dt));
    // Look slightly ahead so the hero sits lower-center like Metin2
    const lookX = p.x - Math.sin(this.camYaw) * 0.55;
    const lookZ = p.z - Math.cos(this.camYaw) * 0.55;
    this.camera.lookAt(lookX, gy + 1.35, lookZ);
    const wantFov = THREE.MathUtils.lerp(54, 42, clamp((20 - dist) / 14, 0, 1));
    this.camera.fov += (wantFov - this.camera.fov) * Math.min(1, 6 * dt);
    this.camera.updateProjectionMatrix();

    // Soft spin on hunt beacons
    for (const m of this.huntMarkerRoot?.children || []) {
      if (m.userData?.spin) m.userData.spin.rotation.z += dt * 1.2;
      m.position.y = this.groundY(m.position.x, m.position.z) + 0.1 + Math.sin(this.time * 2.2) * 0.12;
    }

    // Remotes interpolate (pos + yaw)
    for (const [, r] of this.remotes) {
      const t = r.target;
      if (!t) continue;
      r.state.x += (t.x - r.state.x) * Math.min(1, 14 * dt);
      r.state.z += (t.z - r.state.z) * Math.min(1, 14 * dt);
      r.state.rot = dampAngle(r.state.rot ?? t.rot, t.rot, 12, dt);
      r.state.hp = t.hp;
      r.state.maxHp = t.maxHp || r.state.maxHp || 100;
      const mid = r.target?.mapId || r.state?.mapId || "overworld";
      r.mesh.position.set(r.state.x, this.groundY(r.state.x, r.state.z, mid), r.state.z);
      r.mesh.rotation.y = r.state.rot;
      const sameMap = (t.mapId || "overworld") === MapService.currentId;
      r.mesh.visible = sameMap && !t.stealth;
      setNameplate(r.mesh, t.name || "Player", (t.hp || 0) / (t.maxHp || 100), t.level || 1, t.classId);
      const moving =
        Math.hypot((t.x || 0) - (r._lx ?? t.x), (t.z || 0) - (r._lz ?? t.z)) > 0.02;
      r._lx = t.x;
      r._lz = t.z;
      const atkOn = !!t.attacking;
      const pulse = atkOn && !r._wasAtk;
      r._wasAtk = atkOn;
      animateCharacter(r.mesh, dt, {
        moving: !!t.moving || moving,
        attackPulse: pulse,
        attackDur: t.attackDur || 0.75,
        attacking: 0,
        speed: 1,
      });
    }

    // Host sim — Demon Tower uses local authority while inside
    if (this.isDungeonAuthority()) {
      this.updateDungeonWorld(dt);
    } else if (this.net.isHost) {
      this.updateHostWorld(dt);
      this.worldAcc += dt;
      // ~10 Hz world sync — clients lerp between packets
      if (this.worldAcc >= 0.1) {
        this.worldAcc = 0;
        this.net.sendWorld(this.serializeWorld());
      }
    } else {
      // Clients: lerp mob/metin poses toward host targets (kills teleport stutter)
      for (const [, m] of this.metins) {
        m.pulse = (m.pulse || 0) + dt * 2;
        if (m.tx != null) {
          m.x += (m.tx - m.x) * Math.min(1, 12 * dt);
          m.z += (m.tz - m.z) * Math.min(1, 12 * dt);
          m.mesh.position.set(m.x, this.groundY(m.x, m.z, m.mapId), m.z);
        }
        this._animateMetin(m, dt);
      }
      for (const [, mob] of this.mobs) {
        if (mob.tx != null) {
          const px = mob.x;
          const pz = mob.z;
          mob.x += (mob.tx - mob.x) * Math.min(1, 12 * dt);
          mob.z += (mob.tz - mob.z) * Math.min(1, 12 * dt);
          const dx = mob.x - px;
          const dz = mob.z - pz;
          const moving = Math.hypot(dx, dz) > 0.0008;
          if (moving) mob.mesh.rotation.y = dampAngle(mob.mesh.rotation.y, Math.atan2(dx, dz), 10, dt);
          mob.mesh.position.set(mob.x, this.groundY(mob.x, mob.z, mob.mapId), mob.z);
          animateMob(mob.mesh, dt, moving);
        } else {
          animateMob(mob.mesh, dt, true);
        }
      }
    }

    // Bolts
    for (const b of this.bolts) {
      b.life -= dt;
      b.x += b.vx * dt;
      b.z += b.vz * dt;
      b.mesh.position.set(b.x, 1.1, b.z);
      if (this.net.isHost || b.owner === p.id) this.resolveBolt(b);
    }
    this.bolts = this.bolts.filter((b) => {
      if (b.life <= 0) {
        this.scene.remove(b.mesh);
        return false;
      }
      return true;
    });

    // Net player send
    this.sendAcc += dt;
    // ~12 Hz player poses — smoother remotes with yaw lerp on receivers
    if (this.sendAcc >= 1 / 12) {
      this.sendAcc = 0;
      this.net.sendPlayer({
        id: p.id,
        name: p.name,
        classId: p.classId,
        x: p.x,
        z: p.z,
        rot: p.rot,
        hp: p.hp,
        maxHp: p.maxHp,
        level: p.level,
        metins: p.metins,
        kills: p.kills,
        stealth: stealth,
        attacking: p.attacking > 0,
        attackDur: p.attackDur || 0,
        moving: p.moving,
        mapId: p.mapId || MapService.currentId,
        t: this.time,
      });
    }

    this.presenceAcc += dt;
    if (this.presenceAcc >= 2.5) {
      this.presenceAcc = 0;
      this.net.updatePresence({
        metins: p.metins,
        kills: p.kills,
        level: p.level,
        mapId: p.mapId || MapService.currentId,
        name: p.name,
        classId: p.classId,
        color: p.color,
      });
    }

    this.ui.updateHud(p, this.character);
    this.ui.drawMinimap(p, this.remotes, this.metins, this.mobs);
    this.fx?.update(dt);
    for (const mesh of this.npcMeshes) animateNpc(mesh, dt);
    this.refreshQuestMarkers();
    // Pulse marker on nearest NPC
    for (const mesh of this.npcMeshes) {
      const marker = mesh.userData?.marker;
      if (!marker) continue;
      const isNear = this.nearNpc && mesh.userData.npc?.id === this.nearNpc.id;
      marker.material.opacity = isNear ? 0.75 : 0.4;
      const s = isNear ? 1.15 + Math.sin(this.time * 4) * 0.08 : 1;
      marker.scale.set(s, s, s);
    }

    // Enemy + metin HP bars
    for (const [, mob] of this.mobs) {
      if (!mob.mesh) continue;
      if (!this._entityOnCurrentMap(mob)) {
        if (mob.mesh.userData.hpSprite) mob.mesh.userData.hpSprite.visible = false;
        continue;
      }
      const tmpl = MONSTERS[mob.templateId];
      const label =
        tmpl?.name ||
        (mob.kind === "ork"
          ? "Orc"
          : mob.kind === "elite_ork"
            ? "Orc Capt."
            : mob.templateId === "rogue_chief"
              ? "Rogue Chief"
              : mob.kind === "human" || mob.templateId === "bandit"
                ? "Bandit"
                : mob.templateId === "soldier"
                  ? "Soldier"
                  : "Wolf");
      updateHpBar(mob.mesh, {
        name: label,
        hp: mob.hp,
        maxHp: mob.maxHp,
        level: tmpl?.level || (mob.kind === "ork" ? 12 : 3),
        color: mob.boss || mob.templateId === "rogue_chief" ? "#c43c2e" : "#e23a2e",
      });
      if (mob.mesh.userData.hpSprite) {
        mob.mesh.userData.hpSprite.visible = mob.hp < mob.maxHp * 0.999 || dist2(p.x, p.z, mob.x, mob.z) < 18;
      }
    }
    for (const [, met] of this.metins) {
      if (!met.mesh) continue;
      updateHpBar(met.mesh, {
        name: met.name || "Metin",
        hp: met.hp,
        maxHp: met.maxHp,
        level: met.level || METINS[met.templateId]?.level || met.tier * 10,
        color: "#c45cff",
      });
      if (met.mesh.userData.runes) met.mesh.userData.runes.rotation.z += dt * 0.6;
    }

    this.saveTimer += dt;
    if (this.saveTimer >= 20) {
      this.saveTimer = 0;
      this.persistToCharacter();
      this.ui.requestSave?.(false);
    }

    // bob loot (follow terrain height)
    for (const [, l] of this.loot) {
      l.t = (l.t || 0) + dt;
      l.mesh.position.y = this.groundY(l.x, l.z, l.mapId) + 0.4 + Math.sin(l.t * 3) * 0.12;
      l.mesh.rotation.y += dt * 2;
    }
  }

  updateDungeonWorld(dt) {
    const players = this.allCombatants();
    for (const [, mob] of this.mobs) {
      if (!mob.dungeon) continue;
      mob.atkT -= dt;
      let best = null;
      let bestD = 999;
      for (const pl of players) {
        if (pl.stealth) continue;
        const d = dist2(mob.x, mob.z, pl.x, pl.z);
        if (d < bestD) {
          bestD = d;
          best = pl;
        }
      }
      let moving = false;
      if (best && bestD < 22) {
        const ang = Math.atan2(best.x - mob.x, best.z - mob.z);
        if (bestD > 1.4) {
          mob.x += Math.sin(ang) * mob.speed * dt;
          mob.z += Math.cos(ang) * mob.speed * dt;
          moving = true;
        } else if (mob.atkT <= 0) {
          mob.atkT = 1.1;
          this.applyDamageToPlayer(best.id, mob.atk, "mob");
        }
        mob.mesh.rotation.y = ang;
      }
      // Keep mobs on the arena pad
      const a = DEMON_TOWER.arena;
      const dPad = dist2(mob.x, mob.z, a.x, a.z);
      if (dPad > 14.5) {
        const pull = 14.5 / (dPad || 1);
        mob.x = a.x + (mob.x - a.x) * pull;
        mob.z = a.z + (mob.z - a.z) * pull;
      }
      mob.mesh.position.set(mob.x, 0, mob.z);
      animateMob(mob.mesh, dt, moving);
    }
    for (const [, met] of this.metins) {
      if (!met.dungeon) continue;
      met.pulse = (met.pulse || 0) + dt * 2;
      if (met.mesh?.userData.crystal) this._animateMetin(met, dt);
    }
    for (const [id, m] of [...this.mobs]) {
      if (m.hp <= 0) {
        this.scene.remove(m.mesh);
        this.mobs.delete(id);
      }
    }
    for (const [id, m] of [...this.metins]) {
      if (m.dungeon && m.hp <= 0) {
        this.scene.remove(m.mesh);
        this.metins.delete(id);
      }
    }
    this._checkDungeonClear();
  }

  updateHostWorld(dt) {
    if (DungeonService.isInside()) {
      this.updateDungeonWorld(dt);
      return;
    }

    const players = this.allCombatants();
    const fieldMobs = [...this.mobs.values()].filter((m) => !m.dungeon);
    const fieldMetins = [...this.metins.values()];

    for (const m of fieldMetins) {
      const mid = m.mapId || "overworld";
      m.pulse += dt * 2;
      m.spawnT -= dt;
      if (m.mesh?.userData.crystal && this._entityOnCurrentMap(m)) {
        this._animateMetin(m, dt);
      }
      if (m.spawnT <= 0) {
        m.spawnT = 6;
        const count = fieldMobs.filter((x) => (x.mapId || "overworld") === mid).length;
        const blockedCity = mid !== "orc_valley" && inCity(m.x, m.z);
        if (count < 38 && !blockedCity) {
          const a = rand(0, Math.PI * 2);
          let sx = m.x + Math.cos(a) * 4;
          let sz = m.z + Math.sin(a) * 4;
          if (mid === "orc_valley") {
            const land = clampToOrcLand(sx, sz);
            sx = land.x;
            sz = land.z;
          }
          const level = this.local?.level || 1;
          const kind = SpawnService.pickKindAt(mid, sx, sz, level);
          this.spawnMob(sx, sz, kind, mid, { fromMetin: true });
        }
      }
    }

    for (const mob of fieldMobs) {
      const mid = mob.mapId || "overworld";
      mob.atkT -= dt;
      const aggroR = mob.aggro ?? 16;
      const leashR = mob.leash ?? 28;
      const homeX = mob.homeX ?? mob.x;
      const homeZ = mob.homeZ ?? mob.z;

      let best = null;
      let bestD = 999;
      for (const pl of players) {
        if (pl.stealth) continue;
        if ((pl.mapId || "overworld") !== mid) continue;
        // Mobs ignore players deep in the city (not on Orc Isles)
        if (
          mid !== "orc_valley" &&
          inCity(pl.x, pl.z) &&
          dist2(pl.x, pl.z, 0, 0) < CITY_RADIUS - 3
        ) {
          continue;
        }
        const d = dist2(mob.x, mob.z, pl.x, pl.z);
        if (d < bestD) {
          bestD = d;
          best = pl;
        }
      }

      // Drop chase if past leash from spawn home
      const homeD = dist2(mob.x, mob.z, homeX, homeZ);
      if (best && (bestD > aggroR || homeD > leashR)) {
        best = null;
      }

      let moving = false;
      if (best && bestD < aggroR) {
        mob.targetId = best.id;
        const ang = Math.atan2(best.x - mob.x, best.z - mob.z);
        if (bestD > 1.4) {
          mob.x += Math.sin(ang) * mob.speed * dt;
          mob.z += Math.cos(ang) * mob.speed * dt;
          moving = true;
        } else if (mob.atkT <= 0) {
          mob.atkT = 1.1;
          this.applyDamageToPlayer(best.id, mob.atk, "mob");
        }
        mob.mesh.rotation.y = ang;
      } else if (homeD > 1.2) {
        // Return home when out of combat
        mob.targetId = null;
        const ang = Math.atan2(homeX - mob.x, homeZ - mob.z);
        mob.x += Math.sin(ang) * mob.speed * 0.75 * dt;
        mob.z += Math.cos(ang) * mob.speed * 0.75 * dt;
        mob.mesh.rotation.y = ang;
        moving = true;
      } else {
        mob.targetId = null;
      }

      // Push mobs out if they wander into city core (Shinsoo / Seungryong only)
      if (mid !== "orc_valley") {
        const cd = dist2(mob.x, mob.z, 0, 0);
        if (cd < CITY_RADIUS - 1) {
          const push = (CITY_RADIUS - 1) / (cd || 1);
          mob.x *= push;
          mob.z *= push;
        }
      }

      const half = (MAPS[mid] || MAPS.overworld).half || MAP_HALF;
      mob.x = clamp(mob.x, -half + 1, half - 1);
      mob.z = clamp(mob.z, -half + 1, half - 1);
      if (mid === "orc_valley") {
        const land = clampToOrcLand(mob.x, mob.z);
        mob.x = land.x;
        mob.z = land.z;
      }
      mob.mesh.position.set(mob.x, this.groundY(mob.x, mob.z, mid), mob.z);
      if (this._entityOnCurrentMap(mob)) animateMob(mob.mesh, dt, moving);
    }

    // —— Timed respawns (wild groups / metins / rogue chief) ——
    const activeMaps = new Set(players.map((p) => p.mapId || "overworld"));
    const level = this.local?.level || 1;

    // Wild packs: groups of 3 every 3–4 min (2–3 min if 3+ players on that map)
    this.wildRespawnTimer -= dt;
    if (this.wildRespawnTimer <= 0) {
      let nextWild = 210;
      for (const mid of activeMaps) {
        if (!MapService.isField(mid)) continue;
        const nPlayers = this._playersOnMap(players, mid);
        nextWild = Math.min(nextWild, SpawnService.wildRespawnInterval(nPlayers));
        const mapMobs = fieldMobs.filter(
          (m) => (m.mapId || "overworld") === mid && !m.camp && m.hp > 0
        );
        const cap = SpawnService.wildMobCap(mid);
        if (mapMobs.length >= cap) continue;
        // One group of 3; extra group if sparse or many players
        this._spawnWildGroup(mid, level);
        if (mapMobs.length < cap * 0.55 || nPlayers >= 3) {
          if (mapMobs.length + 3 < cap) this._spawnWildGroup(mid, level);
        }
      }
      this.wildRespawnTimer = nextWild;
    }

    // Rare metin refill (few stones, map-tiered)
    this.metinRespawnTimer -= dt;
    if (this.metinRespawnTimer <= 0) {
      let nextMet = 360;
      for (const mid of activeMaps) {
        if (!MapService.isField(mid)) continue;
        const nPlayers = this._playersOnMap(players, mid);
        nextMet = Math.min(nextMet, SpawnService.metinRespawnInterval(nPlayers));
        const mapMetins = fieldMetins.filter((m) => (m.mapId || "overworld") === mid && m.hp > 0);
        if (mapMetins.length >= SpawnService.metinCap(mid)) continue;
        const p =
          mid === "orc_valley"
            ? SpawnService.pointInZone(mid, "edge")
            : wildPoint(CITY_RADIUS + 10, MAP_HALF - 8);
        this.spawnMetin(p.x, p.z, SpawnService.pickMetinTemplate(mid).id, mid);
        if (mid === MapService.currentId) {
          this.net.sendEvent({
            type: "toast",
            msg: mid === "orc_valley" ? "A Metin rises on the isles" : "A new Metin rises beyond the walls",
            from: this.local.id,
          });
        }
      }
      this.metinRespawnTimer = nextMet;
    }

    // Rogue Chief timer (starts when chief dies)
    if (this.chiefRespawnTimer > 0) {
      this.chiefRespawnTimer -= dt;
      if (this.chiefRespawnTimer <= 0) {
        const nPlayers = this._playersOnMap(players, BANDIT_CAMP.mapId);
        const chiefAlive = fieldMobs.some(
          (m) => m.templateId === "rogue_chief" && m.hp > 0 && m.mapId === BANDIT_CAMP.mapId
        );
        if (!chiefAlive && (activeMaps.has(BANDIT_CAMP.mapId) || MapService.is(BANDIT_CAMP.mapId))) {
          this._respawnRogueChief(nPlayers);
        } else {
          this.chiefRespawnTimer = 0;
        }
      }
    }

    for (const [id, m] of [...this.mobs]) {
      if (m.hp <= 0) {
        if (m.templateId === "rogue_chief" && this.chiefRespawnTimer <= 0) {
          const nPlayers = Math.max(1, this._playersOnMap(players, BANDIT_CAMP.mapId));
          this.chiefRespawnTimer = SpawnService.bossRespawnInterval(nPlayers);
        }
        this.scene.remove(m.mesh);
        this.mobs.delete(id);
      }
    }
    for (const [id, m] of [...this.metins]) {
      if (m.hp <= 0) {
        this.scene.remove(m.mesh);
        this.metins.delete(id);
      }
    }
  }

  allCombatants() {
    const list = [];
    if (this.local) {
      list.push({
        id: this.local.id,
        x: this.local.x,
        z: this.local.z,
        stealth: this.time < this.local.stealthUntil,
        mapId: this.local.mapId || MapService.currentId,
      });
    }
    for (const [id, r] of this.remotes) {
      list.push({
        id,
        x: r.state.x,
        z: r.state.z,
        stealth: !!r.target?.stealth,
        mapId: r.target?.mapId || r.state?.mapId || "overworld",
      });
    }
    return list;
  }

  /** Cast-time windups — damage/VFX resolve when the timer ends. */
  _updateCasts(dt) {
    if (!this.casts.length) return;
    const p = this.local;
    for (const c of this.casts) {
      c.time -= dt;
      if (c.faceAim && p) {
        this.updateAim();
        p.rot = dampAngle(p.rot, this._aimFacing(p, c.targetId, c.targetKind), c.kind === "basic" ? 22 : 20, dt);
      }
    }
    const done = this.casts.filter((c) => c.time <= 0);
    this.casts = this.casts.filter((c) => c.time > 0);
    for (const c of done) {
      this._resolveCast(c);
    }
  }

  /** Facing toward cursor, or locked onto a held target id when still alive. */
  _aimFacing(p, targetId = null, targetKind = null) {
    if (targetId) {
      if (targetKind === "metin") {
        const met = this.metins.get(targetId);
        if (met?.hp > 0) return Math.atan2(met.x - p.x, met.z - p.z);
      } else if (targetKind === "player") {
        const opp = this._duelOpponentTarget();
        if (opp && opp.ref.id === targetId) return Math.atan2(opp.x - p.x, opp.z - p.z);
      } else {
        const mob = this.mobs.get(targetId);
        if (mob?.hp > 0) return Math.atan2(mob.x - p.x, mob.z - p.z);
      }
    }
    // Prefer enemy under cursor, else ground aim point
    const aimed = this.aimEntity || this._pickEnemyAtCursor();
    if (aimed) return Math.atan2(aimed.x - p.x, aimed.z - p.z);
    return Math.atan2(this.aim.x - p.x, this.aim.z - p.z);
  }

  _beginAttackAnim(totalDur) {
    const p = this.local;
    if (!p) return;
    // Short visual window so walk/run resumes between swings
    p.attackDur = Math.max(0.22, totalDur);
    p.attacking = p.attackDur;
  }

  _beginRecover(recover, { basic = false } = {}) {
    const p = this.local;
    if (!p) return;
    const r = Math.max(basic ? 0.1 : 0.2, recover || 0.35);
    p.recoverUntil = this.time + r;
    p.recoverIsBasic = !!basic;
    // Keep attack pose briefly — don't cover the whole recover for basics
    const pose = basic ? Math.min(r, 0.16) : r;
    if (p.attacking < pose) {
      p.attacking = pose;
      p.attackDur = Math.max(p.attackDur || pose, pose);
    }
  }

  _resolveCast(c) {
    const p = this.local;
    if (!p || !c) return;
    if (c.kind === "basic") {
      this._resolveBasicAttack(c);
      return;
    }
    if (c.kind === "skill") {
      this._resolveSkillCast(c);
    }
  }

  doAttack() {
    const p = this.local;
    const cls = CLASSES[p.classId];
    // Don't stack basics; skill recover still blocks via castSkill
    if (this.casts.length) return;
    if (this.time < (p.recoverUntil || 0) && !p.recoverIsBasic) return;

    const ranged = cls.id === "shaman" || p.range > 4;
    // Snappier auto-attack — class cd drives cadence, not windup+recover
    const windup = ranged ? 0.18 : 0.12;
    const recover = ranged ? 0.14 : 0.1;
    p.atkCd = Math.max(cls.cd, windup + 0.04);
    this._beginAttackAnim(windup + recover * 0.7);

    this.updateAim();
    const reach = ranged ? Math.max(p.range, 12) : p.range + 0.95;
    const target = this.pickAimedTarget(p, reach);
    // Snap face to cursor / target — no ground telegraph
    p.rot = this._aimFacing(p, target?.ref?.id, target?.type);

    this.casts.push({
      kind: "basic",
      time: windup,
      duration: windup,
      recover,
      faceAim: true,
      ranged,
      reach,
      targetId: target?.ref?.id || null,
      targetKind: target?.type || null,
    });
  }

  _resolveBasicAttack(c) {
    const p = this.local;
    if (!p) return;
    this._beginRecover(c.recover || 0.12, { basic: true });
    this.updateAim();
    let target = null;
    if (c.targetId) {
      if (c.targetKind === "player") {
        const opp = this._duelOpponentTarget();
        if (opp && opp.ref.id === c.targetId) target = opp;
      } else if (c.targetKind === "metin") {
        const met = this.metins.get(c.targetId);
        if (met?.hp > 0) target = { type: "metin", ref: met, x: met.x, z: met.z };
      } else {
        const mob = this.mobs.get(c.targetId);
        if (mob?.hp > 0) target = { type: "mob", ref: mob, x: mob.x, z: mob.z };
      }
    }
    if (!target) target = this.pickAimedTarget(p, c.reach);
    // Face the hit target (or cursor) at the moment of impact
    p.rot = this._aimFacing(p, target?.ref?.id, target?.type);

    const roll = CombatService.rollHit({
      attacker: p,
      defender: { dex: target ? 1 : 4, def: 2, mdef: 0 },
      skillMul: p.buffMul,
      isMagic: c.ranged,
      forcedHit: !!target,
    });
    const gy = this.groundY(p.x, p.z);
    if (!roll.hit) {
      this.ui.toast("Miss");
      this.fx?.slash(p.x, p.z, p.rot, "#888888", gy);
      return;
    }
    const dmg = roll.damage;
    audio.sfx(roll.kind === "crit" ? "crit" : "slash");

    if (c.ranged) {
      this.fx?.skill("bolt", p.x, p.z, p.rot, "#6ec8ff", 4, null, gy);
      this.fireBolt(p.id, p.x, p.z, p.rot, dmg, p.color, target);
      this.net.sendEvent({
        type: "bolt",
        from: p.id,
        x: p.x,
        z: p.z,
        rot: p.rot,
        dmg,
        color: p.color,
        targetId: target?.ref?.id,
        targetKind: target?.type,
      });
      this.net.sendEvent({ type: "fx", kind: "skill", skill: "bolt", x: p.x, z: p.z, rot: p.rot, color: "#6ec8ff", from: p.id });
      return;
    }

    // Sword swing FX in front of the player (follows facing / cursor + terrain)
    this.fx?.slash(p.x, p.z, p.rot, roll.kind === "crit" ? "#ffe08a" : "#e8d48b", gy);
    this.meleeHitAimed(p, dmg, target);
    // Bleed / dmg numbers come from damageMob / damageMetin
    this.net.sendEvent({
      type: "melee",
      from: p.id,
      x: p.x,
      z: p.z,
      rot: p.rot,
      dmg,
      cone: 0.35,
      range: p.range + 0.95,
      targetId: target?.ref?.id,
      targetKind: target?.type,
    });
    this.net.sendEvent({
      type: "fx",
      kind: "skill",
      skill: "slash",
      x: p.x,
      z: p.z,
      rot: p.rot,
      color: "#e8d48b",
      from: p.id,
    });
  }

  castSkill(i) {
    const p = this.local;
    if (this.casts.length) return;
    if (this.time < (p.recoverUntil || 0) && !p.recoverIsBasic) return;
    if (!SkillService.hasPath(this.character)) {
      this.ui.toast(`Skills unlock at Lv.${SkillService.unlockLevel} — talk to the Skill Master`);
      return;
    }
    const sk = SkillService.scaled(this.character, i);
    if (!sk) return;
    if (p.sp < sk.sp) {
      this.ui.toast("Not enough SP");
      return;
    }
    p.sp -= sk.sp;
    p.skillCd[i] = sk.cd;

    const { cast: castTime, recover } = SkillService.timing(sk);
    this._beginAttackAnim(castTime + recover);
    this.updateAim();
    const skillTarget = this.pickAimedTarget(p, sk.reach || p.range + 1.4);
    p.rot = this._aimFacing(p, skillTarget?.ref?.id, skillTarget?.type);

    const castColor =
      sk.color ||
      (sk.type === "heal"
        ? "#4ecf8a"
        : sk.type === "bolt" || sk.type === "stealth"
          ? "#6ec8ff"
          : sk.type === "drain" || sk.type === "dot"
            ? "#8b3fd4"
            : "#e8d48b");
    // No ground telegraph — release VFX only
    audio.sfx("skill");

    this.casts.push({
      kind: "skill",
      time: castTime,
      duration: castTime,
      recover,
      faceAim: sk.type === "cone" || sk.type === "bolt" || sk.type === "dash",
      skType: sk.type,
      skName: sk.name,
      fxName: sk.fx || sk.type,
      mul: sk.mul || 1,
      isMagic: !!sk.isMagic || (CLASSES[p.classId].id === "shaman" && sk.type !== "heal"),
      color: castColor,
      radius: sk.radius || (sk.type === "burst" ? 3.8 : 4.8),
      reach: sk.reach || p.range + 1.4,
      skillIndex: i,
      targetId: skillTarget?.ref?.id || null,
      targetKind: skillTarget?.type || null,
    });
  }

  _resolveSkillCast(c) {
    const p = this.local;
    if (!p) return;
    this._beginRecover(c.recover || 0.4, { basic: false });
    this.updateAim();
    if (c.faceAim) {
      p.rot = this._aimFacing(p, c.targetId, c.targetKind);
    }

    // Roll damage at release (not at cast start)
    const roll = CombatService.rollHit({
      attacker: p,
      defender: { dex: 2, def: 2, mdef: 0 },
      skillMul: (c.mul || 1) * p.buffMul,
      isMagic: c.isMagic,
      forcedHit: true,
    });
    const dmg = roll.damage;
    const color = c.color || p.color;
    const radius = c.radius || 4.5;
    const fxName = c.fxName || c.skType;
    const gy = this.groundY(p.x, p.z);
    const sfxMap = { heal: "heal", buff: "buff", aoe: "aoe", burst: "aoe", stealth: "skill", drain: "aoe", dot: "aoe" };
    audio.sfx(sfxMap[c.skType] || "skill");

    const sendFx = (skill, extra = {}) => {
      this.net.sendEvent({
        type: "fx",
        kind: "skill",
        skill,
        fx: fxName,
        x: p.x,
        z: p.z,
        rot: p.rot,
        color,
        r: radius,
        from: p.id,
        ...extra,
      });
    };

    switch (c.skType) {
      case "cone": {
        this.fx?.skill("cone", p.x, p.z, p.rot, color, c.reach || 3.4, fxName, gy);
        this.meleeHit(p, dmg, 0.55, c.reach || p.range + 1.2);
        this.net.sendEvent({
          type: "melee",
          from: p.id,
          x: p.x,
          z: p.z,
          rot: p.rot,
          dmg,
          cone: 0.55,
          range: c.reach || p.range + 1.2,
        });
        sendFx(fxName);
        break;
      }
      case "aoe":
        this.fx?.skill("aoe", p.x, p.z, p.rot, color, radius, fxName, gy);
        this.aoeHit(p.x, p.z, radius, dmg, p.id);
        this.net.sendEvent({ type: "aoe", from: p.id, x: p.x, z: p.z, r: radius, dmg });
        sendFx(fxName);
        break;
      case "bolt": {
        const boltReach = Math.max(p.range, 14);
        const boltTarget = this.pickAimedTarget(p, boltReach);
        if (boltTarget) p.rot = Math.atan2(boltTarget.x - p.x, boltTarget.z - p.z);
        this.fx?.skill("bolt", p.x, p.z, p.rot, color, radius, fxName, gy);
        this.fireBolt(p.id, p.x, p.z, p.rot, dmg, color, boltTarget);
        this.net.sendEvent({
          type: "bolt",
          from: p.id,
          x: p.x,
          z: p.z,
          rot: p.rot,
          dmg,
          color,
          targetId: boltTarget?.ref?.id,
          targetKind: boltTarget?.type,
        });
        sendFx(fxName);
        break;
      }
      case "buff": {
        this.fx?.skill("buff", p.x, p.z, p.rot, color, radius, fxName, gy);
        // Swiftness = speed; Strong Body / others = damage
        if (fxName === "swift") {
          p.buffMul = 1.35;
          p.buffUntil = this.time + 10;
          this.ui.toast("Swiftness");
        } else if (fxName === "strongBody") {
          p.buffMul = 1.25;
          p.buffUntil = this.time + 10;
          this.ui.toast("Strong Body");
        } else {
          p.buffMul = 1.45;
          p.buffUntil = this.time + 9;
          this.ui.toast(c.skName || "Power surges");
        }
        sendFx(fxName);
        break;
      }
      case "dash": {
        this.fx?.skill("dash", p.x, p.z, p.rot, color, radius, fxName, gy);
        {
          const ox = p.x;
          const oz = p.z;
          p.x += Math.sin(p.rot) * 7;
          p.z += Math.cos(p.rot) * 7;
          const half = MapService.current.half || MAP_HALF;
          p.x = clamp(p.x, -half + 1.2, half - 1.2);
          p.z = clamp(p.z, -half + 1.2, half - 1.2);
          if (MapService.is("orc_valley")) {
            const land = clampToOrcLand(p.x, p.z);
            p.x = land.x;
            p.z = land.z;
          } else if (MapService.is("overworld") || MapService.is("valley")) {
            const clamped = clampFieldWalk(MapService.currentId, p.x, p.z, ox, oz);
            p.x = clamped.x;
            p.z = clamped.z;
          }
        }
        p.invulnUntil = this.time + 0.35;
        this.aoeHit(p.x, p.z, radius || 2.8, dmg, p.id);
        this.net.sendEvent({ type: "aoe", from: p.id, x: p.x, z: p.z, r: radius || 2.8, dmg });
        sendFx(fxName);
        break;
      }
      case "stealth":
        this.fx?.skill("stealth", p.x, p.z, p.rot, color, radius, fxName, gy);
        p.stealthUntil = this.time + 3.5;
        this.ui.toast("Vanished");
        sendFx(fxName);
        break;
      case "burst":
        this.fx?.skill("burst", p.x, p.z, p.rot, color, radius, fxName, gy);
        this.aoeHit(p.x, p.z, radius, dmg, p.id);
        this.net.sendEvent({ type: "aoe", from: p.id, x: p.x, z: p.z, r: radius, dmg });
        sendFx(fxName);
        break;
      case "dot":
      case "drain":
        this.fx?.skill(c.skType, p.x, p.z, p.rot, color, radius, fxName, gy);
        this.aoeHit(p.x, p.z, radius, dmg, p.id, c.skType === "drain");
        this.net.sendEvent({
          type: "aoe",
          from: p.id,
          x: p.x,
          z: p.z,
          r: radius,
          dmg,
          drain: c.skType === "drain",
        });
        sendFx(fxName);
        break;
      case "heal":
        this.fx?.skill("heal", p.x, p.z, p.rot, color, radius, fxName, gy);
        p.hp = Math.min(p.maxHp, p.hp + p.maxHp * 0.4);
        this.ui.toast("Healed");
        sendFx(fxName);
        break;
      default:
        break;
    }
  }

  /** Apply damage to the cursor-aimed target only (no wide cone spray). */
  meleeHitAimed(p, dmg, target) {
    if (!target) return;
    // PvP is client-applied via pdmg (both peers handle their own takeDamage)
    if (target.type === "player" && target.ref?.id) {
      if (PvPService.isOpponent(p.id, target.ref.id)) {
        this.applyDamageToPlayer(target.ref.id, dmg, "duel");
      }
      return;
    }
    const canApply = this.net.isHost || this.isDungeonAuthority();
    if (canApply) {
      if (target.type === "mob" && target.ref?.hp > 0) this.damageMob(target.ref, dmg, p.id);
      else if (target.type === "metin" && target.ref?.hp > 0) this.damageMetin(target.ref, dmg, p.id);
      return;
    }
    // Non-host: optimistic HP feedback — host world sync reconciles / confirms kills
    if (target.type === "mob" && target.ref?.hp > 0) {
      const applied = Math.max(1, Math.floor(dmg - (target.ref.def || 0) * 0.35));
      target.ref.hp = Math.max(1, target.ref.hp - applied);
      updateHpBar(target.ref.mesh, {
        name: target.ref.name || target.ref.templateId || "Enemy",
        hp: target.ref.hp,
        maxHp: target.ref.maxHp || 1,
      });
    } else if (target.type === "metin" && target.ref?.hp > 0) {
      const applied = Math.max(1, Math.floor(dmg));
      target.ref.hp = Math.max(1, target.ref.hp - applied);
      updateHpBar(target.ref.mesh, {
        name: target.ref.name || "Metin",
        hp: target.ref.hp,
        maxHp: target.ref.maxHp || 1,
        color: "#c45cff",
      });
    }
  }

  meleeHit(p, dmg, cone, range = p.range) {
    const dungeonAuth = this.isDungeonAuthority();
    if (!this.net.isHost && !dungeonAuth) return;
    for (const [, mob] of this.mobs) {
      if (dungeonAuth && !mob.dungeon) continue;
      if (!dungeonAuth && !this._entityOnCurrentMap(mob)) continue;
      if (this.inCone(p.x, p.z, p.rot, mob.x, mob.z, range + 0.6, cone)) {
        this.damageMob(mob, dmg, p.id);
      }
    }
    for (const [, met] of this.metins) {
      if (dungeonAuth && !met.dungeon) continue;
      if (!dungeonAuth && (met.dungeon || !this._entityOnCurrentMap(met))) continue;
      if (this.inCone(p.x, p.z, p.rot, met.x, met.z, range + 1, cone)) {
        this.damageMetin(met, dmg, p.id);
      }
    }
  }

  aoeHit(x, z, r, dmg, fromId, drain = false) {
    // Duel opponent takes AoE from the local attacker
    if (fromId === this.local?.id) {
      const opp = this._duelOpponentTarget();
      if (opp && dist2(x, z, opp.x, opp.z) <= r) {
        this.applyDamageToPlayer(opp.ref.id, dmg, "duel");
      }
    }
    const dungeonAuth = this.isDungeonAuthority();
    if (!this.net.isHost && !dungeonAuth) return;
    let healed = 0;
    for (const [, mob] of this.mobs) {
      if (dungeonAuth && !mob.dungeon) continue;
      if (!dungeonAuth && !this._entityOnCurrentMap(mob)) continue;
      if (dist2(x, z, mob.x, mob.z) <= r) {
        this.damageMob(mob, dmg, fromId);
        healed += dmg * 0.2;
      }
    }
    for (const [, met] of this.metins) {
      if (dungeonAuth && !met.dungeon) continue;
      if (!dungeonAuth && (met.dungeon || !this._entityOnCurrentMap(met))) continue;
      if (dist2(x, z, met.x, met.z) <= r) {
        this.damageMetin(met, dmg, fromId);
        healed += dmg * 0.15;
      }
    }
    if (drain && fromId === this.local?.id) {
      this.local.hp = Math.min(this.local.maxHp, this.local.hp + healed);
    }
  }

  inCone(px, pz, rot, tx, tz, range, cone) {
    const d = dist2(px, pz, tx, tz);
    if (d > range) return false;
    const ang = Math.atan2(tx - px, tz - pz);
    let diff = Math.abs(ang - rot);
    while (diff > Math.PI) diff = Math.abs(diff - Math.PI * 2);
    return diff < cone;
  }

  fireBolt(owner, x, z, rot, dmg, color, target = null) {
    const mesh = makeBoltMesh(color);
    mesh.position.set(x, 1.1, z);
    this.scene.add(mesh);
    this.bolts.push({
      owner,
      x,
      z,
      vx: Math.sin(rot) * 22,
      vz: Math.cos(rot) * 22,
      dmg,
      life: 1.35,
      mesh,
      hit: false,
      targetId: target?.ref?.id || null,
      targetKind: target?.type || null,
    });
  }

  resolveBolt(b) {
    const dungeonAuth = this.isDungeonAuthority() && b.owner === this.local?.id;
    // Visuals update for everyone; damage only on host / dungeon authority
    // Duel bolts: attacker applies pdmg locally
    const pvpBolt =
      b.targetKind === "player" &&
      b.owner === this.local?.id &&
      PvPService.isOpponent(this.local.id, b.targetId);
    const canDamage = this.net.isHost || dungeonAuth || pvpBolt;

    // Soft-home toward locked target (all clients — looks right)
    if (b.targetId) {
      let tx = null;
      let tz = null;
      if (b.targetKind === "player") {
        const r = this.remotes.get(b.targetId);
        if (r) {
          tx = r.target?.x ?? r.state.x;
          tz = r.target?.z ?? r.state.z;
        }
      } else if (b.targetKind === "metin") {
        const met = this.metins.get(b.targetId);
        if (met && met.hp > 0) {
          tx = met.x;
          tz = met.z;
        }
      } else {
        const mob = this.mobs.get(b.targetId);
        if (mob && mob.hp > 0) {
          tx = mob.x;
          tz = mob.z;
        }
      }
      if (tx != null) {
        const ang = Math.atan2(tx - b.x, tz - b.z);
        const spd = Math.hypot(b.vx, b.vz) || 22;
        b.vx = Math.sin(ang) * spd;
        b.vz = Math.cos(ang) * spd;
      }
    }

    if (b.hit || !canDamage) return;

    // Locked bolt: only the aimed enemy (no splash onto neighbors)
    if (b.targetId) {
      if (b.targetKind === "player") {
        const r = this.remotes.get(b.targetId);
        const x = r?.target?.x ?? r?.state?.x;
        const z = r?.target?.z ?? r?.state?.z;
        if (r && x != null && dist2(b.x, b.z, x, z) < 1.4) {
          this.applyDamageToPlayer(b.targetId, b.dmg, "duel");
          b.hit = true;
          b.life = 0;
        }
      } else if (b.targetKind === "metin") {
        const met = this.metins.get(b.targetId);
        if (met && met.hp > 0 && dist2(b.x, b.z, met.x, met.z) < 1.45) {
          this.damageMetin(met, b.dmg, b.owner);
          b.hit = true;
          b.life = 0;
        }
      } else {
        const mob = this.mobs.get(b.targetId);
        if (mob && mob.hp > 0 && dist2(b.x, b.z, mob.x, mob.z) < 1.3) {
          this.damageMob(mob, b.dmg, b.owner);
          b.hit = true;
          b.life = 0;
        }
      }
      return;
    }

    for (const [, mob] of this.mobs) {
      if (dungeonAuth && !mob.dungeon) continue;
      if (dist2(b.x, b.z, mob.x, mob.z) < 1.15) {
        this.damageMob(mob, b.dmg, b.owner);
        b.hit = true;
        b.life = 0;
        return;
      }
    }
    for (const [, met] of this.metins) {
      if (dungeonAuth && !met.dungeon) continue;
      if (!dungeonAuth && met.dungeon) continue;
      if (dist2(b.x, b.z, met.x, met.z) < 1.3) {
        this.damageMetin(met, b.dmg, b.owner);
        b.hit = true;
        b.life = 0;
        return;
      }
    }
  }

  damageMob(mob, dmg, fromId) {
    // Damage is already rolled at attack time — do not re-roll miss here (felt random)
    const applied = Math.max(1, Math.floor(dmg - (mob.def || 0) * 0.35));
    mob.hp -= applied;
    this.fx?.bleed(mob.x, mob.z, this.groundY(mob.x, mob.z, mob.mapId), applied);
    // Only the attacker broadcasts hit FX (avoids host+client double spray)
    if (fromId === this.local?.id) {
      this.net.sendEvent({ type: "fx", kind: "hit", x: mob.x, z: mob.z, dmg: Math.floor(applied), from: fromId });
    }
    if (mob.hp <= 0) {
      const tmpl = MONSTERS[mob.templateId] || null;
      const gold = DropService.yangFor(tmpl || mob.templateId || mob.kind);
      const xp = DropService.xpFor(tmpl || mob.templateId || mob.kind);
      // Prefer precise template id so quest aliases (black_ork, elite_ork, …) work
      const killKind = mob.templateId || mob.kind || "wolf";
      this.net.sendEvent({
        type: "kill",
        from: fromId,
        target: mob.id,
        kind: killKind,
        x: mob.x,
        z: mob.z,
        gold,
        xp,
      });
      if (this.net.isHost || (this.isDungeonAuthority() && fromId === this.local?.id)) {
        this.spawnLootAt(mob.x, mob.z, mob.dropTable || mob.templateId || mob.kind, 1, gold);
      }
      if (fromId === this.local?.id) this.rewardKill(xp, gold, killKind);
    }
  }

  damageMetin(met, dmg, fromId) {
    const applied = Math.max(1, Math.floor(dmg));
    met.hp -= applied;
    this.fx?.bleed(met.x, met.z, this.groundY(met.x, met.z, met.mapId), applied);
    if (fromId === this.local?.id) {
      this.net.sendEvent({ type: "fx", kind: "hit", x: met.x, z: met.z, dmg: Math.floor(applied), from: fromId });
    }
    if (met.hp <= 0) {
      const gold = DropService.yangFor("metin", met.tier);
      const xp = DropService.xpFor("metin", met.tier);
      this.net.sendEvent({
        type: "kill",
        from: fromId,
        target: met.id,
        kind: "metin",
        tier: met.tier,
        x: met.x,
        z: met.z,
        gold,
        xp,
      });
      if (this.net.isHost || (this.isDungeonAuthority() && fromId === this.local?.id)) {
        this.spawnLootAt(met.x, met.z, met.dropTable || "metin", met.tier, gold);
      }
      if (fromId === this.local?.id) {
        this.local.metins += 1;
        this.character.metins = this.local.metins;
        this.rewardKill(xp, gold, "metin");
        this.ui.toast(`${met.name || "Metin"} shattered · ${this.local.metins}`);
      }
    }
  }

  rewardKill(xp, gold, kind) {
    if (!this.local || !this.character) return;
    this.local.kills += 1;
    this.character.kills = this.local.kills;
    this.local.gold += gold;
    this.character.gold = this.local.gold;

    const killKind = kind === "metin" ? "metin" : kind;
    const questUpdates = QuestService.onKill(this.character, killKind);
    if (questUpdates.length) {
      this.ui.pushQuestMailFromKills?.(questUpdates);
    }

    const prevLv = this.character.level;
    const ups = applyLevelUps(this.character, xp);
    this.local.level = this.character.level;
    if (ups) {
      this.syncDerived();
      this.local.hp = this.local.maxHp;
      this.local.sp = this.local.maxSp;
      this.ui.toast(ups > 1 ? `Level up ×${ups}!` : "Level up!");
      if (
        prevLv < SkillService.unlockLevel &&
        this.character.level >= SkillService.unlockLevel &&
        !SkillService.hasPath(this.character)
      ) {
        this.ui.toast("Skill Master awaits — choose your path in town!");
      }
      this.fx?.buff(this.local.x, this.local.z, "#e8d48b", this.groundY(this.local.x, this.local.z));
      audio.sfx("level");
    }
    this.onCharacterChange(this.character, this.local);
    this.refreshQuestMarkers();
  }

  spawnLootAt(x, z, kindOrTable, tier = 1, bonusGold = 0) {
    const tableId = kindOrTable || "wolf";
    const drops = DropService.roll(tableId, tableId === "metin" || kindOrTable === "metin" ? 1 + tier * 0.1 : 1);
    // Occasional ground yang bag (~1/14 of kills)
    if (bonusGold > 0 && Math.random() < 0.07) {
      this.createLoot(x + rand(-1, 1), z + rand(-1, 1), null, Math.max(20, Math.floor(bonusGold * 0.4)));
    }
    for (const drop of drops) {
      this.createLoot(x + rand(-1.4, 1.4), z + rand(-1.4, 1.4), drop, 0);
    }
  }

  createLoot(x, z, item, gold, { silent = false } = {}) {
    const id = uid("loot");
    const def = item ? getItem(item.itemId) : null;
    const color = def ? RARITY_COLOR[def.rarity] || "#e8d48b" : "#e8d48b";
    const mesh = new THREE.Mesh(
      new THREE.OctahedronGeometry(gold && !item ? 0.25 : 0.32, 0),
      new THREE.MeshStandardMaterial({
        color,
        emissive: color,
        emissiveIntensity: 0.55,
        metalness: 0.4,
        roughness: 0.3,
      })
    );
    const mapId = MapService.currentId;
    mesh.position.set(x, this.groundY(x, z, mapId) + 0.4, z);
    mesh.visible = MapService.isField();
    this.scene.add(mesh);
    const entry = { id, x, z, item, gold, mesh, t: rand(0, 3), mapId };
    this.loot.set(id, entry);
    if (!silent) {
      this.net.sendEvent({ type: "loot", id, x, z, item, gold, mapId, from: this.local?.id });
      this.fx?.lootBeam(x, z, color, this.groundY(x, z, mapId));
    }
    return id;
  }

  addLootFromNet(payload) {
    if (!payload?.id || this.loot.has(payload.id)) return;
    const def = payload.item ? getItem(payload.item.itemId) : null;
    const color = def ? RARITY_COLOR[def.rarity] || "#e8d48b" : "#e8d48b";
    const mesh = new THREE.Mesh(
      new THREE.OctahedronGeometry(payload.gold && !payload.item ? 0.25 : 0.32, 0),
      new THREE.MeshStandardMaterial({
        color,
        emissive: color,
        emissiveIntensity: 0.55,
        metalness: 0.4,
        roughness: 0.3,
      })
    );
    const mapId = payload.mapId || MapService.currentId;
    mesh.position.set(payload.x, this.groundY(payload.x, payload.z, mapId) + 0.4, payload.z);
    this.scene.add(mesh);
    this.loot.set(payload.id, {
      id: payload.id,
      x: payload.x,
      z: payload.z,
      item: payload.item,
      gold: payload.gold,
      mesh,
      t: 0,
      mapId,
    });
  }

  tryPickup() {
    const p = this.local;
    if (!p || !this.character) return;
    let best = null;
    let bestD = 2.2;
    for (const [, l] of this.loot) {
      const d = dist2(p.x, p.z, l.x, l.z);
      if (d < bestD) {
        bestD = d;
        best = l;
      }
    }
    if (!best) {
      this.ui.toast("Nothing nearby");
      return;
    }
    this.pickupLoot(best.id, true);
  }

  pickupLoot(id, broadcast = false) {
    const l = this.loot.get(id);
    if (!l || !this.character || !this.local) return;
    if (l.gold) {
      this.local.gold += l.gold;
      this.character.gold = this.local.gold;
      this.ui.toast(`+${l.gold} Yang`);
      audio.sfx("loot");
    }
    if (l.item) {
      // Prefer unique instance payload from DropService
      if (l.item.uid) {
        const existing = this.character.inventory.find(
          (x) => x.itemId === l.item.itemId && getItem(x.itemId)?.slot === "consumable" && !x.upgrade
        );
        if (existing && getItem(l.item.itemId)?.slot === "consumable") {
          existing.qty += l.item.qty || 1;
        } else {
          this.character.inventory.push({ ...l.item });
        }
      } else {
        InventoryService.add(this.character, l.item.itemId, l.item.qty || 1);
      }
      const def = getItem(l.item.itemId);
      this.ui.toast(`Looted ${def?.name || "item"}`);
      audio.sfx("pickup");
    }
    this.scene.remove(l.mesh);
    this.loot.delete(id);
    this.onCharacterChange(this.character, this.local);
    if (broadcast) this.net.sendEvent({ type: "loot_taken", id, by: this.local.id });
  }

  takeDamage(amount, source = "mob") {
    const p = this.local;
    if (!p || this.pendingDeath || this.time < p.invulnUntil || this.time < p.stealthUntil) return;
    p.hp = CombatService.applyPlayerDamage(p.hp, Math.max(1, amount - (p.def || 0) * 0.55));
    this.fx?.hitSparks(p.x, p.z, source === "duel" ? "#ffaa44" : "#ff6655", this.groundY(p.x, p.z));
    if (p.hp <= 0) {
      p.hp = 0;
      // Duel loss — no death panel / yang loss; announce winner and stand up
      if (source === "duel" && PvPService.duel) {
        const winner = PvPService.opponentId(p.id);
        audio.sfx("death");
        this.endDuel("defeat", winner);
        p.hp = Math.floor(p.maxHp * 0.4);
        p.invulnUntil = this.time + 2;
        this.ui.toast("You lost the duel");
        return;
      }
      this.pendingDeath = true;
      const loss = Math.floor(p.gold * 0.03);
      this._deathYangLoss = loss;
      audio.sfx("death");
      this.ui.showDeath?.(loss ? `Fallen (−${loss} Yang if you continue)` : "Choose where to return.");
      this.net.sendEvent({ type: "toast", msg: `${p.name} fell`, from: p.id });
    }
  }

  respawn(mode = "town") {
    const p = this.local;
    if (!p || !this.character) return;
    const loss = this._deathYangLoss || 0;
    p.gold = Math.max(0, p.gold - loss);
    this.character.gold = p.gold;
    // small XP penalty
    const xpLoss = Math.floor((this.character.xp || 0) * 0.05);
    this.character.xp = Math.max(0, this.character.xp - xpLoss);

    if (DungeonService.isInside() || MapService.isDungeon()) {
      this._clearDungeonMobs();
      DungeonService.exit();
      this.switchMap("overworld");
      this.onDungeonChange(null);
    }
    if (mode === "town") {
      p.x = this.character.respawnX ?? 0;
      p.z = this.character.respawnZ ?? 0;
    }
    p.hp = p.maxHp;
    p.sp = p.maxSp;
    p.invulnUntil = this.time + 2.5;
    this.pendingDeath = false;
    this._deathYangLoss = 0;
    this.ui.hideDeath?.();
    this.ui.toast(mode === "town" ? "Returned to village" : "Stood up again");
    this.onCharacterChange(this.character, this.local);
  }

  applyDamageToPlayer(playerId, amount, source = "mob") {
    this.net.sendEvent({
      type: "pdmg",
      to: playerId,
      amount: Math.floor(amount),
      source,
      from: this.local?.id,
    });
    if (playerId === this.local?.id) this.takeDamage(amount, source);
  }

  allocateStat(stat) {
    if (!this.character || this.character.statPoints <= 0) return;
    if (!["str", "vit", "intel", "dex"].includes(stat)) return;
    this.character[stat] += 1;
    this.character.statPoints -= 1;
    this.syncDerived();
    this.ui.toast(`+1 ${stat.toUpperCase()}`);
  }

  equipItem(uid) {
    if (!this.character) return;
    const err = equipFromInventory(this.character, uid);
    if (err) this.ui.toast(err);
    else {
      this.syncDerived();
      this.ui.toast("Equipped");
    }
  }

  unequip(slot) {
    if (!this.character) return;
    const err = unequipSlot(this.character, slot);
    if (err) this.ui.toast(err);
    else {
      this.syncDerived();
      this.ui.toast("Unequipped");
    }
  }

  useItem(uid) {
    if (!this.character || !this.local) return;
    const err = useConsumable(this.character, uid, this.local);
    if (err && typeof err === "object" && err.skillBook) {
      this.ui.openSkillsPanel?.(err);
      return;
    }
    if (err) this.ui.toast(typeof err === "string" ? err : "Can't use");
    else {
      this.fx?.heal(this.local.x, this.local.z, this.groundY(this.local.x, this.local.z));
      this.ui.toast("Used");
      this.onCharacterChange(this.character, this.local);
    }
  }

  /** Read a skill book onto a path skill (Esc → Skills). */
  upgradeSkillWithBook(skillId, bookUid) {
    if (!this.character) return "No character";
    const err = SkillService.useBookOnSkill(this.character, skillId, bookUid);
    if (err) return err;
    this.onCharacterChange(this.character, this.local);
    return null;
  }

  /** Assign potion template to hotbar slot 0/1 (keys 5/6). Returns slot index or -1. */
  assignPotionToHotbar(itemId) {
    if (!this.character) return -1;
    const def = getItem(itemId);
    if (!def || def.slot !== "consumable" || !(def.heal || def.mana)) return -1;
    if (!Array.isArray(this.character.hotbarPotions)) {
      this.character.hotbarPotions = [null, null];
    }
    const hb = this.character.hotbarPotions;
    // Prefer empty slot, else replace the other if same already equipped, else slot 0
    let slot = hb.findIndex((id) => !id);
    if (slot < 0) {
      const same = hb.findIndex((id) => id === itemId);
      slot = same >= 0 ? same : 0;
    }
    hb[slot] = itemId;
    this.onCharacterChange(this.character, this.local);
    return slot;
  }

  clearHotbarPotion(slot) {
    if (!this.character?.hotbarPotions) return;
    if (slot < 0 || slot > 1) return;
    this.character.hotbarPotions[slot] = null;
    this.onCharacterChange(this.character, this.local);
  }

  useHotbarPotion(slot) {
    if (!this.character || !this.local) return;
    if (slot < 0 || slot > 1) return;
    if ((this.local.skillCd[4 + slot] || 0) > 0) return;
    const itemId = this.character.hotbarPotions?.[slot];
    if (!itemId) {
      this.ui.toast("Empty potion slot — right-click a potion in Inventory");
      return;
    }
    const stack = this.character.inventory.find((x) => x.itemId === itemId && (x.qty || 0) > 0);
    if (!stack) {
      this.ui.toast("No potions left");
      return;
    }
    const err = useConsumable(this.character, stack.uid, this.local);
    if (err) {
      this.ui.toast(err);
      return;
    }
    this.local.skillCd[4 + slot] = 0.8;
    this.fx?.heal(this.local.x, this.local.z, this.groundY(this.local.x, this.local.z));
    audio.sfx("heal");
    this.ui.toast(`Used ${getItem(itemId)?.name || "potion"}`);
    this.onCharacterChange(this.character, this.local);
  }

  dropItem(uid) {
    if (!this.character || !this.local) return;
    const stack = this.character.inventory.find((x) => x.uid === uid);
    if (!stack) return;
    const removed = removeFromInventory(this.character.inventory, uid, 1);
    if (!removed) return;
    this.createLoot(this.local.x + rand(-0.5, 0.5), this.local.z + rand(-0.5, 0.5), removed, 0);
    this.onCharacterChange(this.character, this.local);
    this.ui.toast("Dropped");
  }

  serializeWorld() {
    return {
      mobs: [...this.mobs.values()].map((m) => ({
        id: m.id,
        kind: m.kind,
        templateId: m.templateId,
        x: m.x,
        z: m.z,
        hp: m.hp,
        maxHp: m.maxHp,
        dungeon: !!m.dungeon,
        boss: !!m.boss,
        mapId: m.mapId || "overworld",
      })),
      metins: [...this.metins.values()].map((m) => ({
        id: m.id,
        tier: m.tier,
        templateId: m.templateId,
        name: m.name,
        x: m.x,
        z: m.z,
        hp: m.hp,
        maxHp: m.maxHp,
        mapId: m.mapId || "overworld",
      })),
    };
  }

  onWorldState(w) {
    if (!w) return;
    // While inside Demon Tower, ignore open-world sync (would wipe the instance)
    if (DungeonService.isInside()) return;
    const seenM = new Set();
    for (const m of w.mobs || []) {
      seenM.add(m.id);
      let mob = this.mobs.get(m.id);
      if (!mob) {
        const tmpl = MONSTERS[m.templateId || m.kind] || MONSTERS.wolf;
        const mesh = makeMobMesh(tmpl.id || tmpl.kind || m.kind);
        this.scene.add(mesh);
        mob = {
          ...m,
          mesh,
          speed: tmpl.speed,
          atk: tmpl.atk,
          def: tmpl.def,
          dropTable: tmpl.drop_table,
          atkT: 1,
        };
        this.mobs.set(m.id, mob);
      }
      // Target pose for client lerp (avoids 10Hz teleport stutter)
      if (mob.x == null || Math.hypot(mob.x - m.x, mob.z - m.z) > 8) {
        mob.x = m.x;
        mob.z = m.z;
        const mid = m.mapId || "overworld";
        mob.mesh.position.set(m.x, this.groundY(m.x, m.z, mid), m.z);
      }
      mob.tx = m.x;
      mob.tz = m.z;
      mob.hp = m.hp;
      mob.maxHp = m.maxHp;
      mob.dungeon = !!m.dungeon;
      mob.boss = !!m.boss;
      mob.mapId = m.mapId || "overworld";
    }
    for (const [id, mob] of [...this.mobs]) {
      if (!seenM.has(id)) {
        this.scene.remove(mob.mesh);
        this.mobs.delete(id);
      }
    }

    const seenT = new Set();
    for (const m of w.metins || []) {
      seenT.add(m.id);
      let met = this.metins.get(m.id);
      if (!met) {
        const tmpl = METINS[m.templateId] || Object.values(METINS).find((t) => t.tier === m.tier) || METINS.battle;
        const mesh = makeMetinMesh(tmpl.tier, tmpl.color);
        this.scene.add(mesh);
        met = { ...m, mesh, pulse: 0, spawnT: 5, name: tmpl.name, dropTable: tmpl.drop_table, templateId: tmpl.id };
        this.metins.set(m.id, met);
      }
      if (met.x == null || Math.hypot(met.x - m.x, met.z - m.z) > 8) {
        met.x = m.x;
        met.z = m.z;
        const mid = m.mapId || "overworld";
        met.mesh.position.set(m.x, this.groundY(m.x, m.z, mid), m.z);
      }
      met.tx = m.x;
      met.tz = m.z;
      met.hp = m.hp;
      met.mapId = m.mapId || "overworld";
    }
    for (const [id, met] of [...this.metins]) {
      if (!seenT.has(id)) {
        this.scene.remove(met.mesh);
        this.metins.delete(id);
      }
    }
    this._syncEntityMapVisibility();
  }

  onRemotePlayer(s) {
    let r = this.remotes.get(s.id);
    if (!r) {
      const mesh = makePlayerMesh(s.classId || "warrior", false);
      setNameplate(mesh, s.name || "Player", (s.hp || 100) / (s.maxHp || 100), s.level || 1, s.classId);
      this.scene.add(mesh);
      r = {
        mesh,
        state: { x: s.x, z: s.z, rot: s.rot || 0, hp: s.hp, maxHp: s.maxHp || 100, mapId: s.mapId || "overworld" },
        target: s,
      };
      this.remotes.set(s.id, r);
    } else {
      setNameplate(r.mesh, s.name || "Player", (s.hp || 100) / (s.maxHp || 100), s.level || 1, s.classId);
      r.target = s;
    }
    const sameMap = (s.mapId || "overworld") === MapService.currentId;
    r.mesh.visible = sameMap && !s.stealth;
  }

  onPeers(peers) {
    this.ui.setPlayers(peers.length);
    this.ui.updateScoreboard(peers);
    const ids = new Set(peers.map((p) => p.id));
    for (const [id, r] of [...this.remotes]) {
      if (!ids.has(id) || id === this.local?.id) {
        this.scene.remove(r.mesh);
        this.remotes.delete(id);
      }
    }
    // Ensure remotes exist for peers we haven't got state for yet
    for (const peer of peers) {
      if (peer.id === this.local?.id) continue;
      if (!this.remotes.has(peer.id)) {
        const mesh = makePlayerMesh(peer.classId || "warrior", false);
        setNameplate(mesh, peer.name || "Player", 1, 1, peer.classId);
        mesh.position.set(rand(-4, 4), 0, rand(-4, 4));
        this.scene.add(mesh);
        this.remotes.set(peer.id, {
          mesh,
          state: { x: mesh.position.x, z: mesh.position.z, rot: 0, hp: 100 },
          target: { x: mesh.position.x, z: mesh.position.z, rot: 0, hp: 100, stealth: false },
        });
      }
    }
    this._pruneDuelAgainstMissingPeers(ids);
  }

  onNetEvent(e) {
    if (!e) return;
    if (e.type === "toast" && e.from !== this.local?.id) this.ui.toast(e.msg);

    if (e.type === "map_travel" && e.from !== this.local?.id) {
      // Host ensures destination map has spawns when another player travels
      if (this.net.isHost && e.mapId && MapService.isField(e.mapId)) {
        this.seedWorld(e.mapId);
      }
    }

    if (e.type === "bolt" && e.from !== this.local?.id) {
      const target =
        e.targetId != null
          ? {
              type: e.targetKind || "mob",
              ref: e.targetKind === "metin" ? this.metins.get(e.targetId) : this.mobs.get(e.targetId),
            }
          : null;
      this.fireBolt(e.from, e.x, e.z, e.rot, e.dmg, e.color || "#e8d48b", target?.ref ? target : null);
    }

    if (e.type === "melee" && this.net.isHost && e.from !== this.local?.id) {
      // Prefer the attacker's cursor target — wide cone felt random
      if (e.targetId) {
        if (e.targetKind === "metin") {
          const met = this.metins.get(e.targetId);
          if (met && met.hp > 0) this.damageMetin(met, e.dmg, e.from);
        } else {
          const mob = this.mobs.get(e.targetId);
          if (mob && mob.hp > 0) this.damageMob(mob, e.dmg, e.from);
        }
      } else {
        const cone = e.cone || 0.35;
        const range = e.range || 2.4;
        for (const [, mob] of this.mobs) {
          if (this.inCone(e.x, e.z, e.rot, mob.x, mob.z, range + 0.6, cone)) {
            this.damageMob(mob, e.dmg, e.from);
          }
        }
        for (const [, met] of this.metins) {
          if (this.inCone(e.x, e.z, e.rot, met.x, met.z, range + 1, cone)) {
            this.damageMetin(met, e.dmg, e.from);
          }
        }
      }
    }

    if (e.type === "aoe" && this.net.isHost && e.from !== this.local?.id) {
      this.aoeHit(e.x, e.z, e.r, e.dmg, e.from, !!e.drain);
    }

    if (e.type === "pdmg" && e.to === this.local?.id) {
      this.takeDamage(e.amount, e.source || "mob");
    }

    // Duel
    if (e.type === "duel_invite" && e.to === this.local?.id) {
      // Ignore self / ghost invites when the challenger isn't online
      if (!e.from || e.from === this.local.id || !this._peerOnline(e.from)) return;
      if (PvPService.duel) return;
      PvPService.pendingChallenge = { from: e.from, fromName: e.fromName, to: e.to };
      this.ui.showSocialInvite?.({
        kind: "duel",
        text: `${e.fromName || "Player"} challenges you to a duel!`,
      });
      this.ui.toast(`${e.fromName || "Player"} challenged you`);
    }
    if (e.type === "duel_decline" && e.to === this.local?.id) {
      this.ui.toast("Challenge declined");
    }
    if (e.type === "duel_accept" && e.to === this.local?.id) {
      if (!e.from || e.from === this.local.id || !this._peerOnline(e.from)) return;
      PvPService.beginCountdown({
        id: e.duelId || `duel_${Date.now().toString(36)}`,
        a: this.local.id,
        b: e.from,
        aName: this.local.name,
        bName: e.fromName,
      });
      this.ui.hideSocialInvite?.();
      this.ui.showDuelCountdown?.(5, false);
      this.onDuelChange?.(PvPService.duel);
      this.ui.toast(`Duel vs ${e.fromName} — get ready!`);
    }
    if (e.type === "duel_end" && PvPService.duel && (e.a === this.local?.id || e.b === this.local?.id)) {
      if (e.from !== this.local?.id) {
        const won = e.winnerId === this.local.id;
        PvPService.end();
        this.onDuelChange?.(null);
        this.ui.hideDuelCountdown?.();
        if (this.local.hp <= 0) this.local.hp = Math.floor(this.local.maxHp * 0.4);
        this.ui.toast(won ? "Duel won!" : e.winnerId ? "Duel lost" : "Duel ended");
      }
    }

    // Trade
    if (e.type === "trade_invite" && e.to === this.local?.id) {
      TradeService.pendingInvite = { from: e.from, fromName: e.fromName, to: e.to };
      this.ui.showSocialInvite?.({
        kind: "trade",
        text: `${e.fromName} wants to trade`,
      });
      this.ui.toast(`${e.fromName} requested a trade`);
    }
    if (e.type === "trade_decline" && e.to === this.local?.id) {
      this.ui.toast("Trade declined");
    }
    if (e.type === "trade_accept" && e.to === this.local?.id) {
      TradeService.open(e.tradeId, e.from, e.fromName);
      this.onTradeChange?.(TradeService.session);
      this.ui.toast(`Trading with ${e.fromName}`);
    }
    if (e.type === "trade_offer" && TradeService.session?.id === e.tradeId && e.from !== this.local?.id) {
      TradeService.applyTheirOffer(e.items, e.yang);
      this.onTradeChange?.(TradeService.session);
    }
    if (e.type === "trade_lock" && TradeService.session?.id === e.tradeId && e.from !== this.local?.id) {
      TradeService.setLock(false, !!e.locked);
      this.onTradeChange?.(TradeService.session);
    }
    if (e.type === "trade_confirm" && TradeService.session?.id === e.tradeId && e.from !== this.local?.id) {
      TradeService.setConfirm(false, true);
      this.onTradeChange?.(TradeService.session);
      if (TradeService.bothConfirmed()) this._finishTrade();
    }
    if (e.type === "trade_cancel" && TradeService.session?.id === e.tradeId && e.from !== this.local?.id) {
      TradeService.cancelRestore(this.character);
      this.onTradeChange?.(null);
      this.onCharacterChange?.(this.character, this.local);
      this.ui.toast("Trade cancelled");
    }

    if (e.type === "kill" && e.from === this.local?.id) {
      // Dungeon authority already rewarded locally; avoid double XP
      if (!this.net.isHost && !DungeonService.isInside()) {
        if (e.kind === "metin") {
          this.local.metins += 1;
          this.character.metins = this.local.metins;
          this.ui.toast(`Metin shattered · ${this.local.metins}`);
        }
        this.rewardKill(e.xp || 30, e.gold || 50, e.kind);
      }
    }

    if (e.type === "loot" && e.from !== this.local?.id) {
      this.addLootFromNet(e);
    }
    if (e.type === "loot_taken") {
      const l = this.loot.get(e.id);
      if (l) {
        this.scene.remove(l.mesh);
        this.loot.delete(e.id);
      }
    }

    if (e.type === "fx" && e.from !== this.local?.id) {
      const egy = this.groundY(e.x, e.z);
      if (e.kind === "skill") {
        // Ignore legacy "cast" telegraphs from peers — only show release FX
        if (e.skill && e.skill !== "cast") {
          this.fx?.skill(
            e.skill || "aoe",
            e.x,
            e.z,
            e.rot || 0,
            e.color || "#e8d48b",
            e.r || 4,
            e.fx || e.skill,
            egy
          );
        }
      }
      if (e.kind === "slash") this.fx?.slash(e.x, e.z, e.rot || 0, e.color || "#e8d48b", egy);
      if (e.kind === "aoe") this.fx?.skill("aoe", e.x, e.z, 0, e.color || "#c43c2e", e.r || 3, null, egy);
      if (e.kind === "heal") this.fx?.heal(e.x, e.z, egy);
      if (e.kind === "buff") this.fx?.buff(e.x, e.z, "#e8d48b", egy);
      if (e.kind === "hit") this.fx?.bleed(e.x, e.z, egy, e.dmg || 0);
    }

    // Party
    if (e.type === "party_invite" && e.to === this.local?.id) {
      PartyService.pendingInvite = { from: e.from, fromName: e.fromName, party: e.party };
      this.ui.toast(`${e.fromName} invited you to a party`);
      this.onPartyChange(PartyService.party);
    }
    if (e.type === "party_sync" && e.party) {
      if (e.party.members.some((m) => m.id === this.local?.id)) {
        PartyService.applyRemoteParty(e.party);
        this.onPartyChange(PartyService.party);
      }
    }
    if (e.type === "party_leave") {
      if (e.party) {
        if (e.party.members.some((m) => m.id === this.local?.id)) {
          PartyService.applyRemoteParty(e.party);
        } else {
          PartyService.disband();
        }
      } else if (e.from !== this.local?.id) {
        PartyService.removeMember(e.from);
      }
      this.onPartyChange(PartyService.party);
    }

    // Demon Tower — leader pull teleports whole party onto the dungeon map
    if (e.type === "dt_enter" && e.from !== this.local?.id) {
      if (this._shouldJoinDemonEnter(e)) {
        this.joinDemonTower(e);
      }
    }
    if (e.type === "dt_floor" && e.from !== this.local?.id && DungeonService.isInside()) {
      // Same instance only
      if (e.instanceId && DungeonService.run?.instanceId && e.instanceId !== DungeonService.run.instanceId) {
        /* ignore other runs */
      } else {
        DungeonService.setFloor(e.floor);
        this._clearDungeonMobs();
        if (e.cfg) this._spawnDungeonFloor(e.cfg);
        this.onDungeonChange(DungeonService.run);
      }
    }
    if (e.type === "dt_advance" && e.from !== this.local?.id && DungeonService.isInside()) {
      this._beginDungeonFloor(e.floor, false);
      if (e.cfg) this._spawnDungeonFloor(e.cfg);
      const slot = (e.slots || []).find((s) => s.id === this.local?.id);
      if (slot) {
        this.local.x = slot.x;
        this.local.z = slot.z;
      }
      this.local.mapId = "demon_tower";
    }
    if (e.type === "dt_cleared" && DungeonService.isInside()) {
      DungeonService.markCleared();
      if (e.smith) this._spawnTowerSmith();
      this.onDungeonChange(DungeonService.run);
    }
    if (e.type === "dt_smith" && DungeonService.isInside() && e.from !== this.local?.id) {
      DungeonService.enableSmith(e.members || []);
      this._spawnTowerSmith();
      this.onDungeonChange(DungeonService.run);
    }
    if (
      e.type === "dt_exit" &&
      e.from !== this.local?.id &&
      DungeonService.isInside() &&
      Array.isArray(e.members) &&
      e.members.includes(this.local?.id)
    ) {
      this._clearDungeonMobs();
      DungeonService.exit();
      this.switchMap("overworld");
      const exit = DEMON_TOWER.exitCity || { x: 0, z: 0 };
      this.local.x = e.exit?.x ?? exit.x;
      this.local.z = e.exit?.z ?? exit.z;
      this.local.mapId = "overworld";
      this.onDungeonChange(null);
      this.ui.toast("Demon Tower reset — returned to Shinsoo");
    }
  }
}

function prevent(e) {
  e.preventDefault();
}

/** Shortest-arc angle damp toward target (radians). */
function dampAngle(cur, target, rate, dt) {
  let diff = target - cur;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return cur + diff * Math.min(1, rate * dt);
}
