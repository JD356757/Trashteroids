import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const _lookTarget = new THREE.Vector3();
const _orbitCenter = new THREE.Vector3();

export class IntroScene {
  constructor(canvas) {
    this.canvas = canvas;
    this.active = false;
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x040816, 0.016);

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setClearColor(0x040816);

    this.camera = new THREE.PerspectiveCamera(52, window.innerWidth / window.innerHeight, 0.1, 300);
    this.camera.position.set(0, 1.5, 16);

    this.clock = new THREE.Clock();
    this._rafId = null;
    this._elapsed = 0;
    this.overlay = document.getElementById('overlay');
    this.overlayPanel = this.overlay?.querySelector('.overlay-panel') ?? null;
    this.startButton = document.getElementById('start-btn');

    this._buildLights();
    this._buildBackdrop();
    this._buildPlanet();
    this._buildAsteroids();
    this._buildTrashHalo();
    this._buildShip();

    this._onResize = this._onResize.bind(this);
    this._frame = this._frame.bind(this);
  }

  show() {
    if (this.active) return;
    this.active = true;
    this.clock.start();
    window.addEventListener('resize', this._onResize);
    this._frame();
  }

  hide() {
    this.active = false;
    if (this.overlay) {
      this.overlay.style.removeProperty('--overlay-shift-x');
      this.overlay.style.removeProperty('--overlay-shift-y');
      this.overlay.style.removeProperty('--overlay-tilt-x');
      this.overlay.style.removeProperty('--overlay-tilt-y');
      this.overlay.style.removeProperty('--overlay-glow');
    }
    window.removeEventListener('resize', this._onResize);
    if (this._rafId) cancelAnimationFrame(this._rafId);
    this._rafId = null;
  }

  dispose() {
    this.hide();
    this.renderer.dispose();
  }

  _buildLights() {
    this.scene.add(new THREE.AmbientLight(0x456080, 1.15));

    const key = new THREE.DirectionalLight(0x9ed8ff, 2.2);
    key.position.set(8, 6, 10);
    this.scene.add(key);

    const rim = new THREE.PointLight(0x39c3ff, 30, 60, 2);
    rim.position.set(-10, 4, -6);
    this.scene.add(rim);

    const warm = new THREE.PointLight(0xff8f4d, 18, 40, 2);
    warm.position.set(10, -3, 6);
    this.scene.add(warm);
  }

  _buildBackdrop() {
    const stars = new Float32Array(1800 * 3);
    for (let i = 0; i < 1800; i++) {
      stars[i * 3 + 0] = (Math.random() - 0.5) * 160;
      stars[i * 3 + 1] = (Math.random() - 0.5) * 100;
      stars[i * 3 + 2] = (Math.random() - 0.5) * 160;
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(stars, 3));
    const starMat = new THREE.PointsMaterial({
      color: 0xcce9ff,
      size: 0.22,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.95,
    });
    this.starfield = new THREE.Points(starGeo, starMat);
    this.scene.add(this.starfield);

  }

  _buildPlanet() {
    const planetGroup = new THREE.Group();
    planetGroup.position.set(-8.5, -2.2, -14);

    const planet = new THREE.Mesh(
      new THREE.SphereGeometry(4.8, 48, 48),
      new THREE.MeshStandardMaterial({
        color: 0x1f5378,
        roughness: 0.95,
        metalness: 0.02,
      })
    );
    planetGroup.add(planet);

    const cloud = new THREE.Mesh(
      new THREE.SphereGeometry(5.05, 42, 42),
      new THREE.MeshBasicMaterial({
        color: 0x8fdcff,
        transparent: true,
        opacity: 0.12,
        blending: THREE.AdditiveBlending,
      })
    );
    planetGroup.add(cloud);

    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(7.1, 0.18, 10, 80),
      new THREE.MeshBasicMaterial({
        color: 0x66d9ff,
        transparent: true,
        opacity: 0.18,
      })
    );
    ring.rotation.x = Math.PI / 2.25;
    ring.rotation.y = 0.45;
    planetGroup.add(ring);

    this.planetGroup = planetGroup;
    this.scene.add(planetGroup);
  }

  _buildAsteroids() {
    this.asteroidField = new THREE.Group();
    for (let i = 0; i < 18; i++) {
      const radius = 0.24 + Math.random() * 0.9;
      const asteroid = new THREE.Mesh(
        new THREE.IcosahedronGeometry(radius, 0),
        new THREE.MeshStandardMaterial({
          color: 0xb7a8ba,
          roughness: 0.95,
          metalness: 0.08,
        })
      );
      asteroid.position.set(
        (Math.random() - 0.5) * 18,
        (Math.random() - 0.5) * 7,
        -8 - Math.random() * 16
      );
      asteroid.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
      asteroid.userData.spin = new THREE.Vector3(
        (Math.random() - 0.5) * 0.35,
        (Math.random() - 0.5) * 0.35,
        (Math.random() - 0.5) * 0.35
      );
      asteroid.userData.drift = 0.2 + Math.random() * 0.35;
      this.asteroidField.add(asteroid);
    }
    this.scene.add(this.asteroidField);
  }

  _buildTrashHalo() {
    this.trashField = new THREE.Group();
    for (let i = 0; i < 42; i++) {
      const size = 0.08 + Math.random() * 0.18;
      const piece = new THREE.Mesh(
        new THREE.BoxGeometry(size, size * (0.9 + Math.random() * 0.6), size),
        new THREE.MeshStandardMaterial({
          color: i % 3 === 0 ? 0xff8347 : i % 3 === 1 ? 0x65d98d : 0x7cc7ff,
          emissive: 0x111111,
          roughness: 0.7,
          metalness: 0.15,
        })
      );
      const radius = 4.6 + Math.random() * 3.6;
      const angle = Math.random() * Math.PI * 2;
      const height = (Math.random() - 0.5) * 2.2;
      piece.position.set(Math.cos(angle) * radius, height, Math.sin(angle) * radius - 10);
      piece.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
      piece.userData.spin = new THREE.Vector3(
        (Math.random() - 0.5) * 0.7,
        (Math.random() - 0.5) * 0.7,
        (Math.random() - 0.5) * 0.7
      );
      piece.userData.orbitRadius = radius;
      piece.userData.orbitAngle = angle;
      piece.userData.orbitHeight = height;
      this.trashField.add(piece);
    }
    this.scene.add(this.trashField);
  }

  _buildShip() {
    this.shipRig = new THREE.Group();
    this.scene.add(this.shipRig);

    const fallbackBody = new THREE.Mesh(
      new THREE.ConeGeometry(0.52, 2.2, 12),
      new THREE.MeshStandardMaterial({
        color: 0xdbefff,
        emissive: 0x132334,
        roughness: 0.28,
        metalness: 0.6,
      })
    );
    fallbackBody.rotation.z = -Math.PI / 2;

    const wing = new THREE.Mesh(
      new THREE.BoxGeometry(1.6, 0.08, 0.7),
      new THREE.MeshStandardMaterial({
        color: 0x76d6ff,
        emissive: 0x102433,
        roughness: 0.35,
        metalness: 0.55,
      })
    );
    wing.position.set(-0.05, 0, 0);
    fallbackBody.add(wing);

    const glow = new THREE.PointLight(0x7ce8ff, 8, 14, 2);
    glow.position.set(-1.2, 0, 0);
    fallbackBody.add(glow);

    this.shipMesh = fallbackBody;
    this.shipRig.add(fallbackBody);

    const loader = new GLTFLoader();
    loader.load('/models/spaceshipactual.glb', (gltf) => {
      if (!this.shipRig) return;
      this.shipRig.remove(this.shipMesh);
      const model = gltf.scene;
      model.scale.setScalar(0.42);
      model.rotation.y = Math.PI;
      model.traverse((child) => {
        if (!child.isMesh) return;
        const materials = Array.isArray(child.material) ? child.material : [child.material];
        const clonedMaterials = materials.map((material) => {
          if (!material?.clone) {
            return new THREE.MeshStandardMaterial({
              color: new THREE.Color(0xdbefff),
              emissive: new THREE.Color(0x08121d),
              roughness: 0.35,
              metalness: 0.58,
            });
          }

          const cloned = material.clone();
          if ('emissive' in cloned && cloned.emissive?.setHex) {
            cloned.emissive.setHex(0x08121d);
            if ('emissiveIntensity' in cloned) cloned.emissiveIntensity = 0.35;
          }
          if ('roughness' in cloned && cloned.roughness !== undefined) cloned.roughness = Math.min(cloned.roughness, 0.5);
          if ('metalness' in cloned && cloned.metalness !== undefined) cloned.metalness = Math.max(cloned.metalness, 0.35);
          return cloned;
        });
        child.material = Array.isArray(child.material) ? clonedMaterials : clonedMaterials[0];
      });
      this.shipMesh = model;
      this.shipRig.add(model);
    });
  }

  _frame() {
    if (!this.active) return;
    this._rafId = requestAnimationFrame(this._frame);
    const delta = this.clock.getDelta();
    this._elapsed += delta;

    const t = this._elapsed;
    this.camera.position.set(
      Math.cos(t * 0.16) * 2.8,
      1.8 + Math.sin(t * 0.27) * 0.45,
      15 + Math.sin(t * 0.2) * 1.1
    );
    this.camera.lookAt(0, 0, -9);

    if (this.shipRig) {
      _orbitCenter.copy(this.planetGroup?.position || new THREE.Vector3(-8.5, -2.2, -14));
      const orbitAngle = t * 0.46;
      const orbitRadiusX = 7.8;
      const orbitRadiusZ = 5.4;
      const shipX = _orbitCenter.x + Math.cos(orbitAngle) * orbitRadiusX;
      const shipY = _orbitCenter.y + 1.8 + Math.sin(t * 1.15) * 1.1;
      const shipZ = _orbitCenter.z + Math.sin(orbitAngle) * orbitRadiusZ;
      this.shipRig.position.set(shipX, shipY, shipZ);

      _lookTarget.set(
        _orbitCenter.x + Math.cos(orbitAngle + 0.55) * orbitRadiusX,
        _orbitCenter.y + Math.sin(t * 1.15 + 0.4) * 0.9 + 1.2,
        _orbitCenter.z + Math.sin(orbitAngle + 0.55) * orbitRadiusZ
      );
      this.shipRig.lookAt(_lookTarget);
      this.shipRig.rotateY(Math.PI / 2);
    }

    this._animateOverlay(t);

    if (this.planetGroup) {
      this.planetGroup.rotation.y += delta * 0.08;
      this.planetGroup.rotation.z = Math.sin(t * 0.18) * 0.05;
    }

    if (this.asteroidField) {
      for (let i = 0; i < this.asteroidField.children.length; i++) {
        const asteroid = this.asteroidField.children[i];
        asteroid.rotation.x += asteroid.userData.spin.x * delta;
        asteroid.rotation.y += asteroid.userData.spin.y * delta;
        asteroid.rotation.z += asteroid.userData.spin.z * delta;
        asteroid.position.z += asteroid.userData.drift * delta;
        if (asteroid.position.z > 8) {
          asteroid.position.z = -26 - Math.random() * 10;
          asteroid.position.x = (Math.random() - 0.5) * 18;
          asteroid.position.y = (Math.random() - 0.5) * 7;
        }
      }
    }

    if (this.trashField) {
      this.trashField.rotation.y += delta * 0.06;
      for (let i = 0; i < this.trashField.children.length; i++) {
        const piece = this.trashField.children[i];
        piece.rotation.x += piece.userData.spin.x * delta;
        piece.rotation.y += piece.userData.spin.y * delta;
        piece.rotation.z += piece.userData.spin.z * delta;
        piece.userData.orbitAngle += delta * (0.08 + i * 0.0008);
        piece.position.x = Math.cos(piece.userData.orbitAngle) * piece.userData.orbitRadius;
        piece.position.z = Math.sin(piece.userData.orbitAngle) * piece.userData.orbitRadius - 10;
        piece.position.y = piece.userData.orbitHeight + Math.sin(t * 0.7 + i) * 0.16;
      }
    }

    if (this.starfield) {
      this.starfield.rotation.y += delta * 0.006;
      this.starfield.rotation.x = Math.sin(t * 0.12) * 0.05;
    }

    this.renderer.render(this.scene, this.camera);
  }

  _onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  _animateOverlay(t) {
    if (!this.overlay) return;

    let shiftX = Math.sin(t * 0.62) * 6;
    let shiftY = Math.cos(t * 0.78) * 4;
    let tiltX = Math.sin(t * 0.31) * 2.4;
    let tiltY = Math.cos(t * 0.43) * 3.4;

    if (this.shipRig) {
      const projected = this.shipRig.position.clone().project(this.camera);
      shiftX += projected.x * 10;
      shiftY += projected.y * -8;
      tiltY += projected.x * 2.8;
      tiltX += projected.y * -2.2;
    }

    this.overlay.style.setProperty('--overlay-shift-x', `${shiftX.toFixed(2)}px`);
    this.overlay.style.setProperty('--overlay-shift-y', `${shiftY.toFixed(2)}px`);
    this.overlay.style.setProperty('--overlay-tilt-x', `${tiltX.toFixed(2)}deg`);
    this.overlay.style.setProperty('--overlay-tilt-y', `${tiltY.toFixed(2)}deg`);
    this.overlay.style.setProperty('--overlay-glow', `${(0.22 + Math.sin(t * 1.4) * 0.08).toFixed(3)}`);

    if (this.startButton) {
      this.startButton.style.setProperty('--button-float', `${(Math.sin(t * 1.2) * 3).toFixed(2)}px`);
    }
  }
}
