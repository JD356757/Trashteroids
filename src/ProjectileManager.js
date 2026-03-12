import * as THREE from 'three';

const DEBUG_FREEZE_PROJECTILES = false;
const _projectileDirection = new THREE.Vector3();
const _projectileVelocity = new THREE.Vector3();
const _projectileRight = new THREE.Vector3();
const _worldUp = new THREE.Vector3(0, 1, 0);
const _projectileForward = new THREE.Vector3(0, 0, -1);
const PROJECTILE_OFFSETS = [0.28, -0.28];

export class ProjectileManager {
  constructor(scene) {
    this.scene = scene;
    this.active = [];
    this.speed = 620;
    this.maxDist = 620;
    this.cooldown = 0;
    this.cooldownTime = 0.065;

    this.coreGeo = new THREE.CylinderGeometry(0.08, 0.08, 2.0, 6);
    this.coreGeo.rotateX(Math.PI / 2);
    this.coreMat = new THREE.MeshBasicMaterial({ color: 0x00ff44 });

    this.glowGeo = new THREE.CylinderGeometry(0.18, 0.18, 2.0, 6);
    this.glowGeo.rotateX(Math.PI / 2);
    this.glowMat = new THREE.MeshBasicMaterial({
      color: 0x66ff88,
      transparent: true,
      opacity: 0.55,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
  }

  canFire() {
    return this.cooldown <= 0;
  }

  fire(origin, direction, playerVelocity, playerQuat) {
    if (this.cooldown > 0) return false;
    this.cooldown = this.cooldownTime;

    _projectileDirection.copy(direction).normalize();
    _projectileVelocity.copy(_projectileDirection).multiplyScalar(this.speed);
    if (playerVelocity) _projectileVelocity.add(playerVelocity);

    if (playerQuat) {
      _projectileRight.set(1, 0, 0).applyQuaternion(playerQuat).normalize();
    } else {
      _projectileRight.crossVectors(_projectileDirection, _worldUp);
      if (_projectileRight.lengthSq() < 1e-6) _projectileRight.set(1, 0, 0);
      _projectileRight.normalize();
    }

    for (let i = 0; i < PROJECTILE_OFFSETS.length; i++) {
      const core = new THREE.Mesh(this.coreGeo, this.coreMat);
      const glow = new THREE.Mesh(this.glowGeo, this.glowMat);
      core.add(glow);

      core.position
        .copy(origin)
        .addScaledVector(_projectileDirection, 1.5)
        .addScaledVector(_projectileRight, PROJECTILE_OFFSETS[i]);

      core.quaternion.setFromUnitVectors(_projectileForward, _projectileDirection);

      this.scene.add(core);
      this.active.push({
        mesh: core,
        velocity: _projectileVelocity.clone(),
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
      return;
    }

    for (let i = this.active.length - 1; i >= 0; i--) {
      const projectile = this.active[i];
      projectile.prevPosition.copy(projectile.mesh.position);
      const step = projectile.velocity.length() * delta;
      projectile.mesh.position.addScaledVector(projectile.velocity, delta);
      projectile.travelled += step;
      if (projectile.travelled > this.maxDist) {
        this.scene.remove(projectile.mesh);
        this.active.splice(i, 1);
      }
    }
  }

  getActive() {
    return this.active;
  }

  remove(index) {
    const projectile = this.active[index];
    if (projectile) {
      this.scene.remove(projectile.mesh);
      this.active.splice(index, 1);
    }
  }
}
