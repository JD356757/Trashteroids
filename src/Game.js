import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { Player } from './Player.js';
import { DebrisManager } from './DebrisManager.js';
import { SpecialDebrisManager } from './SpecialDebrisManager.js';
import { RecycleDebrisManager } from './RecycleDebrisManager.js';
import { ProjectileManager } from './ProjectileManager.js';
import { LevelManager, unlockLevel, recordLevelStars, LEVEL_FAILURE_DIALOGUES, LEVEL_BRIEFINGS } from './LevelManager.js';
import { getBriefing } from './LevelSelect.js';
import { InputHandler } from './InputHandler.js';
import { HUD } from './HUD.js';
import { Starfield } from './Starfield.js';
import { AsteroidField } from './AsteroidField.js';
import { soundtrackManager } from './AudioManager.js';
import { TunnelMaze } from './TunnelMaze.js';
import { getTunnelData } from './levels/tunnelRegistry.js';
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
const _cutsceneCamPos = new THREE.Vector3();
const _cutsceneCamTarget = new THREE.Vector3();
const _cutsceneDir = new THREE.Vector3();
const _cutsceneSurfacePoint = new THREE.Vector3();
const PLAYER_COLLISION_RADIUS = 1.1;
// Effective sphere radius for tunnel-wall push-out. Larger than the player
// hitbox so the camera (which trails ~22 units behind) and the displaced
// baked-mesh walls stay clear.
const TUNNEL_WALL_PLAYER_RADIUS = 55;
const ASTEROID_BOUNCE = 0.35;
const ASTEROID_SURFACE_FRICTION = 0.92;
const PLAYER_HIT_COOLDOWN = 1.0;
const PROJECTILE_HIT_PADDING = 0.45;
const AIM_FALLBACK_DISTANCE = 800;
const AIM_LOWERING = 0.035;
const MIN_AIM_DISTANCE = 1.0;
const BOOST_DRAIN_RATE = 0.38;
const BOOST_RECHARGE_RATE = 0.2;
const BASE_PLAYER_HEALTH = 100;
const BOSS_PLAYER_HEALTH_MULTIPLIER = 2;
const PLAYER_SENSITIVITY_STORAGE_KEY = 'trashteroid_mouse_sensitivity';
const ACCESSIBILITY_SETTINGS_STORAGE_KEY = 'trashteroid_accessibility_settings';
const DEFAULT_ACCESSIBILITY_SETTINGS = Object.freeze({
  reducedMotion: false,
  reducedFlashing: false,
  musicVisualizer: false,
});
const DISPLAY_DISTANCE_SCALE = 0.45;
const DISPLAY_KM_PER_MILE = 10;
const TUTORIAL_TIME_SCALE = 1.0;
const TUTORIAL_BEAT_TRANSITION_DELAY = 0.38;
const TUTORIAL_TIMED_BEAT_DURATION = 7;
const TRASHTEROID_APPROACH_DISTANCE_WORLD = 25000 / (DISPLAY_DISTANCE_SCALE * DISPLAY_KM_PER_MILE);
const TRASHTEROID_HIT_RADIUS = 55;
const TRASHTEROID_COLLISION_RADIUS_SCALE = 0.7;
const TRASHTEROID_SURFACE_OFFSET = 58;
const TRASHTEROID_BOSS_SPEED_MULTIPLIER = 0.7;
const TRASHTEROID_SCORE_PER_HIT = 35;
const TRASHTEROID_SCORE_ON_DESTROY = 5000;
const WRONG_BEAM_PENALTY = 2000;
const PLAYER_SHOOT_HITSCAN = true;
const BOOM_SFX_URL = '/boom.m4a';
const BOOM_SFX_POOL_SIZE = 6;
const BOOM_SFX_VOLUME = 0.72;
const BOOM_SFX_VOLUME_VARIATION = 0.14;
const BOOM_SFX_PITCH_VARIATION = 0.08;
const PICKUP_SFX_URL = '/pickup.m4a';
const PICKUP_SFX_POOL_SIZE = 6;
const PICKUP_SFX_VOLUME = 0.7;
const LEVEL_ENTRY_FADE_HOLD_MS = 280;
const LEVEL_ENTRY_FADE_MS = 420;
const LEVEL_COMPLETE_FADE_HOLD_MS = 220;
const LEVEL_COMPLETE_FADE_MS = 1000;
const LEVEL_COMPLETE_CONTROL_LOCK_SECONDS = 0.6;
const DEATH_SEQUENCE_DURATION = 1.25;
const DEATH_OVERLAY_REVEAL_DELAY = 0.36;
const GAME_OVER_RETURN_DELAY_MS = 2600;

// Trashteroid destruction cutscene timing
const CUTSCENE_CAMERA_FLY_IN = 1.6;
const CUTSCENE_SURFACE_EXPLOSIONS = 2.8;
const CUTSCENE_BIG_BANG_DELAY = 0.35;
const CUTSCENE_DEBRIS_LINGER = 2.4;
const CUTSCENE_SURFACE_EXPLOSION_INTERVAL = 0.12;
const CUTSCENE_DEBRIS_COUNT = 12;
const CUTSCENE_SPECIAL_DEBRIS_COUNT = 4;
const CUTSCENE_DEBRIS_EXPLODE_DELAY = 1.6;
const LEVEL_TRANSITION_FADE_DURATION = 0.7;
const LEVEL_TRANSITION_ENTRY_DURATION = 4.6;
const LEVEL_TRANSITION_EXIT_DURATION = 4.2;
const TUTORIAL_BEATS = {
  move: {
    title: 'Move & Look',
    message: 'Move the mouse to look around. Hold W to fly forward. Press Esc at any time to pause the game.',
    placement: 'center',
    requirements: [
      { id: 'look', label: 'Look around with the mouse' },
      { id: 'thrust', label: 'Hold W to fly forward' },
    ],
  },
  roll: {
    title: 'Roll',
    message: 'Press A or D while moving to roll your ship to the side.',
    placement: 'center',
    requirements: [
      { id: 'roll', label: 'Press A or D to roll' },
    ],
  },
  boost: {
    title: 'Boost',
    message: 'Hold Space while flying forward to boost. Use it wisely: it drains while active, and recharges when not in use.',
    placement: 'center',
    requirements: [
      { id: 'boost', label: 'Hold Space while moving forward' },
    ],
  },
  fire: {
    title: 'Vaporizer',
    message: 'Hold left click to fire the Vaporizer beam at trash!',
    placement: 'center',
    requirements: [
      { id: 'fire', label: 'Hold left click to fire the Vaporizer' },
      { id: 'trash', label: 'Destroy a piece of trash' },
    ],
  },
  special: {
    title: 'Special Trash',
    message: 'Special types of trash, outlined in yellow, give you a huge bonus when vaporized. However, they are much rarer, so you\'ll have to search for them!',
    placement: 'center',
    requirements: [
      { id: 'special-trash', label: 'Destroy 1 special piece of trash' },
    ],
  },
  recycle: {
    title: 'Recyclables',
    message: 'Blue-outlined bins are recyclable. Fly straight into them to scoop them up.',
    placement: 'center',
    requirements: [
      { id: 'recycle-collected', label: 'Fly into 1 recyclable to collect it' },
    ],
  },
  penalty: {
    title: 'Penalties',
    message: 'Do not vaporize the blue recyclables. If you do, you will lose some of your score!',
    placement: 'center',
  },
  crashing: {
    title: 'Crashing',
    message: 'Don\'t crash into space rocks or trash... it hurts!',
    placement: 'bottom',
  },
  objectives: {
    title: 'Objectives',
    message: 'Look at the top-left to view your objectives. Some are optional, but to earn three stars you must complete them too. You can press the escape key at any time to pause the game. That\'s it for the tutorial... you\'re on your own now!',
    placement: 'top-left',
  },
};

function toWorldSpeed(displaySpeed) {
  return displaySpeed / DISPLAY_DISTANCE_SCALE;
}

function toWorldDistance(displayDistance) {
  return displayDistance / (DISPLAY_DISTANCE_SCALE * DISPLAY_KM_PER_MILE);
}

function toDisplayDistance(worldDistance) {
  const kmDistance = Math.max(0, worldDistance * DISPLAY_DISTANCE_SCALE * DISPLAY_KM_PER_MILE);
  const roundStep = kmDistance >= 1000 ? 100 : kmDistance >= 100 ? 10 : kmDistance >= 20 ? 5 : 1;
  return Math.round(kmDistance / roundStep) * roundStep;
}

// Earth sits behind the player (positive Z, with camera-relative offset)
// so launching from Earth visually maps to "fly forward, Earth recedes
// behind you." Sun is kept on the far side of the background from Earth.
const EARTH_BACKGROUND_OFFSET = new THREE.Vector3(-1200, -600, 3500);
const EARTH_ROTATION_X = Math.PI/10;
const EARTH_ROTATION_Y =  - Math.PI / 3;
const EARTH_ROTATION_Z = 0;
const EARTH_SPIN_SPEED = 0.045;
// Keep the sun well separated from Earth in screen direction.
const SUN_BACKGROUND_OFFSET = new THREE.Vector3(1800, 900, 3600);
const VISIBLE_SUN_BACKGROUND_OFFSET = SUN_BACKGROUND_OFFSET.clone().setLength(80000);
const VISIBLE_SUN_SCALE = VISIBLE_SUN_BACKGROUND_OFFSET.length() / SUN_BACKGROUND_OFFSET.length();
const SUN_BACKGROUND_RENDER_ORDER = -1500;

// Simple object pool to reduce memory allocations during collision detection
class Vector3Pool {
  constructor(initialSize = 256) {
    this._available = [];
    this._inUse = new Set();
    for (let i = 0; i < initialSize; i++) {
      this._available.push(new THREE.Vector3());
    }
  }

  acquire() {
    let v;
    if (this._available.length > 0) {
      v = this._available.pop();
    } else {
      v = new THREE.Vector3();
    }
    this._inUse.add(v);
    return v;
  }

  release(v) {
    if (this._inUse.has(v)) {
      this._inUse.delete(v);
      this._available.push(v);
    }
  }

  releaseAll() {
    this._inUse.forEach(v => this._available.push(v));
    this._inUse.clear();
  }

  dispose() {
    this._available.length = 0;
    this._inUse.clear();
  }
}

// Easing functions for smooth animations
const Easing = {
  linear: (t) => t,
  easeInOut: (t) => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t,
  easeOut: (t) => 1 - Math.pow(1 - t, 3),
  easeIn: (t) => t * t * t,
  easeOutQuart: (t) => 1 - Math.pow(1 - t, 4),
  easeInOutQuart: (t) => t < 0.5 ? 8 * t * t * t * t : 1 - 8 * (--t) * t * t * t,
};

export class Game {
  constructor(canvas, startLevel = 1, options = {}) {
    this.canvas = canvas;
    this.running = false;
    this._elapsed = 0;
    this.score = 0;
    this._playerMaxHealth = BASE_PLAYER_HEALTH;
    this.lives = this._playerMaxHealth;
    this.playerHitCooldown = 0;
    this.boostCharge = 1;
    this.boostActive = false;
    this.paused = false;
    this.shotsFired = 0;
    this.trashHits = 0;
    this._pauseUnlockArmed = false;
    this._startLevel = startLevel;
    this._tutorialMode = this._startLevel === 1;
    this._onReturnToLevelSelect = options.onReturnToLevelSelect ?? null;
    this._onHideLevelSelect = options.onHideLevelSelect ?? null;
    this._returnToLevelSelectTimeout = null;
    this._screenFadeEl = document.getElementById('screen-fade');
    this._levelEntryFadeToken = 0;
    this._levelEntryFadeHoldTimeout = null;
    this._levelEntryFadeSafetyTimeout = null;
    this._levelCompleteFadeToken = 0;
    this._levelCompleteFadeHoldTimeout = null;
    this._levelCompleteFadeSafetyTimeout = null;
    this._deathSequenceActive = false;
    this._gameOverActive = false;
    this._timedOut = false;
    this._deathSequenceTimer = 0;
    this._deathOverlayShown = false;
    this._destructionCutscene = null;
    this._transitionCutscene = null;
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
    this._specialTrashDestroyed = 0;
    this._weakSpotsDestroyed = 0;
    this._bonusFastThresholdWorld = toWorldSpeed(200);
    this._levelComplete = false;
    this._levelCompleteControlLockRemaining = 0;
    this._pendingLevelCompleteSummary = null;
    this._scoreCounterRaf = null;
    this._debriefDialogue = null;
    this._levelStatsSummary = null;
    this._commsAdvanceClickHandler = null;
    this._commsAdvanceKeyHandler = null;
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

    // Performance: Vector pool for collision detection
    this._vectorPool = new Vector3Pool(512);

    // Camera — extend far plane for distant planet
    this.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 10, 200000);
    this.camera.position.set(0, 3, 20);

    // Lighting — replace generic directional with a sun
    // AMBIENT_INTENSITY: controls overall scene brightness (0 = dark, 2 = bright)
    const AMBIENT_INTENSITY = 0.2;
    const ambient = new THREE.AmbientLight(0xffffff, AMBIENT_INTENSITY);
    this.scene.add(ambient);
    this.ambientLight = ambient;

    // Subtle hemisphere fill to give shadowed sides some color/blend
    const hemi = new THREE.HemisphereLight(0x666688, 0x111122, 0.12);
    this.scene.add(hemi);
    this.hemiLight = hemi;

    // Sun — a warm directional light from far away, locked in the background
    this.sunLight = new THREE.DirectionalLight(0xfff5e0, 2);
    this.sunLight.position.copy(SUN_BACKGROUND_OFFSET);
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
    const sunMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      fog: false,
      depthTest: true,
      depthWrite: false,
    });
    this.sunMesh = new THREE.Mesh(sunGeo, sunMat);
    this.sunMesh.scale.setScalar(VISIBLE_SUN_SCALE);
    this.sunMesh.position.copy(VISIBLE_SUN_BACKGROUND_OFFSET);
    this.sunMesh.frustumCulled = false;
    this.sunMesh.renderOrder = SUN_BACKGROUND_RENDER_ORDER;
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
      depthTest: true,
      depthWrite: false,
      transparent: true,
      fog: false,
    });
    this.sunGlowSprite = new THREE.Sprite(sunGlowMat);
    this.sunGlowSprite.scale.setScalar(700 * VISIBLE_SUN_SCALE);  // base halo size
    this.sunGlowSprite.position.copy(VISIBLE_SUN_BACKGROUND_OFFSET);
    this.sunGlowSprite.frustumCulled = false;
    this.sunGlowSprite.renderOrder = SUN_BACKGROUND_RENDER_ORDER + 1;
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
    this._boomSfxPool = [];
    this._boomSfxCursor = 0;
    for (let i = 0; i < BOOM_SFX_POOL_SIZE; i++) {
      const boomSfx = document.createElement('audio');
      boomSfx.src = BOOM_SFX_URL;
      boomSfx.preload = 'auto';
      boomSfx.crossOrigin = 'anonymous';
      boomSfx.volume = BOOM_SFX_VOLUME;
      this._boomSfxPool.push(boomSfx);
    }
    this._pickupSfxPool = [];
    this._pickupSfxCursor = 0;
    for (let i = 0; i < PICKUP_SFX_POOL_SIZE; i++) {
      const pickupSfx = document.createElement('audio');
      pickupSfx.src = PICKUP_SFX_URL;
      pickupSfx.preload = 'auto';
      pickupSfx.crossOrigin = 'anonymous';
      pickupSfx.volume = PICKUP_SFX_VOLUME;
      this._pickupSfxPool.push(pickupSfx);
    }
    this._enemyTrashProjectileGeometriesByType = {
      normal: [
        new THREE.BoxGeometry(1.25, 0.95, 1.6),
        new THREE.CylinderGeometry(0.45, 0.7, 1.45, 9),
        new THREE.DodecahedronGeometry(0.92, 0),
      ],
      special: [
        new THREE.ConeGeometry(0.72, 1.75, 7),
        new THREE.SphereGeometry(0.92, 10, 10),
      ],
      recycle: [
        new THREE.TorusGeometry(0.74, 0.24, 8, 14),
        new THREE.CylinderGeometry(0.5, 0.5, 1.5, 12),
      ],
    };
    this._enemyProjectileTypeCycle = [];
    this._enemyProjectileTypeCursor = 0;
    this._trashteroid = this._createTrashteroid();

    // Large decorative asteroid field around the player zone
    this.asteroidField = new AsteroidField(this.scene);

    // Planet — large Earth in the background, unreachable
    this._loadPlanet();

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
    soundtrackManager.setInLevel(true);
    this.running = true;
    this.clock.start();
    this._resetTutorialState();
    this._enterLevel(this._startLevel, { resetPlayerPosition: true });
    const hasBriefing = (LEVEL_BRIEFINGS[this._startLevel]?.length ?? 0) > 0;
    if (hasBriefing) {
      this.paused = true;
      this._showLevelOpeningBriefing(this._startLevel);
    }
    this._loop();
  }

  dispose() {
    soundtrackManager.setInLevel(false);
    soundtrackManager.setBoosting(false);
    soundtrackManager.setThrusting(false);
    this.running = false;
    this.paused = true;
    this.boostActive = false;
    this._gameOverActive = false;
    this._timedOut = false;
    this._destructionCutscene = null;
    this._cancelLevelEntryFade();
    this._cancelLevelCompleteTransition();
    this._clearScheduledReturnToLevelSelect();
    this.projectiles.clear();
    this.debris.clear();
    this.specialDebris.clear();
    this.recycleDebris.clear();
    this._clearTrashteroidProjectiles();
    this._clearTransientEffects();
    this._teardownTunnelMaze();
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
    for (let i = 0; i < this._boomSfxPool.length; i++) {
      const boomSfx = this._boomSfxPool[i];
      boomSfx.pause();
      boomSfx.currentTime = 0;
    }
    for (let i = 0; i < this._pickupSfxPool.length; i++) {
      const pickupSfx = this._pickupSfxPool[i];
      pickupSfx.pause();
      pickupSfx.currentTime = 0;
    }
    this._cleanupCommsHandlers();
    this._debriefDialogue = null;
    this._levelCompleteEl?.classList.add('hidden');
    this.hud.overlay?.classList.add('hidden');
    this._disposeTransitionCutscene();
    if (document.pointerLockElement === this.canvas) {
      document.exitPointerLock();
    }
    this._vectorPool?.dispose?.();
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

    this._pauseMasterVolumeInput = document.getElementById('pause-master-volume');
    this._pauseMasterVolumeValue = document.getElementById('pause-master-volume-value');
    this._pauseMusicVolumeInput = document.getElementById('pause-music-volume');
    this._pauseMusicVolumeValue = document.getElementById('pause-music-volume-value');
    this._pauseSfxVolumeInput = document.getElementById('pause-sfx-volume');
    this._pauseSfxVolumeValue = document.getElementById('pause-sfx-volume-value');

    this._pauseMasterVolumeInput?.addEventListener('input', () => {
      const v = Number(this._pauseMasterVolumeInput.value);
      soundtrackManager.setMasterVolume(v / 100);
      if (this._pauseMasterVolumeValue) this._pauseMasterVolumeValue.textContent = `${v}`;
    });
    this._pauseMusicVolumeInput?.addEventListener('input', () => {
      const v = Number(this._pauseMusicVolumeInput.value);
      soundtrackManager.setMusicVolume(v / 100);
      if (this._pauseMusicVolumeValue) this._pauseMusicVolumeValue.textContent = `${v}`;
    });
    this._pauseSfxVolumeInput?.addEventListener('input', () => {
      const v = Number(this._pauseSfxVolumeInput.value);
      soundtrackManager.setSfxVolume(v / 100);
      if (this._pauseSfxVolumeValue) this._pauseSfxVolumeValue.textContent = `${v}`;
    });
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

    const vols = soundtrackManager.getVolumeSettings();
    if (this._pauseMasterVolumeInput) {
      this._pauseMasterVolumeInput.value = `${vols.master}`;
      if (this._pauseMasterVolumeValue) this._pauseMasterVolumeValue.textContent = `${vols.master}`;
    }
    if (this._pauseMusicVolumeInput) {
      this._pauseMusicVolumeInput.value = `${vols.music}`;
      if (this._pauseMusicVolumeValue) this._pauseMusicVolumeValue.textContent = `${vols.music}`;
    }
    if (this._pauseSfxVolumeInput) {
      this._pauseSfxVolumeInput.value = `${vols.sfx}`;
      if (this._pauseSfxVolumeValue) this._pauseSfxVolumeValue.textContent = `${vols.sfx}`;
    }
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

  _setScreenFadeDuration(durationMs) {
    if (!this._screenFadeEl) return;
    const clamped = Math.max(0, Math.floor(durationMs));
    this._screenFadeEl.style.setProperty('--screen-fade-duration', `${clamped}ms`);
  }

  _cancelLevelCompleteTransition() {
    if (this._levelCompleteFadeHoldTimeout != null) {
      window.clearTimeout(this._levelCompleteFadeHoldTimeout);
      this._levelCompleteFadeHoldTimeout = null;
    }
    if (this._levelCompleteFadeSafetyTimeout != null) {
      window.clearTimeout(this._levelCompleteFadeSafetyTimeout);
      this._levelCompleteFadeSafetyTimeout = null;
    }
  }

  _showLevelEntryFade() {
    if (!this._screenFadeEl) return;

    this._cancelLevelEntryFade();
    this._setScreenFadeDuration(LEVEL_ENTRY_FADE_MS);
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

  _runScreenFadeMidpoint(midpoint, durationMs = LEVEL_ENTRY_FADE_MS) {
    if (!this._screenFadeEl) {
      midpoint?.();
      return;
    }

    const fadeMs = Math.max(0, Math.floor(durationMs));
    this._setScreenFadeDuration(fadeMs);
    this._screenFadeEl.classList.remove('hidden');
    this._screenFadeEl.classList.add('visible');

    window.setTimeout(() => {
      midpoint?.();
      requestAnimationFrame(() => {
        this._screenFadeEl.classList.remove('visible');
        const finish = () => {
          this._screenFadeEl.classList.add('hidden');
        };
        this._screenFadeEl.addEventListener('transitionend', finish, { once: true });
        window.setTimeout(finish, fadeMs + 100);
      });
    }, fadeMs);
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

  _playBoomSfx() {
    if (!this._boomSfxPool.length) return;

    let selected = null;
    for (let i = 0; i < this._boomSfxPool.length; i++) {
      const index = (this._boomSfxCursor + i) % this._boomSfxPool.length;
      const candidate = this._boomSfxPool[index];
      if (candidate.paused || candidate.ended) {
        selected = candidate;
        this._boomSfxCursor = (index + 1) % this._boomSfxPool.length;
        break;
      }
    }

    if (!selected) {
      selected = this._boomSfxPool[this._boomSfxCursor];
      this._boomSfxCursor = (this._boomSfxCursor + 1) % this._boomSfxPool.length;
    }

    const volumeJitter = (Math.random() - 0.5) * BOOM_SFX_VOLUME_VARIATION;
    const pitchJitter = (Math.random() - 0.5) * BOOM_SFX_PITCH_VARIATION;
    selected.volume = THREE.MathUtils.clamp((BOOM_SFX_VOLUME + volumeJitter) * soundtrackManager.getSfxMultiplier(), 0, 1);
    selected.playbackRate = THREE.MathUtils.clamp(1 + pitchJitter, 0.85, 1.2);
    selected.currentTime = 0;
    selected.play().catch(() => {
      // Ignore autoplay/gesture restrictions and continue gameplay.
    });
  }

  _playPickupSfx() {
    if (!this._pickupSfxPool.length) return;

    let selected = null;
    for (let i = 0; i < this._pickupSfxPool.length; i++) {
      const index = (this._pickupSfxCursor + i) % this._pickupSfxPool.length;
      const candidate = this._pickupSfxPool[index];
      if (candidate.paused || candidate.ended) {
        selected = candidate;
        this._pickupSfxCursor = (index + 1) % this._pickupSfxPool.length;
        break;
      }
    }

    if (!selected) {
      selected = this._pickupSfxPool[this._pickupSfxCursor];
      this._pickupSfxCursor = (this._pickupSfxCursor + 1) % this._pickupSfxPool.length;
    }

    selected.volume = PICKUP_SFX_VOLUME;
    selected.playbackRate = 1;
    selected.currentTime = 0;
    selected.play().catch(() => {
      // Ignore autoplay/gesture restrictions and continue gameplay.
    });
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
      hitRadius: TRASHTEROID_HIT_RADIUS - 6,
      collisionRadius: TRASHTEROID_HIT_RADIUS,
      active: false,
      mode: 'approach',
      time: 0,
      shotCooldown: 0,
      attackType: null,
      attackStepsRemaining: 0,
      streamMuzzleDir: null,
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
    this._deathSequenceActive = false;
    this._gameOverActive = false;
    this._timedOut = false;
    this._deathSequenceTimer = 0;
    this._deathOverlayShown = false;
    this._destructionCutscene = null;
    this.player.mesh.visible = true;

    if (resetPosition) {
      this.player.mesh.position.set(0, 0, 10);
      this.player.baseQuaternion.identity();
    }

    this.player.mesh.quaternion.copy(this.player.baseQuaternion);
    this._prevPlayerPos.copy(this.player.mesh.position);

    if (typeof this.hud?.setDeathVignette === 'function') {
      this.hud.setDeathVignette(false);
    }
  }

  _buildTunnelMaze(key, levelConfig = null) {
    const data = getTunnelData(key);
    if (!data) {
      console.warn(`TunnelMaze data not found for key "${key}"`);
      return;
    }
    const bakedMeshUrl = levelConfig?.bakedMeshUrl ?? null;
    this._tunnelMaze = new TunnelMaze(this.scene, data, {
      debug: !bakedMeshUrl,
      bakedMeshUrl,
    });
    const start = data.playerStart;
    if (start && Array.isArray(start.pos)) {
      this.player.mesh.position.fromArray(start.pos);
      this.player.velocity.set(0, 0, 0);
      if (Array.isArray(start.lookAt)) {
        const lookAt = new THREE.Vector3().fromArray(start.lookAt);
        const forward = lookAt.sub(this.player.mesh.position).normalize();
        if (forward.lengthSq() > 0) {
          const defaultForward = new THREE.Vector3(0, 0, -1);
          this.player.baseQuaternion.setFromUnitVectors(defaultForward, forward);
          this.player.mesh.quaternion.copy(this.player.baseQuaternion);
        }
      }
      this._prevPlayerPos.copy(this.player.mesh.position);
    }
  }

  _teardownTunnelMaze() {
    if (this._tunnelMaze) {
      this._tunnelMaze.dispose();
      this._tunnelMaze = null;
    }
  }

  _setExteriorLightingForInterior(interior) {
    // Stash the exterior fog/background and sun/ambient settings the first
    // time we swap to interior mode, then restore them on the way out.
    // Now with smooth easing over 0.5s
    if (interior) {
      if (this._exteriorLightingState == null) {
        this._exteriorLightingState = {
          fog: this.scene.fog,
          background: this.scene.background,
          sunIntensity: this.sunLight?.intensity ?? 0,
          ambientIntensity: this.ambientLight?.intensity ?? 0,
          hemiIntensity: this.hemiLight?.intensity ?? 0,
          sunMeshVisible: this.sunMesh?.visible ?? true,
          sunGlowVisible: this.sunGlowSprite?.visible ?? true,
        };

        // Start lighting transition animation (0.5s)
        this._lightingTransitionStart = this._elapsed;
        this._lightingTransitionDuration = 0.5;
        this._lightingTransitionTarget = 'interior';
      }
    } else if (this._exteriorLightingState) {
      const s = this._exteriorLightingState;
      
      // Start transition back to exterior (0.5s)
      this._lightingTransitionStart = this._elapsed;
      this._lightingTransitionDuration = 0.5;
      this._lightingTransitionTarget = 'exterior';
      this._exteriorLightingState = null;
    }
  }

  _updateLightingTransition(delta) {
    if (!this._lightingTransitionStart && this._lightingTransitionStart !== 0) return;

    const elapsed = this._elapsed - this._lightingTransitionStart;
    const t = Math.min(1, elapsed / this._lightingTransitionDuration);
    const eased = Easing.easeInOut(t);

    if (this._lightingTransitionTarget === 'interior') {
      // Transition to interior
      if (this.sunLight) this.sunLight.intensity = (1 - eased) * (this._exteriorLightingState?.sunIntensity ?? 0);
      if (this.ambientLight) this.ambientLight.intensity = (1 - eased) * (this._exteriorLightingState?.ambientIntensity ?? 0);
      if (this.hemiLight) this.hemiLight.intensity = (1 - eased) * (this._exteriorLightingState?.hemiIntensity ?? 0);
    } else if (this._lightingTransitionTarget === 'exterior' && this._exteriorLightingState) {
      // Transition to exterior
      if (this.sunLight) this.sunLight.intensity = eased * (this._exteriorLightingState.sunIntensity ?? 0);
      if (this.ambientLight) this.ambientLight.intensity = eased * (this._exteriorLightingState.ambientIntensity ?? 0);
      if (this.hemiLight) this.hemiLight.intensity = eased * (this._exteriorLightingState.hemiIntensity ?? 0);
    }

    // Final snap at end of transition
    if (t >= 1) {
      if (this._lightingTransitionTarget === 'interior') {
        this.scene.fog = new THREE.FogExp2(0x07050a, 0.00045);
        this.scene.background = new THREE.Color(0x05030a);
        if (this.sunLight) this.sunLight.intensity = 0;
        if (this.ambientLight) this.ambientLight.intensity = 0;
        if (this.hemiLight) this.hemiLight.intensity = 0;
        if (this.sunMesh) this.sunMesh.visible = false;
        if (this.sunGlowSprite) this.sunGlowSprite.visible = false;
      } else if (this._lightingTransitionTarget === 'exterior' && this._exteriorLightingState) {
        const s = this._exteriorLightingState;
        this.scene.fog = s.fog;
        this.scene.background = s.background;
        if (this.sunLight) this.sunLight.intensity = s.sunIntensity;
        if (this.ambientLight) this.ambientLight.intensity = s.ambientIntensity;
        if (this.hemiLight) this.hemiLight.intensity = s.hemiIntensity;
        if (this.sunMesh) this.sunMesh.visible = s.sunMeshVisible;
        if (this.sunGlowSprite) this.sunGlowSprite.visible = s.sunGlowVisible;
        this._exteriorLightingState = null;
      }
      this._lightingTransitionStart = null;
      this._lightingTransitionTarget = null;
    }
  }

  _setAsteroidFieldVisible(visible) {
    const instances = this.asteroidField?.instances;
    if (!instances) return;
    for (const inst of instances) {
      if (inst.mesh) inst.mesh.visible = visible;
    }
  }

  _resolveTunnelPlayerCollision(delta) {
    const maze = this._tunnelMaze;
    if (!maze || typeof maze.pushOutSphere !== 'function') return;

    this._tunnelWallCooldown = Math.max(0, (this._tunnelWallCooldown ?? 0) - delta);

    if (!this._tunnelCollisionResult) {
      this._tunnelCollisionResult = {
        pos: new THREE.Vector3(),
        normal: new THREE.Vector3(),
        hit: false,
      };
    }
    const result = this._tunnelCollisionResult;
    const playerPos = this.player.mesh.position;
    maze.pushOutSphere(playerPos, TUNNEL_WALL_PLAYER_RADIUS, result);
    if (!result.hit) return;

    playerPos.copy(result.pos);

    // Reflect velocity along inward normal (bounce with restitution)
    const v = this.player.velocity;
    const vDotN = v.x * result.normal.x + v.y * result.normal.y + v.z * result.normal.z;
    if (vDotN < 0) {
      const reflect = -vDotN * (1 + ASTEROID_BOUNCE);
      v.x += result.normal.x * reflect;
      v.y += result.normal.y * reflect;
      v.z += result.normal.z * reflect;
    }

    // Small shield drain on scrape; cooldown-gated so continuous scraping
    // doesn't drain instantly.
    if (this._tunnelWallCooldown <= 0 && this.playerHitCooldown <= 0 && this.lives > 0) {
      const damage = 2;
      this.lives = Math.max(0, this.lives - damage);
      this._tunnelWallCooldown = 0.45;
      if (this.hud) {
        if (typeof this.hud.flashDamage === 'function') this.hud.flashDamage();
        if (typeof this.hud.setLowHealth === 'function') {
          this.hud.setLowHealth(this._getPlayerHullPercent() <= 20);
        }
      }
      if (this.lives <= 0 && !this._deathSequenceActive && !this._gameOverActive) {
        this._startGameOverSequence();
      }
    }
  }

  _resolveTunnelProjectileCollisions() {
    const maze = this._tunnelMaze;
    if (!maze || typeof maze.segmentVsWalls !== 'function') return;

    const projectiles = this.projectiles?.getActive?.();
    if (!projectiles || projectiles.length === 0) return;

    if (!this._projectileWallResult) {
      this._projectileWallResult = {
        hit: false,
        t: 0,
        point: new THREE.Vector3(),
        normal: new THREE.Vector3(),
      };
    }
    const result = this._projectileWallResult;

    const weakSpots = typeof maze.getWeakSpots === 'function' ? maze.getWeakSpots() : null;

    for (let i = projectiles.length - 1; i >= 0; i--) {
      const p = projectiles[i];
      if (p.moveDelayFrames > 0) continue;

      // Check weak spots first — they sit inward of the walls, so a bullet
      // that hits a spot necessarily hits it before reaching the wall.
      let consumedBySpot = false;
      if (weakSpots) {
        for (let j = 0; j < weakSpots.length; j++) {
          const ws = weakSpots[j];
          if (!ws.alive) continue;
          if (this._segmentIntersectsSphere(p.prevPosition, p.position, ws.mesh.position, ws.hitRadius)) {
            const hitPoint = _closestPoint.clone();
            const damage = 20;
            const outcome = maze.damageWeakSpot(j, damage);
            if (outcome.destroyed) {
              this._weakSpotsDestroyed = (this._weakSpotsDestroyed ?? 0) + 1;
              this._spawnExplosion(ws.mesh.position.clone(), {
                count: 90,
                ttl: 2.2,
                sizeScale: 6.5,
                velocityScale: 9.6,
                smokeSizeMultiplier: 4.5,
              });
              this._playBoomSfx();
              this.score += 500;
            } else {
              this._spawnSparks(hitPoint, {
                count: 22,
                speed: 28,
                ttl: 0.55,
                color: 0xff5544,
                colorEnd: 0x330000,
                size: 1.4,
              });
            }
            this.projectiles.remove(i);
            consumedBySpot = true;
            break;
          }
        }
      }
      if (consumedBySpot) continue;

      maze.segmentVsWalls(p.prevPosition, p.position, result);
      if (result.hit) {
        this._spawnSparks(result.point.clone(), {
          count: 14,
          speed: 18,
          ttl: 0.4,
          color: 0xffb070,
          colorEnd: 0x331100,
          size: 1.1,
        });
        this.projectiles.remove(i);
      }
    }
  }

  _getPlayerMaxHealthForLevel(levelConfig) {
    return levelConfig?.boss
      ? BASE_PLAYER_HEALTH * BOSS_PLAYER_HEALTH_MULTIPLIER
      : BASE_PLAYER_HEALTH;
  }

  _getPlayerHullPercent() {
    const maxHealth = Math.max(1, this._playerMaxHealth || BASE_PLAYER_HEALTH);
    return THREE.MathUtils.clamp((this.lives / maxHealth) * 100, 0, 100);
  }

  _enterLevel(levelNumber, { resetPlayerPosition = false, resetRunStats = false } = {}) {
    const levelConfig = this.levels.getConfig(levelNumber);
    const mission = levelConfig.mission ?? {};
    const fastSpeedDisplay = mission.bonus?.fastSpeedDisplay ?? 200;
    const previousMaxHealth = this._playerMaxHealth;
    this._playerMaxHealth = this._getPlayerMaxHealthForLevel(levelConfig);

    this._clearScheduledReturnToLevelSelect();
    this._cancelLevelCompleteTransition();
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
    this._specialTrashDestroyed = 0;
    this._weakSpotsDestroyed = 0;
    this._bonusFastThresholdWorld = toWorldSpeed(fastSpeedDisplay);
    this._levelCompleteControlLockRemaining = 0;
    this._pendingLevelCompleteSummary = null;
    if (this._scoreCounterRaf) {
      cancelAnimationFrame(this._scoreCounterRaf);
      this._scoreCounterRaf = null;
    }

    if (resetRunStats) {
      this.score = 0;
      this.lives = this._playerMaxHealth;
      this.shotsFired = 0;
      this.trashHits = 0;
    } else if (previousMaxHealth > 0 && previousMaxHealth !== this._playerMaxHealth) {
      const hullRatio = THREE.MathUtils.clamp(this.lives / previousMaxHealth, 0, 1);
      this.lives = Math.round(hullRatio * this._playerMaxHealth);
    }
    this.lives = THREE.MathUtils.clamp(this.lives, 0, this._playerMaxHealth);

    this.projectiles.clear();
    this.debris.clear();
    this.specialDebris.clear();
    this.recycleDebris.clear();
    this._clearTransientEffects();
    this._resetPlayerState(resetPlayerPosition);
    this._teardownTunnelMaze();
    if (levelConfig.interior && levelConfig.tunnelData) {
      this._buildTunnelMaze(levelConfig.tunnelData, levelConfig);
    }
    this._setAsteroidFieldVisible(!levelConfig.interior);
    this._setExteriorLightingForInterior(!!levelConfig.interior);
    this._configureTrashteroidForLevel(levelConfig);
    this.hud.setGameplayVisible(true);
    this.hud.setBossBarVisible(!!levelConfig.boss);
    this.hud.updateBossIndicator(false, 0, 0, 0, 0);
    this.score = Math.max(0, this.score);
    this.hud.update(this.score, this.levels.current, this._getPlayerHullPercent());
    this.hud.updateTimer(this._levelTimer);
    this.hud.updateObjectives(this._getMissionObjectiveState(false).objectives);
    this._refreshPauseMenu();
    this._showLevelEntryFade();
  }

  _configureTrashteroidForLevel(levelConfig) {
    const primary = levelConfig.mission?.primary ?? {};
    const bossConfig = levelConfig.boss ?? null;
    const trashteroid = this._trashteroid;
    const configuredScale = Math.max(0.1, levelConfig.trashteroidScale ?? bossConfig?.bossScale ?? 1);
    const hitRadius = TRASHTEROID_HIT_RADIUS * configuredScale;
    const collisionRadius = bossConfig
      ? (bossConfig.collisionRadius ?? TRASHTEROID_HIT_RADIUS) * configuredScale * TRASHTEROID_COLLISION_RADIUS_SCALE
      : (TRASHTEROID_HIT_RADIUS - 6) * configuredScale * TRASHTEROID_COLLISION_RADIUS_SCALE;
    const startDistanceDisplay = levelConfig.trashteroidStartDistanceDisplay ?? bossConfig?.startDistanceDisplay ?? null;

    this._clearTrashteroidProjectiles();

    if (!primary.reachTrashteroid && !primary.destroyTrashteroid) {
      trashteroid.active = false;
      trashteroid.group.visible = false;
      this.hud.setBossBarVisible(false);
      return;
    }

    _shipForward.set(0, 0, -1).applyQuaternion(this.player.baseQuaternion).normalize();
    const startDistance = startDistanceDisplay != null
      ? toWorldDistance(startDistanceDisplay) + collisionRadius
      : (bossConfig?.startDistance ?? TRASHTEROID_APPROACH_DISTANCE_WORLD);

    trashteroid.group.position.copy(this.player.mesh.position).addScaledVector(_shipForward, startDistance);
    trashteroid.anchor.copy(trashteroid.group.position);
    trashteroid.prevPosition.copy(trashteroid.group.position);
    trashteroid.group.rotation.set(0, 0, 0);
    trashteroid.health = bossConfig?.maxHealth ?? 1;
    trashteroid.maxHealth = bossConfig?.maxHealth ?? 1;
    trashteroid.active = true;
    trashteroid.mode = bossConfig ? 'boss' : 'approach';
    trashteroid.time = 0;
    trashteroid.shotCooldown = bossConfig ? bossConfig.shotInterval * 2.4 : 0;
    trashteroid.attackType = null;
    trashteroid.attackStepsRemaining = 0;
    trashteroid.streamMuzzleDir = null;
    trashteroid.group.visible = true;
    this._disableTrashteroidFrustumCulling();

    if (bossConfig) {
      trashteroid.group.scale.setScalar(configuredScale);
      trashteroid.hitRadius = hitRadius;
      trashteroid.collisionRadius = collisionRadius;
      trashteroid.surfaceOffset = TRASHTEROID_SURFACE_OFFSET * configuredScale;
      // Start the trashteroid already moving towards Earth
      _bossMoveDelta.set(-1200, -600, 3500).normalize();
      trashteroid.velocity.copy(_bossMoveDelta).multiplyScalar(
        toWorldSpeed(150)
      );
      trashteroid.cooldownHalved = false;
      this.hud.updateBossBar(trashteroid.health, trashteroid.maxHealth);
    } else {
      trashteroid.group.scale.setScalar(configuredScale);
      trashteroid.hitRadius = hitRadius;
      trashteroid.collisionRadius = collisionRadius;
      trashteroid.surfaceOffset = TRASHTEROID_SURFACE_OFFSET * configuredScale;
      trashteroid.velocity.set(0, 0, 0);
      trashteroid.cooldownHalved = false;
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

  _nextEnemyProjectileType() {
    if (this._enemyProjectileTypeCursor >= this._enemyProjectileTypeCycle.length) {
      this._enemyProjectileTypeCycle = [];
      for (let i = 0; i < 50; i++) this._enemyProjectileTypeCycle.push('normal');
      this._enemyProjectileTypeCycle.push('special');
      for (let i = 0; i < 5; i++) this._enemyProjectileTypeCycle.push('recycle');

      // Shuffle each cycle so order stays unpredictable while preserving exact ratios.
      for (let i = this._enemyProjectileTypeCycle.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const tmp = this._enemyProjectileTypeCycle[i];
        this._enemyProjectileTypeCycle[i] = this._enemyProjectileTypeCycle[j];
        this._enemyProjectileTypeCycle[j] = tmp;
      }
      this._enemyProjectileTypeCursor = 0;
    }

    const type = this._enemyProjectileTypeCycle[this._enemyProjectileTypeCursor];
    this._enemyProjectileTypeCursor += 1;
    return type;
  }

  _spawnTrashteroidProjectile(origin, direction, speed, ttl) {
    const projectileType = this._nextEnemyProjectileType();
    const launchSpeed = speed * (0.92 + Math.random() * 0.16);
    const scaleMultiplier = 2.2;

    if (projectileType === 'special') {
      return this.specialDebris.spawnDirected(origin, direction, launchSpeed, {
        scaleMultiplier,
      });
    }

    if (projectileType === 'recycle') {
      return this.recycleDebris.spawnDirected(origin, direction, launchSpeed, {
        scaleMultiplier,
      });
    }

    return this.debris.spawnDirected(origin, direction, launchSpeed, {
      scaleMultiplier,
    });
  }

  _spawnTrashteroidBreakoffExplosion(muzzleWorldPos, trashteroid, scale = 1) {
    const localBreakoffPos = muzzleWorldPos.clone();
    trashteroid.group.worldToLocal(localBreakoffPos);
    this._spawnExplosion(localBreakoffPos, {
      count: 220,
      ttl: 1.4,
      sizeScale: 10 * scale,
      smokeSizeMultiplier: 0.12,
      velocityScale: 0.1 * scale,
      parent: trashteroid.group,
      positionIsLocal: true,
    });
  }

  _fireTrashteroidBurst(bossConfig, options = {}) {
    const trashteroid = this._trashteroid;
    if (!trashteroid?.active) return;
    const lockSpawnPoint = !!options.lockSpawnPoint;
    const forceDirectTracking = !!options.forceDirectTracking;
    const predictiveTracking = !!options.predictiveTracking;

    _bossAim
      .copy(this.player.mesh.position)
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
    const launchRadius = trashteroid.collisionRadius ?? surfaceOffset;
    const burstCount = Math.max(1, options.burstCount ?? bossConfig.projectileBurstCount ?? 3);
    const jitterMultiplier = options.jitterMultiplier ?? 1;
    const aimJitterScale = Math.max(0.00025, (bossConfig.projectileAimError ?? 0.003) * 0.35 * jitterMultiplier);

    for (let i = 0; i < burstCount; i++) {
      if (lockSpawnPoint) {
        if (!trashteroid.streamMuzzleDir) {
          trashteroid.streamMuzzleDir = _bossAim
            .clone()
            .addScaledVector(_bossRight, (Math.random() - 0.5) * 0.2)
            .addScaledVector(_bossUp, (Math.random() - 0.5) * 0.2)
            .normalize();
        }

        // Keep stream shots from almost the same spawn point for this volley.
        trashteroid.streamMuzzleDir
          .addScaledVector(_bossRight, (Math.random() - 0.5) * 0.006)
          .addScaledVector(_bossUp, (Math.random() - 0.5) * 0.006)
          .normalize();
        _targetOffset.copy(trashteroid.streamMuzzleDir);
      } else {
        // Bias emission points to the hemisphere facing the player so the breakoff
        // and projectile origin are visible from the player's view.
        _targetOffset
          .copy(_bossAim)
          .addScaledVector(_bossRight, (Math.random() - 0.5) * 0.7)
          .addScaledVector(_bossUp, (Math.random() - 0.5) * 0.7)
          .normalize();

        if (_targetOffset.dot(_bossAim) < 0.25) {
          _targetOffset.lerp(_bossAim, 0.7).normalize();
        }
      }

      _bossMuzzle
        .copy(trashteroid.group.position)
        .addScaledVector(_targetOffset, launchRadius);

      _debrisAway
        .copy(this.player.mesh.position)
        .addScaledVector(
          this.player.velocity,
          predictiveTracking
            ? 
              this.player.mesh.position.distanceTo(_bossMuzzle) / Math.max(1, bossConfig.projectileSpeed ?? 1) * 0.5
            : 0
        )
        .sub(_bossMuzzle);
      if (_debrisAway.lengthSq() < 1e-5) {
        _debrisAway.copy(_bossAim);
      }
      _debrisAway.normalize();

      const spreadDirection = forceDirectTracking
        ? _debrisAway.clone().normalize()
        : _debrisAway
          .clone()
          .addScaledVector(_bossRight, (Math.random() - 0.5) * aimJitterScale)
          .addScaledVector(_bossUp, (Math.random() - 0.5) * aimJitterScale)
          .normalize();

      this._spawnTrashteroidProjectile(
        _bossMuzzle,
        spreadDirection,
        bossConfig.projectileSpeed,
        bossConfig.projectileLifetime
      );
      this._spawnTrashteroidBreakoffExplosion(_bossMuzzle, trashteroid, 1);
    }
  }

  _fireTrashteroidRing(bossConfig, options = {}) {
    const trashteroid = this._trashteroid;
    if (!trashteroid?.active) return;
    const predictiveTracking = !!options.predictiveTracking;

    _bossAim.copy(this.player.mesh.position).sub(trashteroid.group.position);
    if (_bossAim.lengthSq() === 0) return;
    _bossAim.normalize();

    _bossRight.crossVectors(_bossAim, _worldUp);
    if (_bossRight.lengthSq() < 1e-5) {
      _bossRight.set(1, 0, 0);
    }
    _bossRight.normalize();
    _bossUp.crossVectors(_bossRight, _bossAim).normalize();

    const launchRadius = trashteroid.collisionRadius ?? (trashteroid.surfaceOffset ?? TRASHTEROID_SURFACE_OFFSET);
    const ringCount = Math.max(8, bossConfig.projectileRingCount ?? 12);
    const ringSpread = bossConfig.projectileRingSpread ?? 0.18;

    _bossMuzzle.copy(trashteroid.group.position).addScaledVector(_bossAim, launchRadius);

    for (let i = 0; i < ringCount; i++) {
      const theta = (i / ringCount) * Math.PI * 2;
      _debrisAway
        .copy(this.player.mesh.position)
        .addScaledVector(
          this.player.velocity,
          predictiveTracking
            ? this.player.mesh.position.distanceTo(_bossMuzzle) / Math.max(1, bossConfig.projectileSpeed ?? 1) * 0.5
            : 0
        )
        .sub(_bossMuzzle)
        .normalize();

      const dir = _debrisAway
        .clone()
        .addScaledVector(_bossRight, Math.cos(theta) * ringSpread)
        .addScaledVector(_bossUp, Math.sin(theta) * ringSpread)
        .normalize()
        .clone();

      this._spawnTrashteroidProjectile(
        _bossMuzzle,
        dir,
        bossConfig.projectileSpeed,
        bossConfig.projectileLifetime
      );
      this._spawnTrashteroidBreakoffExplosion(_bossMuzzle, trashteroid, 0.7);
    }
  }

  _stepTrashteroidAttackPattern(bossConfig) {
    const trashteroid = this._trashteroid;
    if (!trashteroid?.active) return;
    const cooldownScale = trashteroid.cooldownHalved ? 0.5 : 1;

    if (!trashteroid.attackType || trashteroid.attackStepsRemaining <= 0) {
      if (Math.random() < 0.5) {
        trashteroid.attackType = 'ring';
        trashteroid.attackStepsRemaining = 2;
        trashteroid.streamMuzzleDir = null;
      } else {
        trashteroid.attackType = 'stream';
        trashteroid.attackStepsRemaining = 29;
        trashteroid.streamMuzzleDir = null;
      }
    }

    if (trashteroid.attackType === 'ring') {
      this._fireTrashteroidRing(bossConfig, {
        predictiveTracking: true,
      });
      trashteroid.attackStepsRemaining -= 1;
      if (trashteroid.attackStepsRemaining > 0) {
        // Re-evaluate player position for the next ring burst.
        trashteroid.shotCooldown = 0.28 * cooldownScale;
      } else {
        trashteroid.attackType = null;
        trashteroid.shotCooldown = bossConfig.shotInterval * 3 * (1.55 + Math.random() * 0.35) * cooldownScale;
      }
      return;
    }

    // stream
    this._fireTrashteroidBurst(bossConfig, {
      burstCount: 1,
      jitterMultiplier: 0.35,
      lockSpawnPoint: true,
      forceDirectTracking: true,
      predictiveTracking: true,
    });
    trashteroid.attackStepsRemaining -= 1;
    if (trashteroid.attackStepsRemaining > 0) {
      trashteroid.shotCooldown = 0.065 * cooldownScale;
    } else {
      trashteroid.attackType = null;
      trashteroid.shotCooldown = bossConfig.shotInterval * 3 * (0.85 + Math.random() * 0.28) * cooldownScale;
    }
  }

  _updateTrashteroid(delta, rawDelta = delta) {
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

    // Earth model is camera-anchored in the far background, so drive the boss along
    // a fixed Earth-bearing vector rather than homing to the visual mesh position.
    _bossMoveDelta.set(-1200, -600, 3500).normalize();

    // Desired velocity towards Earth; after asteroid bounces, steer back towards Earth
    const earthSpeed = (bossConfig.earthSpeed != null
      ? toWorldSpeed(bossConfig.earthSpeed)
      : toWorldSpeed(220)) * TRASHTEROID_BOSS_SPEED_MULTIPLIER;
    const steerRate = bossConfig.steerRate ?? 2.5;
    _bossDesiredPos.copy(_bossMoveDelta).multiplyScalar(earthSpeed);
    trashteroid.velocity.lerp(_bossDesiredPos, 1 - Math.exp(-steerRate * delta));

    // Integrate position
    trashteroid.group.position.addScaledVector(trashteroid.velocity, delta);

    if (!trashteroid.cooldownHalved && trashteroid.maxHealth > 0 && trashteroid.health <= trashteroid.maxHealth * 0.5) {
      trashteroid.cooldownHalved = true;
      trashteroid.shotCooldown *= 0.5;
    }

    trashteroid.shotCooldown -= delta;
    if (trashteroid.shotCooldown <= 0) {
      this._stepTrashteroidAttackPattern(bossConfig);
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

    // For asteroid bounces, use the visible hit radius (not the smaller
    // inner collision radius the player uses) so asteroids deflect at the
    // visible surface rather than disappearing into the trashteroid first.
    const collisionRadius = trashteroid.hitRadius ?? trashteroid.collisionRadius;

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
      this.hud.setBossBarVisible(false);
      this._clearTrashteroidProjectiles();
      this._startDestructionCutscene();
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
    const radiusX = Math.max(120, window.innerWidth * 0.46);
    const radiusY = Math.max(90, window.innerHeight * 0.43);
    const projectedX = centerX + _targetScreenPos.x * centerX;
    const projectedY = centerY - _targetScreenPos.y * centerY;
    const onScreen =
      _targetScreenPos.z > -1 &&
      _targetScreenPos.z < 1 &&
      Math.abs(_targetScreenPos.x) <= 1 &&
      Math.abs(_targetScreenPos.y) <= 1;

    _targetOffset.copy(targetPos).sub(this.camera.position);
    _targetOffset.applyQuaternion(this.camera.quaternion.clone().invert());

    let angle = Math.atan2(_targetOffset.x, _targetOffset.y);
    if (_targetOffset.z > 0) {
      angle += Math.PI;
    }

    const x = onScreen ? projectedX : centerX + Math.sin(angle) * radiusX;
    const y = onScreen ? projectedY : centerY - Math.cos(angle) * radiusY;
    const indicatorAngle = onScreen ? 0 : angle;
    const centerDist = targetPos.distanceTo(this.player.mesh.position);
    const surfaceDistWorld = Math.max(0, centerDist - (this._trashteroid?.collisionRadius ?? this._trashteroid?.hitRadius ?? 0));
    const distance = toDisplayDistance(surfaceDistWorld);

    this.hud.updateBossIndicator(true, x, y, indicatorAngle, Math.max(1, distance), 'TRASHTEROID');
  }

  _updateWeakSpotIndicators() {
    if (!this.hud || typeof this.hud.updateWeakSpotIndicators !== 'function') return;
    const maze = this._tunnelMaze;
    if (!maze || typeof maze.getWeakSpots !== 'function') {
      this.hud.hideWeakSpotIndicators();
      return;
    }
    const spots = maze.getWeakSpots();
    if (!spots || spots.length === 0) {
      this.hud.hideWeakSpotIndicators();
      return;
    }

    if (!this._weakSpotIndicatorBuf) this._weakSpotIndicatorBuf = [];
    const ranked = this._weakSpotIndicatorBuf;
    ranked.length = 0;
    const playerPos = this.player.mesh.position;
    for (const ws of spots) {
      if (!ws.alive) continue;
      const dx = ws.mesh.position.x - playerPos.x;
      const dy = ws.mesh.position.y - playerPos.y;
      const dz = ws.mesh.position.z - playerPos.z;
      const distSq = dx * dx + dy * dy + dz * dz;
      ranked.push({ ws, distSq });
    }
    ranked.sort((a, b) => a.distSq - b.distSq);
    const showCount = Math.min(3, ranked.length);

    const indicators = [];
    const centerX = window.innerWidth * 0.5;
    const centerY = window.innerHeight * 0.5;
    const radiusX = Math.max(120, window.innerWidth * 0.46);
    const radiusY = Math.max(90, window.innerHeight * 0.43);
    const camera = this.camera;
    const camInv = this._weakSpotCamInv ?? (this._weakSpotCamInv = new THREE.Quaternion());
    camInv.copy(camera.quaternion).invert();

    for (let i = 0; i < showCount; i++) {
      const entry = ranked[i];
      const pos = entry.ws.mesh.position;

      // Transform into camera space first so we can robustly check whether
      // the target is in front of the camera. project() returns garbage when
      // the homogeneous w is near zero or negative (target on or behind the
      // near plane); doing the front/behind test in camera space avoids
      // that whole class of jitter.
      _targetOffset.copy(pos).sub(camera.position).applyQuaternion(camInv);
      const inFront = _targetOffset.z < -camera.near;

      let projectedX = 0;
      let projectedY = 0;
      let onScreen = false;
      if (inFront) {
        _targetScreenPos.copy(pos).project(camera);
        if (
          _targetScreenPos.z > -1 &&
          _targetScreenPos.z < 1 &&
          Math.abs(_targetScreenPos.x) <= 1 &&
          Math.abs(_targetScreenPos.y) <= 1
        ) {
          onScreen = true;
          projectedX = centerX + _targetScreenPos.x * centerX;
          projectedY = centerY - _targetScreenPos.y * centerY;
        }
      }

      // Bearing for the off-screen edge clamp — always derived from camera-
      // space offset so it's well-defined regardless of front/behind.
      let angle = Math.atan2(_targetOffset.x, _targetOffset.y);
      if (_targetOffset.z > 0) angle += Math.PI;

      const x = onScreen ? projectedX : centerX + Math.sin(angle) * radiusX;
      const y = onScreen ? projectedY : centerY - Math.cos(angle) * radiusY;
      const dist = Math.sqrt(entry.distSq);
      const displayDist = toDisplayDistance(dist);

      const proximity = THREE.MathUtils.clamp(1 - dist / 6000, 0, 1);
      const scale = onScreen ? 0.85 + proximity * 0.6 : 1.0;
      const opacity = onScreen ? 0.7 + proximity * 0.3 : 0.85;

      indicators.push({
        x,
        y,
        angle: onScreen ? 0 : angle,
        onScreen,
        scale,
        opacity,
        label: `${displayDist} km`,
      });
    }

    this.hud.updateWeakSpotIndicators(indicators);
  }

  _updateTrashteroidRangeAlert() {
    const trashteroid = this._trashteroid;
    if (!trashteroid?.active) {
      this.hud.setTrashteroidRangeAlert(false);
      return;
    }

    // Range alert is only meaningful when the objective is to destroy the trashteroid.
    const primary = this.levels.getCurrentConfig()?.mission?.primary ?? {};
    if (!primary.destroyTrashteroid) {
      this.hud.setTrashteroidRangeAlert(false);
      return;
    }

    const playerPos = this.player?.mesh?.position;
    if (!playerPos) {
      this.hud.setTrashteroidRangeAlert(false);
      return;
    }

    const maxShotDistance = Math.max(1, this.projectiles?.maxDist ?? 2500);
    const targetDistanceToCenter = playerPos.distanceTo(trashteroid.group.position);
    const targetSurfaceDistance = Math.max(0, targetDistanceToCenter - (trashteroid.hitRadius ?? 0));
    const outOfRange = targetSurfaceDistance > (maxShotDistance + PROJECTILE_HIT_PADDING);
    this.hud.setTrashteroidRangeAlert(outOfRange, 'TRASHTEROID OUT OF RANGE, MOVE CLOSER.');
  }

  _isRequiredTutorialComplete() {
    const primary = this.levels.getCurrentConfig()?.mission?.primary ?? {};
    if (!primary.tutorialRequired) return true;
    if (!this._tutorialMode || this.levels.current !== 1) return true;

    return this._tutorial.objectivesShown
      && !this._tutorial.activeBeatId
      && this._tutorial.transitionRemaining <= 0;
  }

  _getMissionObjectiveState(finalizeShield = false) {
    const levelConfig = this.levels.getCurrentConfig();
    const mission = levelConfig.mission ?? {};
    const primary = mission.primary ?? {};
    const bonus = mission.bonus ?? {};
    const objectives = [];
    let primaryComplete = true;

    if (primary.tutorialRequired) {
      const tutorialComplete = this._isRequiredTutorialComplete();
      objectives.push({
        label: primary.tutorialLabel ?? 'Complete tutorial',
        current: tutorialComplete ? 1 : 0,
        target: 1,
        complete: tutorialComplete,
        bonus: false,
      });
      primaryComplete = primaryComplete && tutorialComplete;
    }

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
      const trashteroidSurfaceRadius = this._trashteroid?.collisionRadius ?? 0;
      const centerDist = targetPos ? targetPos.distanceTo(this.player.mesh.position) : null;
      const surfaceDist = centerDist != null ? Math.max(0, centerDist - trashteroidSurfaceRadius) : null;
      const distanceDisplay = surfaceDist != null
        ? toDisplayDistance(surfaceDist)
        : reachDistanceDisplay;
      const reached = surfaceDist != null ? surfaceDist <= reachDistanceWorld : false;
      const reachLabel = primary.reachLabel ?? 'Reach Trashteroid';
      const reachedLabel = primary.reachedLabel ?? reachLabel;

      objectives.push({
        label: reached
          ? reachedLabel
          : `${reachLabel} (${distanceDisplay} km out)`,
        current: reached ? 1 : 0,
        target: 1,
        complete: reached,
        bonus: false,
      });
      primaryComplete = primaryComplete && reached;
    }

    if (primary.weakSpotsRequired) {
      const totalCount = primary.weakSpotsTotal ?? primary.weakSpotsRequired;
      const destroyed = this._weakSpotsDestroyed ?? 0;
      const complete = destroyed >= primary.weakSpotsRequired;
      objectives.push({
        label: `Destroy ${primary.weakSpotsRequired} of ${totalCount} weak spots`,
        current: destroyed,
        target: primary.weakSpotsRequired,
        complete,
        bonus: false,
      });
      primaryComplete = primaryComplete && complete;
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
    const currentHullPercent = this._getPlayerHullPercent();
    const shieldBonus = shieldThreshold != null ? currentHullPercent > shieldThreshold : false;
    const shieldFailed = shieldThreshold != null ? currentHullPercent <= shieldThreshold : false;
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

    const bonusTrashReq = bonus.bonusTrashRequired ?? 0;
    const bonusRecycleReq = bonus.bonusRecycleRequired ?? 0;
    if (bonusTrashReq > 0 && bonusRecycleReq > 0) {
      const trashDone = this._trashDestroyedRequired >= bonusTrashReq;
      const recycleDone = this._recycleCollectedRequired >= bonusRecycleReq;
      objectives.push({
        label: `Destroy ${bonusTrashReq} trash`,
        current: this._trashDestroyedRequired,
        target: bonusTrashReq,
        complete: trashDone,
        bonus: true,
      });
      objectives.push({
        label: `Collect ${bonusRecycleReq} recyclables`,
        current: this._recycleCollectedRequired,
        target: bonusRecycleReq,
        complete: recycleDone,
        bonus: true,
      });
    }

    const specialRequired = bonus.specialRequired;
    if (specialRequired > 0) {
      const specialDone = this._specialTrashDestroyed >= specialRequired;
      objectives.push({
        label: `Destroy ${specialRequired} special pieces of trash`,
        current: this._specialTrashDestroyed,
        target: specialRequired,
        complete: specialDone,
        bonus: true,
      });
    }

    const completedObjectives = objectives.reduce((count, obj) => count + (obj.complete ? 1 : 0), 0);
    const totalObjectives = objectives.length;
    const bonusObjectives = objectives.filter(obj => obj.bonus);
    const completedBonus = bonusObjectives.reduce((count, obj) => count + (obj.complete ? 1 : 0), 0);
    const totalBonus = bonusObjectives.length;

    return {
      objectives,
      primaryComplete,
      completedObjectives,
      totalObjectives,
      completedBonus,
      totalBonus,
    };
  }

  _calculateMissionStars(primaryComplete, completedBonus, totalBonus) {
    if (!primaryComplete) return 0;
    if (totalBonus <= 0) return 3;
    if (completedBonus >= totalBonus) return 3;
    if (completedBonus > 0) return 2;
    return 1;
  }

  _finalizeLevel(primaryComplete) {
    if (this._levelComplete) return;

    const state = this._getMissionObjectiveState(true);
    this._levelComplete = true;
    this._levelTimerRunning = false;
    this.paused = false;
    this.boostActive = false;
    this._levelCompleteControlLockRemaining = LEVEL_COMPLETE_CONTROL_LOCK_SECONDS;
    this._pendingLevelCompleteSummary = null;
    this.input.releaseAll();
    this.player.turnInputYaw = 0;
    this.player.turnInputPitch = 0;
    this.player.manualRollInput = 0;

    const levelConfig = this.levels.getCurrentConfig();
    if (primaryComplete && levelConfig.interior && this._tunnelMaze) {
      this._triggerTunnelCollapseFx();
      // Hold the level-complete screen until the explosion sequence finishes
      // (~2.1s) plus a small linger so the player sees the last bursts.
      this._levelCompleteControlLockRemaining = Math.max(
        this._levelCompleteControlLockRemaining,
        2.6,
      );
    }
    this.hud.updateObjectives(state.objectives);
    this.hud.hideTimer();
    this.hud.setBossBarVisible(false);
    this.hud.updateBossIndicator(false, 0, 0, 0, 0);
    const earnedStars = this._calculateMissionStars(
      primaryComplete,
      state.completedBonus,
      state.totalBonus
    );
    this._pendingLevelCompleteSummary = {
      primaryComplete,
      stars: earnedStars,
      completedObjectives: state.completedObjectives,
      totalObjectives: state.totalObjectives,
    };
  }

  _updatePendingLevelComplete(delta) {
    if (!this._levelComplete || this.paused) return;
    if (this._levelCompleteControlLockRemaining <= 0) return;

    this._levelCompleteControlLockRemaining = Math.max(
      0,
      this._levelCompleteControlLockRemaining - delta
    );

    if (this._levelCompleteControlLockRemaining > 0 || !this._pendingLevelCompleteSummary) {
      return;
    }

    const summary = this._pendingLevelCompleteSummary;
    this._pendingLevelCompleteSummary = null;

    const reqDone = summary.primaryComplete;
    const stars = summary.stars;
    const nextLevel = reqDone ? this.levels.getNextLevel() : null;

    if (reqDone && nextLevel) unlockLevel(nextLevel);
    if (reqDone) recordLevelStars(this.levels.current, stars);

    this.paused = true;
    this.hud.setGameplayVisible(true);
    this.hud.hideTimer();
    if (this.crosshair) this.crosshair.classList.add('hidden');
    if (document.pointerLockElement) document.exitPointerLock();

    this._levelStatsSummary = {
      reqDone,
      stars,
      completedObjectives: summary.completedObjectives,
      totalObjectives: summary.totalObjectives,
      nextLevel,
    };

    if (reqDone) {
      this._showLevelStatsPanel(this._levelStatsSummary);
    } else {
      // Short comms-style failure screen with a retry button — no
      // stars/score breakdown, no debrief sequence.
      this._startPostLevelComms();
    }
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
      penaltyShown: false,
      crashingShown: false,
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
    if (beatId === 'recycle') return { recycleDestroyed: false };
    if (beatId === 'penalty' || beatId === 'crashing' || beatId === 'objectives') {
      return { remaining: TUTORIAL_TIMED_BEAT_DURATION, duration: TUTORIAL_TIMED_BEAT_DURATION };
    }
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
        { id: 'recycle-collected', label: 'Fly into 1 recyclable to collect it', complete: !!progress.recycleDestroyed },
      ];
    }

    return [];
  }

  _renderTutorialBeat(beatId, { animate = false } = {}) {
    const beat = TUTORIAL_BEATS[beatId];
    if (!beat) return;

    const progress = this._tutorial.activeBeatProgress;
    const isTimedBeat = (beatId === 'penalty' || beatId === 'crashing' || beatId === 'objectives')
      && progress
      && Number.isFinite(progress.duration)
      && progress.duration > 0;
    const timerProgress = isTimedBeat
      ? THREE.MathUtils.clamp((progress.remaining ?? 0) / progress.duration, 0, 1)
      : null;

    this.hud.showTutorialCallout(beat.title, beat.message, {
      placement: beat.placement,
      requirements: this._getTutorialRequirementStates(beatId, this._tutorial.activeBeatProgress),
      showTimer: !!isTimedBeat,
      timerProgress,
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

    if (!this._tutorial.penaltyShown && this._tutorial.recycleShown) {
      this._tutorial.penaltyShown = true;
      this._startTutorialBeat('penalty');
      return;
    }

    if (!this._tutorial.crashingShown && this._tutorial.penaltyShown) {
      this._tutorial.crashingShown = true;
      this._startTutorialBeat('crashing');
      return;
    }

    if (!this._tutorial.objectivesShown && this._tutorial.crashingShown) {
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

    const tutorialProgress = this._tutorial.activeBeatProgress;
    if (
      tutorialProgress
      && Number.isFinite(tutorialProgress.remaining)
      && Number.isFinite(tutorialProgress.duration)
      && tutorialProgress.duration > 0
    ) {
      tutorialProgress.remaining -= rawDelta;
      this._updateTutorialBeatDisplay();
      if (tutorialProgress.remaining <= 0) {
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
      if (progress.recycleDestroyed) {
        this._completeActiveTutorialBeat();
      }
      return;
    }
  }

  _firePlayerBeam(type, frameDelta = 0) {
    const fireDirection = this._getAssistedFireDirection();
    const fired = this.projectiles.fire(
      this.player.mesh.position,
      fireDirection,
      this.player.velocity,
      this.player.mesh.quaternion,
      type,
      frameDelta
    );

    if (!fired) return 0;

    if (PLAYER_SHOOT_HITSCAN) {
      const maxDistance = Math.max(1, this.projectiles.maxDist ?? 2500);
      for (let shotIndex = 0; shotIndex < fired; shotIndex++) {
        this._resolvePlayerHitscanShot(type, this.player.mesh.position, fireDirection, maxDistance);
      }
    }

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

    if (this._transitionCutscene) {
      this._updateLevelTransitionCutscene(rawDelta);
      this.input.resetPressed();
      return;
    }

    if (this._destructionCutscene) {
      this._updateDestructionCutscene(rawDelta);
      this.input.resetPressed();
      return;
    }

    if (this._deathSequenceActive) {
      this._updateDeathSequence(rawDelta);
      this.input.resetPressed();
      return;
    }

    if (this._gameOverActive) {
      this._updateGameOverBackground(rawDelta);
      this.input.resetPressed();
      return;
    }

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
      this._updateDebriefDialogue(rawDelta);
      soundtrackManager.setBoosting(false);
      soundtrackManager.setThrusting(false);
      this.hud.updateBoostBar(this.boostCharge, false);
      this.input.resetPressed();
      this.renderer.render(this.scene, this.camera);
      return;
    }

    this.playerHitCooldown = Math.max(0, this.playerHitCooldown - delta);

    // store player position before this frame's movement for continuous collisions
    this._prevPlayerPos.copy(this.player.mesh.position);

    const controlLockActive = this._levelComplete && this._levelCompleteControlLockRemaining > 0;

    // Mouse → pitch / yaw
    let dx = 0;
    let dy = 0;
    let thrustHeld = false;
    let wantsBoost = false;
    let rollSeen = false;
    let fired = 0;
    let vaporizerFired = 0;

    if (controlLockActive) {
      this.input.consumeMouseDelta();
      this.boostActive = false;
      this.player.turnInputYaw = 0;
      this.player.turnInputPitch = 0;
      this.player.manualRollInput = 0;
      soundtrackManager.setThrusting(false);
      soundtrackManager.setBoosting(false);
    } else {
      ({ dx, dy } = this.input.consumeMouseDelta());
      this.player.rotate(dx, dy, rawDelta);
      thrustHeld = this.input.isDown('w');
      soundtrackManager.setThrusting(thrustHeld);

      // W → forward thrust
      wantsBoost = thrustHeld && this.input.isDown(' ') && this.boostCharge > 0;
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
      soundtrackManager.setBoosting(this.boostActive);

      // A / D → manual roll
      let rollInput = 0;
      if (this.input.isDown('a')) rollInput += 1;   // roll left
      if (this.input.isDown('d')) rollInput -= 1;   // roll right
      rollSeen = rollInput !== 0 || this.input.wasPressed('a') || this.input.wasPressed('d');
      this.player.manualRollInput = rollInput;

      // Single tool: Trash Vaporizer on left-click. Recyclables are
      // collected by flying into them, not fired at.
      fired = this.input.isDown('mouseleft') ? this._firePlayerBeam('normal', rawDelta) : 0;
    }

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
    const playerPos = this.player.mesh.position;
    const playerQuat = this.player.baseQuaternion;
    const levelConfig = this.levels.getCurrentConfig();
    if (levelConfig.interior && this._tunnelMaze) {
      this._resolveTunnelPlayerCollision(delta);
    }
    this.projectiles.update(delta);
    if (levelConfig.interior && this._tunnelMaze) {
      this._resolveTunnelProjectileCollisions();
    }
    const hasBossLevel = !!levelConfig.boss;
    const spawnConfig = this.levels.getSpawnConfig();
    const missionConfig = this.levels.getMissionConfig();
    const reachTrashteroidObjective = !!missionConfig?.primary?.reachTrashteroid;
    const noSpawnNearTarget = !hasBossLevel && reachTrashteroidObjective && this._trashteroid?.active;

    // Suppress new asteroid spawning when close to trashteroid surface (1000 display-units).
    const ASTEROID_SUPPRESS_DISTANCE_WORLD = toWorldDistance(1000);
    const trashteroidSurfaceRadius = this._trashteroid?.collisionRadius ?? 0;
    const distToTrashteroidSurface = (noSpawnNearTarget && this._trashteroid?.group?.position)
      ? Math.max(0, this._trashteroid.group.position.distanceTo(playerPos) - trashteroidSurfaceRadius)
      : Infinity;
    const nearTrashteroid = distToTrashteroidSurface <= ASTEROID_SUPPRESS_DISTANCE_WORLD;
    if (levelConfig.interior) {
      this.asteroidField.setTargetCount(0);
    } else if (nearTrashteroid) {
      // Freeze the target at the current count so no new asteroids spawn,
      // but existing ones are not forcibly removed.
      this.asteroidField.setTargetCount(this.asteroidField.instances.length);
    } else {
      this.asteroidField.setTargetCount(levelConfig?.boss?.asteroidTarget);
    }
    this.asteroidField.setNoSpawnZone(
      noSpawnNearTarget ? this._trashteroid.group.position : null,
      noSpawnNearTarget ? trashteroidSurfaceRadius * 2 : 0,
    );
    if (!levelConfig.interior) {
      this.asteroidField.update(delta, playerPos);
    }
    if (this._tunnelMaze) this._tunnelMaze.update(delta, playerPos, playerQuat);
    const noSpawnRadius = trashteroidSurfaceRadius * 1.7;
    // Lock debris spawning when the player is within one collisionRadius of the trashteroid surface.
    const nearTargetSpawnLock = noSpawnNearTarget
      && trashteroidSurfaceRadius > 0
      && Math.max(0, this._trashteroid.group.position.distanceTo(playerPos) - trashteroidSurfaceRadius) <= trashteroidSurfaceRadius;
    const runtimeSpawnConfig = noSpawnNearTarget
      ? {
        ...spawnConfig,
        noSpawnCenter: this._trashteroid.group.position,
        noSpawnRadius,
        ...(nearTargetSpawnLock ? { targetActive: 0, maxActive: 0, bootstrapActive: 0 } : null),
      }
      : spawnConfig;
    const debrisRuntimeConfig = hasBossLevel
      ? {
        ...runtimeSpawnConfig,
        disableNaturalSpawn: true,
        targetActive: 0,
        maxActive: 0,
        bootstrapActive: 0,
        forwardSpawnMax: Math.max(runtimeSpawnConfig?.forwardSpawnMax ?? runtimeSpawnConfig?.spawnMaxDistance ?? 0, 6000),
        spawnMaxDistance: Math.max(runtimeSpawnConfig?.spawnMaxDistance ?? runtimeSpawnConfig?.forwardSpawnMax ?? 0, 6000),
        despawnDistance: Math.max(runtimeSpawnConfig?.despawnDistance ?? 0, 6000),
        despawnAnchor: this._trashteroid?.active ? this._trashteroid.group.position : null,
        despawnAnchorExtraDistance: 1000,
      }
      : runtimeSpawnConfig;

    this.debris.update(delta, debrisRuntimeConfig, playerPos, playerQuat);
    const asteroidColliders = this.asteroidField.getColliders();
    this.debris.resolveAsteroidCollisions(asteroidColliders);
    const specialSpawnConfig = this._isTutorialActiveForCurrentLevel() && !hasBossLevel
      ? {
        ...debrisRuntimeConfig,
        progressPerSpawn: Math.max(24, (debrisRuntimeConfig?.progressPerSpawn ?? 140) * 0.33),
      }
      : debrisRuntimeConfig;
    this.specialDebris.update(delta, specialSpawnConfig, playerPos, playerQuat);
    this.specialDebris.resolveAsteroidCollisions(asteroidColliders);
    this.recycleDebris.update(delta, debrisRuntimeConfig, playerPos, playerQuat);
    this.recycleDebris.resolveAsteroidCollisions(asteroidColliders);
    this._updateTrashteroid(delta, rawDelta);
    this._resolveTrashteroidAsteroidCollisions(asteroidColliders, delta);
    this._updateTrashteroidProjectiles(delta);
    // Legacy moving-projectile collision checks are disabled when hitscan is on.
    if (!PLAYER_SHOOT_HITSCAN) {
      this._checkProjectileAsteroidCollisions();
      this._checkProjectileTrashteroidCollisions();
    }
    this._checkAsteroidPlayerCollisions();
    this._checkTrashteroidPlayerCollisions(playerPos);

    // Camera follows behind ship (updated before rendering)
    this._updateCamera(delta);

    // Keep sun and planet locked relative to camera (unreachable background)
    this._updateBackground(delta);

    // Update lighting transitions (interior/exterior fading)
    this._updateLightingTransition(delta);

    // Starfield should be centered after the camera has moved to avoid
    // one-frame parallax/zoom artifacts when the camera follows the ship.
    this.starfield.update(delta, this.camera);

    // Update transient effects (particles + screen popups)
    this._updateEffects(delta);

    // Collision: projectiles vs debris (regular + special)
    if (!PLAYER_SHOOT_HITSCAN) {
      this._checkProjectileDebrisCollisions(this.debris, 'normal');
      this._checkProjectileDebrisCollisions(this.recycleDebris, 'vaporizer');
      this._checkProjectileSpecialRewardCollisions();
      this._checkProjectileSpecialPenaltyCollisions();
      this._checkProjectileRecyclePenaltyCollisions();
      this._checkProjectileTrashPenaltyCollisions();
    }

    // Collision: trash vs player (hits / misses)
    this._checkDebrisPlayerCollisions(playerPos, playerQuat);
    this._checkDebrisPlayerCollisions(playerPos, playerQuat, this.specialDebris);
    this._checkDebrisPlayerCollisions(playerPos, playerQuat, this.recycleDebris);

    this._updateMissionTargetIndicator();
    this._updateTrashteroidRangeAlert();
    this._updateMinimap();
    if (levelConfig.interior && this._tunnelMaze) {
      this._updateWeakSpotIndicators();
    } else if (this.hud && typeof this.hud.hideWeakSpotIndicators === 'function') {
      this.hud.hideWeakSpotIndicators();
    }

    this.score = Math.max(0, this.score);
    this.hud.update(this.score, this.levels.current, this._getPlayerHullPercent());
    this.hud.updateBoostBar(this.boostCharge, this.boostActive);
    this.hud.updateSpeedometer(this.player.velocity.length());
    const bandLevels = soundtrackManager.getBandLevels(this.hud.musicVisualizerBars?.length || 14);
    this.hud.updateMusicVisualizer(bandLevels, rawDelta);
    this._updateMissionObjectives(delta);
    this._updatePendingLevelComplete(delta);
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

    if (state.primaryComplete) {
      this._finalizeLevel(true);
    } else if (this._levelTimerRunning && this._levelTimer <= 0) {
      this._timedOut = true;
      this._startGameOverSequence();
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

  _intersectRaySphereDistance(origin, direction, center, radius, maxDistance = Infinity) {
    _toCenter.copy(origin).sub(center);
    const b = _toCenter.dot(direction);
    const c = _toCenter.lengthSq() - radius * radius;
    const discriminant = b * b - c;
    if (discriminant < 0) return Infinity;

    const sqrtDiscriminant = Math.sqrt(discriminant);
    let distance = -b - sqrtDiscriminant;
    if (distance < 0) {
      distance = -b + sqrtDiscriminant;
    }

    if (distance < 0 || distance > maxDistance) return Infinity;
    return distance;
  }

  _resolvePlayerHitscanShot(type, origin, direction, maxDistance) {
    const hitRadiusScale = 1.5;
    const canHitRegularTrash = type === 'normal';
    const canHitSpecialTrash = type === 'normal';
    const canPenaltySpecialTrash = type === 'vaporizer';
    const canHitRecycleTrash = type === 'vaporizer';
    const canPenaltyRecycleTrash = type === 'normal';
    const canPenaltyRegularTrash = type === 'vaporizer';

    let bestDistance = maxDistance;
    let bestHit = null;

    if (canHitRegularTrash || canPenaltyRegularTrash) {
      const debrisList = this.debris.getActive();
      for (let i = 0; i < debrisList.length; i++) {
        const radius = (debrisList[i].hitRadius || 1) * hitRadiusScale + PROJECTILE_HIT_PADDING;
        const distance = this._intersectRaySphereDistance(origin, direction, debrisList[i].position, radius, bestDistance);
        if (distance >= bestDistance) continue;
        bestDistance = distance;
        bestHit = {
          kind: canHitRegularTrash ? 'normal-reward' : 'normal-penalty',
          manager: this.debris,
          index: i,
          position: debrisList[i].position,
          points: debrisList[i].points || 100,
        };
      }
    }

    if (canHitSpecialTrash || canPenaltySpecialTrash) {
      const specialList = this.specialDebris.getActive();
      for (let i = 0; i < specialList.length; i++) {
        const radius = (specialList[i].hitRadius || 1) * hitRadiusScale + PROJECTILE_HIT_PADDING;
        const distance = this._intersectRaySphereDistance(origin, direction, specialList[i].position, radius, bestDistance);
        if (distance >= bestDistance) continue;
        bestDistance = distance;
        bestHit = {
          kind: canHitSpecialTrash ? 'special-reward' : 'special-penalty',
          manager: this.specialDebris,
          index: i,
          position: specialList[i].position,
          points: specialList[i].points || 5000,
        };
      }
    }

    if (canHitRecycleTrash || canPenaltyRecycleTrash) {
      const recycleList = this.recycleDebris.getActive();
      for (let i = 0; i < recycleList.length; i++) {
        const radius = (recycleList[i].hitRadius || 1) * hitRadiusScale + PROJECTILE_HIT_PADDING;
        const distance = this._intersectRaySphereDistance(origin, direction, recycleList[i].position, radius, bestDistance);
        if (distance >= bestDistance) continue;
        bestDistance = distance;
        bestHit = {
          kind: canHitRecycleTrash ? 'recycle-reward' : 'recycle-penalty',
          manager: this.recycleDebris,
          index: i,
          position: recycleList[i].position,
          points: recycleList[i].points || 500,
        };
      }
    }

    const trashteroid = this._trashteroid;
    if (trashteroid?.active) {
      const distance = this._intersectRaySphereDistance(
        origin,
        direction,
        trashteroid.group.position,
        trashteroid.hitRadius + PROJECTILE_HIT_PADDING,
        bestDistance
      );
      if (distance < bestDistance) {
        bestDistance = distance;
        bestHit = {
          kind: 'trashteroid',
          position: trashteroid.group.position,
        };
      }
    }

    const asteroids = this.asteroidField.getColliders();
    for (let i = 0; i < asteroids.length; i++) {
      const sphere = asteroids[i].boundingSphere;
      const distance = this._intersectRaySphereDistance(
        origin,
        direction,
        sphere.center,
        sphere.radius * 0.8 + PROJECTILE_HIT_PADDING,
        bestDistance
      );
      if (distance >= bestDistance) continue;
      bestDistance = distance;
      bestHit = {
        kind: 'asteroid',
        position: sphere.center,
      };
    }

    if (!bestHit) return false;

    _closestPoint.copy(direction).multiplyScalar(bestDistance).add(origin);
    const impactPoint = _closestPoint.clone();

    if (bestHit.kind === 'normal-reward') {
      this.score += bestHit.points;
      this.trashHits++;
      this._trashDestroyedRequired++;
      this._noteTutorialTrashDestroyed();
      if (this.player.velocity.length() >= this._bonusFastThresholdWorld) {
        this._trashDestroyedFast++;
      }
      this._refreshPauseMenu();
      this._spawnExplosion(impactPoint.clone(), { count: 220, ttl: 1.4 });
      this._playBoomSfx();
      this._spawnScorePopup(impactPoint.clone(), bestHit.points);
      bestHit.manager.remove(bestHit.index);
      return true;
    }

    if (bestHit.kind === 'special-reward') {
      this.score += bestHit.points;
      this.trashHits++;
      this._trashDestroyedRequired++;
      this._specialTrashDestroyed++;
      this._noteTutorialTrashDestroyed();
      this._noteTutorialSpecialDestroyed();
      if (this.player.velocity.length() >= this._bonusFastThresholdWorld) {
        this._trashDestroyedFast++;
      }
      this._refreshPauseMenu();
      this._spawnExplosion(impactPoint.clone(), { count: 220, ttl: 1.4 });
      this._playBoomSfx();
      this._spawnScorePopup(impactPoint.clone(), bestHit.points);
      bestHit.manager.remove(bestHit.index);
      return true;
    }

    if (bestHit.kind === 'recycle-reward') {
      this.score += bestHit.points;
      this.trashHits++;
      this._recycleCollectedRequired++;
      this._noteTutorialRecycleDestroyed();
      this._refreshPauseMenu();
      this._playPickupSfx();
      this._spawnScorePopup(impactPoint.clone(), bestHit.points);
      bestHit.manager.remove(bestHit.index);
      return true;
    }

    if (
      bestHit.kind === 'recycle-penalty'
      || bestHit.kind === 'normal-penalty'
      || bestHit.kind === 'special-penalty'
    ) {
      const penalty = WRONG_BEAM_PENALTY;
      this.score = Math.max(0, this.score - penalty);
      this._refreshPauseMenu();
      this._spawnExplosion(impactPoint.clone(), { count: 220, ttl: 1.4 });
      this._playBoomSfx();
      this._spawnScorePopup(impactPoint.clone(), -penalty, { color: '#ff3b30' });
      bestHit.manager.remove(bestHit.index);
      return true;
    }

    if (bestHit.kind === 'trashteroid') {
      const bossConfig = this.levels.getCurrentConfig().boss ?? null;
      if (!bossConfig) {
        this._spawnSparks(impactPoint, {
          count: 18,
          speed: 20,
          ttl: 0.5,
          color: 0xffc66e,
          size: 1.35,
        });
        return true;
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

      if (trashteroid.health > 0) return true;

      this.score += TRASHTEROID_SCORE_ON_DESTROY;
      this.hud.setBossBarVisible(false);
      this._clearTrashteroidProjectiles();
      this._startDestructionCutscene();
      return true;
    }

    // Asteroid hit: visual-only hit feedback is intentionally subtle.
    return true;
  }

  _checkProjectileDebrisCollisions(debrisManager = this.debris, projectileTypeFilter = null) {
    const projectiles = this.projectiles.getActive();
    const debrisList = debrisManager.getActive();
    const hitRadiusScale = 1.5;

    for (let i = projectiles.length - 1; i >= 0; i--) {
      if (projectileTypeFilter && projectiles[i].type !== projectileTypeFilter) continue;
      for (let j = debrisList.length - 1; j >= 0; j--) {
        const hitRadius = (debrisList[j].hitRadius || 1) * hitRadiusScale;
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
          if (debrisManager !== this.recycleDebris) {
            this._spawnExplosion(_closestPoint.clone(), { count: 220, ttl: 1.4 });
          }
          if (debrisManager === this.recycleDebris) {
            this._playPickupSfx();
          } else {
            this._playBoomSfx();
          }
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
    const hitRadiusScale = 1.5;

    for (let i = projectiles.length - 1; i >= 0; i--) {
      if (projectiles[i].type !== 'normal') continue;
      for (let j = debrisList.length - 1; j >= 0; j--) {
        const hitRadius = (debrisList[j].hitRadius || 1) * hitRadiusScale;
        if (this._projectileHitsSphere(projectiles[i], debrisList[j].position, hitRadius)) {
          const points = debrisList[j].points || 5000;
          this.score += points;
          this.trashHits++;
          this._trashDestroyedRequired++;
          this._specialTrashDestroyed++;
          this._noteTutorialTrashDestroyed();
          this._noteTutorialSpecialDestroyed();
          if (this.player.velocity.length() >= this._bonusFastThresholdWorld) {
            this._trashDestroyedFast++;
          }
          this._refreshPauseMenu();
          this._spawnExplosion(_closestPoint.clone(), { count: 220, ttl: 1.4 });
          this._playBoomSfx();
          this._spawnScorePopup(_closestPoint.clone(), points);
          this.projectiles.remove(i);
          this.specialDebris.remove(j);
          break;
        }
      }
    }
  }

  _checkProjectileSpecialPenaltyCollisions() {
    const projectiles = this.projectiles.getActive();
    const debrisList = this.specialDebris.getActive();
    const hitRadiusScale = 1.5;

    for (let i = projectiles.length - 1; i >= 0; i--) {
      if (projectiles[i].type !== 'vaporizer') continue;
      for (let j = debrisList.length - 1; j >= 0; j--) {
        const hitRadius = (debrisList[j].hitRadius || 1) * hitRadiusScale;
        if (this._projectileHitsSphere(projectiles[i], debrisList[j].position, hitRadius)) {
          const penalty = WRONG_BEAM_PENALTY;
          this.score = Math.max(0, this.score - penalty);
          this._refreshPauseMenu();
          this._spawnExplosion(_closestPoint.clone(), { count: 220, ttl: 1.4 });
          this._playBoomSfx();
          this._spawnScorePopup(_closestPoint.clone(), -penalty, { color: '#ff3b30' });
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
    const hitRadiusScale = 1.5;

    for (let i = projectiles.length - 1; i >= 0; i--) {
      if (projectiles[i].type !== 'normal') continue;
      for (let j = debrisList.length - 1; j >= 0; j--) {
        const hitRadius = (debrisList[j].hitRadius || 1) * hitRadiusScale;
        if (this._projectileHitsSphere(projectiles[i], debrisList[j].position, hitRadius)) {
          const penalty = WRONG_BEAM_PENALTY;
          this.score = Math.max(0, this.score - penalty);
          this._refreshPauseMenu();
          this._spawnExplosion(_closestPoint.clone(), { count: 220, ttl: 1.4 });
          this._playBoomSfx();
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
    const hitRadiusScale = 1.5;

    for (let i = projectiles.length - 1; i >= 0; i--) {
      if (projectiles[i].type !== 'vaporizer') continue;
      for (let j = debrisList.length - 1; j >= 0; j--) {
        const hitRadius = (debrisList[j].hitRadius || 1) * hitRadiusScale;
        if (this._projectileHitsSphere(projectiles[i], debrisList[j].position, hitRadius)) {
          const penalty = WRONG_BEAM_PENALTY;
          this.score = Math.max(0, this.score - penalty);
          this._refreshPauseMenu();
          this._spawnExplosion(_closestPoint.clone(), { count: 220, ttl: 1.4 });
          this._playBoomSfx();
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
      const hitRadius = Math.max(d.hitRadius || 1, d.collisionRadius || 0);
      // Slightly larger effective radius makes collisions feel less late.
      const hitDistance = PLAYER_COLLISION_RADIUS + hitRadius * 1.2;
      // Count a miss a bit earlier once debris slips behind the ship.
      const passDistance = hitRadius + 20;
      // Nearby debris gets pushed away even without direct contact.
      const reactDistance = Math.max(hitRadius * 3, 6);

      // Sweep from previous to current player position for stable hit checks.
      const segStart = this._prevPlayerPos;
      const segEnd = playerPos;
      const sweptHit = this._segmentIntersectsSphere(segStart, segEnd, d.position, hitDistance);

      if (sweptHit) {
        // Recyclables are collected by flying into them — score reward,
        // no damage, no knockback. The bin disappears.
        if (debrisManager === this.recycleDebris) {
          const points = d.points || 500;
          this.score += points;
          this._recycleCollectedRequired++;
          this._noteTutorialRecycleDestroyed();
          debrisManager.remove(i);
          continue;
        }

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
        console.log("damage");
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

      // Recyclables are collectible, not hostile — no graze damage, no
      // penalty for drifting past, no nudge. They just sit there until you
      // hit them or they fall off the playfield.
      if (debrisManager === this.recycleDebris) continue;

      // Nudge nearby debris away to reduce frustrating glancing overlaps.
      if (distSq < reactDistance * reactDistance && distSq > hitDistance * hitDistance) {
        console.log("near miss")
        const playerSpeed = this.player.velocity.length();
        const grazeDamage = THREE.MathUtils.clamp(Math.round(4 + (playerSpeed / 180) * 8), 3, 12);
        this._damagePlayer(grazeDamage);
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
      const minDistance = PLAYER_COLLISION_RADIUS + sphere.radius * 0.82; // slight forgiveness on asteroid radius for better feel

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

    if (this._levelComplete) {
      return false;
    }

    if (this.playerHitCooldown > 0 || this.lives <= 0) {
      return false;
    }

    this.lives = Math.max(0, this.lives - damage);
    this.playerHitCooldown = PLAYER_HIT_COOLDOWN;
    this.player.flashDamage(PLAYER_HIT_COOLDOWN);

    // trigger HUD damage flash and low-health indicator
    if (this.hud) {
      if (typeof this.hud.flashDamage === 'function') this.hud.flashDamage();
      if (typeof this.hud.setLowHealth === 'function') this.hud.setLowHealth(this._getPlayerHullPercent() <= 20);
    }

    if (this.lives <= 0) {
      this._startGameOverSequence();
    }

    return true;
  }

  // ── Debrief dialogue ──────────────────────────────────────────────────────

  _createTransitionCutsceneVisuals(kind, start, end, direction, up) {
    const group = new THREE.Group();
    const rings = [];

    const ringColor = kind === 'breach-entry' ? 0x7fdcff : 0xffb27c;
    const ringCount = kind === 'breach-entry' ? 10 : 12;
    const ringRadius = kind === 'breach-entry' ? 34 : 28;
    const ringSpacing = kind === 'breach-entry' ? 42 : 56;

    const basisRight = new THREE.Vector3().crossVectors(direction, up).normalize();
    const basisUp = new THREE.Vector3().crossVectors(basisRight, direction).normalize();

    for (let i = 0; i < ringCount; i++) {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(ringRadius, 1.7, 12, 40),
        new THREE.MeshBasicMaterial({
          color: ringColor,
          transparent: true,
          opacity: kind === 'breach-entry' ? 0.22 : 0.35,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
      );
      const t = i / Math.max(1, ringCount - 1);
      ring.position.copy(start).lerp(end, t);
      ring.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), direction);
      ring.userData.baseOpacity = ring.material.opacity;
      ring.userData.phase = Math.random() * Math.PI * 2;
      rings.push(ring);
      group.add(ring);
    }

    let portal = null;
    if (kind === 'tunnel-exit') {
      portal = new THREE.Mesh(
        new THREE.CircleGeometry(26, 40),
        new THREE.MeshBasicMaterial({
          color: 0xfff1cf,
          transparent: true,
          opacity: 0.92,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
      );
      portal.position.copy(end);
      portal.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), direction);
      group.add(portal);
    }

    if (kind === 'breach-entry' && this._trashteroid?.group) {
      const glow = new THREE.Mesh(
        new THREE.CircleGeometry(30, 40),
        new THREE.MeshBasicMaterial({
          color: 0x8fe9ff,
          transparent: true,
          opacity: 0.3,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
      );
      glow.position.copy(end).addScaledVector(direction, 6);
      glow.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), direction);
      portal = glow;
      group.add(glow);
    }

    this.scene.add(group);
    return { group, rings, portal, basisRight, basisUp };
  }

  _disposeTransitionCutscene() {
    const cs = this._transitionCutscene;
    if (!cs) return;

    cs.visuals?.group?.traverse?.((child) => {
      child.geometry?.dispose?.();
      if (child.material) {
        const materials = Array.isArray(child.material) ? child.material : [child.material];
        for (const material of materials) material?.dispose?.();
      }
    });
    if (cs.visuals?.group?.parent) {
      cs.visuals.group.parent.remove(cs.visuals.group);
    }
    this._transitionCutscene = null;
  }

  _enterLevelWithOpeningBriefing(level) {
    this._levelCompleteEl?.classList.add('hidden');
    this._levelComplete = false;
    this.paused = false;
    this._pauseUnlockArmed = false;
    if (this.crosshair) this.crosshair.classList.add('hidden');
    this._enterLevel(level, {
      resetPlayerPosition: true,
      resetRunStats: true,
    });
    this.paused = true;
    this._showLevelOpeningBriefing(level);
  }

  _startLevelTransitionCutscene(nextLevel) {
    const currentLevel = this.levels.current;
    let kind = null;
    if (currentLevel === 1 && nextLevel === 2) kind = 'breach-entry';
    if (currentLevel === 2 && nextLevel === 3) kind = 'tunnel-exit';

    if (!kind) {
      this._enterLevelWithOpeningBriefing(nextLevel);
      return;
    }

    this._levelCompleteEl?.classList.add('hidden');
    this._cleanupCommsHandlers();
    this._debriefDialogue = null;
    this.paused = false;
    this._pauseUnlockArmed = false;
    this.boostActive = false;
    this.input.releaseAll();
    if (this.crosshair) this.crosshair.classList.add('hidden');
    if (document.pointerLockElement) document.exitPointerLock();
    soundtrackManager.setBoosting(false);
    soundtrackManager.setThrusting(false);
    this.hud.setPauseVisible(false);
    this.hud.setGameplayVisible(false);

    const ship = this.player.mesh;
    ship.visible = true;

    const up = new THREE.Vector3(0, 1, 0);
    let start = ship.position.clone();
    let end;
    let direction;
    let duration = LEVEL_TRANSITION_ENTRY_DURATION;

    if (kind === 'breach-entry' && this._trashteroid?.group) {
      end = this._trashteroid.group.position.clone();
      direction = end.clone().sub(start).normalize();
      start = end.clone().addScaledVector(direction, -(this._trashteroid.collisionRadius + 520));
      end = end.clone().addScaledVector(direction, -(this._trashteroid.collisionRadius * 0.12));
    } else {
      const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.player.baseQuaternion).normalize();
      direction = forward.lengthSq() > 0 ? forward : new THREE.Vector3(0, 0, -1);
      start = ship.position.clone();
      end = start.clone().addScaledVector(direction, 720);
      duration = LEVEL_TRANSITION_EXIT_DURATION;
    }

    ship.position.copy(start);
    const lookQuat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, -1), direction);
    ship.quaternion.copy(lookQuat);
    this.player.baseQuaternion.copy(lookQuat);

    const visuals = this._createTransitionCutsceneVisuals(kind, start, end, direction, up);
    this._transitionCutscene = {
      kind,
      nextLevel,
      elapsed: 0,
      duration,
      start,
      end,
      direction,
      up,
      lookQuat,
      visuals,
      fadeStarted: false,
    };
  }

  _updateLevelTransitionCutscene(rawDelta) {
    const cs = this._transitionCutscene;
    if (!cs) return;

    const dt = Math.max(0, rawDelta);
    cs.elapsed += dt;
    const progress = THREE.MathUtils.clamp(cs.elapsed / cs.duration, 0, 1);
    const eased = 1 - Math.pow(1 - progress, 3);

    soundtrackManager.setBoosting(false);
    soundtrackManager.setThrusting(false);

    const shipPos = cs.start.clone().lerp(cs.end, eased);
    this.player.velocity.set(0, 0, 0);
    this.player.mesh.position.copy(shipPos);
    this.player.baseQuaternion.copy(cs.lookQuat);
    this.player.mesh.quaternion.copy(cs.lookQuat);

    const cameraDistance = cs.kind === 'breach-entry' ? 44 : 32;
    const cameraLift = cs.kind === 'breach-entry' ? 12 : 8;
    _camTarget.copy(shipPos)
      .addScaledVector(cs.direction, -cameraDistance)
      .addScaledVector(cs.up, cameraLift);
    this.camera.position.copy(_camTarget);
    _camLookTarget.copy(shipPos).addScaledVector(cs.direction, 140);
    this.camera.up.copy(cs.up);
    this.camera.lookAt(_camLookTarget);
    const targetFov = cs.kind === 'breach-entry' ? 58 : 62;
    this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, targetFov, 1 - Math.exp(-4 * dt));
    this.camera.updateProjectionMatrix();

    for (let i = 0; i < cs.visuals.rings.length; i++) {
      const ring = cs.visuals.rings[i];
      ring.rotation.z += dt * (0.45 + i * 0.03);
      const pulse = 0.72 + Math.sin(cs.elapsed * 2.6 + ring.userData.phase) * 0.28;
      ring.material.opacity = ring.userData.baseOpacity * pulse;
    }

    if (cs.visuals.portal) {
      const portalScale = cs.kind === 'tunnel-exit'
        ? 1 + progress * 1.45
        : 1 + Math.sin(cs.elapsed * 3.2) * 0.08;
      cs.visuals.portal.scale.setScalar(portalScale);
      if (cs.kind === 'tunnel-exit') {
        cs.visuals.portal.material.opacity = THREE.MathUtils.lerp(0.65, 1, progress);
      }
    }

    this._updateEffects(dt);
    this._updateBackground(dt);
    if (!this.levels.getCurrentConfig().interior) {
      this.asteroidField.update(dt, this.player.mesh.position);
    } else if (this._tunnelMaze) {
      this._tunnelMaze.update(dt, this.player.mesh.position, this.player.baseQuaternion);
    }
    this.starfield.update(dt, this.camera);

    if (!cs.fadeStarted && progress >= 1 - (LEVEL_TRANSITION_FADE_DURATION / cs.duration)) {
      cs.fadeStarted = true;
      this._runScreenFadeMidpoint(() => {
        const targetLevel = cs.nextLevel;
        this._disposeTransitionCutscene();
        this._enterLevelWithOpeningBriefing(targetLevel);
      }, LEVEL_TRANSITION_FADE_DURATION * 1000);
    }

    this.renderer.render(this.scene, this.camera);
  }

  _startPostLevelComms() {
    const summary = this._levelStatsSummary;
    const el = this._levelCompleteEl;
    if (!el || !summary) return;

    const commsPanel = el.querySelector('#comms-panel');
    const menuEl = el.querySelector('#level-complete-menu');
    const messagesEl = el.querySelector('#comms-messages');
    const promptEl = el.querySelector('#comms-prompt');
    const retryBtn = el.querySelector('#comms-retry-btn');

    if (menuEl) menuEl.classList.add('hidden');
    if (commsPanel) commsPanel.classList.remove('hidden');
    if (messagesEl) messagesEl.innerHTML = '';
    if (promptEl) promptEl.classList.add('hidden');
    if (retryBtn) retryBtn.classList.add('hidden');
    el.classList.remove('level-complete-reveal');
    el.classList.remove('hidden');

    // Briefing aside is pre-level only — hide it during failure debrief.
    this._populateCommsBriefingAside(null);

    const { reqDone, nextLevel } = summary;
    const scoreText = Math.round(this.score).toString().padStart(6, '0');
    const completedLevel = this.levels.current;

    const onDone = () => {
      if (nextLevel) {
        this._enterLevelWithOpeningBriefing(nextLevel);
      } else if (reqDone) {
        this._levelCompleteEl?.classList.add('hidden');
        if (typeof this._onReturnToLevelSelect === 'function') {
          this._onReturnToLevelSelect({ level: completedLevel, outcome: 'complete' });
        }
      } else {
        // Failure: surface a retry button inside the comms footer. The
        // pointer-events check on the retry button is independent of the
        // comms-panel click handler that advances dialogue.
        if (retryBtn) {
          retryBtn.classList.remove('hidden');
          const fire = () => {
            retryBtn.removeEventListener('click', this._commsRetryHandler);
            window.removeEventListener('keydown', this._commsRetryKeyHandler);
            this._commsRetryHandler = null;
            this._commsRetryKeyHandler = null;
            this._onLevelRetry();
          };
          this._commsRetryHandler = (e) => {
            e.stopPropagation();
            fire();
          };
          this._commsRetryKeyHandler = (e) => {
            if (e.code === 'Space' || e.code === 'Enter') {
              e.preventDefault();
              fire();
            }
          };
          retryBtn.addEventListener('click', this._commsRetryHandler);
          window.addEventListener('keydown', this._commsRetryKeyHandler);
        }
      }
    };

    // Success path skips the debrief dialogue entirely — the player flows
    // straight from one mission into the next (or the win screen).
    if (reqDone) {
      onDone();
      return;
    }

    const dialogueFn = LEVEL_FAILURE_DIALOGUES[completedLevel];
    const lines = dialogueFn ? dialogueFn(scoreText) : [];

    this._debriefDialogue = {
      lines,
      lineIndex: 0,
      charIndex: 0,
      charTimer: 0.2,
      waitingForAdvance: false,
      done: false,
      isPrelevel: false,
      currentTextEl: null,
      stats: null,
      onDone,
    };

    this._setupCommsHandlers();
    if (lines.length > 0) {
      this._addCommsMessageBubble(0);
    } else {
      this._debriefDialogue.onDone?.();
    }
  }

  _populateCommsBriefingAside(level) {
    const el = this._levelCompleteEl;
    if (!el) return;
    const aside = el.querySelector('#comms-briefing');
    if (!aside) return;

    if (!level) {
      aside.classList.add('hidden');
      return;
    }

    const config = this.levels.getConfig(level);
    const brief = getBriefing(level);
    const levelEl = aside.querySelector('#comms-briefing-level');
    const taglineEl = aside.querySelector('#comms-briefing-tagline');
    const reqEl = aside.querySelector('#comms-briefing-required');
    const bonusEl = aside.querySelector('#comms-briefing-bonus');
    const bonusTitle = aside.querySelector('.comms-briefing-bonus-title');

    if (levelEl) levelEl.textContent = config?.label ?? `LEVEL ${level}`;
    if (taglineEl) taglineEl.textContent = config?.briefingTagline ?? '';

    if (reqEl) {
      reqEl.innerHTML = '';
      for (const item of brief?.required ?? []) {
        const li = document.createElement('li');
        li.textContent = item;
        reqEl.appendChild(li);
      }
    }

    const bonusItems = brief?.bonus ?? [];
    const bonusCol = aside.querySelector('.comms-briefing-col--bonus');
    if (bonusEl) {
      bonusEl.innerHTML = '';
      for (const item of bonusItems) {
        const li = document.createElement('li');
        li.textContent = item;
        bonusEl.appendChild(li);
      }
    }
    if (bonusCol) bonusCol.classList.toggle('hidden', bonusItems.length === 0);

    // Content is populated, but the panel stays hidden until the comms
    // dialogue finishes typing — see _revealCommsBriefingSummary.
    aside.classList.add('hidden');
  }

  _revealCommsBriefingSummary() {
    const aside = this._levelCompleteEl?.querySelector('#comms-briefing');
    if (!aside) return;
    if (!aside.classList.contains('hidden')) return; // already revealed this session
    if (!aside.querySelector('#comms-briefing-level')?.textContent) return;
    aside.classList.remove('hidden');
  }

  _showLevelOpeningBriefing(level) {
    const el = this._levelCompleteEl;
    if (!el) return;

    const commsPanel = el.querySelector('#comms-panel');
    const menuEl = el.querySelector('#level-complete-menu');
    const messagesEl = el.querySelector('#comms-messages');
    const promptEl = el.querySelector('#comms-prompt');

    if (menuEl) menuEl.classList.add('hidden');
    if (commsPanel) commsPanel.classList.remove('hidden');
    if (messagesEl) messagesEl.innerHTML = '';
    if (promptEl) promptEl.classList.add('hidden');
    el.classList.remove('hidden', 'level-complete-reveal');

    // Pointer lock was still active from gameplay (or the previous level)
    // — release it so the OS cursor reappears and DOM clicks reach the
    // comms-panel advance handler. Also hide the in-game crosshair.
    if (document.pointerLockElement) document.exitPointerLock();
    if (this.crosshair) this.crosshair.classList.add('hidden');
    this.paused = true;

    this._populateCommsBriefingAside(level);

    const lines = LEVEL_BRIEFINGS[level] ?? [];

    this._debriefDialogue = {
      lines,
      lineIndex: 0,
      charIndex: 0,
      charTimer: 0.47,
      waitingForAdvance: false,
      done: false,
      isPrelevel: true,
      nextLevel: null,
      currentTextEl: null,
      stats: null,
      onDone: () => {
        const screenEl = this._levelCompleteEl;
        if (screenEl) screenEl.classList.add('hidden');
        this._debriefDialogue = null;
        this.paused = false;
        this._pauseUnlockArmed = false;
        if (this.crosshair) this.crosshair.classList.remove('hidden');
        this.canvas.requestPointerLock();
      },
    };

    this._setupCommsHandlers();
    if (lines.length > 0) {
      this._addCommsMessageBubble(0);
    } else {
      this._debriefDialogue.onDone?.();
    }
  }

  _setupCommsHandlers() {
    this._cleanupCommsHandlers();
    const commsPanel = this._levelCompleteEl?.querySelector('#comms-panel');
    if (!commsPanel) return;

    this._commsAdvanceClickHandler = (e) => {
      if (e.target.closest('button')) return;
      this._advanceDebriefDialogue();
    };
    commsPanel.addEventListener('click', this._commsAdvanceClickHandler);

    this._commsAdvanceKeyHandler = (e) => {
      if (e.code === 'Space') {
        e.preventDefault();
        this._advanceDebriefDialogue();
      }
    };
    window.addEventListener('keydown', this._commsAdvanceKeyHandler);
  }

  _cleanupCommsHandlers() {
    const commsPanel = this._levelCompleteEl?.querySelector('#comms-panel');
    if (this._commsAdvanceClickHandler) {
      commsPanel?.removeEventListener('click', this._commsAdvanceClickHandler);
      this._commsAdvanceClickHandler = null;
    }
    if (this._commsAdvanceKeyHandler) {
      window.removeEventListener('keydown', this._commsAdvanceKeyHandler);
      this._commsAdvanceKeyHandler = null;
    }
  }

  _addCommsMessageBubble(lineIndex) {
    const d = this._debriefDialogue;
    const line = d?.lines[lineIndex];
    const el = this._levelCompleteEl;
    if (!el || !line) return;
    const messagesEl = el.querySelector('#comms-messages');
    if (!messagesEl) return;

    // Ensure the continue prompt is visible from the moment a line begins
    // typing — not only after the line finishes. The launch label and the
    // mission summary reveal happen only once the line finishes typing
    // (see _typeCharForDebriefDialogue / _advanceDebriefDialogue).
    this._showCommsPrompt(false);

    const isControl = line.speaker === 'MISSION_CONTROL';
    const msgEl = document.createElement('div');
    msgEl.className = `comms-msg ${isControl ? 'comms-msg--control' : 'comms-msg--pilot'}`;

    const speakerEl = document.createElement('span');
    speakerEl.className = 'comms-speaker';
    speakerEl.textContent = isControl ? 'MISSION CONTROL' : 'YOU';

    const textEl = document.createElement('span');
    textEl.className = 'comms-text';

    msgEl.appendChild(speakerEl);
    msgEl.appendChild(textEl);
    messagesEl.appendChild(msgEl);
    messagesEl.scrollTop = messagesEl.scrollHeight;

    d.currentTextEl = textEl;
  }

  _updateDebriefDialogue(delta) {
    const d = this._debriefDialogue;
    if (!d || d.done || d.waitingForAdvance) return;

    d.charTimer -= delta;
    if (d.charTimer > 0) return;

    const line = d.lines[d.lineIndex];
    if (!line) return;

    if (d.charIndex >= line.text.length) {
      d.waitingForAdvance = true;
      this._showCommsPrompt(d.lineIndex === d.lines.length - 1 && d.isPrelevel);
      return;
    }

    const ch = line.text[d.charIndex++];
    if (d.currentTextEl) {
      d.currentTextEl.textContent += ch;
      const messagesEl = this._levelCompleteEl?.querySelector('#comms-messages');
      if (messagesEl) messagesEl.scrollTop = messagesEl.scrollHeight;
    }

    if ('.!?'.includes(ch)) {
      d.charTimer = 0.27;
    } else if (ch === ',') {
      d.charTimer = 0.08;
    } else {
      d.charTimer = 0.019;
    }
  }

  _advanceDebriefDialogue() {
    const d = this._debriefDialogue;
    if (!d || d.done) return;

    if (!d.waitingForAdvance) {
      const line = d.lines[d.lineIndex];
      if (line && d.currentTextEl) d.currentTextEl.textContent = line.text;
      const messagesEl = this._levelCompleteEl?.querySelector('#comms-messages');
      if (messagesEl) messagesEl.scrollTop = messagesEl.scrollHeight;
      d.charIndex = line?.text.length ?? 0;
      d.waitingForAdvance = true;
      this._showCommsPrompt(d.lineIndex === d.lines.length - 1 && d.isPrelevel);
      return;
    }

    d.lineIndex++;

    if (d.lineIndex >= d.lines.length) {
      d.done = true;
      this._hideCommsPrompt();
      this._cleanupCommsHandlers();
      d.onDone?.();
      return;
    }

    d.charIndex = 0;
    d.charTimer = 0.13;
    d.waitingForAdvance = false;
    d.currentTextEl = null;
    // Keep the continue prompt visible across line transitions; its label
    // gets refreshed for the launch line when typing of that line finishes.
    this._addCommsMessageBubble(d.lineIndex);
  }

  _showCommsPrompt(isLaunch = false) {
    const promptEl = this._levelCompleteEl?.querySelector('#comms-prompt');
    if (!promptEl) return;
    promptEl.textContent = isLaunch ? '▶  SPACE TO LAUNCH' : '▼  SPACE TO CONTINUE';
    promptEl.classList.remove('hidden');
    // Reveal the mission summary panel exactly when the final pre-level
    // line finishes typing, so the screen stays clean until the comms are done.
    if (isLaunch) this._revealCommsBriefingSummary();
  }

  _hideCommsPrompt() {
    const promptEl = this._levelCompleteEl?.querySelector('#comms-prompt');
    if (promptEl) promptEl.classList.add('hidden');
  }

  _onDebriefDialogueDone() {
    this._showLevelStatsPanel(this._debriefDialogue?.stats);
  }

  _showLevelStatsPanel(stats) {
    const el = this._levelCompleteEl;
    if (!el) return;

    const commsPanel = el.querySelector('#comms-panel');
    const menuEl = el.querySelector('#level-complete-menu');
    if (!menuEl) return;

    if (commsPanel) commsPanel.classList.add('hidden');

    const { reqDone, stars, completedObjectives, totalObjectives, nextLevel } = stats ?? {};
    const mission = this.levels.getMissionConfig();

    const titleEl = el.querySelector('#level-complete-title');
    const starSpans = el.querySelectorAll('.lc-star');
    const objectivesEl = el.querySelector('#level-complete-objectives');
    const scoreEl = el.querySelector('#level-complete-score');
    const nextBtn = el.querySelector('#level-next-btn');
    const retryBtn = el.querySelector('#level-retry-btn');

    if (titleEl) {
      titleEl.textContent = reqDone
        ? (mission?.successTitle ?? `LEVEL ${this.levels.current} CLEARED`)
        : 'TIME UP';
    }

    starSpans.forEach((span, i) => {
      const filled = i < (stars ?? 0);
      span.textContent = filled ? '★' : '☆';
      span.classList.toggle('filled', filled);
    });

    if (objectivesEl) {
      objectivesEl.textContent = `${completedObjectives ?? 0}/${totalObjectives ?? 0} objectives completed`;
    }

    const finalScore = Math.max(0, Math.floor(this.score));
    if (scoreEl) {
      scoreEl.textContent = '000000';
      if (this._scoreCounterRaf) {
        cancelAnimationFrame(this._scoreCounterRaf);
        this._scoreCounterRaf = null;
      }
      const COUNTER_START_DELAY = 500;
      const COUNTER_DURATION = 1200;
      const startTime = performance.now();
      const tick = (now) => {
        const elapsed = now - startTime - COUNTER_START_DELAY;
        if (elapsed < 0) { this._scoreCounterRaf = requestAnimationFrame(tick); return; }
        const progress = Math.min(1, elapsed / COUNTER_DURATION);
        const eased = 1 - Math.pow(1 - progress, 3);
        scoreEl.textContent = Math.round(eased * finalScore).toString().padStart(6, '0');
        if (progress < 1) this._scoreCounterRaf = requestAnimationFrame(tick);
        else this._scoreCounterRaf = null;
      };
      this._scoreCounterRaf = requestAnimationFrame(tick);
    }

    if (nextBtn) {
      if (reqDone && nextLevel) {
        nextBtn.textContent = 'NEXT';
        nextBtn.classList.remove('hidden');
      } else if (reqDone && !nextLevel) {
        nextBtn.textContent = 'NEXT';
        nextBtn.classList.remove('hidden');
      } else {
        nextBtn.classList.add('hidden');
      }
    }
    if (retryBtn) retryBtn.textContent = 'RETRY';

    menuEl.classList.remove('hidden', 'level-complete-reveal');
    el.classList.remove('hidden', 'level-complete-reveal');
    void el.offsetWidth;
    el.classList.add('level-complete-reveal');
  }

  _launchNextLevel(nextLevel) {
    const el = this._levelCompleteEl;
    if (el) el.classList.add('hidden');
    if (this._scoreCounterRaf) {
      cancelAnimationFrame(this._scoreCounterRaf);
      this._scoreCounterRaf = null;
    }
    this._debriefDialogue = null;
    this._levelComplete = false;
    this.paused = false;
    this._pauseUnlockArmed = false;
    if (this.crosshair) this.crosshair.classList.remove('hidden');
    this.canvas.requestPointerLock();
    this._enterLevel(nextLevel, {
      resetPlayerPosition: true,
      resetRunStats: true,
    });
  }

  _onLevelNext() {
    this._cancelLevelCompleteTransition();
    this._startPostLevelComms();
  }

  _onLevelRetry() {
    this._cancelLevelCompleteTransition();
    this._cleanupCommsHandlers();
    const retryBtn = this._levelCompleteEl?.querySelector('#comms-retry-btn');
    if (retryBtn && this._commsRetryHandler) {
      retryBtn.removeEventListener('click', this._commsRetryHandler);
      this._commsRetryHandler = null;
    }
    if (this._commsRetryKeyHandler) {
      window.removeEventListener('keydown', this._commsRetryKeyHandler);
      this._commsRetryKeyHandler = null;
    }
    if (retryBtn) retryBtn.classList.add('hidden');
    this._debriefDialogue = null;
    this._levelStatsSummary = null;
    this._levelCompleteEl?.classList.add('hidden');
    this._pauseUnlockArmed = false;
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
    const levelConfig = this.levels.getCurrentConfig();
    if (levelConfig.interior && this._tunnelMaze && typeof this._tunnelMaze.getRadarNetwork === 'function') {
      const network = this._tunnelMaze.getRadarNetwork();
      const weakSpots = this._tunnelMaze.getWeakSpots?.();
      this.hud.updateInteriorMinimap(true, playerPos, camInvQuat, network, weakSpots);
      return;
    }
    this.hud.updateMinimap(
      true,
      this._getMissionTargetPosition(),
      playerPos,
      camInvQuat,
      this.asteroidField.getColliders()
    );
  }


  _gameOver() {
    const overlayAlreadyShown = this._deathOverlayShown;
    this._deathSequenceActive = false;
    this._gameOverActive = true;
    this._deathSequenceTimer = 0;
    this._deathOverlayShown = false;
    this.hud.setGameplayVisible(false);
    this.hud.setPauseVisible(false);
    if (this.crosshair) {
      this.crosshair.classList.add('hidden');
    }
    if (!overlayAlreadyShown) {
      this.hud.showMessage(this._timedOut ? "TIME'S UP" : 'GAME OVER', {
        animateIn: true,
        keepDamageVignette: true,
        onPlayAgain: () => {
          document.activeElement?.blur();
          this.hud.overlay?.classList.add('hidden');
          if (typeof this._onHideLevelSelect === 'function') {
            this._onHideLevelSelect();
          }
          this._pauseUnlockArmed = false;
          this._enterLevel(this.levels.current, {
            resetPlayerPosition: true,
            resetRunStats: true,
          });
          if (this.crosshair) this.crosshair.classList.remove('hidden');
          this.canvas.requestPointerLock();
        },
      });
    }
    // No auto-return — player uses the PLAY AGAIN button.
  }

  /* ════════════════════════════════════════════════════════════════════════
   *  Trashteroid destruction cutscene
   * ════════════════════════════════════════════════════════════════════════ */

  _startDestructionCutscene() {
    const t = this._trashteroid;
    if (!t) return;

    // Freeze player & hide UI
    this.boostActive = false;
    this._pauseUnlockArmed = false;
    this.input.releaseAll();
    this.player.velocity.set(0, 0, 0);

    // Hide boss UI
    this.hud.setBossBarVisible(false);
    this.hud.updateBossIndicator(false, 0, 0, 0, 0);

    // Store camera start for lerp
    const camStartPos = this.camera.position.clone();
    const camStartLook = _camLookTarget.clone();

    // Compute a cinematic camera position: offset to the side & above the trashteroid
    const bossPos = t.group.position.clone();
    const toPlayer = this.player.mesh.position.clone().sub(bossPos).normalize();
    // Camera goes to ~3.5x collision radius away, offset up and to the right
    const viewDist = (t.collisionRadius || 60) * 3.5;
    const camRight = new THREE.Vector3().crossVectors(toPlayer, _worldUp).normalize();
    const camEndPos = bossPos.clone()
      .addScaledVector(toPlayer, viewDist * 0.7)
      .addScaledVector(camRight, viewDist * 0.4)
      .addScaledVector(_worldUp, viewDist * 0.35);

    const surfaceRadius = t.collisionRadius || t.hitRadius || 55;
    const scaleRef = t.group.scale.x || 1; // configured scale for sizing explosions

    // Compute orbit basis from the fly-in end position
    const orbitOffset = camEndPos.clone().sub(bossPos);
    // Use XZ-plane distance for the orbit radius (Y handled separately)
    const orbitDist = Math.sqrt(orbitOffset.x * orbitOffset.x + orbitOffset.z * orbitOffset.z);
    const orbitAngle0 = Math.atan2(orbitOffset.z, orbitOffset.x);
    const orbitY = camEndPos.y;

    this._destructionCutscene = {
      phase: 'camera-fly-in',
      elapsed: 0,
      phaseTime: 0,
      camStartPos,
      camStartLook,
      camEndPos,
      bossPos,
      surfaceRadius,
      scaleRef,
      orbitDist,
      orbitAngle0,
      orbitY,
      surfaceExplosionTimer: 0,
      bigBangFired: false,
      debrisSpawned: false,
      debrisExploded: false,
      debrisPositions: [],
    };

    // Stop the trashteroid from moving/attacking but keep it visible
    t.active = false;

    this._playBoomSfx();
  }

  _updateDestructionCutscene(rawDelta) {
    const dt = Math.max(0, rawDelta);
    const cs = this._destructionCutscene;
    if (!cs) return;

    cs.elapsed += dt;
    cs.phaseTime += dt;

    const t = this._trashteroid;
    const bossPos = cs.bossPos;

    // Keep rendering the world (particles, starfield, background)
    soundtrackManager.setBoosting(false);
    soundtrackManager.setThrusting(false);

    // Update subsystems so particles & asteroids keep moving visually
    this._updateEffects(dt);
    this._updateBackground(dt);
    this.starfield.update(dt, this.camera);
    this.asteroidField.update(dt, this.player.mesh.position);

    // Slowly rotate the trashteroid for dramatic effect
    if (t && t.group.visible) {
      t.group.rotation.y += 0.15 * dt;
      t.group.rotation.x += 0.05 * dt;
    }

    // ── Phase: Camera fly-in ──
    if (cs.phase === 'camera-fly-in') {
      const progress = Math.min(cs.phaseTime / CUTSCENE_CAMERA_FLY_IN, 1);
      // Smooth ease-in-out
      const ease = progress < 0.5
        ? 2 * progress * progress
        : 1 - Math.pow(-2 * progress + 2, 2) / 2;

      this.camera.position.lerpVectors(cs.camStartPos, cs.camEndPos, ease);
      _cutsceneCamTarget.copy(bossPos);
      this.camera.lookAt(_cutsceneCamTarget);
      this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, 45, 1 - Math.exp(-2 * dt));
      this.camera.updateProjectionMatrix();

      if (progress >= 1) {
        cs.phase = 'surface-explosions';
        cs.phaseTime = 0;
        cs.surfaceExplosionTimer = 0;
      }
    }

    // ── Phase: Surface explosions ──
    else if (cs.phase === 'surface-explosions') {
      // Camera gently orbits, continuing from fly-in end angle
      const orbitAngle = cs.orbitAngle0 + cs.phaseTime * 0.3;
      this.camera.position.set(
        bossPos.x + Math.cos(orbitAngle) * cs.orbitDist,
        cs.orbitY + Math.sin(cs.phaseTime * 0.5) * cs.orbitDist * 0.04,
        bossPos.z + Math.sin(orbitAngle) * cs.orbitDist
      );
      this.camera.lookAt(bossPos);

      // Spawn surface explosions at random points on the surface
      cs.surfaceExplosionTimer += dt;
      while (cs.surfaceExplosionTimer >= CUTSCENE_SURFACE_EXPLOSION_INTERVAL) {
        cs.surfaceExplosionTimer -= CUTSCENE_SURFACE_EXPLOSION_INTERVAL;
        // Random point on sphere surface
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(2 * Math.random() - 1);
        _cutsceneSurfacePoint.set(
          Math.sin(phi) * Math.cos(theta),
          Math.sin(phi) * Math.sin(theta),
          Math.cos(phi)
        ).multiplyScalar(cs.surfaceRadius * 0.95).add(bossPos);

        const explosionSize = 0.4 + Math.random() * 0.6;
        this._spawnExplosion(_cutsceneSurfacePoint.clone(), {
          count: Math.floor(300 * explosionSize),
          ttl: 1.0 + Math.random() * 0.8,
          sizeScale: cs.scaleRef * 1.8 * explosionSize,
          velocityScale: cs.scaleRef * 1.2 * explosionSize,
          smokeSizeMultiplier: 0.3,
        });

        // Occasional boom SFX
        if (Math.random() < 0.35) {
          this._playBoomSfx();
        }
      }

      // Shake the trashteroid increasingly
      if (t && t.group.visible) {
        const shakeIntensity = cs.phaseTime / CUTSCENE_SURFACE_EXPLOSIONS;
        const shakeAmount = shakeIntensity * shakeIntensity * cs.scaleRef * 0.6;
        t.group.position.set(
          bossPos.x + (Math.random() - 0.5) * shakeAmount,
          bossPos.y + (Math.random() - 0.5) * shakeAmount,
          bossPos.z + (Math.random() - 0.5) * shakeAmount
        );
      }

      if (cs.phaseTime >= CUTSCENE_SURFACE_EXPLOSIONS) {
        cs.phase = 'big-bang';
        cs.phaseTime = 0;
        // Snap position back
        if (t) t.group.position.copy(bossPos);
      }
    }

    // ── Phase: Big bang ──
    else if (cs.phase === 'big-bang') {
      this.camera.lookAt(bossPos);

      if (!cs.bigBangFired && cs.phaseTime >= CUTSCENE_BIG_BANG_DELAY) {
        cs.bigBangFired = true;

        // Massive explosion
        this._spawnExplosion(bossPos.clone(), {
          count: 500,
          ttl: 3.0,
          sizeScale: cs.scaleRef * 4.5,
          velocityScale: cs.scaleRef * 6,
          smokeSizeMultiplier: 0.2,
        });

        this._playBoomSfx();
        // Queue a second boom slightly delayed for a double-crack effect
        setTimeout(() => this._playBoomSfx(), 150);

        // Hide the trashteroid
        if (t) {
          t.group.visible = false;
        }

        // Clear existing debris from the boss fight so slots are free
        this.debris.clear();
        this.specialDebris.clear();
        this.recycleDebris.clear();

        // Spawn debris flying outward
        cs.debrisPositions = [];
        let _dbgSpawned = 0;
        let _dbgFailed = 0;
        for (let i = 0; i < CUTSCENE_DEBRIS_COUNT; i++) {
          const theta = Math.random() * Math.PI * 2;
          const phi = Math.acos(2 * Math.random() - 1);
          _cutsceneDir.set(
            Math.sin(phi) * Math.cos(theta),
            Math.sin(phi) * Math.sin(theta),
            Math.cos(phi)
          );
          const spawnPt = bossPos.clone().addScaledVector(_cutsceneDir, cs.surfaceRadius * 0.3);
          const speed = (60 + Math.random() * 80) * cs.scaleRef;
          const ok = this.debris.spawnDirected(spawnPt, _cutsceneDir.clone(), speed, {
            scaleMultiplier: cs.scaleRef * (1.5 + Math.random() * 1.5),
          });
          if (ok) _dbgSpawned++; else _dbgFailed++;
          cs.debrisPositions.push(spawnPt.clone().addScaledVector(_cutsceneDir, speed * 0.8));
        }
        let _dbgSpecialSpawned = 0;
        let _dbgSpecialFailed = 0;
        for (let i = 0; i < CUTSCENE_SPECIAL_DEBRIS_COUNT; i++) {
          const theta = Math.random() * Math.PI * 2;
          const phi = Math.acos(2 * Math.random() - 1);
          _cutsceneDir.set(
            Math.sin(phi) * Math.cos(theta),
            Math.sin(phi) * Math.sin(theta),
            Math.cos(phi)
          );
          const spawnPt = bossPos.clone().addScaledVector(_cutsceneDir, cs.surfaceRadius * 0.3);
          const speed = (50 + Math.random() * 70) * cs.scaleRef;
          const ok2 = this.specialDebris.spawnDirected(spawnPt, _cutsceneDir.clone(), speed, {
            scaleMultiplier: cs.scaleRef * (1.2 + Math.random()),
          });
          if (ok2) _dbgSpecialSpawned++; else _dbgSpecialFailed++;
          cs.debrisPositions.push(spawnPt.clone().addScaledVector(_cutsceneDir, speed * 0.8));
        }

        console.log('[CUTSCENE] debris spawned:', _dbgSpawned, 'failed:', _dbgFailed,
          '| special spawned:', _dbgSpecialSpawned, 'failed:', _dbgSpecialFailed,
          '| debris.active:', this.debris.getActive().length,
          '| specialDebris.active:', this.specialDebris.getActive().length,
          '| bossPos:', bossPos.toArray(),
          '| surfaceRadius:', cs.surfaceRadius, '| scaleRef:', cs.scaleRef);

        cs.debrisSpawned = true;
        cs.phase = 'debris-burst';
        cs.phaseTime = 0;
      }
    }

    // ── Phase: Debris burst (debris flies outward then explodes) ──
    if (cs.phase === 'debris-burst') {
      // Camera continues gentle orbit around the explosion center
      const orbitAngle = cs.orbitAngle0 + (cs.elapsed - CUTSCENE_CAMERA_FLY_IN) * 0.25;
      this.camera.position.set(
        bossPos.x + Math.cos(orbitAngle) * cs.orbitDist,
        cs.orbitY,
        bossPos.z + Math.sin(orbitAngle) * cs.orbitDist
      );
      this.camera.lookAt(bossPos);

      // Update debris so they keep flying — use bossPos as anchor so
      // the despawn-distance check doesn't cull them instantly
      const spawnConfig = this.levels.getSpawnConfig();
      const cutsceneConfig = Object.assign({}, spawnConfig, {
        despawnDistance: cs.surfaceRadius * 4,
        recycleBehindDistance: cs.surfaceRadius * 4,
      });
      const playerQuat = this.player.baseQuaternion;
      this.debris.update(dt, cutsceneConfig, bossPos, playerQuat);
      this.specialDebris.update(dt, cutsceneConfig, bossPos, playerQuat);

      // After delay, explode all remaining debris
      if (!cs.debrisExploded && cs.phaseTime >= CUTSCENE_DEBRIS_EXPLODE_DELAY) {
        cs.debrisExploded = true;

        // Explode each debris piece
        const activeDebris = this.debris.getActive();
        for (let i = activeDebris.length - 1; i >= 0; i--) {
          this._spawnExplosion(activeDebris[i].position.clone(), {
            count: 400,
            ttl: 1.6,
            sizeScale: cs.scaleRef * 2,
            velocityScale: cs.scaleRef * 1.5,
            smokeSizeMultiplier: 0.3,
          });
        }
        const activeSpecial = this.specialDebris.getActive();
        for (let i = activeSpecial.length - 1; i >= 0; i--) {
          const pos = activeSpecial[i].mesh ? activeSpecial[i].mesh.position.clone() : activeSpecial[i].position.clone();
          this._spawnExplosion(pos, {
            count: 500,
            ttl: 1.8,
            sizeScale: cs.scaleRef * 2.5,
            velocityScale: cs.scaleRef * 1.75,
            smokeSizeMultiplier: 0.4,
          });
        }

        this.debris.clear();
        this.specialDebris.clear();
        this._playBoomSfx();
      }

      if (cs.phaseTime >= CUTSCENE_DEBRIS_LINGER) {
        cs.phase = 'done';
        cs.phaseTime = 0;
      }
    }

    // ── Phase: Done — hand off to level complete ──
    else if (cs.phase === 'done') {
      if (!cs.finalized) {
        cs.finalized = true;
        this._finalizeLevel(true);
        // Show summary after a short pause so explosion can settle
        this._levelCompleteControlLockRemaining = 2.5;
      }
      // Hold camera in place; tick down the lock and show summary when ready
      this._updatePendingLevelComplete(dt);
      if (this._levelComplete && !this._pendingLevelCompleteSummary) {
        // Summary screen shown — cutscene is over
        this._destructionCutscene = null;
      }
    }

    this.renderer.render(this.scene, this.camera);
  }

  _startGameOverSequence() {
    if (this._deathSequenceActive || !this.running) return;

    this._deathSequenceActive = true;
    this._gameOverActive = false;
    this._deathSequenceTimer = DEATH_SEQUENCE_DURATION;
    this._deathOverlayShown = false;
    this.boostActive = false;
    this._pauseUnlockArmed = false;
    this.player.velocity.set(0, 0, 0);
    this.input.releaseAll();
    if (document.pointerLockElement) {
      document.exitPointerLock();
    }
    if (this.crosshair) {
      this.crosshair.classList.add('hidden');
    }

    const shipPos = this.player.mesh.position.clone();
    this.player.mesh.visible = false;
    this._spawnExplosion(shipPos, {
      count: 380,
      ttl: 1.2,
      sizeScale: 1.0,
      smokeSizeMultiplier: 1.05,
      velocityScale: 1.1,
    });
    // this._spawnSparks(shipPos, {
    //   count: 90,
    //   ttl: 1.05,
    //   speed: 34,
    //   color: 0xff8855,
    //   size: 2.2,
    //   sizeScale: 1.6,
    //   colorEnd: 0x1d0f09,
    // });
    this._playBoomSfx();

    if (typeof this.hud?.setDeathVignette === 'function') {
      this.hud.setDeathVignette(true);
    }
  }

  _updateDeathSequence(rawDelta) {
    soundtrackManager.setBoosting(false);
    soundtrackManager.setThrusting(false);
    this.hud.updateBoostBar(this.boostCharge, false);

    // Keep effects simulating while player controls are locked out.
    this._updateEffects(rawDelta);
    this.renderer.render(this.scene, this.camera);

    this._deathSequenceTimer = Math.max(0, this._deathSequenceTimer - Math.max(0, rawDelta));

    const revealThreshold = Math.max(0, DEATH_SEQUENCE_DURATION - DEATH_OVERLAY_REVEAL_DELAY);
    if (!this._deathOverlayShown && this._deathSequenceTimer <= revealThreshold) {
      this._deathOverlayShown = true;
      this.hud.showMessage(this._timedOut ? "TIME'S UP" : 'GAME OVER', {
        animateIn: true,
        keepDamageVignette: true,
        onPlayAgain: () => {
          document.activeElement?.blur();
          this.hud.overlay?.classList.add('hidden');
          if (typeof this._onHideLevelSelect === 'function') {
            this._onHideLevelSelect();
          }
          this._pauseUnlockArmed = false;
          this._enterLevel(this.levels.current, {
            resetPlayerPosition: true,
            resetRunStats: true,
          });
          if (this.crosshair) this.crosshair.classList.remove('hidden');
          this.canvas.requestPointerLock();
        },
      });
    }

    if (this._deathSequenceTimer <= 0) {
      this._gameOver();
    }
  }

  _updateGameOverBackground(rawDelta) {
    const delta = Math.max(0, rawDelta);

    soundtrackManager.setBoosting(false);
    soundtrackManager.setThrusting(false);

    const playerPos = this.player.mesh.position;
    const playerQuat = this.player.baseQuaternion;
    const levelConfig = this.levels.getCurrentConfig();
    const spawnConfig = this.levels.getSpawnConfig();

    this.projectiles.update(delta);
    this.asteroidField.setTargetCount(levelConfig?.boss?.asteroidTarget);
    this.asteroidField.update(delta, playerPos);
    this.debris.update(delta, spawnConfig, playerPos, playerQuat);
    this.specialDebris.update(delta, spawnConfig, playerPos, playerQuat);
    this.recycleDebris.update(delta, spawnConfig, playerPos, playerQuat);
    this._updateTrashteroid(delta, rawDelta);
    this._updateTrashteroidProjectiles(delta);

    this._updateCamera(delta);
    this._updateBackground(delta);
    this.starfield.update(delta, this.camera);
    this._updateEffects(delta);
    this.renderer.render(this.scene, this.camera);
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
    const sizeScale = options.sizeScale ?? 1;
    const velocityScale = options.velocityScale ?? 1;
    const parent = options.parent ?? this._effectGroup;
    const origin = options.positionIsLocal ? pos : (parent === this._effectGroup ? pos : parent.worldToLocal(pos.clone()));
    const baseSize = (options.size || 0.9) * sizeScale;
    const size = reducedFlashing ? baseSize * 0.78 : baseSize;
    const positions = new Float32Array(count * 3);
    const velocities = new Array(count);
    for (let k = 0; k < count; k++) {
      positions[k * 3] = origin.x + (Math.random() - 0.5) * 0.2 * sizeScale;
      positions[k * 3 + 1] = origin.y + (Math.random() - 0.5) * 0.2 * sizeScale;
      positions[k * 3 + 2] = origin.z + (Math.random() - 0.5) * 0.2 * sizeScale;
      const dir = new THREE.Vector3((Math.random() - 0.5), (Math.random() - 0.2), (Math.random() - 0.5)).normalize();
      velocities[k] = dir.multiplyScalar((options.speed || 12) * speedScale * velocityScale * (0.6 + Math.random() * 0.9));
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
    parent.add(points);

    this._sparks.push({
      mesh: points,
      parent,
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
  _triggerTunnelCollapseFx() {
    const maze = this._tunnelMaze;
    if (!maze || typeof maze.getWallSamplePointsNear !== 'function') return;
    const playerPos = this.player.mesh.position;
    // Sample wall points evenly around the player (no forward-cone filter)
    // so the breach explosions surround the camera rather than clumping
    // toward whichever direction the ship was facing.
    let points = maze.getWallSamplePointsNear(playerPos.clone(), 200, 3500, null);
    if (points.length < 50) {
      points = maze.getWallSamplePointsNear(playerPos.clone(), 200, 5000, null);
    }
    if (!points.length) return;
    const stagger = 11; // ms between bursts → total ~2.2s for 200 points
    for (let i = 0; i < points.length; i++) {
      const pt = points[i];
      setTimeout(() => {
        if (!this.running) return;
        this._spawnExplosion(pt, {
          count: 45,
          ttl: 1.4,
          sizeScale: 4.5,
          velocityScale: 5.5,
          smokeSizeMultiplier: 2.8,
        });
        if ((i % 4) === 0) this._playBoomSfx();
      }, i * stagger);
    }
  }

  _spawnExplosion(pos, options = {}) {
    const reducedFlashing = this._isReducedFlashing();
    const baseCount = options.count || 220;
    const ttl = options.ttl || 1.6;
    const sizeScale = options.sizeScale ?? 1;
    const smokeSizeMultiplier = Math.max(0.1, options.smokeSizeMultiplier ?? 1);
    const velocityScale = options.velocityScale ?? 1;
    const parent = options.parent ?? this._effectGroup;
    const positionIsLocal = !!options.positionIsLocal;

    if (!reducedFlashing) {
      // Core flash — bright, short-lived
      this._spawnSparks(pos.clone(), {
        count: Math.floor(baseCount * 0.12),
        speed: 25,
        size: 8,
        ttl: Math.max(0.2, ttl * 0.12),
        color: 0xffffff,
        colorEnd: 0xffcc88,
        sizeScale,
        velocityScale,
        parent,
        positionIsLocal,
      });
    } else {
      // Reduced flashing mode swaps bright core flash for a gentler burst.
      this._spawnSparks(pos.clone(), {
        count: Math.floor(baseCount * 0.08),
        speed: 16,
        size: 4,
        ttl: Math.max(0.24, ttl * 0.16),
        color: 0xe5b97c,
        colorEnd: 0x6a4a2a,
        blending: THREE.NormalBlending,
        sizeScale,
        velocityScale,
        parent,
        positionIsLocal,
      });
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
      sizeScale,
      velocityScale,
      parent,
      positionIsLocal,
    });

    // Smoke — larger, darker, rises slowly
    const smokeCount = Math.floor(baseCount * 0.28);
    const smokeSizeScale = sizeScale * smokeSizeMultiplier;
    const positions = new Float32Array(smokeCount * 3);
    const velocities = new Array(smokeCount);
    const smokeOrigin = positionIsLocal ? pos : (parent === this._effectGroup ? pos : parent.worldToLocal(pos.clone()));
    for (let k = 0; k < smokeCount; k++) {
      positions[k * 3] = smokeOrigin.x + (Math.random() - 0.5) * 2.0 * smokeSizeScale;
      positions[k * 3 + 1] = smokeOrigin.y + (Math.random() - 0.5) * 1.0 * smokeSizeScale;
      positions[k * 3 + 2] = smokeOrigin.z + (Math.random() - 0.5) * 2.0 * smokeSizeScale;
      // omnidirectional smoke: emit in all directions (slower than embers)
      const dir = new THREE.Vector3((Math.random() - 0.5), (Math.random() - 0.5), (Math.random() - 0.5)).normalize();
      velocities[k] = dir.multiplyScalar((reducedFlashing ? 28 : 45) * velocityScale * (0.6 + Math.random() * 0.8));
    }
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({ map: this._particleTexture, color: 0x333333, size: (reducedFlashing ? 5.0 : 6.0) * smokeSizeScale, sizeAttenuation: true, depthWrite: false, transparent: true, opacity: reducedFlashing ? 0.16 : 0.1, blending: THREE.NormalBlending });
    const points = new THREE.Points(geom, mat);
    parent.add(points);
    this._sparks.push({ mesh: points, parent, velocities, life: 0, ttl: Math.max(1.6, ttl * 1.3), sizeStart: (reducedFlashing ? 5.0 : 6.0) * smokeSizeScale, sizeEnd: (reducedFlashing ? 9.0 : 12.0) * smokeSizeScale, colorStart: new THREE.Color(0x333333), colorEnd: new THREE.Color(0x111111), type: 'smoke' });
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
        (p.parent ?? this._effectGroup).remove(p.mesh);
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
      camPos.x + SUN_BACKGROUND_OFFSET.x,
      camPos.y + SUN_BACKGROUND_OFFSET.y,
      camPos.z + SUN_BACKGROUND_OFFSET.z
    );
    this.sunLight.target.position.copy(camPos);
    this.sunLight.target.updateMatrixWorld();
    this.sunMesh.position.set(
      camPos.x + VISIBLE_SUN_BACKGROUND_OFFSET.x,
      camPos.y + VISIBLE_SUN_BACKGROUND_OFFSET.y,
      camPos.z + VISIBLE_SUN_BACKGROUND_OFFSET.z
    );

    // Animate sun glow sprite — gentle pulse like asteroid glows
    if (this.sunGlowSprite) {
      this.sunGlowSprite.position.copy(this.sunMesh.position);
      const pulse = 1 + 0.08 * Math.sin(this._elapsed * 0.9);
      this.sunGlowSprite.scale.setScalar(3000 * VISIBLE_SUN_SCALE * pulse);
    }

    // Planet stays at fixed offset from camera — unreachable
    if (this.planet) {
      this.planet.position.set(
        camPos.x + EARTH_BACKGROUND_OFFSET.x,
        camPos.y + EARTH_BACKGROUND_OFFSET.y,
        camPos.z + EARTH_BACKGROUND_OFFSET.z
      );
      this.planet.rotation.set(
        EARTH_ROTATION_X,
        EARTH_ROTATION_Y + this._elapsed * EARTH_SPIN_SPEED,
        EARTH_ROTATION_Z
      );
    }
  }

  _loadPlanet() {
    const texLoader = new THREE.TextureLoader();
    const texPath = '/textures/planet/';

    const diffuse = texLoader.load(texPath + 'Earth_Stylized.png');
    diffuse.colorSpace = THREE.SRGBColorSpace;

    // Main planet sphere
    const planetGeo = new THREE.SphereGeometry(1600, 64, 64);
    const planetMat = new THREE.MeshBasicMaterial({
      map: diffuse,
      color: 0x8ea7b9,
      fog: false,
      depthWrite: false,
      depthTest: true,
    });
    this.planet = new THREE.Mesh(planetGeo, planetMat);
    this.planet.frustumCulled = false;
    this.planet.renderOrder = -1000;
    this.planet.position.copy(EARTH_BACKGROUND_OFFSET);
    this.planet.rotation.set(EARTH_ROTATION_X, EARTH_ROTATION_Y, EARTH_ROTATION_Z);
    this.scene.add(this.planet);

    this.cloudMesh = null;
  }

  _onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }
}
