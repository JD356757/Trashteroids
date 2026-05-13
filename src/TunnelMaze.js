import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const CURVE_SAMPLES_PER_EDGE = 48;
const NODE_SPHERE_SEGMENTS = 12;

const _spotTargetPos = new THREE.Vector3();
const _spotForward = new THREE.Vector3();
const _defaultForward = new THREE.Vector3(0, 0, -1);

const COLLISION_SAMPLES_PER_TUNNEL = 64;
const SEGMENT_HIT_BINARY_STEPS = 8;
const _segScratch = new THREE.Vector3();

const WEAK_SPOT_HP = 120;
const WEAK_SPOT_EMBED_FRACTION = 0.4;   // 40% inside wall, 60% protruding inward
const WEAK_SPOT_HINT_PERTURB = 35;      // deterministic offset to diversify wall placement

// Embedded-debris palette. URLs live in public/models/. Per-model scale
// multipliers tune visual size so each piece is a readable spatial reference.
// Scales match Level 1's modelScale: 14.8 (DebrisManager) so the embedded
// trashteroid junk reads at the same size as debris the player has been
// shooting through the rest of the game.
const EMBED_TRASH_PALETTE = [
  { url: '/models/brokechair.glb', scale: 144 },
  { url: '/models/oven.glb',      scale: 160 },
  { url: '/models/trashnew.glb',  scale: 128 },
];

// One placement every ~PLACE_SPACING world units along a tunnel of density 1.
const EMBED_PLACE_SPACING_BASE = 56;
// At most this many pieces per tunnel (safety cap for very long tunnels).
const EMBED_MAX_PER_TUNNEL = 200;

export class TunnelMaze {
  constructor(scene, tunnelData, { debug = true, bakedMeshUrl = null } = {}) {
    this.scene = scene;
    this.data = tunnelData;
    this.group = new THREE.Group();
    this.group.name = 'TunnelMaze';

    this._disposables = [];
    this._weakSpotMeshes = [];
    this._pulseTime = 0;
    this._bakedMeshUrl = bakedMeshUrl;
    this._bakedRoot = null;
    this._bakedMaterial = null;
    this._bakedGeometries = [];
    this._playerSpot = null;
    this._playerSpotTarget = null;
    this._interiorAmbient = null;
    this._debugEnabled = !!debug;

    if (this._debugEnabled) {
      this._buildDebugCenterlines();
      this._buildDebugNodeMarkers();
    }
    this._buildWeakSpots();

    if (bakedMeshUrl) {
      this._buildInteriorLighting();
      this._buildAtmosphericLights();
      this._loadBakedMesh(bakedMeshUrl);
      this._embedTrash();
    }

    this._buildCollisionData();
    this._placeWeakSpotsOnWalls();

    scene.add(this.group);
  }

  getPlayerStart() {
    return this.data.playerStart;
  }

  update(delta, playerPos = null, playerQuat = null) {
    this._pulseTime += delta;
    for (const entry of this._weakSpotMeshes) {
      if (!entry.alive) continue;
      const hpFrac = entry.maxHp > 0 ? entry.hp / entry.maxHp : 1;
      const damage = 1 - hpFrac;

      // Pulse speeds up as HP drops (1.0x at full HP, ~2.5x at 0 HP).
      const pulseRate = 3.2 * (1 + damage * 1.5);
      const pulse = 0.5 + 0.5 * Math.sin(this._pulseTime * pulseRate);

      // Base scale grows from 1.0 → ~1.25 as HP depletes, plus pulse breathing.
      const baseScale = 1 + damage * 0.25;
      const breathe = 0.18 + damage * 0.15;
      entry.mesh.scale.setScalar(baseScale * (1 + breathe * pulse));

      // Emissive ramps from ~1.4 to ~6 across HP range, pulsing on top.
      entry.mesh.material.emissiveIntensity = 1.4 + damage * 4.0 + pulse * (1.6 + damage * 2.5);

      if (entry.light) {
        const baseI = entry.baseLightIntensity;
        entry.light.intensity = baseI * (1 + damage * 2.0) + pulse * baseI * (1 + damage * 1.5);
      }
    }

    if (this._playerSpot && playerPos) {
      this._playerSpot.position.copy(playerPos);
      _spotForward.copy(_defaultForward);
      if (playerQuat) _spotForward.applyQuaternion(playerQuat);
      _spotTargetPos.copy(playerPos).add(_spotForward.multiplyScalar(1000));
      if (this._playerSpotTarget) {
        this._playerSpotTarget.position.copy(_spotTargetPos);
      }
    }
  }

  dispose() {
    if (this.group.parent) {
      this.group.parent.remove(this.group);
    }
    for (const obj of this._disposables) {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        if (Array.isArray(obj.material)) {
          for (const m of obj.material) m.dispose();
        } else {
          obj.material.dispose();
        }
      }
    }
    for (const geom of this._bakedGeometries) {
      geom.dispose();
    }
    if (this._bakedMaterial) {
      this._bakedMaterial.dispose();
    }
    if (this._embeddedTrashGroup) {
      this._embeddedTrashGroup.traverse((obj) => {
        if (obj.isMesh) {
          if (obj.geometry) obj.geometry.dispose();
          if (obj.material) {
            if (Array.isArray(obj.material)) {
              for (const m of obj.material) m.dispose();
            } else {
              obj.material.dispose();
            }
          }
        }
      });
      this._embeddedTrashGroup = null;
    }
    this._disposables.length = 0;
    this._weakSpotMeshes.length = 0;
    this._bakedGeometries.length = 0;
    this._bakedRoot = null;
    this._bakedMaterial = null;
    this._playerSpot = null;
    this._playerSpotTarget = null;
    this._interiorAmbient = null;
  }

  _curvePointsForTunnel(tunnel) {
    const nodes = this.data.nodes;
    const from = nodes[tunnel.from];
    const to = nodes[tunnel.to];
    if (!from || !to) return null;

    const controlPoints = [new THREE.Vector3().fromArray(from.pos)];
    if (Array.isArray(tunnel.midpoints)) {
      for (const mid of tunnel.midpoints) {
        controlPoints.push(new THREE.Vector3().fromArray(mid.pos));
      }
    }
    controlPoints.push(new THREE.Vector3().fromArray(to.pos));

    const curve = new THREE.CatmullRomCurve3(controlPoints, false, 'catmullrom', 0.5);
    return curve.getPoints(CURVE_SAMPLES_PER_EDGE);
  }

  _buildDebugCenterlines() {
    const material = new THREE.LineBasicMaterial({
      color: 0x55ddff,
      transparent: true,
      opacity: 0.8,
    });

    for (const tunnel of this.data.tunnels ?? []) {
      const points = this._curvePointsForTunnel(tunnel);
      if (!points) continue;
      const geometry = new THREE.BufferGeometry().setFromPoints(points);
      const line = new THREE.Line(geometry, material);
      this.group.add(line);
      this._disposables.push(line);
    }
    this._disposables.push({ material });
  }

  _buildDebugNodeMarkers() {
    const wireMaterial = new THREE.MeshBasicMaterial({
      color: 0x88aaff,
      wireframe: true,
      transparent: true,
      opacity: 0.35,
    });

    for (const [name, node] of Object.entries(this.data.nodes ?? {})) {
      const geometry = new THREE.SphereGeometry(node.radius, NODE_SPHERE_SEGMENTS, NODE_SPHERE_SEGMENTS);
      const mesh = new THREE.Mesh(geometry, wireMaterial);
      mesh.position.fromArray(node.pos);
      mesh.name = `node:${name}`;
      this.group.add(mesh);
      this._disposables.push(mesh);
    }
    this._disposables.push({ material: wireMaterial });
  }

  _buildWeakSpots() {
    const interior = !!this._bakedMeshUrl;
    const lightIntensity = interior ? 8.0 : 3.0;
    const lightRange = interior ? 4000 : 2000;
    const lightDecay = 1.2;

    for (const spot of this.data.weakSpots ?? []) {
      const geometry = new THREE.SphereGeometry(75, 20, 20);
      const material = new THREE.MeshStandardMaterial({
        color: 0xff2233,
        emissive: 0xff1122,
        emissiveIntensity: 2.0,
        roughness: 0.4,
        metalness: 0.1,
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.fromArray(spot.pos);
      mesh.name = `weakSpot:${spot.id}`;
      this.group.add(mesh);

      const light = new THREE.PointLight(0xff3344, lightIntensity, lightRange, lightDecay);
      light.position.copy(mesh.position);
      this.group.add(light);

      this._disposables.push(mesh);
      this._weakSpotMeshes.push({
        id: spot.id,
        mesh,
        light,
        baseLightIntensity: lightIntensity,
        hp: spot.hp ?? WEAK_SPOT_HP,
        maxHp: spot.hp ?? WEAK_SPOT_HP,
        alive: true,
        normal: new THREE.Vector3(0, 0, 1),
        hitRadius: 75,
      });
    }
  }

  _buildInteriorLighting() {
    const ambient = new THREE.AmbientLight(0x3a4434, 0.15);
    this.group.add(ambient);
    this._interiorAmbient = ambient;

    const spot = new THREE.SpotLight(
      0xeaf2dc,
      18,
      8000,
      Math.PI / 2.4,
      0.35,
      0.7,
    );
    spot.castShadow = false;
    const target = new THREE.Object3D();
    this.group.add(spot);
    this.group.add(target);
    spot.target = target;
    this._playerSpot = spot;
    this._playerSpotTarget = target;
  }

  _buildAtmosphericLights() {
    // Soft warm point lights inside the biggest chambers so each one feels
    // like a lit room and walls/openings read at a glance. Only chambers
    // with radius >= threshold get a light — narrows and dead ends rely on
    // the player's headlight to stay atmospheric. Light count is kept
    // small because every point light is evaluated per fragment of the
    // wall shader.
    const CHAMBER_LIGHT_THRESHOLD = 700;
    const nodes = this.data.nodes ?? {};
    for (const [name, node] of Object.entries(nodes)) {
      const r = node.radius ?? 0;
      if (r < CHAMBER_LIGHT_THRESHOLD) continue;
      // High intensity + slow decay so the light actually reaches the walls
      // at maze scale (chambers are ~1000 units across). Range cuts off
      // beyond the chamber so adjacent rooms don't double-illuminate.
      const light = new THREE.PointLight(0xe0eed8, 28, r * 8, 0.5);
      light.position.fromArray(node.pos);
      light.name = `chamberLight:${name}`;
      this.group.add(light);
    }

    // A cooler-toned light at the entry node so the player can orient
    // themselves when control first hands over.
    const entry = nodes.entry;
    if (entry) {
      const entryLight = new THREE.PointLight(0xa8c8ff, 22, (entry.radius ?? 500) * 10, 0.5);
      entryLight.position.fromArray(entry.pos);
      entryLight.name = 'entryLight';
      this.group.add(entryLight);
    }
  }

  _embedTrash() {
    const tunnels = this.data.tunnels ?? [];
    if (!tunnels.length) return;
    const nodes = this.data.nodes;
    const loader = new GLTFLoader();
    const group = new THREE.Group();
    group.name = 'TunnelMazeEmbeddedTrash';
    this.group.add(group);
    this._embeddedTrashGroup = group;

    Promise.all(
      EMBED_TRASH_PALETTE.map(
        (entry) =>
          new Promise((resolve) => {
            loader.load(
              entry.url,
              (gltf) => {
                // Normalize to max-dimension = 1 (matches DebrisManager) so
                // `entry.scale` is the visible size in world units regardless
                // of how the GLB was authored.
                const scene = gltf.scene;
                scene.updateMatrixWorld(true);
                const bbox = new THREE.Box3().setFromObject(scene);
                const size = new THREE.Vector3();
                bbox.getSize(size);
                const maxDim = Math.max(size.x, size.y, size.z, 1e-4);
                const normScale = 1 / maxDim;
                // Pre-bake normalization into the template so per-instance
                // .scale = entry.scale * jitter just works.
                scene.scale.setScalar(normScale);
                const center = new THREE.Vector3();
                bbox.getCenter(center);
                scene.position.sub(center.multiplyScalar(normScale));
                resolve({ entry, scene });
              },
              undefined,
              () => resolve(null),
            );
          }),
      ),
    ).then((results) => {
      const templates = results.filter(Boolean);
      if (!templates.length) return;

      const tmpPos = new THREE.Vector3();
      const tmpTangent = new THREE.Vector3();
      const tmpRadial = new THREE.Vector3();
      const tmpHelper = new THREE.Vector3();
      const tmpQuat = new THREE.Quaternion();
      const tmpEuler = new THREE.Euler();
      const tmpPlacement = new THREE.Vector3();

      // Precompute chamber centers/radii once for fast inside-sphere tests.
      const chamberList = [];
      for (const node of Object.values(nodes)) {
        chamberList.push({
          center: new THREE.Vector3().fromArray(node.pos),
          radius: node.radius,
        });
      }

      for (const tunnel of tunnels) {
        const from = nodes[tunnel.from];
        const to = nodes[tunnel.to];
        if (!from || !to) continue;

        const ctrlPts = [new THREE.Vector3().fromArray(from.pos)];
        const ctrlRads = [from.radius];
        if (Array.isArray(tunnel.midpoints)) {
          for (const mp of tunnel.midpoints) {
            ctrlPts.push(new THREE.Vector3().fromArray(mp.pos));
            ctrlRads.push(mp.radius);
          }
        }
        ctrlPts.push(new THREE.Vector3().fromArray(to.pos));
        ctrlRads.push(to.radius);

        const curve = new THREE.CatmullRomCurve3(ctrlPts, false, 'catmullrom', 0.5);
        const length = curve.getLength();
        const density = Math.max(0, Math.min(1, tunnel.embedTrashDensity ?? 0.5));
        const placements = Math.min(
          EMBED_MAX_PER_TUNNEL,
          Math.max(0, Math.round((length / EMBED_PLACE_SPACING_BASE) * (0.4 + density * 1.5))),
        );

        for (let i = 0; i < placements; i++) {
          // Skip the very ends so debris doesn't poke through into a chamber.
          const t = (i + 0.5 + (Math.random() - 0.5) * 0.4) / placements;
          const tClamped = Math.max(0.05, Math.min(0.95, t));
          curve.getPointAt(tClamped, tmpPos);
          curve.getTangentAt(tClamped, tmpTangent);

          // Build a radial direction perpendicular to the tangent.
          tmpHelper.set(0, 1, 0);
          if (Math.abs(tmpTangent.dot(tmpHelper)) > 0.95) tmpHelper.set(1, 0, 0);
          tmpRadial.crossVectors(tmpTangent, tmpHelper).normalize();
          const theta = Math.random() * Math.PI * 2;
          // Rotate radial by theta around tangent.
          tmpQuat.setFromAxisAngle(tmpTangent, theta);
          tmpRadial.applyQuaternion(tmpQuat);

          // Interpolate tunnel radius at this parameter from control radii.
          const segIdx = Math.min(ctrlRads.length - 2, Math.floor(tClamped * (ctrlRads.length - 1)));
          const segT = tClamped * (ctrlRads.length - 1) - segIdx;
          const rHere = ctrlRads[segIdx] * (1 - segT) + ctrlRads[segIdx + 1] * segT;

          // If this sample sits deep inside a chamber sphere, attach the
          // trash to the chamber wall instead of the (much narrower) tube
          // wall — otherwise pieces inside big chambers float in midair.
          let containingChamber = null;
          for (const ch of chamberList) {
            const d = tmpPos.distanceTo(ch.center);
            // "Deep inside" = sample is well within the chamber, beyond the
            // tube's own radius from the chamber wall.
            if (d < ch.radius - rHere * 0.5) {
              containingChamber = ch;
              break;
            }
          }

          if (containingChamber) {
            // Pick any direction on the chamber sphere; bias slightly away
            // from the tunnel tangent so pieces don't all pile in the
            // doorway.
            tmpRadial.set(
              Math.random() * 2 - 1,
              Math.random() * 2 - 1,
              Math.random() * 2 - 1,
            );
            if (tmpRadial.lengthSq() < 1e-6) tmpRadial.set(0, 1, 0);
            tmpRadial.normalize();
            // De-project the tangent component a bit so pieces avoid the
            // ring of tunnel openings.
            const tDot = tmpRadial.dot(tmpTangent);
            tmpRadial.addScaledVector(tmpTangent, -tDot * 0.5).normalize();
            const wallR = containingChamber.radius * (0.94 + Math.random() * 0.08);
            tmpPlacement.copy(containingChamber.center).addScaledVector(tmpRadial, wallR);
          } else {
            // Tube interior: sit each piece right at the tube wall
            // (0.94-1.02 of the centerline radius) so it protrudes from
            // the displaced surface rather than floating in the middle.
            const dist = rHere * (0.94 + Math.random() * 0.08);
            tmpPlacement.copy(tmpPos).addScaledVector(tmpRadial, dist);
          }

          const template = templates[(Math.random() * templates.length) | 0];
          const inner = template.scene.clone(true);
          // Wrap so the template's normalization transform is preserved as
          // a child while we control world placement/scale on the wrapper.
          const clone = new THREE.Group();
          clone.add(inner);
          const scale = template.entry.scale * (0.7 + Math.random() * 0.7);
          clone.scale.setScalar(scale);
          clone.position.copy(tmpPlacement);
          tmpEuler.set(
            Math.random() * Math.PI * 2,
            Math.random() * Math.PI * 2,
            Math.random() * Math.PI * 2,
          );
          clone.quaternion.setFromEuler(tmpEuler);
          clone.traverse((obj) => {
            if (obj.isMesh) {
              obj.frustumCulled = false;
              obj.castShadow = false;
              obj.receiveShadow = false;
            }
          });
          group.add(clone);
        }
      }
    });
  }

  _loadBakedMesh(url) {
    const loader = new GLTFLoader();
    const material = new THREE.MeshStandardMaterial({
      color: 0x4e5a40,
      roughness: 0.88,
      metalness: 0.0,
      emissive: 0x161c12,
      emissiveIntensity: 0.4,
      side: THREE.BackSide,
    });
    this._bakedMaterial = material;

    loader.load(
      url,
      (gltf) => {
        const root = gltf.scene;
        root.name = 'TunnelMazeBaked';
        const originalMaterials = new Set();
        root.traverse((obj) => {
          if (obj.isMesh) {
            if (obj.material) {
              if (Array.isArray(obj.material)) {
                for (const m of obj.material) originalMaterials.add(m);
              } else {
                originalMaterials.add(obj.material);
              }
            }
            obj.material = material;
            obj.frustumCulled = false;
            if (obj.geometry) this._bakedGeometries.push(obj.geometry);
          }
        });
        for (const m of originalMaterials) {
          m.dispose();
        }
        this.group.add(root);
        this._bakedRoot = root;
      },
      undefined,
      (err) => {
        console.warn(`TunnelMaze: failed to load baked mesh "${url}":`, err);
        // Fall back to debug visuals so the level remains traversable.
        if (!this._debugEnabled) {
          this._debugEnabled = true;
          this._buildDebugCenterlines();
          this._buildDebugNodeMarkers();
        }
      },
    );
  }

  // ──────────────────────────────────────────────────────────────────────
  // Collision (analytical against JSON, not the baked mesh)
  // ──────────────────────────────────────────────────────────────────────

  _radiusAlongControls(radii, t) {
    if (radii.length < 2) return radii[0] ?? 0;
    const scaled = t * (radii.length - 1);
    const i = Math.min(radii.length - 2, Math.max(0, Math.floor(scaled)));
    const local = scaled - i;
    return radii[i] * (1 - local) + radii[i + 1] * local;
  }

  _buildCollisionData() {
    this._collisionSegments = [];
    this._collisionSpheres = [];

    for (const tunnel of this.data.tunnels ?? []) {
      const from = this.data.nodes?.[tunnel.from];
      const to = this.data.nodes?.[tunnel.to];
      if (!from || !to) continue;

      const ctrlPts = [new THREE.Vector3().fromArray(from.pos)];
      const ctrlRadii = [from.radius];
      if (Array.isArray(tunnel.midpoints)) {
        for (const mp of tunnel.midpoints) {
          ctrlPts.push(new THREE.Vector3().fromArray(mp.pos));
          ctrlRadii.push(mp.radius);
        }
      }
      ctrlPts.push(new THREE.Vector3().fromArray(to.pos));
      ctrlRadii.push(to.radius);

      const curve = new THREE.CatmullRomCurve3(ctrlPts, false, 'catmullrom', 0.5);
      const samples = [];
      for (let i = 0; i <= COLLISION_SAMPLES_PER_TUNNEL; i++) {
        const t = i / COLLISION_SAMPLES_PER_TUNNEL;
        const center = new THREE.Vector3();
        curve.getPointAt(t, center);
        const radius = this._radiusAlongControls(ctrlRadii, t);
        samples.push({ center, radius });
      }
      for (let i = 0; i < COLLISION_SAMPLES_PER_TUNNEL; i++) {
        this._collisionSegments.push({
          ax: samples[i].center.x,
          ay: samples[i].center.y,
          az: samples[i].center.z,
          bx: samples[i + 1].center.x,
          by: samples[i + 1].center.y,
          bz: samples[i + 1].center.z,
          ra: samples[i].radius,
          rb: samples[i + 1].radius,
        });
      }
    }

    for (const node of Object.values(this.data.nodes ?? {})) {
      this._collisionSpheres.push({
        cx: node.pos[0],
        cy: node.pos[1],
        cz: node.pos[2],
        radius: node.radius,
      });
    }
  }

  pushOutSphere(P, sphereR, out) {
    out.hit = false;
    if (!this._collisionSpheres || !this._collisionSegments) return;

    let bestPush = Infinity;
    let bestNx = 0;
    let bestNy = 0;
    let bestNz = 0;

    const px = P.x;
    const py = P.y;
    const pz = P.z;

    // Chamber spheres
    const spheres = this._collisionSpheres;
    for (let i = 0; i < spheres.length; i++) {
      const sph = spheres[i];
      const allowedR = sph.radius - sphereR;
      if (allowedR <= 0) continue;
      const dx = sph.cx - px;
      const dy = sph.cy - py;
      const dz = sph.cz - pz;
      const dSq = dx * dx + dy * dy + dz * dz;
      const allowedSq = allowedR * allowedR;
      if (dSq <= allowedSq) {
        // Player sphere fits entirely inside this primitive — no collision
        out.hit = false;
        return;
      }
      const d = Math.sqrt(dSq);
      const push = d - allowedR;
      if (push < bestPush) {
        bestPush = push;
        const inv = d > 1e-9 ? 1 / d : 0;
        bestNx = dx * inv;
        bestNy = dy * inv;
        bestNz = dz * inv;
      }
    }

    // Tube segments
    const segs = this._collisionSegments;
    for (let i = 0; i < segs.length; i++) {
      const seg = segs[i];
      const abx = seg.bx - seg.ax;
      const aby = seg.by - seg.ay;
      const abz = seg.bz - seg.az;
      const segLenSq = abx * abx + aby * aby + abz * abz;
      const apx = px - seg.ax;
      const apy = py - seg.ay;
      const apz = pz - seg.az;
      let t = segLenSq > 1e-9 ? (apx * abx + apy * aby + apz * abz) / segLenSq : 0;
      if (t < 0) t = 0;
      else if (t > 1) t = 1;
      const cx = seg.ax + abx * t;
      const cy = seg.ay + aby * t;
      const cz = seg.az + abz * t;
      const dx = cx - px;
      const dy = cy - py;
      const dz = cz - pz;
      const dSq = dx * dx + dy * dy + dz * dz;
      const segR = seg.ra * (1 - t) + seg.rb * t;
      const allowedR = segR - sphereR;
      if (allowedR <= 0) continue;
      const allowedSq = allowedR * allowedR;
      if (dSq <= allowedSq) {
        out.hit = false;
        return;
      }
      const d = Math.sqrt(dSq);
      const push = d - allowedR;
      if (push < bestPush) {
        bestPush = push;
        const inv = d > 1e-9 ? 1 / d : 0;
        bestNx = dx * inv;
        bestNy = dy * inv;
        bestNz = dz * inv;
      }
    }

    if (!Number.isFinite(bestPush)) {
      // No valid primitive (shouldn't happen with our data). Bail.
      out.hit = false;
      return;
    }

    out.hit = true;
    out.normal.set(bestNx, bestNy, bestNz);
    out.pos.set(px + bestNx * bestPush, py + bestNy * bestPush, pz + bestNz * bestPush);
  }

  segmentVsWalls(A, B, out) {
    out.hit = false;
    if (!this._collisionSpheres) return;

    if (!this._tmpPushResult) {
      this._tmpPushResult = {
        pos: new THREE.Vector3(),
        normal: new THREE.Vector3(),
        hit: false,
      };
    }
    const tmp = this._tmpPushResult;

    // If B (segment end) is inside the maze, no hit on this segment.
    this.pushOutSphere(B, 0, tmp);
    if (!tmp.hit) {
      out.hit = false;
      return;
    }

    // Binary search for the crossing point.
    let lo = 0;
    let hi = 1;
    const mid = _segScratch;
    for (let i = 0; i < SEGMENT_HIT_BINARY_STEPS; i++) {
      const t = (lo + hi) * 0.5;
      mid.lerpVectors(A, B, t);
      this.pushOutSphere(mid, 0, tmp);
      if (tmp.hit) hi = t;
      else lo = t;
    }

    out.hit = true;
    out.t = (lo + hi) * 0.5;
    out.point.lerpVectors(A, B, out.t);
    // One last pushOut at the resolved point for an accurate normal.
    this.pushOutSphere(out.point, 0, tmp);
    out.normal.copy(tmp.normal);
  }

  // ──────────────────────────────────────────────────────────────────────
  // Weak spots: wall placement + damage API
  // ──────────────────────────────────────────────────────────────────────

  _hashStringSeed(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  _placeWeakSpotsOnWalls() {
    if (!this._collisionSpheres || !this._collisionSegments) return;

    const hint = new THREE.Vector3();
    const outward = new THREE.Vector3();
    const wallPoint = new THREE.Vector3();

    for (const ws of this._weakSpotMeshes) {
      const jsonPos = ws.mesh.position.clone();

      // Deterministic small perturbation per spot.id so multiple spots in
      // the same chamber pick different walls.
      const h = this._hashStringSeed(ws.id);
      const a = ((h & 0xff) / 255) * Math.PI * 2;
      const b = (((h >>> 8) & 0xff) / 255) * Math.PI;
      const sinB = Math.sin(b);
      hint.copy(jsonPos).addScaledVector(
        _segScratch.set(sinB * Math.cos(a), Math.cos(b), sinB * Math.sin(a)),
        WEAK_SPOT_HINT_PERTURB,
      );

      // Find the primitive in which `hint` has the deepest clearance, and
      // the outward direction from that primitive's centerline/center to
      // hint. That gives us the wall the spot "sticks out of."
      let bestClearance = -Infinity;
      let foundWallPoint = null;
      let foundNormal = null;

      const spheres = this._collisionSpheres;
      for (let i = 0; i < spheres.length; i++) {
        const sph = spheres[i];
        const dx = hint.x - sph.cx;
        const dy = hint.y - sph.cy;
        const dz = hint.z - sph.cz;
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (d >= sph.radius) continue;
        const clearance = sph.radius - d;
        if (clearance > bestClearance) {
          bestClearance = clearance;
          const inv = d > 1e-6 ? 1 / d : 0;
          outward.set(dx * inv, dy * inv, dz * inv);
          if (inv === 0) outward.set(0, 1, 0);
          wallPoint.set(
            sph.cx + outward.x * sph.radius,
            sph.cy + outward.y * sph.radius,
            sph.cz + outward.z * sph.radius,
          );
          foundWallPoint = wallPoint.clone();
          foundNormal = outward.clone();
        }
      }

      // Only fall back to tube walls if no chamber contained the hint.
      if (bestClearance < 0) {
        const segs = this._collisionSegments;
        for (let i = 0; i < segs.length; i++) {
          const seg = segs[i];
          const abx = seg.bx - seg.ax;
          const aby = seg.by - seg.ay;
          const abz = seg.bz - seg.az;
          const segLenSq = abx * abx + aby * aby + abz * abz;
          const apx = hint.x - seg.ax;
          const apy = hint.y - seg.ay;
          const apz = hint.z - seg.az;
          let t = segLenSq > 1e-9 ? (apx * abx + apy * aby + apz * abz) / segLenSq : 0;
          if (t < 0) t = 0;
          else if (t > 1) t = 1;
          const cx = seg.ax + abx * t;
          const cy = seg.ay + aby * t;
          const cz = seg.az + abz * t;
          const dx = hint.x - cx;
          const dy = hint.y - cy;
          const dz = hint.z - cz;
          const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
          const segR = seg.ra * (1 - t) + seg.rb * t;
          if (d >= segR) continue;
          const clearance = segR - d;
          if (clearance > bestClearance) {
            bestClearance = clearance;
            const inv = d > 1e-6 ? 1 / d : 0;
            outward.set(dx * inv, dy * inv, dz * inv);
            if (inv === 0) outward.set(0, 1, 0);
            wallPoint.set(
              cx + outward.x * segR,
              cy + outward.y * segR,
              cz + outward.z * segR,
            );
            foundWallPoint = wallPoint.clone();
            foundNormal = outward.clone();
          }
        }
      }

      if (!foundWallPoint) continue;

      const embedDepth = ws.hitRadius * WEAK_SPOT_EMBED_FRACTION;
      const finalPos = new THREE.Vector3(
        foundWallPoint.x - foundNormal.x * embedDepth,
        foundWallPoint.y - foundNormal.y * embedDepth,
        foundWallPoint.z - foundNormal.z * embedDepth,
      );
      ws.mesh.position.copy(finalPos);
      if (ws.light) {
        // Light a bit inward of the spot so it illuminates playable air.
        ws.light.position.copy(finalPos).addScaledVector(foundNormal, -ws.hitRadius * 0.6);
      }
      ws.normal.copy(foundNormal);
    }
  }

  getWeakSpots() {
    return this._weakSpotMeshes;
  }

  getWallSamplePointsNear(center, count, range, forward = null) {
    const points = [];
    const segments = this._collisionSegments;
    const spheres = this._collisionSpheres;
    if (!segments || !spheres) return points;
    const rangeSq = range * range;
    // If forward is supplied, only accept candidate primitives whose closest
    // wall point sits in front of the player (dot > FORWARD_THRESHOLD).
    const FORWARD_THRESHOLD = 0.2; // ~78° forward cone — generous, not strict
    const fx = forward?.x ?? 0;
    const fy = forward?.y ?? 0;
    const fz = forward?.z ?? 0;
    const useForward = forward != null;

    const candidates = [];
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      const abx = seg.bx - seg.ax;
      const aby = seg.by - seg.ay;
      const abz = seg.bz - seg.az;
      const segLenSq = abx * abx + aby * aby + abz * abz;
      const apx = center.x - seg.ax;
      const apy = center.y - seg.ay;
      const apz = center.z - seg.az;
      let t = segLenSq > 1e-9 ? (apx * abx + apy * aby + apz * abz) / segLenSq : 0;
      if (t < 0) t = 0; else if (t > 1) t = 1;
      const cx = seg.ax + abx * t;
      const cy = seg.ay + aby * t;
      const cz = seg.az + abz * t;
      const dx = cx - center.x;
      const dy = cy - center.y;
      const dz = cz - center.z;
      const distSq = dx * dx + dy * dy + dz * dz;
      if (distSq >= rangeSq) continue;
      if (useForward) {
        const d = Math.sqrt(distSq) || 1;
        const fdot = (dx * fx + dy * fy + dz * fz) / d;
        if (fdot < FORWARD_THRESHOLD) continue;
      }
      candidates.push({ kind: 'seg', seg, t });
    }
    for (let i = 0; i < spheres.length; i++) {
      const sph = spheres[i];
      const dx = sph.cx - center.x;
      const dy = sph.cy - center.y;
      const dz = sph.cz - center.z;
      const distToCenter = Math.sqrt(dx * dx + dy * dy + dz * dz);
      const wallDist = Math.abs(distToCenter - sph.radius);
      if (wallDist >= range) continue;
      if (useForward) {
        const d = distToCenter || 1;
        const fdot = (dx * fx + dy * fy + dz * fz) / d;
        if (fdot < FORWARD_THRESHOLD) continue;
      }
      candidates.push({ kind: 'sph', sph });
    }
    if (!candidates.length) return points;

    for (let i = 0; i < count; i++) {
      const c = candidates[Math.floor(Math.random() * candidates.length)];
      if (c.kind === 'sph') {
        const sph = c.sph;
        let nx = center.x - sph.cx;
        let ny = center.y - sph.cy;
        let nz = center.z - sph.cz;
        let nLen = Math.sqrt(nx * nx + ny * ny + nz * nz);
        if (nLen < 1e-6) {
          nx = Math.random() - 0.5;
          ny = Math.random() - 0.5;
          nz = Math.random() - 0.5;
          nLen = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
        }
        nx /= nLen; ny /= nLen; nz /= nLen;
        nx += (Math.random() - 0.5) * 0.7;
        ny += (Math.random() - 0.5) * 0.7;
        nz += (Math.random() - 0.5) * 0.7;
        const jl = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
        nx /= jl; ny /= jl; nz /= jl;
        points.push(new THREE.Vector3(
          sph.cx + nx * sph.radius,
          sph.cy + ny * sph.radius,
          sph.cz + nz * sph.radius,
        ));
      } else {
        const seg = c.seg;
        const tt = Math.max(0, Math.min(1, c.t + (Math.random() - 0.5) * 0.3));
        const cx = seg.ax + (seg.bx - seg.ax) * tt;
        const cy = seg.ay + (seg.by - seg.ay) * tt;
        const cz = seg.az + (seg.bz - seg.az) * tt;
        const r = seg.ra * (1 - tt) + seg.rb * tt;
        const abx = seg.bx - seg.ax;
        const aby = seg.by - seg.ay;
        const abz = seg.bz - seg.az;
        const segLen = Math.sqrt(abx * abx + aby * aby + abz * abz) || 1;
        const tx = abx / segLen;
        const ty = aby / segLen;
        const tz = abz / segLen;
        let rx = center.x - cx;
        let ry = center.y - cy;
        let rz = center.z - cz;
        const dot = rx * tx + ry * ty + rz * tz;
        rx -= tx * dot;
        ry -= ty * dot;
        rz -= tz * dot;
        let rLen = Math.sqrt(rx * rx + ry * ry + rz * rz);
        if (rLen < 1e-6) {
          rx = 1; ry = 0; rz = 0;
        } else {
          rx /= rLen; ry /= rLen; rz /= rLen;
        }
        rx += (Math.random() - 0.5) * 0.5;
        ry += (Math.random() - 0.5) * 0.5;
        rz += (Math.random() - 0.5) * 0.5;
        const jl = Math.sqrt(rx * rx + ry * ry + rz * rz) || 1;
        rx /= jl; ry /= jl; rz /= jl;
        points.push(new THREE.Vector3(cx + rx * r, cy + ry * r, cz + rz * r));
      }
    }
    return points;
  }

  getWallSamplePoints(count) {
    const points = [];
    const segments = this._collisionSegments;
    const spheres = this._collisionSpheres;
    if (!segments || !spheres) return points;
    const segLen = segments.length;
    const sphLen = spheres.length;
    const total = segLen + sphLen;
    if (total === 0) return points;
    const segWeight = segLen / total;
    for (let i = 0; i < count; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const sinPhi = Math.sin(phi);
      const dx = sinPhi * Math.cos(theta);
      const dy = Math.cos(phi);
      const dz = sinPhi * Math.sin(theta);
      if (Math.random() < segWeight) {
        const seg = segments[Math.floor(Math.random() * segLen)];
        const t = Math.random();
        const cx = seg.ax + (seg.bx - seg.ax) * t;
        const cy = seg.ay + (seg.by - seg.ay) * t;
        const cz = seg.az + (seg.bz - seg.az) * t;
        const r = seg.ra * (1 - t) + seg.rb * t;
        points.push(new THREE.Vector3(cx + dx * r, cy + dy * r, cz + dz * r));
      } else {
        const sph = spheres[Math.floor(Math.random() * sphLen)];
        points.push(new THREE.Vector3(
          sph.cx + dx * sph.radius,
          sph.cy + dy * sph.radius,
          sph.cz + dz * sph.radius,
        ));
      }
    }
    return points;
  }

  getRadarNetwork() {
    if (this._radarNetworkCache) return this._radarNetworkCache;
    const tunnels = [];
    const tunnelData = this.data.tunnels ?? [];
    const samplesPerTunnel = 12;
    const tmp = new THREE.Vector3();
    for (const t of tunnelData) {
      const from = this.data.nodes?.[t.from];
      const to = this.data.nodes?.[t.to];
      if (!from || !to) continue;
      const ctrl = [new THREE.Vector3().fromArray(from.pos)];
      if (Array.isArray(t.midpoints)) {
        for (const mp of t.midpoints) ctrl.push(new THREE.Vector3().fromArray(mp.pos));
      }
      ctrl.push(new THREE.Vector3().fromArray(to.pos));
      const curve = new THREE.CatmullRomCurve3(ctrl, false, 'catmullrom', 0.5);
      const pts = [];
      for (let i = 0; i <= samplesPerTunnel; i++) {
        const v = new THREE.Vector3();
        curve.getPointAt(i / samplesPerTunnel, v);
        pts.push(v);
      }
      tunnels.push(pts);
    }
    const nodes = [];
    for (const node of Object.values(this.data.nodes ?? {})) {
      nodes.push({
        pos: new THREE.Vector3().fromArray(node.pos),
        radius: node.radius ?? 0,
      });
    }
    this._radarNetworkCache = { tunnels, nodes };
    return this._radarNetworkCache;
  }

  damageWeakSpot(index, damage) {
    const ws = this._weakSpotMeshes[index];
    if (!ws || !ws.alive) return { destroyed: false, alive: false };
    ws.hp = Math.max(0, ws.hp - damage);
    if (ws.hp <= 0) {
      this._destroyWeakSpotAt(index);
      return { destroyed: true, alive: false };
    }
    return { destroyed: false, alive: true };
  }

  _destroyWeakSpotAt(index) {
    const ws = this._weakSpotMeshes[index];
    if (!ws || !ws.alive) return;
    ws.alive = false;
    if (ws.mesh) {
      ws.mesh.visible = false;
    }
    if (ws.light) {
      // IMPORTANT: keep light.visible = true. Toggling visible changes the
      // active-light count which forces three.js to recompile every
      // light-affected material (the entire baked maze + embedded trash).
      // Zeroing intensity is free and visually identical.
      ws.light.intensity = 0;
    }
  }
}
