import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const _playerForward = new THREE.Vector3();
const _playerRight = new THREE.Vector3();
const _playerUp = new THREE.Vector3();
const _travelDelta = new THREE.Vector3();
const _spawnPos = new THREE.Vector3();
const _candidateOffset = new THREE.Vector3();
const _collisionOffset = new THREE.Vector3();
const _collisionNormal = new THREE.Vector3();
const _boundsCenter = new THREE.Vector3();
const _boundsSize = new THREE.Vector3();
const _matrixDummy = new THREE.Object3D();
const _defaultForward = new THREE.Vector3(0, 0, -1);
const _defaultRight = new THREE.Vector3(1, 0, 0);
const _defaultUp = new THREE.Vector3(0, 1, 0);

const TRASH_MODEL_PATH = '/models/trashnew.glb';
const MAX_TRASH = 96;
const MAX_SPAWN_PER_FRAME = 6;
const MAX_SPAWN_ATTEMPTS = 14;
const DEFAULT_POINTS = 500;
const DEFAULT_MODEL_SCALE = 14.4;
const DEFAULT_SCALE_MIN = 2.5;
const DEFAULT_SCALE_MAX = 3.2;
const TRASH_HIT_RADIUS = 6.4;
const TRASH_COLLISION_RADIUS = 7.6;
const DEFAULT_FORWARD_SPAWN_MIN = 1450;
const DEFAULT_FORWARD_SPAWN_MAX = 2100;
const DEFAULT_LATERAL_SPREAD = 360;
const DEFAULT_VERTICAL_SPREAD = 160;
const DEFAULT_MIN_GAP = 90;
const DEFAULT_BACKWARD_DRIFT = 14;
const DEFAULT_LATERAL_DRIFT = 9;
const DEFAULT_ROTATION_SPEED = 0.65;
const DEFAULT_DESPAWN_DISTANCE = 3000;
const DEFAULT_RECYCLE_BEHIND_DISTANCE = 260;
const DEFAULT_PROGRESS_PER_SPAWN = 140;
const DEFAULT_BOOTSTRAP_ACTIVE = 16;
const ASTEROID_BOUNCE = 0.24;
const TRASH_OUTLINE_COLOR = 0x39ff88;
const TRASH_OUTLINE_SCALE = 1.05;

function createTexturedMaterial(material) {
  const map = material?.map ?? null;
  const alphaMap = material?.alphaMap ?? null;
  const normalMap = material?.normalMap ?? null;
  const roughnessMap = material?.roughnessMap ?? null;
  const metalnessMap = material?.metalnessMap ?? null;
  const emissiveMap = material?.emissiveMap ?? null;
  const aoMap = material?.aoMap ?? null;

  const textured = new THREE.MeshStandardMaterial({
    color: material?.color ? material.color.clone() : new THREE.Color(0xffffff),
    emissive: material?.emissive ? material.emissive.clone() : new THREE.Color(0x000000),
    emissiveIntensity: material?.emissiveIntensity ?? 1,
    map,
    alphaMap,
    normalMap,
    roughnessMap,
    metalnessMap,
    emissiveMap,
    aoMap,
    transparent: Boolean(material?.transparent || alphaMap),
    opacity: material?.opacity ?? 1,
    side: material?.side ?? THREE.FrontSide,
    roughness: material?.roughness ?? 0.95,
    metalness: material?.metalness ?? 0.04,
    fog: true,
  });

  if ('alphaTest' in textured) {
    textured.alphaTest = Math.max(material?.alphaTest ?? 0, 0.18);
  }

  return textured;
}

function randomRange(min, max) {
  return min + Math.random() * (max - min);
}

function clampConfig(spawnConfig = {}) {
  const targetActive = Math.min(
    MAX_TRASH,
    Math.max(0, Math.round(spawnConfig.maxActive ?? spawnConfig.minActive ?? 40))
  );

  const forwardSpawnMin = spawnConfig.forwardSpawnMin ?? spawnConfig.spawnMinDistance ?? DEFAULT_FORWARD_SPAWN_MIN;
  const forwardSpawnMax = Math.max(
    forwardSpawnMin + 1,
    spawnConfig.forwardSpawnMax ?? spawnConfig.spawnMaxDistance ?? DEFAULT_FORWARD_SPAWN_MAX
  );

  return {
    targetActive,
    bootstrapActive: Math.min(
      targetActive,
      Math.max(0, Math.round(spawnConfig.bootstrapActive ?? DEFAULT_BOOTSTRAP_ACTIVE))
    ),
    forwardSpawnMin,
    forwardSpawnMax,
    lateralSpread: Math.max(40, spawnConfig.lateralSpread ?? DEFAULT_LATERAL_SPREAD),
    verticalSpread: Math.max(20, spawnConfig.verticalRange ?? spawnConfig.verticalSpreadRange ?? DEFAULT_VERTICAL_SPREAD),
    minGap: Math.max(24, spawnConfig.minGap ?? DEFAULT_MIN_GAP),
    modelScale: Math.max(0.1, spawnConfig.modelScale ?? DEFAULT_MODEL_SCALE),
    scaleMin: Math.max(0.1, spawnConfig.scaleMin ?? DEFAULT_SCALE_MIN),
    scaleMax: Math.max(
      spawnConfig.scaleMin ?? DEFAULT_SCALE_MIN,
      spawnConfig.scaleMax ?? DEFAULT_SCALE_MAX
    ),
    backwardDrift: Math.max(0, spawnConfig.backwardDrift ?? DEFAULT_BACKWARD_DRIFT),
    lateralDrift: Math.max(0, spawnConfig.lateralDrift ?? DEFAULT_LATERAL_DRIFT),
    rotationSpeed: Math.max(0, spawnConfig.rotationSpeed ?? DEFAULT_ROTATION_SPEED),
    points: Math.max(1, Math.round(spawnConfig.points ?? DEFAULT_POINTS)),
    progressPerSpawn: Math.max(10, spawnConfig.progressPerSpawn ?? DEFAULT_PROGRESS_PER_SPAWN),
    despawnDistance: Math.max(200, spawnConfig.despawnDistance ?? DEFAULT_DESPAWN_DISTANCE),
    recycleBehindDistance: Math.max(
      20,
      spawnConfig.recycleBehindDistance ?? DEFAULT_RECYCLE_BEHIND_DISTANCE
    ),
  };
}

export class DebrisManager {
  constructor(scene) {
    this.scene = scene;
    this.active = [];
    this._freeSlots = [];
    this._slots = new Array(MAX_TRASH);
    this._layers = [];
    this._outlineLayers = [];
    this._ready = false;
    this._renderDirty = false;
    this._lastPlayerPos = new THREE.Vector3();
    this._hasLastPlayerPos = false;
    this._forwardProgress = 0;
    this._renderRoot = new THREE.Group();
    this._renderRoot.name = 'TrashStream';
    this.scene.add(this._renderRoot);

    for (let i = 0; i < MAX_TRASH; i++) {
      this._slots[i] = {
        slotId: i,
        active: false,
        renderIndex: -1,
        position: new THREE.Vector3(),
        velocity: new THREE.Vector3(),
        rotation: new THREE.Vector3(),
        rotSpeed: new THREE.Vector3(),
        scale: DEFAULT_MODEL_SCALE,
        hitRadius: TRASH_HIT_RADIUS,
        collisionRadius: TRASH_COLLISION_RADIUS,
        points: DEFAULT_POINTS,
      };
      this._freeSlots.push(i);
    }

    this._loadTrashTemplate();
  }

  update(delta, spawnConfig, playerPos, playerQuaternion = null) {
    if (!playerPos) return;

    this._buildPlayerBasis(playerQuaternion);
    this._accumulateForwardProgress(playerPos);

    const config = clampConfig(spawnConfig);
    this._spawnAhead(config, playerPos);
    this._updateActiveTrash(delta, config, playerPos);

    if (this._renderDirty) {
      this._syncInstances();
    }
  }

  resolveAsteroidCollisions(asteroids) {
    if (!asteroids || asteroids.length === 0) return;

    for (let i = 0; i < this.active.length; i++) {
      const trash = this.active[i];
      const minRadius = trash.collisionRadius;

      for (let j = 0; j < asteroids.length; j++) {
        const sphere = asteroids[j].boundingSphere;
        const minDistance = minRadius + sphere.radius;

        _collisionOffset.copy(trash.position).sub(sphere.center);
        const distanceSq = _collisionOffset.lengthSq();
        if (distanceSq >= minDistance * minDistance) continue;

        let distance = Math.sqrt(distanceSq);
        if (distance <= 1e-6) {
          _collisionNormal.copy(_playerForward);
          if (_collisionNormal.lengthSq() === 0) {
            _collisionNormal.copy(_defaultForward);
          }
          distance = 0;
        } else {
          _collisionNormal.copy(_collisionOffset).multiplyScalar(1 / distance);
        }

        const overlap = minDistance - distance;
        trash.position.addScaledVector(_collisionNormal, overlap + 0.05);

        const inwardSpeed = trash.velocity.dot(_collisionNormal);
        if (inwardSpeed < 0) {
          trash.velocity.addScaledVector(_collisionNormal, -inwardSpeed * (1 + ASTEROID_BOUNCE));
        }

        this._renderDirty = true;
      }
    }

    if (this._renderDirty) {
      this._syncInstances();
    }
  }

  getActive() {
    return this.active;
  }

  remove(index) {
    if (index < 0 || index >= this.active.length) return;
    this._deactivateByActiveIndex(index);
    this._syncInstances();
  }

  _buildPlayerBasis(playerQuaternion) {
    _playerForward.copy(_defaultForward);
    _playerRight.copy(_defaultRight);
    _playerUp.copy(_defaultUp);

    if (!playerQuaternion) return;

    _playerForward.applyQuaternion(playerQuaternion).normalize();
    _playerRight.applyQuaternion(playerQuaternion).normalize();
    _playerUp.applyQuaternion(playerQuaternion).normalize();
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

  _spawnAhead(config, playerPos) {
    if (!this._ready || this._freeSlots.length === 0 || config.targetActive <= 0) {
      return;
    }

    const missingCount = config.targetActive - this.active.length;
    if (missingCount <= 0) return;

    let spawnBudget = Math.min(MAX_SPAWN_PER_FRAME, missingCount);

    if (this.active.length >= config.bootstrapActive) {
      const progressBudget = Math.floor(this._forwardProgress / config.progressPerSpawn);
      spawnBudget = Math.min(spawnBudget, progressBudget);
      if (spawnBudget <= 0) return;
      this._forwardProgress -= spawnBudget * config.progressPerSpawn;
    }

    let spawned = 0;
    let attempts = 0;
    while (spawned < spawnBudget && attempts < spawnBudget * MAX_SPAWN_ATTEMPTS) {
      if (this._spawnSingle(config, playerPos)) {
        spawned++;
      }
      attempts++;
    }
  }

  _spawnSingle(config, playerPos) {
    for (let attempt = 0; attempt < MAX_SPAWN_ATTEMPTS; attempt++) {
      const forwardDistance = randomRange(config.forwardSpawnMin, config.forwardSpawnMax);
      const lateralOffset = randomRange(-config.lateralSpread, config.lateralSpread);
      const verticalOffset = randomRange(-config.verticalSpread, config.verticalSpread);

      _spawnPos.copy(playerPos)
        .addScaledVector(_playerForward, forwardDistance)
        .addScaledVector(_playerRight, lateralOffset)
        .addScaledVector(_playerUp, verticalOffset);

      if (!this._isSpawnClear(_spawnPos, config.minGap)) {
        continue;
      }

      const slotId = this._freeSlots.pop();
      const slot = this._slots[slotId];

      slot.active = true;
      slot.position.copy(_spawnPos);
      slot.rotation.set(
        Math.random() * Math.PI * 2,
        Math.random() * Math.PI * 2,
        Math.random() * Math.PI * 2
      );
      slot.rotSpeed.set(
        randomRange(-config.rotationSpeed, config.rotationSpeed),
        randomRange(-config.rotationSpeed, config.rotationSpeed),
        randomRange(-config.rotationSpeed, config.rotationSpeed)
      );

      const driftRight = randomRange(-config.lateralDrift, config.lateralDrift);
      const driftUp = randomRange(-config.lateralDrift * 0.55, config.lateralDrift * 0.55);
      slot.velocity.copy(_playerForward).multiplyScalar(-config.backwardDrift);
      slot.velocity.addScaledVector(_playerRight, driftRight);
      slot.velocity.addScaledVector(_playerUp, driftUp);

      slot.scale = config.modelScale * randomRange(config.scaleMin, config.scaleMax);
      slot.points = config.points;
      slot.hitRadius = TRASH_HIT_RADIUS;
      slot.collisionRadius = TRASH_COLLISION_RADIUS;
      slot.renderIndex = this.active.length;

      this.active.push(slot);
      this._renderDirty = true;
      return true;
    }

    return false;
  }

  _isSpawnClear(position, minGap) {
    const minGapSq = minGap * minGap;

    for (let i = 0; i < this.active.length; i++) {
      if (this.active[i].position.distanceToSquared(position) < minGapSq) {
        return false;
      }
    }

    return true;
  }

  _updateActiveTrash(delta, config, playerPos) {
    const despawnDistSq = config.despawnDistance * config.despawnDistance;

    for (let i = this.active.length - 1; i >= 0; i--) {
      const trash = this.active[i];
      trash.position.addScaledVector(trash.velocity, delta);
      trash.rotation.x += trash.rotSpeed.x * delta;
      trash.rotation.y += trash.rotSpeed.y * delta;
      trash.rotation.z += trash.rotSpeed.z * delta;

      const distanceSq = trash.position.distanceToSquared(playerPos);
      if (distanceSq > despawnDistSq) {
        this._deactivateByActiveIndex(i);
        continue;
      }

      _candidateOffset.copy(trash.position).sub(playerPos);
      const forwardDot = _candidateOffset.dot(_playerForward);
      if (forwardDot < -config.recycleBehindDistance) {
        this._deactivateByActiveIndex(i);
        continue;
      }

      this._renderDirty = true;
    }
  }

  clear() {
    while (this.active.length > 0) {
      this._deactivateByActiveIndex(this.active.length - 1);
    }
  }

  _deactivateByActiveIndex(activeIndex) {
    const lastIndex = this.active.length - 1;
    const slot = this.active[activeIndex];

    if (activeIndex !== lastIndex) {
      const lastSlot = this.active[lastIndex];
      this.active[activeIndex] = lastSlot;
      lastSlot.renderIndex = activeIndex;
    }

    this.active.pop();

    slot.active = false;
    slot.renderIndex = -1;
    slot.velocity.set(0, 0, 0);
    slot.rotSpeed.set(0, 0, 0);
    this._freeSlots.push(slot.slotId);
    this._renderDirty = true;
  }

  _loadTrashTemplate() {
    const loader = new GLTFLoader();

    loader.load(
      TRASH_MODEL_PATH,
      (gltf) => {
        const bakedParts = [];
        const aggregateBounds = new THREE.Box3();

        gltf.scene.updateMatrixWorld(true);

        gltf.scene.traverse((child) => {
          if (!child.isMesh || !child.geometry) return;

          const bakedGeometry = child.geometry.clone();
          bakedGeometry.applyMatrix4(child.matrixWorld);
          bakedGeometry.computeBoundingBox();
          aggregateBounds.union(bakedGeometry.boundingBox);

          const material = Array.isArray(child.material)
            ? child.material.map((entry) => createTexturedMaterial(entry))
            : createTexturedMaterial(child.material);

          bakedParts.push({ geometry: bakedGeometry, material });
        });

        if (bakedParts.length === 0) {
          console.warn('[DebrisManager] trashnew.glb loaded with no renderable meshes');
          return;
        }

        aggregateBounds.getCenter(_boundsCenter);
        aggregateBounds.getSize(_boundsSize);
        const maxDimension = Math.max(_boundsSize.x, _boundsSize.y, _boundsSize.z, 0.001);
        const normalizeScale = 1 / maxDimension;

        for (let i = 0; i < bakedParts.length; i++) {
          const part = bakedParts[i];
          part.geometry.translate(-_boundsCenter.x, -_boundsCenter.y, -_boundsCenter.z);
          part.geometry.scale(normalizeScale, normalizeScale, normalizeScale);
          part.geometry.computeBoundingSphere();

          const instanced = new THREE.InstancedMesh(part.geometry, part.material, MAX_TRASH);
          instanced.count = 0;
          instanced.castShadow = false;
          instanced.receiveShadow = false;
          instanced.frustumCulled = false;
          instanced.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
          this._renderRoot.add(instanced);
          this._layers.push(instanced);

          const outlineMaterial = new THREE.MeshBasicMaterial({
            color: TRASH_OUTLINE_COLOR,
            side: THREE.BackSide,
            transparent: true,
            opacity: 1,
            depthWrite: false,
            depthTest: true,
            fog: true,
          });
          // Reduce z-fighting by slightly offsetting polygon depth when rendering outlines
          outlineMaterial.polygonOffset = true;
          outlineMaterial.polygonOffsetFactor = 1;
          outlineMaterial.polygonOffsetUnits = 1;
          const outlineLayer = new THREE.InstancedMesh(part.geometry, outlineMaterial, MAX_TRASH);
          outlineLayer.count = 0;
          outlineLayer.castShadow = false;
          outlineLayer.receiveShadow = false;
          outlineLayer.frustumCulled = false;
          outlineLayer.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
          // Render outlines after base geometry to reduce flicker while still
          // allowing depthTest to discard occluded outlines.
          outlineLayer.renderOrder = 1;
          this._renderRoot.add(outlineLayer);
          this._outlineLayers.push(outlineLayer);
        }

        this._ready = true;
        this._renderDirty = true;
        this._syncInstances();
      },
      undefined,
      (error) => {
        console.error('[DebrisManager] Failed to load trashnew.glb', error);
      }
    );
  }

  _syncInstances() {
    if (!this._ready) return;

    const activeCount = this.active.length;
    for (let i = 0; i < activeCount; i++) {
      const trash = this.active[i];
      trash.renderIndex = i;

      _matrixDummy.position.copy(trash.position);
      _matrixDummy.rotation.set(trash.rotation.x, trash.rotation.y, trash.rotation.z);
      _matrixDummy.scale.setScalar(trash.scale);
      _matrixDummy.updateMatrix();

      for (let j = 0; j < this._layers.length; j++) {
        this._layers[j].setMatrixAt(i, _matrixDummy.matrix);
      }

      _matrixDummy.scale.setScalar(trash.scale * TRASH_OUTLINE_SCALE);
      _matrixDummy.updateMatrix();

      for (let j = 0; j < this._outlineLayers.length; j++) {
        this._outlineLayers[j].setMatrixAt(i, _matrixDummy.matrix);
      }
    }

    for (let i = 0; i < this._layers.length; i++) {
      this._layers[i].count = activeCount;
      this._layers[i].instanceMatrix.needsUpdate = true;
    }

    for (let i = 0; i < this._outlineLayers.length; i++) {
      this._outlineLayers[i].count = activeCount;
      this._outlineLayers[i].instanceMatrix.needsUpdate = true;
    }

    this._renderDirty = false;
  }
}
