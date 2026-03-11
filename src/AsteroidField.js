import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

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

// Fixed scale multiplier (size variation is already in the models)
const SCALE = 100;

const MIN_DRIFT_SPEED = 0.0;
const MAX_DRIFT_SPEED = 2.0;
const ASTEROID_BOUNCE = 0.9;
const ASTEROID_DRAG = 1;
const COLLISION_PASSES = 2;

// ─── Distance fade ───────────────────────────────────────────────────────────
const FADE_NEAR = 2500;
const FADE_FAR  = 3000;
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
const GLOW_RADIUS_MULTIPLIER = 1.2;
const GLOW_PULSE_SPEED = 1.2;
const GLOW_PULSE_AMPLITUDE = 0.15;
const GLOW_BRIGHTNESS = 0;

function makeGlowTexture(size = 256) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const half = size / 2;
  const grad = ctx.createRadialGradient(half, half, 0, half, half, half);
  const b = GLOW_BRIGHTNESS;
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

const ASTEROID_COLOR_LIT   = new THREE.Color(0xd8ced9);
const ASTEROID_COLOR_SHADE = new THREE.Color(0xb19bb3);
const ASTEROID_OUTLINE_COLOR = 0x211626;
const ASTEROID_OUTLINE_SCALE = 1.035;

// Normalized sun direction (matches Game.js sunLight.position)
const SUN_DIR = new THREE.Vector3(2000, 1000, -3000).normalize();

// Two-tone unlit shader: lit color on sun-facing side, shadow color on the other
function makeTwoToneMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      uColorLit:   { value: ASTEROID_COLOR_LIT },
      uColorShade: { value: ASTEROID_COLOR_SHADE },
      uSunDir:     { value: SUN_DIR },
      uOpacity:    { value: 0.0 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vWorldNormal;
      void main() {
        vWorldNormal = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3  uColorLit;
      uniform vec3  uColorShade;
      uniform vec3  uSunDir;
      uniform float uOpacity;
      varying vec3  vWorldNormal;
      void main() {
        float NdotL = dot(normalize(vWorldNormal), uSunDir);
        // Hard step for a cel / two-tone look
        float lit = step(0.0, NdotL);
        vec3 color = mix(uColorShade, uColorLit, lit);
        gl_FragColor = vec4(color, uOpacity);
      }
    `,
    transparent: true,
    depthWrite: true,
    side: THREE.FrontSide,
    fog: false,
  });
}
// ─────────────────────────────────────────────────────────────────────────────


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
    this.instances = [];
    this._elapsed = 0;

    // ── Model pool (filled async by _loadModels) ───────────────────────────
    this._modelPool = [];     // { mesh: THREE.Mesh, colliderRadius: number }
    this._modelsReady = false;
    this._lastPlayerPos = null;
    this._isInitialLoad = true;

    this._loadModels();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Model loading — load asteroids.glb and extract mesh templates
  // ═══════════════════════════════════════════════════════════════════════════
  _loadModels() {
    const loader = new GLTFLoader();

    loader.load('/models/asteroid/asteroids_baked_new.glb', (gltf) => {
      gltf.scene.traverse((obj) => {
        if (!obj.isMesh) return;

        // Try pre-computed collider radius from custom property, fall back to geometry bounds
        let radius = obj.userData.colliderRadius;
        if (radius == null && obj.geometry) {
          obj.geometry.computeBoundingSphere();
          radius = obj.geometry.boundingSphere.radius;
        }
        if (!radius) return;

        // Normalise transform so it works as a clonable template
        obj.position.set(0, 0, 0);
        obj.rotation.set(0, 0, 0);
        obj.scale.set(1, 1, 1);

        // Ensure templates do not cast/receive shadows by default
        obj.castShadow = false;
        obj.receiveShadow = false;

        this._modelPool.push({ mesh: obj, colliderRadius: radius });
      });

      console.log(`[AsteroidField] Loaded ${this._modelPool.length} asteroid templates`);
      this._modelsReady = true;
      if (this._lastPlayerPos) {
        this._maintainPopulation(this._lastPlayerPos, true);
        this._isInitialLoad = false;
      }
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Lifecycle helpers
  // ═══════════════════════════════════════════════════════════════════════════
  _disposeAsteroid(ast) {
    this.scene.remove(ast.mesh);
    if (ast.fadeMats) {
      for (const m of ast.fadeMats) m.dispose();
    }
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
    if (this._modelPool.length === 0) return false;

    const templateIdx = Math.floor(Math.random() * this._modelPool.length);
    const template = this._modelPool[templateIdx];

    const scale = SCALE;
    const colliderRadius = template.colliderRadius * scale;

    const instance = new THREE.Group();
    const model = template.mesh.clone();
    model.scale.setScalar(scale);
    instance.add(model);

    // Clone materials for per-instance fade control, force an unlit asteroid
    // color, and add a cheap inverted-hull outline. Asteroids do not react to
    // scene lighting or cast shadows.
    const fadeMats = [];
    instance.traverse((child) => {
      if (!child.isMesh || !child.material || child.userData.isOutline) return;

      // Disable shadowing for asteroid meshes
      child.castShadow = false;
      child.receiveShadow = false;

      const mat = makeTwoToneMaterial();

      child.material = mat;
      fadeMats.push(mat);

      const outlineMaterial = new THREE.MeshBasicMaterial({
        color: ASTEROID_OUTLINE_COLOR,
        side: THREE.BackSide,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        fog: false,
      });
      const outlineMesh = new THREE.Mesh(child.geometry, outlineMaterial);
      outlineMesh.scale.setScalar(ASTEROID_OUTLINE_SCALE);
      outlineMesh.castShadow = false;
      outlineMesh.receiveShadow = false;
      outlineMesh.userData.isOutline = true;
      child.add(outlineMesh);
      fadeMats.push(outlineMaterial);
    });

    const localCenter = new THREE.Vector3(0, 0, 0);
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
      for (const m of fadeMats) m.dispose();
      return false;
    }

    instance.userData.rotSpeed = {
      x: (Math.random() - 0.5) * 0.12,
      y: (Math.random() - 0.5) * 0.12,
      z: (Math.random() - 0.5) * 0.06,
    };

    const velocity = randomUnitVector().multiplyScalar(
      (MIN_DRIFT_SPEED + Math.random() * (MAX_DRIFT_SPEED - MIN_DRIFT_SPEED)) * scale
    );

    let glowSprite = null;
    if (GLOW_BRIGHTNESS > 0) {
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
      fadeMats,
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
      if (playerPosition && ast.fadeMats) {
        const dist = ast.boundingSphere.center.distanceTo(playerPosition);
        let opacity;
        if (dist <= FADE_NEAR) opacity = 1;
        else if (dist >= FADE_FAR) opacity = 0;
        else opacity = 1 - (dist - FADE_NEAR) / (FADE_FAR - FADE_NEAR);
        for (const mat of ast.fadeMats) {
          if (mat.uniforms && mat.uniforms.uOpacity) {
            mat.uniforms.uOpacity.value = opacity;
          } else {
            mat.opacity = opacity;
          }
          mat.depthWrite = opacity > 0.5;
        }
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