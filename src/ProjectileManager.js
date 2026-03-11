import * as THREE from 'three';

// Debug flag: when true projectiles will not move (helpful to verify ship movement)
const DEBUG_FREEZE_PROJECTILES = false;

export class ProjectileManager {
  constructor(scene) {
    this.scene = scene;
    this.active = [];    // { mesh, direction, position (ref) }
    this.speed = 540;     // units per second along direction
    this.maxDist = 520;  // despawn after this travel distance
    this.cooldown = 0;
    this.cooldownTime = 0.08; // seconds between shots (rapid-fire)
  }

  fire(origin, direction, playerVelocity, playerQuat) {
    if (this.cooldown > 0) return false;
    this.cooldown = this.cooldownTime;

    const dir = direction.clone().normalize();
    // Combine bullet speed along aim direction with the player's current velocity
    const vel = dir.clone().multiplyScalar(this.speed);
    if (playerVelocity) vel.add(playerVelocity);

    // Determine lateral right vector for dual-shot offsets.
    // Prefer the ship's local right (includes roll) if available, otherwise
    // fall back to cross(dir, worldUp).
    const right = new THREE.Vector3();
    if (playerQuat) {
      right.set(1, 0, 0).applyQuaternion(playerQuat).normalize();
    } else {
      const up = new THREE.Vector3(0, 1, 0);
      right.crossVectors(dir, up);
      if (right.lengthSq() < 1e-6) right.set(1, 0, 0);
      right.normalize();
    }

    const lateralOffset = 0.28; // how far apart the two bullets spawn

    // Reusable geometries/materials per-shot (small, cheap)
    const coreGeo = new THREE.CylinderGeometry(0.08, 0.08, 2.0, 6);
    coreGeo.rotateX(Math.PI / 2);
    const coreMat = new THREE.MeshBasicMaterial({ color: 0x00ff44 });

    const glowGeo = new THREE.CylinderGeometry(0.18, 0.18, 2.0, 6);
    glowGeo.rotateX(Math.PI / 2);
    const glowMat = new THREE.MeshBasicMaterial({
      color: 0x66ff88,
      transparent: true,
      opacity: 0.55,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    const offsets = [lateralOffset, -lateralOffset];
    for (let i = 0; i < offsets.length; i++) {
      const core = new THREE.Mesh(coreGeo, coreMat);
      const glow = new THREE.Mesh(glowGeo, glowMat);
      core.add(glow);

      // Position: forward from origin, then apply lateral offset
      core.position.copy(origin).addScaledVector(dir, 1.5).addScaledVector(right, offsets[i]);

      // Orient beam along its travel direction
      core.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, -1), dir);

      this.scene.add(core);
      this.active.push({
        mesh: core,
        velocity: vel.clone(),
        position: core.position,
        prevPosition: core.position.clone(),
        travelled: 0,
      });
    }

    return true;
  }

  update(delta) {
    this.cooldown -= delta;

    if (DEBUG_FREEZE_PROJECTILES) {
      // Don't move projectiles — leave them where they spawned so
      // it's easy to observe ship movement independently.
      return;
    }

    for (let i = this.active.length - 1; i >= 0; i--) {
      const p = this.active[i];
      p.prevPosition.copy(p.mesh.position);
      const step = p.velocity.length() * delta;
      p.mesh.position.addScaledVector(p.velocity, delta);
      p.travelled += step;
      if (p.travelled > this.maxDist) {
        this.scene.remove(p.mesh);
        this.active.splice(i, 1);
      }
    }
  }

  getActive() {
    return this.active;
  }

  remove(index) {
    const p = this.active[index];
    if (p) {
      this.scene.remove(p.mesh);
      this.active.splice(index, 1);
    }
  }
}
