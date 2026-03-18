import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const _trashBoundsCenter = new THREE.Vector3();
const _trashBoundsSize = new THREE.Vector3();
const _trashDummy = new THREE.Object3D();
const INTRO_TRASH_MODEL_PATH = '/models/trashnew.glb';
const INTRO_TRASH_COUNT = 30;

function createIntroTrashMaterial(material) {
  const textured = new THREE.MeshStandardMaterial({
    color: material?.color ? material.color.clone() : new THREE.Color(0xffffff),
    emissive: material?.emissive ? material.emissive.clone() : new THREE.Color(0x000000),
    emissiveIntensity: material?.emissiveIntensity ?? 1,
    map: material?.map ?? null,
    alphaMap: material?.alphaMap ?? null,
    normalMap: material?.normalMap ?? null,
    roughnessMap: material?.roughnessMap ?? null,
    metalnessMap: material?.metalnessMap ?? null,
    transparent: Boolean(material?.transparent || material?.alphaMap),
    opacity: material?.opacity ?? 1,
    side: material?.side ?? THREE.FrontSide,
    roughness: material?.roughness ?? 0.92,
    metalness: material?.metalness ?? 0.06,
  });

  textured.alphaTest = Math.max(material?.alphaTest ?? 0, 0.18);
  return textured;
}

export class IntroScene {
  constructor(canvas) {
    this.canvas = canvas;
    this.active = false;
    this._bgOnly = false; // when true, only renders starfield (no overlay animation)
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x040816, 0.016);

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, logarithmicDepthBuffer: true });
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

    this._buildBackdrop();

    this._onResize = this._onResize.bind(this);
    this._frame = this._frame.bind(this);
  }

  show() {
    if (this.active) return;
    this.active = true;
    this._bgOnly = false;
    this.clock.start();
    window.addEventListener('resize', this._onResize);
    this._frame();
  }

  /** Switch to background-only mode: keeps the RAF loop running so stars never freeze. */
  showBackground() {
    this._bgOnly = true;
    if (!this.active) {
      this.active = true;
      this.clock.start();
      window.addEventListener('resize', this._onResize);
      this._frame();
    }
  }

  hide() {
    this.active = false;
    this._bgOnly = false;
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
    this._trashOrbiters = [];
    this._trashLayers = [];
    for (let i = 0; i < INTRO_TRASH_COUNT; i++) {
      const radius = 4.6 + Math.random() * 3.6;
      const angle = Math.random() * Math.PI * 2;
      const height = (Math.random() - 0.5) * 2.2;
      this._trashOrbiters.push({
        orbitRadius: radius,
        orbitAngle: angle,
        orbitHeight: height,
        bobPhase: Math.random() * Math.PI * 2,
        scale: 0.68 + Math.random() * 0.44,
        position: new THREE.Vector3(Math.cos(angle) * radius, height, Math.sin(angle) * radius - 10),
        rotation: new THREE.Vector3(
          Math.random() * Math.PI,
          Math.random() * Math.PI,
          Math.random() * Math.PI
        ),
        spin: new THREE.Vector3(
          (Math.random() - 0.5) * 0.7,
          (Math.random() - 0.5) * 0.7,
          (Math.random() - 0.5) * 0.7
        ),
      });
    }
    this.scene.add(this.trashField);

    const loader = new GLTFLoader();
    loader.load(
      INTRO_TRASH_MODEL_PATH,
      (gltf) => {
        const bakedParts = [];
        const aggregateBounds = new THREE.Box3();

        gltf.scene.updateMatrixWorld(true);
        gltf.scene.traverse((child) => {
          if (!child.isMesh || !child.geometry) return;

          const geometry = child.geometry.clone();
          geometry.applyMatrix4(child.matrixWorld);
          geometry.computeBoundingBox();
          aggregateBounds.union(geometry.boundingBox);

          const material = Array.isArray(child.material)
            ? child.material.map((entry) => createIntroTrashMaterial(entry))
            : createIntroTrashMaterial(child.material);

          bakedParts.push({ geometry, material });
        });

        if (bakedParts.length === 0) return;

        aggregateBounds.getCenter(_trashBoundsCenter);
        aggregateBounds.getSize(_trashBoundsSize);
        const normalizeScale = 1 / Math.max(_trashBoundsSize.x, _trashBoundsSize.y, _trashBoundsSize.z, 0.001);

        for (let i = 0; i < bakedParts.length; i++) {
          const part = bakedParts[i];
          part.geometry.translate(-_trashBoundsCenter.x, -_trashBoundsCenter.y, -_trashBoundsCenter.z);
          part.geometry.scale(normalizeScale, normalizeScale, normalizeScale);
          part.geometry.computeBoundingSphere();

          const layer = new THREE.InstancedMesh(part.geometry, part.material, INTRO_TRASH_COUNT);
          layer.count = this._trashOrbiters.length;
          layer.frustumCulled = false;
          layer.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
          this.trashField.add(layer);
          this._trashLayers.push(layer);
        }

        this._syncTrashHaloInstances();
      },
      undefined,
      (error) => {
        console.error('[IntroScene] Failed to load trashnew.glb', error);
      }
    );
  }

  _syncTrashHaloInstances() {
    if (!this._trashLayers?.length || !this._trashOrbiters?.length) return;

    for (let i = 0; i < this._trashOrbiters.length; i++) {
      const piece = this._trashOrbiters[i];
      _trashDummy.position.copy(piece.position);
      _trashDummy.rotation.set(piece.rotation.x, piece.rotation.y, piece.rotation.z);
      _trashDummy.scale.setScalar(piece.scale);
      _trashDummy.updateMatrix();

      for (let j = 0; j < this._trashLayers.length; j++) {
        this._trashLayers[j].setMatrixAt(i, _trashDummy.matrix);
      }
    }

    for (let i = 0; i < this._trashLayers.length; i++) {
      this._trashLayers[i].instanceMatrix.needsUpdate = true;
    }
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

  /** Render just the starfield (called externally when bgOnly). */
  renderStarfield() {
    const delta = this.clock.getDelta();
    this._elapsed += delta;
    const t = this._elapsed;

    this.camera.position.set(Math.cos(t * 0.08) * 1.2, 1.6 + Math.sin(t * 0.12) * 0.25, 16);
    this.camera.lookAt(0, 0, -9);

    if (this.starfield) {
      this.starfield.rotation.y += delta * 0.006;
      this.starfield.rotation.x = Math.sin(t * 0.12) * 0.02;
    }

    this.renderer.render(this.scene, this.camera);
  }

  _frame() {
    if (!this.active) return;
    this._rafId = requestAnimationFrame(this._frame);
    const delta = this.clock.getDelta();
    this._elapsed += delta;

    const t = this._elapsed;

    // Gentle camera motion for a simple star-only intro.
    this.camera.position.set(Math.cos(t * 0.08) * 1.2, 1.6 + Math.sin(t * 0.12) * 0.25, 16);
    this.camera.lookAt(0, 0, -9);

    if (this.starfield) {
      this.starfield.rotation.y += delta * 0.006;
      this.starfield.rotation.x = Math.sin(t * 0.12) * 0.02;
    }

    if (!this._bgOnly) {
      this._animateOverlay(t);
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

    const shiftX = Math.sin(t * 0.48) * 4;
    const shiftY = Math.cos(t * 0.56) * 3;
    const tiltX = Math.sin(t * 0.24) * 1.8;
    const tiltY = Math.cos(t * 0.34) * 2.6;

    this.overlay.style.setProperty('--overlay-shift-x', `${shiftX.toFixed(2)}px`);
    this.overlay.style.setProperty('--overlay-shift-y', `${shiftY.toFixed(2)}px`);
    this.overlay.style.setProperty('--overlay-tilt-x', `${tiltX.toFixed(2)}deg`);
    this.overlay.style.setProperty('--overlay-tilt-y', `${tiltY.toFixed(2)}deg`);
    this.overlay.style.setProperty('--overlay-glow', `${(0.22 + Math.sin(t * 1.4) * 0.06).toFixed(3)}`);

    if (this.startButton) {
      this.startButton.style.setProperty('--button-float', `${(Math.sin(t * 1.1) * 4).toFixed(2)}px`);
    }
  }
}
