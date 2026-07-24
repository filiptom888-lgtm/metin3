import { CLASSES, MAP_HALF, clamp, dist2, rand, uid, wildPoint, CITY_RADIUS, inCity } from "./data.js";
import {
  createRenderer,
  createScene,
  createCamera,
  makePlayerMesh,
  makeMetinMesh,
  makeMobMesh,
  makeNpcMesh,
  makeBoltMesh,
  setNameplate,
  animateCharacter,
  animateMob,
  animateNpc,
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
import { MONSTERS } from "../data/monsters.js";
import { METINS } from "../data/metins.js";
import * as THREE from "three";

export class Game {
  constructor(canvas, ui, net) {
    this.canvas = canvas;
    this.ui = ui;
    this.net = net;
    this.running = false;
    this.profile = null;

    this.renderer = createRenderer(canvas);
    const { scene } = createScene();
    this.scene = scene;
    this.camera = createCamera();
    this.fx = new FxSystem(scene);

    this.keys = new Set();
    this.mouse = { x: 0, y: 0, down: false, ndc: new THREE.Vector2() };
    this.raycaster = new THREE.Raycaster();
    this.groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    this.aim = new THREE.Vector3();

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
    this.nearNpc = null;
    this.pendingDeath = false;
    this.npcMeshes = [];

    this.camOffset = new THREE.Vector3(0, 26, 26);
    this.time = 0;
    this.sendAcc = 0;
    this.worldAcc = 0;
    this.presenceAcc = 0;
    this.waveTimer = 2;
    this._last = 0;
    this._raf = 0;

    this._onKeyDown = (e) => {
      const k = e.key.toLowerCase();
      this.keys.add(k);
      if ([" ", "tab"].includes(k) || e.key === "Tab") e.preventDefault();
      if (e.key === "Tab") this.ui.setScoreboard(true);
      if (k === "e" && this.nearNpc && !this.pendingDeath) this.onOpenNpc(this.nearNpc);
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
    };
    this._onDown = (e) => {
      if (e.button === 0) this.mouse.down = true;
    };
    this._onUp = () => {
      this.mouse.down = false;
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
      skillCd: [0, 0, 0, 0],
      buffUntil: 0,
      buffMul: 1,
      stealthUntil: 0,
      invulnUntil: 0,
      metins: character.metins || 0,
      kills: character.kills || 0,
      gold: character.gold || 0,
      attacking: 0,
    };

    this.localMesh = makePlayerMesh(character.classId, true);
    setNameplate(this.localMesh, character.name, 1, character.level, character.classId);
    this.scene.add(this.localMesh);
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
    for (const m of this.npcMeshes) this.scene.remove(m);
    this.npcMeshes = [];
    for (const npc of NpcService.list) {
      const mesh = makeNpcMesh(npc);
      mesh.position.set(npc.x, 0, npc.z);
      // Face roughly toward plaza center
      mesh.rotation.y = Math.atan2(-npc.x, -npc.z);
      this.scene.add(mesh);
      this.npcMeshes.push(mesh);
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
    this.canvas[fn]("contextmenu", prevent);
  }

  stop(unbind = true) {
    this.running = false;
    cancelAnimationFrame(this._raf);
    if (unbind) this.bindInput(false);
    this.clearWorldEntities();
    for (const m of this.npcMeshes || []) this.scene.remove(m);
    this.npcMeshes = [];
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

  seedWorld() {
    const seed = SpawnService.seedWild(this.character?.level || 1);
    for (const m of seed.metins) this.spawnMetin(m.x, m.z, m.templateId);
    for (const m of seed.mobs) this.spawnMob(m.x, m.z, m.templateId);
    this.ui.toast("Leave the city gates to hunt");
  }

  spawnMetin(x, z, templateIdOrTier = "battle") {
    const tmpl =
      typeof templateIdOrTier === "number"
        ? Object.values(METINS).find((t) => t.tier === templateIdOrTier) || METINS.battle
        : METINS[templateIdOrTier] || SpawnService.pickMetinTemplate();
    const id = uid("met");
    const mesh = makeMetinMesh(tmpl.tier, tmpl.color);
    mesh.position.set(x, 0, z);
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
    });
    return id;
  }

  spawnMob(x, z, kind = "wolf") {
    const tmpl = MONSTERS[kind] || MONSTERS.wolf;
    const id = uid("mob");
    const mesh = makeMobMesh(tmpl.id || tmpl.kind || kind);
    mesh.position.set(x, 0, z);
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
    });
    return id;
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
    for (let i = 0; i < 4; i++) p.skillCd[i] = Math.max(0, p.skillCd[i] - dt);
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
    p.x = clamp(p.x, -MAP_HALF + 1.2, MAP_HALF - 1.2);
    p.z = clamp(p.z, -MAP_HALF + 1.2, MAP_HALF - 1.2);
    p.rot = Math.atan2(this.aim.x - p.x, this.aim.z - p.z);

    // NPC proximity
    const near = NpcService.near(p.x, p.z, 3.5)[0] || null;
    this.nearNpc = near;
    this.ui.setNpcPrompt?.(near);

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

    // Camera follow
    const desired = new THREE.Vector3(p.x, 0, p.z).add(this.camOffset);
    this.camera.position.lerp(desired, 1 - Math.pow(0.002, dt));
    this.camera.lookAt(p.x, 0.8, p.z);

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
      r.mesh.visible = !t.stealth;
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

    // Host sim
    if (this.net.isHost) {
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
        name: p.name,
        classId: p.classId,
        color: p.color,
      });
    }

    this.ui.updateHud(p, this.character);
    this.ui.drawMinimap(p, this.remotes, this.metins, this.mobs);
    this.fx?.update(dt);
    for (const mesh of this.npcMeshes) animateNpc(mesh, dt);
    // Pulse marker on nearest NPC
    for (const mesh of this.npcMeshes) {
      const marker = mesh.userData?.marker;
      if (!marker) continue;
      const isNear = this.nearNpc && mesh.userData.npc?.id === this.nearNpc.id;
      marker.material.opacity = isNear ? 0.75 : 0.4;
      const s = isNear ? 1.15 + Math.sin(this.time * 4) * 0.08 : 1;
      marker.scale.set(s, s, s);
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

  updateHostWorld(dt) {
    const players = this.allCombatants();

    for (const [, m] of this.metins) {
      m.pulse += dt * 2;
      m.spawnT -= dt;
      if (m.mesh?.userData.crystal) {
        m.mesh.userData.crystal.rotation.y += dt * 1.4;
        m.mesh.userData.crystal.position.y = 1.55 + Math.sin(m.pulse) * 0.12;
        if (m.mesh.userData.shard) {
          m.mesh.userData.shard.rotation.y -= dt * 2;
          m.mesh.userData.shard.position.y = 1.2 + Math.cos(m.pulse) * 0.1;
        }
      }
      if (m.spawnT <= 0) {
        m.spawnT = 6;
        if (this.mobs.size < 35 && !inCity(m.x, m.z)) {
          const a = rand(0, Math.PI * 2);
          this.spawnMob(m.x + Math.cos(a) * 4, m.z + Math.sin(a) * 4, Math.random() < 0.4 ? "ork" : "wolf");
        }
      }
    }

    for (const [, mob] of this.mobs) {
      mob.atkT -= dt;
      let best = null;
      let bestD = 999;
      for (const pl of players) {
        if (pl.stealth) continue;
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

      mob.x = clamp(mob.x, -MAP_HALF + 1, MAP_HALF - 1);
      mob.z = clamp(mob.z, -MAP_HALF + 1, MAP_HALF - 1);
      mob.mesh.position.set(mob.x, 0, mob.z);
      animateMob(mob.mesh, dt, moving);
    }

    this.waveTimer -= dt;
    if (this.waveTimer <= 0 && this.mobs.size < 12) {
      this.waveTimer = 14;
      for (let i = 0; i < 6; i++) {
        const p = wildPoint(CITY_RADIUS + 6, MAP_HALF - 7);
        this.spawnMob(p.x, p.z, Math.random() < 0.35 ? "ork" : "wolf");
      }
      if (this.metins.size < 3) {
        const p = wildPoint(CITY_RADIUS + 10, MAP_HALF - 8);
        this.spawnMetin(p.x, p.z, SpawnService.pickMetinTemplate().id);
        this.net.sendEvent({ type: "toast", msg: "A new Metin rises beyond the walls", from: this.local.id });
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
      });
    }
    for (const [id, r] of this.remotes) {
      list.push({
        id,
        x: r.state.x,
        z: r.state.z,
        stealth: !!r.target?.stealth,
      });
    }
    return list;
  }

  doAttack() {
    const p = this.local;
    const cls = CLASSES[p.classId];
    p.atkCd = cls.cd;
    p.attacking = 0.28;
    const roll = CombatService.rollHit({
      attacker: p,
      defender: { dex: 2, def: 2, mdef: 0 },
      skillMul: p.buffMul,
      isMagic: cls.id === "shaman",
    });
    if (!roll.hit) {
      this.ui.toast("Miss");
      this.fx?.slash(p.x, p.z, p.rot, "#888");
      return;
    }
    const dmg = roll.damage;
    const color = roll.kind === "crit" ? "#ffe08a" : p.color;
    this.fx?.slash(p.x, p.z, p.rot, color);

    if (cls.id === "shaman" || p.range > 4) {
      this.fireBolt(p.id, p.x, p.z, p.rot, dmg, p.color);
      this.net.sendEvent({ type: "bolt", from: p.id, x: p.x, z: p.z, rot: p.rot, dmg, color: p.color });
      this.net.sendEvent({ type: "fx", kind: "slash", x: p.x, z: p.z, rot: p.rot, color: p.color, from: p.id });
      return;
    }

    this.meleeHit(p, dmg, 0.9);
    this.net.sendEvent({ type: "melee", from: p.id, x: p.x, z: p.z, rot: p.rot, dmg, cone: 0.9 });
    this.net.sendEvent({ type: "fx", kind: "slash", x: p.x, z: p.z, rot: p.rot, color: p.color, from: p.id });
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

    switch (sk.type) {
      case "cone":
        this.fx?.slash(p.x, p.z, p.rot, p.color);
        this.meleeHit(p, dmg, 1.1, p.range + 1);
        this.net.sendEvent({ type: "melee", from: p.id, x: p.x, z: p.z, rot: p.rot, dmg, cone: 1.1, range: p.range + 1 });
        this.net.sendEvent({ type: "fx", kind: "slash", x: p.x, z: p.z, rot: p.rot, color: p.color, from: p.id });
        break;
      case "aoe":
        this.fx?.aoe(p.x, p.z, 5, p.color);
        this.aoeHit(p.x, p.z, 5, dmg, p.id);
        this.net.sendEvent({ type: "aoe", from: p.id, x: p.x, z: p.z, r: 5, dmg });
        this.net.sendEvent({ type: "fx", kind: "aoe", x: p.x, z: p.z, r: 5, color: p.color, from: p.id });
        break;
      case "bolt":
        this.fx?.boltTrail(p.x, p.z, p.color);
        this.fireBolt(p.id, p.x, p.z, p.rot, dmg, p.color);
        this.net.sendEvent({ type: "bolt", from: p.id, x: p.x, z: p.z, rot: p.rot, dmg, color: p.color });
        break;
      case "buff":
        p.buffMul = 1.45;
        p.buffUntil = this.time + 8;
        this.fx?.buff(p.x, p.z);
        this.ui.toast("Power surges");
        this.net.sendEvent({ type: "fx", kind: "buff", x: p.x, z: p.z, from: p.id });
        break;
      case "dash": {
        p.x += Math.sin(p.rot) * 7;
        p.z += Math.cos(p.rot) * 7;
        p.x = clamp(p.x, -MAP_HALF + 1.2, MAP_HALF - 1.2);
        p.z = clamp(p.z, -MAP_HALF + 1.2, MAP_HALF - 1.2);
        p.invulnUntil = this.time + 0.3;
        this.fx?.slash(p.x, p.z, p.rot, "#e8d48b");
        this.aoeHit(p.x, p.z, 2.8, dmg, p.id);
        this.net.sendEvent({ type: "aoe", from: p.id, x: p.x, z: p.z, r: 2.8, dmg });
        break;
      }
      case "stealth":
        p.stealthUntil = this.time + 3.5;
        this.fx?.aoe(p.x, p.z, 2, "#3a9fd4");
        this.ui.toast("Vanished");
        break;
      case "burst":
        this.fx?.aoe(p.x, p.z, 3.8, "#3a9fd4");
        this.aoeHit(p.x, p.z, 3.8, dmg, p.id);
        this.net.sendEvent({ type: "aoe", from: p.id, x: p.x, z: p.z, r: 3.8, dmg });
        this.net.sendEvent({ type: "fx", kind: "aoe", x: p.x, z: p.z, r: 3.8, color: "#3a9fd4", from: p.id });
        break;
      case "dot":
      case "drain":
        this.fx?.aoe(p.x, p.z, 4.5, "#8b3fd4");
        this.aoeHit(p.x, p.z, 4.5, dmg, p.id, sk.type === "drain");
        this.net.sendEvent({ type: "aoe", from: p.id, x: p.x, z: p.z, r: 4.5, dmg, drain: sk.type === "drain" });
        this.net.sendEvent({ type: "fx", kind: "aoe", x: p.x, z: p.z, r: 4.5, color: "#8b3fd4", from: p.id });
        break;
      case "heal":
        p.hp = Math.min(p.maxHp, p.hp + p.maxHp * 0.4);
        this.fx?.heal(p.x, p.z);
        this.ui.toast("Healed");
        this.net.sendEvent({ type: "fx", kind: "heal", x: p.x, z: p.z, from: p.id });
        break;
      default:
        break;
    }
  }

  meleeHit(p, dmg, cone, range = p.range) {
    // Only host applies world damage; local player requests via events — but for responsiveness host OR local if host
    if (!this.net.isHost) {
      // still show local swing; host will also receive event and apply
      return;
    }
    for (const [, mob] of this.mobs) {
      if (this.inCone(p.x, p.z, p.rot, mob.x, mob.z, range + 0.6, cone)) {
        this.damageMob(mob, dmg, p.id);
      }
    }
    for (const [, met] of this.metins) {
      if (this.inCone(p.x, p.z, p.rot, met.x, met.z, range + 1, cone)) {
        this.damageMetin(met, dmg, p.id);
      }
    }
  }

  aoeHit(x, z, r, dmg, fromId, drain = false) {
    if (!this.net.isHost) return;
    let healed = 0;
    for (const [, mob] of this.mobs) {
      if (dist2(x, z, mob.x, mob.z) <= r) {
        this.damageMob(mob, dmg, fromId);
        healed += dmg * 0.2;
      }
    }
    for (const [, met] of this.metins) {
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

  fireBolt(owner, x, z, rot, dmg, color) {
    const mesh = makeBoltMesh(color);
    mesh.position.set(x, 1.1, z);
    this.scene.add(mesh);
    this.bolts.push({
      owner,
      x,
      z,
      vx: Math.sin(rot) * 18,
      vz: Math.cos(rot) * 18,
      dmg,
      life: 1.2,
      mesh,
      hit: false,
    });
  }

  resolveBolt(b) {
    if (b.hit || !this.net.isHost) return;
    for (const [, mob] of this.mobs) {
      if (dist2(b.x, b.z, mob.x, mob.z) < 0.9) {
        this.damageMob(mob, b.dmg, b.owner);
        b.hit = true;
        b.life = 0;
        return;
      }
    }
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
    const roll = CombatService.rollHit({
      attacker: { atk: dmg, matk: dmg, dex: 5, crit: 0.05, pierce: 0.02 },
      defender: { def: mob.def || 0, mdef: 0, dex: 2 },
      skillMul: 1,
    });
    const applied = roll.hit ? Math.max(1, Math.floor(dmg - (mob.def || 0) * 0.35)) : 0;
    if (!applied) {
      this.net.sendEvent({ type: "fx", kind: "hit", x: mob.x, z: mob.z, dmg: 0, from: fromId });
      return;
    }
    mob.hp -= applied;
    this.net.sendEvent({ type: "fx", kind: "hit", x: mob.x, z: mob.z, dmg: Math.floor(applied), from: fromId });
    if (mob.hp <= 0) {
      const gold = DropService.yangFor(mob.kind);
      const xp = DropService.xpFor(mob.kind);
      this.net.sendEvent({
        type: "kill",
        from: fromId,
        target: mob.id,
        kind: mob.kind === "ork" ? "ork" : "wolf",
        x: mob.x,
        z: mob.z,
        gold,
        xp,
      });
      if (this.net.isHost) this.spawnLootAt(mob.x, mob.z, mob.dropTable || mob.kind, 1, gold);
      if (fromId === this.local?.id) this.rewardKill(xp, gold, mob.kind === "ork" ? "ork" : "wolf");
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
    }
    this.onCharacterChange(this.character, this.local);
  }

  spawnLootAt(x, z, kindOrTable, tier = 1, bonusGold = 0) {
    const tableId =
      kindOrTable === "metin" || kindOrTable === "ork" || kindOrTable === "wolf"
        ? kindOrTable === "ork"
          ? "ork"
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
    this.scene.add(mesh);
    const entry = { id, x, z, item, gold, mesh, t: rand(0, 3) };
    this.loot.set(id, entry);
    if (!silent) {
      this.net.sendEvent({ type: "loot", id, x, z, item, gold, from: this.local?.id });
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
      })),
    };
  }

  onWorldState(w) {
    if (!w) return;
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
      met.mesh.position.set(m.x, 0, m.z);
    }
    for (const [id, met] of [...this.metins]) {
      if (!seenT.has(id)) {
        this.scene.remove(met.mesh);
        this.metins.delete(id);
      }
    }
  }

  onRemotePlayer(s) {
    let r = this.remotes.get(s.id);
    if (!r) {
      const mesh = makePlayerMesh(s.classId || "warrior", false);
      setNameplate(mesh, s.name || "Player", (s.hp || 100) / (s.maxHp || 100), s.level || 1, s.classId);
      this.scene.add(mesh);
      r = {
        mesh,
        state: { x: s.x, z: s.z, rot: s.rot || 0, hp: s.hp, maxHp: s.maxHp || 100 },
        target: s,
      };
      this.remotes.set(s.id, r);
    } else {
      setNameplate(r.mesh, s.name || "Player", (s.hp || 100) / (s.maxHp || 100), s.level || 1, s.classId);
      r.target = s;
    }
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

    if (e.type === "bolt" && e.from !== this.local?.id) {
      this.fireBolt(e.from, e.x, e.z, e.rot, e.dmg, e.color || "#e8d48b");
    }

    if (e.type === "melee" && this.net.isHost && e.from !== this.local?.id) {
      for (const [, mob] of this.mobs) {
        if (this.inCone(e.x, e.z, e.rot, mob.x, mob.z, (e.range || 2.4) + 0.6, e.cone || 0.9)) {
          this.damageMob(mob, e.dmg, e.from);
        }
      }
      for (const [, met] of this.metins) {
        if (this.inCone(e.x, e.z, e.rot, met.x, met.z, (e.range || 2.4) + 1, e.cone || 0.9)) {
          this.damageMetin(met, e.dmg, e.from);
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
      if (!this.net.isHost) {
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
      if (e.kind === "slash") this.fx?.slash(e.x, e.z, e.rot || 0, e.color || "#e8d48b");
      if (e.kind === "aoe") this.fx?.aoe(e.x, e.z, e.r || 3, e.color || "#c43c2e");
      if (e.kind === "heal") this.fx?.heal(e.x, e.z);
      if (e.kind === "buff") this.fx?.buff(e.x, e.z);
      if (e.kind === "hit") this.fx?.hitSparks(e.x, e.z, "#fff");
    }
  }
}

function prevent(e) {
  e.preventDefault();
}
