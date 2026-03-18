import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { Player } from './Player.js';
import { DebrisManager } from './DebrisManager.js';
import { SpecialDebrisManager } from './SpecialDebrisManager.js';
import { RecycleDebrisManager } from './RecycleDebrisManager.js';
import { ProjectileManager } from './ProjectileManager.js';
import { LevelManager, unlockLevel } from './LevelManager.js';
import { InputHandler } from './InputHandler.js';
import { HUD } from './HUD.js';
import { Starfield } from './Starfield.js';
import { AsteroidField } from './AsteroidField.js';
import { soundtrackManager } from './AudioManager.js';

// Reusable vectors for camera follow
// Offset: higher + further back so ship sits in the lower portion of the screen
const _camOffset = new THREE.Vector3(0, 6, 22);
const _camTarget = new THREE.Vector3();
const _camLookTarget = new THREE.Vector3();
const _shipForward = new THREE.Vector3();
const _cameraForward = new THREE.Vector3();
const _cameraDown = new THREE.Vector3();
const _segment = new THREE.Vector3();
const _toCenter = new THREE.Vector3();
const _closestPoint = new THREE.Vector3();
const _collisionNormal = new THREE.Vector3();
const _velocityNormal = new THREE.Vector3();
const _velocityTangent = new THREE.Vector3();
const _boxMin = new THREE.Vector3();
const _boxMax = new THREE.Vector3();
const _aimRay = new THREE.Ray();
const _aimDirection = new THREE.Vector3();
const _aimPoint = new THREE.Vector3();
const _aimOffset = new THREE.Vector3();
const _toDebris = new THREE.Vector3();
const _targetOffset = new THREE.Vector3();
const _targetScreenPos = new THREE.Vector3();
const _bossDesiredPos = new THREE.Vector3();
const _bossMoveDelta = new THREE.Vector3();
const _bossRight = new THREE.Vector3();
const _bossUp = new THREE.Vector3();
const _bossAim = new THREE.Vector3();
const _bossMuzzle = new THREE.Vector3();
const _bossOrbitA = new THREE.Vector3();
const _worldUp = new THREE.Vector3(0, 1, 0);
const _muzzleBurstLocal = new THREE.Vector3(0, 0.2, -1.5);
const _debrisAway = new THREE.Vector3();
const _popupScreenPos = new THREE.Vector3();
const PLAYER_COLLISION_RADIUS = 1.1;
const ASTEROID_BOUNCE = 0.35;
const ASTEROID_SURFACE_FRICTION = 0.92;
const PLAYER_HIT_COOLDOWN = 1.0;
const PROJECTILE_HIT_PADDING = 0.45;
const AIM_FALLBACK_DISTANCE = 800;
const AIM_LOWERING = 0.035;
const MIN_AIM_DISTANCE = 1.0; // ignore intersections closer than this to the camera
const BOOST_DRAIN_RATE = 0.38;
const BOOST_RECHARGE_RATE = 0.2;
const PLAYER_SENSITIVITY_STORAGE_KEY = 'trashteroid_mouse_sensitivity';
const ACCESSIBILITY_SETTINGS_STORAGE_KEY = 'trashteroid_accessibility_settings';
const DEFAULT_ACCESSIBILITY_SETTINGS = Object.freeze({
  reducedMotion: false,
  reducedFlashing: false,
  musicVisualizer: false,
});
const DISPLAY_DISTANCE_SCALE = 0.45;
const TUTORIAL_TIME_SCALE = 1.0;
const TUTORIAL_BEAT_TRANSITION_DELAY = 0.38;
const TUTORIAL_OBJECTIVES_HINT_DURATION = 3.2;
const TRASHTEROID_APPROACH_DISTANCE_WORLD = 15000 / DISPLAY_DISTANCE_SCALE;
const TRASHTEROID_HIT_RADIUS = 72;
const TRASHTEROID_SURFACE_OFFSET = 58;
const TRASHTEROID_SCORE_PER_HIT = 35;
const TRASHTEROID_SCORE_ON_DESTROY = 5000;
const WRONG_BEAM_PENALTY = 2000;
const LEVEL_ENTRY_FADE_HOLD_MS = 280;
const LEVEL_ENTRY_FADE_MS = 420;
const TUTORIAL_BEATS = {
  move: {
    title: 'Move & Look',
    message: 'Move the mouse to look around. Hold W to fly forward.',
    placement: 'center',
    requirements: [
      { id: 'look', label: 'Look around with the mouse' },
      { id: 'thrust', label: 'Hold W to fly forward' },
    ],
  },
  roll: {
    title: 'Roll',
    message: 'Press A or D to roll your ship to the side.',
    placement: 'center',
    requirements: [
      { id: 'roll', label: 'Press A or D to roll' },
    ],
  },
  boost: {
    title: 'Boost',
    message: 'Hold Space while flying forward to boost. Use it wisely — it drains while active, and recharges when not in use.',
    placement: 'center',
    requirements: [
      { id: 'boost', label: 'Hold Space while moving forward' },
    ],
  },
  fire: {
    title: 'Vaporizer',
    message: 'Hold left click to fire the Vaporizer beam at regular trash!',
    placement: 'center',
    requirements: [
      { id: 'fire', label: 'Hold left click to fire the Vaporizer' },
      { id: 'trash', label: 'Destroy a piece of trash' },
    ],
  },
  special: {
    title: 'Special Trash',
    message: 'Yellow-outlined debris gives a huge bonus — use the Vaporizer (left click) to destroy it!',
    placement: 'center',
    requirements: [
      { id: 'special-trash', label: 'Destroy 1 special piece of trash' },
    ],
  },
  recycle: {
    title: 'Recycle Beam',
    message: 'Cyan-outlined bins are recyclable — don\'t vaporize them! Hold Shift to fire the Recycle Beam and collect them for points.',
    placement: 'center',
    requirements: [
      { id: 'recycle-fire', label: 'Hold Shift to fire the Recycle Beam' },
      { id: 'recycle-trash', label: 'Collect 1 recyclable with the Recycle Beam' },
    ],
  },
  objectives: {
    title: 'Objectives',
    message: 'Look at the top-left to view your objectives. That\'s it for the tutorial... you\'re on your own now!.',
    placement: 'center',
  },
};

function toWorldSpeed(displaySpeed) {
  return displaySpeed / DISPLAY_DISTANCE_SCALE;
}

function toWorldDistance(displayDistance) {
  return displayDistance / DISPLAY_DISTANCE_SCALE;
}

function toDisplayDistance(worldDistance) {
  return Math.max(0, Math.round(worldDistance * DISPLAY_DISTANCE_SCALE));
}

export class Game {
  constructor(canvas, startLevel = 1, options = {}) {
    this.canvas = canvas;
    this.running = false;
    this._elapsed = 0;
    this.score = 0;
    this.lives = 100;
    this.playerHitCooldown = 0;
    this.boostCharge = 1;
    this.boostActive = false;
    this.paused = false;
    this.shotsFired = 0;
    this.trashHits = 0;
    this._pauseUnlockArmed = false;
    this._startLevel = startLevel;
    this._tutorialMode = this._startLevel === 1 && !!options.tutorialMode;
    this._onReturnToLevelSelect = options.onReturnToLevelSelect ?? null;
    this._returnToLevelSelectTimeout = null;
    this._screenFadeEl = document.getElementById('screen-fade');
    this._levelEntryFadeToken = 0;
    this._levelEntryFadeHoldTimeout = null;
    this._levelEntryFadeSafetyTimeout = null;
    this._timeScale = 1;
    this._tutorial = this._createTutorialState();
    this._handleLevelNextClick = () => this._onLevelNext();
    this._handleLevelRetryClick = () => this._onLevelRetry();
    this._handleWindowResize = () => this._onResize();
    this._handlePauseResumeClick = () => this._resumeGame();
    this._handlePauseRestartClick = () => this._exitToMenu();
    this._handlePauseSensitivityInput = (event) => {
      const displayValue = Number(event.currentTarget.value);
      this._setMouseSensitivity(displayValue / 1000, true);
    };

    // Level objectives & timer
    this._levelTimer = 0;
    this._levelTimerRunning = false;
    this._trashDestroyedRequired = 0;
    this._recycleCollectedRequired = 0;
    this._trashDestroyedFast = 0;
    this._bonusFastThresholdWorld = toWorldSpeed(200);
    this._levelComplete = false;
    this.clock = new THREE.Clock();
    this.crosshair = document.getElementById('crosshair');

    // Camera follow smoothing: use a framerate-independent follow speed (higher = tighter)
    this.cameraFollowSpeed = 18.0;

    // Renderer
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0x000011);
    // Enable shadows
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    // Scene
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x000011, 0.000001);
    //change fog here 0 is no fog

    // Camera — extend far plane for distant planet
    this.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 10, 200000);
    this.camera.position.set(0, 3, 20);

    // Lighting — replace generic directional with a sun
    // AMBIENT_INTENSITY: controls overall scene brightness (0 = dark, 2 = bright)
    const AMBIENT_INTENSITY = 0.2;
    const ambient = new THREE.AmbientLight(0xffffff, AMBIENT_INTENSITY);
    this.scene.add(ambient);

    // Subtle hemisphere fill to give shadowed sides some color/blend
    const hemi = new THREE.HemisphereLight(0x666688, 0x111122, 0.12);
    this.scene.add(hemi);

    // Sun — a warm directional light from far away, locked in the background
    this.sunLight = new THREE.DirectionalLight(0xfff5e0, 2);
    this.sunLight.position.set(2000, 1000, -3000);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.set(2048, 2048);
    this.sunLight.shadow.camera.near = 0.5;
    this.sunLight.shadow.camera.far = 20000;
    const d = 4000;
    this.sunLight.shadow.camera.left = -d;
    this.sunLight.shadow.camera.right = d;
    this.sunLight.shadow.camera.top = d;
    this.sunLight.shadow.camera.bottom = -d;
    this.sunLight.shadow.bias = -0.0001;
    this.sunLight.target.position.set(0, 0, 0);
    this.scene.add(this.sunLight);
    this.scene.add(this.sunLight.target);

    // Small visible sun sphere (emissive, no shadows needed)
    const sunGeo = new THREE.SphereGeometry(300, 32, 32);
    const sunMat = new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false });
    this.sunMesh = new THREE.Mesh(sunGeo, sunMat);
    this.sunMesh.position.copy(this.sunLight.position);
    this.scene.add(this.sunMesh);

    // Sun glow sprite — same radial-gradient technique as asteroid glows
    const sunGlowCanvas = document.createElement('canvas');
    sunGlowCanvas.width = sunGlowCanvas.height = 512;
    const sgCtx = sunGlowCanvas.getContext('2d');
    const sgHalf = 256;
    const sgGrad = sgCtx.createRadialGradient(sgHalf, sgHalf, 0, sgHalf, sgHalf, sgHalf);
    sgGrad.addColorStop(0, 'rgba(255, 248, 200, 0.95)');
    sgGrad.addColorStop(0.18, 'rgba(255, 220, 100, 0.75)');
    sgGrad.addColorStop(0.45, 'rgba(255, 160,  40, 0.35)');
    sgGrad.addColorStop(0.72, 'rgba(220, 100,  20, 0.10)');
    sgGrad.addColorStop(1, 'rgba(180,  60,   0, 0)');
    sgCtx.fillStyle = sgGrad;
    sgCtx.fillRect(0, 0, 512, 512);
    const sunGlowTex = new THREE.CanvasTexture(sunGlowCanvas);
    const sunGlowMat = new THREE.SpriteMaterial({
      map: sunGlowTex,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
      fog: false,
    });
    this.sunGlowSprite = new THREE.Sprite(sunGlowMat);
    this.sunGlowSprite.scale.setScalar(700);  // base halo size
    this.sunGlowSprite.position.copy(this.sunLight.position);
    this.scene.add(this.sunGlowSprite);

    // Neon-style point lights for arcade feel
    const neonCyan = new THREE.PointLight(0x00ffff, 1.5, 60);
    neonCyan.position.set(-10, 5, -10);
    this.scene.add(neonCyan);

    const neonMagenta = new THREE.PointLight(0xff00ff, 1.0, 60);
    neonMagenta.position.set(10, 5, -10);
    this.scene.add(neonMagenta);

    // Subsystems
    this.input = new InputHandler();
    this.input.requestPointerLock(canvas);
    this.player = new Player(this.scene);
    this._prevPlayerPos = this.player.mesh.position.clone();
    this.debris = new DebrisManager(this.scene);
    this.specialDebris = new SpecialDebrisManager(this.scene);
    this.recycleDebris = new RecycleDebrisManager(this.scene);
    this.projectiles = new ProjectileManager(this.scene);
    this.levels = new LevelManager();
    this.hud = new HUD();
    this._accessibilitySettings = this._getAccessibilitySettings();
    this.hud.hideTutorialCallout();
    this.hud.setBossBarVisible(false);
    this.hud.updateBossIndicator(false, 0, 0, 0, 0);
    this.hud.setAccessibilitySettings(this._accessibilitySettings);
    this.starfield = new Starfield(this.scene);
    this._applySavedSensitivity();
    this._bindPauseControls();
    this._refreshPauseMenu();

    // Effects: transient particle systems and screen-space popups
    this._effectGroup = new THREE.Group();
    this.scene.add(this._effectGroup);
    // Shared particle texture for explosions/muzzles
    this._particleTexture = new THREE.TextureLoader().load('fireparticle.png');
    this._sparks = [];
    this._popups = [];
    this._muzzles = [];
    this._enemyProjectiles = [];
    this._enemyTrashProjectileGeometries = [
      new THREE.BoxGeometry(1.25, 0.95, 1.6),
      new THREE.CylinderGeometry(0.45, 0.7, 1.45, 9),
      new THREE.ConeGeometry(0.72, 1.75, 7),
      new THREE.DodecahedronGeometry(0.92, 0),
      new THREE.TorusGeometry(0.74, 0.24, 8, 14),
      new THREE.SphereGeometry(0.92, 10, 10),
    ];
    this._trashteroid = this._createTrashteroid();

    // Large decorative asteroid field around the player zone
    this.asteroidField = new AsteroidField(this.scene);

    // Planet — large Earth in the background, unreachable
    // this._loadPlanet();

    // Level complete screen
    this._levelCompleteEl = document.getElementById('level-complete-screen');
    document.getElementById('level-next-btn')?.addEventListener('click', this._handleLevelNextClick);
    document.getElementById('level-retry-btn')?.addEventListener('click', this._handleLevelRetryClick);

    // Handle resize
    window.addEventListener('resize', this._handleWindowResize);
  }

  start() {
    if (this.running) return;
    soundtrackManager.start();
    this.running = true;
    this.clock.start();
    this._resetTutorialState();
    this._enterLevel(this._startLevel, { resetPlayerPosition: true });
    this._loop();
  }

  dispose() {
    this.running = false;
    this.paused = true;
    this.boostActive = false;
    this._cancelLevelEntryFade();
    this._clearScheduledReturnToLevelSelect();
    this.projectiles.clear();
    this.debris.clear();
    this.specialDebris.clear();
    this.recycleDebris.clear();
    this._clearTrashteroidProjectiles();
    this._clearTransientEffects();
    this.input?.dispose?.();
    window.removeEventListener('resize', this._handleWindowResize);
    document.getElementById('level-next-btn')?.removeEventListener('click', this._handleLevelNextClick);
    document.getElementById('level-retry-btn')?.removeEventListener('click', this._handleLevelRetryClick);
    this.hud.pauseResumeBtn?.removeEventListener('click', this._handlePauseResumeClick);
    this.hud.pauseRestartBtn?.removeEventListener('click', this._handlePauseRestartClick);
    this.hud.pauseSensitivityInput?.removeEventListener('input', this._handlePauseSensitivityInput);
    this.hud.setPauseVisible(false);
    this.hud.setGameplayVisible(false);
    this.hud.hideTutorialCallout();
    this.hud.updateBossIndicator(false, 0, 0, 0, 0);
    this.hud.setBossBarVisible(false);
    this._levelCompleteEl?.classList.add('hidden');
    this.hud.overlay?.classList.add('hidden');
    if (document.pointerLockElement === this.canvas) {
      document.exitPointerLock();
    }
    this.renderer.dispose();
  }

  _applySavedSensitivity() {
    let savedSensitivity = this.player.mouseSensitivity;

    try {
      const rawValue = window.localStorage.getItem(PLAYER_SENSITIVITY_STORAGE_KEY);
      const parsed = rawValue == null ? NaN : Number(rawValue);
      if (Number.isFinite(parsed)) {
        savedSensitivity = THREE.MathUtils.clamp(parsed, 0.008, 0.06);
      }
    } catch (error) {
      // Ignore storage failures and keep the in-memory default.
    }

    this.player.mouseSensitivity = savedSensitivity;
  }

  _getAccessibilitySettings() {
    try {
      const rawValue = window.localStorage.getItem(ACCESSIBILITY_SETTINGS_STORAGE_KEY);
      if (!rawValue) {
        return { ...DEFAULT_ACCESSIBILITY_SETTINGS };
      }

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

  _bindPauseControls() {
    if (this.hud.pauseResumeBtn) {
      this.hud.pauseResumeBtn.addEventListener('click', this._handlePauseResumeClick);
    }

    if (this.hud.pauseRestartBtn) {
      this.hud.pauseRestartBtn.addEventListener('click', this._handlePauseRestartClick);
    }

    if (this.hud.pauseSensitivityInput) {
      this.hud.pauseSensitivityInput.addEventListener('input', this._handlePauseSensitivityInput);
    }
  }

  _setMouseSensitivity(value, persist = false) {
    const clamped = THREE.MathUtils.clamp(value, 0.008, 0.06);
    this.player.mouseSensitivity = clamped;
    this.hud.setPauseSensitivity(clamped);

    if (!persist) return;

    try {
      window.localStorage.setItem(PLAYER_SENSITIVITY_STORAGE_KEY, `${clamped}`);
    } catch (error) {
      // Ignore storage failures and keep the updated runtime value.
    }
  }

  _refreshPauseMenu() {
    this.hud.setPauseSensitivity(this.player.mouseSensitivity);
    this.hud.updatePauseStats(this.shotsFired, this.trashHits);
  }

  _isReducedFlashing() {
    return !!this._accessibilitySettings?.reducedFlashing;
  }

  _clearScheduledReturnToLevelSelect() {
    if (this._returnToLevelSelectTimeout == null) return;
    window.clearTimeout(this._returnToLevelSelectTimeout);
    this._returnToLevelSelectTimeout = null;
  }

  _cancelLevelEntryFade() {
    if (this._levelEntryFadeHoldTimeout != null) {
      window.clearTimeout(this._levelEntryFadeHoldTimeout);
      this._levelEntryFadeHoldTimeout = null;
    }
    if (this._levelEntryFadeSafetyTimeout != null) {
      window.clearTimeout(this._levelEntryFadeSafetyTimeout);
      this._levelEntryFadeSafetyTimeout = null;
    }
  }

  _showLevelEntryFade() {
    if (!this._screenFadeEl) return;

    this._cancelLevelEntryFade();
    this._levelEntryFadeToken += 1;
    const token = this._levelEntryFadeToken;

    this._screenFadeEl.classList.remove('hidden');
    this._screenFadeEl.classList.add('visible');

    // Hold the blackout briefly so newly-entered level textures can upload.
    this._levelEntryFadeHoldTimeout = window.setTimeout(() => {
      this._levelEntryFadeHoldTimeout = null;
      if (token !== this._levelEntryFadeToken) return;

      requestAnimationFrame(() => {
        if (token !== this._levelEntryFadeToken) return;

        this._screenFadeEl.classList.remove('visible');

        const finish = () => {
          if (token !== this._levelEntryFadeToken) return;
          if (this._levelEntryFadeSafetyTimeout != null) {
            window.clearTimeout(this._levelEntryFadeSafetyTimeout);
            this._levelEntryFadeSafetyTimeout = null;
          }
          this._screenFadeEl.classList.add('hidden');
        };

        this._screenFadeEl.addEventListener('transitionend', finish, { once: true });
        this._levelEntryFadeSafetyTimeout = window.setTimeout(finish, LEVEL_ENTRY_FADE_MS + 100);
      });
    }, LEVEL_ENTRY_FADE_HOLD_MS);
  }

  _scheduleReturnToLevelSelect(delayMs = 2200, payload = {}) {
    if (typeof this._onReturnToLevelSelect !== 'function') return;
    this._clearScheduledReturnToLevelSelect();
    this._returnToLevelSelectTimeout = window.setTimeout(() => {
      this._returnToLevelSelectTimeout = null;
      this._onReturnToLevelSelect({
        level: this.levels.current,
        ...payload,
      });
    }, delayMs);
  }

  _clearTransientEffects() {
    for (let i = this._sparks.length - 1; i >= 0; i--) {
      const effect = this._sparks[i];
      this._effectGroup.remove(effect.mesh);
      effect.mesh.geometry?.dispose?.();
      effect.mesh.material?.dispose?.();
    }
    this._sparks.length = 0;

    for (let i = this._popups.length - 1; i >= 0; i--) {
      this._popups[i].el.remove();
    }
    this._popups.length = 0;

    for (let i = this._muzzles.length - 1; i >= 0; i--) {
      const muzzle = this._muzzles[i];
      if (muzzle.mesh.parent) {
        muzzle.mesh.parent.remove(muzzle.mesh);
      }
      muzzle.mesh.geometry?.dispose?.();
      muzzle.mesh.material?.dispose?.();
    }
    this._muzzles.length = 0;
  }

  _createTrashteroid() {
    const group = new THREE.Group();
    group.name = 'Trashteroid';
    group.visible = false;
    group.frustumCulled = false;

    const fallbackShell = new THREE.Mesh(
      new THREE.IcosahedronGeometry(52, 1),
      new THREE.MeshStandardMaterial({
        color: 0x58616f,
        roughness: 0.96,
        metalness: 0.12,
        emissive: 0x10151d,
        emissiveIntensity: 0.42,
      })
    );
    fallbackShell.frustumCulled = false;
    group.add(fallbackShell);

    const modelRoot = new THREE.Group();
    modelRoot.name = 'TrashteroidModel';
    group.add(modelRoot);
    this._loadTrashteroidModel(modelRoot, fallbackShell);

    const coreGlow = new THREE.Mesh(
      new THREE.SphereGeometry(30, 18, 18),
      new THREE.MeshBasicMaterial({
        color: 0xff6e42,
        transparent: true,
        opacity: 0.2,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    coreGlow.frustumCulled = false;
    group.add(coreGlow);

    const orbitDebris = [];
    const debrisGeometries = [
      new THREE.BoxGeometry(8, 5, 7),
      new THREE.BoxGeometry(5, 7, 4),
      new THREE.CylinderGeometry(2.4, 3.2, 7, 8),
      new THREE.ConeGeometry(3.2, 8, 6),
      new THREE.TorusGeometry(3.6, 1.0, 8, 12),
      new THREE.DodecahedronGeometry(3.2, 0),
    ];

    for (let i = 0; i < 26; i++) {
      const mesh = new THREE.Mesh(
        debrisGeometries[i % debrisGeometries.length],
        new THREE.MeshStandardMaterial({
          color: [0x665c4a, 0x5f6772, 0x6f726a, 0x5d6b57, 0x725a50][i % 5],
          roughness: 0.9,
          metalness: 0.15,
          emissive: 0x111317,
          emissiveIntensity: 0.2,
        })
      );
      mesh.scale.setScalar(2.0 + Math.random() * 1.2);
      mesh.frustumCulled = false;
      mesh.castShadow = true;
      mesh.receiveShadow = false;
      group.add(mesh);

      _targetOffset
        .set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5)
        .normalize();
      const axisRef = Math.abs(_targetOffset.dot(_worldUp)) > 0.92
        ? _bossOrbitA.set(1, 0, 0)
        : _worldUp;

      const tangentA = new THREE.Vector3().crossVectors(_targetOffset, axisRef).normalize();
      const tangentB = new THREE.Vector3().crossVectors(_targetOffset, tangentA).normalize();

      orbitDebris.push({
        mesh,
        tangentA,
        tangentB,
        radius: 62 + Math.random() * 18,
        speed: 0.04 + Math.random() * 0.1,
        phase: Math.random() * Math.PI * 2,
        wobble: 0.3 + Math.random() * 0.7,
        spin: new THREE.Vector3(
          (Math.random() - 0.5) * 0.25,
          (Math.random() - 0.5) * 0.25,
          (Math.random() - 0.5) * 0.25
        ),
        worldPosition: new THREE.Vector3(),
      });
    }

    this.scene.add(group);

    return {
      group,
      shell: fallbackShell,
      modelRoot,
      glow: coreGlow,
      orbitDebris,
      anchor: new THREE.Vector3(),
      prevPosition: new THREE.Vector3(),
      velocity: new THREE.Vector3(),
      health: 1,
      maxHealth: 1,
      hitRadius: TRASHTEROID_HIT_RADIUS,
      collisionRadius: TRASHTEROID_HIT_RADIUS - 6,
      active: false,
      mode: 'approach',
      time: 0,
      shotCooldown: 0,
    };
  }

  _loadTrashteroidModel(targetRoot, fallbackShell) {
    const loader = new GLTFLoader();
    loader.load(
      '/models/roid.glb',
      (gltf) => {
        const model = gltf.scene;

        model.traverse((child) => {
          child.frustumCulled = false;
          if (!child.isMesh) return;
          child.castShadow = true;
          child.receiveShadow = true;

          const materials = Array.isArray(child.material) ? child.material : [child.material];
          for (let i = 0; i < materials.length; i++) {
            const material = materials[i];
            if (!material) continue;
            if ('roughness' in material) {
              material.roughness = THREE.MathUtils.clamp((material.roughness ?? 0.7) + 0.16, 0, 1);
            }
            if ('metalness' in material) {
              material.metalness = THREE.MathUtils.clamp((material.metalness ?? 0.1) + 0.08, 0, 1);
            }
            if ('emissive' in material && material.emissive) {
              material.emissive.setHex(0x171b22);
              material.emissiveIntensity = 0.24;
            }
          }
        });

        const bbox = new THREE.Box3().setFromObject(model);
        const center = new THREE.Vector3();
        const size = new THREE.Vector3();
        bbox.getCenter(center);
        bbox.getSize(size);
        model.position.sub(center);

        const maxAxis = Math.max(size.x, size.y, size.z, 0.001);
        const desiredDiameter = 112;
        const scale = desiredDiameter / maxAxis;
        model.scale.setScalar(scale);

        targetRoot.clear();
        targetRoot.add(model);
        this._disableTrashteroidFrustumCulling();

        if (fallbackShell?.parent) {
          fallbackShell.parent.remove(fallbackShell);
          fallbackShell.geometry?.dispose?.();
          fallbackShell.material?.dispose?.();
        }
      },
      undefined,
      () => {
        // Keep fallback shell if model fails to load.
      }
    );
  }

  _disableTrashteroidFrustumCulling() {
    const trashteroid = this._trashteroid;
    const group = trashteroid?.group;
    if (!group) return;

    group.traverse((child) => {
      child.frustumCulled = false;
    });
  }

  _updateTrashteroidOrbitDebris(trashteroid, bossConfig, delta) {
    const orbitDebris = trashteroid?.orbitDebris;
    if (!orbitDebris?.length) return;

    const orbitScale = bossConfig ? 1.2 : 0.92;
    const wobbleScale = bossConfig ? 9 : 5;

    for (let i = 0; i < orbitDebris.length; i++) {
      const orbiter = orbitDebris[i];
      const angle = orbiter.phase + trashteroid.time * orbiter.speed;
      const localRadius = orbiter.radius * orbitScale + Math.sin(angle * (0.6 + orbiter.wobble)) * wobbleScale;

      _targetOffset
        .copy(orbiter.tangentA)
        .multiplyScalar(Math.cos(angle) * localRadius)
        .addScaledVector(orbiter.tangentB, Math.sin(angle) * localRadius);

      orbiter.mesh.position.copy(_targetOffset);
      orbiter.mesh.rotation.x += orbiter.spin.x * delta;
      orbiter.mesh.rotation.y += orbiter.spin.y * delta;
      orbiter.mesh.rotation.z += orbiter.spin.z * delta;
      orbiter.mesh.getWorldPosition(orbiter.worldPosition);
    }
  }

  _resetPlayerState(resetPosition = false) {
    this.player.velocity.set(0, 0, 0);
    this.player.currentRoll = 0;
    this.player.manualRollInput = 0;
    this.player.turnInputYaw = 0;
    this.player.turnInputPitch = 0;
    this.player.yawRate = 0;
    this.player.pitchRate = 0;
    this.playerHitCooldown = 0;
    this.boostCharge = 1;
    this.boostActive = false;

    if (resetPosition) {
      this.player.mesh.position.set(0, 0, 10);
      this.player.baseQuaternion.identity();
    }

    this.player.mesh.quaternion.copy(this.player.baseQuaternion);
    this._prevPlayerPos.copy(this.player.mesh.position);
  }

  _enterLevel(levelNumber, { resetPlayerPosition = false, resetRunStats = false } = {}) {
    const levelConfig = this.levels.getConfig(levelNumber);
    const mission = levelConfig.mission ?? {};
    const fastSpeedDisplay = mission.bonus?.fastSpeedDisplay ?? 200;

    this._clearScheduledReturnToLevelSelect();
    this._levelCompleteEl?.classList.add('hidden');
    this.levels.setLevel(levelNumber);
    this._resetTutorialState();
    this.paused = false;
    this._levelComplete = false;
    this._levelTimer = levelConfig.timer ?? 0;
    this._levelTimerRunning = this._levelTimer > 0 && !this._isTutorialActiveForCurrentLevel();
    this._trashDestroyedRequired = 0;
    this._recycleCollectedRequired = 0;
    this._trashDestroyedFast = 0;
    this._bonusFastThresholdWorld = toWorldSpeed(fastSpeedDisplay);

    if (resetRunStats) {
      this.score = 0;
      this.lives = 100;
      this.shotsFired = 0;
      this.trashHits = 0;
    }

    this.projectiles.clear();
    this.debris.clear();
    this.specialDebris.clear();
    this.recycleDebris.clear();
    this._clearTransientEffects();
    this._resetPlayerState(resetPlayerPosition);
    this._configureTrashteroidForLevel(levelConfig);
    this.hud.setGameplayVisible(true);
    this.hud.setBossBarVisible(!!levelConfig.boss);
    this.hud.updateBossIndicator(false, 0, 0, 0, 0);
    this.score = Math.max(0, this.score);
    this.hud.update(this.score, this.levels.current, this.lives);
    this.hud.updateTimer(this._levelTimer);
    this.hud.updateObjectives(this._getMissionObjectiveState(false).objectives);
    this._refreshPauseMenu();
    this._showLevelEntryFade();
  }

  _configureTrashteroidForLevel(levelConfig) {
    const primary = levelConfig.mission?.primary ?? {};
    const bossConfig = levelConfig.boss ?? null;
    const trashteroid = this._trashteroid;

    this._clearTrashteroidProjectiles();

    if (!primary.reachTrashteroid && !primary.destroyTrashteroid) {
      trashteroid.active = false;
      trashteroid.group.visible = false;
      this.hud.setBossBarVisible(false);
      return;
    }

    _shipForward.set(0, 0, -1).applyQuaternion(this.player.baseQuaternion).normalize();
    const startDistance = bossConfig?.startDistance ?? TRASHTEROID_APPROACH_DISTANCE_WORLD;

    trashteroid.group.position.copy(this.player.mesh.position).addScaledVector(_shipForward, startDistance);
    trashteroid.anchor.copy(trashteroid.group.position);
    trashteroid.prevPosition.copy(trashteroid.group.position);
    trashteroid.group.rotation.set(0, 0, 0);
    trashteroid.health = bossConfig?.maxHealth ?? 1;
    trashteroid.maxHealth = bossConfig?.maxHealth ?? 1;
    trashteroid.active = true;
    trashteroid.mode = bossConfig ? 'boss' : 'approach';
    trashteroid.time = 0;
    trashteroid.shotCooldown = bossConfig ? bossConfig.shotInterval * 0.8 : 0;
    trashteroid.group.visible = true;
    this._disableTrashteroidFrustumCulling();

    if (bossConfig) {
      const bossScale = bossConfig.bossScale ?? 5;
      trashteroid.group.scale.setScalar(bossScale);
      trashteroid.hitRadius = TRASHTEROID_HIT_RADIUS * bossScale;
      trashteroid.collisionRadius = (bossConfig.collisionRadius ?? (TRASHTEROID_HIT_RADIUS - 6)) * bossScale;
      trashteroid.surfaceOffset = TRASHTEROID_SURFACE_OFFSET * bossScale;
      // Start the trashteroid already moving towards Earth
      _bossMoveDelta.set(-1200, -600, -3500).normalize();
      trashteroid.velocity.copy(_bossMoveDelta).multiplyScalar(
        toWorldSpeed(150)
      );
      this.hud.updateBossBar(trashteroid.health, trashteroid.maxHealth);
    } else {
      trashteroid.group.scale.setScalar(1);
      trashteroid.hitRadius = TRASHTEROID_HIT_RADIUS;
      trashteroid.collisionRadius = TRASHTEROID_HIT_RADIUS - 6;
      trashteroid.surfaceOffset = TRASHTEROID_SURFACE_OFFSET;
      trashteroid.velocity.set(0, 0, 0);
    }
  }

  _clearTrashteroidProjectiles() {
    for (let i = this._enemyProjectiles.length - 1; i >= 0; i--) {
      this._despawnEnemyProjectile(i);
    }
  }

  _despawnEnemyProjectile(index) {
    const projectile = this._enemyProjectiles[index];
    if (!projectile) return;
    this.scene.remove(projectile.mesh);
    projectile.mesh.traverse?.((child) => {
      if (child.geometry) {
        child.geometry.dispose?.();
      }
      if (child.material) {
        const materials = Array.isArray(child.material) ? child.material : [child.material];
        for (let i = 0; i < materials.length; i++) {
          materials[i]?.dispose?.();
        }
      }
    });
    this._enemyProjectiles.splice(index, 1);
  }

  _spawnTrashteroidProjectile(origin, direction, speed, ttl) {
    const geometryTemplate = this._enemyTrashProjectileGeometries[
      Math.floor(Math.random() * this._enemyTrashProjectileGeometries.length)
    ];
    const geometry = geometryTemplate.clone();

    const trashColors = [0x72654f, 0x4f5a67, 0x656870, 0x6b4f44, 0x5f6d5a, 0x7a7366];
    const core = new THREE.Mesh(
      geometry,
      new THREE.MeshStandardMaterial({
        color: trashColors[Math.floor(Math.random() * trashColors.length)],
        roughness: 0.88,
        metalness: 0.18,
        emissive: 0x140607,
        emissiveIntensity: 0.36,
      })
    );

    const outline = new THREE.LineSegments(
      new THREE.EdgesGeometry(geometry, 20),
      new THREE.LineBasicMaterial({
        color: 0xff3030,
        transparent: true,
        opacity: this._isReducedFlashing() ? 0.65 : 0.95,
        depthTest: false,
      })
    );
    outline.renderOrder = 4;
    core.add(outline);

    const projectileGroup = new THREE.Group();
    projectileGroup.add(core);
    projectileGroup.position.copy(origin);
    const projectileScale = 11.0 + Math.random() * 6.0;
    projectileGroup.scale.setScalar(projectileScale);
    projectileGroup.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
    this.scene.add(projectileGroup);

    this._enemyProjectiles.push({
      mesh: projectileGroup,
      position: projectileGroup.position,
      prevPosition: projectileGroup.position.clone(),
      velocity: direction.clone().multiplyScalar(speed * (0.92 + Math.random() * 0.16)),
      hitRadius: projectileScale * 0.82,
      spin: new THREE.Vector3(
        (Math.random() - 0.5) * 0.35,
        (Math.random() - 0.5) * 0.35,
        (Math.random() - 0.5) * 0.35
      ),
      life: 0,
      ttl,
    });
  }

  _fireTrashteroidBurst(bossConfig) {
    const trashteroid = this._trashteroid;
    if (!trashteroid?.active) return;

    const projectileSpeed = Math.max(1, bossConfig.projectileSpeed ?? 1000);
    const distanceToPlayer = trashteroid.group.position.distanceTo(this.player.mesh.position);
    const leadTime = THREE.MathUtils.clamp((distanceToPlayer / projectileSpeed) * 0.95, 0.18, 1.18);

    _bossAim
      .copy(this.player.mesh.position)
      .addScaledVector(this.player.velocity, leadTime)
      .sub(trashteroid.group.position);

    if (_bossAim.lengthSq() === 0) return;
    _bossAim.normalize();

    _bossRight.crossVectors(_bossAim, _worldUp);
    if (_bossRight.lengthSq() < 1e-5) {
      _bossRight.set(1, 0, 0);
    }
    _bossRight.normalize();
    _bossUp.crossVectors(_bossRight, _bossAim).normalize();

    const surfaceOffset = trashteroid.surfaceOffset ?? TRASHTEROID_SURFACE_OFFSET;
    const burstCount = Math.max(3, bossConfig.projectileBurstCount ?? 5);
    const lateralSpreadScale = bossConfig.projectileSpreadScale ?? 0.024;
    const verticalSpreadScale = bossConfig.projectileVerticalSpreadScale ?? 0.014;
    const aimErrorScale = bossConfig.projectileAimError ?? 0.014;

    for (let i = 0; i < burstCount; i++) {
      const ratio = burstCount === 1 ? 0 : (i / (burstCount - 1)) * 2 - 1;
      _targetOffset
        .set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5)
        .normalize();

      if (_targetOffset.dot(_bossAim) < -0.12) {
        _targetOffset.addScaledVector(_bossAim, 0.9).normalize();
      }

      _bossMuzzle
        .copy(trashteroid.group.position)
        .addScaledVector(_targetOffset, surfaceOffset * (0.86 + Math.random() * 0.22));

      _debrisAway
        .copy(this.player.mesh.position)
        .addScaledVector(this.player.velocity, leadTime)
        .sub(_bossMuzzle);
      if (_debrisAway.lengthSq() < 1e-5) {
        _debrisAway.copy(_bossAim);
      }
      _debrisAway.normalize();

      const spreadDirection = _debrisAway
        .clone()
        .addScaledVector(_bossRight, ratio * lateralSpreadScale + (Math.random() - 0.5) * aimErrorScale)
        .addScaledVector(_bossUp, (Math.random() - 0.5) * verticalSpreadScale)
        .normalize();

      this._spawnTrashteroidProjectile(
        _bossMuzzle,
        spreadDirection,
        bossConfig.projectileSpeed,
        bossConfig.projectileLifetime
      );
      this._spawnSparks(_bossMuzzle.clone(), {
        count: 8,
        speed: 18,
        ttl: 0.24,
        color: 0xff8855,
        size: 1.2,
      });
    }
  }

  _updateTrashteroid(delta) {
    const trashteroid = this._trashteroid;
    if (!trashteroid?.active) return;

    const levelConfig = this.levels.getCurrentConfig();
    const bossConfig = levelConfig.boss ?? null;
    const prevX = trashteroid.group.position.x;
    const prevY = trashteroid.group.position.y;
    const prevZ = trashteroid.group.position.z;
    trashteroid.prevPosition.set(prevX, prevY, prevZ);

    trashteroid.time += delta;
    trashteroid.group.rotation.x += delta * 0.08;
    trashteroid.group.rotation.y += delta * 0.18;
    trashteroid.group.rotation.z += delta * 0.05;

    this._updateTrashteroidOrbitDebris(trashteroid, bossConfig, delta);
    if (trashteroid.glow) {
      const pulse = 1 + Math.sin(trashteroid.time * 2.8) * 0.08;
      trashteroid.glow.scale.setScalar(pulse);
      trashteroid.glow.material.opacity = bossConfig ? 0.24 : 0.18;
    }

    if (trashteroid.mode === 'approach' || !bossConfig) {
      trashteroid.group.position.copy(trashteroid.anchor);
      trashteroid.group.position.x += Math.sin(trashteroid.time * 0.22) * 40;
      trashteroid.group.position.y += Math.sin(trashteroid.time * 0.55 + 0.7) * 22;
      trashteroid.velocity.set(
        delta > 0 ? (trashteroid.group.position.x - prevX) / delta : 0,
        delta > 0 ? (trashteroid.group.position.y - prevY) / delta : 0,
        delta > 0 ? (trashteroid.group.position.z - prevZ) / delta : 0
      );
      return;
    }

    // Earth is kept at a fixed offset from the camera; use planet position when available
    if (this.planet) {
      _bossDesiredPos.copy(this.planet.position);
    } else {
      _bossDesiredPos.set(
        this.player.mesh.position.x - 1200,
        this.player.mesh.position.y - 600,
        this.player.mesh.position.z - 3500
      );
    }

    // Direction from trashteroid towards Earth
    _bossMoveDelta.copy(_bossDesiredPos).sub(trashteroid.group.position);
    const distToEarth = _bossMoveDelta.length();
    if (distToEarth > 1e-5) {
      _bossMoveDelta.multiplyScalar(1 / distToEarth);
    }

    // Desired velocity towards Earth; after asteroid bounces, steer back towards Earth
    const earthSpeed = bossConfig.earthSpeed != null
      ? toWorldSpeed(bossConfig.earthSpeed)
      : toWorldSpeed(220);
    const steerRate = bossConfig.steerRate ?? 2.5;
    _bossDesiredPos.copy(_bossMoveDelta).multiplyScalar(earthSpeed);
    trashteroid.velocity.lerp(_bossDesiredPos, 1 - Math.exp(-steerRate * delta));

    // Integrate position
    trashteroid.group.position.addScaledVector(trashteroid.velocity, delta);

    trashteroid.shotCooldown -= delta;
    if (trashteroid.shotCooldown <= 0) {
      this._fireTrashteroidBurst(bossConfig);
      trashteroid.shotCooldown = bossConfig.shotInterval * (0.8 + Math.random() * 0.35);
    }

    this.hud.updateBossBar(trashteroid.health, trashteroid.maxHealth);
  }

  _updateTrashteroidProjectiles(delta) {
    const bossConfig = this.levels.getCurrentConfig().boss;
    if (!bossConfig || !this._enemyProjectiles.length) return;

    for (let i = this._enemyProjectiles.length - 1; i >= 0; i--) {
      const projectile = this._enemyProjectiles[i];
      projectile.life += delta;
      projectile.prevPosition.copy(projectile.mesh.position);
      projectile.mesh.position.addScaledVector(projectile.velocity, delta);
      if (projectile.spin) {
        projectile.mesh.rotation.x += projectile.spin.x * delta;
        projectile.mesh.rotation.y += projectile.spin.y * delta;
        projectile.mesh.rotation.z += projectile.spin.z * delta;
      }

      const projectileHitRadius = projectile.hitRadius ?? 1.2;
      if (this._projectileHitsSphere(projectile, this.player.mesh.position, PLAYER_COLLISION_RADIUS + projectileHitRadius)) {
        this._spawnSparks(_closestPoint.clone(), {
          count: 18,
          speed: 20,
          ttl: 0.45,
          color: 0xff7a52,
          size: 1.5,
        });
        this._damagePlayer(bossConfig.projectileDamage);
        this._despawnEnemyProjectile(i);
        continue;
      }

      if (projectile.life >= projectile.ttl) {
        this._despawnEnemyProjectile(i);
      }
    }
  }

  _resolveTrashteroidAsteroidCollisions(asteroids, delta) {
    const trashteroid = this._trashteroid;
    if (!trashteroid?.active || !asteroids?.length) return;

    const collisionRadius = trashteroid.collisionRadius ?? (TRASHTEROID_HIT_RADIUS - 6);

    for (let i = 0; i < asteroids.length; i++) {
      const ast = asteroids[i];
      const sphere = ast.boundingSphere;
      const minDistance = collisionRadius + sphere.radius;

      _targetOffset.copy(trashteroid.group.position).sub(sphere.center);
      const distanceSq = _targetOffset.lengthSq();
      if (distanceSq >= minDistance * minDistance) continue;

      let distance = Math.sqrt(distanceSq);
      if (distance <= 1e-6) {
        _collisionNormal.copy(trashteroid.velocity);
        if (_collisionNormal.lengthSq() < 1e-6) {
          _collisionNormal.set(0, 0, 1).applyQuaternion(this.player.baseQuaternion);
        }
        _collisionNormal.normalize();
        distance = 0;
      } else {
        _collisionNormal.copy(_targetOffset).multiplyScalar(1 / distance);
      }

      // _collisionNormal points FROM asteroid TOWARD trashteroid.
      // Trashteroid has enormous mass — push the asteroid entirely, trashteroid barely moves.
      const overlap = minDistance - distance;
      ast.mesh.position.addScaledVector(_collisionNormal, -(overlap + 0.08));
      sphere.center.addScaledVector(_collisionNormal, -(overlap + 0.08));

      // Bounce the asteroid off the trashteroid as if it were an immovable wall.
      // relApproach > 0 means asteroid is closing in on the trashteroid.
      const relApproach = ast.velocity.dot(_collisionNormal) - trashteroid.velocity.dot(_collisionNormal);
      if (relApproach > 0) {
        ast.velocity.addScaledVector(_collisionNormal, -relApproach * (1 + ASTEROID_BOUNCE));
      }

      // Trashteroid barely deflects — 0.1% mass-ratio impulse
      const inwardSpeed = trashteroid.velocity.dot(_collisionNormal);
      if (inwardSpeed < 0) {
        trashteroid.velocity.addScaledVector(_collisionNormal, -inwardSpeed * 0.03);
      }
    }

    // Also push asteroids away from orbiting debris
    const ORBIT_HIT_RADIUS = 60;
    const orbitDebris = trashteroid.orbitDebris;
    if (orbitDebris?.length) {
      for (let j = 0; j < orbitDebris.length; j++) {
        const orbiter = orbitDebris[j];
        if (!orbiter.worldPosition) continue;
        for (let i = 0; i < asteroids.length; i++) {
          const ast = asteroids[i];
          const sphere = ast.boundingSphere;
          const minDist = ORBIT_HIT_RADIUS + sphere.radius;

          _targetOffset.copy(orbiter.worldPosition).sub(sphere.center);
          const distSq = _targetOffset.lengthSq();
          if (distSq >= minDist * minDist) continue;

          const dist = Math.sqrt(distSq);
          if (dist <= 1e-6) {
            _collisionNormal.set(0, 1, 0);
          } else {
            _collisionNormal.copy(_targetOffset).multiplyScalar(1 / dist);
          }

          const overlap = minDist - dist;
          ast.mesh.position.addScaledVector(_collisionNormal, -(overlap + 0.08));
          sphere.center.addScaledVector(_collisionNormal, -(overlap + 0.08));

          const relApproach = ast.velocity.dot(_collisionNormal);
          if (relApproach > 0) {
            ast.velocity.addScaledVector(_collisionNormal, -relApproach * (1 + ASTEROID_BOUNCE));
          }
        }
      }
    }
  }

  _checkTrashteroidPlayerCollisions(playerPos = this.player.mesh.position) {
    const trashteroid = this._trashteroid;
    if (!trashteroid?.active) return;

    const bossConfig = this.levels.getCurrentConfig().boss ?? null;
    const collisionRadius = trashteroid.collisionRadius ?? (TRASHTEROID_HIT_RADIUS - 6);
    const minDistance = PLAYER_COLLISION_RADIUS + collisionRadius;

    _collisionNormal.copy(playerPos).sub(trashteroid.group.position);
    const distanceSq = _collisionNormal.lengthSq();
    if (distanceSq >= minDistance * minDistance) return;

    let distance = Math.sqrt(distanceSq);
    if (distance === 0) {
      _collisionNormal.set(0, 0, 1).applyQuaternion(this.player.baseQuaternion);
      distance = 1;
    } else {
      _collisionNormal.multiplyScalar(1 / distance);
    }

    const overlap = minDistance - distance;
    playerPos.addScaledVector(_collisionNormal, overlap + 0.12);

    // Resolve velocity relative to the boss so contact feels like hitting a moving body.
    _velocityTangent.copy(this.player.velocity).sub(trashteroid.velocity);
    const relativeInwardSpeed = _velocityTangent.dot(_collisionNormal);

    if (relativeInwardSpeed < 0) {
      _velocityNormal.copy(_collisionNormal).multiplyScalar(relativeInwardSpeed);
      _velocityTangent.sub(_velocityNormal).multiplyScalar(0.88);
      this.player.velocity
        .copy(_velocityTangent)
        .add(trashteroid.velocity)
        .addScaledVector(_collisionNormal, -relativeInwardSpeed * 0.35 + 22);
    } else {
      this.player.velocity.addScaledVector(_collisionNormal, 22 + overlap * 8);
    }

    const baseDamage = bossConfig?.contactDamage ?? 16;
    const impactDamage = THREE.MathUtils.clamp(
      Math.round(baseDamage + Math.max(0, -relativeInwardSpeed) * 0.02),
      baseDamage,
      24
    );

    if (this._damagePlayer(impactDamage)) {
      _closestPoint.copy(_collisionNormal).multiplyScalar(collisionRadius).add(trashteroid.group.position);
      this._spawnSparks(_closestPoint.clone(), {
        count: 20,
        speed: 18,
        ttl: 0.4,
        color: 0xff8c55,
        size: 1.4,
      });
    }
  }

  _checkProjectileTrashteroidCollisions() {
    const trashteroid = this._trashteroid;
    if (!trashteroid?.active) return;

    const projectiles = this.projectiles.getActive();
    const bossConfig = this.levels.getCurrentConfig().boss ?? null;

    for (let i = projectiles.length - 1; i >= 0; i--) {
      if (!this._projectileHitsSphere(projectiles[i], trashteroid.group.position, trashteroid.hitRadius)) {
        continue;
      }

      const impactPoint = _closestPoint.clone();
      this.projectiles.remove(i);

      if (!bossConfig) {
        this._spawnSparks(impactPoint, {
          count: 18,
          speed: 20,
          ttl: 0.5,
          color: 0xffc66e,
          size: 1.35,
        });
        continue;
      }

      trashteroid.health = Math.max(0, trashteroid.health - 1);
      this.score += TRASHTEROID_SCORE_PER_HIT;
      this._spawnSparks(impactPoint, {
        count: 22,
        speed: 26,
        ttl: 0.55,
        color: 0xff8c55,
        size: 1.8,
      });
      this.hud.updateBossBar(trashteroid.health, trashteroid.maxHealth);

      if (trashteroid.health > 0) continue;

      this.score += TRASHTEROID_SCORE_ON_DESTROY;
      this._spawnExplosion(trashteroid.group.position.clone(), { count: 360, ttl: 2.5 });
      trashteroid.active = false;
      trashteroid.group.visible = false;
      this.hud.setBossBarVisible(false);
      this._clearTrashteroidProjectiles();
      this._finalizeLevel(true);
      break;
    }
  }

  _getMissionTargetPosition() {
    return this._trashteroid?.active ? this._trashteroid.group.position : null;
  }

  _updateMissionTargetIndicator() {
    const targetPos = this._getMissionTargetPosition();
    if (!targetPos) {
      this.hud.updateBossIndicator(false, 0, 0, 0, 0);
      return;
    }

    _targetScreenPos.copy(targetPos).project(this.camera);
    const centerX = window.innerWidth * 0.5;
    const centerY = window.innerHeight * 0.5;
    const radiusX = Math.max(120, window.innerWidth * 0.36);
    const radiusY = Math.max(90, window.innerHeight * 0.26);
    const projectedX = centerX + _targetScreenPos.x * centerX;
    const projectedY = centerY - _targetScreenPos.y * centerY;
    const inFront = _targetScreenPos.z > -1 && _targetScreenPos.z < 1;
    const ellipseNorm =
      ((projectedX - centerX) * (projectedX - centerX)) / (radiusX * radiusX) +
      ((projectedY - centerY) * (projectedY - centerY)) / (radiusY * radiusY);
    const insideEllipse = inFront && ellipseNorm <= 1;

    _targetOffset.copy(targetPos).sub(this.camera.position);
    _targetOffset.applyQuaternion(this.camera.quaternion.clone().invert());

    let angle = Math.atan2(_targetOffset.x, _targetOffset.y);
    if (_targetOffset.z > 0) {
      angle += Math.PI;
    }

    const x = insideEllipse ? projectedX : centerX + Math.sin(angle) * radiusX;
    const y = insideEllipse ? projectedY : centerY - Math.cos(angle) * radiusY;
    const distance = toDisplayDistance(targetPos.distanceTo(this.player.mesh.position));

    this.hud.updateBossIndicator(true, x, y, angle, Math.max(1, distance));
  }

  _getMissionObjectiveState(finalizeShield = false) {
    const levelConfig = this.levels.getCurrentConfig();
    const mission = levelConfig.mission ?? {};
    const primary = mission.primary ?? {};
    const bonus = mission.bonus ?? {};
    const objectives = [];
    let primaryComplete = true;

    if (primary.trashRequired) {
      const complete = this._trashDestroyedRequired >= primary.trashRequired;
      objectives.push({
        label: `Destroy ${primary.trashRequired} pieces of trash`,
        current: this._trashDestroyedRequired,
        target: primary.trashRequired,
        complete,
        bonus: false,
      });
      primaryComplete = primaryComplete && complete;
    }

    if (primary.recycleRequired) {
      const complete = this._recycleCollectedRequired >= primary.recycleRequired;
      objectives.push({
        label: `Collect ${primary.recycleRequired} recyclables`,
        current: this._recycleCollectedRequired,
        target: primary.recycleRequired,
        complete,
        bonus: false,
      });
      primaryComplete = primaryComplete && complete;
    }

    if (primary.reachTrashteroid) {
      const targetPos = this._getMissionTargetPosition();
      const reachDistanceDisplay = primary.reachDistanceDisplay ?? 60;
      const reachDistanceWorld = toWorldDistance(reachDistanceDisplay);
      const distanceDisplay = targetPos
        ? toDisplayDistance(targetPos.distanceTo(this.player.mesh.position))
        : reachDistanceDisplay;
      const reached = targetPos
        ? targetPos.distanceTo(this.player.mesh.position) <= reachDistanceWorld
        : false;

      objectives.push({
        label: reached
          ? 'Reach Trashteroid'
          : `Reach Trashteroid (${distanceDisplay} mi out)`,
        current: reached ? 1 : 0,
        target: 1,
        complete: reached,
        bonus: false,
      });
      primaryComplete = primaryComplete && reached;
    }

    if (primary.destroyTrashteroid) {
      const maxHealth = this._trashteroid?.maxHealth ?? 1;
      const remainingHealth = this._trashteroid?.health ?? 0;
      const destroyed = !this._trashteroid?.active || remainingHealth <= 0;
      objectives.push({
        label: 'Destroy Trashteroid',
        current: destroyed ? maxHealth : maxHealth - remainingHealth,
        target: maxHealth,
        complete: destroyed,
        bonus: false,
      });
      primaryComplete = primaryComplete && destroyed;
    }

    const fastRequired = bonus.fastTrashRequired ?? 0;
    const fastSpeedDisplay = bonus.fastSpeedDisplay ?? 0;
    const fastDone = fastRequired > 0 ? this._trashDestroyedFast >= fastRequired : false;
    if (fastRequired > 0 && fastSpeedDisplay > 0) {
      objectives.push({
        label: `Destroy ${fastRequired} trash while flying at ${fastSpeedDisplay}+ m/s`,
        current: this._trashDestroyedFast,
        target: fastRequired,
        complete: fastDone,
        bonus: true,
      });
    }

    const shieldThreshold = bonus.shieldThreshold;
    const shieldBonus = shieldThreshold != null ? this.lives > shieldThreshold : false;
    const shieldFailed = shieldThreshold != null ? this.lives <= shieldThreshold : false;
    if (shieldThreshold != null) {
      objectives.push({
        label: `Finish with over ${shieldThreshold}% shield`,
        current: 0,
        target: 1,
        complete: finalizeShield ? shieldBonus : false,
        failed: finalizeShield ? !shieldBonus : shieldFailed,
        bonus: true,
      });
    }

    return {
      objectives,
      primaryComplete,
      fastDone,
      shieldBonus,
    };
  }

  _finalizeLevel(primaryComplete) {
    if (this._levelComplete) return;

    const state = this._getMissionObjectiveState(true);
    this._levelComplete = true;
    this._levelTimerRunning = false;
    this.paused = true;
    this.boostActive = false;
    this.hud.updateObjectives(state.objectives);
    this.hud.hideTimer();
    this.hud.setBossBarVisible(false);
    this.hud.updateBossIndicator(false, 0, 0, 0, 0);
    this._showLevelCompleteScreen(primaryComplete, state.fastDone, state.shieldBonus);
  }

  _createTutorialState() {
    return {
      activePlayTime: 0,
      moveShown: false,
      rollShown: false,
      boostShown: false,
      fireShown: false,
      specialShown: false,
      recycleShown: false,
      objectivesShown: false,
      transitionRemaining: 0,
      activeBeatId: null,
      activeBeatProgress: null,
    };
  }

  _resetTutorialState() {
    this._timeScale = 1;
    this._tutorial = this._createTutorialState();
    this.hud.hideTutorialCallout();
  }

  _isTutorialActiveForCurrentLevel() {
    return this._tutorialMode && this.levels.current === 1;
  }

  _clearActiveTutorialBeat() {
    this._timeScale = 1;
    this._tutorial.transitionRemaining = 0;
    if (this._tutorial.activeBeatId) {
      this._tutorial.activeBeatId = null;
      this._tutorial.activeBeatProgress = null;
    }
    this.hud.hideTutorialCallout();
  }

  _getTutorialBeatProgress(beatId) {
    if (beatId === 'move') return { mouseTravel: 0, thrustHeld: false };
    if (beatId === 'roll') return { rollSeen: false };
    if (beatId === 'boost') return { boosted: false };
    if (beatId === 'fire') return { fired: false, trashDestroyed: false };
    if (beatId === 'special') return { specialDestroyed: false };
    if (beatId === 'recycle') return { recycleFired: false, recycleDestroyed: false };
    if (beatId === 'objectives') return { remaining: TUTORIAL_OBJECTIVES_HINT_DURATION };
    return {};
  }

  _getTutorialRequirementStates(beatId = this._tutorial.activeBeatId, progress = this._tutorial.activeBeatProgress) {
    if (!beatId || !progress) return [];

    if (beatId === 'move') {
      return [
        { id: 'look', label: 'Look around with the mouse', complete: progress.mouseTravel >= 14 },
        { id: 'thrust', label: 'Hold W to fly forward', complete: !!progress.thrustHeld },
      ];
    }

    if (beatId === 'roll') {
      return [
        { id: 'roll', label: 'Press A or D to roll', complete: !!progress.rollSeen },
      ];
    }

    if (beatId === 'boost') {
      return [
        { id: 'boost', label: 'Hold Space while moving forward', complete: !!progress.boosted },
      ];
    }

    if (beatId === 'fire') {
      return [
        { id: 'fire', label: 'Hold left click to fire the Vaporizer', complete: !!progress.fired },
        { id: 'trash', label: 'Destroy a piece of trash', complete: !!progress.trashDestroyed },
      ];
    }

    if (beatId === 'special') {
      return [
        { id: 'special-trash', label: 'Destroy 1 special piece of trash', complete: !!progress.specialDestroyed },
      ];
    }

    if (beatId === 'recycle') {
      return [
        { id: 'recycle-fire', label: 'Hold Shift to fire the Recycle Beam', complete: !!progress.recycleFired },
        { id: 'recycle-trash', label: 'Collect 1 recyclable with the Recycle Beam', complete: !!progress.recycleDestroyed },
      ];
    }

    return [];
  }

  _renderTutorialBeat(beatId, { animate = false } = {}) {
    const beat = TUTORIAL_BEATS[beatId];
    if (!beat) return;

    this.hud.showTutorialCallout(beat.title, beat.message, {
      placement: beat.placement,
      requirements: this._getTutorialRequirementStates(beatId, this._tutorial.activeBeatProgress),
      animate,
    });
  }

  _startTutorialBeat(beatId) {
    const beat = TUTORIAL_BEATS[beatId];
    if (!beat) return;

    this._tutorial.activeBeatId = beatId;
    this._tutorial.activeBeatProgress = this._getTutorialBeatProgress(beatId);
    this._timeScale = TUTORIAL_TIME_SCALE;
    this._renderTutorialBeat(beatId, { animate: true });
  }

  _completeActiveTutorialBeat() {
    if (!this._tutorial.activeBeatId) return;
    const completedBeatId = this._tutorial.activeBeatId;
    this._renderTutorialBeat(completedBeatId);
    this._tutorial.activeBeatId = null;
    this._tutorial.activeBeatProgress = null;
    this._tutorial.transitionRemaining = TUTORIAL_BEAT_TRANSITION_DELAY;
    this.hud.hideTutorialCallout({ animated: true });

    // Keep the mission timer frozen during tutorial and only start it after
    // the final tutorial beat has completed.
    if (
      completedBeatId === 'objectives' &&
      this._isTutorialActiveForCurrentLevel() &&
      !this._levelComplete &&
      this._levelTimer > 0
    ) {
      this._levelTimerRunning = true;
    }
  }

  _maybeStartTutorialBeat() {
    if (!this._isTutorialActiveForCurrentLevel() || this._tutorial.activeBeatId || this._tutorial.transitionRemaining > 0) return;

    if (!this._tutorial.moveShown && this._tutorial.activePlayTime >= 1.5) {
      this._tutorial.moveShown = true;
      this._startTutorialBeat('move');
      return;
    }

    if (!this._tutorial.rollShown && this._tutorial.moveShown) {
      this._tutorial.rollShown = true;
      this._startTutorialBeat('roll');
      return;
    }

    if (!this._tutorial.boostShown && this._tutorial.rollShown) {
      this._tutorial.boostShown = true;
      this._startTutorialBeat('boost');
      return;
    }

    if (!this._tutorial.fireShown && this._tutorial.boostShown) {
      this._tutorial.fireShown = true;
      this._startTutorialBeat('fire');
      return;
    }

    if (!this._tutorial.specialShown && this._tutorial.fireShown) {
      this._tutorial.specialShown = true;
      this._startTutorialBeat('special');
      return;
    }

    if (!this._tutorial.recycleShown && this._tutorial.specialShown) {
      this._tutorial.recycleShown = true;
      this._startTutorialBeat('recycle');
      return;
    }

    if (!this._tutorial.objectivesShown && this._tutorial.recycleShown) {
      this._tutorial.objectivesShown = true;
      this._startTutorialBeat('objectives');
    }
  }

  _updateTutorial(rawDelta, hasPointerLock) {
    if (this.paused) return;

    if (!this._isTutorialActiveForCurrentLevel()) {
      this._clearActiveTutorialBeat();
      return;
    }

    if (hasPointerLock) {
      this._tutorial.activePlayTime += rawDelta;
    }

    if (this._tutorial.transitionRemaining > 0) {
      this._tutorial.transitionRemaining = Math.max(0, this._tutorial.transitionRemaining - rawDelta);
    }

    if (this._tutorial.activeBeatId === 'objectives' && this._tutorial.activeBeatProgress) {
      this._tutorial.activeBeatProgress.remaining -= rawDelta;
      if (this._tutorial.activeBeatProgress.remaining <= 0) {
        this._completeActiveTutorialBeat();
        return;
      }
    }

    this._maybeStartTutorialBeat();
  }

  _noteTutorialShot() {
    if (!this._isTutorialActiveForCurrentLevel()) return;
    if (this._tutorial.activeBeatId !== 'fire' || !this._tutorial.activeBeatProgress) return;

    if (!this._tutorial.activeBeatProgress.fired) {
      this._tutorial.activeBeatProgress.fired = true;
      this._renderTutorialBeat('fire');
    }
  }

  _noteTutorialTrashDestroyed() {
    if (!this._isTutorialActiveForCurrentLevel()) return;
    if (this._tutorial.activeBeatId === 'fire' && this._tutorial.activeBeatProgress) {
      this._tutorial.activeBeatProgress.trashDestroyed = true;
      this._renderTutorialBeat('fire');

      if (this._tutorial.activeBeatProgress.fired) {
        this._completeActiveTutorialBeat();
      }
    }
  }

  _noteTutorialSpecialDestroyed() {
    if (!this._isTutorialActiveForCurrentLevel()) return;
    if (this._tutorial.activeBeatId !== 'special' || !this._tutorial.activeBeatProgress) return;

    if (!this._tutorial.activeBeatProgress.specialDestroyed) {
      this._tutorial.activeBeatProgress.specialDestroyed = true;
      this._renderTutorialBeat('special');
    }

    this._completeActiveTutorialBeat();
  }

  _noteTutorialRecycleDestroyed() {
    if (!this._isTutorialActiveForCurrentLevel()) return;
    if (this._tutorial.activeBeatId !== 'recycle' || !this._tutorial.activeBeatProgress) return;

    if (!this._tutorial.activeBeatProgress.recycleDestroyed) {
      this._tutorial.activeBeatProgress.recycleDestroyed = true;
      this._renderTutorialBeat('recycle');
    }

    if (this._tutorial.activeBeatProgress.recycleFired) {
      this._completeActiveTutorialBeat();
    }
  }

  _updateTutorialBeatDisplay() {
    if (!this._tutorial.activeBeatId) return;
    this._renderTutorialBeat(this._tutorial.activeBeatId);
  }

  _updateActiveTutorialProgress({ dx, dy, thrustHeld, rollSeen, fired, vaporizerFired, wantsBoost }) {
    if (!this._isTutorialActiveForCurrentLevel() || !this._tutorial.activeBeatId) return;

    const progress = this._tutorial.activeBeatProgress;
    let changed = false;

    if (this._tutorial.activeBeatId === 'move') {
      const nextMouseTravel = progress.mouseTravel + Math.abs(dx) + Math.abs(dy);
      const nextThrustHeld = progress.thrustHeld || thrustHeld;
      changed = (progress.mouseTravel < 14 && nextMouseTravel >= 14) || (!progress.thrustHeld && nextThrustHeld);
      progress.mouseTravel = nextMouseTravel;
      progress.thrustHeld = nextThrustHeld;

      if (changed) {
        this._updateTutorialBeatDisplay();
      }

      if (progress.mouseTravel >= 14 && progress.thrustHeld) {
        this._completeActiveTutorialBeat();
      }
      return;
    }

    if (this._tutorial.activeBeatId === 'roll') {
      if (!progress.rollSeen && rollSeen) {
        progress.rollSeen = true;
        this._updateTutorialBeatDisplay();
      }

      if (rollSeen) {
        this._completeActiveTutorialBeat();
      }
      return;
    }

    if (this._tutorial.activeBeatId === 'boost') {
      if (!progress.boosted && wantsBoost) {
        progress.boosted = true;
        this._updateTutorialBeatDisplay();
      }

      if (wantsBoost) {
        this._completeActiveTutorialBeat();
      }
      return;
    }

    if (this._tutorial.activeBeatId === 'fire') {
      if (!progress.fired && fired > 0) {
        progress.fired = true;
        this._updateTutorialBeatDisplay();
      }

      if (progress.fired && progress.trashDestroyed) {
        this._completeActiveTutorialBeat();
      }
      return;
    }

    if (this._tutorial.activeBeatId === 'recycle') {
      if (!progress.recycleFired && vaporizerFired > 0) {
        progress.recycleFired = true;
        this._updateTutorialBeatDisplay();
      }

      if (progress.recycleFired && progress.recycleDestroyed) {
        this._completeActiveTutorialBeat();
      }
      return;
    }
  }

  _firePlayerBeam(type) {
    const fireDirection = this._getAssistedFireDirection();
    const fired = this.projectiles.fire(
      this.player.mesh.position,
      fireDirection,
      this.player.velocity,
      this.player.mesh.quaternion,
      type
    );

    if (!fired) return 0;

    this.shotsFired += fired;
    this._noteTutorialShot();
    this._refreshPauseMenu();
    this.player.applyRecoil(this.projectiles.cooldownTime);
    this._spawnMuzzleParticles(_muzzleBurstLocal, { count: 18, ttl: 0.08 });
    return fired;
  }

  _pauseGame() {
    if (!this.running || this.paused) return;

    this.paused = true;
    this.boostActive = false;
    this._pauseUnlockArmed = false;
    this._clearActiveTutorialBeat();
    this._refreshPauseMenu();
    this.hud.setGameplayVisible(false);
    this.hud.setPauseVisible(true);
    if (this.crosshair) {
      this.crosshair.classList.add('hidden');
    }
    this.input.releaseAll();
    if (document.pointerLockElement) {
      document.exitPointerLock();
    }
  }

  _resumeGame() {
    if (!this.running || !this.paused) return;

    this.paused = false;
    this._pauseUnlockArmed = false;
    this.hud.setGameplayVisible(true);
    this.hud.setPauseVisible(false);
    if (this.crosshair) {
      this.crosshair.classList.remove('hidden');
    }
    this.input.releaseAll();
    this.canvas.requestPointerLock();
  }

  _exitToMenu() {
    if (typeof this._onReturnToLevelSelect === 'function') {
      this.paused = true;
      this.boostActive = false;
      this._pauseUnlockArmed = false;
      this.hud.setPauseVisible(false);
      this.input.releaseAll();
      if (document.pointerLockElement) {
        document.exitPointerLock();
      }
      this._onReturnToLevelSelect({
        level: this.levels.current,
        outcome: 'exit_menu',
      });
      return;
    }

    window.location.reload();
  }

  _loop() {
    if (!this.running) return;
    requestAnimationFrame(() => this._loop());

    const rawDelta = this.clock.getDelta();
    const hadPointerLock = this._pauseUnlockArmed;
    const hasPointerLock = this.input.pointerLocked;

    if (this.input.wasPressed('Escape')) {
      if (this.paused) {
        this._resumeGame();
      } else {
        this._pauseGame();
      }
    }

    if (!this.paused && hadPointerLock && !hasPointerLock) {
      this._pauseGame();
    }

    if (!this.paused && hasPointerLock) {
      this._pauseUnlockArmed = true;
    }

    this._updateTutorial(rawDelta, hasPointerLock);
    const delta = rawDelta * this._timeScale;

    if (this.paused) {
      this.hud.updateBoostBar(this.boostCharge, false);
      this.input.resetPressed();
      this.renderer.render(this.scene, this.camera);
      return;
    }

    this.playerHitCooldown = Math.max(0, this.playerHitCooldown - delta);

    // store player position before this frame's movement for continuous collisions
    this._prevPlayerPos.copy(this.player.mesh.position);

    // Mouse → pitch / yaw
    const { dx, dy } = this.input.consumeMouseDelta();
    this.player.rotate(dx, dy, rawDelta);
    const thrustHeld = this.input.isDown('w');

    // W → forward thrust
    const wantsBoost = thrustHeld && this.input.isDown(' ') && this.boostCharge > 0;
    this.boostActive = wantsBoost;
    if (thrustHeld) {
      const boostMultiplier = wantsBoost ? this.player.boostMultiplier : 1;
      this.player.thrust(delta, boostMultiplier);
    }

    if (wantsBoost) {
      this.boostCharge = Math.max(0, this.boostCharge - BOOST_DRAIN_RATE * delta);
      if (this.boostCharge === 0) {
        this.boostActive = false;
      }
    } else {
      this.boostCharge = Math.min(1, this.boostCharge + BOOST_RECHARGE_RATE * delta);
    }

    // A / D → manual roll
    let rollInput = 0;
    if (this.input.isDown('a')) rollInput += 1;   // roll left
    if (this.input.isDown('d')) rollInput -= 1;   // roll right
    const rollSeen = rollInput !== 0 || this.input.wasPressed('a') || this.input.wasPressed('d');
    this.player.manualRollInput = rollInput;

    // Fire regular beam with mouse-left and vaporizer beam with Shift.
    const fired = this.input.isDown('mouseleft') ? this._firePlayerBeam('normal') : 0;
    const vaporizerFired = this.input.isDown('shift') ? this._firePlayerBeam('vaporizer') : 0;

    this._updateActiveTutorialProgress({
      dx,
      dy,
      thrustHeld,
      rollSeen,
      fired: fired + vaporizerFired,
      vaporizerFired,
      wantsBoost,
    });

    // Update subsystems
    this.player.update(delta);
    this.projectiles.update(delta);
    const playerPos = this.player.mesh.position;
    const playerQuat = this.player.baseQuaternion;
    this.asteroidField.update(delta, playerPos);
    const spawnConfig = this.levels.getSpawnConfig();
    const hasBossLevel = !!this.levels.getCurrentConfig().boss;
    if (!hasBossLevel) {
      this.debris.update(delta, spawnConfig, playerPos, playerQuat);
    }
    const asteroidColliders = this.asteroidField.getColliders();
    if (!hasBossLevel) {
      this.debris.resolveAsteroidCollisions(asteroidColliders);
      const specialSpawnConfig = this._isTutorialActiveForCurrentLevel()
        ? { ...spawnConfig, progressPerSpawn: Math.max(24, (spawnConfig?.progressPerSpawn ?? 140) * 0.33) }
        : spawnConfig;
      this.specialDebris.update(delta, specialSpawnConfig, playerPos, playerQuat);
      this.specialDebris.resolveAsteroidCollisions(asteroidColliders);
      this.recycleDebris.update(delta, spawnConfig, playerPos, playerQuat);
      this.recycleDebris.resolveAsteroidCollisions(asteroidColliders);
    }
    this._updateTrashteroid(delta);
    this._resolveTrashteroidAsteroidCollisions(asteroidColliders, delta);
    this._updateTrashteroidProjectiles(delta);
    // Check projectile collisions against asteroids (sparks)
    this._checkProjectileAsteroidCollisions();
    this._checkProjectileTrashteroidCollisions();
    this._checkAsteroidPlayerCollisions();
    this._checkTrashteroidPlayerCollisions(playerPos);

    // Camera follows behind ship (updated before rendering)
    this._updateCamera(delta);

    // Keep sun and planet locked relative to camera (unreachable background)
    this._updateBackground(delta);

    // Starfield should be centered after the camera has moved to avoid
    // one-frame parallax/zoom artifacts when the camera follows the ship.
    this.starfield.update(delta, this.camera);

    // Update transient effects (particles + screen popups)
    this._updateEffects(delta);

    // Collision: projectiles vs debris (regular + special)
    this._checkProjectileDebrisCollisions(this.debris, 'normal');
    this._checkProjectileDebrisCollisions(this.recycleDebris, 'vaporizer');
    this._checkProjectileSpecialRewardCollisions();
    this._checkProjectileRecyclePenaltyCollisions();
    this._checkProjectileTrashPenaltyCollisions();

    // Collision: trash vs player (hits / misses)
    this._checkDebrisPlayerCollisions(playerPos, playerQuat);
    this._checkDebrisPlayerCollisions(playerPos, playerQuat, this.specialDebris);
    this._checkDebrisPlayerCollisions(playerPos, playerQuat, this.recycleDebris);

    this._updateMissionTargetIndicator();
    this._updateMinimap();

    this.score = Math.max(0, this.score);
    this.hud.update(this.score, this.levels.current, this.lives);
    this.hud.updateBoostBar(this.boostCharge, this.boostActive);
    this.hud.updateSpeedometer(this.player.velocity.length());
    const bandLevels = soundtrackManager.getBandLevels(this.hud.musicVisualizerBars?.length || 14);
    this.hud.updateMusicVisualizer(bandLevels, rawDelta);
    this._updateMissionObjectives(delta);
    this.input.resetPressed();
    this.renderer.render(this.scene, this.camera);
  }

  _updateMissionObjectives(delta) {
    if (this._levelComplete) return;

    if (this._levelTimerRunning && !this.paused) {
      this._levelTimer = Math.max(0, this._levelTimer - delta);
    }
    this.hud.updateTimer(this._levelTimer);

    const state = this._getMissionObjectiveState(false);
    this.hud.updateObjectives(state.objectives);

    if (state.primaryComplete || this._levelTimer <= 0) {
      this._finalizeLevel(state.primaryComplete);
    }
  }

  _segmentIntersectsSphere(start, end, center, radius) {
    _segment.copy(end).sub(start);
    const segLenSq = _segment.lengthSq();
    const radiusSq = radius * radius;

    if (segLenSq === 0) {
      const inside = end.distanceToSquared(center) <= radiusSq;
      if (inside) _closestPoint.copy(end);
      return inside;
    }

    _toCenter.copy(center).sub(start);
    const t = THREE.MathUtils.clamp(_toCenter.dot(_segment) / segLenSq, 0, 1);
    _closestPoint.copy(start).addScaledVector(_segment, t);
    return _closestPoint.distanceToSquared(center) <= radiusSq;
  }

  _checkProjectileDebrisCollisions(debrisManager = this.debris, projectileTypeFilter = null) {
    const projectiles = this.projectiles.getActive();
    const debrisList = debrisManager.getActive();

    for (let i = projectiles.length - 1; i >= 0; i--) {
      if (projectileTypeFilter && projectiles[i].type !== projectileTypeFilter) continue;
      for (let j = debrisList.length - 1; j >= 0; j--) {
        const hitRadius = debrisList[j].hitRadius || 1;
        if (this._projectileHitsSphere(projectiles[i], debrisList[j].position, hitRadius)) {
          const points = debrisList[j].points || 100;
          this.score += points;
          this.trashHits++;
          if (debrisManager === this.recycleDebris) {
            this._recycleCollectedRequired++;
            this._noteTutorialRecycleDestroyed();
          } else {
            this._trashDestroyedRequired++;
            this._noteTutorialTrashDestroyed();
            if (this.player.velocity.length() >= this._bonusFastThresholdWorld) {
              this._trashDestroyedFast++;
            }
          }
          this._refreshPauseMenu();
          this._spawnExplosion(_closestPoint.clone(), { count: 220, ttl: 1.4 });
          this._spawnScorePopup(_closestPoint.clone(), points);
          this.projectiles.remove(i);
          debrisManager.remove(j);
          break;
        }
      }
    }
  }

  _checkProjectileSpecialRewardCollisions() {
    const projectiles = this.projectiles.getActive();
    const debrisList = this.specialDebris.getActive();

    for (let i = projectiles.length - 1; i >= 0; i--) {
      if (projectiles[i].type !== 'normal') continue;
      for (let j = debrisList.length - 1; j >= 0; j--) {
        const hitRadius = debrisList[j].hitRadius || 1;
        if (this._projectileHitsSphere(projectiles[i], debrisList[j].position, hitRadius)) {
          const points = debrisList[j].points || 5000;
          this.score += points;
          this.trashHits++;
          this._trashDestroyedRequired++;
          this._noteTutorialTrashDestroyed();
          this._noteTutorialSpecialDestroyed();
          if (this.player.velocity.length() >= this._bonusFastThresholdWorld) {
            this._trashDestroyedFast++;
          }
          this._refreshPauseMenu();
          this._spawnExplosion(_closestPoint.clone(), { count: 220, ttl: 1.4 });
          this._spawnScorePopup(_closestPoint.clone(), points);
          this.projectiles.remove(i);
          this.specialDebris.remove(j);
          break;
        }
      }
    }
  }

  _checkProjectileRecyclePenaltyCollisions() {
    const projectiles = this.projectiles.getActive();
    const debrisList = this.recycleDebris.getActive();

    for (let i = projectiles.length - 1; i >= 0; i--) {
      if (projectiles[i].type !== 'normal') continue;
      for (let j = debrisList.length - 1; j >= 0; j--) {
        const hitRadius = debrisList[j].hitRadius || 1;
        if (this._projectileHitsSphere(projectiles[i], debrisList[j].position, hitRadius)) {
          const penalty = WRONG_BEAM_PENALTY;
          this.score = Math.max(0, this.score - penalty);
          this._refreshPauseMenu();
          this._spawnExplosion(_closestPoint.clone(), { count: 220, ttl: 1.4 });
          this._spawnScorePopup(_closestPoint.clone(), -penalty, { color: '#ff3b30' });
          this.projectiles.remove(i);
          this.recycleDebris.remove(j);
          break;
        }
      }
    }
  }

  _checkProjectileTrashPenaltyCollisions() {
    const projectiles = this.projectiles.getActive();
    const debrisList = this.debris.getActive();

    for (let i = projectiles.length - 1; i >= 0; i--) {
      if (projectiles[i].type !== 'vaporizer') continue;
      for (let j = debrisList.length - 1; j >= 0; j--) {
        const hitRadius = debrisList[j].hitRadius || 1;
        if (this._projectileHitsSphere(projectiles[i], debrisList[j].position, hitRadius)) {
          const penalty = WRONG_BEAM_PENALTY;
          this.score = Math.max(0, this.score - penalty);
          this._refreshPauseMenu();
          this._spawnExplosion(_closestPoint.clone(), { count: 220, ttl: 1.4 });
          this._spawnScorePopup(_closestPoint.clone(), -penalty, { color: '#ff3b30' });
          this.projectiles.remove(i);
          this.debris.remove(j);
          break;
        }
      }
    }
  }

  _checkDebrisPlayerCollisions(playerPos = this.player.mesh.position, playerQuat = this.player.baseQuaternion, debrisManager = this.debris) {
    const debrisList = debrisManager.getActive();
    _shipForward.set(0, 0, -1).applyQuaternion(playerQuat);

    for (let i = debrisList.length - 1; i >= 0; i--) {
      const d = debrisList[i];
      const hitRadius = d.hitRadius || 1;
      // Slightly larger effective radius makes collisions feel less late.
      const hitDistance = PLAYER_COLLISION_RADIUS + hitRadius * 1.0;
      // Count a miss a bit earlier once debris slips behind the ship.
      const passDistance = hitRadius + 20;
      // Nearby debris gets pushed away even without direct contact.
      const reactDistance = Math.max(hitRadius * 3, 6);

      // Sweep from previous to current player position for stable hit checks.
      const segStart = this._prevPlayerPos;
      const segEnd = playerPos;
      const sweptHit = this._segmentIntersectsSphere(segStart, segEnd, d.position, hitDistance);

      if (sweptHit) {
        // Resolve by moving debris only; player motion stays smooth.
        _debrisAway.copy(d.position).sub(playerPos);
        if (_debrisAway.lengthSq() < 1e-6) {
          _debrisAway.copy(_closestPoint).sub(d.position);
        }
        if (_debrisAway.lengthSq() < 1e-6) {
          _debrisAway.copy(_shipForward).negate();
        }
        _debrisAway.normalize();

        // Scale damage by current player speed.
        const playerSpeed = this.player.velocity.length();
        const damage = THREE.MathUtils.clamp(Math.round(6 + (playerSpeed / 120) * 12), 5, 20);
        this._damagePlayer(damage);

        // Push debris outside the collision shell and give it a kick.
        if (d.position) d.position.copy(playerPos).addScaledVector(_debrisAway, hitDistance + 0.06);
        if (d.velocity) d.velocity.copy(_debrisAway).multiplyScalar(Math.max(4, d.velocity.length() + 2));
        else d.velocity = _debrisAway.clone().multiplyScalar(3 + Math.random() * 2);

        continue;
      }

      // Passive near-miss behavior.
      _toDebris.copy(d.position).sub(playerPos);
      const distSq = _toDebris.lengthSq();
      const forwardOffset = _toDebris.dot(_shipForward);

      // Nudge nearby debris away to reduce frustrating glancing overlaps.
      if (distSq < reactDistance * reactDistance && distSq > hitDistance * hitDistance) {
        const dist = Math.sqrt(distSq) || 0.0001;
        _debrisAway.copy(_toDebris).multiplyScalar(1 / dist); // from player to debris
        // Keep it just outside the reaction radius and add a small impulse.
        if (d.position) d.position.copy(playerPos).addScaledVector(_debrisAway, Math.max(reactDistance, hitRadius + PLAYER_COLLISION_RADIUS) + 0.1);
        if (d.velocity) {
          d.velocity.addScaledVector(_debrisAway, 1.5 + Math.random() * 1.5);
        } else {
          d.velocity = _debrisAway.clone().multiplyScalar(1.5 + Math.random() * 1.5);
        }
      }

      // Debris that gets behind the ship counts as a miss.
      if (distSq < passDistance * passDistance && forwardOffset < -hitRadius) {
        this.score = Math.max(0, this.score - 50);
        debrisManager.remove(i);
      }
    }
  }

  _checkAsteroidPlayerCollisions() {
    const asteroids = this.asteroidField.getColliders();
    const playerPos = this.player.mesh.position;

    // Accumulate total separation so multiple overlapping asteroids
    // don't push the player back and forth causing jitter
    let sepX = 0, sepY = 0, sepZ = 0;

    for (let i = 0; i < asteroids.length; i++) {
      const sphere = asteroids[i].boundingSphere;
      const minDistance = PLAYER_COLLISION_RADIUS + sphere.radius * 0.9; // slight forgiveness on asteroid radius for better feel

      _collisionNormal.copy(playerPos).sub(sphere.center);
      const distanceSq = _collisionNormal.lengthSq();
      if (distanceSq >= minDistance * minDistance) continue;
      // Compute collision geometry and response
      let distance = Math.sqrt(distanceSq);
      if (distance === 0) {
        _collisionNormal.set(0, 0, 1).applyQuaternion(this.player.mesh.quaternion);
        distance = 1;
      } else {
        _collisionNormal.multiplyScalar(1 / distance);
      }

      const overlap = minDistance - distance;
      sepX += _collisionNormal.x * overlap;
      sepY += _collisionNormal.y * overlap;
      sepZ += _collisionNormal.z * overlap;

      const normalSpeed = this.player.velocity.dot(_collisionNormal);

      // If approaching the asteroid (negative dot), reflect velocity and compute damage
      if (normalSpeed < 0) {
        _velocityNormal.copy(_collisionNormal).multiplyScalar(normalSpeed);
        _velocityTangent.copy(this.player.velocity).sub(_velocityNormal).multiplyScalar(ASTEROID_SURFACE_FRICTION);
        this.player.velocity.copy(_velocityTangent).addScaledVector(_collisionNormal, -normalSpeed * ASTEROID_BOUNCE);

        const impactSpeed = Math.max(0, -normalSpeed);
        // Map impactSpeed to damage — reduced sensitivity so 20 is only at very high speed
        const damage = THREE.MathUtils.clamp(Math.round(8 + (impactSpeed / 420) * 12), 5, 20);
        this._damagePlayer(damage);
        if (!this.running) return;
      } else {
        // grazing contact with no inward velocity: apply small fixed damage
        const damage = 6;
        this._damagePlayer(damage);
        if (!this.running) return;
      }
    }

    // Apply accumulated separation once
    if (sepX !== 0 || sepY !== 0 || sepZ !== 0) {
      playerPos.x += sepX;
      playerPos.y += sepY;
      playerPos.z += sepZ;
    }
  }

  _damagePlayer() {
    // legacy: no-arg call reduces by 1; new signature accepts damage amount
    let damage = 1;
    if (arguments.length > 0) damage = arguments[0] || 0;
    damage = Math.max(0, Math.round(damage));

    if (this.playerHitCooldown > 0 || this.lives <= 0) {
      return false;
    }

    this.lives = Math.max(0, this.lives - damage);
    this.playerHitCooldown = PLAYER_HIT_COOLDOWN;
    this.player.flashDamage(PLAYER_HIT_COOLDOWN);

    // trigger HUD damage flash and low-health indicator
    if (this.hud) {
      if (typeof this.hud.flashDamage === 'function') this.hud.flashDamage();
      if (typeof this.hud.setLowHealth === 'function') this.hud.setLowHealth(this.lives <= 20);
    }

    if (this.lives <= 0) {
      this._gameOver();
    }

    return true;
  }

  _showLevelCompleteScreen(reqDone, fastDone, shieldBonus) {
    this.paused = true;
    this.hud.setGameplayVisible(false);
    this.hud.hideTimer();
    if (this.crosshair) this.crosshair.classList.add('hidden');
    if (document.pointerLockElement) document.exitPointerLock();

    const el = this._levelCompleteEl;
    if (!el) return;

    const mission = this.levels.getMissionConfig();
    const nextLevel = reqDone ? this.levels.getNextLevel() : null;

    if (reqDone && nextLevel) {
      unlockLevel(nextLevel);
    }

    const title = el.querySelector('#level-complete-title');
    const sub = el.querySelector('#level-complete-subtitle');
    const bonuses = el.querySelector('#level-complete-bonuses');
    const nextBtn = el.querySelector('#level-next-btn');
    const retryBtn = el.querySelector('#level-retry-btn');
    const actions = el.querySelector('#level-complete-actions');
    const cutsceneKicker = el.querySelector('#cutscene-kicker');
    const cutsceneFrom = el.querySelector('#cutscene-from-label');
    const cutsceneTo = el.querySelector('#cutscene-to-label');
    const autoReturn = typeof this._onReturnToLevelSelect === 'function';

    const currentSectorLabel = `SECTOR ${String(this.levels.current).padStart(2, '0')}`;
    const destinationLabel = autoReturn
      ? 'SECTOR MAP'
      : reqDone
        ? (nextLevel ? `SECTOR ${String(nextLevel).padStart(2, '0')}` : 'MISSION COMPLETE')
        : 'RETRY SECTOR';

    if (title) {
      title.textContent = reqDone
        ? (mission?.successTitle ?? `SECTOR ${this.levels.current} CLEARED`)
        : 'TIME UP';
    }
    if (sub) {
      sub.textContent = reqDone
        ? `${mission?.successSubtitle ?? 'Primary objectives complete.'}${autoReturn ? ' Returning to the sector map...' : ''}`
        : `You ran out of time before the primary objectives were complete.${autoReturn ? ' Returning to the sector map...' : ''}`;
    }
    if (bonuses) {
      const earned = [
        fastDone && 'Fast Destroyer bonus',
        shieldBonus && 'Full Shield bonus',
      ].filter(Boolean);
      bonuses.textContent = earned.length ? earned.join('   ') : 'No bonus objectives completed.';
    }

    if (actions) {
      actions.classList.toggle('hidden', autoReturn);
    }

    if (nextBtn) {
      nextBtn.classList.toggle('hidden', autoReturn || !nextLevel);
      nextBtn.textContent = nextLevel ? 'NEXT SECTOR' : 'MISSION COMPLETE';
    }

    if (retryBtn) {
      retryBtn.classList.toggle('hidden', autoReturn);
      retryBtn.textContent = reqDone && !nextLevel ? 'PLAY AGAIN' : 'RETRY SECTOR';
    }

    if (cutsceneKicker) {
      cutsceneKicker.textContent = reqDone
        ? (autoReturn ? 'RETURNING TO SECTOR MAP' : (nextLevel ? 'SECTOR TRANSITION' : 'MISSION COMPLETE'))
        : (autoReturn ? 'MISSION FAILED' : 'RETRY LOCK');
    }
    if (cutsceneFrom) cutsceneFrom.textContent = currentSectorLabel;
    if (cutsceneTo) cutsceneTo.textContent = destinationLabel;

    el.classList.remove('hidden');

    if (autoReturn) {
      this._scheduleReturnToLevelSelect(2400, { outcome: reqDone ? 'complete' : 'failed' });
    }
  }

  _onLevelNext() {
    const nextLevel = this.levels.getNextLevel();
    if (!nextLevel) return;

    this._levelCompleteEl?.classList.add('hidden');
    this._enterLevel(nextLevel);
    if (this.crosshair) this.crosshair.classList.remove('hidden');
    this.canvas.requestPointerLock();
  }

  _onLevelRetry() {
    this._levelCompleteEl?.classList.add('hidden');
    this._enterLevel(this.levels.current, {
      resetPlayerPosition: true,
      resetRunStats: true,
    });
    if (this.crosshair) this.crosshair.classList.remove('hidden');
    this.canvas.requestPointerLock();
  }

  _updateMinimap() {
    const playerPos = this.player.mesh.position;
    const camInvQuat = this.camera.quaternion.clone().invert();
    this.hud.updateMinimap(
      true,
      this._getMissionTargetPosition(),
      playerPos,
      camInvQuat,
      this.asteroidField.getColliders()
    );
  }


  _gameOver() {
    this.running = false;
    this.hud.setGameplayVisible(false);
    this.hud.setPauseVisible(false);
    if (this.crosshair) {
      this.crosshair.classList.add('hidden');
    }
    this.hud.showMessage('GAME OVER');
    this._scheduleReturnToLevelSelect(1800, { outcome: 'game_over' });
  }

  _victory() {
    this.running = false;
    this.hud.setGameplayVisible(false);
    this.hud.setPauseVisible(false);
    if (this.crosshair) {
      this.crosshair.classList.add('hidden');
    }
    this.hud.showMessage('EARTH IS SAVED!');
    this._scheduleReturnToLevelSelect(2200, { outcome: 'victory' });
  }

  _updateCamera(delta) {
    const shipPos = this.player.mesh.position;
    // Use the ship's base quaternion (yaw + pitch) so the camera does not
    // inherit the ship's cosmetic roll (visual tilt).
    const shipQuat = this.player.baseQuaternion;

    // Desired camera position: offset behind & above the ship,
    // rotated by the ship's quaternion
    _camTarget.copy(_camOffset).applyQuaternion(shipQuat).add(shipPos);

    // Lock camera directly to target — no lerp, no jitter
    this.camera.position.copy(_camTarget);

    // Set camera up to the ship's local up so lookAt never flips
    // (default world-up (0,1,0) degenerates when looking near-vertical)
    this.camera.up.set(0, 1, 0).applyQuaternion(shipQuat);

    // Look along ship's forward from camera position
    _shipForward.set(0, 0, -1).applyQuaternion(shipQuat);
    _camLookTarget.copy(this.camera.position).addScaledVector(_shipForward, 200);
    this.camera.lookAt(_camLookTarget);

    // Speed-responsive FOV: widen only while boosting.
    const speed = this.player.velocity.length();
    const fovMin = 50;
    const fovMax = 75;
    const speedForMinFov = 400; // max non-boost speed (no FOV widening below this)
    const speedForMaxFov = speedForMinFov * this.player.boostMultiplier * 0.65; // max boosted speed

    let t = 0;
    if (this.boostActive) {
      if (speed <= speedForMinFov) {
        t = 0;
      } else {
        t = Math.min((speed - speedForMinFov) / (speedForMaxFov - speedForMinFov), 1);
      }
    }

    const targetFov = fovMin + (fovMax - fovMin) * t;
    this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, targetFov, 1 - Math.exp(-3 * delta));
    this.camera.updateProjectionMatrix();
  }

  _projectileHitsSphere(projectile, center, radius) {
    const start = projectile.prevPosition || projectile.position;
    const end = projectile.position;

    _segment.copy(end).sub(start);
    const segmentLengthSq = _segment.lengthSq();

    if (segmentLengthSq === 0) {
      return end.distanceTo(center) <= radius;
    }

    _toCenter.copy(center).sub(start);
    const t = THREE.MathUtils.clamp(_toCenter.dot(_segment) / segmentLengthSq, 0, 1);
    _closestPoint.copy(start).addScaledVector(_segment, t); 
    return _closestPoint.distanceTo(center) <= radius + PROJECTILE_HIT_PADDING;
  }

  _getAssistedFireDirection() {
    const playerPos = this.player.mesh.position;
    _cameraForward.set(0, 0, -1).applyQuaternion(this.camera.quaternion).normalize();
    _cameraDown.set(0, -1, 0).applyQuaternion(this.camera.quaternion).normalize();
    _cameraForward.addScaledVector(_cameraDown, AIM_LOWERING).normalize();
    _aimRay.origin.copy(this.camera.position);
    _aimRay.direction.copy(_cameraForward);

    let bestDistance = Infinity;

    const debrisList = this.debris.getActive();
    for (let i = 0; i < debrisList.length; i++) {
      const debris = debrisList[i];
      const distance = this._intersectAimSphere(debris.position, debris.hitRadius || 1.0);
      if (distance < bestDistance) {
        bestDistance = distance;
      }
    }

    const specialList = this.specialDebris.getActive();
    for (let i = 0; i < specialList.length; i++) {
      const distance = this._intersectAimSphere(specialList[i].position, specialList[i].hitRadius || 1.0);
      if (distance < bestDistance) bestDistance = distance;
    }

    const recycleList = this.recycleDebris.getActive();
    for (let i = 0; i < recycleList.length; i++) {
      const distance = this._intersectAimSphere(recycleList[i].position, recycleList[i].hitRadius || 1.0);
      if (distance < bestDistance) bestDistance = distance;
    }

    // Ignore intersections that are extremely close to the camera (they indicate
    // the camera is inside or grazing the collider). Treat those as no-hit so the
    // fallback aim distance is used instead.
    if (bestDistance < MIN_AIM_DISTANCE) {
      bestDistance = Infinity;
    }

    if (bestDistance < Infinity) {
      _aimPoint.copy(_aimRay.direction).multiplyScalar(bestDistance).add(_aimRay.origin);
    } else {
      _aimPoint.copy(_aimRay.direction).multiplyScalar(AIM_FALLBACK_DISTANCE).add(_aimRay.origin);
    }

    _aimDirection.copy(_aimPoint).sub(playerPos);
    if (_aimDirection.lengthSq() === 0) {
      return _shipForward.set(0, 0, -1).applyQuaternion(this.player.baseQuaternion).normalize().clone();
    }

    return _aimDirection.normalize().clone();
  }

  _intersectAimSphere(center, radius) {
    _aimOffset.copy(_aimRay.origin).sub(center);
    const b = _aimOffset.dot(_aimRay.direction);
    const c = _aimOffset.lengthSq() - radius * radius;
    const discriminant = b * b - c;

    if (discriminant < 0) {
      return Infinity;
    }

    const sqrtDiscriminant = Math.sqrt(discriminant);
    const near = -b - sqrtDiscriminant;
    if (near > 0) {
      return near;
    }

    const far = -b + sqrtDiscriminant;
    return far > 0 ? far : Infinity;
  }

  _projectileHitsBox(projectile, center, halfSize, padding = 0) {
    const start = projectile.prevPosition || projectile.position;
    const end = projectile.position;
    _segment.copy(end).sub(start);

    _boxMin.copy(center).sub(halfSize).addScalar(-padding);
    _boxMax.copy(center).add(halfSize).addScalar(padding);

    if (_segment.lengthSq() === 0) {
      const inside =
        start.x >= _boxMin.x && start.x <= _boxMax.x &&
        start.y >= _boxMin.y && start.y <= _boxMax.y &&
        start.z >= _boxMin.z && start.z <= _boxMax.z;
      if (inside) _closestPoint.copy(start);
      return inside;
    }

    let tMin = 0;
    let tMax = 1;
    const axes = ['x', 'y', 'z'];

    for (let i = 0; i < axes.length; i++) {
      const axis = axes[i];
      const origin = start[axis];
      const direction = _segment[axis];

      if (Math.abs(direction) < 1e-8) {
        if (origin < _boxMin[axis] || origin > _boxMax[axis]) return false;
        continue;
      }

      const invDirection = 1 / direction;
      let t1 = (_boxMin[axis] - origin) * invDirection;
      let t2 = (_boxMax[axis] - origin) * invDirection;
      if (t1 > t2) {
        const swap = t1;
        t1 = t2;
        t2 = swap;
      }

      tMin = Math.max(tMin, t1);
      tMax = Math.min(tMax, t2);
      if (tMin > tMax) return false;
    }

    _closestPoint.copy(start).addScaledVector(_segment, tMin);
    return true;
  }

  _intersectAimBox(center, halfSize) {
    _boxMin.copy(center).sub(halfSize);
    _boxMax.copy(center).add(halfSize);

    let tMin = 0;
    let tMax = Infinity;
    const axes = ['x', 'y', 'z'];

    for (let i = 0; i < axes.length; i++) {
      const axis = axes[i];
      const origin = _aimRay.origin[axis];
      const direction = _aimRay.direction[axis];

      if (Math.abs(direction) < 1e-8) {
        if (origin < _boxMin[axis] || origin > _boxMax[axis]) return Infinity;
        continue;
      }

      const invDirection = 1 / direction;
      let t1 = (_boxMin[axis] - origin) * invDirection;
      let t2 = (_boxMax[axis] - origin) * invDirection;
      if (t1 > t2) {
        const swap = t1;
        t1 = t2;
        t2 = swap;
      }

      tMin = Math.max(tMin, t1);
      tMax = Math.min(tMax, t2);
      if (tMin > tMax) return Infinity;
    }

    return tMax > 0 ? tMin : Infinity;
  }

  // Projectile vs asteroid collisions: spawn sparks at hit point
  _checkProjectileAsteroidCollisions() {
    const projectiles = this.projectiles.getActive();
    const asteroids = this.asteroidField.getColliders();

    for (let i = projectiles.length - 1; i >= 0; i--) {
      for (let j = 0; j < asteroids.length; j++) {
        const sphere = asteroids[j].boundingSphere;
        // Use the smaller collision radius (same scale used for player collisions)
        const hitRadius = sphere.radius * 0.8;
        if (this._projectileHitsSphere(projectiles[i], sphere.center, hitRadius)) {
          // NOTE: do NOT modify asteroid velocity from projectile hits;
          // bullets are cosmetic and should not push asteroids.
          const hitPoint = _closestPoint.clone();
          this.projectiles.remove(i);
          break;
        }
      }
    }
  }

  // Spawn a short-lived spark particle burst at world `pos`.
  _spawnSparks(pos, options = {}) {
    // Lightweight textured sparks; supports size/color interpolation.
    const reducedFlashing = this._isReducedFlashing();
    const baseCount = options.count || 24;
    const count = reducedFlashing
      ? Math.max(6, Math.floor(baseCount * 0.45))
      : baseCount;
    const speedScale = reducedFlashing ? 0.7 : 1;
    const baseSize = options.size || 0.9;
    const size = reducedFlashing ? baseSize * 0.78 : baseSize;
    const positions = new Float32Array(count * 3);
    const velocities = new Array(count);
    for (let k = 0; k < count; k++) {
      positions[k * 3] = pos.x + (Math.random() - 0.5) * 0.2;
      positions[k * 3 + 1] = pos.y + (Math.random() - 0.5) * 0.2;
      positions[k * 3 + 2] = pos.z + (Math.random() - 0.5) * 0.2;
      const dir = new THREE.Vector3((Math.random() - 0.5), (Math.random() - 0.2), (Math.random() - 0.5)).normalize();
      velocities[k] = dir.multiplyScalar((options.speed || 12) * speedScale * (0.6 + Math.random() * 0.9));
    }

    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({
      map: this._particleTexture,
      color: options.color || 0xffcc66,
      size,
      sizeAttenuation: true,
      depthWrite: false,
      transparent: true,
      blending: options.blending || (reducedFlashing ? THREE.NormalBlending : THREE.AdditiveBlending),
    });
    const points = new THREE.Points(geom, mat);
    this._effectGroup.add(points);

    this._sparks.push({
      mesh: points,
      velocities,
      life: 0,
      ttl: options.ttl || 0.9,
      sizeStart: size,
      sizeEnd: reducedFlashing
        ? Math.max(0.08, (options.sizeEnd || 0.1) * 0.75)
        : (options.sizeEnd || 0.1),
      colorStart: new THREE.Color(options.color || 0xffcc66),
      colorEnd: new THREE.Color(options.colorEnd || 0x222222),
      type: 'spark',
    });
  }

  // Larger explosion effect for debris destruction
  _spawnExplosion(pos, options = {}) {
    const reducedFlashing = this._isReducedFlashing();
    const baseCount = options.count || 220;
    const ttl = options.ttl || 1.6;

    if (!reducedFlashing) {
      // Core flash — bright, short-lived
      this._spawnSparks(pos.clone(), { count: Math.floor(baseCount * 0.12), speed: 25, size: 8, ttl: Math.max(0.2, ttl * 0.12), color: 0xffffff, colorEnd: 0xffcc88 });
    } else {
      // Reduced flashing mode swaps bright core flash for a gentler burst.
      this._spawnSparks(pos.clone(), { count: Math.floor(baseCount * 0.08), speed: 16, size: 4, ttl: Math.max(0.24, ttl * 0.16), color: 0xe5b97c, colorEnd: 0x6a4a2a, blending: THREE.NormalBlending });
    }

    // Embers — orange, additive, mid-lived
    this._spawnSparks(pos.clone(), {
      count: Math.floor(baseCount * (reducedFlashing ? 0.36 : 0.6)),
      speed: reducedFlashing ? 42 : 75,
      size: reducedFlashing ? 3.8 : 6,
      ttl: Math.max(0.8, ttl * 0.7),
      color: reducedFlashing ? 0xd6a062 : 0xffbb66,
      colorEnd: 0x442200,
      blending: reducedFlashing ? THREE.NormalBlending : THREE.AdditiveBlending,
    });

    // Smoke — larger, darker, rises slowly
    const smokeCount = Math.floor(baseCount * 0.28);
    const positions = new Float32Array(smokeCount * 3);
    const velocities = new Array(smokeCount);
    for (let k = 0; k < smokeCount; k++) {
      positions[k * 3] = pos.x + (Math.random() - 0.5) * 2.0;
      positions[k * 3 + 1] = pos.y + (Math.random() - 0.5) * 1.0;
      positions[k * 3 + 2] = pos.z + (Math.random() - 0.5) * 2.0;
      // omnidirectional smoke: emit in all directions (slower than embers)
      const dir = new THREE.Vector3((Math.random() - 0.5), (Math.random() - 0.5), (Math.random() - 0.5)).normalize();
      velocities[k] = dir.multiplyScalar((reducedFlashing ? 28 : 45) * (0.6 + Math.random() * 0.8));
    }
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({ map: this._particleTexture, color: 0x333333, size: reducedFlashing ? 5.0 : 6.0, sizeAttenuation: true, depthWrite: false, transparent: true, opacity: reducedFlashing ? 0.16 : 0.1, blending: THREE.NormalBlending });
    const points = new THREE.Points(geom, mat);
    this._effectGroup.add(points);
    this._sparks.push({ mesh: points, velocities, life: 0, ttl: Math.max(1.6, ttl * 1.3), sizeStart: reducedFlashing ? 5.0 : 6.0, sizeEnd: reducedFlashing ? 9.0 : 12.0, colorStart: new THREE.Color(0x333333), colorEnd: new THREE.Color(0x111111), type: 'smoke' });
  }

  // Spawn a very short-lived muzzle particle burst in player-local space.
  _spawnMuzzleParticles(localPos, options = {}) {
    const reducedFlashing = this._isReducedFlashing();
    const baseCount = options.count || 48; // larger burst by default
    const count = reducedFlashing ? Math.max(8, Math.floor(baseCount * 0.45)) : baseCount;
    const positions = new Float32Array(count * 3);
    const velocities = new Array(count);

    for (let k = 0; k < count; k++) {
      positions[k * 3] = localPos.x + (Math.random() - 0.5) * 0.12;
      positions[k * 3 + 1] = localPos.y + (Math.random() - 0.5) * 0.12;
      positions[k * 3 + 2] = localPos.z + (Math.random() - 0.5) * 0.12;

      // local-space velocity biased forward (-Z)
      const dir = new THREE.Vector3((Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 0.6, - (0.6 + Math.random() * 1.6));
      velocities[k] = dir.multiplyScalar((reducedFlashing ? 11 : 18) * (0.6 + Math.random() * 0.8));
    }

    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    // Reuse the player's thrust sprite when available; otherwise use the shared particle texture.
    const spriteTex = this.player?._particlePoints?.material?.uniforms?.map?.value || this._particleTexture;

    const mat = new THREE.PointsMaterial({
      map: spriteTex,
      color: reducedFlashing ? 0xe9f5ff : 0xffffff,
      size: reducedFlashing ? (options.size || 0.4) * 0.72 : (options.size || 0.4),
      sizeAttenuation: true,
      depthWrite: false,
      transparent: true,
      blending: reducedFlashing ? THREE.NormalBlending : THREE.AdditiveBlending,
    });
    const points = new THREE.Points(geom, mat);

    // Parent to player so the burst stays attached while the ship moves
    this.player.mesh.add(points);

    this._muzzles.push({ mesh: points, velocities, life: 0, ttl: options.ttl || 0.08 });
  }

  // Spawn a small screen-space score popup at world `pos` with signed amount.
  _spawnScorePopup(pos, amount, options = {}) {
    const el = document.createElement('div');
    const textColor = options.color || (amount < 0 ? '#ff3b30' : '#ffd966');
    el.textContent = `${amount > 0 ? '+' : ''}${amount}`;
    Object.assign(el.style, {
      position: 'absolute',
      left: '0px',
      top: '0px',
      color: textColor,
      fontWeight: '700',
      pointerEvents: 'none',
      transform: 'translate(-50%, -50%)',
      textShadow: '0 1px 0 #000, 0 2px 6px rgba(0,0,0,0.6)',
      willChange: 'transform, opacity'
    });
    document.body.appendChild(el);
    this._popups.push({ el, worldPos: pos.clone(), life: 0, ttl: 1.0, startY: 0 });
  }

  _updateEffects(delta) {
    // Update sparks
    for (let i = this._sparks.length - 1; i >= 0; i--) {
      const p = this._sparks[i];
      p.life += delta;
      const posAttr = p.mesh.geometry.getAttribute('position');
      for (let k = 0; k < p.velocities.length; k++) {
        const vx = p.velocities[k].x * delta;
        const vy = p.velocities[k].y * delta;
        const vz = p.velocities[k].z * delta;
        posAttr.array[k * 3] += vx;
        posAttr.array[k * 3 + 1] += vy;
        posAttr.array[k * 3 + 2] += vz;
        // different damping for smoke vs sparks
        if (p.type === 'smoke') {
          p.velocities[k].multiplyScalar(Math.pow(0.92, delta * 60));
        } else {
          p.velocities[k].multiplyScalar(Math.pow(0.85, delta * 60));
        }
      }
      posAttr.needsUpdate = true;

      // interpolate size & color over life
      const t = Math.min(1, p.life / p.ttl);
      if (p.sizeStart !== undefined && p.sizeEnd !== undefined) {
        const size = THREE.MathUtils.lerp(p.sizeStart, p.sizeEnd, t);
        if (p.mesh && p.mesh.material) p.mesh.material.size = size;
      }
      if (p.colorStart && p.colorEnd && p.mesh && p.mesh.material) {
        p.mesh.material.color.copy(p.colorStart).lerp(p.colorEnd, t);
      }

      // fade out
      if (p.mesh && p.mesh.material) p.mesh.material.opacity = Math.max(0, 1 - t);

      if (p.life >= p.ttl) {
        this._effectGroup.remove(p.mesh);
        if (p.mesh.geometry) p.mesh.geometry.dispose();
        if (p.mesh.material) p.mesh.material.dispose();
        this._sparks.splice(i, 1);
      }
    }

    // Update screen popups
    const canvas = this.renderer.domElement;
    const halfW = canvas.clientWidth / 2;
    const halfH = canvas.clientHeight / 2;
    const rect = canvas.getBoundingClientRect();
    for (let i = this._popups.length - 1; i >= 0; i--) {
      const pop = this._popups[i];
      pop.life += delta;
      const t = pop.life / pop.ttl;
      // Project world pos to screen
      _popupScreenPos.copy(pop.worldPos).project(this.camera);
      const x = (_popupScreenPos.x * halfW) + halfW + rect.left;
      const y = (-_popupScreenPos.y * halfH) + halfH + rect.top;
      pop.el.style.left = `${x}px`;
      pop.el.style.top = `${y - t * 40}px`;
      pop.el.style.opacity = `${Math.max(0, 1 - t)}`;

      if (pop.life >= pop.ttl) {
        pop.el.remove();
        this._popups.splice(i, 1);
      }
    }

    // Update muzzle bursts (parented to player mesh; positions are local)
    for (let i = this._muzzles.length - 1; i >= 0; i--) {
      const m = this._muzzles[i];
      m.life += delta;
      const posAttr = m.mesh.geometry.getAttribute('position');
      for (let k = 0; k < m.velocities.length; k++) {
        const vx = m.velocities[k].x * delta;
        const vy = m.velocities[k].y * delta;
        const vz = m.velocities[k].z * delta;
        posAttr.array[k * 3] += vx;
        posAttr.array[k * 3 + 1] += vy;
        posAttr.array[k * 3 + 2] += vz;
        // damp quickly
        m.velocities[k].multiplyScalar(Math.pow(0.2, delta * 60));
      }
      posAttr.needsUpdate = true;

      // fade out material
      if (m.mesh.material) m.mesh.material.opacity = Math.max(0, 1 - m.life / m.ttl);

      if (m.life >= m.ttl) {
        if (m.mesh.parent) m.mesh.parent.remove(m.mesh);
        m.mesh.geometry.dispose();
        m.mesh.material.dispose();
        this._muzzles.splice(i, 1);
      }
    }
  }

  _updateBackground(delta) {
    this._elapsed += delta;
    const camPos = this.camera.position;

    // Sun stays at fixed offset from camera — always in background
    this.sunLight.position.set(
      camPos.x + 2000,
      camPos.y + 1000,
      camPos.z - 3000
    );
    this.sunLight.target.position.copy(camPos);
    this.sunLight.target.updateMatrixWorld();
    this.sunMesh.position.copy(this.sunLight.position);

    // Animate sun glow sprite — gentle pulse like asteroid glows
    if (this.sunGlowSprite) {
      this.sunGlowSprite.position.copy(this.sunLight.position);
      const pulse = 1 + 0.08 * Math.sin(this._elapsed * 0.9);
      this.sunGlowSprite.scale.setScalar(3000 * pulse);
    }

    // Planet stays at fixed offset from camera — unreachable
    if (this.planet) {
      this.planet.position.set(
        camPos.x - 1200,
        camPos.y - 600,
        camPos.z - 3500
      );
      // Earth does not rotate
    }
  }

  _loadPlanet() {
    const texLoader = new THREE.TextureLoader();
    const texPath = '/textures/planet/';

    const diffuse = texLoader.load(texPath + 'Earth_Stylized.png');
    diffuse.colorSpace = THREE.SRGBColorSpace;
    const clouds = texLoader.load(texPath + 'Earth_Clouds_6K.jpg');

    // Main planet sphere
    const planetGeo = new THREE.SphereGeometry(1600, 64, 64);
    const planetMat = new THREE.MeshBasicMaterial({
      map: diffuse,
      fog: false,
    });
    this.planet = new THREE.Mesh(planetGeo, planetMat);
    this.planet.position.set(-1200, -600, -3500);
    this.scene.add(this.planet);

    // Cloud layer — slightly larger, transparent sphere
    const cloudGeo = new THREE.SphereGeometry(805, 64, 64);
    const cloudMat = new THREE.MeshBasicMaterial({
      alphaMap: clouds,
      transparent: true,
      opacity: 0.4,
      depthWrite: false,
      color: 0xffffff,
      fog: false,
    });
    this.cloudMesh = new THREE.Mesh(cloudGeo, cloudMat);
    this.planet.add(this.cloudMesh);
  }

  _onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }
}
