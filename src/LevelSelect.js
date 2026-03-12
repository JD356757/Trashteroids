import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

/**
 * 3D level-select screen.
 *
 * Shows a small starfield, floating level "planets" arranged in an arc,
 * and a tiny version of the player ship that flies to whichever level
 * the user clicks. Once the ship arrives a confirmation popup appears.
 */

const EARTH_POS = new THREE.Vector3(-12, 0, 0);
const SHIP_START = new THREE.Vector3(EARTH_POS.x, EARTH_POS.y + 2, EARTH_POS.z + 0);

const LEVEL_DATA = [
  { id: 1, label: 'LEVEL 1', sub: '15,000 mi — Debris Field', color: 0x00ff88, pos: new THREE.Vector3( -4, 3, -4) },
  { id: 2, label: 'LEVEL 2', sub: '5,000 mi — Junk Belt',    color: 0xffaa00, pos: new THREE.Vector3(  4, 0, -8) },
  { id: 3, label: 'LEVEL 3', sub: '1 mi — BOSS',             color: 0xff2244, pos: new THREE.Vector3( 12, 3, -12) },
];

// Smooth ease-in-out (cubic)
function easeInOut(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

export class LevelSelect {
  /**
   * @param {HTMLCanvasElement} canvas  – the same canvas the game uses
   * @param {Function} onLevelChosen   – called with level id when user confirms
   */
  constructor(canvas, onLevelChosen) {
    this.canvas = canvas;
    this.onLevelChosen = onLevelChosen;
    this.active = false;
    this._selectedLevel = null;
    this._shipArrived = false;

    /* ── renderer (reuse the game canvas) ── */
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0x000011);

    /* ── scene ── */
    this.scene = new THREE.Scene();

    /* ── camera ── */
    this.camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 500);
    this.camera.position.set(0, 8, 22);
    this.camera.lookAt(0, 0, -2);
    this._orbitAngle = 0; // radians, slowly incremented

    /* ── lights ── */
    this.scene.add(new THREE.AmbientLight(0x334466, 1.2));
    const sun = new THREE.DirectionalLight(0xffffff, 2);4
    sun.position.set(10, 15, 10);
    this.scene.add(sun);

    /* ── starfield background (simple random points) ── */
    this._buildStars();

    /* ── level nodes ── */
    this.nodes = [];              // { mesh, ring, label3d, data }
    this._buildLevelNodes();

    /* ── mini Earth (home node, same size as level planets) ── */
    this._buildEarth();

    /* ── mini ship ── */
    this.ship = new THREE.Group();
    this.ship.position.copy(SHIP_START);
    this.scene.add(this.ship);
    this._loadShipModel();

    // Flight state for ease-in-out movement
    this._flightFrom = new THREE.Vector3().copy(SHIP_START);
    this._flightTo = new THREE.Vector3().copy(SHIP_START);
    this._flightProgress = 1; // 1 = arrived / idle
    this._flightDuration = 1.5; // seconds for a full trip

    /* ── raycaster for click detection ── */
    this.raycaster = new THREE.Raycaster();
    this._mouse = new THREE.Vector2();

    /* ── popup element (created once, toggled) ── */
    this._popup = document.getElementById('level-popup');
    this._popupLabel = document.getElementById('level-popup-label');
    this._popupSub = document.getElementById('level-popup-sub');
    this._popupYes = document.getElementById('level-popup-yes');
    this._popupNo = document.getElementById('level-popup-no');

    this._popupYes.addEventListener('click', () => this._confirmLevel());
    this._popupNo.addEventListener('click', () => this._cancelPopup());

    /* ── bind events ── */
    this._onClick = this._onClick.bind(this);
    this._onResize = this._onResize.bind(this);
    this._frame = this._frame.bind(this);

    this._clock = new THREE.Clock();
    this._rafId = null;
  }

  /* ════════════════  public API  ════════════════ */

  show() {
    this.active = true;
    this._selectedLevel = null;
    this._shipArrived = false;
    this.ship.position.copy(SHIP_START);
    this._flightFrom.copy(SHIP_START);
    this._flightTo.copy(SHIP_START);
    this._flightProgress = 1;
    this._orbitAngle = 0;
    this._hidePopup();

    window.addEventListener('click', this._onClick);
    window.addEventListener('resize', this._onResize);
    this._clock.start();
    this._frame();
  }

  hide() {
    this.active = false;
    this._hidePopup();
    window.removeEventListener('click', this._onClick);
    window.removeEventListener('resize', this._onResize);
    if (this._rafId) cancelAnimationFrame(this._rafId);
    this._rafId = null;
  }

  dispose() {
    this.hide();
    this.renderer.dispose();
  }

  /* ════════════════  internals  ════════════════ */

  _frame() {
    if (!this.active) return;
    this._rafId = requestAnimationFrame(this._frame);
    const delta = this._clock.getDelta();

    this._animateShip(delta);
    this._animateNodes(delta);
    this._animateStars(delta);
    this._animateCamera(delta);

    this.renderer.render(this.scene, this.camera);
  }

  /* ── ship ── */

  _loadShipModel() {
    const loader = new GLTFLoader();
    loader.load('/models/spaceshipactual.glb', (gltf) => {
      const model = gltf.scene;
      model.scale.setScalar(0.4);
      model.rotation.y = Math.PI;
      // Make all materials emissive-ish basic so they look nice without heavy lighting
      model.traverse((c) => {
        if (!c.isMesh) return;
        const mats = Array.isArray(c.material) ? c.material : [c.material];
        mats.forEach((m) => {
          if (m.color) m.color.multiplyScalar(1.3);
        });
      });
      this.ship.add(model);
    });
  }

  _animateShip(delta) {
    if (this._flightProgress < 1) {
      // Advance flight progress
      this._flightProgress = Math.min(1, this._flightProgress + delta / this._flightDuration);
      const t = easeInOut(this._flightProgress);

      // Interpolate position along straight line with easing
      this.ship.position.lerpVectors(this._flightFrom, this._flightTo, t);

      // Rotate ship to face travel direction
      const dir = new THREE.Vector3().subVectors(this._flightTo, this._flightFrom);
      if (dir.lengthSq() > 0.001) {
        const lookTarget = new THREE.Vector3().copy(this.ship.position).add(dir.normalize());
        const m = new THREE.Matrix4().lookAt(this.ship.position, lookTarget, new THREE.Vector3(0, 1, 0));
        const q = new THREE.Quaternion().setFromRotationMatrix(m);
        this.ship.quaternion.slerp(q, 1 - Math.exp(-8 * delta));
      }

      // Check arrival
      if (this._flightProgress >= 1 && this._selectedLevel && !this._shipArrived) {
        this._shipArrived = true;
        this._showPopup();
      }
    } else {
      // Gentle hover bob when idle
      this.ship.position.y += Math.sin(Date.now() * 0.002) * 0.003;
    }
  }

  /* ── level nodes ── */

  _buildLevelNodes() {
    for (const data of LEVEL_DATA) {
      // Glowing sphere
      const geo = new THREE.SphereGeometry(1.0, 32, 32);
      const mat = new THREE.MeshStandardMaterial({
        color: data.color,
        emissive: data.color,
        emissiveIntensity: 0.6,
        roughness: 0.3,
        metalness: 0.1,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.copy(data.pos);
      mesh.userData.levelId = data.id;
      this.scene.add(mesh);

      // Pulsing ring
      const ringGeo = new THREE.TorusGeometry(1.5, 0.04, 16, 64);
      const ringMat = new THREE.MeshBasicMaterial({ color: data.color, transparent: true, opacity: 0.5 });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.position.copy(data.pos);
      ring.rotation.x = Math.PI / 2;
      ring.userData.levelId = data.id;
      this.scene.add(ring);

      // 3D text sprite label (placed below the node so ship can sit above)
      const label = this._makeTextSprite(data.label, data.color);
      label.position.copy(data.pos).add(new THREE.Vector3(0, -2, 0));
      label.userData.levelId = data.id;
      this.scene.add(label);

      this.nodes.push({ mesh, ring, label, data });
    }
  }

  _animateNodes(delta) {
    const t = Date.now() * 0.001;

    // Animate Earth the same way
    if (this._earthMesh) {
      this._earthMesh.position.y = EARTH_POS.y + Math.sin(t) * 0.3;
      this._earthRing.position.y = this._earthMesh.position.y;
      this._earthLabel.position.y = this._earthMesh.position.y - 2;
      this._earthRing.rotation.z += delta * 0.5;
      const ep = 1 + Math.sin(t * 2) * 0.08;
      this._earthMesh.scale.setScalar(ep);
    }

    for (const node of this.nodes) {
      // Gentle float
      node.mesh.position.y = node.data.pos.y + Math.sin(t + node.data.id * 2) * 0.3;
      node.ring.position.y = node.mesh.position.y;
      node.label.position.y = node.mesh.position.y - 2;

      // Rotate ring
      node.ring.rotation.z += delta * 0.5;

      // Pulse scale
      const pulse = 1 + Math.sin(t * 2 + node.data.id) * 0.08;
      node.mesh.scale.setScalar(pulse);

      // Highlight selected
      if (this._selectedLevel && this._selectedLevel.id === node.data.id) {
        node.ring.material.opacity = 0.5 + Math.sin(t * 4) * 0.3;
        node.mesh.material.emissiveIntensity = 0.8 + Math.sin(t * 4) * 0.2;
      } else {
        node.ring.material.opacity = 0.35;
        node.mesh.material.emissiveIntensity = 0.5;
      }
    }
  }

  /* ── stars ── */

  _buildStars() {
    const count = 1500;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      positions[i * 3 + 0] = (Math.random() - 0.5) * 300;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 300;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 300;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({ color: 0xffffff, size: 0.25, sizeAttenuation: true });
    this._stars = new THREE.Points(geo, mat);
    this.scene.add(this._stars);
  }

  _animateStars(delta) {
    this._stars.rotation.y += delta * 0.01;
    this._stars.rotation.x += delta * 0.005;
  }

  /* ── click / raycasting ── */

  _onClick(e) {
    if (!this.active) return;
    // Ignore clicks on the popup itself
    if (this._popup && !this._popup.classList.contains('hidden') && this._popup.contains(e.target)) return;

    this._mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
    this._mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;

    this.raycaster.setFromCamera(this._mouse, this.camera);
    // include node meshes + rings + earth meshes so clicks on any of them count
    const meshes = [];
    for (const n of this.nodes) {
      meshes.push(n.mesh, n.ring, n.label);
    }
    if (this._earthMesh) meshes.push(this._earthMesh, this._earthRing, this._earthLabel);

    const hits = this.raycaster.intersectObjects(meshes);

    if (hits.length > 0) {
      const obj = hits[0].object;
      // Earth clicked -> fly back home (no popup)
      if (this._earthMesh && (obj === this._earthMesh || obj === this._earthRing || obj === this._earthLabel)) {
        this._selectedLevel = null;
        this._shipArrived = false;
        this._hidePopup();
        this._flightFrom.copy(this.ship.position);
        this._flightTo.copy(SHIP_START);
        this._flightProgress = 0;
        return;
      }

      // Otherwise attempt to resolve a level id
      const id = obj.userData && obj.userData.levelId;
      if (id) {
        const levelData = LEVEL_DATA.find(l => l.id === id);
        if (levelData) {
          this._selectedLevel = levelData;
          this._shipArrived = false;
          this._hidePopup();
          // Start eased flight from current position to just above the level icon
          this._flightFrom.copy(this.ship.position);
          this._flightTo.copy(levelData.pos).add(new THREE.Vector3(0, 2, 0));
          this._flightProgress = 0;
        }
      }
    }
  }

  /* ── popup ── */

  _showPopup() {
    if (!this._selectedLevel) return;
    this._popupLabel.textContent = this._selectedLevel.label;
    this._popupSub.textContent = this._selectedLevel.sub;
    this._popup.classList.remove('hidden');
  }

  _hidePopup() {
    this._popup.classList.add('hidden');
  }

  _confirmLevel() {
    if (!this._selectedLevel) return;
    const id = this._selectedLevel.id;
    this._hidePopup();
    this.hide();
    this.onLevelChosen(id);
  }

  _cancelPopup() {
    this._hidePopup();
    this._selectedLevel = null;
    // Fly back to above Earth
    this._flightFrom.copy(this.ship.position);
    this._flightTo.copy(SHIP_START);
    this._flightProgress = 0;
  }

  /* ── helpers ── */

  _animateCamera(delta) {
    // Slowly orbit around the center of the level layout
    this._orbitAngle += delta * 0.08;
    const radius = 28;
    const height = 10;
    const cx = 0, cz = -4; // center of the layout
    this.camera.position.set(
      cx + Math.sin(this._orbitAngle) * radius,
      height + Math.sin(this._orbitAngle * 0.5) * 2,
      cz + Math.cos(this._orbitAngle) * radius
    );
    this.camera.lookAt(cx, 1, cz);
  }

  _buildEarth() {
    const geo = new THREE.SphereGeometry(1.0, 64, 64);
    const loader = new THREE.TextureLoader();
    const diffuse = loader.load('/textures/planet/Earth_Diffuse_6K.jpg');
    const normal = loader.load('/textures/planet/Earth_NormalNRM_6K.jpg');

    const mat = new THREE.MeshStandardMaterial({
      map: diffuse,
      normalMap: normal,
      roughness: 1.0,
      metalness: 0.0,
    });
    this._earthMesh = new THREE.Mesh(geo, mat);
    this._earthMesh.position.copy(EARTH_POS);
    this.scene.add(this._earthMesh);

    // (cloud layer removed per user request)

    // Ring around Earth
    const ringGeo = new THREE.TorusGeometry(1.5, 0.04, 16, 64);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0x4488ff, transparent: true, opacity: 0.4 });
    this._earthRing = new THREE.Mesh(ringGeo, ringMat);
    this._earthRing.position.copy(EARTH_POS);
    this._earthRing.rotation.x = Math.PI / 2;
    this.scene.add(this._earthRing);

    // Label
    const label = this._makeTextSprite('EARTH', 0x4488ff);
    label.position.copy(EARTH_POS).add(new THREE.Vector3(0, -2, 0));
    this._earthLabel = label;
    this.scene.add(label);
  }

  _makeTextSprite(text, color) {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    ctx.font = 'bold 48px "Press Start 2P", monospace';
    ctx.fillStyle = '#' + new THREE.Color(color).getHexString();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = ctx.fillStyle;
    ctx.shadowBlur = 16;
    ctx.fillText(text, 256, 64);

    const tex = new THREE.CanvasTexture(canvas);
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(5, 1.25, 1);
    return sprite;
  }

  _onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }
}
