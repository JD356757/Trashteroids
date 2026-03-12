import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const _dir = new THREE.Vector3();
const _drift = new THREE.Vector3();
const _spawnPos = new THREE.Vector3();
const _defaultScale = new THREE.Vector3(1, 1, 1);
const _closestPoint = new THREE.Vector3();
const _collisionDelta = new THREE.Vector3();
const _collisionNormal = new THREE.Vector3();
const _separation = new THREE.Vector3();
const TRASH_HITBOX_SCALE = 0.7;
const TRASH_COLLISION_PADDING = 0.28;
const DEBRIS_FADE_NEAR = 2500;
const DEBRIS_FADE_FAR = 3000;
const DEBRIS_DESPAWN_DISTANCE = 3200;
const MAX_SPAWN_ATTEMPTS = 24;
const DEBRIS_DRAG = 0.996;
const MAX_DEBRIS_SPEED = 6;
const MAX_DEBRIS_ROTATION_SPEED = 0.85;
const MAX_ASTEROID_COLLISION_STEP = 6;
const ASTEROID_COLLISION_BOUNCE = 0.35;
const ASTEROID_SPAWN_PADDING = 32;

const DEBRIS_TYPES = {
  b1: {
    modelPath: '/models/b1.glb',
    modelScale: 0.03,
    color: 0x7cc7ff,
    emissive: 0x17374e,
    geometry: 'dodecahedron',
    size: [2, 2, 2],
    points: 100,
    hitRadius: 0.9,
    speedMultiplier: 1.0,
    drift: 0.18,
  },
  b2: {
    modelPath: '/models/b2.glb',
    modelScale: 0.03,
    color: 0x65d98d,
    emissive: 0x173d28,
    geometry: 'dodecahedron',
    size: [2, 2, 2],
    points: 120,
    hitRadius: 0.9,
    speedMultiplier: 1.05,
    drift: 0.2,
  },
  b3: {
    modelPath: '/models/b3.glb',
    modelScale: 0.03,
    color: 0xf48c1b,
    emissive: 0x4a2203,
    geometry: 'dodecahedron',
    size: [2, 2, 2],
    points: 140,
    hitRadius: 0.9,
    speedMultiplier: 1.1,
    drift: 0.22,
  },
  laptop: {
    modelPath: '/models/laptop.glb',
    modelScale: 0.03,
    color: 0x8a8a95,
    emissive: 0x1f1f28,
    geometry: 'dodecahedron',
    size: [2, 2, 2],
    points: 180,
    hitRadius: 1.0,
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
  const mat = new THREE.MeshStandardMaterial({
    color: def.color,
    emissive: def.emissive,
    metalness: 0.3,
    roughness: 0.7,
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

export class DebrisManager {
  constructor(scene) {
    this.scene = scene;
    this.active = [];
    this.spawnTimer = 0;
    this.despawnDist = DEBRIS_DESPAWN_DISTANCE;
    this.maxSpawnPerFrame = 28;
    this.sectionOccupancy = new Map();
    this._loadModelTemplates();
  }

  update(delta, spawnConfig, playerPos, asteroidColliders = null) {
    this.spawnTimer -= delta;
    const desiredCount = spawnConfig.minActive ?? 4;
    const missingCount = Math.max(0, desiredCount - this.active.length);
    let spawnCount = Math.min(this.maxSpawnPerFrame, missingCount);

    if (this.spawnTimer <= 0) {
      spawnCount = Math.max(spawnCount, 1);
      this.spawnTimer += spawnConfig.interval;
    }

    for (let i = 0; i < spawnCount; i++) {
      this._spawn(spawnConfig, playerPos, asteroidColliders);
    }

    if (spawnCount > 0 && this.active.length < desiredCount) {
      this.spawnTimer = Math.min(this.spawnTimer, spawnConfig.interval * 0.7);
    }

    for (let i = this.active.length - 1; i >= 0; i--) {
      const d = this.active[i];
      if (!Number.isFinite(d.position.x) || !Number.isFinite(d.position.y) || !Number.isFinite(d.position.z)) {
        this._releaseSectionSlot(d.sectionKey);
        this.scene.remove(d.mesh);
        this.active.splice(i, 1);
        continue;
      }

      d.mesh.position.addScaledVector(d.velocity, delta);
      d.mesh.rotation.x += d.rotSpeed.x * delta;
      d.mesh.rotation.y += d.rotSpeed.y * delta;
      d.mesh.rotation.z += d.rotSpeed.z * delta;
      d.velocity.multiplyScalar(Math.pow(DEBRIS_DRAG, delta * 60));
      this._clampVelocity(d.velocity);

      const distance = d.mesh.position.distanceTo(playerPos);
      this._applyFade(d, distance);

      if (distance > this.despawnDist) {
        this._releaseSectionSlot(d.sectionKey);
        this.scene.remove(d.mesh);
        this.active.splice(i, 1);
      }
    }

    this._resolveTrashCollisions();
  }

  _spawn(config, playerPos, asteroidColliders) {
    const types = config.types || ['b1'];
    const type = types[Math.floor(Math.random() * types.length)];
    const def = DEBRIS_TYPES[type];
    const hitHalfSize = new THREE.Vector3(
      def.size[0] * TRASH_HITBOX_SCALE,
      def.size[1] * TRASH_HITBOX_SCALE,
      def.size[2] * TRASH_HITBOX_SCALE
    );
    const debrisRadius = hitHalfSize.length() + TRASH_COLLISION_PADDING;
    const spawnData = this._findSpawnPosition(config, playerPos, asteroidColliders, debrisRadius);
    if (!spawnData) return false;

    const mesh = createDebrisMesh(type);
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

    this.scene.add(mesh);
    const collisionHalfSize = hitHalfSize.clone().addScalar(TRASH_COLLISION_PADDING);
    const fadeMaterials = this._prepareFadeMaterials(mesh);

    this.active.push({
      mesh,
      velocity,
      rotSpeed: {
        x: THREE.MathUtils.clamp((Math.random() - 0.5) * 1.2, -MAX_DEBRIS_ROTATION_SPEED, MAX_DEBRIS_ROTATION_SPEED),
        y: THREE.MathUtils.clamp((Math.random() - 0.5) * 1.2, -MAX_DEBRIS_ROTATION_SPEED, MAX_DEBRIS_ROTATION_SPEED),
        z: THREE.MathUtils.clamp((Math.random() - 0.5) * 1.2, -MAX_DEBRIS_ROTATION_SPEED, MAX_DEBRIS_ROTATION_SPEED),
      },
      points: def.points,
      hitRadius: def.hitRadius,
      hitHalfSize,
      collisionHalfSize,
      fadeMaterials,
      sectionKey: spawnData.sectionKey,
      position: mesh.position,
    });

    return true;
  }

  _findSpawnPosition(config, playerPos, asteroidColliders, debrisRadius) {
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
      if (this._intersectsAsteroid(_spawnPos, debrisRadius, asteroidColliders)) continue;

      this.sectionOccupancy.set(sectionKey, usedInSection + 1);
      return {
        position: _spawnPos.clone(),
        sectionKey,
      };
    }

    return null;
  }

  _intersectsAsteroid(position, debrisRadius, asteroidColliders) {
    if (!asteroidColliders || asteroidColliders.length === 0) return false;

    for (let i = 0; i < asteroidColliders.length; i++) {
      const sphere = asteroidColliders[i].boundingSphere;
      const minDistance = sphere.radius + debrisRadius + ASTEROID_SPAWN_PADDING;
      if (sphere.center.distanceToSquared(position) < minDistance * minDistance) {
        return true;
      }
    }

    return false;
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
        const next = material.clone();
        next.transparent = true;
        fadeMaterials.push(next);
        return next;
      });
      child.material = Array.isArray(child.material) ? cloned : cloned[0];
    });

    return fadeMaterials;
  }

  _applyFade(debris, distance) {
    let opacity = 1;
    if (distance > DEBRIS_FADE_NEAR) {
      opacity = distance >= DEBRIS_FADE_FAR
        ? 0
        : 1 - (distance - DEBRIS_FADE_NEAR) / (DEBRIS_FADE_FAR - DEBRIS_FADE_NEAR);
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
      const halfSize = debris.collisionHalfSize || debris.hitHalfSize;
      if (!halfSize) continue;

      for (let j = 0; j < asteroids.length; j++) {
        const sphere = asteroids[j].boundingSphere;
        const minX = debris.position.x - halfSize.x;
        const maxX = debris.position.x + halfSize.x;
        const minY = debris.position.y - halfSize.y;
        const maxY = debris.position.y + halfSize.y;
        const minZ = debris.position.z - halfSize.z;
        const maxZ = debris.position.z + halfSize.z;

        _closestPoint.set(
          THREE.MathUtils.clamp(sphere.center.x, minX, maxX),
          THREE.MathUtils.clamp(sphere.center.y, minY, maxY),
          THREE.MathUtils.clamp(sphere.center.z, minZ, maxZ)
        );

        _collisionDelta.copy(debris.position).sub(sphere.center);
        _collisionNormal.copy(sphere.center).sub(_closestPoint);
        let overlap = sphere.radius;

        if (_collisionNormal.lengthSq() > 1e-8) {
          const distance = _collisionNormal.length();
          overlap -= distance;
          if (overlap <= 0) continue;
          _collisionNormal.multiplyScalar(1 / distance);
        } else {
          const ax = Math.abs(_collisionDelta.x / Math.max(halfSize.x, 1e-6));
          const ay = Math.abs(_collisionDelta.y / Math.max(halfSize.y, 1e-6));
          const az = Math.abs(_collisionDelta.z / Math.max(halfSize.z, 1e-6));

          if (ax >= ay && ax >= az) {
            _collisionNormal.set(Math.sign(_collisionDelta.x) || 1, 0, 0);
            overlap += halfSize.x - Math.abs(_collisionDelta.x);
          } else if (ay >= az) {
            _collisionNormal.set(0, Math.sign(_collisionDelta.y) || 1, 0);
            overlap += halfSize.y - Math.abs(_collisionDelta.y);
          } else {
            _collisionNormal.set(0, 0, Math.sign(_collisionDelta.z) || 1);
            overlap += halfSize.z - Math.abs(_collisionDelta.z);
          }
        }

        const correction = Math.min(overlap + 0.02, MAX_ASTEROID_COLLISION_STEP);
        debris.position.addScaledVector(_collisionNormal, correction);
        const inwardSpeed = debris.velocity.dot(_collisionNormal);
        if (inwardSpeed < 0) {
          debris.velocity.addScaledVector(_collisionNormal, -inwardSpeed * (1 + ASTEROID_COLLISION_BOUNCE));
          this._clampVelocity(debris.velocity);
        }
      }
    }
  }

  _resolveTrashCollisions() {
    for (let i = 0; i < this.active.length; i++) {
      const a = this.active[i];
      const halfA = a.collisionHalfSize || a.hitHalfSize;
      if (!halfA) continue;

      for (let j = i + 1; j < this.active.length; j++) {
        const b = this.active[j];
        const halfB = b.collisionHalfSize || b.hitHalfSize;
        if (!halfB) continue;

        const overlapX = halfA.x + halfB.x - Math.abs(a.position.x - b.position.x);
        if (overlapX <= 0) continue;
        const overlapY = halfA.y + halfB.y - Math.abs(a.position.y - b.position.y);
        if (overlapY <= 0) continue;
        const overlapZ = halfA.z + halfB.z - Math.abs(a.position.z - b.position.z);
        if (overlapZ <= 0) continue;

        if (overlapX <= overlapY && overlapX <= overlapZ) {
          _separation.set(Math.sign(a.position.x - b.position.x) || 1, 0, 0).multiplyScalar(overlapX * 0.5 + 0.01);
        } else if (overlapY <= overlapZ) {
          _separation.set(0, Math.sign(a.position.y - b.position.y) || 1, 0).multiplyScalar(overlapY * 0.5 + 0.01);
        } else {
          _separation.set(0, 0, Math.sign(a.position.z - b.position.z) || 1).multiplyScalar(overlapZ * 0.5 + 0.01);
        }

        a.position.add(_separation);
        b.position.sub(_separation);

        _separation.normalize();
        const aSpeed = a.velocity.dot(_separation);
        const bSpeed = b.velocity.dot(_separation);
        const relativeSpeed = bSpeed - aSpeed;
        if (relativeSpeed > 0) {
          const impulse = relativeSpeed * 0.5;
          a.velocity.addScaledVector(_separation, impulse);
          b.velocity.addScaledVector(_separation, -impulse);
          this._clampVelocity(a.velocity);
          this._clampVelocity(b.velocity);
        }
      }
    }
  }

  _clampVelocity(velocity) {
    const maxSpeedSq = MAX_DEBRIS_SPEED * MAX_DEBRIS_SPEED;
    if (velocity.lengthSq() > maxSpeedSq) {
      velocity.setLength(MAX_DEBRIS_SPEED);
    }
  }

  _loadModelTemplates() {
    const loader = new GLTFLoader();

    for (const def of Object.values(DEBRIS_TYPES)) {
      loader.load(def.modelPath, (gltf) => {
        const template = gltf.scene;
        template.traverse((child) => {
          if (!child.isMesh) return;
          child.castShadow = true;
          child.receiveShadow = true;
        });

        def.template = template;
        def.modelScaleVector = new THREE.Vector3(def.modelScale, def.modelScale, def.modelScale);
      });
    }
  }

  getActive() {
    return this.active;
  }

  remove(index) {
    const d = this.active[index];
    if (d) {
      this._releaseSectionSlot(d.sectionKey);
      this.scene.remove(d.mesh);
      this.active.splice(index, 1);
    }
  }
}
