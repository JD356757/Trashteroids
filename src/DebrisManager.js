import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const _dir = new THREE.Vector3();
const _drift = new THREE.Vector3();
const _spawnPos = new THREE.Vector3();
const _defaultScale = new THREE.Vector3(1, 1, 1);
const _collisionOffset = new THREE.Vector3();
const _collisionNormal = new THREE.Vector3();
const _separation = new THREE.Vector3();
const _relativeVelocity = new THREE.Vector3();
const DEBRIS_FADE_NEAR = 2500;
const DEBRIS_FADE_FAR = 3000;
const DEBRIS_FADE_NEAR_SQ = DEBRIS_FADE_NEAR * DEBRIS_FADE_NEAR;
const DEBRIS_FADE_FAR_SQ = DEBRIS_FADE_FAR * DEBRIS_FADE_FAR;
const DEBRIS_DESPAWN_DISTANCE = 3200;
const DEBRIS_DESPAWN_DISTANCE_SQ = DEBRIS_DESPAWN_DISTANCE * DEBRIS_DESPAWN_DISTANCE;
const MAX_SPAWN_ATTEMPTS = 24;
const MAX_DEBRIS_SPEED = 4.5;
const DEBRIS_HIT_RADIUS = 2.4;
const DEBRIS_COLLISION_RADIUS = 2.9;
const DEBRIS_ASTEROID_BOUNCE = 0.42;
const MAX_DEBRIS_POOL_SIZE = 384;

const DEBRIS_TYPES = {
  b1: {
    modelPath: '/models/elroid.glb',
    modelScale: 1,
    color: 0x7cc7ff,
    emissive: 0x17374e,
    geometry: 'dodecahedron',
    size: [1, 1, 1],
    points: 300,
    hitRadius: DEBRIS_HIT_RADIUS,
    speedMultiplier: 1.0,
    drift: 0.18,
  },
  b2: {
    modelPath: '/models/elroid.glb',
    modelScale: 1,
    color: 0x65d98d,
    emissive: 0x173d28,
    geometry: 'dodecahedron',
    size: [1, 1, 1],
    points: 300,
    hitRadius: DEBRIS_HIT_RADIUS,
    speedMultiplier: 1.05,
    drift: 0.2,
  },
  b3: {
    modelPath: '/models/elroid.glb',
    modelScale: 1,
    color: 0xf48c1b,
    emissive: 0x4a2203,
    geometry: 'dodecahedron',
    size: [1, 1, 1],
    points: 300,
    hitRadius: DEBRIS_HIT_RADIUS,
    speedMultiplier: 1.1,
    drift: 0.22,
  },
  laptop: {
    modelPath: '/models/elroid.glb',
    modelScale: 1,
    color: 0x8a8a95,
    emissive: 0x1f1f28,
    geometry: 'dodecahedron',
    size: [1, 1, 1],
    points: 300,
    hitRadius: DEBRIS_HIT_RADIUS,
    speedMultiplier: 0.9,
    drift: 0.14,
  },
};

function createDebrisMesh(type) {
  const def = DEBRIS_TYPES[type];
  if (def.template) {
    const instance = def.template.clone(true);
    instance.scale.copy(def.modelScaleVector || _defaultScale);
    return instance;
  }

  const geo = new THREE.DodecahedronGeometry(def.size[0] * 0.6, 0);
  const mat = new THREE.MeshBasicMaterial({
    color: def.color,
    transparent: true,
  });

  const mesh = new THREE.Mesh(geo, mat);
  const outline = new THREE.Mesh(
    geo.clone(),
    new THREE.MeshBasicMaterial({
      color: def.color,
      wireframe: true,
      transparent: true,
      opacity: 0.3,
    })
  );
  outline.scale.setScalar(1.15);
  mesh.add(outline);
  return mesh;
}

function cloneUnlitMaterial(material, fallbackColor) {
  const color = material.color ? material.color.clone() : new THREE.Color(fallbackColor);
  const next = new THREE.MeshBasicMaterial({
    color,
    map: material.map || null,
    alphaMap: material.alphaMap || null,
    transparent: material.transparent || !!material.alphaMap || material.opacity < 1,
    opacity: material.opacity ?? 1,
    side: material.side,
    fog: material.fog,
    wireframe: material.wireframe,
    vertexColors: material.vertexColors,
  });
  next.depthWrite = material.depthWrite;
  return next;
}

export class DebrisManager {
  constructor(scene) {
    this.scene = scene;
    this.active = [];
    this.pool = [];
    this.spawnTimer = 0;
    this.despawnDist = DEBRIS_DESPAWN_DISTANCE;
    this.despawnDistSq = DEBRIS_DESPAWN_DISTANCE_SQ;
    this.maxSpawnPerFrame = 28;
    this.maxPoolSize = MAX_DEBRIS_POOL_SIZE;
    this.sectionOccupancy = new Map();
    this._loadModelTemplates();
  }

  update(delta, spawnConfig, playerPos) {
    this.spawnTimer -= delta;
    const desiredCount = spawnConfig.minActive ?? 4;
    const missingCount = Math.max(0, desiredCount - this.active.length);
    let spawnCount = Math.min(this.maxSpawnPerFrame, missingCount);

    if (this.spawnTimer <= 0) {
      spawnCount = Math.max(spawnCount, 1);
      this.spawnTimer += spawnConfig.interval;
    }

    for (let i = 0; i < spawnCount; i++) {
      this._spawn(spawnConfig, playerPos);
    }

    if (spawnCount > 0 && this.active.length < desiredCount) {
      this.spawnTimer = Math.min(this.spawnTimer, spawnConfig.interval * 0.7);
    }

    for (let i = this.active.length - 1; i >= 0; i--) {
      const d = this.active[i];
      d.mesh.position.addScaledVector(d.velocity, delta);
      d.mesh.rotation.x += d.rotSpeed.x * delta;
      d.mesh.rotation.y += d.rotSpeed.y * delta;
      d.mesh.rotation.z += d.rotSpeed.z * delta;

      const distanceSq = d.mesh.position.distanceToSquared(playerPos);
      this._applyFade(d, distanceSq);

      if (distanceSq > this.despawnDistSq) {
        this.remove(i);
      }
    }

    this._resolveTrashCollisions();
  }

  _spawn(config, playerPos) {
    const types = config.types || ['b1'];
    const type = types[Math.floor(Math.random() * types.length)];
    const def = DEBRIS_TYPES[type];
    const spawnData = this._findSpawnPosition(config, playerPos);
    if (!spawnData) return false;

    const entry = this._acquireEntry(type);
    const mesh = entry.mesh;
    mesh.position.copy(spawnData.position);
    mesh.rotation.set(
      Math.random() * Math.PI * 2,
      Math.random() * Math.PI * 2,
      Math.random() * Math.PI * 2
    );

    _dir.copy(playerPos).sub(mesh.position).normalize();
    _dir.x += (Math.random() - 0.5) * 0.14;
    _dir.y += (Math.random() - 0.5) * 0.14;
    _dir.z += (Math.random() - 0.5) * 0.14;
    _dir.normalize();

    _drift.set(
      Math.random() - 0.5,
      Math.random() - 0.5,
      Math.random() - 0.5
    ).normalize().multiplyScalar(def.drift || 0.18);
    _dir.addScaledVector(_drift, 0.03).normalize();

    const speed = (config.speed + Math.random() * config.speedVariance) * (def.speedMultiplier || 1);
    const velocity = _dir.clone().multiplyScalar(speed).add(_drift);
    this._clampVelocity(velocity);

    entry.velocity.copy(velocity);
    entry.rotSpeed.set(
      (Math.random() - 0.5) * 1.2,
      (Math.random() - 0.5) * 1.2,
      (Math.random() - 0.5) * 1.2
    );
    entry.points = def.points;
    entry.hitRadius = def.hitRadius;
    entry.collisionRadius = DEBRIS_COLLISION_RADIUS;
    entry.sectionKey = spawnData.sectionKey;
    mesh.visible = true;
    this.scene.add(mesh);
    this.active.push(entry);

    return true;
  }

  _findSpawnPosition(config, playerPos) {
    const sectionSize = config.sectionSize || 800;
    const minDistance = config.spawnMinDistance ?? config.spawnRadius ?? 1800;
    const maxDistance = config.spawnMaxDistance ?? (minDistance + (config.spawnJitter || 200));
    const verticalSpread = config.verticalSpread || 0.35;
    const sectionTrashAmount = Math.max(1, config.sectionTrashAmount ?? 3);
    const sectionDensity = THREE.MathUtils.clamp(config.sectionDensity ?? 0.5, 0.05, 1);
    const sectionLimit = Math.max(1, Math.round(sectionTrashAmount * sectionDensity));

    for (let attempt = 0; attempt < MAX_SPAWN_ATTEMPTS; attempt++) {
      const spawnDistance = minDistance + Math.random() * Math.max(1, maxDistance - minDistance);
      const theta = Math.random() * Math.PI * 2;
      const sy = (Math.random() * 2 - 1) * spawnDistance * verticalSpread;
      const horizontalRadius = Math.sqrt(Math.max(0, spawnDistance * spawnDistance - sy * sy));
      const sx = Math.cos(theta) * horizontalRadius;
      const sz = Math.sin(theta) * horizontalRadius;

      _spawnPos.set(playerPos.x + sx, playerPos.y + sy, playerPos.z + sz);

      const sectionKey = this._getSpawnCellKey(_spawnPos, sectionSize);
      const usedInSection = this.sectionOccupancy.get(sectionKey) || 0;
      if (usedInSection >= sectionLimit) continue;

      this.sectionOccupancy.set(sectionKey, usedInSection + 1);
      return {
        position: _spawnPos.clone(),
        sectionKey,
      };
    }

    return null;
  }

  _getSpawnCellKey(position, cellSize) {
    const x = Math.floor(position.x / cellSize);
    const y = Math.floor(position.y / cellSize);
    const z = Math.floor(position.z / cellSize);
    return `${x}:${y}:${z}`;
  }

  _releaseSectionSlot(sectionKey) {
    if (!sectionKey) return;
    const used = this.sectionOccupancy.get(sectionKey);
    if (!used) return;
    if (used <= 1) {
      this.sectionOccupancy.delete(sectionKey);
      return;
    }
    this.sectionOccupancy.set(sectionKey, used - 1);
  }

  _prepareFadeMaterials(mesh) {
    const fadeMaterials = [];

    mesh.traverse((child) => {
      if (!child.isMesh || !child.material) return;
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      const cloned = materials.map((material) => {
        const next = cloneUnlitMaterial(material, 0xffffff);
        next.transparent = true;
        fadeMaterials.push(next);
        return next;
      });
      child.material = Array.isArray(child.material) ? cloned : cloned[0];
    });

    return fadeMaterials;
  }

  _applyFade(debris, distanceSq) {
    let opacity = 1;
    if (distanceSq > DEBRIS_FADE_NEAR_SQ) {
      opacity = distanceSq >= DEBRIS_FADE_FAR_SQ
        ? 0
        : 1 - (Math.sqrt(distanceSq) - DEBRIS_FADE_NEAR) / (DEBRIS_FADE_FAR - DEBRIS_FADE_NEAR);
    }

    if (!debris.fadeMaterials) return;
    for (let i = 0; i < debris.fadeMaterials.length; i++) {
      const material = debris.fadeMaterials[i];
      material.opacity = opacity;
      material.depthWrite = opacity > 0.45;
    }
  }

  resolveAsteroidCollisions(asteroids) {
    if (!asteroids || asteroids.length === 0) return;

    for (let i = 0; i < this.active.length; i++) {
      const debris = this.active[i];
      const debrisRadius = debris.collisionRadius || debris.hitRadius;
      if (!debrisRadius) continue;

      for (let j = 0; j < asteroids.length; j++) {
        const sphere = asteroids[j].boundingSphere;
        const minDistance = sphere.radius + debrisRadius;
        _collisionOffset.copy(debris.position).sub(sphere.center);
        const distanceSq = _collisionOffset.lengthSq();
        if (distanceSq >= minDistance * minDistance) continue;

        let distance = Math.sqrt(distanceSq);
        if (distance <= 1e-6) {
          _collisionNormal.copy(debris.velocity);
          if (_collisionNormal.lengthSq() <= 1e-6) {
            _collisionNormal.set(0, 1, 0);
          } else {
            _collisionNormal.normalize();
          }
          distance = 0;
        } else {
          _collisionNormal.copy(_collisionOffset).multiplyScalar(1 / distance);
        }

        const overlap = minDistance - distance;
        debris.position.addScaledVector(_collisionNormal, overlap + 0.02);

        const inwardSpeed = debris.velocity.dot(_collisionNormal);
        if (inwardSpeed < 0) {
          debris.velocity.addScaledVector(_collisionNormal, -inwardSpeed * (1 + DEBRIS_ASTEROID_BOUNCE));
          this._clampVelocity(debris.velocity);
        }
      }
    }
  }

  _resolveTrashCollisions() {
    for (let i = 0; i < this.active.length; i++) {
      const a = this.active[i];
      const radiusA = a.collisionRadius || a.hitRadius;
      if (!radiusA) continue;

      for (let j = i + 1; j < this.active.length; j++) {
        const b = this.active[j];
        const radiusB = b.collisionRadius || b.hitRadius;
        if (!radiusB) continue;

        _separation.copy(a.position).sub(b.position);
        const minDistance = radiusA + radiusB;
        const distanceSq = _separation.lengthSq();
        if (distanceSq >= minDistance * minDistance) continue;

        let distance = Math.sqrt(distanceSq);
        if (distance <= 1e-6) {
          _separation.set(1, 0, 0);
          distance = 0;
        } else {
          _separation.multiplyScalar(1 / distance);
        }
        const overlap = minDistance - distance;
        _separation.multiplyScalar(overlap * 0.5 + 0.01);

        a.position.add(_separation);
        b.position.sub(_separation);

        _separation.normalize();
        _relativeVelocity.copy(a.velocity).sub(b.velocity);
        const closingSpeed = _relativeVelocity.dot(_separation);
        if (closingSpeed < 0) {
          const correction = Math.min(-closingSpeed * 0.35, 0.75);
          a.velocity.addScaledVector(_separation, correction);
          b.velocity.addScaledVector(_separation, -correction);
          a.velocity.multiplyScalar(0.985);
          b.velocity.multiplyScalar(0.985);
          this._clampVelocity(a.velocity);
          this._clampVelocity(b.velocity);
        }
      }
    }
  }

  _clampVelocity(velocity) {
    if (velocity.lengthSq() > MAX_DEBRIS_SPEED * MAX_DEBRIS_SPEED) {
      velocity.setLength(MAX_DEBRIS_SPEED);
    }
  }

  _acquireEntry(type) {
    const def = DEBRIS_TYPES[type];
    const entry = this.pool.pop();
    if (entry) {
      entry.mesh.visible = true;
      entry.points = def.points;
      entry.hitRadius = def.hitRadius;
      entry.collisionRadius = DEBRIS_COLLISION_RADIUS;
      return entry;
    }

    const mesh = createDebrisMesh(type);
    const fadeMaterials = this._prepareFadeMaterials(mesh);
    return {
      mesh,
      velocity: new THREE.Vector3(),
      rotSpeed: new THREE.Vector3(),
      points: def.points,
      hitRadius: def.hitRadius,
      collisionRadius: DEBRIS_COLLISION_RADIUS,
      fadeMaterials,
      sectionKey: null,
      position: mesh.position,
    };
  }

  _releaseEntry(entry) {
    this._releaseSectionSlot(entry.sectionKey);
    entry.sectionKey = null;
    entry.mesh.visible = false;
    this.scene.remove(entry.mesh);
    entry.velocity.set(0, 0, 0);
    entry.rotSpeed.set(0, 0, 0);
    this._applyFade(entry, 0);
    if (this.pool.length < this.maxPoolSize) {
      this.pool.push(entry);
    }
  }

  _loadModelTemplates() {
    const loader = new GLTFLoader();

    const defsByPath = new Map();
    for (const def of Object.values(DEBRIS_TYPES)) {
      const defs = defsByPath.get(def.modelPath) || [];
      defs.push(def);
      defsByPath.set(def.modelPath, defs);
    }

    for (const [modelPath, defs] of defsByPath) {
      loader.load(modelPath, (gltf) => {
        const template = gltf.scene;
        template.traverse((child) => {
          if (!child.isMesh) return;
          child.castShadow = false;
          child.receiveShadow = false;
        });

        for (let i = 0; i < defs.length; i++) {
          const def = defs[i];
          def.template = template;
          def.modelScaleVector = new THREE.Vector3(def.modelScale, def.modelScale, def.modelScale);
        }
      });
    }
  }

  getActive() {
    return this.active;
  }

  remove(index) {
    const lastIndex = this.active.length - 1;
    if (index < 0 || index > lastIndex) return;

    const entry = this.active[index];
    if (index !== lastIndex) {
      this.active[index] = this.active[lastIndex];
    }
    this.active.pop();
    this._releaseEntry(entry);
  }
}
