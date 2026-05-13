import * as THREE from 'three';

const CURVE_SAMPLES_PER_EDGE = 48;
const NODE_SPHERE_SEGMENTS = 12;

export class TunnelMaze {
  constructor(scene, tunnelData, { debug = true } = {}) {
    this.scene = scene;
    this.data = tunnelData;
    this.group = new THREE.Group();
    this.group.name = 'TunnelMaze';

    this._disposables = [];
    this._weakSpotMeshes = [];
    this._pulseTime = 0;

    if (debug) {
      this._buildDebugCenterlines();
      this._buildDebugNodeMarkers();
    }
    this._buildWeakSpots();

    scene.add(this.group);
  }

  getPlayerStart() {
    return this.data.playerStart;
  }

  update(delta) {
    this._pulseTime += delta;
    const pulse = 0.5 + 0.5 * Math.sin(this._pulseTime * 3.2);
    for (const entry of this._weakSpotMeshes) {
      const scale = 1 + 0.18 * pulse;
      entry.mesh.scale.setScalar(scale);
      entry.mesh.material.emissiveIntensity = 1.4 + pulse * 1.6;
      if (entry.light) {
        entry.light.intensity = 2.0 + pulse * 2.0;
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
    this._disposables.length = 0;
    this._weakSpotMeshes.length = 0;
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

      const light = new THREE.PointLight(0xff3344, 3.0, 2000, 1.2);
      light.position.copy(mesh.position);
      this.group.add(light);

      this._disposables.push(mesh);
      this._weakSpotMeshes.push({ id: spot.id, mesh, light });
    }
  }
}
