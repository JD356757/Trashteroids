import * as THREE from 'three';

/**
 * Procedural tunnel network for the Trashteroid interior.
 *
 * Build approach:
 *   - A graph of nodes (junctions) connected by edges.
 *   - Each edge is a CatmullRomCurve3 between two nodes, with a jittered
 *     midpoint so tunnels bend organically.
 *   - The curve is extruded as a THREE.TubeGeometry, then every vertex is
 *     pushed outward along its radial direction by 3D value noise. That
 *     produces the bumpy, organic cave-wall look.
 *   - At each junction, a noise-displaced icosahedron is placed to hide the
 *     seams where multiple tubes intersect.
 *   - Weak points are spawned at a configurable subset of leaf nodes.
 *
 * The mesh uses BackSide rendering since the player flies inside the tube.
 * Normals are flipped after noise displacement so lighting reads correctly
 * from the inside.
 */

// ─── Hash-based 3D value noise (no deps) ─────────────────────────────────────
function hash3(x, y, z) {
  let h = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return h - Math.floor(h);
}

function smooth(t) {
  return t * t * (3 - 2 * t);
}

function valueNoise3(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = x - xi, yf = y - yi, zf = z - zi;
  const u = smooth(xf), v = smooth(yf), w = smooth(zf);

  const c000 = hash3(xi,     yi,     zi);
  const c100 = hash3(xi + 1, yi,     zi);
  const c010 = hash3(xi,     yi + 1, zi);
  const c110 = hash3(xi + 1, yi + 1, zi);
  const c001 = hash3(xi,     yi,     zi + 1);
  const c101 = hash3(xi + 1, yi,     zi + 1);
  const c011 = hash3(xi,     yi + 1, zi + 1);
  const c111 = hash3(xi + 1, yi + 1, zi + 1);

  const x00 = c000 + (c100 - c000) * u;
  const x10 = c010 + (c110 - c010) * u;
  const x01 = c001 + (c101 - c001) * u;
  const x11 = c011 + (c111 - c011) * u;
  const y0 = x00 + (x10 - x00) * v;
  const y1 = x01 + (x11 - x01) * v;
  return y0 + (y1 - y0) * w;
}

function fbm(x, y, z, octaves = 3) {
  let sum = 0;
  let amp = 1;
  let freq = 1;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += valueNoise3(x * freq, y * freq, z * freq) * amp;
    norm += amp;
    amp *= 0.5;
    freq *= 2.1;
  }
  return sum / norm;
}

// ─── Defaults ────────────────────────────────────────────────────────────────
const DEFAULT_OPTIONS = {
  tunnelRadius: 80,
  radialSegments: 18,
  tubularSegmentsPerUnit: 0.08,   // segments along curve per world unit
  minTubularSegments: 24,
  maxTubularSegments: 160,
  noiseAmplitude: 22,             // peak radial displacement
  noiseScale: 0.012,              // world-space frequency for the noise
  branchCount: 5,                 // number of branches off the central hub
  branchLength: 900,
  branchLengthJitter: 300,
  branchAngleSpread: Math.PI * 2,
  midpointJitter: 220,            // how curvy each tunnel is
  weakPointCount: 4,
  weakPointRadius: 28,
  crossLinkChance: 0.4,           // chance two branches connect to each other
  seed: 1,
};

const _tmpV = new THREE.Vector3();
const _tmpV2 = new THREE.Vector3();

export class TunnelSystem {
  /**
   * @param {THREE.Scene|THREE.Object3D} parent  Parent to attach the network to.
   * @param {object} [options]
   */
  constructor(parent, options = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.parent = parent;

    this.group = new THREE.Group();
    this.group.name = 'TunnelSystem';
    parent.add(this.group);

    this.nodes = [];          // [{ position, isLeaf, isHub }]
    this.edges = [];          // [{ a, b, curve, mesh }]
    this.weakPoints = [];     // [{ position, radius, mesh, alive }]

    // Seeded RNG (Mulberry32) for deterministic layouts.
    this._rng = mulberry32(this.options.seed);

    this._buildGraph();
    this._buildTunnels();
    this._buildJunctions();
    this._buildWeakPoints();
  }

  // ─── Public API ────────────────────────────────────────────────────────────

  /** Where to spawn the player when entering the network. */
  getStartPosition(out = new THREE.Vector3()) {
    return out.copy(this.nodes[0].position);
  }

  /** Direction the player should face on entry — toward the first branch. */
  getStartDirection(out = new THREE.Vector3()) {
    const first = this.nodes[1] ?? this.nodes[0];
    return out.subVectors(first.position, this.nodes[0].position).normalize();
  }

  /** Returns array of alive weak-point world positions. */
  getAliveWeakPoints() {
    return this.weakPoints.filter((w) => w.alive);
  }

  /**
   * Test a damage point against all alive weak points.
   * @returns {object|null} The weak point hit, or null.
   */
  hitTestWeakPoint(worldPos, hitRadius = 0) {
    for (const wp of this.weakPoints) {
      if (!wp.alive) continue;
      const dist = wp.position.distanceTo(worldPos);
      if (dist <= wp.radius + hitRadius) return wp;
    }
    return null;
  }

  /** Destroy a weak point — hides its mesh and marks it dead. */
  destroyWeakPoint(wp) {
    if (!wp || !wp.alive) return;
    wp.alive = false;
    wp.mesh.visible = false;
  }

  /** Soft check: is a point roughly inside any tunnel volume? */
  isInsideTunnel(worldPos, padding = 0) {
    const r = this.options.tunnelRadius + this.options.noiseAmplitude + padding;
    for (const edge of this.edges) {
      // Sample the curve at a coarse resolution and find min distance.
      const steps = 16;
      for (let i = 0; i <= steps; i++) {
        edge.curve.getPointAt(i / steps, _tmpV);
        if (_tmpV.distanceToSquared(worldPos) < r * r) return true;
      }
    }
    return false;
  }

  /**
   * Push a point back inside the tunnel if it's grinding against the wall.
   * Optionally reflect a velocity vector when colliding.
   * @returns {boolean} true if a collision was resolved.
   */
  clampInsideTunnel(pos, padding = 0, velocity = null) {
    // Find the nearest centerline point across all edges + junction nodes.
    let bestDist = Infinity;
    const bestPoint = new THREE.Vector3();

    for (const edge of this.edges) {
      const steps = 32;
      for (let i = 0; i <= steps; i++) {
        edge.curve.getPointAt(i / steps, _tmpV);
        const d = _tmpV.distanceTo(pos);
        if (d < bestDist) {
          bestDist = d;
          bestPoint.copy(_tmpV);
        }
      }
    }
    for (const node of this.nodes) {
      const d = node.position.distanceTo(pos);
      if (d < bestDist) {
        bestDist = d;
        bestPoint.copy(node.position);
      }
    }

    // Conservative inner radius — leave a buffer for noise pushing walls inward.
    const innerR = this.options.tunnelRadius - this.options.noiseAmplitude * 0.6 - padding;
    if (bestDist <= innerR) return false;

    // Push back toward the centerline.
    _tmpV2.copy(pos).sub(bestPoint);
    const len = _tmpV2.length() || 1;
    _tmpV2.multiplyScalar(1 / len); // outward unit vector
    pos.copy(bestPoint).addScaledVector(_tmpV2, innerR);

    if (velocity) {
      const intoWall = velocity.dot(_tmpV2);
      if (intoWall > 0) {
        // Reflect outward velocity with damping.
        velocity.addScaledVector(_tmpV2, -intoWall * 1.4);
      }
    }
    return true;
  }

  /** Animate weak point pulses, etc. Call from main update loop. */
  update(dt) {
    for (const wp of this.weakPoints) {
      if (!wp.alive) continue;
      wp.pulse += dt;
      const s = 1 + Math.sin(wp.pulse * 4) * 0.08;
      wp.mesh.scale.setScalar(s);
    }
  }

  dispose() {
    this.group.traverse((obj) => {
      if (obj.geometry) obj.geometry.dispose?.();
      if (obj.material) {
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        mats.forEach((m) => m?.dispose?.());
      }
    });
    this.parent.remove(this.group);
  }

  // ─── Internal build steps ──────────────────────────────────────────────────

  _buildGraph() {
    const o = this.options;

    // Hub at origin (entry point).
    const hub = { position: new THREE.Vector3(0, 0, 0), isHub: true, isLeaf: false };
    this.nodes.push(hub);

    // Radiate branches out in random directions on a roughly spherical spread.
    const branches = [];
    for (let i = 0; i < o.branchCount; i++) {
      const theta = (i / o.branchCount) * o.branchAngleSpread + this._rand(-0.4, 0.4);
      const phi = this._rand(-0.5, 0.5);
      const len = o.branchLength + this._rand(-1, 1) * o.branchLengthJitter;

      const dir = new THREE.Vector3(
        Math.cos(theta) * Math.cos(phi),
        Math.sin(phi),
        Math.sin(theta) * Math.cos(phi),
      );

      const node = {
        position: dir.multiplyScalar(len),
        isHub: false,
        isLeaf: true,
      };
      this.nodes.push(node);
      branches.push(node);
      this.edges.push({ a: hub, b: node });
    }

    // Cross-links between adjacent branches to form loops (matches the sketch).
    for (let i = 0; i < branches.length; i++) {
      const a = branches[i];
      const b = branches[(i + 1) % branches.length];
      if (this._rng() < o.crossLinkChance) {
        // Add a midpoint node so the cross-link doesn't perfectly bisect.
        const mid = new THREE.Vector3()
          .addVectors(a.position, b.position)
          .multiplyScalar(0.5)
          .add(new THREE.Vector3(
            this._rand(-1, 1) * o.midpointJitter,
            this._rand(-1, 1) * o.midpointJitter * 0.5,
            this._rand(-1, 1) * o.midpointJitter,
          ));
        const midNode = { position: mid, isHub: false, isLeaf: false };
        this.nodes.push(midNode);
        this.edges.push({ a, b: midNode });
        this.edges.push({ a: midNode, b });
        a.isLeaf = false;
        b.isLeaf = false;
      }
    }
  }

  _buildTunnels() {
    const o = this.options;
    const mat = new THREE.MeshStandardMaterial({
      color: 0x3a2f2a,
      roughness: 0.95,
      metalness: 0.05,
      flatShading: true,
      side: THREE.BackSide,
    });
    this._tunnelMaterial = mat;

    for (const edge of this.edges) {
      const a = edge.a.position;
      const b = edge.b.position;

      // Jittered midpoint so the tunnel curves rather than running straight.
      const mid = new THREE.Vector3()
        .addVectors(a, b)
        .multiplyScalar(0.5)
        .add(new THREE.Vector3(
          this._rand(-1, 1) * o.midpointJitter,
          this._rand(-1, 1) * o.midpointJitter * 0.6,
          this._rand(-1, 1) * o.midpointJitter,
        ));

      const curve = new THREE.CatmullRomCurve3([a.clone(), mid, b.clone()], false, 'catmullrom', 0.5);
      const length = curve.getLength();
      const tubular = THREE.MathUtils.clamp(
        Math.round(length * o.tubularSegmentsPerUnit),
        o.minTubularSegments,
        o.maxTubularSegments,
      );

      const geom = new THREE.TubeGeometry(curve, tubular, o.tunnelRadius, o.radialSegments, false);

      // Noise-displace each vertex outward along its radial direction
      // (radial = vertex - nearest curve point).
      this._displaceTubeGeometry(geom, curve, tubular, o.radialSegments);

      // Flip normals so they face inward (player is inside).
      const normals = geom.attributes.normal;
      for (let i = 0; i < normals.count; i++) {
        normals.setXYZ(i, -normals.getX(i), -normals.getY(i), -normals.getZ(i));
      }
      normals.needsUpdate = true;

      const mesh = new THREE.Mesh(geom, mat);
      mesh.frustumCulled = false;
      this.group.add(mesh);

      edge.curve = curve;
      edge.mesh = mesh;
      edge.length = length;
    }
  }

  _displaceTubeGeometry(geom, curve, tubular, radial) {
    const o = this.options;
    const positions = geom.attributes.position;
    const vCount = positions.count;

    // TubeGeometry vertex layout: (tubular+1) rings of (radial+1) verts.
    // For each vertex we know its position; we approximate the radial dir
    // as (vertex - centerline sample) normalized.
    const ringCount = tubular + 1;
    const ringSize = radial + 1;

    for (let i = 0; i < ringCount; i++) {
      const t = i / tubular;
      curve.getPointAt(t, _tmpV); // centerline point for this ring
      for (let j = 0; j < ringSize; j++) {
        const idx = i * ringSize + j;
        const px = positions.getX(idx);
        const py = positions.getY(idx);
        const pz = positions.getZ(idx);

        _tmpV2.set(px - _tmpV.x, py - _tmpV.y, pz - _tmpV.z);
        const len = _tmpV2.length() || 1;
        _tmpV2.multiplyScalar(1 / len);

        // fbm in world space, biased to be mostly outward (negative pushes
        // walls in toward the player, which we partially allow for character).
        const n = fbm(px * o.noiseScale, py * o.noiseScale, pz * o.noiseScale, 3);
        const displacement = (n - 0.3) * o.noiseAmplitude;

        positions.setXYZ(
          idx,
          px + _tmpV2.x * displacement,
          py + _tmpV2.y * displacement,
          pz + _tmpV2.z * displacement,
        );
      }
    }
    positions.needsUpdate = true;
    geom.computeVertexNormals();
  }

  _buildJunctions() {
    const o = this.options;
    // Junction radius is slightly larger than tunnel radius so it cleanly
    // envelops the seam where tubes meet.
    const radius = o.tunnelRadius * 1.15;

    for (const node of this.nodes) {
      // A simple icosahedron, noise-displaced, hides the intersection.
      const geom = new THREE.IcosahedronGeometry(radius, 3);
      const positions = geom.attributes.position;
      for (let i = 0; i < positions.count; i++) {
        const px = positions.getX(i);
        const py = positions.getY(i);
        const pz = positions.getZ(i);
        // World-space sampling so the junction noise lines up with the
        // adjacent tubes (no visible seam in the noise field).
        const wx = px + node.position.x;
        const wy = py + node.position.y;
        const wz = pz + node.position.z;
        const dir = _tmpV.set(px, py, pz).normalize();
        const n = fbm(wx * o.noiseScale, wy * o.noiseScale, wz * o.noiseScale, 3);
        const d = (n - 0.3) * o.noiseAmplitude;
        positions.setXYZ(i, px + dir.x * d, py + dir.y * d, pz + dir.z * d);
      }
      positions.needsUpdate = true;
      geom.computeVertexNormals();
      // Flip normals to face inward.
      const normals = geom.attributes.normal;
      for (let i = 0; i < normals.count; i++) {
        normals.setXYZ(i, -normals.getX(i), -normals.getY(i), -normals.getZ(i));
      }
      normals.needsUpdate = true;

      const mesh = new THREE.Mesh(geom, this._tunnelMaterial);
      mesh.position.copy(node.position);
      mesh.frustumCulled = false;
      this.group.add(mesh);
      node.junctionMesh = mesh;
    }
  }

  _buildWeakPoints() {
    const o = this.options;
    // Place weak points at leaf nodes first, then mid nodes if needed.
    const candidates = this.nodes.filter((n) => n.isLeaf);
    const fallback = this.nodes.filter((n) => !n.isLeaf && !n.isHub);
    while (candidates.length < o.weakPointCount && fallback.length > 0) {
      candidates.push(fallback.shift());
    }

    const count = Math.min(o.weakPointCount, candidates.length);
    const wpGeom = new THREE.SphereGeometry(o.weakPointRadius, 16, 12);
    const wpMat = new THREE.MeshStandardMaterial({
      color: 0xffc233,
      emissive: 0xffa500,
      emissiveIntensity: 1.4,
      roughness: 0.4,
      metalness: 0.2,
    });

    for (let i = 0; i < count; i++) {
      const node = candidates[i];
      const mesh = new THREE.Mesh(wpGeom, wpMat);
      mesh.position.copy(node.position);
      mesh.frustumCulled = false;
      this.group.add(mesh);
      this.weakPoints.push({
        position: node.position.clone(),
        radius: o.weakPointRadius,
        mesh,
        alive: true,
        pulse: Math.random() * Math.PI * 2,
      });
    }
  }

  _rand(min, max) {
    return min + (max - min) * this._rng();
  }
}

// Mulberry32 — small deterministic PRNG so layouts are reproducible per-seed.
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
