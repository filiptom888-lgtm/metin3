import * as THREE from "three";

/**
 * Metin2-inspired combat VFX — forward-facing slash arcs, cast windups,
 * longer skill releases. No misleading ground "hit zones" behind the player.
 */
export class FxSystem {
  constructor(scene) {
    this.scene = scene;
    this.fx = [];
  }

  /** Forward group: local +Z is the facing direction (matches player rot). */
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

  /** Basic / cone melee — crescent in FRONT of the character */
  slash(x, z, rot, color = "#e8d48b") {
    const g = this._facingGroup(x, z, rot);

    // Vertical crescent (main blade trail) — sits ahead of the feet
    const crescent = new THREE.Mesh(
      new THREE.RingGeometry(0.55, 2.35, 22, 1, -0.85, 1.7),
      this._mat("#fff6d0", 0.9)
    );
    crescent.position.set(0, 1.15, 1.35);
    crescent.rotation.y = Math.PI / 2;
    crescent.rotation.z = 0.15;
    g.add(crescent);

    // Soft gold follow-arc (slightly delayed look via longer life)
    const trail = new THREE.Mesh(
      new THREE.RingGeometry(0.7, 2.1, 18, 1, -0.7, 1.4),
      this._mat(color || "#e8d48b", 0.55)
    );
    trail.position.set(0, 1.05, 1.15);
    trail.rotation.y = Math.PI / 2;
    trail.rotation.z = -0.1;
    g.add(trail);

    // Thin horizontal glint at mid-swing height (not a ground AoE)
    const glint = new THREE.Mesh(
      new THREE.PlaneGeometry(2.4, 0.18),
      this._mat("#ffffff", 0.55)
    );
    glint.position.set(0, 1.0, 1.5);
    g.add(glint);

    this.fx.push({ mesh: g, life: 0.42, max: 0.42, type: "slashSwing" });
    this._burst(x + Math.sin(rot) * 1.6, z + Math.cos(rot) * 1.6, "#ffe9a0", 6, 1.1);
  }

  /** Cast windup circle under feet / hands — Metin2-style charge */
  cast(x, z, color = "#6ec8ff", duration = 0.55) {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.55, 0.85, 36),
      this._mat(color, 0.75)
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(x, 0.06, z);
    this.scene.add(ring);
    this.fx.push({ mesh: ring, life: duration, max: duration, type: "castPulse" });

    const inner = new THREE.Mesh(
      new THREE.CircleGeometry(0.5, 28),
      this._mat(color, 0.22)
    );
    inner.rotation.x = -Math.PI / 2;
    inner.position.set(x, 0.05, z);
    this.scene.add(inner);
    this.fx.push({ mesh: inner, life: duration, max: duration, type: "fade" });

    // Rising runes / sparks
    for (let i = 0; i < 5; i++) {
      const ang = (i / 5) * Math.PI * 2;
      const spark = new THREE.Mesh(
        new THREE.BoxGeometry(0.08, 0.08, 0.08),
        this._mat(color, 0.9)
      );
      spark.position.set(x + Math.cos(ang) * 0.7, 0.3, z + Math.sin(ang) * 0.7);
      this.scene.add(spark);
      this.fx.push({
        mesh: spark,
        life: duration,
        max: duration,
        type: "spark",
        vx: Math.cos(ang) * 0.4,
        vy: 2.2,
        vz: Math.sin(ang) * 0.4,
      });
    }
  }

  aoe(x, z, radius, color = "#c43c2e") {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(Math.max(0.15, radius - 0.35), radius, 40),
      this._mat(color, 0.7)
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(x, 0.1, z);
    this.scene.add(ring);
    this.fx.push({ mesh: ring, life: 0.75, max: 0.75, type: "expand", radius });

    const cyl = new THREE.Mesh(
      new THREE.CylinderGeometry(radius * 0.15, radius * 0.9, 2.8, 28, 1, true),
      this._mat(color, 0.35)
    );
    cyl.position.set(x, 1.4, z);
    this.scene.add(cyl);
    this.fx.push({ mesh: cyl, life: 0.65, max: 0.65, type: "riseFade", vy: 2.4 });

    this._meteorFlash(x, z, color);
    this._burst(x, z, color, 16, radius * 0.55);
  }

  /** Forward cone skill flash (matches facing — not a random red blob) */
  cone(x, z, rot, color = "#e8d48b", reach = 3.2) {
    const g = this._facingGroup(x, z, rot);

    // Soft wedge on the ground in front only
    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    const spread = 0.85;
    shape.lineTo(-Math.sin(spread) * reach, Math.cos(spread) * reach);
    shape.absarc(0, 0, reach, Math.PI / 2 - spread, Math.PI / 2 + spread, false);
    shape.lineTo(0, 0);
    const wedge = new THREE.Mesh(
      new THREE.ShapeGeometry(shape),
      this._mat(color, 0.4)
    );
    wedge.rotation.x = -Math.PI / 2;
    wedge.position.y = 0.07;
    g.add(wedge);

    // Rising blade fans
    for (let i = -1; i <= 1; i++) {
      const blade = new THREE.Mesh(
        new THREE.PlaneGeometry(0.28, 2.4),
        this._mat("#fff6d0", 0.65)
      );
      blade.position.set(i * 0.55, 1.2, 1.5);
      blade.rotation.y = i * 0.25;
      g.add(blade);
    }

    this.fx.push({ mesh: g, life: 0.55, max: 0.55, type: "slashSwing" });
    this._burst(x + Math.sin(rot) * 2, z + Math.cos(rot) * 2, color, 10, 1.4);
  }

  boltTrail(x, z, color = "#4ecf8a") {
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.35, 10, 10),
      this._mat(color, 0.8)
    );
    mesh.position.set(x, 1.2, z);
    this.scene.add(mesh);
    this.fx.push({ mesh, life: 0.35, max: 0.35, type: "fade" });
    this._burst(x, z, color, 5, 0.7);
  }

  /** Projectile muzzle flash in facing direction */
  boltCast(x, z, rot, color = "#6ec8ff") {
    const g = this._facingGroup(x, z, rot);
    const core = new THREE.Mesh(
      new THREE.SphereGeometry(0.28, 10, 10),
      this._mat(color, 0.9)
    );
    core.position.set(0, 1.25, 0.9);
    g.add(core);
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.18, 1.4, 8),
      this._mat(color, 0.55)
    );
    beam.rotation.x = Math.PI / 2;
    beam.position.set(0, 1.25, 1.5);
    g.add(beam);
    this.fx.push({ mesh: g, life: 0.4, max: 0.4, type: "fade" });
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
      this.fx.push({ mesh: pillar, life: 0.95, max: 0.95, type: "riseFade", vy: 3.8 });
    }
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(1.15, 0.07, 8, 28),
      this._mat("#7dff9a", 0.7)
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.set(x, 0.45, z);
    this.scene.add(ring);
    this.fx.push({ mesh: ring, life: 0.8, max: 0.8, type: "spinFade", spin: 3.5 });
    this._burst(x, z, "#4ecf8a", 12, 1);
  }

  buff(x, z) {
    const spiral = new THREE.Mesh(
      new THREE.TorusGeometry(0.95, 0.09, 8, 28),
      this._mat("#e8d48b", 0.8)
    );
    spiral.position.set(x, 0.7, z);
    this.scene.add(spiral);
    this.fx.push({ mesh: spiral, life: 1.1, max: 1.1, type: "riseSpin", vy: 1.8, spin: 5 });

    const aura = new THREE.Mesh(
      new THREE.CylinderGeometry(1.15, 1.15, 2.8, 20, 1, true),
      this._mat("#ffe08a", 0.25)
    );
    aura.position.set(x, 1.4, z);
    this.scene.add(aura);
    this.fx.push({ mesh: aura, life: 0.9, max: 0.9, type: "fade" });
    this._burst(x, z, "#e8d48b", 14, 1.2);
  }

  skill(type, x, z, rot = 0, color = "#e8d48b", radius = 4) {
    switch (type) {
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
      case "heal":
        this.heal(x, z);
        break;
      case "buff":
        this.buff(x, z);
        break;
      case "dash":
        this.slash(x, z, rot, "#e8d48b");
        this.aoe(x, z, 2.6, color);
        break;
      case "stealth":
        this._smoke(x, z);
        break;
      case "dot":
      case "drain":
        this.aoe(x, z, radius || 4.5, "#8b3fd4");
        this._vortex(x, z, "#8b3fd4");
        break;
      case "cast":
        this.cast(x, z, color, radius || 0.55);
        break;
      default:
        this.slash(x, z, rot, "#e8d48b");
    }
  }

  hitSparks(x, z, color = "#fff") {
    this._burst(x, z, color, 12, 1.5);
    const flash = new THREE.Mesh(
      new THREE.SphereGeometry(0.35, 8, 8),
      this._mat(color, 0.7)
    );
    flash.position.set(x, 1.1, z);
    this.scene.add(flash);
    this.fx.push({ mesh: flash, life: 0.2, max: 0.2, type: "fade" });
  }

  lootBeam(x, z, color = "#e8d48b") {
    const mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.1, 0.18, 3.2, 8),
      this._mat(color, 0.6)
    );
    mesh.position.set(x, 1.6, z);
    this.scene.add(mesh);
    this.fx.push({ mesh: mesh, life: 0.7, max: 0.7, type: "fade" });
  }

  _burst(x, z, color, count, speed) {
    for (let i = 0; i < count; i++) {
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(0.09, 0.09, 0.09),
        this._mat(color, 1)
      );
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
    const core = new THREE.Mesh(
      new THREE.SphereGeometry(0.5, 12, 12),
      this._mat(color, 0.85)
    );
    core.position.set(x, 2.8, z);
    this.scene.add(core);
    this.fx.push({ mesh: core, life: 0.45, max: 0.45, type: "dropFade", vy: -5.5 });
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
        life: 0.85,
        max: 0.85,
        type: "spark",
        vx: Math.cos(ang) * 1.1,
        vy: 1.4,
        vz: Math.sin(ang) * 1.1,
      });
    }
  }

  _vortex(x, z, color) {
    const mesh = new THREE.Mesh(
      new THREE.TorusGeometry(1.35, 0.11, 8, 28),
      this._mat(color, 0.7)
    );
    mesh.position.set(x, 0.75, z);
    this.scene.add(mesh);
    this.fx.push({ mesh, life: 0.9, max: 0.9, type: "riseSpin", vy: 1.3, spin: 9 });
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
        // Sweep + fade — scale forward slightly
        const s = 0.85 + (1 - t) * 0.45;
        root.scale.set(s, 1, 0.9 + (1 - t) * 0.35);
        for (const mat of mats) mat.opacity = Math.min(1, mat.opacity || 0.8) * t;
      }
      if (f.type === "castPulse") {
        const s = 0.85 + Math.sin((1 - t) * Math.PI * 3) * 0.12 + (1 - t) * 0.35;
        root.scale.set(s, s, s);
        for (const mat of mats) mat.opacity = 0.75 * t;
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
