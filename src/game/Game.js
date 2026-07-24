import { CLASSES, MAP_HALF, clamp, dist2, rand, uid, wildPoint, CITY_RADIUS, inCity } from "./data.js";
import {
  createRenderer,
  createScene,
  createCamera,
  makePlayerMesh,
  makeMetinMesh,
  makeMobMesh,
  makeNpcMesh,
  makeDemonTowerMesh,
  makeDungeonMapRoot,
  makeValleyMapRoot,
  makeBoltMesh,
  setNameplate,
  animateCharacter,
  animateMob,
  animateNpc,
  updateHpBar,
  setQuestMarker,
} from "./meshes.js";
import { FxSystem } from "./fx.js";
import { derivedStats, applyLevelUps } from "./character.js";
import { getItem, RARITY_COLOR } from "./items.js";
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
import { DungeonService } from "../services/DungeonService.js";
import { MapService } from "../services/MapService.js";
import { DEMON_TOWER, demonPortalWorld } from "../data/demonTower.js";
import { findPortalNear } from "../data/mapPortals.js";
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
    const { scene, overworld } = createScene();
    this.scene = scene;
    this.overworld = overworld || null;
    this.dungeonRoot = null;
    this.valleyRoot = null;
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

    this.local = null;
    this.localMesh = null;
    this.remotes = new Map(); // id -> { mesh, state, target }
    this.mobs = new Map();
    this.metins = new Map();
    this.bolts = [];
    this.particles = [];
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

    this.camDist = 38;
    this.camDistTarget = 38;
    this.camYaw = 0.0;
    this.camPitch = 0.72; // radians-ish tilt factor
    this.camOffset = new THREE.Vector3(0, 26, 26);
    this.time = 0;
    this.sendAcc = 0;
    this.worldAcc = 0;
    this.presenceAcc = 0;
    this.waveTimer = 2;
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
        this.camYaw -= dx * 0.005;
        this.camPitch = clamp(this.camPitch + dy * 0.003, 0.35, 1.15);
      }
    };
    this._onDown = (e) => {
      if (e.button === 0) {
        this.mouse.down = true;
        if (this.running && !this.pendingDeath) this._tryClickTower();
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
      this.camDistTarget = clamp(this.camDistTarget + dir * 3.2, 12, 62);
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

  start(profile, character) {
    this.stop(false);
    this.profile = profile;
    this.character = character;
    this.running = true;
    this.time = 0;
    this.clearWorldEntities();
    this.fx?.clear();

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
      metins: character.metins || 0,
      kills: character.kills || 0,
      gold: character.gold || 0,
      attacking: 0,
      mapId: "overworld",
    };

    if (!Array.isArray(this.character.hotbarPotions) || this.character.hotbarPotions.length < 2) {
      this.character.hotbarPotions = ["red_potion", "blue_potion"];
    }

    this.localMesh = makePlayerMesh(character.classId, true);
    setNameplate(this.localMesh, character.name, 1, character.level, character.classId);
    this.scene.add(this.localMesh);
    this.spawnNpcs();
    this.spawnDemonTower();

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
    const parent = this.overworld || this.scene;
    for (const m of this.npcMeshes) parent.remove(m);
    this.npcMeshes = [];
    for (const npc of NpcService.list) {
      const mesh = makeNpcMesh(npc);
      mesh.position.set(npc.x, 0, npc.z);
      mesh.rotation.y = Math.atan2(-npc.x, -npc.z);
      parent.add(mesh);
      this.npcMeshes.push(mesh);
    }
    this.refreshQuestMarkers();
  }

  spawnDemonTower() {
    const ow = this.overworld || this.scene;
    if (this.towerMesh) ow.remove(this.towerMesh);
    if (this.dungeonRoot) this.scene.remove(this.dungeonRoot);
    if (this.valleyRoot) this.scene.remove(this.valleyRoot);

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

    // Second field map (brown Seungryong)
    this.valleyRoot = makeValleyMapRoot();
    this.scene.add(this.valleyRoot);

    this.switchMap("overworld");
  }

  /** True map switch — field maps + Demon Tower instance */
  switchMap(mapId) {
    const map = MapService.set(mapId);
    if (this.overworld) this.overworld.visible = mapId === "overworld";
    if (this.valleyRoot) this.valleyRoot.visible = mapId === "valley";
    if (this.dungeonRoot) this.dungeonRoot.visible = mapId === "demon_tower";
    if (this.local) this.local.mapId = mapId;
    if (this.scene) {
      this.scene.background = new THREE.Color(map.background);
      this.scene.fog = new THREE.Fog(map.fog, map.fogNear, map.fogFar);
    }
    this.ui.setMap?.(map.name, mapId);
    this._syncEntityMapVisibility();
    // Hide remotes that are on another map
    for (const [, r] of this.remotes) {
      const mid = r.target?.mapId || r.state?.mapId || "overworld";
      if (r.mesh) r.mesh.visible = mid === mapId && !r.target?.stealth;
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
      met.mesh.visible = !inDungeon && (met.mapId || "overworld") === mid;
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
      if (!npc || npc.role !== "quest") {
        setQuestMarker(mesh, "");
        continue;
      }
      let best = "";
      for (const q of QUESTS) {
        const st = ch.quests[q.id];
        if (st?.state === "completed") {
          best = "done";
          break;
        }
      }
      if (!best) {
        for (const q of QUESTS) {
          if (!ch.quests[q.id] && ch.level >= q.levelReq) {
            best = "!";
            break;
          }
        }
      }
      if (!best) {
        for (const q of QUESTS) {
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
    this.ui.hideDeath?.();
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
    for (const m of seed.mobs) this.spawnMob(m.x, m.z, m.templateId, mapId);
    if (mapId === MapService.currentId) {
      this.ui.toast(mapId === "valley" ? "Bandits roam the valley" : "Leave the city gates to hunt");
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
    const a = DEMON_TOWER.arena;
    let spawned = 0;
    for (const row of cfg.mobs || []) {
      for (let i = 0; i < row.n; i++) {
        const ang = Math.random() * Math.PI * 2;
        const r = 4 + Math.random() * 8;
        const id = this.spawnMob(a.x + Math.cos(ang) * r, a.z + Math.sin(ang) * r, row.id, "demon_tower");
        const mob = this.mobs.get(id);
        if (mob) {
          mob.dungeon = true;
          mob.mapId = "demon_tower";
          if (mob.mesh) mob.mesh.visible = true;
          mob.hp = Math.floor(mob.hp * (1 + (cfg.floor - 1) * 0.15));
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
    this._dtFloorMobs = spawned;
    DungeonService.run.cleared = spawned === 0;
  }

  _clearDungeonMobs() {
    for (const [id, m] of [...this.mobs]) {
      if (m.dungeon) {
        this.scene.remove(m.mesh);
        this.mobs.delete(id);
      }
    }
    this._dtFloorMobs = 0;
  }

  _checkDungeonClear() {
    if (!DungeonService.run || DungeonService.run.cleared) return;
    let alive = 0;
    for (const [, m] of this.mobs) if (m.dungeon && m.hp > 0) alive++;
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
      this.onDungeonChange(DungeonService.run);
      this.net.sendEvent({
        type: "dt_cleared",
        from: this.local?.id,
        instanceId: DungeonService.run.instanceId,
        floor: DungeonService.run.floor,
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
    // Teleport back to overworld entrance
    this.local.x = DEMON_TOWER.entrance.x - 5;
    this.local.z = DEMON_TOWER.entrance.z + 5;
    this.local.invulnUntil = this.time + 2;
    const exitPayload = {
      type: "dt_exit",
      from: this.local.id,
      members: PartyService.memberIds(),
      mapId: "overworld",
      exit: { x: this.local.x, z: this.local.z },
    };
    if (this.net.sendEventReliable) this.net.sendEventReliable(exitPayload);
    else this.net.sendEvent(exitPayload);
    this.ui.toast(
      PartyService.size() > 1 ? "Party returned to the overworld" : "Returned to the overworld"
    );
    this.onDungeonChange(null);
    if (this.net.isHost) setTimeout(() => this.seedWorld(), 400);
  }

  spawnMetin(x, z, templateIdOrTier = "battle", mapId = MapService.currentId) {
    const tmpl =
      typeof templateIdOrTier === "number"
        ? Object.values(METINS).find((t) => t.tier === templateIdOrTier) || METINS.battle
        : METINS[templateIdOrTier] || SpawnService.pickMetinTemplate();
    const id = uid("met");
    const mesh = makeMetinMesh(tmpl.tier, tmpl.color);
    mesh.position.set(x, 0, z);
    mesh.visible = mapId === MapService.currentId && !MapService.isDungeon();
    this.scene.add(mesh);
    this.metins.set(id, {
      id,
      x,
      z,
      tier: tmpl.tier,
      templateId: tmpl.id,
      name: tmpl.name,
      dropTable: tmpl.drop_table,
      hp: tmpl.hp,
      maxHp: tmpl.hp,
      mesh,
      pulse: rand(0, 10),
      spawnT: 3,
      wave: tmpl.wave || 3,
      mapId,
    });
    return id;
  }

  spawnMob(x, z, kind = "wolf", mapId = MapService.currentId) {
    const tmpl = MONSTERS[kind] || MONSTERS.wolf;
    const id = uid("mob");
    const mesh = makeMobMesh(tmpl.id || tmpl.kind || kind);
    mesh.position.set(x, 0, z);
    mesh.visible = !MapService.isDungeon() && mapId === MapService.currentId;
    this.scene.add(mesh);
    this.mobs.set(id, {
      id,
      kind: tmpl.kind || kind,
      templateId: tmpl.id,
      x,
      z,
      hp: tmpl.hp,
      maxHp: tmpl.hp,
      speed: tmpl.speed,
      atk: tmpl.atk,
      def: tmpl.def || 0,
      dropTable: tmpl.drop_table,
      atkT: rand(0.5, 1.2),
      mesh,
      targetId: null,
      mapId,
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
    this.update(dt);
    this.renderer.render(this.scene, this.camera);
    this._raf = requestAnimationFrame((t) => this.loop(t));
  }

  updateAim() {
    this.raycaster.setFromCamera(this.mouse.ndc, this.camera);
    const hit = new THREE.Vector3();
    if (this.raycaster.ray.intersectPlane(this.groundPlane, hit)) {
      this.aim.copy(hit);
    }
    // Lock to enemy under / near cursor (mesh raycast, then screen soft-lock)
    this.aimEntity = this._raycastEnemyUnderCursor() || this._softLockEnemyNearCursor();
    if (this.aimEntity) {
      this.aim.x = this.aimEntity.x;
      this.aim.z = this.aimEntity.z;
    }
  }

  _raycastEnemyUnderCursor() {
    const meshes = [];
    for (const [, m] of this.mobs) {
      if (m.hp > 0 && m.mesh && this._entityOnCurrentMap(m)) meshes.push(m.mesh);
    }
    for (const [, m] of this.metins) {
      if (m.hp > 0 && m.mesh && this._entityOnCurrentMap(m)) meshes.push(m.mesh);
    }
    if (!meshes.length) return null;
    this.raycaster.setFromCamera(this.mouse.ndc, this.camera);
    const hits = this.raycaster.intersectObjects(meshes, true);
    if (!hits.length) return null;
    const node = hits[0].object;
    // Skip HP bar / label sprites — lock the body behind them
    for (const h of hits) {
      if (h.object?.isSprite) continue;
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
    // Sprite-only hit: still resolve parent mob/metin
    for (const [, m] of this.mobs) {
      if (this._meshContains(m.mesh, node)) return { type: "mob", ref: m, x: m.x, z: m.z };
    }
    for (const [, m] of this.metins) {
      if (this._meshContains(m.mesh, node)) return { type: "metin", ref: m, x: m.x, z: m.z };
    }
    return null;
  }

  /** Screen-space soft lock when the cursor is near an enemy but not exactly on the mesh. */
  _softLockEnemyNearCursor() {
    const rect = this.canvas.getBoundingClientRect();
    const mx = this.mouse.x;
    const my = this.mouse.y;
    const maxPx = 48;
    let best = null;
    let bestD = maxPx;

    const consider = (type, ref, x, z, y = 0.9) => {
      if (!this._entityOnCurrentMap(ref)) return;
      this._aimProj.set(x, y, z).project(this.camera);
      if (this._aimProj.z > 1) return;
      const sx = (this._aimProj.x * 0.5 + 0.5) * rect.width;
      const sy = (-this._aimProj.y * 0.5 + 0.5) * rect.height;
      const d = Math.hypot(sx - mx, sy - my);
      if (d < bestD) {
        bestD = d;
        best = { type, ref, x, z };
      }
    };

    for (const [, m] of this.mobs) {
      if (m.hp <= 0) continue;
      consider("mob", m, m.x, m.z, 0.85);
    }
    if (!DungeonService.isInside()) {
      for (const [, m] of this.metins) {
        if (m.hp <= 0) continue;
        consider("metin", m, m.x, m.z, 1.2);
      }
    }
    return best;
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
   * Enemy under cursor if in reach — no wide cone (that felt random).
   */
  pickAimedTarget(p, range) {
    if (!this.aimEntity) return null;
    const pad = this.aimEntity.type === "metin" ? 1.5 : 1.05;
    const d = dist2(p.x, p.z, this.aimEntity.x, this.aimEntity.z);
    if (d <= range + pad) return this.aimEntity;
    return null;
  }

  update(dt) {
    const p = this.local;
    if (!p) return;

    this.updateAim();

    if (this.pendingDeath) {
      this.ui.updateHud(p, this.character);
      this.renderer; // keep loop alive
      this.fx?.update(dt);
      return;
    }

    // Timers
    p.atkCd = Math.max(0, p.atkCd - dt);
    p.attacking = Math.max(0, p.attacking - dt);
    for (let i = 0; i < p.skillCd.length; i++) p.skillCd[i] = Math.max(0, p.skillCd[i] - dt);
    p.sp = Math.min(p.maxSp, p.sp + 5 * dt);
    if (this.time > p.buffUntil) p.buffMul = 1;

    // Move
    let mx = 0;
    let mz = 0;
    if (this.keys.has("w") || this.keys.has("arrowup")) mz -= 1;
    if (this.keys.has("s") || this.keys.has("arrowdown")) mz += 1;
    if (this.keys.has("a") || this.keys.has("arrowleft")) mx -= 1;
    if (this.keys.has("d") || this.keys.has("arrowright")) mx += 1;
    const stealth = this.time < p.stealthUntil;
    const speed = p.speed * p.buffMul * (stealth ? 1.25 : 1);
    if (mx || mz) {
      const len = Math.hypot(mx, mz);
      p.x += (mx / len) * speed * dt;
      p.z += (mz / len) * speed * dt;
      p.moving = true;
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
    }
    p.rot = Math.atan2(this.aim.x - p.x, this.aim.z - p.z);

    // NPC / tower / portal proximity
    const near =
      MapService.isOverworld() && !DungeonService.isInside()
        ? NpcService.near(p.x, p.z, 3.5)[0] || null
        : null;
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

    // Standing on the portal pad auto-triggers (Metin-style)
    if (this.nearPortal) {
      this.useDemonPortal();
      this.ui.setNpcPrompt?.({
        name: DungeonService.canAdvance() || !DungeonService.isInside()
          ? "Portal — ascending…"
          : "Portal — leaving…",
      });
    } else if (this.nearWorldPortal) {
      this.ui.setNpcPrompt?.({ name: `${this.nearWorldPortal.label} — walk in / E` });
      this.useWorldPortal(this.nearWorldPortal);
    } else if (DungeonService.isInside() && DungeonService.run?.cleared && portalDist < 8) {
      this.ui.setNpcPrompt?.({
        name: DungeonService.canAdvance() ? "Blue portal — walk in / E" : "Exit portal — walk in / E",
      });
    } else if (this.nearTower) {
      this.ui.setNpcPrompt?.({ name: "Demon Tower — Enter (E)" });
    } else {
      this.ui.setNpcPrompt?.(near);
    }

    // Pulse edge portal rings
    for (const root of [this.overworld, this.valleyRoot]) {
      const ep = root?.userData?.edgePortal;
      if (ep?.userData?.ring) ep.userData.ring.rotation.z += dt * 1.2;
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

    // Attack
    if ((this.mouse.down || this.keys.has(" ")) && p.atkCd <= 0) {
      this.doAttack();
    }
    for (let i = 0; i < 4; i++) {
      if (this.keys.has(String(i + 1)) && p.skillCd[i] <= 0) {
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

    // Mesh + animation
    this.localMesh.position.set(p.x, 0, p.z);
    this.localMesh.rotation.y = p.rot;
    this.localMesh.visible = !stealth || Math.sin(this.time * 20) > -0.2;
    setNameplate(this.localMesh, p.name, p.hp / p.maxHp, p.level, p.classId);
    animateCharacter(this.localMesh, dt, {
      moving: p.moving,
      attacking: p.attacking,
      speed: p.buffMul,
    });

    // Camera follow — scroll zoom + RMB/MMB orbit
    this.camDist += (this.camDistTarget - this.camDist) * Math.min(1, 8 * dt);
    const dist = this.camDist;
    const height = dist * (0.35 + this.camPitch * 0.55);
    const flat = dist * (0.55 + (1.2 - this.camPitch) * 0.25);
    this.camOffset.set(
      Math.sin(this.camYaw) * flat,
      height,
      Math.cos(this.camYaw) * flat
    );
    const desired = new THREE.Vector3(p.x, 0, p.z).add(this.camOffset);
    this.camera.position.lerp(desired, 1 - Math.pow(0.0015, dt));
    this.camera.lookAt(p.x, 1.1, p.z);
    // FOV breathes slightly when zoomed in for a closer feel
    const wantFov = THREE.MathUtils.lerp(48, 36, clamp((62 - dist) / 50, 0, 1));
    this.camera.fov += (wantFov - this.camera.fov) * Math.min(1, 6 * dt);
    this.camera.updateProjectionMatrix();

    // Remotes interpolate
    for (const [, r] of this.remotes) {
      const t = r.target;
      if (!t) continue;
      r.state.x += (t.x - r.state.x) * Math.min(1, 12 * dt);
      r.state.z += (t.z - r.state.z) * Math.min(1, 12 * dt);
      r.state.rot = t.rot;
      r.state.hp = t.hp;
      r.state.maxHp = t.maxHp || r.state.maxHp || 100;
      r.mesh.position.set(r.state.x, 0, r.state.z);
      r.mesh.rotation.y = r.state.rot;
      const sameMap = (t.mapId || "overworld") === MapService.currentId;
      r.mesh.visible = sameMap && !t.stealth;
      setNameplate(r.mesh, t.name || "Player", (t.hp || 0) / (t.maxHp || 100), t.level || 1, t.classId);
      const moving =
        Math.hypot((t.x || 0) - (r._lx ?? t.x), (t.z || 0) - (r._lz ?? t.z)) > 0.02;
      r._lx = t.x;
      r._lz = t.z;
      animateCharacter(r.mesh, dt, {
        moving: !!t.moving || moving,
        attacking: t.attacking ? 0.22 : 0,
        speed: 1,
      });
    }

    // Host sim — Demon Tower uses local authority while inside
    if (this.isDungeonAuthority()) {
      this.updateDungeonWorld(dt);
    } else if (this.net.isHost) {
      this.updateHostWorld(dt);
      this.worldAcc += dt;
      // ~6 Hz world sync — lighter on Realtime than 8–12 Hz under multiplayer load
      if (this.worldAcc >= 0.16) {
        this.worldAcc = 0;
        this.net.sendWorld(this.serializeWorld());
      }
    } else {
      // clients still animate synced entities
      for (const [, m] of this.metins) {
        m.pulse = (m.pulse || 0) + dt * 2;
        if (m.mesh?.userData.crystal) {
          m.mesh.userData.crystal.rotation.y += dt * 1.4;
          m.mesh.userData.crystal.position.y = 1.55 + Math.sin(m.pulse) * 0.12;
        }
      }
      for (const [, mob] of this.mobs) {
        animateMob(mob.mesh, dt, true);
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
    // ~8 Hz player poses — enough for smooth remotes without saturating the channel
    if (this.sendAcc >= 1 / 8) {
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
        color: "#e23a2e",
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
        level: met.tier * 10,
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

    // bob loot
    for (const [, l] of this.loot) {
      l.t = (l.t || 0) + dt;
      l.mesh.position.y = 0.4 + Math.sin(l.t * 3) * 0.12;
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
    for (const [id, m] of [...this.mobs]) {
      if (m.hp <= 0) {
        this.scene.remove(m.mesh);
        this.mobs.delete(id);
      }
    }
  }

  updateHostWorld(dt) {
    if (DungeonService.isInside()) {
      this.updateDungeonWorld(dt);
      return;
    }

    const players = this.allCombatants();
    const fieldMobs = [...this.mobs.values()].filter((m) => !m.dungeon);
    const fieldMetins = [...this.metins.values()];
    const half = MAP_HALF;

    for (const m of fieldMetins) {
      const mid = m.mapId || "overworld";
      m.pulse += dt * 2;
      m.spawnT -= dt;
      if (m.mesh?.userData.crystal && this._entityOnCurrentMap(m)) {
        m.mesh.userData.crystal.rotation.y += dt * 1.4;
        m.mesh.userData.crystal.position.y = 1.55 + Math.sin(m.pulse) * 0.12;
        if (m.mesh.userData.shard) {
          m.mesh.userData.shard.rotation.y -= dt * 2;
          m.mesh.userData.shard.position.y = 1.2 + Math.cos(m.pulse) * 0.1;
        }
      }
      if (m.spawnT <= 0) {
        m.spawnT = 6;
        const count = fieldMobs.filter((x) => (x.mapId || "overworld") === mid).length;
        if (count < 35 && !inCity(m.x, m.z)) {
          const a = rand(0, Math.PI * 2);
          const kind =
            mid === "valley"
              ? Math.random() < 0.4
                ? "soldier"
                : "bandit"
              : Math.random() < 0.4
                ? "ork"
                : "wolf";
          this.spawnMob(m.x + Math.cos(a) * 4, m.z + Math.sin(a) * 4, kind, mid);
        }
      }
    }

    for (const mob of fieldMobs) {
      const mid = mob.mapId || "overworld";
      mob.atkT -= dt;
      let best = null;
      let bestD = 999;
      for (const pl of players) {
        if (pl.stealth) continue;
        if ((pl.mapId || "overworld") !== mid) continue;
        // Mobs ignore players deep in the city
        if (inCity(pl.x, pl.z) && dist2(pl.x, pl.z, 0, 0) < CITY_RADIUS - 3) continue;
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

      // Push mobs out if they wander into city core
      const cd = dist2(mob.x, mob.z, 0, 0);
      if (cd < CITY_RADIUS - 1) {
        const push = (CITY_RADIUS - 1) / (cd || 1);
        mob.x *= push;
        mob.z *= push;
      }

      mob.x = clamp(mob.x, -half + 1, half - 1);
      mob.z = clamp(mob.z, -half + 1, half - 1);
      mob.mesh.position.set(mob.x, 0, mob.z);
      if (this._entityOnCurrentMap(mob)) animateMob(mob.mesh, dt, moving);
    }

    this.waveTimer -= dt;
    if (this.waveTimer <= 0) {
      this.waveTimer = 14;
      const activeMaps = new Set(players.map((p) => p.mapId || "overworld"));
      for (const mid of activeMaps) {
        if (!MapService.isField(mid)) continue;
        const mapMobs = fieldMobs.filter((m) => (m.mapId || "overworld") === mid);
        const mapMetins = fieldMetins.filter((m) => (m.mapId || "overworld") === mid);
        if (mapMobs.length < 12) {
          for (let i = 0; i < 6; i++) {
            const p = wildPoint(CITY_RADIUS + 6, MAP_HALF - 7);
            const kind =
              mid === "valley"
                ? Math.random() < 0.35
                  ? "soldier"
                  : "bandit"
                : Math.random() < 0.35
                  ? "ork"
                  : "wolf";
            this.spawnMob(p.x, p.z, kind, mid);
          }
        }
        if (mapMetins.length < 3) {
          const p = wildPoint(CITY_RADIUS + 10, MAP_HALF - 8);
          this.spawnMetin(p.x, p.z, SpawnService.pickMetinTemplate().id, mid);
          if (mid === MapService.currentId) {
            this.net.sendEvent({ type: "toast", msg: "A new Metin rises beyond the walls", from: this.local.id });
          }
        }
      }
    }

    for (const [id, m] of [...this.mobs]) {
      if (m.hp <= 0) {
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

  doAttack() {
    const p = this.local;
    const cls = CLASSES[p.classId];
    p.atkCd = cls.cd;
    p.attacking = 0.28;
    this.updateAim();

    const ranged = cls.id === "shaman" || p.range > 4;
    const reach = ranged ? Math.max(p.range, 12) : p.range + 0.95;
    const target = this.pickAimedTarget(p, reach);
    // Always face the cursor / locked target
    if (target) p.rot = Math.atan2(target.x - p.x, target.z - p.z);
    else p.rot = Math.atan2(this.aim.x - p.x, this.aim.z - p.z);

    const roll = CombatService.rollHit({
      attacker: p,
      defender: { dex: target ? 1 : 4, def: 2, mdef: 0 },
      skillMul: p.buffMul,
      isMagic: cls.id === "shaman",
      // Cursor-locked targets almost always connect
      forcedHit: !!target,
    });
    if (!roll.hit) {
      this.ui.toast("Miss");
      this.fx?.slash(p.x, p.z, p.rot, "#888");
      return;
    }
    const dmg = roll.damage;
    const color = roll.kind === "crit" ? "#ffe08a" : p.color;
    audio.sfx(roll.kind === "crit" ? "crit" : "slash");
    this.fx?.skill(ranged ? "bolt" : "slash", p.x, p.z, p.rot, color, 2.2);

    if (ranged) {
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
      this.net.sendEvent({ type: "fx", kind: "skill", skill: "bolt", x: p.x, z: p.z, rot: p.rot, color: p.color, from: p.id });
      return;
    }

    // Melee: hit the cursor target (not a random wide cone)
    this.meleeHitAimed(p, dmg, target);
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
    this.net.sendEvent({ type: "fx", kind: "skill", skill: "slash", x: p.x, z: p.z, rot: p.rot, color, from: p.id });
  }

  castSkill(i) {
    const p = this.local;
    const skills = SkillService.listFor(p.classId, this.character?.spec);
    const sk = skills[i] || CLASSES[p.classId].skills[i];
    if (!sk || p.sp < sk.sp) {
      this.ui.toast("Not enough SP");
      return;
    }
    p.sp -= sk.sp;
    p.skillCd[i] = sk.cd;
    p.attacking = 0.3;
    const isMagic = !!sk.isMagic || (CLASSES[p.classId].id === "shaman" && sk.type !== "heal");
    const roll = CombatService.rollHit({
      attacker: p,
      defender: { dex: 2, def: 2, mdef: 0 },
      skillMul: (sk.mul || 1) * p.buffMul,
      isMagic,
    });
    const dmg = roll.hit ? roll.damage : Math.floor(p.atk * (sk.mul || 1) * p.buffMul);
    const color = p.color;
    const sfxMap = { heal: "heal", buff: "buff", aoe: "aoe", burst: "aoe", stealth: "skill", drain: "aoe", dot: "aoe" };
    audio.sfx(sfxMap[sk.type] || "skill");
    this.fx?.skill(sk.type, p.x, p.z, p.rot, color, sk.type === "burst" ? 3.8 : sk.type === "aoe" ? 5 : 4);

    switch (sk.type) {
      case "cone": {
        this.updateAim();
        p.rot = Math.atan2(this.aim.x - p.x, this.aim.z - p.z);
        this.meleeHit(p, dmg, 0.55, p.range + 1.2);
        this.net.sendEvent({ type: "melee", from: p.id, x: p.x, z: p.z, rot: p.rot, dmg, cone: 0.55, range: p.range + 1.2 });
        this.net.sendEvent({ type: "fx", kind: "skill", skill: "cone", x: p.x, z: p.z, rot: p.rot, color, from: p.id });
        break;
      }
      case "aoe":
        this.aoeHit(p.x, p.z, 5, dmg, p.id);
        this.net.sendEvent({ type: "aoe", from: p.id, x: p.x, z: p.z, r: 5, dmg });
        this.net.sendEvent({ type: "fx", kind: "skill", skill: "aoe", x: p.x, z: p.z, r: 5, color, from: p.id });
        break;
      case "bolt": {
        this.updateAim();
        const boltReach = Math.max(p.range, 14);
        const boltTarget = this.pickAimedTarget(p, boltReach);
        if (boltTarget) p.rot = Math.atan2(boltTarget.x - p.x, boltTarget.z - p.z);
        else p.rot = Math.atan2(this.aim.x - p.x, this.aim.z - p.z);
        this.fireBolt(p.id, p.x, p.z, p.rot, dmg, p.color, boltTarget);
        this.net.sendEvent({
          type: "bolt",
          from: p.id,
          x: p.x,
          z: p.z,
          rot: p.rot,
          dmg,
          color: p.color,
          targetId: boltTarget?.ref?.id,
          targetKind: boltTarget?.type,
        });
        this.net.sendEvent({ type: "fx", kind: "skill", skill: "bolt", x: p.x, z: p.z, rot: p.rot, color, from: p.id });
        break;
      }
      case "buff":
        p.buffMul = 1.45;
        p.buffUntil = this.time + 8;
        this.ui.toast("Power surges");
        this.net.sendEvent({ type: "fx", kind: "skill", skill: "buff", x: p.x, z: p.z, color, from: p.id });
        break;
      case "dash": {
        p.x += Math.sin(p.rot) * 7;
        p.z += Math.cos(p.rot) * 7;
        p.x = clamp(p.x, -MAP_HALF + 1.2, MAP_HALF - 1.2);
        p.z = clamp(p.z, -MAP_HALF + 1.2, MAP_HALF - 1.2);
        p.invulnUntil = this.time + 0.3;
        this.aoeHit(p.x, p.z, 2.8, dmg, p.id);
        this.net.sendEvent({ type: "aoe", from: p.id, x: p.x, z: p.z, r: 2.8, dmg });
        this.net.sendEvent({ type: "fx", kind: "skill", skill: "dash", x: p.x, z: p.z, rot: p.rot, color, from: p.id });
        break;
      }
      case "stealth":
        p.stealthUntil = this.time + 3.5;
        this.ui.toast("Vanished");
        this.net.sendEvent({ type: "fx", kind: "skill", skill: "stealth", x: p.x, z: p.z, color: "#3a9fd4", from: p.id });
        break;
      case "burst":
        this.aoeHit(p.x, p.z, 3.8, dmg, p.id);
        this.net.sendEvent({ type: "aoe", from: p.id, x: p.x, z: p.z, r: 3.8, dmg });
        this.net.sendEvent({ type: "fx", kind: "skill", skill: "burst", x: p.x, z: p.z, r: 3.8, color: "#3a9fd4", from: p.id });
        break;
      case "dot":
      case "drain":
        this.aoeHit(p.x, p.z, 4.5, dmg, p.id, sk.type === "drain");
        this.net.sendEvent({ type: "aoe", from: p.id, x: p.x, z: p.z, r: 4.5, dmg, drain: sk.type === "drain" });
        this.net.sendEvent({ type: "fx", kind: "skill", skill: sk.type, x: p.x, z: p.z, r: 4.5, color: "#8b3fd4", from: p.id });
        break;
      case "heal":
        p.hp = Math.min(p.maxHp, p.hp + p.maxHp * 0.4);
        this.ui.toast("Healed");
        this.net.sendEvent({ type: "fx", kind: "skill", skill: "heal", x: p.x, z: p.z, from: p.id });
        break;
      default:
        break;
    }
  }

  /** Apply damage to the cursor-aimed target. Host / dungeon authority resolve damage. */
  meleeHitAimed(p, dmg, target) {
    const canApply = this.net.isHost || this.isDungeonAuthority();
    if (!canApply) return;
    if (!target) {
      this.meleeHit(p, dmg, 0.38, p.range + 0.7);
      return;
    }
    if (target.type === "mob" && target.ref?.hp > 0) this.damageMob(target.ref, dmg, p.id);
    else if (target.type === "metin" && target.ref?.hp > 0) this.damageMetin(target.ref, dmg, p.id);
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
    if (dungeonAuth) return;
    for (const [, met] of this.metins) {
      if (!this._entityOnCurrentMap(met)) continue;
      if (this.inCone(p.x, p.z, p.rot, met.x, met.z, range + 1, cone)) {
        this.damageMetin(met, dmg, p.id);
      }
    }
  }

  aoeHit(x, z, r, dmg, fromId, drain = false) {
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
    if (!dungeonAuth) {
      for (const [, met] of this.metins) {
        if (!this._entityOnCurrentMap(met)) continue;
        if (dist2(x, z, met.x, met.z) <= r) {
          this.damageMetin(met, dmg, fromId);
          healed += dmg * 0.15;
        }
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
    const canDamage = this.net.isHost || dungeonAuth;

    // Soft-home toward locked target (all clients — looks right)
    if (b.targetId) {
      let tx = null;
      let tz = null;
      if (b.targetKind === "metin") {
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
      if (b.targetKind === "metin") {
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
    if (dungeonAuth) return;
    for (const [, met] of this.metins) {
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
    this.net.sendEvent({ type: "fx", kind: "hit", x: mob.x, z: mob.z, dmg: Math.floor(applied), from: fromId });
    if (mob.hp <= 0) {
      const gold = DropService.yangFor(mob.kind);
      const xp = DropService.xpFor(mob.kind);
      const killKind =
        mob.templateId === "soldier"
          ? "soldier"
          : mob.templateId === "bandit" || mob.kind === "human"
            ? "bandit"
            : mob.kind === "ork" || mob.kind === "elite_ork"
              ? "ork"
              : "wolf";
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
        this.spawnLootAt(mob.x, mob.z, mob.dropTable || mob.kind, 1, gold);
      }
      if (fromId === this.local?.id) this.rewardKill(xp, gold, killKind);
    }
  }

  damageMetin(met, dmg, fromId) {
    const applied = Math.max(1, Math.floor(dmg));
    met.hp -= applied;
    this.net.sendEvent({ type: "fx", kind: "hit", x: met.x, z: met.z, dmg: Math.floor(applied), from: fromId });
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
      if (this.net.isHost) this.spawnLootAt(met.x, met.z, met.dropTable || "metin", met.tier, gold);
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
    QuestService.onKill(this.character, kind === "metin" ? "metin" : kind);
    const ups = applyLevelUps(this.character, xp);
    this.local.level = this.character.level;
    if (ups) {
      this.syncDerived();
      this.local.hp = this.local.maxHp;
      this.local.sp = this.local.maxSp;
      this.ui.toast(ups > 1 ? `Level up ×${ups}!` : "Level up!");
      this.fx?.buff(this.local.x, this.local.z);
      audio.sfx("level");
    }
    this.onCharacterChange(this.character, this.local);
    this.refreshQuestMarkers();
  }

  spawnLootAt(x, z, kindOrTable, tier = 1, bonusGold = 0) {
    const tableId =
      kindOrTable === "metin" ||
      kindOrTable === "ork" ||
      kindOrTable === "wolf" ||
      kindOrTable === "bandit" ||
      kindOrTable === "human"
        ? kindOrTable === "human"
          ? "bandit"
          : kindOrTable
        : kindOrTable || "wolf";
    const drops = DropService.roll(tableId, tableId === "metin" ? 1 + tier * 0.08 : 1);
    if (bonusGold > 0 || Math.random() < 0.9) {
      this.createLoot(x + rand(-1, 1), z + rand(-1, 1), null, Math.max(20, Math.floor(bonusGold * 0.35)));
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
    mesh.position.set(x, 0.4, z);
    const mapId = MapService.currentId;
    mesh.visible = MapService.isField();
    this.scene.add(mesh);
    const entry = { id, x, z, item, gold, mesh, t: rand(0, 3), mapId };
    this.loot.set(id, entry);
    if (!silent) {
      this.net.sendEvent({ type: "loot", id, x, z, item, gold, mapId, from: this.local?.id });
      this.fx?.lootBeam(x, z, color);
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
    mesh.position.set(payload.x, 0.4, payload.z);
    this.scene.add(mesh);
    this.loot.set(payload.id, {
      id: payload.id,
      x: payload.x,
      z: payload.z,
      item: payload.item,
      gold: payload.gold,
      mesh,
      t: 0,
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

  takeDamage(amount) {
    const p = this.local;
    if (!p || this.pendingDeath || this.time < p.invulnUntil || this.time < p.stealthUntil) return;
    p.hp = CombatService.applyPlayerDamage(p.hp, Math.max(1, amount - (p.def || 0) * 0.55));
    this.fx?.hitSparks(p.x, p.z, "#ff6655");
    if (p.hp <= 0) {
      p.hp = 0;
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

  applyDamageToPlayer(playerId, amount, source) {
    this.net.sendEvent({ type: "pdmg", to: playerId, amount: Math.floor(amount), source });
    if (playerId === this.local?.id) this.takeDamage(amount);
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
    if (err) this.ui.toast(err);
    else {
      this.fx?.heal(this.local.x, this.local.z);
      this.ui.toast("Used");
      this.onCharacterChange(this.character, this.local);
    }
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
    this.fx?.heal(this.local.x, this.local.z);
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
      mob.x = m.x;
      mob.z = m.z;
      mob.hp = m.hp;
      mob.maxHp = m.maxHp;
      mob.dungeon = !!m.dungeon;
      mob.boss = !!m.boss;
      mob.mapId = m.mapId || "overworld";
      mob.mesh.position.set(m.x, 0, m.z);
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
      met.x = m.x;
      met.z = m.z;
      met.hp = m.hp;
      met.mapId = m.mapId || "overworld";
      met.mesh.position.set(m.x, 0, m.z);
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
      this.takeDamage(e.amount);
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
      if (e.kind === "skill") {
        this.fx?.skill(e.skill || "aoe", e.x, e.z, e.rot || 0, e.color || "#e8d48b", e.r || 4);
      }
      if (e.kind === "slash") this.fx?.skill("slash", e.x, e.z, e.rot || 0, e.color || "#e8d48b");
      if (e.kind === "aoe") this.fx?.skill("aoe", e.x, e.z, 0, e.color || "#c43c2e", e.r || 3);
      if (e.kind === "heal") this.fx?.heal(e.x, e.z);
      if (e.kind === "buff") this.fx?.buff(e.x, e.z);
      if (e.kind === "hit") this.fx?.hitSparks(e.x, e.z, "#fff");
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
      this.local.x = e.exit?.x ?? DEMON_TOWER.entrance.x - 5;
      this.local.z = e.exit?.z ?? DEMON_TOWER.entrance.z + 5;
      this.local.mapId = "overworld";
      this.onDungeonChange(null);
      this.ui.toast("Party left Demon Tower");
    }
  }
}

function prevent(e) {
  e.preventDefault();
}
