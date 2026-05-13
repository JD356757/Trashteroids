import * as THREE from 'three';

/**
 * Floating proximity mines.
 *
 * Each mine is a pulsing red orb that drifts slowly in roughly the same
 * direction as the player's incoming traffic. Touching one deals heavy
 * damage and detonates the mine.
 *
 * Mines are NOT shootable (intentionally — they're hazards to dodge,
 * not targets to clear). They despawn after passing behind the player.
 */

const MAX_SLOTS = 12;
const DEFAULT_HIT_RADIUS = 16;
const PULSE_FREQ = 5.2;
const _spawnPos = new THREE.Vector3();
const _toPlayer = new THREE.Vector3();
const _forward = new THREE.Vector3();
const _right = new THREE.Vector3();
const _up = new THREE.Vector3();
const _worldUp = new THREE.Vector3(0, 1, 0);
const _scratch = new THREE.Vector3();
const _lastPos = new THREE.Vector3();

export class MineField {
  constructor(scene) {
    this.scene = scene;
    this.enabled = false;
    this.config = null;

    this.group = new THREE.Group();
    this.group.visible = false;
    scene.add(this.group);

    this._coreGeom = new THREE.SphereGeometry(8, 14, 10);
    this._haloGeom = new THREE.SphereGeometry(13, 14, 10);
    this._spikeGeom = new THREE.CylinderGeometry(0.4, 1.2, 14, 5);
    // Spikes default along Y; we'll orient each one from the center.

    this._coreMat = new THREE.MeshBasicMaterial({
      color: 0xff2a2a,
      transparent: true,
      opacity: 0.95,
    });
    this._haloMat = new THREE.MeshBasicMaterial({
      color: 0xff5544,
      transparent: true,
      opacity: 0.18,
      depthWrite: false,
    });
    this._spikeMat = new THREE.MeshBasicMaterial({
      color: 0x661111,
    });

    this._slots = new Array(MAX_SLOTS);
    this._freeSlots = [];
    this.active = [];
    for (let i = 0; i < MAX_SLOTS; i++) {
      const mineGroup = new THREE.Group();
      const core = new THREE.Mesh(this._coreGeom, this._coreMat);
      const halo = new THREE.Mesh(this._haloGeom, this._haloMat);
      mineGroup.add(halo);
      mineGroup.add(core);

      // Six radial spikes for visual identity.
      const dirs = [
        [1, 0, 0], [-1, 0, 0],
        [0, 1, 0], [0, -1, 0],
        [0, 0, 1], [0, 0, -1],
      ];
      for (const [dx, dy, dz] of dirs) {
        const spike = new THREE.Mesh(this._spikeGeom, this._spikeMat);
        spike.position.set(dx * 7, dy * 7, dz * 7);
        // Cylinder default axis is Y. Aim it along (dx, dy, dz).
        const axisDir = new THREE.Vector3(dx, dy, dz);
        const q = new THREE.Quaternion().setFromUnitVectors(_worldUp, axisDir);
        spike.quaternion.copy(q);
        mineGroup.add(spike);
      }

      mineGroup.visible = false;
      this.group.add(mineGroup);

      this._slots[i] = {
        slotId: i,
        active: false,
        position: new THREE.Vector3(),
        velocity: new THREE.Vector3(),
        age: 0,
        hitRadius: DEFAULT_HIT_RADIUS,
        damage: 25,
        renderIndex: -1,
        mesh: mineGroup,
        core,
        halo,
      };
      this._freeSlots.push(i);
    }

    this._spawnAccumulator = 0;
    this._hasLastPlayerPos = false;
  }

  setEnabled(on, config = null) {
    this.enabled = !!on && !!config;
    this.config = config;
    this.group.visible = this.enabled;
    this.clear();
    this._spawnAccumulator = 0;
    this._hasLastPlayerPos = false;
  }

  getActive() {
    return this.active;
  }

  remove(activeIndex) {
    if (activeIndex < 0 || activeIndex >= this.active.length) return;
    this._deactivate(activeIndex);
  }

  detonate(activeIndex, onSpawnExplosion) {
    if (activeIndex < 0 || activeIndex >= this.active.length) return;
    const slot = this.active[activeIndex];
    if (typeof onSpawnExplosion === 'function') {
      onSpawnExplosion(slot.position.clone());
    }
    this._deactivate(activeIndex);
  }

  clear() {
    while (this.active.length > 0) this._deactivate(this.active.length - 1);
  }

  update(delta, playerPos, playerQuaternion) {
    if (!this.enabled || !playerPos) {
      return;
    }
    const cfg = this.config;

    _forward.set(0, 0, -1).applyQuaternion(playerQuaternion).normalize();
    _right.crossVectors(_forward, _worldUp);
    if (_right.lengthSq() < 1e-4) _right.set(1, 0, 0);
    _right.normalize();
    _up.crossVectors(_right, _forward).normalize();

    // Track forward progress for spawn pacing.
    if (this._hasLastPlayerPos) {
      _scratch.copy(playerPos).sub(_lastPos);
      this._spawnAccumulator += Math.max(0, _scratch.dot(_forward));
    }
    _lastPos.copy(playerPos);
    this._hasLastPlayerPos = true;

    const progressPerSpawn = cfg.progressPerSpawn ?? 250;
    const maxActive = cfg.maxActive ?? 5;
    while (
      this._spawnAccumulator >= progressPerSpawn
      && this.active.length < maxActive
      && this._freeSlots.length > 0
    ) {
      this._spawnAccumulator -= progressPerSpawn;
      this._spawnSingle(playerPos);
    }

    // Update existing.
    const despawnDistSq = Math.pow(cfg.despawnDistance ?? 2400, 2);
    for (let i = this.active.length - 1; i >= 0; i--) {
      const slot = this.active[i];
      slot.age += delta;
      slot.position.addScaledVector(slot.velocity, delta);
      slot.mesh.position.copy(slot.position);

      // Pulse the core color/scale.
      const pulse = 0.5 + 0.5 * Math.sin(slot.age * PULSE_FREQ);
      const coreScale = 0.9 + pulse * 0.4;
      slot.core.scale.setScalar(coreScale);
      slot.halo.scale.setScalar(1.0 + pulse * 0.6);
      slot.halo.material.opacity = 0.12 + pulse * 0.18;

      // Despawn behind / beyond range.
      _toPlayer.copy(slot.position).sub(playerPos);
      const distSq = _toPlayer.lengthSq();
      if (distSq > despawnDistSq) {
        this._deactivate(i);
        continue;
      }
      if (_toPlayer.dot(_forward) < -120) {
        this._deactivate(i);
      }
    }
  }

  _spawnSingle(playerPos) {
    const cfg = this.config;
    const slotId = this._freeSlots.pop();
    const slot = this._slots[slotId];

    const forwardMin = cfg.forwardSpawnMin ?? 900;
    const forwardMax = cfg.forwardSpawnMax ?? 1300;
    const lateralSpread = cfg.lateralSpread ?? 200;
    const verticalRange = cfg.verticalRange ?? 110;
    const drift = cfg.backwardDrift ?? 6;

    _spawnPos.copy(playerPos)
      .addScaledVector(_forward, forwardMin + Math.random() * (forwardMax - forwardMin))
      .addScaledVector(_right, (Math.random() * 2 - 1) * lateralSpread)
      .addScaledVector(_up, (Math.random() * 2 - 1) * verticalRange);

    slot.active = true;
    slot.position.copy(_spawnPos);
    slot.velocity.copy(_forward).multiplyScalar(-drift);
    slot.age = Math.random() * Math.PI * 2;
    slot.hitRadius = cfg.hitRadius ?? DEFAULT_HIT_RADIUS;
    slot.damage = cfg.damage ?? 25;
    slot.mesh.position.copy(slot.position);
    slot.mesh.visible = true;

    slot.renderIndex = this.active.length;
    this.active.push(slot);
  }

  _deactivate(activeIndex) {
    const last = this.active.length - 1;
    const slot = this.active[activeIndex];
    if (activeIndex !== last) {
      const lastSlot = this.active[last];
      this.active[activeIndex] = lastSlot;
      lastSlot.renderIndex = activeIndex;
    }
    this.active.pop();
    slot.active = false;
    slot.renderIndex = -1;
    slot.mesh.visible = false;
    this._freeSlots.push(slot.slotId);
  }
}
