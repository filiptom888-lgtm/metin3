import * as THREE from "three";
import { CLASSES, MAP_HALF, clamp, dist2, rand, uid } from "./data.js";
import {
  createRenderer,
  createScene,
  createCamera,
  makePlayerMesh,
  makeMetinMesh,
  makeMobMesh,
  makeBoltMesh,
  setNameplate,
} from "./meshes.js";

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

    this.camOffset = new THREE.Vector3(0, 11, 12);
    this.time = 0;
    this.sendAcc = 0;
    this.worldAcc = 0;
    this.presenceAcc = 0;
    this.waveTimer = 2;
    this._last = 0;
    this._raf = 0;

    this._onKeyDown = (e) => {
      this.keys.add(e.key.toLowerCase());
      if ([" ", "tab"].includes(e.key.toLowerCase()) || e.key === "Tab") e.preventDefault();
      if (e.key === "Tab") this.ui.setScoreboard(true);
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

    // Net hooks
    net.onPeers = (peers) => this.onPeers(peers);
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

  start(profile) {
    this.stop(false);
    this.profile = profile;
    this.running = true;
    this.time = 0;
    this.clearWorldEntities();

    const cls = CLASSES[profile.classId];
    this.local = {
      id: profile.id,
      name: profile.name,
      classId: profile.classId,
      color: cls.color,
      x: rand(-3, 3),
      z: rand(-3, 3),
      y: 0,
      rot: 0,
      hp: cls.hp,
      maxHp: cls.hp,
      sp: cls.sp,
      maxSp: cls.sp,
      level: 1,
      atk: cls.atk,
      speed: cls.speed,
      range: cls.range,
      atkCd: 0,
      skillCd: [0, 0, 0, 0],
      buffUntil: 0,
      buffMul: 1,
      stealthUntil: 0,
      invulnUntil: 0,
      metins: 0,
      kills: 0,
      attacking: 0,
    };

    this.localMesh = makePlayerMesh(profile.classId, true);
    setNameplate(this.localMesh, profile.name);
    this.scene.add(this.localMesh);

    this.bindInput(true);
    this.resize();
    this.ui.bindLocal(this.local, cls);
    this.ui.setRoom(this.net.roomCode);
    this.ui.setHost(this.net.isHost);

    // If host (or solo after election), seed world shortly
    setTimeout(() => {
      if (this.net.isHost && this.metins.size === 0) this.seedWorld();
    }, 400);

    this._last = performance.now();
    this._raf = requestAnimationFrame((t) => this.loop(t));
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
    if (this.localMesh) {
      this.scene.remove(this.localMesh);
      this.localMesh = null;
    }
    for (const [, r] of this.remotes) this.scene.remove(r.mesh);
    this.remotes.clear();
    this.local = null;
  }

  clearWorldEntities() {
    for (const [, m] of this.mobs) this.scene.remove(m.mesh);
    for (const [, m] of this.metins) this.scene.remove(m.mesh);
    for (const b of this.bolts) this.scene.remove(b.mesh);
    this.mobs.clear();
    this.metins.clear();
    this.bolts = [];
  }

  seedWorld() {
    // 3 metins around map
    for (let i = 0; i < 3; i++) {
      const ang = (i / 3) * Math.PI * 2 + 0.4;
      this.spawnMetin(Math.cos(ang) * 14, Math.sin(ang) * 14, 1 + (i % 3));
    }
    for (let i = 0; i < 8; i++) {
      const ang = rand(0, Math.PI * 2);
      const r = rand(8, 18);
      this.spawnMob(Math.cos(ang) * r, Math.sin(ang) * r, Math.random() < 0.3 ? "ork" : "wolf");
    }
    this.ui.toast("Metins awakened");
  }

  spawnMetin(x, z, tier = 1) {
    const id = uid("met");
    const mesh = makeMetinMesh(tier);
    mesh.position.set(x, 0, z);
    this.scene.add(mesh);
    this.metins.set(id, {
      id,
      x,
      z,
      tier,
      hp: 220 + tier * 80,
      maxHp: 220 + tier * 80,
      mesh,
      pulse: rand(0, 10),
      spawnT: 3,
    });
    return id;
  }

  spawnMob(x, z, kind = "wolf") {
    const id = uid("mob");
    const mesh = makeMobMesh(kind);
    mesh.position.set(x, 0, z);
    this.scene.add(mesh);
    this.mobs.set(id, {
      id,
      kind,
      x,
      z,
      hp: kind === "ork" ? 90 : 55,
      maxHp: kind === "ork" ? 90 : 55,
      speed: kind === "ork" ? 3.2 : 4.2,
      atk: kind === "ork" ? 12 : 8,
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
    }
    p.x = clamp(p.x, -MAP_HALF + 1.2, MAP_HALF - 1.2);
    p.z = clamp(p.z, -MAP_HALF + 1.2, MAP_HALF - 1.2);
    p.rot = Math.atan2(this.aim.x - p.x, this.aim.z - p.z);

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

    // Mesh
    this.localMesh.position.set(p.x, 0, p.z);
    this.localMesh.rotation.y = p.rot;
    this.localMesh.visible = !stealth || Math.sin(this.time * 20) > -0.2;
    if (p.attacking > 0) {
      this.localMesh.userData.blade.rotation.x = Math.sin(p.attacking * 40) * 0.8;
    } else {
      this.localMesh.userData.blade.rotation.x = 0;
    }

    // Camera follow
    const desired = new THREE.Vector3(p.x, 0, p.z).add(this.camOffset);
    this.camera.position.lerp(desired, 1 - Math.pow(0.001, dt));
    this.camera.lookAt(p.x, 1.2, p.z);

    // Remotes interpolate
    for (const [, r] of this.remotes) {
      const t = r.target;
      if (!t) continue;
      r.state.x += (t.x - r.state.x) * Math.min(1, 12 * dt);
      r.state.z += (t.z - r.state.z) * Math.min(1, 12 * dt);
      r.state.rot = t.rot;
      r.state.hp = t.hp;
      r.mesh.position.set(r.state.x, 0, r.state.z);
      r.mesh.rotation.y = r.state.rot;
      r.mesh.visible = !t.stealth;
      if (t.attacking) r.mesh.userData.blade.rotation.x = Math.sin(this.time * 30) * 0.7;
      else r.mesh.userData.blade.rotation.x = 0;
    }

    // Host sim
    if (this.net.isHost) {
      this.updateHostWorld(dt);
      this.worldAcc += dt;
      if (this.worldAcc >= 0.12) {
        this.worldAcc = 0;
        this.net.sendWorld(this.serializeWorld());
      }
    } else {
      // animate metins locally from last state
      for (const [, m] of this.metins) {
        m.pulse += dt * 2;
        if (m.mesh?.userData.crystal) {
          m.mesh.userData.crystal.rotation.y += dt * 1.2;
          m.mesh.userData.crystal.position.y = 1.3 + Math.sin(m.pulse) * 0.08;
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

    this.ui.updateHud(p);
    this.ui.drawMinimap(p, this.remotes, this.metins, this.mobs);
  }

  updateHostWorld(dt) {
    const players = this.allCombatants();

    for (const [, m] of this.metins) {
      m.pulse += dt * 2;
      m.spawnT -= dt;
      if (m.mesh?.userData.crystal) {
        m.mesh.userData.crystal.rotation.y += dt * 1.2;
        m.mesh.userData.crystal.position.y = 1.3 + Math.sin(m.pulse) * 0.08;
      }
      if (m.spawnT <= 0) {
        m.spawnT = 5;
        if (this.mobs.size < 20) {
          const a = rand(0, Math.PI * 2);
          this.spawnMob(m.x + Math.cos(a) * 3, m.z + Math.sin(a) * 3, "wolf");
        }
      }
    }

    for (const [, mob] of this.mobs) {
      mob.atkT -= dt;
      // chase nearest player
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
      if (best && bestD < 16) {
        const ang = Math.atan2(best.x - mob.x, best.z - mob.z);
        if (bestD > 1.4) {
          mob.x += Math.sin(ang) * mob.speed * dt;
          mob.z += Math.cos(ang) * mob.speed * dt;
        } else if (mob.atkT <= 0) {
          mob.atkT = 1.1;
          this.applyDamageToPlayer(best.id, mob.atk, "mob");
        }
        mob.mesh.rotation.y = ang;
      }
      mob.x = clamp(mob.x, -MAP_HALF + 1, MAP_HALF - 1);
      mob.z = clamp(mob.z, -MAP_HALF + 1, MAP_HALF - 1);
      mob.mesh.position.set(mob.x, 0, mob.z);
    }

    this.waveTimer -= dt;
    if (this.waveTimer <= 0 && this.mobs.size < 6) {
      this.waveTimer = 12;
      for (let i = 0; i < 4; i++) {
        const a = rand(0, Math.PI * 2);
        const r = rand(10, 18);
        this.spawnMob(Math.cos(a) * r, Math.sin(a) * r);
      }
      // refresh metin if few left
      if (this.metins.size < 2) {
        const a = rand(0, Math.PI * 2);
        this.spawnMetin(Math.cos(a) * 14, Math.sin(a) * 14, 1 + ((Math.random() * 3) | 0));
        this.net.sendEvent({ type: "toast", msg: "A new Metin rises", from: this.local.id });
      }
    }

    // cleanup dead
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
    p.attacking = 0.2;
    const dmg = p.atk * p.buffMul;

    if (cls.id === "shaman" || p.range > 4) {
      this.fireBolt(p.id, p.x, p.z, p.rot, dmg, p.color);
      this.net.sendEvent({ type: "bolt", from: p.id, x: p.x, z: p.z, rot: p.rot, dmg, color: p.color });
      return;
    }

    this.meleeHit(p, dmg, 0.9);
    this.net.sendEvent({ type: "melee", from: p.id, x: p.x, z: p.z, rot: p.rot, dmg, cone: 0.9 });
  }

  castSkill(i) {
    const p = this.local;
    const sk = CLASSES[p.classId].skills[i];
    if (!sk || p.sp < sk.sp) {
      this.ui.toast("Not enough SP");
      return;
    }
    p.sp -= sk.sp;
    p.skillCd[i] = sk.cd;
    p.attacking = 0.25;
    const dmg = p.atk * p.buffMul;

    switch (sk.type) {
      case "cone":
        this.meleeHit(p, dmg * 1.7, 1.1, p.range + 1);
        this.net.sendEvent({ type: "melee", from: p.id, x: p.x, z: p.z, rot: p.rot, dmg: dmg * 1.7, cone: 1.1, range: p.range + 1 });
        break;
      case "aoe":
        this.aoeHit(p.x, p.z, 5, dmg * 1.5, p.id);
        this.net.sendEvent({ type: "aoe", from: p.id, x: p.x, z: p.z, r: 5, dmg: dmg * 1.5 });
        break;
      case "bolt":
        this.fireBolt(p.id, p.x, p.z, p.rot, dmg * 1.6, p.color);
        this.net.sendEvent({ type: "bolt", from: p.id, x: p.x, z: p.z, rot: p.rot, dmg: dmg * 1.6, color: p.color });
        break;
      case "buff":
        p.buffMul = 1.4;
        p.buffUntil = this.time + 6;
        this.ui.toast("Buffed");
        break;
      case "dash": {
        p.x += Math.sin(p.rot) * 6;
        p.z += Math.cos(p.rot) * 6;
        p.x = clamp(p.x, -MAP_HALF + 1.2, MAP_HALF - 1.2);
        p.z = clamp(p.z, -MAP_HALF + 1.2, MAP_HALF - 1.2);
        p.invulnUntil = this.time + 0.25;
        this.aoeHit(p.x, p.z, 2.5, dmg * 1.2, p.id);
        this.net.sendEvent({ type: "aoe", from: p.id, x: p.x, z: p.z, r: 2.5, dmg: dmg * 1.2 });
        break;
      }
      case "stealth":
        p.stealthUntil = this.time + 3.2;
        this.ui.toast("Smoke");
        break;
      case "burst":
        this.aoeHit(p.x, p.z, 3.5, dmg * 2.2, p.id);
        this.net.sendEvent({ type: "aoe", from: p.id, x: p.x, z: p.z, r: 3.5, dmg: dmg * 2.2 });
        break;
      case "dot":
      case "drain":
        this.aoeHit(p.x, p.z, 4.5, dmg * 1.3, p.id, sk.type === "drain");
        this.net.sendEvent({ type: "aoe", from: p.id, x: p.x, z: p.z, r: 4.5, dmg: dmg * 1.3, drain: sk.type === "drain" });
        break;
      case "heal":
        p.hp = Math.min(p.maxHp, p.hp + p.maxHp * 0.35);
        this.ui.toast("Healed");
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
    mob.hp -= dmg;
    this.net.sendEvent({ type: "fx", kind: "hit", x: mob.x, z: mob.z, dmg: Math.floor(dmg) });
    if (mob.hp <= 0) {
      this.net.sendEvent({ type: "kill", from: fromId, target: mob.id, kind: "mob" });
      if (fromId === this.local?.id) this.local.kills += 1;
    }
  }

  damageMetin(met, dmg, fromId) {
    met.hp -= dmg;
    this.net.sendEvent({ type: "fx", kind: "hit", x: met.x, z: met.z, dmg: Math.floor(dmg) });
    if (met.hp <= 0) {
      this.net.sendEvent({ type: "kill", from: fromId, target: met.id, kind: "metin", tier: met.tier });
      if (fromId === this.local?.id) {
        this.local.metins += 1;
        this.ui.toast(`Metin shattered · ${this.local.metins}`);
      }
    }
  }

  applyDamageToPlayer(playerId, amount, source) {
    this.net.sendEvent({ type: "pdmg", to: playerId, amount: Math.floor(amount), source });
    if (playerId === this.local?.id) this.takeDamage(amount);
  }

  takeDamage(amount) {
    const p = this.local;
    if (!p || this.time < p.invulnUntil || this.time < p.stealthUntil) return;
    p.hp -= amount;
    if (p.hp <= 0) {
      p.hp = p.maxHp;
      p.x = rand(-2, 2);
      p.z = rand(-2, 2);
      p.invulnUntil = this.time + 2;
      this.ui.toast("Respawned");
      this.net.sendEvent({ type: "toast", msg: `${p.name} fell`, from: p.id });
    }
  }

  serializeWorld() {
    return {
      mobs: [...this.mobs.values()].map((m) => ({
        id: m.id,
        kind: m.kind,
        x: m.x,
        z: m.z,
        hp: m.hp,
        maxHp: m.maxHp,
      })),
      metins: [...this.metins.values()].map((m) => ({
        id: m.id,
        tier: m.tier,
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
        const mesh = makeMobMesh(m.kind);
        this.scene.add(mesh);
        mob = { ...m, mesh, speed: 4, atk: 8, atkT: 1 };
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
        const mesh = makeMetinMesh(m.tier);
        this.scene.add(mesh);
        met = { ...m, mesh, pulse: 0, spawnT: 5 };
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
      setNameplate(mesh, s.name || "Player");
      this.scene.add(mesh);
      r = {
        mesh,
        state: { x: s.x, z: s.z, rot: s.rot || 0, hp: s.hp },
        target: s,
      };
      this.remotes.set(s.id, r);
    } else {
      setNameplate(r.mesh, s.name || "Player");
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
        setNameplate(mesh, peer.name || "Player");
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
      const fake = { x: e.x, z: e.z, rot: e.rot, range: e.range || 2.4, id: e.from, buffMul: 1, atk: e.dmg };
      // reuse cone logic with synthetic player
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
      void fake;
    }

    // Non-host attackers: host applies when receiving their melee — also local host already applied own melee.
    // Fix: when local is NOT host, send melee and host applies. When local IS host, already applied in meleeHit.
    // But wait — local non-host meleeHit returns early. Good.
    // Local host meleeHit applies. Event also sent — host receives broadcast with self:false so won't double. Good.

    if (e.type === "aoe" && this.net.isHost && e.from !== this.local?.id) {
      this.aoeHit(e.x, e.z, e.r, e.dmg, e.from, !!e.drain);
    }

    if (e.type === "pdmg" && e.to === this.local?.id) {
      this.takeDamage(e.amount);
    }

    if (e.type === "kill" && e.from === this.local?.id && e.kind === "mob") {
      // already counted if host local; for non-host credit:
      if (!this.net.isHost) this.local.kills += 1;
    }
    if (e.type === "kill" && e.from === this.local?.id && e.kind === "metin") {
      if (!this.net.isHost) {
        this.local.metins += 1;
        this.ui.toast(`Metin shattered · ${this.local.metins}`);
      }
    }

    if (e.type === "fx" && e.kind === "hit") {
      // lightweight flash via scale punch on nearest — skip heavy VFX
    }
  }
}

function prevent(e) {
  e.preventDefault();
}
