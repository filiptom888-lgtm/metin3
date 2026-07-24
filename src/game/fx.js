import * as THREE from "three";

/** Skill / hit VFX — volumetric bursts, arcs, pillars (not just ground rings) */
export class FxSystem {
  constructor(scene) {
    this.scene = scene;
    this.fx = [];
  }

  slash(x, z, rot, color = "#e8d48b") {
    // Arc slash
    const mesh = new THREE.Mesh(
      new THREE.RingGeometry(0.5, 2.4, 20, 1, -1.0, 2.0),
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.85,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.rotation.z = -rot;
    mesh.position.set(x, 0.55, z);
    this.scene.add(mesh);
    this.fx.push({ mesh, life: 0.32, max: 0.32, type: "fade" });

    // Vertical blade sheet
    const blade = new THREE.Mesh(
      new THREE.PlaneGeometry(0.35, 2.2),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.65, side: THREE.DoubleSide, depthWrite: false })
    );
    blade.position.set(x + Math.sin(rot) * 1.2, 1.2, z + Math.cos(rot) * 1.2);
    blade.rotation.y = rot;
    this.scene.add(blade);
    this.fx.push({ mesh: blade, life: 0.22, max: 0.22, type: "fade" });

    this._burst(x, z, color, 8, 1.2);
  }

  aoe(x, z, radius, color = "#c43c2e") {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.2, radius, 36),
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.75,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(x, 0.12, z);
    this.scene.add(ring);
    this.fx.push({ mesh: ring, life: 0.5, max: 0.5, type: "expand", radius });

    // Rising shockwave cylinder
    const cyl = new THREE.Mesh(
      new THREE.CylinderGeometry(radius * 0.2, radius * 0.95, 2.2, 24, 1, true),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.4, side: THREE.DoubleSide, depthWrite: false })
    );
    cyl.position.set(x, 1.1, z);
    this.scene.add(cyl);
    this.fx.push({ mesh: cyl, life: 0.45, max: 0.45, type: "riseFade", vy: 3 });

    // Outer flash disc
    const disc = new THREE.Mesh(
      new THREE.CircleGeometry(radius * 0.55, 28),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false })
    );
    disc.rotation.x = -Math.PI / 2;
    disc.position.set(x, 0.08, z);
    this.scene.add(disc);
    this.fx.push({ mesh: disc, life: 0.35, max: 0.35, type: "fade" });

    this._burst(x, z, color, 14, radius * 0.6);
  }

  boltTrail(x, z, color = "#4ecf8a") {
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.4, 10, 10),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.75 })
    );
    mesh.position.set(x, 1.2, z);
    this.scene.add(mesh);
    this.fx.push({ mesh, life: 0.25, max: 0.25, type: "fade" });
    this._burst(x, z, color, 6, 0.8);
  }

  heal(x, z) {
    // Rising green pillars
    for (let i = 0; i < 6; i++) {
      const ang = (i / 6) * Math.PI * 2;
      const px = x + Math.cos(ang) * 0.7;
      const pz = z + Math.sin(ang) * 0.7;
      const pillar = new THREE.Mesh(
        new THREE.CylinderGeometry(0.06, 0.1, 0.4, 6),
        new THREE.MeshBasicMaterial({ color: "#4ecf8a", transparent: true, opacity: 0.8, depthWrite: false })
      );
      pillar.position.set(px, 0.4, pz);
      this.scene.add(pillar);
      this.fx.push({ mesh: pillar, life: 0.7, max: 0.7, type: "riseFade", vy: 4.5 });
    }
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(1.1, 0.08, 8, 24),
      new THREE.MeshBasicMaterial({ color: "#7dff9a", transparent: true, opacity: 0.7, depthWrite: false })
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.set(x, 0.4, z);
    this.scene.add(ring);
    this.fx.push({ mesh: ring, life: 0.55, max: 0.55, type: "spinFade", spin: 4 });
    this._burst(x, z, "#4ecf8a", 10, 1);
  }

  buff(x, z) {
    const spiral = new THREE.Mesh(
      new THREE.TorusGeometry(0.9, 0.1, 8, 28),
      new THREE.MeshBasicMaterial({ color: "#e8d48b", transparent: true, opacity: 0.75, depthWrite: false })
    );
    spiral.position.set(x, 0.8, z);
    this.scene.add(spiral);
    this.fx.push({ mesh: spiral, life: 0.8, max: 0.8, type: "riseSpin", vy: 2.2, spin: 6 });

    const aura = new THREE.Mesh(
      new THREE.CylinderGeometry(1.2, 1.2, 2.5, 20, 1, true),
      new THREE.MeshBasicMaterial({ color: "#ffe08a", transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false })
    );
    aura.position.set(x, 1.25, z);
    this.scene.add(aura);
    this.fx.push({ mesh: aura, life: 0.65, max: 0.65, type: "fade" });
    this._burst(x, z, "#e8d48b", 12, 1.2);
  }

  /** Skill-type dispatcher for richer casts */
  skill(type, x, z, rot = 0, color = "#e8d48b", radius = 4) {
    switch (type) {
      case "cone":
      case "slash":
        this.slash(x, z, rot, color);
        this._groundArc(x, z, rot, color);
        break;
      case "aoe":
      case "burst":
        this.aoe(x, z, radius, color);
        this._meteorFlash(x, z, color);
        break;
      case "bolt":
        this.boltTrail(x, z, color);
        this._groundArc(x, z, rot, color);
        break;
      case "heal":
        this.heal(x, z);
        break;
      case "buff":
        this.buff(x, z);
        break;
      case "dash":
        this.slash(x, z, rot, "#e8d48b");
        this.aoe(x, z, 2.5, color);
        break;
      case "stealth":
        this.aoe(x, z, 2.2, "#3a9fd4");
        this._smoke(x, z);
        break;
      case "dot":
      case "drain":
        this.aoe(x, z, radius || 4.5, "#8b3fd4");
        this._vortex(x, z, "#8b3fd4");
        break;
      default:
        this.aoe(x, z, 2.5, color);
    }
  }

  hitSparks(x, z, color = "#fff") {
    this._burst(x, z, color, 10, 1.4);
  }

  lootBeam(x, z, color = "#e8d48b") {
    const mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.1, 0.18, 3.2, 8),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.6, depthWrite: false })
    );
    mesh.position.set(x, 1.6, z);
    this.scene.add(mesh);
    this.fx.push({ mesh, life: 0.7, max: 0.7, type: "fade" });
    const spark = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.25, 0),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9 })
    );
    spark.position.set(x, 2.8, z);
    this.scene.add(spark);
    this.fx.push({ mesh: spark, life: 0.7, max: 0.7, type: "spinFade", spin: 8 });
  }

  _burst(x, z, color, count, speed) {
    for (let i = 0; i < count; i++) {
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(0.1, 0.1, 0.1),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1 })
      );
      mesh.position.set(x, 0.8 + Math.random() * 0.6, z);
      this.scene.add(mesh);
      const ang = Math.random() * Math.PI * 2;
      const sp = speed * (0.6 + Math.random());
      this.fx.push({
        mesh,
        life: 0.4 + Math.random() * 0.2,
        max: 0.5,
        type: "spark",
        vx: Math.cos(ang) * sp,
        vy: 2 + Math.random() * 4,
        vz: Math.sin(ang) * sp,
      });
    }
  }

  _groundArc(x, z, rot, color) {
    const mesh = new THREE.Mesh(
      new THREE.TorusGeometry(1.6, 0.06, 6, 20, Math.PI * 0.9),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.7, depthWrite: false })
    );
    mesh.position.set(x, 0.35, z);
    mesh.rotation.set(-Math.PI / 2, 0, -rot + Math.PI * 0.55);
    this.scene.add(mesh);
    this.fx.push({ mesh, life: 0.3, max: 0.3, type: "fade" });
  }

  _meteorFlash(x, z, color) {
    const core = new THREE.Mesh(
      new THREE.SphereGeometry(0.55, 12, 12),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85 })
    );
    core.position.set(x, 2.4, z);
    this.scene.add(core);
    this.fx.push({ mesh: core, life: 0.35, max: 0.35, type: "dropFade", vy: -6 });
  }

  _smoke(x, z) {
    for (let i = 0; i < 8; i++) {
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(0.35 + Math.random() * 0.25, 8, 8),
        new THREE.MeshBasicMaterial({ color: "#6a8aa0", transparent: true, opacity: 0.45, depthWrite: false })
      );
      const ang = Math.random() * Math.PI * 2;
      mesh.position.set(x + Math.cos(ang) * 0.4, 0.5, z + Math.sin(ang) * 0.4);
      this.scene.add(mesh);
      this.fx.push({
        mesh,
        life: 0.7,
        max: 0.7,
        type: "spark",
        vx: Math.cos(ang) * 1.2,
        vy: 1.5,
        vz: Math.sin(ang) * 1.2,
      });
    }
  }

  _vortex(x, z, color) {
    const mesh = new THREE.Mesh(
      new THREE.TorusGeometry(1.4, 0.12, 8, 28),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.7, depthWrite: false })
    );
    mesh.position.set(x, 0.7, z);
    this.scene.add(mesh);
    this.fx.push({ mesh, life: 0.7, max: 0.7, type: "riseSpin", vy: 1.5, spin: 10 });
  }

  update(dt) {
    for (const f of this.fx) {
      f.life -= dt;
      const t = Math.max(0, f.life / f.max);
      const mat = f.mesh.material;
      if (f.type === "fade" || f.type === "expand") {
        mat.opacity = 0.8 * t;
        if (f.type === "expand") {
          const s = 1 + (1 - t) * 1.5;
          f.mesh.scale.set(s, s, s);
        }
      }
      if (f.type === "spark") {
        f.mesh.position.x += f.vx * dt;
        f.mesh.position.y += f.vy * dt;
        f.mesh.position.z += f.vz * dt;
        f.vy -= 14 * dt;
        mat.opacity = t;
      }
      if (f.type === "riseFade") {
        f.mesh.position.y += (f.vy || 3) * dt;
        mat.opacity = 0.7 * t;
        const s = 1 + (1 - t) * 0.5;
        f.mesh.scale.set(s, 1 + (1 - t), s);
      }
      if (f.type === "spinFade") {
        f.mesh.rotation.y += (f.spin || 4) * dt;
        mat.opacity = 0.8 * t;
      }
      if (f.type === "riseSpin") {
        f.mesh.position.y += (f.vy || 2) * dt;
        f.mesh.rotation.y += (f.spin || 5) * dt;
        mat.opacity = 0.75 * t;
      }
      if (f.type === "dropFade") {
        f.mesh.position.y += (f.vy || -5) * dt;
        mat.opacity = 0.85 * t;
        const s = 0.6 + t * 0.8;
        f.mesh.scale.setScalar(s);
      }
    }
    this.fx = this.fx.filter((f) => {
      if (f.life > 0) return true;
      this.scene.remove(f.mesh);
      f.mesh.geometry?.dispose?.();
      f.mesh.material?.dispose?.();
      return false;
    });
  }

  clear() {
    for (const f of this.fx) {
      this.scene.remove(f.mesh);
      f.mesh.geometry?.dispose?.();
      f.mesh.material?.dispose?.();
    }
    this.fx = [];
  }
}
