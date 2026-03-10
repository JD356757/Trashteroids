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
// Total number of asteroids placed in the scene
const ASTEROID_COUNT = 300;

// 0.0 = all small, 1.0 = all big, 0.4 = 40% big / 60% small
const BIG_RATIO = 0.4;

// Placement shell (world units from origin)
const SPAWN_RADIUS_MIN = 30;
const SPAWN_RADIUS_MAX = 120;
// Scale ranges per size class
const BIG_SCALE_MIN   = 0.2;
const BIG_SCALE_MAX   = 1;
const SMALL_SCALE_MIN = 0.08;
const SMALL_SCALE_MAX = 0.2;
const BOUNDING_SPHERE_SCALE = 0.6;
const MIN_DRIFT_SPEED = 0.6;
const MAX_DRIFT_SPEED = 2.4;
const ASTEROID_BOUNCE = 0.9;
const ASTEROID_DRAG = 0.995;
const COLLISION_PASSES = 2;
// ─────────────────────────────────────────────────────────────────────────────

const BIG_FILES = [
  'big1.fbx','big2.fbx','big3.fbx','big4.fbx','big5.fbx','big6.fbx','big7.fbx',
];

const SMALL_FILES = [
  'rock.002.fbx','rock.003.fbx','rock.004.fbx','rock.005.fbx','rock.006.fbx',
  'rock.013.fbx','rock.014.fbx','rock.015.fbx','rock.016.fbx','rock.017.fbx',
  'rock.018.fbx','rock.019.fbx','rock.020.fbx','rock.021.fbx','rock.022.fbx',
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

function randomOnSphere(rMin, rMax) {
  const theta = Math.random() * Math.PI * 2;
  const phi   = Math.acos(2 * Math.random() - 1);
  const r     = rMin + Math.random() * (rMax - rMin);
  return new THREE.Vector3(
    Math.sin(phi) * Math.cos(theta) * r,
    Math.sin(phi) * Math.sin(theta) * r,
    Math.cos(phi) * r,
  );
}

function randomUnitVector() {
  return randomOnSphere(1, 1).normalize();
}

export class AsteroidField {
  constructor(scene) {
    this.scene = scene;
    this.instances = [];

    this._loadPool('/models/asteroid/big/',   BIG_FILES,   BIG_SCALE_MIN,   BIG_SCALE_MAX);
    this._loadPool('/models/asteroid/small/', SMALL_FILES, SMALL_SCALE_MIN, SMALL_SCALE_MAX);
  }

  _loadPool(basePath, files, scaleMin, scaleMax) {
    const loader = new FBXLoader();
    const isBig  = basePath.includes('/big/');
    const bigCount   = Math.round(ASTEROID_COUNT * BIG_RATIO);
    const smallCount = ASTEROID_COUNT - bigCount;
    const count = isBig ? bigCount : smallCount;

    // How many asteroids each file is responsible for (spread evenly, at least 1)
    const perFile = Math.max(1, Math.ceil(count / files.length));

    let spawned = 0;
    for (const file of files) {
      if (spawned >= count) break;
      const toSpawn = Math.min(perFile, count - spawned);
      spawned += toSpawn;

      loader.load(basePath + file, (fbx) => {
        applyMaterial(fbx);

        for (let i = 0; i < toSpawn; i++) {
          const instance = new THREE.Group();
          const model = fbx.clone();

          const s = scaleMin + Math.random() * (scaleMax - scaleMin);
          model.scale.setScalar(s);

          instance.add(model);

          _bounds.setFromObject(model);
          _bounds.getBoundingSphere(_boundingSphere);

          const localCenter = _boundingSphere.center.clone();
          const colliderRadius = _boundingSphere.radius * BOUNDING_SPHERE_SCALE;
          const collider = new THREE.Sphere(new THREE.Vector3(), colliderRadius);
          const velocity = randomUnitVector().multiplyScalar(
            MIN_DRIFT_SPEED + Math.random() * (MAX_DRIFT_SPEED - MIN_DRIFT_SPEED)
          );

          instance.rotation.set(
            Math.random() * Math.PI * 2,
            Math.random() * Math.PI * 2,
            Math.random() * Math.PI * 2,
          );
          instance.position.copy(randomOnSphere(SPAWN_RADIUS_MIN, SPAWN_RADIUS_MAX));

          instance.userData.rotSpeed = {
            x: (Math.random() - 0.5) * 0.12,
            y: (Math.random() - 0.5) * 0.12,
            z: (Math.random() - 0.5) * 0.06,
          };

          instance.updateMatrixWorld(true);
          collider.center.copy(instance.localToWorld(_worldCenter.copy(localCenter)));

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
          });
        }
      });
    }
  }

  update(delta) {
    for (const ast of this.instances) {
      ast.mesh.position.addScaledVector(ast.velocity, delta);
      ast.mesh.rotation.x += ast.mesh.userData.rotSpeed.x * delta;
      ast.mesh.rotation.y += ast.mesh.userData.rotSpeed.y * delta;
      ast.mesh.rotation.z += ast.mesh.userData.rotSpeed.z * delta;
      ast.velocity.multiplyScalar(Math.pow(ASTEROID_DRAG, delta * 60));
      ast.mesh.updateMatrixWorld(true);
      ast.boundingSphere.center.copy(ast.mesh.localToWorld(_worldCenter.copy(ast.localCenter)));
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
          _collisionNormal.copy(randomUnitVector());
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
