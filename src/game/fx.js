import * as THREE from "three";

/**
 * Metin2-inspired combat VFX —
 * cast telegraphs (feet + cone/AoE preview), then skill-specific releases.
 */
export class FxSystem {
  constructor(scene) {
    this.scene = scene;
    this.fx = [];
  }

  /** Forward group: local +Z is facing (matches player rot). */
  _facingGroup(x, z, rot) {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.rotation.y = rot;
    this.scene.add(g);
    return g;
  }

  _mat(color, opacity = 0.8) {
    return new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
  }

  // ─── Basic melee ─────────────────────────────────────────────

  slash(x, z, rot, color = "#e8d48b") {
    const g = this._facingGroup(x, z, rot);

    const crescent = new THREE.Mesh(
      new THREE.RingGeometry(0.55, 2.35, 22, 1, -0.85, 1.7),
      this._mat("#fff6d0", 0.92)
    );
    crescent.position.set(0, 1.15, 1.35);
    crescent.rotation.y = Math.PI / 2;
    crescent.rotation.z = 0.15;
    g.add(crescent);

    const trail = new THREE.Mesh(
      new THREE.RingGeometry(0.7, 2.1, 18, 1, -0.7, 1.4),
      this._mat(color || "#e8d48b", 0.55)
    );
    trail.position.set(0, 1.05, 1.15);
    trail.rotation.y = Math.PI / 2;
    trail.rotation.z = -0.1;
    g.add(trail);

    const glint = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.18), this._mat("#ffffff", 0.55));
    glint.position.set(0, 1.0, 1.5);
    g.add(glint);

    this.fx.push({ mesh: g, life: 0.48, max: 0.48, type: "slashSwing" });
    this._burst(x + Math.sin(rot) * 1.6, z + Math.cos(rot) * 1.6, "#ffe9a0", 6, 1.1);
  }

  // ─── Cast telegraphs (return root so Game can follow player) ─

  /**
   * Feet charge ring + optional shape preview.
   * @returns {THREE.Group} root — caller may update .position / .rotation.y
   */
  telegraph(opts = {}) {
    const {
      x = 0,
      z = 0,
      rot = 0,
      color = "#6ec8ff",
      duration = 0.7,
      shape = "feet", // feet | cone | aoe | bolt
      radius = 4,
      reach = 3.4,
    } = opts;

    const root = this._facingGroup(x, z, rot);

    // Feet charge (always)
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.82, 36), this._mat(color, 0.8));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.06;
    root.add(ring);

    const inner = new THREE.Mesh(new THREE.CircleGeometry(0.45, 28), this._mat(color, 0.2));
    inner.rotation.x = -Math.PI / 2;
    inner.position.y = 0.05;
    root.add(inner);

    // Orbiting sparks
    for (let i = 0; i < 6; i++) {
      const ang = (i / 6) * Math.PI * 2;
      const spark = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 0.07), this._mat(color, 0.95));
      spark.position.set(Math.cos(ang) * 0.65, 0.35, Math.sin(ang) * 0.65);
      spark.userData.orbit = ang;
      root.add(spark);
    }

    if (shape === "cone") {
      const wedge = this._makeWedge(reach, 0.9, color, 0.28);
      wedge.position.y = 0.07;
      root.add(wedge);
      // faint arc edge
      const arc = new THREE.Mesh(
        new THREE.RingGeometry(reach * 0.92, reach, 28, 1, -0.9, 1.8),
        this._mat(color, 0.45)
      );
      arc.rotation.x = -Math.PI / 2;
      arc.position.y = 0.08;
      root.add(arc);
    } else if (shape === "aoe") {
      const aoeRing = new THREE.Mesh(
        new THREE.RingGeometry(Math.max(0.2, radius - 0.25), radius, 48),
        this._mat(color, 0.5)
      );
      aoeRing.rotation.x = -Math.PI / 2;
      aoeRing.position.y = 0.08;
      aoeRing.userData.pulse = true;
      root.add(aoeRing);
      const fill = new THREE.Mesh(new THREE.CircleGeometry(radius * 0.95, 40), this._mat(color, 0.1));
      fill.rotation.x = -Math.PI / 2;
      fill.position.y = 0.06;
      root.add(fill);
    } else if (shape === "bolt") {
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.12, 1.6, 8), this._mat(color, 0.45));
      beam.rotation.x = Math.PI / 2;
      beam.position.set(0, 1.2, 1.1);
      root.add(beam);
      const orb = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 10), this._mat(color, 0.75));
      orb.position.set(0, 1.25, 0.55);
      orb.userData.pulse = true;
      root.add(orb);
    }

    this.fx.push({
      mesh: root,
      life: duration,
      max: duration,
      type: "telegraph",
      follow: true,
    });
    return root;
  }

  /** Legacy feet-only cast (basic attacks) */
  cast(x, z, color = "#6ec8ff", duration = 0.55) {
    return this.telegraph({ x, z, color, duration, shape: "feet" });
  }

  _makeWedge(reach, spread, color, opacity) {
    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    shape.lineTo(-Math.sin(spread) * reach, Math.cos(spread) * reach);
    shape.absarc(0, 0, reach, Math.PI / 2 - spread, Math.PI / 2 + spread, false);
    shape.lineTo(0, 0);
    const mesh = new THREE.Mesh(new THREE.ShapeGeometry(shape), this._mat(color, opacity));
    mesh.rotation.x = -Math.PI / 2;
    return mesh;
  }

  // ─── Skill releases ──────────────────────────────────────────

  aoe(x, z, radius, color = "#c43c2e") {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(Math.max(0.15, radius - 0.35), radius, 40),
      this._mat(color, 0.75)
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(x, 0.1, z);
    this.scene.add(ring);
    this.fx.push({ mesh: ring, life: 0.85, max: 0.85, type: "expand", radius });

    const cyl = new THREE.Mesh(
      new THREE.CylinderGeometry(radius * 0.12, radius * 0.85, 3.0, 28, 1, true),
      this._mat(color, 0.35)
    );
    cyl.position.set(x, 1.5, z);
    this.scene.add(cyl);
    this.fx.push({ mesh: cyl, life: 0.7, max: 0.7, type: "riseFade", vy: 2.2 });

    this._meteorFlash(x, z, color);
    this._burst(x, z, color, 16, radius * 0.55);
  }

  cone(x, z, rot, color = "#e8d48b", reach = 3.4) {
    const g = this._facingGroup(x, z, rot);
    const wedge = this._makeWedge(reach, 0.85, color, 0.42);
    wedge.position.y = 0.07;
    g.add(wedge);

    for (let i = -1; i <= 1; i++) {
      const blade = new THREE.Mesh(new THREE.PlaneGeometry(0.28, 2.5), this._mat("#fff6d0", 0.7));
      blade.position.set(i * 0.55, 1.2, 1.55);
      blade.rotation.y = i * 0.25;
      g.add(blade);
    }

    this.fx.push({ mesh: g, life: 0.6, max: 0.6, type: "slashSwing" });
    this._burst(x + Math.sin(rot) * 2, z + Math.cos(rot) * 2, color, 10, 1.4);
  }

  boltTrail(x, z, color = "#4ecf8a") {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.35, 10, 10), this._mat(color, 0.8));
    mesh.position.set(x, 1.2, z);
    this.scene.add(mesh);
    this.fx.push({ mesh, life: 0.35, max: 0.35, type: "fade" });
    this._burst(x, z, color, 5, 0.7);
  }

  boltCast(x, z, rot, color = "#6ec8ff") {
    const g = this._facingGroup(x, z, rot);
    const core = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 10), this._mat(color, 0.9));
    core.position.set(0, 1.25, 0.9);
    g.add(core);
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.18, 1.4, 8), this._mat(color, 0.55));
    beam.rotation.x = Math.PI / 2;
    beam.position.set(0, 1.25, 1.5);
    g.add(beam);
    this.fx.push({ mesh: g, life: 0.45, max: 0.45, type: "fade" });
  }

  heal(x, z) {
    for (let i = 0; i < 8; i++) {
      const ang = (i / 8) * Math.PI * 2;
      const pillar = new THREE.Mesh(
        new THREE.CylinderGeometry(0.05, 0.09, 0.5, 6),
        this._mat("#4ecf8a", 0.85)
      );
      pillar.position.set(x + Math.cos(ang) * 0.85, 0.4, z + Math.sin(ang) * 0.85);
      this.scene.add(pillar);
      this.fx.push({ mesh: pillar, life: 1.05, max: 1.05, type: "riseFade", vy: 3.6 });
    }
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.15, 0.07, 8, 28), this._mat("#7dff9a", 0.7));
    ring.rotation.x = Math.PI / 2;
    ring.position.set(x, 0.45, z);
    this.scene.add(ring);
    this.fx.push({ mesh: ring, life: 0.9, max: 0.9, type: "spinFade", spin: 3.2 });
    this._burst(x, z, "#4ecf8a", 12, 1);
  }

  buff(x, z, color = "#e8d48b") {
    const spiral = new THREE.Mesh(new THREE.TorusGeometry(0.95, 0.09, 8, 28), this._mat(color, 0.8));
    spiral.position.set(x, 0.7, z);
    this.scene.add(spiral);
    this.fx.push({ mesh: spiral, life: 1.2, max: 1.2, type: "riseSpin", vy: 1.6, spin: 4.5 });

    const aura = new THREE.Mesh(
      new THREE.CylinderGeometry(1.15, 1.15, 2.8, 20, 1, true),
      this._mat(color, 0.22)
    );
    aura.position.set(x, 1.4, z);
    this.scene.add(aura);
    this.fx.push({ mesh: aura, life: 1.0, max: 1.0, type: "fade" });
    this._burst(x, z, color, 14, 1.2);
  }

  // ─── Named Metin2-flavored presets ───────────────────────────

  _threeWay(x, z, rot, color) {
    for (let i = 0; i < 3; i++) {
      this.slash(x, z, rot + (i - 1) * 0.55, color);
    }
    this.cone(x, z, rot, color, 3.6);
  }

  _swordSpin(x, z, rot, color, radius) {
    this.aoe(x, z, radius, color);
    for (let i = 0; i < 4; i++) {
      const a = rot + (i / 4) * Math.PI * 2;
      const blade = new THREE.Mesh(new THREE.PlaneGeometry(0.2, radius * 0.9), this._mat("#fff6d0", 0.7));
      const g = this._facingGroup(x, z, a);
      blade.position.set(0, 1.1, radius * 0.35);
      blade.rotation.x = 0.2;
      g.add(blade);
      this.fx.push({ mesh: g, life: 0.7, max: 0.7, type: "spinFade", spin: 8 });
    }
  }

  _flame(x, z, radius, color) {
    this.aoe(x, z, radius, color);
    for (let i = 0; i < 10; i++) {
      const ang = (i / 10) * Math.PI * 2;
      const r = radius * (0.25 + Math.random() * 0.55);
      const pillar = new THREE.Mesh(
        new THREE.ConeGeometry(0.25, 1.8 + Math.random(), 6),
        this._mat(color, 0.7)
      );
      pillar.position.set(x + Math.cos(ang) * r, 0.9, z + Math.sin(ang) * r);
      this.scene.add(pillar);
      this.fx.push({ mesh: pillar, life: 0.75, max: 0.75, type: "riseFade", vy: 2.8 });
    }
  }

  _lightning(x, z, rot, color) {
    this.boltCast(x, z, rot, color);
    for (let i = 0; i < 5; i++) {
      const bolt = new THREE.Mesh(
        new THREE.CylinderGeometry(0.04, 0.08, 3.2 + Math.random(), 5),
        this._mat(color, 0.85)
      );
      const ox = (Math.random() - 0.5) * 2.2;
      const oz = (Math.random() - 0.5) * 2.2;
      bolt.position.set(x + ox, 2.8, z + oz);
      this.scene.add(bolt);
      this.fx.push({ mesh: bolt, life: 0.35 + Math.random() * 0.2, max: 0.5, type: "dropFade", vy: -10 });
    }
    this._burst(x, z, color, 14, 1.6);
  }

  _summonLightning(x, z, radius, color) {
    this.aoe(x, z, radius, color);
    for (let i = 0; i < 8; i++) {
      const ang = (i / 8) * Math.PI * 2;
      const r = radius * 0.55;
      const bolt = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.1, 4, 5), this._mat(color, 0.8));
      bolt.position.set(x + Math.cos(ang) * r, 2.5, z + Math.sin(ang) * r);
      this.scene.add(bolt);
      this.fx.push({ mesh: bolt, life: 0.45, max: 0.45, type: "dropFade", vy: -9 });
    }
  }

  _poisonCloud(x, z, color) {
    for (let i = 0; i < 12; i++) {
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(0.35 + Math.random() * 0.35, 8, 8),
        this._mat(color, 0.45)
      );
      const ang = Math.random() * Math.PI * 2;
      mesh.position.set(x + Math.cos(ang) * 0.5, 0.6, z + Math.sin(ang) * 0.5);
      this.scene.add(mesh);
      this.fx.push({
        mesh,
        life: 1.0,
        max: 1.0,
        type: "spark",
        vx: Math.cos(ang) * 0.9,
        vy: 1.1,
        vz: Math.sin(ang) * 0.9,
      });
    }
  }

  _arrowRain(x, z, radius, color) {
    this.aoe(x, z, radius, color);
    for (let i = 0; i < 14; i++) {
      const ang = Math.random() * Math.PI * 2;
      const r = Math.random() * radius * 0.85;
      const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.55, 5), this._mat(color, 0.9));
      arrow.position.set(x + Math.cos(ang) * r, 3.5 + Math.random(), z + Math.sin(ang) * r);
      arrow.rotation.x = Math.PI;
      this.scene.add(arrow);
      this.fx.push({ mesh: arrow, life: 0.55, max: 0.55, type: "dropFade", vy: -8 });
    }
  }

  _stomp(x, z, radius, color) {
    this.aoe(x, z, radius, color);
    const shock = new THREE.Mesh(
      new THREE.RingGeometry(0.3, radius, 40),
      this._mat(color, 0.7)
    );
    shock.rotation.x = -Math.PI / 2;
    shock.position.set(x, 0.12, z);
    this.scene.add(shock);
    this.fx.push({ mesh: shock, life: 0.6, max: 0.6, type: "expand", radius });
  }

  _ambush(x, z, rot, color, radius) {
    this.aoe(x, z, radius, color);
    this.slash(x, z, rot, "#fff");
    this._smoke(x, z);
  }

  /**
   * Release FX — `fxName` selects Metin2-flavored preset; falls back to type.
   */
  skill(type, x, z, rot = 0, color = "#e8d48b", radius = 4, fxName = null) {
    const fx = fxName || type;
    switch (fx) {
      case "threeWay":
        this._threeWay(x, z, rot, color);
        break;
      case "swordSpin":
      case "dragonSwirl":
        this._swordSpin(x, z, rot, color, radius);
        break;
      case "charge":
        this.slash(x, z, rot, color);
        this.aoe(x, z, Math.min(radius || 2.8, 3.2), color);
        break;
      case "berserk":
      case "strongBody":
      case "enchant":
      case "bless":
      case "swift":
        this.buff(x, z, color);
        break;
      case "spirit":
      case "talisman":
      case "darkBolt":
        this.boltCast(x, z, rot, color);
        break;
      case "bash":
      case "stomp":
        this._stomp(x, z, radius, color);
        break;
      case "ambush":
        this._ambush(x, z, rot, color, radius);
        break;
      case "fastAttack":
      case "finger":
      case "claw":
        this.cone(x, z, rot, color, 3.5);
        break;
      case "daggers":
        this.aoe(x, z, radius, color);
        this.cone(x, z, rot, color, 3.2);
        break;
      case "smoke":
      case "stealth":
        this._smoke(x, z);
        break;
      case "poisonArrow":
        this.boltCast(x, z, rot, color);
        this._poisonCloud(x + Math.sin(rot) * 2, z + Math.cos(rot) * 2, color);
        break;
      case "fireArrow":
        this.boltCast(x, z, rot, color);
        this._burst(x + Math.sin(rot) * 2, z + Math.cos(rot) * 2, color, 10, 1.4);
        break;
      case "arrowShower":
        this._arrowRain(x, z, radius, color);
        break;
      case "multiShot":
        this.boltCast(x, z, rot, color);
        this.aoe(x + Math.sin(rot) * 2.5, z + Math.cos(rot) * 2.5, radius * 0.7, color);
        break;
      case "fear":
      case "curse":
        this.aoe(x, z, radius, color);
        this._vortex(x, z, color);
        break;
      case "flame":
        this._flame(x, z, radius, color);
        break;
      case "drain":
      case "dot":
        this.aoe(x, z, radius || 4.5, color);
        this._vortex(x, z, color);
        break;
      case "dragonRoar":
        this.aoe(x, z, radius, color);
        this.buff(x, z, color);
        break;
      case "lightning":
        this._lightning(x, z, rot, color);
        break;
      case "summonLightning":
        this._summonLightning(x, z, radius, color);
        break;
      case "cure":
      case "heal":
        this.heal(x, z);
        break;
      // type fallbacks
      case "slash":
        this.slash(x, z, rot, "#e8d48b");
        break;
      case "cone":
        this.cone(x, z, rot, color || "#e8d48b", 3.4);
        break;
      case "aoe":
      case "burst":
        this.aoe(x, z, radius, color);
        break;
      case "bolt":
        this.boltCast(x, z, rot, color);
        break;
      case "buff":
        this.buff(x, z, color);
        break;
      case "dash":
        this.slash(x, z, rot, "#e8d48b");
        this.aoe(x, z, 2.6, color);
        break;
      case "cast":
        this.cast(x, z, color, radius || 0.55);
        break;
      default:
        this.slash(x, z, rot, color || "#e8d48b");
    }
  }

  hitSparks(x, z, color = "#fff") {
    this._burst(x, z, color, 12, 1.5);
    const flash = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 8), this._mat(color, 0.7));
    flash.position.set(x, 1.1, z);
    this.scene.add(flash);
    this.fx.push({ mesh: flash, life: 0.2, max: 0.2, type: "fade" });
  }

  lootBeam(x, z, color = "#e8d48b") {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.18, 3.2, 8), this._mat(color, 0.6));
    mesh.position.set(x, 1.6, z);
    this.scene.add(mesh);
    this.fx.push({ mesh, life: 0.7, max: 0.7, type: "fade" });
  }

  _burst(x, z, color, count, speed) {
    for (let i = 0; i < count; i++) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.09, 0.09), this._mat(color, 1));
      mesh.position.set(x, 0.9 + Math.random() * 0.5, z);
      this.scene.add(mesh);
      const ang = Math.random() * Math.PI * 2;
      const sp = speed * (0.55 + Math.random());
      this.fx.push({
        mesh,
        life: 0.45 + Math.random() * 0.2,
        max: 0.55,
        type: "spark",
        vx: Math.cos(ang) * sp,
        vy: 2 + Math.random() * 3.5,
        vz: Math.sin(ang) * sp,
      });
    }
  }

  _meteorFlash(x, z, color) {
    const core = new THREE.Mesh(new THREE.SphereGeometry(0.5, 12, 12), this._mat(color, 0.85));
    core.position.set(x, 2.8, z);
    this.scene.add(core);
    this.fx.push({ mesh: core, life: 0.5, max: 0.5, type: "dropFade", vy: -5.2 });
  }

  _smoke(x, z) {
    for (let i = 0; i < 10; i++) {
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(0.3 + Math.random() * 0.3, 8, 8),
        this._mat("#6a8aa0", 0.4)
      );
      const ang = Math.random() * Math.PI * 2;
      mesh.position.set(x + Math.cos(ang) * 0.35, 0.5, z + Math.sin(ang) * 0.35);
      this.scene.add(mesh);
      this.fx.push({
        mesh,
        life: 0.95,
        max: 0.95,
        type: "spark",
        vx: Math.cos(ang) * 1.1,
        vy: 1.4,
        vz: Math.sin(ang) * 1.1,
      });
    }
  }

  _vortex(x, z, color) {
    const mesh = new THREE.Mesh(new THREE.TorusGeometry(1.35, 0.11, 8, 28), this._mat(color, 0.7));
    mesh.position.set(x, 0.75, z);
    this.scene.add(mesh);
    this.fx.push({ mesh, life: 1.0, max: 1.0, type: "riseSpin", vy: 1.2, spin: 8 });
  }

  update(dt) {
    for (const f of this.fx) {
      f.life -= dt;
      const t = Math.max(0, f.life / f.max);
      const root = f.mesh;
      const mats = [];
      root.traverse?.((o) => {
        if (o.material?.opacity != null) mats.push(o.material);
      });
      if (root.material?.opacity != null) mats.push(root.material);

      if (f.type === "fade" || f.type === "expand") {
        for (const mat of mats) mat.opacity = (mat.opacity > 0.5 ? 0.75 : 0.35) * t;
        if (f.type === "expand") {
          const s = 1 + (1 - t) * 1.35;
          root.scale.set(s, s, s);
        }
      }
      if (f.type === "slashSwing") {
        const s = 0.85 + (1 - t) * 0.45;
        root.scale.set(s, 1, 0.9 + (1 - t) * 0.35);
        for (const mat of mats) mat.opacity = Math.min(1, mat.opacity || 0.8) * t;
      }
      if (f.type === "castPulse" || f.type === "telegraph") {
        root.traverse((o) => {
          if (o.userData?.pulse) {
            const s = 0.9 + Math.sin((1 - t) * Math.PI * 5) * 0.12;
            o.scale.setScalar(s);
          }
          if (o.userData?.orbit != null) {
            o.userData.orbit += dt * 3.5;
            const ang = o.userData.orbit;
            o.position.x = Math.cos(ang) * 0.65;
            o.position.z = Math.sin(ang) * 0.65;
            o.position.y = 0.3 + Math.sin(ang * 2) * 0.15;
          }
        });
        for (const mat of mats) {
          if (mat.userData.baseOpacity == null) mat.userData.baseOpacity = mat.opacity;
          mat.opacity = mat.userData.baseOpacity * Math.max(0.2, t);
        }
      }
      if (f.type === "spark") {
        root.position.x += f.vx * dt;
        root.position.y += f.vy * dt;
        root.position.z += f.vz * dt;
        f.vy -= 14 * dt;
        for (const mat of mats) mat.opacity = t;
      }
      if (f.type === "riseFade") {
        root.position.y += (f.vy || 3) * dt;
        for (const mat of mats) mat.opacity = 0.7 * t;
        const s = 1 + (1 - t) * 0.5;
        root.scale.set(s, 1 + (1 - t), s);
      }
      if (f.type === "spinFade") {
        root.rotation.y += (f.spin || 4) * dt;
        for (const mat of mats) mat.opacity = 0.8 * t;
      }
      if (f.type === "riseSpin") {
        root.position.y += (f.vy || 2) * dt;
        root.rotation.y += (f.spin || 5) * dt;
        for (const mat of mats) mat.opacity = 0.75 * t;
      }
      if (f.type === "dropFade") {
        root.position.y += (f.vy || -5) * dt;
        for (const mat of mats) mat.opacity = 0.85 * t;
        root.scale.setScalar(0.6 + t * 0.8);
      }
    }
    this.fx = this.fx.filter((f) => {
      if (f.life > 0) return true;
      this._dispose(f.mesh);
      return false;
    });
  }

  _dispose(mesh) {
    this.scene.remove(mesh);
    mesh.traverse?.((o) => {
      o.geometry?.dispose?.();
      if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose?.());
      else o.material?.dispose?.();
    });
    mesh.geometry?.dispose?.();
    mesh.material?.dispose?.();
  }

  clear() {
    for (const f of this.fx) this._dispose(f.mesh);
    this.fx = [];
  }
}
