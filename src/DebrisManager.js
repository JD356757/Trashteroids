import * as THREE from 'three';

const _dir = new THREE.Vector3();

// Debris type definitions
const DEBRIS_TYPES = {
  trashBag: {
    color: 0x88aa44,
    emissive: 0x223300,
    size: [0.8, 0.8, 0.8],
    geometry: 'dodecahedron',
    points: 100,
    hitRadius: 1.0,
  },
  sodaCan: {
    color: 0xcc3333,
    emissive: 0x440000,
    size: [0.3, 0.7, 0.3],
    geometry: 'cylinder',
    points: 150,
    hitRadius: 0.8,
  },
  trashCan: {
    color: 0x777777,
    emissive: 0x111111,
    size: [0.6, 1.0, 0.6],
    geometry: 'cylinder',
    points: 200,
    hitRadius: 1.2,
  },
  chunk: {
    color: 0x996633,
    emissive: 0x331100,
    size: [1.2, 1.2, 1.2],
    geometry: 'icosahedron',
    points: 250,
    hitRadius: 1.4,
  },
  stone: {
    color: 0x666666,
    emissive: 0x111111,
    size: [2.0, 2.0, 2.0],
    geometry: 'icosahedron',
    points: 500,
    hitRadius: 2.4,
    speedMultiplier: 0.3,  // much slower than other debris
  },
};

function createDebrisMesh(type) {
  const def = DEBRIS_TYPES[type];
  let geo;
  switch (def.geometry) {
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

      // Despawn if too far from player
      if (d.mesh.position.distanceTo(playerPos) > this.despawnDist) {
        this.scene.remove(d.mesh);
        this.active.splice(i, 1);
      }
    }
  }

  _spawn(config, playerPos) {
    const types = config.types || ['trashBag'];
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

    // Velocity: roughly toward player with some spread
    _dir.copy(playerPos).sub(mesh.position).normalize();
    // Add random spread
    _dir.x += (Math.random() - 0.5) * 0.4;
    _dir.y += (Math.random() - 0.5) * 0.4;
    _dir.z += (Math.random() - 0.5) * 0.4;
    _dir.normalize();

    const speedMul = def.speedMultiplier || 1;
    const speed = (config.speed + Math.random() * config.speedVariance) * speedMul;
    const velocity = _dir.clone().multiplyScalar(speed);

    this.scene.add(mesh);

    this.active.push({
      mesh,
      velocity,
      rotSpeed: {
        x: (Math.random() - 0.5) * 2,
        y: (Math.random() - 0.5) * 2,
      },
      points: def.points,
      hitRadius: def.hitRadius,
      position: mesh.position,
    });
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
