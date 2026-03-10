import * as THREE from 'three';

/**
 * Static starfield that surrounds the camera in a sphere.
 * Stars don't move — they just float in place, and the whole
 * point cloud re-centers on the camera each frame so stars
 * are always visible no matter where the ship flies.
 */
export class Starfield {
  constructor(scene, count = 800) {
    this.radius = 120;

    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      this._randomOnSphere(positions, i, 0, 0, 0);
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const material = new THREE.PointsMaterial({
      color: 0xffffff,
      size: 0.25,
      sizeAttenuation: true,
      depthWrite: false,
    });

    this.points = new THREE.Points(geometry, material);
    this.points.renderOrder = -1;
    scene.add(this.points);
  }

  _randomOnSphere(arr, i, cx, cy, cz) {
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    const r = this.radius * (0.3 + Math.random() * 0.7);
    arr[i * 3]     = cx + Math.sin(phi) * Math.cos(theta) * r;
    arr[i * 3 + 1] = cy + Math.sin(phi) * Math.sin(theta) * r;
    arr[i * 3 + 2] = cz + Math.cos(phi) * r;
  }

  update(delta, camera) {
    // Keep the starfield centered on the camera so stars
    // are always surrounding the player, regardless of position.
    this.points.position.copy(camera.position);
  }
}
