import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const RECYCLE_MODEL_PATH = '/models/recycle.glb';

const MAX_RECYCLE          = 4;
const RECYCLE_POINTS       = 2000;
const RECYCLE_HIT_RADIUS   = 7.0;
const RECYCLE_COL_RADIUS   = 8.5;
const RECYCLE_OUTLINE_COLOR = 0x89CFF0;  // baby blue
const RECYCLE_OUTLINE_SCALE = 1.07;
const RECYCLE_MAX_ACTIVE   = 2;
const RECYCLE_SPAWN_RATIO  = 10;         // 1 recycle per 10 normal-trash progress ticks
const ASTEROID_BOUNCE      = 0.24;

const _playerForward   = new THREE.Vector3();
const _playerRight     = new THREE.Vector3();
const _playerUp        = new THREE.Vector3();
const _spawnPos        = new THREE.Vector3();
const _candidateOffset = new THREE.Vector3();
const _collisionOffset = new THREE.Vector3();
const _collisionNormal = new THREE.Vector3();
const _travelDelta     = new THREE.Vector3();
const _defaultForward  = new THREE.Vector3(0, 0, -1);
const _defaultRight    = new THREE.Vector3(1, 0, 0);
const _defaultUp       = new THREE.Vector3(0, 1, 0);

export class RecycleDebrisManager {
  constructor(scene) {
    this.scene = scene;
    this.active = [];
    this._freeSlots = [];
    this._template = null;
    this._loaded = false;
    this._lastPlayerPos = new THREE.Vector3();
    this._hasLastPlayerPos = false;
    this._forwardProgress = 0;

    this._slots = new Array(MAX_RECYCLE);
    for (let i = 0; i < MAX_RECYCLE; i++) {
      this._slots[i] = {
        slotId: i,
        active: false,
        renderIndex: -1,
        position: new THREE.Vector3(),
        velocity: new THREE.Vector3(),
        rotation: new THREE.Vector3(),
        rotSpeed: new THREE.Vector3(),
        scale: 1,
        hitRadius: RECYCLE_HIT_RADIUS,
        collisionRadius: RECYCLE_COL_RADIUS,
        points: RECYCLE_POINTS,
        mesh: null,
      };
      this._freeSlots.push(i);
    }

    this._loadTemplate();
  }

  _loadTemplate() {
    const loader = new GLTFLoader();
    loader.load(
      RECYCLE_MODEL_PATH,
      (gltf) => {
        this._template = this._buildTemplate(gltf);
        this._loaded = true;
      },
      undefined,
      (err) => {
        console.warn(`[RecycleDebrisManager] Could not load ${RECYCLE_MODEL_PATH}:`, err);
        this._loaded = true;
      }
    );
  }

  _buildTemplate(gltf) {
    const group  = new THREE.Group();
    const bounds = new THREE.Box3();
    const center = new THREE.Vector3();
    const size   = new THREE.Vector3();
    const parts  = [];

    gltf.scene.updateMatrixWorld(true);
    gltf.scene.traverse((child) => {
      if (!child.isMesh || !child.geometry) return;
      const geo = child.geometry.clone();
      geo.applyMatrix4(child.matrixWorld);
      geo.computeBoundingBox();
      bounds.union(geo.boundingBox);
      const mats = Array.isArray(child.material) ? child.material : [child.material];
      parts.push({ geo, mats });
    });

    if (parts.length === 0) return group;

    bounds.getCenter(center);
    bounds.getSize(size);
    const ns = 1 / Math.max(size.x, size.y, size.z, 0.001);

    for (const { geo, mats } of parts) {
      geo.translate(-center.x, -center.y, -center.z);
      geo.scale(ns, ns, ns);
      geo.computeBoundingSphere();

      const newMats = mats.map(m => m ? m.clone() : new THREE.MeshStandardMaterial());

      const mesh = new THREE.Mesh(geo, newMats.length === 1 ? newMats[0] : newMats);
      group.add(mesh);
    }

    // Single merged outline so no part's BackSide covers another part's front.
    const mergedGeo = mergeGeometries(parts.map(p => p.geo), true);
    if (mergedGeo) {
      const outlineMat = new THREE.MeshBasicMaterial({
        color: RECYCLE_OUTLINE_COLOR,
        side: THREE.BackSide,
        transparent: true,
        opacity: 1,
        depthWrite: false,
        depthTest: true,
        fog: true,
        polygonOffset: true,
        polygonOffsetFactor: 256,
        polygonOffsetUnits: 256,
      });
      const outlineMesh = new THREE.Mesh(mergedGeo, outlineMat);
      outlineMesh.scale.setScalar(RECYCLE_OUTLINE_SCALE);
      outlineMesh.renderOrder = 1;
      group.add(outlineMesh);
    }

    return group;
  }

  get _ready() {
    return this._loaded && this._template !== null;
  }

  update(delta, spawnConfig, playerPos, playerQuaternion = null) {
    if (!playerPos) return;

    this._buildPlayerBasis(playerQuaternion);
    this._accumulateForwardProgress(playerPos);

    if (this._ready && this._freeSlots.length > 0 && this.active.length < RECYCLE_MAX_ACTIVE) {
      const progressPerSpawn = ((spawnConfig?.progressPerSpawn) ?? 140) * RECYCLE_SPAWN_RATIO;
      if (this._forwardProgress >= progressPerSpawn) {
        this._forwardProgress -= progressPerSpawn;
        this._spawnSingle(spawnConfig, playerPos);
      }
    }

    const despawnDistSq = Math.pow((spawnConfig?.despawnDistance) ?? 3000, 2);
    const recycleDist   = (spawnConfig?.recycleBehindDistance) ?? 260;

    for (let i = this.active.length - 1; i >= 0; i--) {
      const s = this.active[i];
      s.position.addScaledVector(s.velocity, delta);
      s.rotation.x += s.rotSpeed.x * delta;
      s.rotation.y += s.rotSpeed.y * delta;
      s.rotation.z += s.rotSpeed.z * delta;

      if (s.mesh) {
        s.mesh.position.copy(s.position);
        s.mesh.rotation.set(s.rotation.x, s.rotation.y, s.rotation.z);
      }

      if (s.position.distanceToSquared(playerPos) > despawnDistSq) {
        this._deactivate(i);
        continue;
      }

      _candidateOffset.copy(s.position).sub(playerPos);
      if (_candidateOffset.dot(_playerForward) < -recycleDist) {
        this._deactivate(i);
      }
    }
  }

  resolveAsteroidCollisions(asteroids) {
    if (!asteroids || asteroids.length === 0) return;
    for (const s of this.active) {
      for (const ast of asteroids) {
        const sphere = ast.boundingSphere;
        const minDist = s.collisionRadius + sphere.radius;
        _collisionOffset.copy(s.position).sub(sphere.center);
        const distSq = _collisionOffset.lengthSq();
        if (distSq >= minDist * minDist) continue;
        const dist = Math.sqrt(distSq) || 0.001;
        _collisionNormal.copy(_collisionOffset).multiplyScalar(1 / dist);
        s.position.addScaledVector(_collisionNormal, minDist - dist + 0.05);
        const inward = s.velocity.dot(_collisionNormal);
        if (inward < 0) s.velocity.addScaledVector(_collisionNormal, -inward * (1 + ASTEROID_BOUNCE));
        if (s.mesh) s.mesh.position.copy(s.position);
      }
    }
  }

  getActive() { return this.active; }

  remove(index) {
    if (index >= 0 && index < this.active.length) this._deactivate(index);
  }

  clear() {
    while (this.active.length > 0) this._deactivate(this.active.length - 1);
  }

  _buildPlayerBasis(quat) {
    _playerForward.copy(_defaultForward);
    _playerRight.copy(_defaultRight);
    _playerUp.copy(_defaultUp);
    if (!quat) return;
    _playerForward.applyQuaternion(quat).normalize();
    _playerRight.applyQuaternion(quat).normalize();
    _playerUp.applyQuaternion(quat).normalize();
  }

  _accumulateForwardProgress(playerPos) {
    if (!this._hasLastPlayerPos) {
      this._lastPlayerPos.copy(playerPos);
      this._hasLastPlayerPos = true;
      return;
    }
    _travelDelta.copy(playerPos).sub(this._lastPlayerPos);
    this._forwardProgress += Math.max(0, _travelDelta.dot(_playerForward));
    this._lastPlayerPos.copy(playerPos);
  }

  _spawnSingle(spawnConfig, playerPos) {
    if (!this._template) return false;

    const forwardMin = (spawnConfig?.forwardSpawnMin)  ?? 1450;
    const forwardMax = (spawnConfig?.forwardSpawnMax)  ?? 2100;
    const latSpread  = (spawnConfig?.lateralSpread)    ?? 360;
    const vertSpread = (spawnConfig?.verticalSpread ?? spawnConfig?.verticalSpreadRange) ?? 160;
    const minGap     = (spawnConfig?.minGap)           ?? 90;
    const backDrift  = (spawnConfig?.backwardDrift)    ?? 14;
    const latDrift   = (spawnConfig?.lateralDrift)     ?? 9;
    const modelScale = (spawnConfig?.modelScale)       ?? 14.4;
    const scaleMin   = (spawnConfig?.scaleMin)         ?? 2.5;
    const scaleMax   = (spawnConfig?.scaleMax)         ?? 3.2;
    const minGapSq   = minGap * minGap;

    for (let attempt = 0; attempt < 14; attempt++) {
      _spawnPos.copy(playerPos)
        .addScaledVector(_playerForward, forwardMin + Math.random() * (forwardMax - forwardMin))
        .addScaledVector(_playerRight,  (Math.random() * 2 - 1) * latSpread)
        .addScaledVector(_playerUp,     (Math.random() * 2 - 1) * vertSpread);

      let clear = true;
      for (const s of this.active) {
        if (s.position.distanceToSquared(_spawnPos) < minGapSq) { clear = false; break; }
      }
      if (!clear) continue;

      const slotId = this._freeSlots.pop();
      const slot   = this._slots[slotId];

      slot.active = true;
      slot.position.copy(_spawnPos);
      slot.rotation.set(Math.random() * Math.PI * 2, Math.random() * Math.PI * 2, Math.random() * Math.PI * 2);
      slot.rotSpeed.set(
        (Math.random() * 2 - 1) * 0.65,
        (Math.random() * 2 - 1) * 0.65,
        (Math.random() * 2 - 1) * 0.65,
      );
      slot.velocity.copy(_playerForward).multiplyScalar(-backDrift);
      slot.velocity.addScaledVector(_playerRight, (Math.random() * 2 - 1) * latDrift);
      slot.velocity.addScaledVector(_playerUp,    (Math.random() * 2 - 1) * latDrift * 0.55);
      slot.scale           = modelScale * (scaleMin + Math.random() * (scaleMax - scaleMin));
      slot.points          = RECYCLE_POINTS;
      slot.hitRadius       = RECYCLE_HIT_RADIUS;
      slot.collisionRadius = RECYCLE_COL_RADIUS;

      const mesh = this._template.clone(true);
      mesh.scale.setScalar(slot.scale);
      mesh.position.copy(slot.position);
      mesh.rotation.set(slot.rotation.x, slot.rotation.y, slot.rotation.z);
      this.scene.add(mesh);
      slot.mesh = mesh;

      slot.renderIndex = this.active.length;
      this.active.push(slot);
      return true;
    }
    return false;
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

    if (slot.mesh) {
      this.scene.remove(slot.mesh);
      slot.mesh = null;
    }
    slot.active      = false;
    slot.renderIndex = -1;
    slot.velocity.set(0, 0, 0);
    slot.rotSpeed.set(0, 0, 0);
    this._freeSlots.push(slot.slotId);
  }
}
