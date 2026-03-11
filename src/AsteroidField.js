import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';

const _bounds = new THREE.Box3();
const _boundingSphere = new THREE.Sphere();
const _worldCenter = new THREE.Vector3();
const _collisionNormal = new THREE.Vector3();
const _relativeVelocity = new THREE.Vector3();
const _impulse = new THREE.Vector3();
const SHOW_BOUNDING_SPHERES = false;
const BOUNDING_SPHERE_MATERIAL = new THREE.MeshBasicMaterial({
  color: 0x4dc3ff,
  wireframe: true,
  transparent: true,
  opacity: 0.35,
  depthWrite: false,
  fog: false,
});

// ─── Tunable parameters ──────────────────────────────────────────────────────

// 0.0 = all small, 1.0 = all big
const BIG_RATIO = 0.9;

// Scale ranges per size class
const BIG_SCALE_MIN = 1;
const BIG_SCALE_MAX = 4;
const SMALL_SCALE_MIN = 0.2;
const SMALL_SCALE_MAX = 0.7;
const BOUNDING_SPHERE_SCALE = 0.45;
const MIN_DRIFT_SPEED = 0.6;
const MAX_DRIFT_SPEED = 2.4;
const ASTEROID_BOUNCE = 0.9;
const ASTEROID_DRAG = 0.995;
const COLLISION_PASSES = 2;

// ─── Distance fade ───────────────────────────────────────────────────────────
// Asteroids closer than FADE_NEAR are fully opaque.
// Asteroids beyond FADE_FAR are fully transparent.
const FADE_NEAR = 2500;
const FADE_FAR  = 3000;
// Minimum distance from the player for a new asteroid to spawn (skipped at game start)
const MIN_SPAWN_DISTANCE = 2600;
// ─────────────────────────────────────────────────────────────────────────────

// ─── Player-centered procedural generation ───────────────────────────────────
const INITIAL_SPAWN_DISTANCE = 1500;
const SPAWN_SHELL_MIN = MIN_SPAWN_DISTANCE;
const SPAWN_SHELL_MAX = 4000;
const DESPAWN_DISTANCE = 4500;
const TARGET_ASTEROID_COUNT = 600;
const SPAWN_BATCH_PER_FRAME = 20;
const MAX_SPAWN_ATTEMPTS_PER_FRAME = 100;
const MIN_ASTEROID_PADDING = 120;
const MAX_INSTANCES = 1000;
// ─────────────────────────────────────────────────────────────────────────────

// ─── Glow sprite ─────────────────────────────────────────────────────────────
// How much larger than the asteroid's bounding sphere the glow halo is
const GLOW_RADIUS_MULTIPLIER = 1.2;
// Pulsing speed (radians/second) – set to 0 to disable pulse
const GLOW_PULSE_SPEED = 1.2;
// Pulse amplitude as a fraction of base scale (0 = no pulse, 0.15 = ±15%)
const GLOW_PULSE_AMPLITUDE = 0.15;
// Glow brightness: 0.0 = invisible, 1.0 = full intensity
const GLOW_BRIGHTNESS = 0;

function makeGlowTexture(size = 256) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const half = size / 2;
  const grad = ctx.createRadialGradient(half, half, 0, half, half, half);
  const b = GLOW_BRIGHTNESS;
  // Warm amber-white core fading to transparent orange edge
  grad.addColorStop(0,    `rgba(255, 220, 140, ${0.55 * b})`);
  grad.addColorStop(0.35, `rgba(220, 150,  60, ${0.22 * b})`);
  grad.addColorStop(0.7,  `rgba(180, 100,  30, ${0.07 * b})`);
  grad.addColorStop(1,    'rgba(160,  80,  20, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(canvas);
}

const GLOW_TEXTURE  = makeGlowTexture();
const GLOW_MATERIAL = new THREE.SpriteMaterial({
  map: GLOW_TEXTURE,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
  transparent: true,
  fog: false,
});
// ─────────────────────────────────────────────────────────────────────────────

const BIG_FILES = [
  'big1.fbx', 'big2.fbx', 'big3.fbx', 'big4.fbx', 'big5.fbx', 'big6.fbx', 'big7.fbx',
];

const SMALL_FILES = [
  'rock.002.fbx', 'rock.003.fbx', 'rock.004.fbx', 'rock.005.fbx', 'rock.006.fbx',
  'rock.013.fbx', 'rock.014.fbx', 'rock.015.fbx', 'rock.016.fbx', 'rock.017.fbx',
  'rock.018.fbx', 'rock.019.fbx', 'rock.020.fbx', 'rock.021.fbx', 'rock.022.fbx',
  'rock.023.fbx',
];

const ROCKY_MAT = new THREE.MeshStandardMaterial({
  color: 0x8a8070,
  roughness: 0.95,
  metalness: 0.05,
  emissive: new THREE.Color(0.06, 0.05, 0.04),
});

function applyMaterial(obj) {
  obj.traverse((child) => {
    if (!child.isMesh) return;
    child.material = ROCKY_MAT;
    child.castShadow = true;
    child.receiveShadow = true;
  });
}

// Create a unique transparent material clone for a single asteroid instance.
// All child meshes in the group share this one clone.
function makeInstanceMaterial() {
  const mat = ROCKY_MAT.clone();
  mat.transparent = true;
  mat.opacity = 0;
  mat.depthWrite = true;
  return mat;
}

function applyInstanceMaterial(group, mat) {
  group.traverse((child) => {
    if (!child.isMesh) return;
    child.material = mat;
  });
}

function randomUnitVector() {
  const theta = Math.random() * Math.PI * 2;
  const phi = Math.acos(2 * Math.random() - 1);
  return new THREE.Vector3(
    Math.sin(phi) * Math.cos(theta),
    Math.sin(phi) * Math.sin(theta),
    Math.cos(phi),
  );
}

function randomPointInShell(center, minRadius, maxRadius) {
  const radius = minRadius + Math.random() * (maxRadius - minRadius);
  return randomUnitVector().multiplyScalar(radius).add(center);
}

export class AsteroidField {
  constructor(scene) {
    this.scene = scene;
    this.instances = [];          // flat array of all active asteroid instances
    this._elapsed = 0;

    // ── Model pools (filled async by _loadModels) ──────────────────────────
    this._modelsBig = [];            // array of loaded/cloneable FBX roots
    this._modelsSmall = [];
    this._modelsReady = false;
    this._pendingLoads = 0;
    this._lastPlayerPos = null;
    this._isInitialLoad = true;

    this._loadModels();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Model loading — load each FBX once; cloning happens in _generateChunk
  // ═══════════════════════════════════════════════════════════════════════════
  _loadModels() {
    const loader = new FBXLoader();
    const allFiles = [
      ...BIG_FILES.map((f) => ({ path: '/models/asteroid/big/' + f, big: true })),
      ...SMALL_FILES.map((f) => ({ path: '/models/asteroid/small/' + f, big: false })),
    ];
    this._pendingLoads = allFiles.length;

    for (const entry of allFiles) {
      loader.load(entry.path, (fbx) => {
        applyMaterial(fbx);
        if (entry.big) this._modelsBig.push(fbx);
        else this._modelsSmall.push(fbx);

        this._pendingLoads--;
        if (this._pendingLoads === 0) {
          this._modelsReady = true;
          if (this._lastPlayerPos) {
            this._maintainPopulation(this._lastPlayerPos, true);
            this._isInitialLoad = false;
          }
        }
      });
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Lifecycle helpers
  // ═══════════════════════════════════════════════════════════════════════════
  _disposeAsteroid(ast) {
    this.scene.remove(ast.mesh);
    if (ast.fadeMat) ast.fadeMat.dispose();
    if (ast.glowSprite) {
      ast.glowSprite.material.dispose();
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Spawn helpers
  // ═══════════════════════════════════════════════════════════════════════════
  _canSpawnAt(center, radius, playerPosition, initialLoad) {
    if (!initialLoad) {
      const minPlayerDistance = MIN_SPAWN_DISTANCE + radius;
      if (center.distanceToSquared(playerPosition) < minPlayerDistance * minPlayerDistance) {
        return false;
      }
    }

    for (const ast of this.instances) {
      const minDistance = ast.boundingSphere.radius + radius + MIN_ASTEROID_PADDING;
      if (ast.boundingSphere.center.distanceToSquared(center) < minDistance * minDistance) {
        return false;
      }
    }

    return true;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Spawn / despawn
  // ═══════════════════════════════════════════════════════════════════════════
  _spawnAsteroid(playerPosition, initialLoad = false) {
    if (this.instances.length >= MAX_INSTANCES) return false;

    const isBig = Math.random() < BIG_RATIO;
    const pool = isBig ? this._modelsBig : this._modelsSmall;
    if (pool.length === 0) return false;

    const modelIndex = Math.floor(Math.random() * pool.length);
    const scaleMin = isBig ? BIG_SCALE_MIN : SMALL_SCALE_MIN;
    const scaleMax = isBig ? BIG_SCALE_MAX : SMALL_SCALE_MAX;

    const instance = new THREE.Group();
    const model = pool[modelIndex].clone();
    const scale = scaleMin + Math.random() * (scaleMax - scaleMin);
    model.scale.setScalar(scale);
    instance.add(model);

    const fadeMat = makeInstanceMaterial();
    applyInstanceMaterial(instance, fadeMat);

    _bounds.setFromObject(model);
    _bounds.getBoundingSphere(_boundingSphere);

    const localCenter = _boundingSphere.center.clone();
    const colliderRadius = _boundingSphere.radius * BOUNDING_SPHERE_SCALE;
    const collider = new THREE.Sphere(new THREE.Vector3(), colliderRadius);

    instance.rotation.set(
      Math.random() * Math.PI * 2,
      Math.random() * Math.PI * 2,
      Math.random() * Math.PI * 2,
    );

    const spawnMin = initialLoad ? INITIAL_SPAWN_DISTANCE : SPAWN_SHELL_MIN;
    instance.position.copy(randomPointInShell(playerPosition, spawnMin, SPAWN_SHELL_MAX));
    instance.updateMatrixWorld(true);
    collider.center.copy(instance.localToWorld(_worldCenter.copy(localCenter)));

    if (!this._canSpawnAt(collider.center, colliderRadius, playerPosition, initialLoad)) {
      fadeMat.dispose();
      return false;
    }

    instance.userData.rotSpeed = {
      x: (Math.random() - 0.5) * 0.12,
      y: (Math.random() - 0.5) * 0.12,
      z: (Math.random() - 0.5) * 0.06,
    };

    const velocity = randomUnitVector().multiplyScalar(
      MIN_DRIFT_SPEED + Math.random() * (MAX_DRIFT_SPEED - MIN_DRIFT_SPEED)
    );

    let glowSprite = null;
    if (isBig) {
      glowSprite = new THREE.Sprite(GLOW_MATERIAL.clone());
      const glowSize = colliderRadius * 2 * GLOW_RADIUS_MULTIPLIER;
      glowSprite.scale.setScalar(glowSize);
      glowSprite.position.copy(localCenter);
      glowSprite.userData.glowBaseScale = glowSize;
      glowSprite.userData.glowPhase = Math.random() * Math.PI * 2;
      instance.add(glowSprite);
    }

    if (SHOW_BOUNDING_SPHERES) {
      const boundsMesh = new THREE.Mesh(
        new THREE.SphereGeometry(colliderRadius, 16, 12),
        BOUNDING_SPHERE_MATERIAL
      );
      boundsMesh.position.copy(localCenter);
      instance.add(boundsMesh);
    }

    this.scene.add(instance);
    this.instances.push({
      mesh: instance,
      boundingSphere: collider,
      localCenter,
      velocity,
      mass: Math.max(colliderRadius * colliderRadius * colliderRadius, 0.001),
      glowSprite,
      fadeMat,
    });

    return true;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Population maintenance
  // ═══════════════════════════════════════════════════════════════════════════
  _removeDistantAsteroids(playerPosition) {
    for (let i = this.instances.length - 1; i >= 0; i--) {
      const ast = this.instances[i];
      if (ast.boundingSphere.center.distanceToSquared(playerPosition) > DESPAWN_DISTANCE * DESPAWN_DISTANCE) {
        this._disposeAsteroid(ast);
        this.instances.splice(i, 1);
      }
    }
  }

  _maintainPopulation(playerPosition, initialLoad = false) {
    if (!this._modelsReady || !playerPosition) return;

    const target = Math.min(TARGET_ASTEROID_COUNT, MAX_INSTANCES);
    const spawnBudget = initialLoad ? target : SPAWN_BATCH_PER_FRAME;
    const attemptBudget = initialLoad ? target * 8 : MAX_SPAWN_ATTEMPTS_PER_FRAME;

    let spawned = 0;
    let attempts = 0;
    while (
      this.instances.length < target &&
      spawned < spawnBudget &&
      attempts < attemptBudget
    ) {
      if (this._spawnAsteroid(playerPosition, initialLoad)) {
        spawned++;
      }
      attempts++;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Per-frame update
  // ═══════════════════════════════════════════════════════════════════════════
  update(delta, playerPosition) {
    this._elapsed += delta;

    if (playerPosition) {
      this._lastPlayerPos = playerPosition;
      if (this._modelsReady) {
        if (this._isInitialLoad) {
          this._maintainPopulation(playerPosition, true);
          this._isInitialLoad = false;
        }
        this._removeDistantAsteroids(playerPosition);
        this._maintainPopulation(playerPosition);
      }
    }

    for (const ast of this.instances) {
      ast.mesh.position.addScaledVector(ast.velocity, delta);
      ast.mesh.rotation.x += ast.mesh.userData.rotSpeed.x * delta;
      ast.mesh.rotation.y += ast.mesh.userData.rotSpeed.y * delta;
      ast.mesh.rotation.z += ast.mesh.userData.rotSpeed.z * delta;
      ast.velocity.multiplyScalar(Math.pow(ASTEROID_DRAG, delta * 60));
      ast.mesh.updateMatrixWorld(true);
      ast.boundingSphere.center.copy(ast.mesh.localToWorld(_worldCenter.copy(ast.localCenter)));

      // ── Distance fade ────────────────────────────────────────────────────
      if (playerPosition && ast.fadeMat) {
        const dist = ast.boundingSphere.center.distanceTo(playerPosition);
        let opacity;
        if (dist <= FADE_NEAR) opacity = 1;
        else if (dist >= FADE_FAR) opacity = 0;
        else opacity = 1 - (dist - FADE_NEAR) / (FADE_FAR - FADE_NEAR);
        ast.fadeMat.opacity = opacity;
        ast.fadeMat.depthWrite = opacity > 0.5;
        // Fade glow sprite in sync
        if (ast.glowSprite) {
          ast.glowSprite.material.opacity = opacity;
        }
      }
      // ────────────────────────────────────────────────────────────────────

      // ── Animate glow pulse ───────────────────────────────────────────────
      if (ast.glowSprite) {
        const phase = ast.glowSprite.userData.glowPhase;
        const baseSize = ast.glowSprite.userData.glowBaseScale;
        const pulse = 1 + GLOW_PULSE_AMPLITUDE *
          Math.sin(this._elapsed * GLOW_PULSE_SPEED + phase);
        ast.glowSprite.scale.setScalar(baseSize * pulse);
      }
      // ────────────────────────────────────────────────────────────────────
    }

    for (let pass = 0; pass < COLLISION_PASSES; pass++) {
      this._resolveCollisions();
    }
  }

  _resolveCollisions() {
    for (let i = 0; i < this.instances.length; i++) {
      const a = this.instances[i];

      for (let j = i + 1; j < this.instances.length; j++) {
        const b = this.instances[j];
        const minDistance = a.boundingSphere.radius + b.boundingSphere.radius;

        _collisionNormal.copy(b.boundingSphere.center).sub(a.boundingSphere.center);
        const distanceSq = _collisionNormal.lengthSq();
        if (distanceSq >= minDistance * minDistance) continue;

        let distance = Math.sqrt(distanceSq);
        if (distance === 0) {
          _collisionNormal.set(1, 0, 0);
          distance = 0.0001;
        } else {
          _collisionNormal.multiplyScalar(1 / distance);
        }

        const overlap = minDistance - distance;
        const totalMass = a.mass + b.mass;
        const moveA = overlap * (b.mass / totalMass);
        const moveB = overlap * (a.mass / totalMass);

        a.mesh.position.addScaledVector(_collisionNormal, -moveA);
        b.mesh.position.addScaledVector(_collisionNormal, moveB);

        a.mesh.updateMatrixWorld(true);
        b.mesh.updateMatrixWorld(true);
        a.boundingSphere.center.copy(a.mesh.localToWorld(_worldCenter.copy(a.localCenter)));
        b.boundingSphere.center.copy(b.mesh.localToWorld(_worldCenter.copy(b.localCenter)));

        _relativeVelocity.copy(b.velocity).sub(a.velocity);
        const separatingSpeed = _relativeVelocity.dot(_collisionNormal);
        if (separatingSpeed >= 0) continue;

        const impulseMagnitude = -(1 + ASTEROID_BOUNCE) * separatingSpeed / ((1 / a.mass) + (1 / b.mass));
        _impulse.copy(_collisionNormal).multiplyScalar(impulseMagnitude);

        a.velocity.addScaledVector(_impulse, -1 / a.mass);
        b.velocity.addScaledVector(_impulse, 1 / b.mass);
      }
    }
  }

  getColliders() {
    return this.instances;
  }
}
