import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const _dir = new THREE.Vector3();
const _drift = new THREE.Vector3();
const _defaultScale = new THREE.Vector3(1, 1, 1);

// Debris type definitions
const DEBRIS_TYPES = {
  bluePlasticBag: {
    modelPath: '/models/blue_plastic_bag.glb',
    modelScale: 0.35,
    color: 0x7cc7ff,
    emissive: 0x0d2d55,
    geometry: 'dodecahedron',
    points: 100,
    size: [0.8, 0.8, 0.8],
    hitRadius: 0.5,
    speedMultiplier: 0.9,
    drift: 1.8,
  },
  bottle: {
    modelPath: '/models/bottle.glb',
    modelScale: 0.025,
    color: 0x65d98d,
    emissive: 0x14331f,
    size: [0.4, 1.0, 0.4],
    geometry: 'capsule',
    points: 150,
    hitRadius: 0.4,
    speedMultiplier: 1.05,
    drift: 1.4,
  },
  laptop: {
    modelPath: '/models/laptop.glb',
    modelScale: 0.025,
    color: 0x808080,
    emissive: 0x151515,
    size: [1.1, 0.25, 0.9],
    geometry: 'box',
    points: 200,
    hitRadius: 0.6,
    speedMultiplier: 0.8,
    drift: 0.9,
  },
  soda1: {
    modelPath: '/models/soda1.glb',
    modelScale: 0.025,
    color: 0xdf4037,
    emissive: 0x40100f,
    size: [0.3, 0.7, 0.3],
    geometry: 'cylinder',
    points: 140,
    hitRadius: 0.35,
    speedMultiplier: 1.25,
    drift: 2.8,
  },
  soda2: {
    modelPath: '/models/soda2.glb',
    modelScale: 0.025,
    color: 0xf48c1b,
    emissive: 0x4a2203,
    size: [0.3, 0.7, 0.3],
    geometry: 'cylinder',
    points: 140,
    hitRadius: 0.35,
    speedMultiplier: 1.15,
    drift: 3.1,
  },
  soda3: {
    modelPath: '/models/soda3.glb',
    modelScale: 0.025,
    color: 0xb93be1,
    emissive: 0x2f103b,
    size: [0.3, 0.7, 0.3],
    geometry: 'cylinder',
    points: 140,
    hitRadius: 0.35,
    speedMultiplier: 1.35,
    drift: 2.5,
  },
};

function createDebrisMesh(type) {
  const def = DEBRIS_TYPES[type];
  if (def.template) {
    const instance = def.template.clone(true);
    instance.scale.copy(def.modelScaleVector || _defaultScale);
    return instance;
  }

  let geo;
  switch (def.geometry) {
    case 'box':
      geo = new THREE.BoxGeometry(def.size[0], def.size[1], def.size[2]);
      break;
    case 'capsule':
      geo = new THREE.CapsuleGeometry(def.size[0] * 0.35, def.size[1] * 0.4, 4, 8);
      break;
    case 'cylinder':
      geo = new THREE.CylinderGeometry(def.size[0], def.size[0], def.size[1], 8);
      break;
    case 'icosahedron':
      geo = new THREE.IcosahedronGeometry(def.size[0] * 0.6, 0);
      break;
    case 'dodecahedron':
    default:
      geo = new THREE.DodecahedronGeometry(def.size[0] * 0.6, 0);
      break;
  }

  const mat = new THREE.MeshStandardMaterial({
    color: def.color,
    emissive: def.emissive,
    metalness: 0.3,
    roughness: 0.7,
    wireframe: false,
  });

  const mesh = new THREE.Mesh(geo, mat);

  // Neon outline — slightly larger wireframe shell
  const outlineGeo = geo.clone();
  const outlineMat = new THREE.MeshBasicMaterial({
    color: def.color,
    wireframe: true,
    transparent: true,
    opacity: 0.3,
  });
  const outline = new THREE.Mesh(outlineGeo, outlineMat);
  outline.scale.setScalar(1.15);
  mesh.add(outline);

  return mesh;
}

export class DebrisManager {
  constructor(scene) {
    this.scene = scene;
    this.active = [];       // { mesh, velocity, rotSpeed, points, hitRadius, position (ref) }
    this.spawnTimer = 0;
    this.despawnDist = 120; // remove when this far from player
    this._loadModelTemplates();
  }

  /**
   * @param {number} delta
   * @param {object} spawnConfig
   * @param {THREE.Vector3} playerPos - current player world position
   */
  update(delta, spawnConfig, playerPos) {
    // Spawn new debris
    this.spawnTimer -= delta;
    if (this.spawnTimer <= 0) {
      this._spawn(spawnConfig, playerPos);
      this.spawnTimer = spawnConfig.interval;
    }

    // Move & rotate existing debris
    for (let i = this.active.length - 1; i >= 0; i--) {
      const d = this.active[i];
      d.mesh.position.addScaledVector(d.velocity, delta);
      d.mesh.rotation.x += d.rotSpeed.x * delta;
      d.mesh.rotation.y += d.rotSpeed.y * delta;
      d.mesh.rotation.z += d.rotSpeed.z * delta;

      // Despawn if too far from player
      if (d.mesh.position.distanceTo(playerPos) > this.despawnDist) {
        this.scene.remove(d.mesh);
        this.active.splice(i, 1);
      }
    }
  }

  _spawn(config, playerPos) {
    const types = config.types || ['bluePlasticBag'];
    const type = types[Math.floor(Math.random() * types.length)];
    const def = DEBRIS_TYPES[type];

    const mesh = createDebrisMesh(type);

    // Spawn on a spherical shell around the player
    const spawnRadius = config.spawnRadius || 70;
    const theta = Math.random() * Math.PI * 2;       // azimuth
    const phi = Math.acos(2 * Math.random() - 1);    // polar — full sphere
    const sx = Math.sin(phi) * Math.cos(theta) * spawnRadius;
    const sy = Math.sin(phi) * Math.sin(theta) * spawnRadius;
    const sz = Math.cos(phi) * spawnRadius;
    mesh.position.set(
      playerPos.x + sx,
      playerPos.y + sy,
      playerPos.z + sz
    );
    mesh.rotation.set(
      Math.random() * Math.PI * 2,
      Math.random() * Math.PI * 2,
      Math.random() * Math.PI * 2
    );

    // Velocity: roughly toward player with some spread
    _dir.copy(playerPos).sub(mesh.position).normalize();
    // Add random spread
    _dir.x += (Math.random() - 0.5) * 0.4;
    _dir.y += (Math.random() - 0.5) * 0.4;
    _dir.z += (Math.random() - 0.5) * 0.4;
    _dir.normalize();

    _drift.set(
      Math.random() - 0.5,
      Math.random() - 0.5,
      Math.random() - 0.5
    ).normalize().multiplyScalar(def.drift || 1.2);
    _dir.addScaledVector(_drift, 0.08).normalize();

    const speedMul = def.speedMultiplier || 1;
    const speed = (config.speed + Math.random() * config.speedVariance) * speedMul;
    const velocity = _dir.clone().multiplyScalar(speed).add(_drift);

    this.scene.add(mesh);

    this.active.push({
      mesh,
      velocity,
      rotSpeed: {
        x: (Math.random() - 0.5) * 3,
        y: (Math.random() - 0.5) * 3,
        z: (Math.random() - 0.5) * 3,
      },
      points: def.points,
      hitRadius: def.hitRadius,
      position: mesh.position,
    });
  }

  _loadModelTemplates() {
    const loader = new GLTFLoader();

    for (const def of Object.values(DEBRIS_TYPES)) {
      if (!def.modelPath) continue;

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
      this.scene.remove(d.mesh);
      this.active.splice(index, 1);
    }
  }
}
