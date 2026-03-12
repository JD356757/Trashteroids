import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const _lookTarget = new THREE.Vector3();
const _routePoint = new THREE.Vector3();

const INTRO_ROUTE = [
  { label: 'DEBRIS', color: 0xffc36d, pos: new THREE.Vector3(-5, 3.2, -4.5) },
  { label: 'JUNK', color: 0xff925d, pos: new THREE.Vector3(2.8, 0.4, -8.6) },
  { label: 'BOSS', color: 0xff6f7b, pos: new THREE.Vector3(10.5, 3.1, -12.4) },
];

export class IntroScene {
  constructor(canvas) {
    this.canvas = canvas;
    this.active = false;
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x12090a, 0.012);

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', stencil: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setClearColor(0x12090a);

    this.camera = new THREE.PerspectiveCamera(48, window.innerWidth / window.innerHeight, 0.1, 320);
    this.camera.position.set(0, 7, 24);

    this.timer = new THREE.Timer();
    this.timer.connect(document);
    this._rafId = null;
    this._elapsed = 0;
    this.overlay = document.getElementById('overlay');
    this.startButton = document.getElementById('start-btn');

    this._buildLights();
    this._buildStars();
    this._buildEarth();
    this._buildRoute();
    this._buildFlightPath();
    this._buildShip();

    this._onResize = this._onResize.bind(this);
    this._frame = this._frame.bind(this);
  }

  show() {
    if (this.active) return;
    this.active = true;
    this.timer.reset();
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
    this.timer.dispose();
    this.renderer.dispose();
  }

  _buildLights() {
    this.scene.add(new THREE.AmbientLight(0x6f4636, 1.35));

    const key = new THREE.DirectionalLight(0xffd2a8, 2.1);
    key.position.set(14, 16, 10);
    this.scene.add(key);

    const fill = new THREE.PointLight(0xff8f5f, 22, 80, 2);
    fill.position.set(2, 3, 12);
    this.scene.add(fill);

    const rim = new THREE.PointLight(0xffd58f, 16, 70, 2);
    rim.position.set(-16, 6, -12);
    this.scene.add(rim);
  }

  _buildStars() {
    const count = 2200;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 340;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 180;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 340;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const material = new THREE.PointsMaterial({
      color: 0xffe0b0,
      size: 0.28,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.94,
    });

    this.starfield = new THREE.Points(geometry, material);
    this.scene.add(this.starfield);
  }

  _buildEarth() {
    const group = new THREE.Group();
    group.position.set(-12, -0.2, 0);

    const loader = new THREE.TextureLoader();
    const diffuse = loader.load('/textures/planet/Earth_Diffuse_6K.jpg');
    const normal = loader.load('/textures/planet/Earth_NormalNRM_6K.jpg');

    const earth = new THREE.Mesh(
      new THREE.SphereGeometry(2.8, 64, 64),
      new THREE.MeshStandardMaterial({
        map: diffuse,
        normalMap: normal,
        roughness: 0.95,
        metalness: 0.0,
      }),
    );
    group.add(earth);

    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(4.1, 0.08, 18, 96),
      new THREE.MeshBasicMaterial({
        color: 0xffb96f,
        transparent: true,
        opacity: 0.32,
      }),
    );
    ring.rotation.x = Math.PI / 2;
    group.add(ring);

    const glow = new THREE.Sprite(
      new THREE.SpriteMaterial({
        color: 0xffb06b,
        transparent: true,
        opacity: 0.18,
        depthWrite: false,
      }),
    );
    glow.scale.set(11, 11, 1);
    group.add(glow);

    this.earth = earth;
    this.earthRing = ring;
    this.earthGlow = glow;
    this.earthGroup = group;
    this.scene.add(group);

    const label = this._makeTextSprite('EARTH', 0xffb96f);
    label.position.copy(group.position).add(new THREE.Vector3(0, -4.5, 0));
    this.scene.add(label);
    this.earthLabel = label;
  }

  _buildRoute() {
    this.routeNodes = [];

    for (const node of INTRO_ROUTE) {
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(0.95, 32, 32),
        new THREE.MeshStandardMaterial({
          color: node.color,
          emissive: node.color,
          emissiveIntensity: 0.62,
          roughness: 0.28,
          metalness: 0.08,
        }),
      );
      mesh.position.copy(node.pos);
      this.scene.add(mesh);

      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(1.48, 0.05, 18, 80),
        new THREE.MeshBasicMaterial({
          color: node.color,
          transparent: true,
          opacity: 0.44,
        }),
      );
      ring.position.copy(node.pos);
      ring.rotation.x = Math.PI / 2;
      this.scene.add(ring);

      const label = this._makeTextSprite(node.label, node.color);
      label.position.copy(node.pos).add(new THREE.Vector3(0, -2.1, 0));
      this.scene.add(label);

      this.routeNodes.push({ ...node, mesh, ring, label });
    }
  }

  _buildFlightPath() {
    const curvePoints = [
      new THREE.Vector3(-12, 1.8, 2.6),
      new THREE.Vector3(-8.4, 4.6, -0.8),
      new THREE.Vector3(-2.2, 3.4, -5.2),
      new THREE.Vector3(4.2, 1.6, -9.2),
      new THREE.Vector3(11.6, 4.2, -13.6),
    ];
    this.flightCurve = new THREE.CatmullRomCurve3(curvePoints);

    const pathGeometry = new THREE.BufferGeometry().setFromPoints(this.flightCurve.getPoints(80));
    const pathMaterial = new THREE.LineDashedMaterial({
      color: 0xffb56f,
      dashSize: 0.7,
      gapSize: 0.35,
      transparent: true,
      opacity: 0.52,
    });
    this.flightPath = new THREE.Line(pathGeometry, pathMaterial);
    this.flightPath.computeLineDistances();
    this.scene.add(this.flightPath);
  }

  _buildShip() {
    this.shipRig = new THREE.Group();
    this.scene.add(this.shipRig);

    const fallbackBody = new THREE.Mesh(
      new THREE.ConeGeometry(0.52, 2.2, 12),
      new THREE.MeshStandardMaterial({
        color: 0xffddb6,
        emissive: 0x341a0d,
        roughness: 0.32,
        metalness: 0.58,
      }),
    );
    fallbackBody.rotation.z = -Math.PI / 2;

    const wing = new THREE.Mesh(
      new THREE.BoxGeometry(1.6, 0.08, 0.7),
      new THREE.MeshStandardMaterial({
        color: 0xffa66e,
        emissive: 0x261109,
        roughness: 0.38,
        metalness: 0.5,
      }),
    );
    wing.position.set(-0.05, 0, 0);
    fallbackBody.add(wing);

    const glow = new THREE.PointLight(0xffb46b, 10, 18, 2);
    glow.position.set(-1.3, 0, 0);
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
        const converted = materials.map((material) => {
          const cloned = material?.clone ? material.clone() : new THREE.MeshStandardMaterial({ color: 0xffddb6 });
          if ('emissive' in cloned && cloned.emissive?.setHex) {
            cloned.emissive.setHex(0x2a160e);
            if ('emissiveIntensity' in cloned) cloned.emissiveIntensity = 0.42;
          }
          if ('roughness' in cloned && cloned.roughness !== undefined) cloned.roughness = Math.min(cloned.roughness, 0.5);
          if ('metalness' in cloned && cloned.metalness !== undefined) cloned.metalness = Math.max(cloned.metalness, 0.38);
          return cloned;
        });
        child.material = Array.isArray(child.material) ? converted : converted[0];
      });
      this.shipMesh = model;
      this.shipRig.add(model);
    });
  }

  _frame(timestamp) {
    if (!this.active) return;
    this._rafId = requestAnimationFrame(this._frame);
    this.timer.update(timestamp);
    const delta = this.timer.getDelta();
    this._elapsed += delta;

    const t = this._elapsed;
    this.camera.position.set(
      Math.sin(t * 0.13) * 24,
      8 + Math.sin(t * 0.24) * 1.6,
      5 + Math.cos(t * 0.13) * 23,
    );
    this.camera.lookAt(0, 0.5, -4);

    this._animateOverlay(t);
    this._animateEarth(t, delta);
    this._animateRoute(t, delta);
    this._animateShip(t);

    if (this.starfield) {
      this.starfield.rotation.y += delta * 0.004;
      this.starfield.rotation.x = Math.sin(t * 0.08) * 0.03;
    }

    this.renderer.render(this.scene, this.camera);
  }

  _animateEarth(t, delta) {
    if (!this.earthGroup) return;
    this.earthGroup.position.y = -0.2 + Math.sin(t * 0.7) * 0.28;
    this.earth.rotation.y += delta * 0.09;
    this.earthRing.rotation.z += delta * 0.34;
    this.earthLabel.position.copy(this.earthGroup.position).add(new THREE.Vector3(0, -4.5, 0));
    this.earthGlow.material.opacity = 0.16 + Math.sin(t * 1.1) * 0.03;
  }

  _animateRoute(t, delta) {
    for (let i = 0; i < this.routeNodes.length; i++) {
      const node = this.routeNodes[i];
      const wave = Math.sin(t * 1.25 + i * 1.8);
      node.mesh.position.y = node.pos.y + wave * 0.24;
      node.mesh.scale.setScalar(1 + wave * 0.06);
      node.ring.position.y = node.mesh.position.y;
      node.ring.rotation.z += delta * (0.3 + i * 0.06);
      node.ring.material.opacity = 0.34 + (wave + 1) * 0.08;
      node.label.position.copy(node.mesh.position).add(new THREE.Vector3(0, -2.1, 0));
    }
  }

  _animateShip(t) {
    if (!this.shipRig || !this.flightCurve) return;

    const progress = (t * 0.055) % 1;
    const lead = (progress + 0.02) % 1;
    this.shipRig.position.copy(this.flightCurve.getPointAt(progress));
    _routePoint.copy(this.flightCurve.getPointAt(lead));
    _lookTarget.copy(_routePoint).add(new THREE.Vector3(0, 0.08, 0));
    this.shipRig.lookAt(_lookTarget);
    this.shipRig.rotateY(Math.PI / 2);
  }

  _onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  _animateOverlay(t) {
    if (!this.overlay) return;

    let shiftX = Math.sin(t * 0.56) * 5;
    let shiftY = Math.cos(t * 0.72) * 4;
    let tiltX = Math.sin(t * 0.3) * 2.1;
    let tiltY = Math.cos(t * 0.38) * 3;

    if (this.shipRig) {
      const projected = this.shipRig.position.clone().project(this.camera);
      shiftX += projected.x * 8;
      shiftY += projected.y * -7;
      tiltY += projected.x * 2.1;
      tiltX += projected.y * -1.8;
    }

    this.overlay.style.setProperty('--overlay-shift-x', `${shiftX.toFixed(2)}px`);
    this.overlay.style.setProperty('--overlay-shift-y', `${shiftY.toFixed(2)}px`);
    this.overlay.style.setProperty('--overlay-tilt-x', `${tiltX.toFixed(2)}deg`);
    this.overlay.style.setProperty('--overlay-tilt-y', `${tiltY.toFixed(2)}deg`);
    this.overlay.style.setProperty('--overlay-glow', `${(0.22 + Math.sin(t * 1.2) * 0.07).toFixed(3)}`);

    if (this.startButton) {
      this.startButton.style.setProperty('--button-float', `${(Math.sin(t * 1.1) * 2.5).toFixed(2)}px`);
    }
  }

  _makeTextSprite(text, color) {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    ctx.font = 'bold 48px "Press Start 2P", monospace';
    ctx.fillStyle = `#${new THREE.Color(color).getHexString()}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = ctx.fillStyle;
    ctx.shadowBlur = 16;
    ctx.fillText(text, 256, 64);

    const texture = new THREE.CanvasTexture(canvas);
    const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false });
    const sprite = new THREE.Sprite(material);
    sprite.scale.set(5, 1.25, 1);
    return sprite;
  }
}
