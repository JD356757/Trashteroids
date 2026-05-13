import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const CURVE_SAMPLES_PER_EDGE = 48;
const NODE_SPHERE_SEGMENTS = 12;

const _spotTargetPos = new THREE.Vector3();
const _spotForward = new THREE.Vector3();
const _defaultForward = new THREE.Vector3(0, 0, -1);

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
      this._loadBakedMesh(bakedMeshUrl);
      this._embedTrash();
    }

    scene.add(this.group);
  }

  getPlayerStart() {
    return this.data.playerStart;
  }

  update(delta, playerPos = null, playerQuat = null) {
    this._pulseTime += delta;
    const pulse = 0.5 + 0.5 * Math.sin(this._pulseTime * 3.2);
    for (const entry of this._weakSpotMeshes) {
      const scale = 1 + 0.18 * pulse;
      entry.mesh.scale.setScalar(scale);
      entry.mesh.material.emissiveIntensity = 1.4 + pulse * 1.6;
      if (entry.light) {
        entry.light.intensity = entry.baseLightIntensity + pulse * entry.baseLightIntensity;
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
      });
    }
  }

  _buildInteriorLighting() {
    const ambient = new THREE.AmbientLight(0x4a3a2c, 0.15);
    this.group.add(ambient);
    this._interiorAmbient = ambient;

    const spot = new THREE.SpotLight(
      0xfff0d6,
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
      color: 0x8a7a60,
      roughness: 0.85,
      metalness: 0.0,
      emissive: 0x2a2218,
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
}
