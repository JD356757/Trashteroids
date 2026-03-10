import * as THREE from 'three';

// Debug flag: when true projectiles will not move (helpful to verify ship movement)
const DEBUG_FREEZE_PROJECTILES = false;

export class ProjectileManager {
  constructor(scene) {
    this.scene = scene;
    this.active = [];    // { mesh, direction, position (ref) }
    this.speed = 540;     // units per second along direction
    this.maxDist = 320;  // despawn after this travel distance
    this.cooldown = 0;
    this.cooldownTime = 0.08; // seconds between shots (rapid-fire)
  }

  fire(origin, direction, playerVelocity) {
    if (this.cooldown > 0) return;
    this.cooldown = this.cooldownTime;

    const dir = direction.clone().normalize();
    // Combine bullet speed along aim direction with the player's current velocity
    const vel = dir.clone().multiplyScalar(this.speed);
    if (playerVelocity) vel.add(playerVelocity);

    // Beam core
    const coreGeo = new THREE.CylinderGeometry(0.08, 0.08, 2.0, 6);
    coreGeo.rotateX(Math.PI / 2);
    const coreMat = new THREE.MeshBasicMaterial({ color: 0x00ff44 });
    const core = new THREE.Mesh(coreGeo, coreMat);

    // Glow shell
    const glowGeo = new THREE.CylinderGeometry(0.18, 0.18, 2.0, 6);
    glowGeo.rotateX(Math.PI / 2);
    const glowMat = new THREE.MeshBasicMaterial({
      color: 0x00ff44,
      transparent: true,
      opacity: 0.35,
    });
    const glow = new THREE.Mesh(glowGeo, glowMat);
    core.add(glow);

    // Position at front of ship
    core.position.copy(origin).addScaledVector(dir, 1.5);

    // Orient beam along its travel direction
    core.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, -1), dir);

    this.scene.add(core);
    this.active.push({
      mesh: core,
      velocity: vel,
      position: core.position,
      prevPosition: core.position.clone(),
      travelled: 0,
    });
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
