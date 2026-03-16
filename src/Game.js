import * as THREE from 'three';
import { Player } from './Player.js';
import { DebrisManager } from './DebrisManager.js';
import { ProjectileManager } from './ProjectileManager.js';
import { LevelManager } from './LevelManager.js';
import { InputHandler } from './InputHandler.js';
import { HUD } from './HUD.js';
import { Starfield } from './Starfield.js';
import { AsteroidField } from './AsteroidField.js';

// Reusable vectors for camera follow
// Offset: higher + further back so ship sits in the lower portion of the screen
const _camOffset = new THREE.Vector3(0, 6, 22);
const _camTarget = new THREE.Vector3();
const _camLookTarget = new THREE.Vector3();
const _smoothForward = new THREE.Vector3(0, 0, -1);
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
const _worldUp = new THREE.Vector3(0, 1, 0);
// Debug flag: when true the camera will not follow the ship (helps observe movement)
const DEBUG_FREEZE_CAMERA = false;
const PLAYER_COLLISION_RADIUS = 1.1;
const ASTEROID_BOUNCE = 0.35;
const ASTEROID_SURFACE_FRICTION = 0.92;
const PLAYER_HIT_COOLDOWN = 1.0;
const PROJECTILE_HIT_PADDING = 0.45;
const AIM_FALLBACK_DISTANCE = 800;
const AIM_LOWERING = 0.035;
const BOOST_DRAIN_RATE = 0.38;
const BOOST_RECHARGE_RATE = 0.2;
const PLAYER_SENSITIVITY_STORAGE_KEY = 'trashteroid_mouse_sensitivity';
const DISPLAY_DISTANCE_SCALE = 0.45;
const TUTORIAL_TIME_SCALE = 0.35;
const TRASHTEROID_APPROACH_DISTANCE_WORLD = 5000 / DISPLAY_DISTANCE_SCALE;
const TRASHTEROID_HIT_RADIUS = 72;
const TRASHTEROID_SURFACE_OFFSET = 58;
const TRASHTEROID_SCORE_PER_HIT = 35;
const TRASHTEROID_SCORE_ON_DESTROY = 5000;
const TUTORIAL_BEATS = {
  controls: {
    title: 'Flight Controls',
    message: 'Move the mouse, hold W, tap A or D, and fire once to continue.',
    placement: 'center',
  },
  target: {
    title: 'Clear the Lane',
    message: 'Shoot one piece of trash to continue.',
    placement: 'center',
  },
  hud: {
    title: 'Watch Your HUD',
    message: 'Top-left shows objectives, top-center is the timer, and the bottom HUD tracks shield, speed, and boost. Hold Space with W to boost and continue.',
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
    this._averageSpeedSum = 0;
    this._averageSpeedTime = 0;
    this._pauseUnlockArmed = false;
    this._startLevel = startLevel;
    this._tutorialMode = this._startLevel === 1 && !!options.tutorialMode;
    this._onReturnToLevelSelect = options.onReturnToLevelSelect ?? null;
    this._returnToLevelSelectTimeout = null;
    this._timeScale = 1;
    this._tutorial = this._createTutorialState();
    this._handleLevelNextClick = () => this._onLevelNext();
    this._handleLevelRetryClick = () => this._onLevelRetry();
    this._handleWindowResize = () => this._onResize();
    this._handlePauseResumeClick = () => this._resumeGame();
    this._handlePauseRestartClick = () => window.location.reload();
    this._handlePauseSensitivityInput = (event) => {
      const displayValue = Number(event.currentTarget.value);
      this._setMouseSensitivity(displayValue / 1000, true);
    };

    // Level objectives & timer
    this._levelTimer = 0;
    this._levelTimerRunning = false;
    this._trashDestroyedRequired = 0;
    this._trashDestroyedFast = 0;
    this._bonusFastThresholdWorld = toWorldSpeed(200);
    this._levelComplete = false;
    this.clock = new THREE.Clock();
    this.crosshair = document.getElementById('crosshair');

    // Camera follow smoothing: use a framerate-independent follow speed (higher = tighter)
    this.cameraFollowSpeed = 18.0;

    // Renderer
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
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
    this.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 50000);
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
    this.projectiles = new ProjectileManager(this.scene);
    this.levels = new LevelManager();
    this.hud = new HUD();
    this.hud.hideTutorialCallout();
    this.hud.setBossBarVisible(false);
    this.hud.updateBossIndicator(false, 0, 0, 0, 0);
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
    this._enemyProjectileGeometry = new THREE.SphereGeometry(3.2, 10, 10);
    this._enemyProjectileMaterial = new THREE.MeshBasicMaterial({
      color: 0xff6948,
      transparent: true,
      opacity: 0.92,
    });
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
    this._clearScheduledReturnToLevelSelect();
    this.projectiles.clear();
    this.debris.clear();
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
    this.hud.updatePauseStats(this.shotsFired, this.trashHits, this._getAverageSpeed());
  }

  _getAverageSpeed() {
    if (this._averageSpeedTime <= 0) return 0;
    return this._averageSpeedSum / this._averageSpeedTime;
  }

  _clearScheduledReturnToLevelSelect() {
    if (this._returnToLevelSelectTimeout == null) return;
    window.clearTimeout(this._returnToLevelSelectTimeout);
    this._returnToLevelSelectTimeout = null;
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

    const shell = new THREE.Mesh(
      new THREE.IcosahedronGeometry(52, 1),
      new THREE.MeshStandardMaterial({
        color: 0x48505c,
        roughness: 0.96,
        metalness: 0.12,
        emissive: 0x10151d,
        emissiveIntensity: 0.55,
      })
    );
    group.add(shell);

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
    group.add(coreGlow);

    const scrapGeometries = [
      new THREE.BoxGeometry(18, 9, 13),
      new THREE.BoxGeometry(12, 16, 10),
      new THREE.CylinderGeometry(5, 7, 18, 8),
      new THREE.ConeGeometry(7, 18, 6),
      new THREE.TorusGeometry(8, 2.4, 8, 16),
    ];
    const scrapColors = [0x7d8b9b, 0x5c6975, 0x9b8e6c, 0x64788a, 0x6d635a];

    for (let i = 0; i < 22; i++) {
      const chunk = new THREE.Mesh(
        scrapGeometries[i % scrapGeometries.length],
        new THREE.MeshStandardMaterial({
          color: scrapColors[i % scrapColors.length],
          roughness: 0.88,
          metalness: 0.18,
          emissive: 0x0d1117,
          emissiveIntensity: 0.22,
        })
      );

      _targetOffset.set(
        Math.random() - 0.5,
        Math.random() - 0.5,
        Math.random() - 0.5
      ).normalize();
      chunk.position.copy(_targetOffset).multiplyScalar(44 + Math.random() * 20);
      chunk.rotation.set(
        Math.random() * Math.PI,
        Math.random() * Math.PI,
        Math.random() * Math.PI
      );
      chunk.scale.setScalar(0.72 + Math.random() * 0.85);
      group.add(chunk);
    }

    const hazardRing = new THREE.Mesh(
      new THREE.TorusGeometry(76, 2.4, 10, 40),
      new THREE.MeshBasicMaterial({
        color: 0xff6e42,
        transparent: true,
        opacity: 0.16,
        depthWrite: false,
      })
    );
    hazardRing.rotation.set(Math.PI * 0.35, 0, Math.PI * 0.18);
    group.add(hazardRing);

    this.scene.add(group);

    return {
      group,
      shell,
      glow: coreGlow,
      ring: hazardRing,
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
    this._levelTimerRunning = this._levelTimer > 0;
    this._trashDestroyedRequired = 0;
    this._trashDestroyedFast = 0;
    this._bonusFastThresholdWorld = toWorldSpeed(fastSpeedDisplay);

    if (resetRunStats) {
      this.score = 0;
      this.lives = 100;
      this.shotsFired = 0;
      this.trashHits = 0;
      this._averageSpeedSum = 0;
      this._averageSpeedTime = 0;
    }

    this.projectiles.clear();
    this.debris.clear();
    this._clearTransientEffects();
    this._resetPlayerState(resetPlayerPosition);
    this._configureTrashteroidForLevel(levelConfig);
    this.hud.setGameplayVisible(true);
    this.hud.setBossBarVisible(!!levelConfig.boss);
    this.hud.updateBossIndicator(false, 0, 0, 0, 0);
    this.hud.update(this.score, this.levels.current, this.lives);
    this.hud.updateTimer(this._levelTimer);
    this.hud.updateObjectives(this._getMissionObjectiveState(false).objectives);
    this._refreshPauseMenu();
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

    if (bossConfig) {
      const BOSS_SCALE = 5;
      trashteroid.group.scale.setScalar(BOSS_SCALE);
      trashteroid.hitRadius = TRASHTEROID_HIT_RADIUS * BOSS_SCALE;
      trashteroid.collisionRadius = (bossConfig.collisionRadius ?? (TRASHTEROID_HIT_RADIUS - 6)) * BOSS_SCALE;
      trashteroid.surfaceOffset = TRASHTEROID_SURFACE_OFFSET * BOSS_SCALE;
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
      this.scene.remove(this._enemyProjectiles[i].mesh);
    }
    this._enemyProjectiles.length = 0;
  }

  _despawnEnemyProjectile(index) {
    const projectile = this._enemyProjectiles[index];
    if (!projectile) return;
    this.scene.remove(projectile.mesh);
    projectile.mesh.traverse?.((child) => {
      if (child.material && child.material !== this._enemyProjectileMaterial) {
        child.material.dispose?.();
      }
    });
    this._enemyProjectiles.splice(index, 1);
  }

  _spawnTrashteroidProjectile(origin, direction, speed, ttl) {
    const core = new THREE.Mesh(this._enemyProjectileGeometry, this._enemyProjectileMaterial);
    const glow = new THREE.Mesh(
      this._enemyProjectileGeometry,
      new THREE.MeshBasicMaterial({
        color: 0xffbf73,
        transparent: true,
        opacity: 0.26,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    glow.scale.setScalar(1.8);
    core.add(glow);

    core.position.copy(origin);
    core.scale.setScalar(0.95 + Math.random() * 0.35);
    this.scene.add(core);

    this._enemyProjectiles.push({
      mesh: core,
      position: core.position,
      prevPosition: core.position.clone(),
      velocity: direction.clone().multiplyScalar(speed),
      life: 0,
      ttl,
    });
  }

  _fireTrashteroidBurst(bossConfig) {
    const trashteroid = this._trashteroid;
    if (!trashteroid?.active) return;

    _bossAim
      .copy(this.player.mesh.position)
      .addScaledVector(this.player.velocity, 0.45)
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
    const sideSpread = surfaceOffset * (22 / TRASHTEROID_SURFACE_OFFSET);
    const upOffset = surfaceOffset * (8 / TRASHTEROID_SURFACE_OFFSET);
    const sideOffsets = [-sideSpread, 0, sideSpread];
    const dirSpreads = [-22, 0, 22]; // keep angular spread consistent regardless of scale
    for (let i = 0; i < sideOffsets.length; i++) {
      _bossMuzzle
        .copy(trashteroid.group.position)
        .addScaledVector(_bossAim, surfaceOffset)
        .addScaledVector(_bossRight, sideOffsets[i])
        .addScaledVector(_bossUp, upOffset);

      const spreadDirection = _bossAim
        .clone()
        .addScaledVector(_bossRight, dirSpreads[i] * 0.0015)
        .addScaledVector(_bossUp, (Math.random() - 0.5) * 0.03)
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

    if (trashteroid.ring) {
      trashteroid.ring.rotation.z += delta * 0.22;
    }
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
      trashteroid.shotCooldown = bossConfig.shotInterval;
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

      if (this._projectileHitsSphere(projectile, this.player.mesh.position, PLAYER_COLLISION_RADIUS + 0.45)) {
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
    const onScreen =
      _targetScreenPos.z > -1 &&
      _targetScreenPos.z < 1 &&
      Math.abs(_targetScreenPos.x) <= 0.92 &&
      Math.abs(_targetScreenPos.y) <= 0.88;

    if (onScreen) {
      this.hud.updateBossIndicator(false, 0, 0, 0, 0);
      return;
    }

    _targetOffset.copy(targetPos).sub(this.camera.position);
    _targetOffset.applyQuaternion(this.camera.quaternion.clone().invert());

    let angle = Math.atan2(_targetOffset.x, _targetOffset.y);
    if (_targetOffset.z > 0) {
      angle += Math.PI;
    }

    const centerX = window.innerWidth * 0.5;
    const centerY = window.innerHeight * 0.5;
    const radiusX = Math.max(120, window.innerWidth * 0.36);
    const radiusY = Math.max(90, window.innerHeight * 0.26);
    const x = centerX + Math.sin(angle) * radiusX;
    const y = centerY - Math.cos(angle) * radiusY;
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
        label: `Destroy ${fastRequired} trash above ${fastSpeedDisplay} m/s`,
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
      firstShotSeen: false,
      firstTrashDestroyedSeen: false,
      controlsShown: false,
      targetShown: false,
      hudShown: false,
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
    if (this._tutorial.activeBeatId) {
      this._tutorial.activeBeatId = null;
      this._tutorial.activeBeatProgress = null;
    }
    this.hud.hideTutorialCallout();
  }

  _startTutorialBeat(beatId) {
    const beat = TUTORIAL_BEATS[beatId];
    if (!beat) return;

    this._tutorial.activeBeatId = beatId;
    this._tutorial.activeBeatProgress =
      beatId === 'controls'
        ? { mouseTravel: 0, thrustHeld: false, rollSeen: false, fired: false }
        : beatId === 'target'
          ? { armed: false, trashDestroyed: false }
          : {};
    this._timeScale = TUTORIAL_TIME_SCALE;
    this.hud.showTutorialCallout(beat.title, beat.message, {
      placement: beat.placement,
    });
  }

  _completeActiveTutorialBeat() {
    if (!this._tutorial.activeBeatId) return;
    this._clearActiveTutorialBeat();
    this._maybeStartTutorialBeat();
  }

  _maybeStartTutorialBeat() {
    if (!this._isTutorialActiveForCurrentLevel() || this._tutorial.activeBeatId) return;

    if (!this._tutorial.controlsShown && this._tutorial.activePlayTime >= 1.5) {
      this._tutorial.controlsShown = true;
      this._startTutorialBeat('controls');
      return;
    }

    if (!this._tutorial.targetShown && this._tutorial.controlsShown) {
      this._tutorial.targetShown = true;
      this._startTutorialBeat('target');
      return;
    }

    if (!this._tutorial.hudShown && this._tutorial.targetShown) {
      this._tutorial.hudShown = true;
      this._startTutorialBeat('hud');
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

    this._maybeStartTutorialBeat();
  }

  _noteTutorialShot() {
    if (!this._isTutorialActiveForCurrentLevel()) return;
    this._tutorial.firstShotSeen = true;
    this._maybeStartTutorialBeat();
  }

  _noteTutorialTrashDestroyed() {
    if (!this._isTutorialActiveForCurrentLevel()) return;
    this._tutorial.firstTrashDestroyedSeen = true;
    if (this._tutorial.activeBeatId === 'target') {
      if (!this._tutorial.activeBeatProgress.armed) return;
      this._tutorial.activeBeatProgress.trashDestroyed = true;
      this._completeActiveTutorialBeat();
      return;
    }
    this._maybeStartTutorialBeat();
  }

  _updateActiveTutorialProgress({ dx, dy, thrustHeld, rollSeen, fired, wantsBoost }) {
    if (!this._isTutorialActiveForCurrentLevel() || !this._tutorial.activeBeatId) return;

    if (this._tutorial.activeBeatId === 'controls') {
      const progress = this._tutorial.activeBeatProgress;
      progress.mouseTravel += Math.abs(dx) + Math.abs(dy);
      progress.thrustHeld = progress.thrustHeld || thrustHeld;
      progress.rollSeen = progress.rollSeen || rollSeen;
      progress.fired = progress.fired || fired > 0;

      if (progress.mouseTravel >= 14 && progress.thrustHeld && progress.rollSeen && progress.fired) {
        this._completeActiveTutorialBeat();
      }
      return;
    }

    if (this._tutorial.activeBeatId === 'hud' && wantsBoost) {
      this._completeActiveTutorialBeat();
      return;
    }

    if (this._tutorial.activeBeatId === 'target') {
      this._tutorial.activeBeatProgress.armed = true;
    }
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

    // Fire vaporizer — hold Space or left mouse button for rapid-fire
    let fired = 0;
    if (this.input.isDown('mouseleft')) {
      const fireDirection = this._getAssistedFireDirection();
      fired = this.projectiles.fire(this.player.mesh.position, fireDirection, this.player.velocity, this.player.mesh.quaternion);
      if (fired) {
        this.shotsFired += fired;
        this._noteTutorialShot();
        this._refreshPauseMenu();
        this.player.applyRecoil(this.projectiles.cooldownTime);
        // spawn a very short muzzle particle burst attached to the player
        this._spawnMuzzleParticles(new THREE.Vector3(0, 0.2, -1.5), { count: 18, ttl: 0.08 });
      }
    }

    this._updateActiveTutorialProgress({ dx, dy, thrustHeld, rollSeen, fired, wantsBoost });

    // Update subsystems
    this.player.update(delta);
    this.projectiles.update(delta);
    this._averageSpeedSum += this.player.velocity.length() * rawDelta;
    this._averageSpeedTime += rawDelta;
    const playerPos = this.player.mesh.position;
    const playerQuat = this.player.baseQuaternion;
    this.asteroidField.update(delta, playerPos);
    this.debris.update(delta, this.levels.getSpawnConfig(), playerPos, playerQuat);
    const asteroidColliders = this.asteroidField.getColliders();
    this.debris.resolveAsteroidCollisions(asteroidColliders);
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

    // Collision: projectiles vs debris
    this._checkProjectileDebrisCollisions();

    // Collision: trash vs player (hits / misses)
    this._checkDebrisPlayerCollisions(playerPos, playerQuat);

    this._updateMissionTargetIndicator();
    this._updateMinimap();

    this.hud.update(this.score, this.levels.current, this.lives);
    this.hud.updateBoostBar(this.boostCharge, this.boostActive);
    this.hud.updateSpeedometer(this.player.velocity.length());
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
    const seg = new THREE.Vector3().copy(end).sub(start);
    const segLenSq = seg.lengthSq();

    if (segLenSq === 0) {
      const inside = end.distanceTo(center) <= radius;
      return inside ? { hit: true, t: 1, point: end.clone() } : { hit: false };
    }

    const toCenter = new THREE.Vector3().copy(center).sub(start);
    const t = THREE.MathUtils.clamp(toCenter.dot(seg) / segLenSq, 0, 1);
    const closest = new THREE.Vector3().copy(start).addScaledVector(seg, t);
    if (closest.distanceTo(center) <= radius) {
      return { hit: true, t, point: closest };
    }
    return { hit: false };
  }

  _checkProjectileDebrisCollisions() {
    const projectiles = this.projectiles.getActive();
    const debrisList = this.debris.getActive();

    for (let i = projectiles.length - 1; i >= 0; i--) {
      for (let j = debrisList.length - 1; j >= 0; j--) {
        const hitRadius = debrisList[j].hitRadius || 1;
        if (this._projectileHitsSphere(projectiles[i], debrisList[j].position, hitRadius)) {
          const points = debrisList[j].points || 100;
          this.score += points;
          this.trashHits++;
          this._trashDestroyedRequired++;
          this._noteTutorialTrashDestroyed();
          if (this.player.velocity.length() >= this._bonusFastThresholdWorld) {
            this._trashDestroyedFast++;
          }
          this._refreshPauseMenu();
          this._spawnExplosion(_closestPoint.clone(), { count: 220, ttl: 1.4 });
          this._spawnScorePopup(_closestPoint.clone(), points);
          this.projectiles.remove(i);
          this.debris.remove(j);
          break;
        }
      }
    }
  }

  _checkDebrisPlayerCollisions(playerPos = this.player.mesh.position, playerQuat = this.player.baseQuaternion) {
    const debrisList = this.debris.getActive();
    _shipForward.set(0, 0, -1).applyQuaternion(playerQuat);

    for (let i = debrisList.length - 1; i >= 0; i--) {
      const d = debrisList[i];
      const hitRadius = d.hitRadius || 1;
      // Increase the effective collision radius so trash reacts earlier
      const hitDistance = PLAYER_COLLISION_RADIUS + hitRadius * 1.0;
      // Increase pass distance so misses are detected from farther out
      const passDistance = hitRadius + 20;
      // Reaction radius (nearby but not colliding): debris will be pushed away
      const reactDistance = Math.max(hitRadius * 3, 6);

      // continuous collision check: sweep player from previous to current position
      const segStart = this._prevPlayerPos;
      const segEnd = playerPos;
      const swept = this._segmentIntersectsSphere(segStart, segEnd, d.position, hitDistance);

      if (swept.hit) {
        // collision at swept.point — move only the debris, not the player
        const collisionPoint = swept.point;
        const collisionNormal = new THREE.Vector3().copy(collisionPoint).sub(d.position).normalize();

        // compute overlap but do NOT move or reflect the player; only affect debris
        const distNow = playerPos.distanceTo(d.position);
        const overlap = Math.max(0, hitDistance - distNow);

        // apply reduced damage based on player speed
        const playerSpeed = this.player.velocity.length();
        const damage = THREE.MathUtils.clamp(Math.round(6 + (playerSpeed / 120) * 12), 5, 20);
        this._damagePlayer(damage);

        // robust separation: place debris fully outside player's collision sphere and give impulse
        const away = d.position.clone().sub(playerPos).normalize();
        if (d.position) d.position.copy(playerPos).addScaledVector(away, hitDistance + 0.06);
        if (d.velocity) d.velocity.copy(away).multiplyScalar(Math.max(4, d.velocity.length() + 2));
        else d.velocity = away.clone().multiplyScalar(3 + Math.random() * 2);

        continue;
      }

      // compute distance for passive reactions
      _toDebris.copy(d.position).sub(playerPos);
      const distSq = _toDebris.lengthSq();
      const forwardOffset = _toDebris.dot(_shipForward);

      // Nearby reaction: if within reactDistance but not colliding, push debris away
      if (distSq < reactDistance * reactDistance && distSq > hitDistance * hitDistance) {
        const dist = Math.sqrt(distSq) || 0.0001;
        const away = _toDebris.clone().multiplyScalar(1 / dist); // from player to debris
        // robust passive reaction: push debris to just outside reaction radius and give small impulse
        const pushAway = d.position.clone().sub(playerPos).normalize();
        if (d.position) d.position.copy(playerPos).addScaledVector(pushAway, Math.max(reactDistance, hitRadius + PLAYER_COLLISION_RADIUS) + 0.1);
        if (d.velocity) {
          d.velocity.addScaledVector(pushAway, 1.5 + Math.random() * 1.5);
        } else {
          d.velocity = pushAway.multiplyScalar(1.5 + Math.random() * 1.5);
        }
      }

      // Trash that slips behind the player counts as a miss.
      if (distSq < passDistance * passDistance && forwardOffset < -hitRadius) {
        this.score = Math.max(0, this.score - 50);
        this.debris.remove(i);
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
    this.player.flashWhite();

    // trigger HUD damage flash and low-health indicator
    try {
      if (this.hud && typeof this.hud.flashDamage === 'function') this.hud.flashDamage(damage);
      if (this.hud && typeof this.hud.setLowHealth === 'function') this.hud.setLowHealth(this.lives <= 20);
    } catch (e) {
      // ignore HUD errors
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
    if (DEBUG_FREEZE_CAMERA) return;

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
    const speedForMaxFov = speedForMinFov * this.player.boostMultiplier * 0.8; // max boosted speed

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

    const asteroids = this.asteroidField.getColliders();
    for (let i = 0; i < asteroids.length; i++) {
      const sphere = asteroids[i].boundingSphere;
      const distance = this._intersectAimSphere(sphere.center, sphere.radius);
      if (distance < bestDistance) {
        bestDistance = distance;
      }
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
    const count = options.count || 24;
    const positions = new Float32Array(count * 3);
    const velocities = new Array(count);
    for (let k = 0; k < count; k++) {
      positions[k * 3] = pos.x + (Math.random() - 0.5) * 0.2;
      positions[k * 3 + 1] = pos.y + (Math.random() - 0.5) * 0.2;
      positions[k * 3 + 2] = pos.z + (Math.random() - 0.5) * 0.2;
      const dir = new THREE.Vector3((Math.random() - 0.5), (Math.random() - 0.2), (Math.random() - 0.5)).normalize();
      velocities[k] = dir.multiplyScalar((options.speed || 12) * (0.6 + Math.random() * 0.9));
    }

    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({ map: this._particleTexture, color: options.color || 0xffcc66, size: options.size || 0.9, sizeAttenuation: true, depthWrite: false, transparent: true, blending: THREE.AdditiveBlending });
    const points = new THREE.Points(geom, mat);
    this._effectGroup.add(points);

    this._sparks.push({ mesh: points, velocities, life: 0, ttl: options.ttl || 0.9, sizeStart: options.size || 0.9, sizeEnd: options.sizeEnd || 0.1, colorStart: new THREE.Color(options.color || 0xffcc66), colorEnd: new THREE.Color(options.colorEnd || 0x222222), type: 'spark' });
  }

  // Larger explosion effect for debris destruction
  _spawnExplosion(pos, options = {}) {
    const baseCount = options.count || 220;
    const ttl = options.ttl || 1.6;

    // Core flash — bright, short-lived
    this._spawnSparks(pos.clone(), { count: Math.floor(baseCount * 0.12), speed: 25, size: 8, ttl: Math.max(0.2, ttl * 0.12), color: 0xffffff, colorEnd: 0xffcc88 });

    // Embers — orange, additive, mid-lived
    this._spawnSparks(pos.clone(), { count: Math.floor(baseCount * 0.6), speed: 75, size: 6, ttl: Math.max(0.8, ttl * 0.7), color: 0xffbb66, colorEnd: 0x442200 });

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
      velocities[k] = dir.multiplyScalar(45 * (0.6 + Math.random() * 0.8));
    }
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({ map: this._particleTexture, color: 0x333333, size: 6.0, sizeAttenuation: true, depthWrite: false, transparent: true, opacity: 0.1, blending: THREE.NormalBlending });
    const points = new THREE.Points(geom, mat);
    this._effectGroup.add(points);
    this._sparks.push({ mesh: points, velocities, life: 0, ttl: Math.max(1.6, ttl * 1.3), sizeStart: 6.0, sizeEnd: 12.0, colorStart: new THREE.Color(0x333333), colorEnd: new THREE.Color(0x111111), type: 'smoke' });
  }

  // Spawn a very short-lived muzzle particle burst in player-local space.
  _spawnMuzzleParticles(localPos, options = {}) {
    const count = options.count || 48; // larger burst by default
    const positions = new Float32Array(count * 3);
    const velocities = new Array(count);

    for (let k = 0; k < count; k++) {
      positions[k * 3] = localPos.x + (Math.random() - 0.5) * 0.12;
      positions[k * 3 + 1] = localPos.y + (Math.random() - 0.5) * 0.12;
      positions[k * 3 + 2] = localPos.z + (Math.random() - 0.5) * 0.12;

      // local-space velocity biased forward (-Z)
      const dir = new THREE.Vector3((Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 0.6, - (0.6 + Math.random() * 1.6));
      velocities[k] = dir.multiplyScalar(18 * (0.6 + Math.random() * 0.8));
    }

    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    // Try to reuse the player's thrust sprite if available
    let spriteTex = null;
    try {
      spriteTex = this.player && this.player._particlePoints && this.player._particlePoints.material && this.player._particlePoints.material.uniforms && this.player._particlePoints.material.uniforms.map ? this.player._particlePoints.material.uniforms.map.value : null;
    } catch (e) {
      spriteTex = null;
    }
    if (!spriteTex) spriteTex = new THREE.TextureLoader().load('fireparticle.png');

    const mat = new THREE.PointsMaterial({ map: spriteTex, color: 0xffffff, size: options.size || 0.4, sizeAttenuation: true, depthWrite: false, transparent: true, blending: THREE.AdditiveBlending });
    const points = new THREE.Points(geom, mat);

    // Parent to player so the burst stays attached while the ship moves
    this.player.mesh.add(points);

    this._muzzles.push({ mesh: points, velocities, life: 0, ttl: options.ttl || 0.08 });
  }

  // Spawn a small screen-space score popup at world `pos` with +amount.
  _spawnScorePopup(pos, amount) {
    const el = document.createElement('div');
    el.textContent = `+${amount}`;
    Object.assign(el.style, {
      position: 'absolute',
      left: '0px',
      top: '0px',
      color: '#ffd966',
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
    for (let i = this._popups.length - 1; i >= 0; i--) {
      const pop = this._popups[i];
      pop.life += delta;
      const t = pop.life / pop.ttl;
      // Project world pos to screen
      const vec = pop.worldPos.clone().project(this.camera);
      const halfW = this.renderer.domElement.clientWidth / 2;
      const halfH = this.renderer.domElement.clientHeight / 2;
      const x = (vec.x * halfW) + halfW + this.renderer.domElement.getBoundingClientRect().left;
      const y = (-vec.y * halfH) + halfH + this.renderer.domElement.getBoundingClientRect().top;
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
