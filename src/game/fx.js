import * as THREE from "three";

/** Lightweight skill / hit VFX in the scene */
export class FxSystem {
  constructor(scene) {
    this.scene = scene;
    this.fx = [];
  }

  slash(x, z, rot, color = "#e8d48b") {
    const mesh = new THREE.Mesh(
      new THREE.RingGeometry(0.6, 2.2, 16, 1, -0.9, 1.8),
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.75,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.rotation.z = -rot;
    mesh.position.set(x, 0.4, z);
    this.scene.add(mesh);
    this.fx.push({ mesh, life: 0.28, max: 0.28, type: "fade" });
  }

  aoe(x, z, radius, color = "#c43c2e") {
    const mesh = new THREE.Mesh(
      new THREE.RingGeometry(0.2, radius, 32),
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.7,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, 0.15, z);
    this.scene.add(mesh);
    this.fx.push({ mesh, life: 0.45, max: 0.45, type: "expand", radius });

    const cyl = new THREE.Mesh(
      new THREE.CylinderGeometry(0.2, radius * 0.8, 0.1, 24, 1, true),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false })
    );
    cyl.position.set(x, 0.5, z);
    this.scene.add(cyl);
    this.fx.push({ mesh: cyl, life: 0.4, max: 0.4, type: "fade" });
  }

  boltTrail(x, z, color = "#4ecf8a") {
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.35, 8, 8),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.6 })
    );
    mesh.position.set(x, 1.1, z);
    this.scene.add(mesh);
    this.fx.push({ mesh, life: 0.2, max: 0.2, type: "fade" });
  }

  heal(x, z) {
    this.aoe(x, z, 2.2, "#4ecf8a");
  }

  buff(x, z) {
    this.aoe(x, z, 1.6, "#e8d48b");
  }

  hitSparks(x, z, color = "#fff") {
    for (let i = 0; i < 6; i++) {
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(0.12, 0.12, 0.12),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1 })
      );
      mesh.position.set(x, 1 + Math.random(), z);
      this.scene.add(mesh);
      const ang = Math.random() * Math.PI * 2;
      this.fx.push({
        mesh,
        life: 0.35,
        max: 0.35,
        type: "spark",
        vx: Math.cos(ang) * (2 + Math.random() * 3),
        vy: 2 + Math.random() * 3,
        vz: Math.sin(ang) * (2 + Math.random() * 3),
      });
    }
  }

  lootBeam(x, z, color = "#e8d48b") {
    const mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.08, 2.5, 6),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.55 })
    );
    mesh.position.set(x, 1.3, z);
    this.scene.add(mesh);
    this.fx.push({ mesh, life: 0.6, max: 0.6, type: "fade" });
  }

  update(dt) {
    for (const f of this.fx) {
      f.life -= dt;
      const t = Math.max(0, f.life / f.max);
      if (f.type === "fade" || f.type === "expand") {
        f.mesh.material.opacity = 0.75 * t;
        if (f.type === "expand") {
          const s = 1 + (1 - t) * 1.4;
          f.mesh.scale.set(s, s, s);
        }
      }
      if (f.type === "spark") {
        f.mesh.position.x += f.vx * dt;
        f.mesh.position.y += f.vy * dt;
        f.mesh.position.z += f.vz * dt;
        f.vy -= 12 * dt;
        f.mesh.material.opacity = t;
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
    }
    this.fx = [];
  }
}
