import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { LEVEL_CONFIGS, getUnlockedLevel } from './LevelManager.js';

/**
 * 3D level-select screen.
 *
 * Shows a small starfield, floating level "planets" arranged in an arc,
 * and a tiny version of the player ship that flies to whichever level
 * the user clicks. Once the ship arrives a confirmation popup appears.
 */

const EARTH_POS = new THREE.Vector3(-12, 0, 0);
const SHIP_START = new THREE.Vector3(EARTH_POS.x, EARTH_POS.y + 2, EARTH_POS.z + 0);
const MOUSE_SENSITIVITY_STORAGE_KEY = 'trashteroid_mouse_sensitivity';
const ACCESSIBILITY_SETTINGS_STORAGE_KEY = 'trashteroid_accessibility_settings';
const DEFAULT_ACCESSIBILITY_SETTINGS = {
  reducedMotion: false,
  reducedFlashing: false,
  musicVisualizer: false,
};

const LEVEL_DATA = [
  { id: 1, label: 'LEVEL 1', sub: '15,000 mi — Debris Field', color: 0x00ff88, pos: new THREE.Vector3( -4, 3, -4) },
  { id: 2, label: 'LEVEL 2', sub: '15,000 mi — Junk Belt',   color: 0xffaa00, pos: new THREE.Vector3(  4, 0, -8) },
  { id: 3, label: 'LEVEL 3', sub: '1 mi — BOSS',             color: 0xff2244, pos: new THREE.Vector3( 12, 3, -12) },
];

function formatTrashLabel(count) {
  return `Destroy ${count} ${count === 1 ? 'piece' : 'pieces'} of trash`;
}

function formatRecycleLabel(count) {
  return `Collect ${count} ${count === 1 ? 'recyclable' : 'recyclables'}`;
}

function getBriefing(levelId) {
  const config = LEVEL_CONFIGS[levelId];
  const mission = config?.mission;
  const primary = mission?.primary ?? {};
  const bonus = mission?.bonus ?? {};
  const required = [];
  const bonusItems = [];

  if (primary.reachTrashteroid) {
    required.push('Reach Trashteroid');
  }
  if (primary.trashRequired) {
    required.push(formatTrashLabel(primary.trashRequired));
  }
  if (primary.recycleRequired) {
    required.push(formatRecycleLabel(primary.recycleRequired));
  }
  if (primary.destroyTrashteroid) {
    required.push('Destroy Trashteroid');
  }

  if (bonus.fastTrashRequired && bonus.fastSpeedDisplay) {
    bonusItems.push(
      `Destroy ${bonus.fastTrashRequired} pieces of trash above ${bonus.fastSpeedDisplay} m/s`
    );
  }
  if (bonus.shieldThreshold != null) {
    bonusItems.push(`Finish with over ${bonus.shieldThreshold}% shield integrity`);
  }

  return {
    tagline: config?.briefingTagline ?? '',
    required,
    bonus: bonusItems,
  };
}

// Smooth ease-in-out (cubic)
function easeInOut(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function loadAccessibilitySettings() {
  try {
    const rawValue = window.localStorage.getItem(ACCESSIBILITY_SETTINGS_STORAGE_KEY);
    if (!rawValue) return { ...DEFAULT_ACCESSIBILITY_SETTINGS };
    const parsed = JSON.parse(rawValue);
    return {
      reducedMotion: !!parsed?.reducedMotion,
      reducedFlashing: !!parsed?.reducedFlashing,
      musicVisualizer: !!parsed?.musicVisualizer,
    };
  } catch (error) {
    return { ...DEFAULT_ACCESSIBILITY_SETTINGS };
  }
}

function saveAccessibilitySettings(settings) {
  const normalized = {
    reducedMotion: !!settings?.reducedMotion,
    reducedFlashing: !!settings?.reducedFlashing,
    musicVisualizer: !!settings?.musicVisualizer,
  };

  try {
    window.localStorage.setItem(ACCESSIBILITY_SETTINGS_STORAGE_KEY, JSON.stringify(normalized));
  } catch (error) {
    // Ignore storage failures and keep current runtime values.
  }

  return normalized;
}

function loadMouseSensitivityDisplayValue() {
  try {
    const rawValue = window.localStorage.getItem(MOUSE_SENSITIVITY_STORAGE_KEY);
    const parsed = rawValue == null ? NaN : Number(rawValue);
    if (Number.isFinite(parsed)) {
      return THREE.MathUtils.clamp(Math.round(parsed * 1000), 8, 60);
    }
  } catch (error) {
    // Ignore storage failures and use default value.
  }

  return 24;
}

function saveMouseSensitivityDisplayValue(displayValue) {
  const clamped = THREE.MathUtils.clamp(Math.round(displayValue), 8, 60);

  try {
    window.localStorage.setItem(MOUSE_SENSITIVITY_STORAGE_KEY, `${clamped / 1000}`);
  } catch (error) {
    // Ignore storage failures and keep runtime value.
  }

  return clamped;
}

export class LevelSelect {
  /**
   * @param {HTMLCanvasElement} canvas  – the same canvas the game uses
   * @param {Function} onLevelChosen   – called with level id when user confirms
   */
  constructor(canvas, onLevelChosen, sharedRenderer, introScene) {
    this.canvas = canvas;
    this.onLevelChosen = onLevelChosen;
    this.active = false;
    this._selectedLevel = null;
    this._shipArrived = false;
    this._introScene = introScene;
    this._unlockedLevel = getUnlockedLevel();
    this._unlockBypass = false;
    this._accessibilitySettings = loadAccessibilitySettings();

    /* ── renderer (shared with IntroScene) ── */
    this.renderer = sharedRenderer;

    /* ── scene ── */
    this.scene = new THREE.Scene();

    /* ── camera ── */
    this.camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 500);
    this.camera.position.set(0, 8, 22);
    this.camera.lookAt(0, 0, -2);
    this._orbitAngle = 0;

    /* ── lights ── */
    this.scene.add(new THREE.AmbientLight(0x334466, 1.2));
    const sun = new THREE.DirectionalLight(0xffffff, 2);
    sun.position.set(10, 15, 10);
    this.scene.add(sun);

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

    /* ── briefing screen ── */
    this._briefingEl = document.getElementById('level-briefing');
    this._briefingLevel = document.getElementById('briefing-level-label');
    this._briefingTagline = document.getElementById('briefing-tagline');
    this._briefingRequiredList = document.getElementById('briefing-required-list');
    this._briefingBonusList = document.getElementById('briefing-bonus-list');
    this._briefingOptions = document.getElementById('briefing-options');
    this._briefingTutorialToggle = document.getElementById('briefing-tutorial-mode');
    this._pendingLevelId = null;
    document.getElementById('briefing-start-btn').addEventListener('click', () => {
      this._briefingEl.classList.add('hidden');
      this.onLevelChosen({
        levelId: this._pendingLevelId,
        tutorialMode: this._pendingLevelId === 1 && !!this._briefingTutorialToggle?.checked,
      });
    });

    /* ── settings panel ── */
    this._settingsBtn = document.getElementById('level-select-settings-btn');
    this._settingsRoot = document.getElementById('level-select-settings');
    this._settingsPanel = document.getElementById('level-select-settings-panel');
    this._settingsCloseBtn = document.getElementById('level-select-settings-close');
    this._settingsSensitivity = document.getElementById('level-select-mouse-sensitivity');
    this._settingsSensitivityValue = document.getElementById('level-select-mouse-sensitivity-value');
    this._settingsReducedMotion = document.getElementById('level-select-reduced-motion');
    this._settingsReducedFlashing = document.getElementById('level-select-reduced-flashing');
    this._settingsMusicVisualizer = document.getElementById('level-select-music-visualizer');
    this._musicVisualizer = document.getElementById('music-visualizer');
    this._musicVisualizerBars = this._musicVisualizer
      ? Array.from(this._musicVisualizer.querySelectorAll('.visualizer-bar'))
      : [];
    this._musicVisualizerPhase = 0;
    this._musicVisualizerEnergy = 0;

    /* ── bind events ── */
    this._onClick = this._onClick.bind(this);
    this._onKeyDown = this._onKeyDown.bind(this);
    this._onResize = this._onResize.bind(this);
    this._frame = this._frame.bind(this);
    this._onSettingsButtonClick = this._onSettingsButtonClick.bind(this);
    this._onSettingsRootClick = this._onSettingsRootClick.bind(this);
    this._onSettingsInput = this._onSettingsInput.bind(this);

    this._settingsBtn?.addEventListener('click', this._onSettingsButtonClick);
    this._settingsRoot?.addEventListener('click', this._onSettingsRootClick);
    this._settingsCloseBtn?.addEventListener('click', this._onSettingsButtonClick);
    this._settingsSensitivity?.addEventListener('input', this._onSettingsInput);
    this._settingsReducedMotion?.addEventListener('change', this._onSettingsInput);
    this._settingsReducedFlashing?.addEventListener('change', this._onSettingsInput);
    this._settingsMusicVisualizer?.addEventListener('change', this._onSettingsInput);

    this._syncSettingsControls();
    this._applyAccessibilityPreview();

    this._clock = new THREE.Clock();
    this._rafId = null;
  }

  /* ════════════════  public API  ════════════════ */

  show() {
    this.active = true;
    this._unlockedLevel = getUnlockedLevel();
    this._unlockBypass = false;
    this._syncSettingsControls();
    this._applyAccessibilityPreview();
    this._selectedLevel = null;
    this._shipArrived = false;
    this.ship.position.copy(SHIP_START);
    this._flightFrom.copy(SHIP_START);
    this._flightTo.copy(SHIP_START);
    this._flightProgress = 1;
    this._orbitAngle = 0;
    this._hidePopup();
    if (this._briefingTutorialToggle) {
      this._briefingTutorialToggle.checked = false;
    }
    if (this._settingsBtn) {
      this._settingsBtn.classList.remove('hidden');
    }
    this._hideSettingsPanel();

    window.addEventListener('click', this._onClick);
    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('resize', this._onResize);
    this._clock.start();
    this._frame();
  }

  hide() {
    this.active = false;
    this._hidePopup();
    this._hideSettingsPanel();
    this._setMusicVisualizerVisible(false);
    if (this._settingsBtn) {
      this._settingsBtn.classList.add('hidden');
    }
    window.removeEventListener('click', this._onClick);
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('resize', this._onResize);
    if (this._rafId) cancelAnimationFrame(this._rafId);
    this._rafId = null;
  }

  dispose() {
    this.hide();
    // Don't dispose the shared renderer here
  }

  /* ════════════════  internals  ════════════════ */

  _frame() {
    if (!this.active) return;
    this._rafId = requestAnimationFrame(this._frame);
    const delta = this._clock.getDelta();

    this._animateShip(delta);
    this._animateNodes(delta);
    this._animateCamera(delta);
    this._updateMusicVisualizer(delta);

    // IntroScene renders the starfield in its own RAF loop; render level-select scene on top
    this.renderer.autoClear = false;
    this.renderer.render(this.scene, this.camera);
    this.renderer.autoClear = true;
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
      if (!this._accessibilitySettings.reducedMotion) {
        this.ship.position.y += Math.sin(Date.now() * 0.002) * 0.003;
      }
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
    const reducedMotion = this._accessibilitySettings.reducedMotion;
    const t = Date.now() * 0.001;

    // Animate Earth the same way
    if (this._earthMesh) {
      this._earthMesh.position.y = reducedMotion ? EARTH_POS.y : EARTH_POS.y + Math.sin(t) * 0.3;
      this._earthRing.position.y = this._earthMesh.position.y;
      this._earthLabel.position.y = this._earthMesh.position.y - 2;
      this._earthRing.rotation.z += reducedMotion ? 0 : delta * 0.5;
      const ep = reducedMotion ? 1 : 1 + Math.sin(t * 2) * 0.08;
      this._earthMesh.scale.setScalar(ep);
    }

    for (const node of this.nodes) {
      const unlocked = this._isLevelUnlocked(node.data.id);

      // Gentle float
      node.mesh.position.y = reducedMotion
        ? node.data.pos.y
        : node.data.pos.y + Math.sin(t + node.data.id * 2) * 0.3;
      node.ring.position.y = node.mesh.position.y;
      node.label.position.y = node.mesh.position.y - 2;

      // Rotate ring
      node.ring.rotation.z += reducedMotion ? 0 : delta * 0.5;

      // Pulse scale
      const pulse = reducedMotion ? 1 : 1 + Math.sin(t * 2 + node.data.id) * 0.08;
      node.mesh.scale.setScalar(pulse);

      node.mesh.material.color.setHex(unlocked ? node.data.color : 0x4d5563);
      node.mesh.material.emissive.setHex(unlocked ? node.data.color : 0x11151d);
      node.ring.material.color.setHex(unlocked ? node.data.color : 0x5e6674);
      node.label.material.color.setHex(unlocked ? 0xffffff : 0x6b7380);
      node.label.material.opacity = unlocked ? 1 : 0.24;

      // Highlight selected
      if (unlocked && this._selectedLevel && this._selectedLevel.id === node.data.id) {
        node.ring.material.opacity = 0.5 + Math.sin(t * 4) * 0.3;
        node.mesh.material.emissiveIntensity = 0.8 + Math.sin(t * 4) * 0.2;
      } else if (!unlocked) {
        node.ring.material.opacity = 0.03;
        node.mesh.material.emissiveIntensity = 0.03;
      } else {
        node.ring.material.opacity = 0.35;
        node.mesh.material.emissiveIntensity = 0.5;
      }
    }
  }

  _isLevelUnlocked(levelId) {
    return this._unlockBypass || levelId <= this._unlockedLevel;
  }

  /* ── click / raycasting ── */

  _onClick(e) {
    if (!this.active) return;
    if (this._settingsRoot && !this._settingsRoot.classList.contains('hidden') && this._settingsRoot.contains(e.target)) return;
    if (this._settingsBtn && !this._settingsBtn.classList.contains('hidden') && this._settingsBtn.contains(e.target)) return;
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
        if (!this._isLevelUnlocked(id)) {
          return;
        }
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

  _onKeyDown(e) {
    if (!this.active) return;
    if (e.key !== '5') return;
    this._unlockBypass = true;
  }

  _syncSettingsControls() {
    this._accessibilitySettings = loadAccessibilitySettings();
    const sensitivityValue = loadMouseSensitivityDisplayValue();

    if (this._settingsSensitivity) {
      this._settingsSensitivity.value = `${sensitivityValue}`;
    }
    if (this._settingsSensitivityValue) {
      this._settingsSensitivityValue.textContent = `${sensitivityValue}`;
    }
    if (this._settingsReducedMotion) {
      this._settingsReducedMotion.checked = this._accessibilitySettings.reducedMotion;
    }
    if (this._settingsReducedFlashing) {
      this._settingsReducedFlashing.checked = this._accessibilitySettings.reducedFlashing;
    }
    if (this._settingsMusicVisualizer) {
      this._settingsMusicVisualizer.checked = this._accessibilitySettings.musicVisualizer;
    }
  }

  _applyAccessibilityPreview() {
    this._setMusicVisualizerVisible(this.active && !!this._accessibilitySettings.musicVisualizer);
  }

  _setMusicVisualizerVisible(visible) {
    if (!this._musicVisualizer) return;
    this._musicVisualizer.classList.remove('music-visualizer-gameplay');
    this._musicVisualizer.classList.toggle('hidden', !visible);
    this._musicVisualizer.setAttribute('aria-hidden', visible ? 'false' : 'true');
    if (!visible) {
      this._musicVisualizerEnergy = 0;
      this._resetMusicVisualizerBars();
    }
  }

  _resetMusicVisualizerBars() {
    for (let i = 0; i < this._musicVisualizerBars.length; i++) {
      const bar = this._musicVisualizerBars[i];
      bar.style.transform = 'scaleY(0.18)';
      bar.style.opacity = '0.52';
    }
  }

  _updateMusicVisualizer(delta) {
    if (!this.active || !this._accessibilitySettings.musicVisualizer) return;
    if (!this._musicVisualizerBars.length) return;

    this._musicVisualizerPhase += delta * 5.2;
    const targetEnergy = this._accessibilitySettings.reducedMotion ? 0.32 : 0.52;
    const smoothing = 1 - Math.exp(-delta * 7);
    this._musicVisualizerEnergy += (targetEnergy - this._musicVisualizerEnergy) * smoothing;

    for (let i = 0; i < this._musicVisualizerBars.length; i++) {
      const bar = this._musicVisualizerBars[i];
      const wave = (Math.sin(this._musicVisualizerPhase * 2.3 + i * 0.68) + 1) * 0.5;
      const ripple = (Math.sin(this._musicVisualizerPhase * 4.6 + i * 1.04) + 1) * 0.5;
      const level = THREE.MathUtils.clamp(
        0.16 + this._musicVisualizerEnergy * (0.46 + wave * 0.56) + ripple * 0.14,
        0.12,
        1
      );
      bar.style.transform = `scaleY(${0.18 + level * 1.3})`;
      bar.style.opacity = `${0.5 + level * 0.45}`;
    }
  }

  _showSettingsPanel() {
    if (!this._settingsRoot) return;
    this._settingsRoot.classList.remove('hidden');
    this._settingsRoot.setAttribute('aria-hidden', 'false');
  }

  _hideSettingsPanel() {
    if (!this._settingsRoot) return;
    this._settingsRoot.classList.add('hidden');
    this._settingsRoot.setAttribute('aria-hidden', 'true');
  }

  _onSettingsButtonClick(e) {
    e.preventDefault();
    e.stopPropagation();
    if (!this._settingsRoot || this._settingsRoot.classList.contains('hidden')) {
      this._showSettingsPanel();
      return;
    }
    this._hideSettingsPanel();
  }

  _onSettingsRootClick(e) {
    if (!this._settingsRoot || this._settingsRoot.classList.contains('hidden')) return;
    if (this._settingsPanel && this._settingsPanel.contains(e.target)) return;
    this._hideSettingsPanel();
  }

  _onSettingsInput() {
    if (this._settingsSensitivity) {
      const sensitivityValue = saveMouseSensitivityDisplayValue(Number(this._settingsSensitivity.value));
      this._settingsSensitivity.value = `${sensitivityValue}`;
      if (this._settingsSensitivityValue) {
        this._settingsSensitivityValue.textContent = `${sensitivityValue}`;
      }
    }

    this._accessibilitySettings = saveAccessibilitySettings({
      reducedMotion: !!this._settingsReducedMotion?.checked,
      reducedFlashing: !!this._settingsReducedFlashing?.checked,
      musicVisualizer: !!this._settingsMusicVisualizer?.checked,
    });
    this._applyAccessibilityPreview();
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
    this._showBriefing(id);
  }

  _showBriefing(id) {
    const levelData = LEVEL_DATA.find(l => l.id === id);
    const brief = getBriefing(id);
    this._pendingLevelId = id;

    this._briefingLevel.textContent = levelData ? levelData.label : `LEVEL ${id}`;
    this._briefingTagline.textContent = '';

    this._briefingRequiredList.innerHTML = '';
    for (const item of (brief?.required ?? [])) {
      const li = document.createElement('li');
      li.textContent = item;
      this._briefingRequiredList.appendChild(li);
    }

    this._briefingBonusList.innerHTML = '';
    for (const item of (brief?.bonus ?? [])) {
      const li = document.createElement('li');
      li.textContent = item;
      this._briefingBonusList.appendChild(li);
    }

    if (this._briefingOptions) {
      this._briefingOptions.classList.toggle('hidden', id !== 1);
    }
    if (this._briefingTutorialToggle) {
      this._briefingTutorialToggle.checked = false;
    }

    this._briefingEl.classList.remove('hidden');
    this._typeTagline(brief?.tagline ?? '');
  }

  _typeTagline(text) {
    // Cancel any previous typing animation
    if (this._typeTimeout) clearTimeout(this._typeTimeout);
    this._typeTimeout = null;

    let i = 0;
    const el = this._briefingTagline;
    el.textContent = '';

    const type = () => {
      if (i >= text.length) return;
      el.textContent += text[i];
      const ch = text[i];
      i++;
      // Pause longer after sentence-ending punctuation
      const delay = (ch === '.' || ch === '!' || ch === '?') ? 480
                  : (ch === ',')                              ? 120
                  : 34;
      this._typeTimeout = setTimeout(type, delay);
    };
    type();
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
    if (this._accessibilitySettings.reducedMotion) {
      this.camera.position.set(0, 10, 24);
      this.camera.lookAt(0, 1, -4);
      return;
    }

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
