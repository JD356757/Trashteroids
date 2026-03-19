import * as THREE from 'three';

const _dirForward = new THREE.Vector3(0, 0, -1);
const _fallbackUp = new THREE.Vector3(0, 1, 0);
const _right = new THREE.Vector3();
const _fireDirection = new THREE.Vector3();
const _baseVelocity = new THREE.Vector3();
const _spawnOffset = new THREE.Vector3();
const _offsets = [0.28, -0.28];
const PROJECTILE_COLORS = {
  normal: { core: 0x00ff44, glow: 0x66ff88 },
  vaporizer: { core: 0x47b8ed, glow: 0x89cff0 },
};

export class ProjectileManager {
  constructor(scene) {
    this.scene = scene;
    this.active = [];    // { mesh, direction, position (ref) }
    this.speed = 4000;     // units per second along direction
    this.maxDist = 2500;  // despawn after this travel distance
    this.cooldown = 0;
    this.cooldownTime = 0.035; // seconds between shots (rapid-fire)

    this._coreGeometry = new THREE.CylinderGeometry(0.12, 0.12, 5.0, 6);
    this._coreGeometry.rotateX(Math.PI / 2);
    this._glowGeometry = new THREE.CylinderGeometry(0.22, 0.22, 5.5, 6);
    this._glowGeometry.rotateX(Math.PI / 2);

    this._styles = {};
    for (const [type, colors] of Object.entries(PROJECTILE_COLORS)) {
      this._styles[type] = {
        coreMat: new THREE.MeshBasicMaterial({ color: colors.core }),
        glowMat: new THREE.MeshBasicMaterial({
          color: colors.glow,
          transparent: true,
          opacity: 0.55,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
      };
    }
  }

  fire(origin, direction, playerVelocity, playerQuat, type = 'normal', frameDelta = 0) {
    if (this.cooldown > 0) return 0;
    this.cooldown = this.cooldownTime;

    _fireDirection.copy(direction).normalize();
    // Combine bullet speed along aim direction with the player's full velocity
    _baseVelocity.copy(_fireDirection).multiplyScalar(this.speed);
    if (playerVelocity) {
      _baseVelocity.add(playerVelocity);
    }

    // Determine lateral right vector for dual-shot offsets.
    // Prefer the ship's local right (includes roll) if available, otherwise
    // fall back to cross(dir, worldUp).
    if (playerQuat) {
      _right.set(1, 0, 0).applyQuaternion(playerQuat).normalize();
    } else {
      _right.crossVectors(_fireDirection, _fallbackUp);
      if (_right.lengthSq() < 1e-6) _right.set(1, 0, 0);
      _right.normalize();
    }

    const style = this._styles[type] || this._styles.normal;

    let spawnedCount = 0;
    for (let i = 0; i < _offsets.length; i++) {
      const core = new THREE.Mesh(this._coreGeometry, style.coreMat);
      const glow = new THREE.Mesh(this._glowGeometry, style.glowMat);
      core.add(glow);

      // Position from player-local muzzles so visual roll/pitch/yaw all influence shot origin.
      if (playerQuat) {
        _spawnOffset.set(_offsets[i], 0, -1.5).applyQuaternion(playerQuat);
        core.position.copy(origin).add(_spawnOffset).addScaledVector(_fireDirection, 20.5);
      } else {
        // Fallback when ship orientation is unavailable.
        core.position.copy(origin).addScaledVector(_fireDirection, 10.5).addScaledVector(_right, _offsets[i]);
      }

      // During the one-frame hold, account for player movement so visuals stay aligned.
      if (frameDelta && playerVelocity) {
        core.position.addScaledVector(playerVelocity, frameDelta);
      }

      // Orient beam along its travel direction
      core.quaternion.setFromUnitVectors(_dirForward, _fireDirection);

      this.scene.add(core);
      this.active.push({
        mesh: core,
        velocity: _baseVelocity.clone(),
        position: core.position,
        prevPosition: core.position.clone(),
        travelled: 0,
        type: type,
        moveDelayFrames: 1,
      });
      spawnedCount++;
    }

    return spawnedCount;
  }

  update(delta) {
    this.cooldown -= delta;

    for (let i = this.active.length - 1; i >= 0; i--) {
      const p = this.active[i];
      p.prevPosition.copy(p.mesh.position);

      if (p.moveDelayFrames > 0) {
        p.moveDelayFrames -= 1;
        continue;
      }

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

  clear() {
    for (let i = this.active.length - 1; i >= 0; i--) {
      this.scene.remove(this.active[i].mesh);
    }
    this.active.length = 0;
    this.cooldown = 0;
  }

  remove(index) {
    const p = this.active[index];
    if (p) {
      this.scene.remove(p.mesh);
      this.active.splice(index, 1);
    }
  }
}
