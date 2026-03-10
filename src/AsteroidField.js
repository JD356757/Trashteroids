import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';

// ─── Tunable parameters ──────────────────────────────────────────────────────
// Total number of asteroids placed in the scene
const ASTEROID_COUNT = 25;

// 0.0 = all small, 1.0 = all big, 0.4 = 40% big / 60% small
const BIG_RATIO = 0.4;

// Placement shell (world units from origin)
const SPAWN_RADIUS_MIN = 30;
const SPAWN_RADIUS_MAX = 120;

// Scale ranges per size class
const BIG_SCALE_MIN   = 0.18;
const BIG_SCALE_MAX   = 0.4;
const SMALL_SCALE_MIN = 0.07;
const SMALL_SCALE_MAX = 0.18;
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
          const instance = fbx.clone();
          instance.position.copy(randomOnSphere(SPAWN_RADIUS_MIN, SPAWN_RADIUS_MAX));

          const s = scaleMin + Math.random() * (scaleMax - scaleMin);
          instance.scale.setScalar(s);

          instance.rotation.set(
            Math.random() * Math.PI * 2,
            Math.random() * Math.PI * 2,
            Math.random() * Math.PI * 2,
          );

          instance.userData.rotSpeed = {
            x: (Math.random() - 0.5) * 0.12,
            y: (Math.random() - 0.5) * 0.12,
            z: (Math.random() - 0.5) * 0.06,
          };

          this.scene.add(instance);
          this.instances.push(instance);
        }
      });
    }
  }

  update(delta) {
    for (const ast of this.instances) {
      ast.rotation.x += ast.userData.rotSpeed.x * delta;
      ast.rotation.y += ast.userData.rotSpeed.y * delta;
      ast.rotation.z += ast.userData.rotSpeed.z * delta;
    }
  }
}
