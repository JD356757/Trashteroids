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
const DISPLAY_SPEED_MAX = 100;

export class Game {
  constructor(canvas, startLevel = 1) {
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
    this.debris = new DebrisManager(this.scene);
    this.projectiles = new ProjectileManager(this.scene);
    this.levels = new LevelManager();
    this.hud = new HUD();
    this.starfield = new Starfield(this.scene);
    this._applySavedSensitivity();
    this._bindPauseControls();
    this._refreshPauseMenu();

    // Effects: transient particle systems and screen-space popups
    this._effectGroup = new THREE.Group();
    this.scene.add(this._effectGroup);
    this._sparks = [];
    this._popups = [];
    this._muzzles = [];

    // Large decorative asteroid field around the player zone
    this.asteroidField = new AsteroidField(this.scene);

    // Planet — large Earth in the background, unreachable
    this._loadPlanet();
    
    // Boss Mesh setup
    this._initBossMesh();

    // Handle resize
    window.addEventListener('resize', () => this._onResize());
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.clock.start();
    this.levels.setLevel(this._startLevel);
    this._setBossVisible(this.levels.isBossUnlocked());
    this.hud.update(this.score, this.levels.current, this.lives);
    this._loop();
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
      this.hud.pauseResumeBtn.addEventListener('click', () => {
        this._resumeGame();
      });
    }

    if (this.hud.pauseRestartBtn) {
      this.hud.pauseRestartBtn.addEventListener('click', () => window.location.reload());
    }

    if (this.hud.pauseSensitivityInput) {
      this.hud.pauseSensitivityInput.addEventListener('input', (event) => {
        const displayValue = Number(event.currentTarget.value);
        this._setMouseSensitivity(displayValue / 1000, true);
      });
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
    const averageWorldSpeed = this._averageSpeedSum / this._averageSpeedTime;
    const boostSpeedReference = this.player.thrustPower * this.player.boostMultiplier / (1 - this.player.dampening);
    if (boostSpeedReference <= 0) return 0;
    return THREE.MathUtils.clamp((averageWorldSpeed / boostSpeedReference) * DISPLAY_SPEED_MAX, 0, DISPLAY_SPEED_MAX);
  }

  _pauseGame() {
    if (!this.running || this.paused) return;

    this.paused = true;
    this.boostActive = false;
    this._pauseUnlockArmed = false;
    this._refreshPauseMenu();
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

    const delta = this.clock.getDelta();
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

    if (this.paused) {
      this.hud.updateBoostBar(this.boostCharge, false);
      this.input.resetPressed();
      this.renderer.render(this.scene, this.camera);
      return;
    }

    this.playerHitCooldown = Math.max(0, this.playerHitCooldown - delta);

    // Mouse → pitch / yaw
    const { dx, dy } = this.input.consumeMouseDelta();
    this.player.rotate(dx, dy, delta);

    // W → forward thrust
    const wantsBoost = this.input.isDown('w') && this.input.isDown('e') && this.boostCharge > 0;
    this.boostActive = wantsBoost;
    if (this.input.isDown('w')) {
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
    this.player.manualRollInput = rollInput;

    // Fire vaporizer — hold Space or left mouse button for rapid-fire
    if (this.input.isDown(' ') || this.input.isDown('mouseleft')) {
      const fireDirection = this._getAssistedFireDirection();
      const fired = this.projectiles.fire(this.player.mesh.position, fireDirection, this.player.velocity, this.player.mesh.quaternion);
      if (fired) {
        this.shotsFired += fired;
        this._refreshPauseMenu();
        this.player.applyRecoil(this.projectiles.cooldownTime);
        // spawn a very short muzzle particle burst attached to the player
        this._spawnMuzzleParticles(new THREE.Vector3(0, 0.2, -1.5), { count: 18, ttl: 0.08 });
      }
    }

    // Update subsystems
    this.player.update(delta);
    this.projectiles.update(delta);
    this._averageSpeedSum += this.player.velocity.length() * delta;
    this._averageSpeedTime += delta;
    const playerPos = this.player.mesh.position;
    const playerQuat = this.player.baseQuaternion;
    this.asteroidField.update(delta, playerPos);
    this.debris.update(delta, this.levels.getSpawnConfig(), playerPos, playerQuat);
    this.debris.resolveAsteroidCollisions(this.asteroidField.getColliders());
    // Check projectile collisions against asteroids (sparks)
    this._checkProjectileAsteroidCollisions();
    this._checkAsteroidPlayerCollisions();

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

    // Level progression
    this.levels.update(this.score, playerPos);
    this._setBossVisible(this.levels.isBossUnlocked() && (!this.levels.boss || this.levels.boss.health > 0));
    this._updateMinimap();
    
    // Boss Indicator
    this._updateBossIndicator(delta);

    // Boss-specific logic
    if (this.levels.current === 3) {
      this._updateBoss(delta);
    }

    this.hud.update(this.score, this.levels.current, this.lives);
    this.hud.updateBoostBar(this.boostCharge, this.boostActive);
    this.input.resetPressed();
    this.renderer.render(this.scene, this.camera);
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
          this._refreshPauseMenu();
          this.levels.registerTrashDestroyed();
          this._spawnSparks(_closestPoint.clone(), { count: 80, ttl: 0.9 });
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
      const hitDistance = PLAYER_COLLISION_RADIUS + hitRadius * 0.55;
      const passDistance = hitRadius + 10;
      _toDebris.copy(d.position).sub(playerPos);
      const distSq = _toDebris.lengthSq();
      const forwardOffset = _toDebris.dot(_shipForward);

      // Direct hit
      if (distSq < hitDistance * hitDistance) {
        this._damagePlayer();
        this.debris.remove(i);
        continue;
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
      const minDistance = PLAYER_COLLISION_RADIUS + sphere.radius * 0.8;

      _collisionNormal.copy(playerPos).sub(sphere.center);
      const distanceSq = _collisionNormal.lengthSq();
      if (distanceSq >= minDistance * minDistance) continue;

      this._damagePlayer();
      if (!this.running) return;

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
      if (normalSpeed >= 0) continue;

      _velocityNormal.copy(_collisionNormal).multiplyScalar(normalSpeed);
      _velocityTangent.copy(this.player.velocity).sub(_velocityNormal).multiplyScalar(ASTEROID_SURFACE_FRICTION);
      this.player.velocity.copy(_velocityTangent).addScaledVector(_collisionNormal, -normalSpeed * ASTEROID_BOUNCE);
    }

    // Apply accumulated separation once
    if (sepX !== 0 || sepY !== 0 || sepZ !== 0) {
      playerPos.x += sepX;
      playerPos.y += sepY;
      playerPos.z += sepZ;
    }
  }

  _damagePlayer() {
    if (this.playerHitCooldown > 0 || this.lives <= 0) {
      return false;
    }

    this.lives--;
    this.playerHitCooldown = PLAYER_HIT_COOLDOWN;
    this.player.flashWhite();
    
    if (this.lives <= 0) {
      this._gameOver();
    }

    return true;
  }

  _updateBoss(delta) {
    if (!this.levels.isBossUnlocked() || !this.levels.boss) return;
    // Boss health bar shown in HUD
    this.hud.updateBossBar(this.levels.boss.health, this.levels.boss.maxHealth);

    if (this.bossMesh) {
      this.bossMesh.rotation.y += delta * 0.1;
      this.bossMesh.rotation.x += delta * 0.05;
    }

    // Check projectile hits on boss (distance-based)
    const projectiles = this.projectiles.getActive();
    for (let i = projectiles.length - 1; i >= 0; i--) {
      const p = projectiles[i];
      if (this._projectileHitsSphere(p, this.levels.boss.position, 200)) {
        this.levels.boss.health -= 10;
        this._spawnSparks(p.position.clone(), { count: 30, ttl: 0.5 });
        this.projectiles.remove(i);
        if (this.levels.boss.health <= 0) {
          if (this.bossMesh) this.bossMesh.visible = false;
          this._spawnSparks(this.levels.boss.position, { count: 500, ttl: 3.0 });
          this._victory();
        }
      }
    }
  }

  _initBossMesh() {
    const bossGeo = new THREE.IcosahedronGeometry(200, 2);
    const bossMat = new THREE.MeshStandardMaterial({
      color: 0x444455,
      roughness: 0.9,
      metalness: 0.3,
      flatShading: true
    });
    this.bossMesh = new THREE.Mesh(bossGeo, bossMat);
    this.bossMesh.position.copy(this.levels.bossWorldPosition);
    this.bossMesh.visible = false;
    this.scene.add(this.bossMesh);
    
    const bossLight = new THREE.PointLight(0xff4400, 2, 800);
    this.bossMesh.add(bossLight);
  }

  _updateBossIndicator(delta) {
    if (!this.levels.bossWorldPosition || !this.levels.isBossUnlocked()) {
      this.hud.updateBossIndicator(false, 0, 0, 0, 0);
      return;
    }

    if (this.levels.current === 3) {
      this.hud.updateBossIndicator(false, 0, 0, 0, 0);
      return;
    }

    const bossPos = this.levels.bossWorldPosition;
    const playerPos = this.player.mesh.position;
    const dist = playerPos.distanceTo(bossPos);

    // Vector from camera to boss
    const toBoss = bossPos.clone().sub(this.camera.position).normalize();
    // Convert to camera's local space (+x right, +y up, -z forward)
    toBoss.applyQuaternion(this.camera.quaternion.clone().invert());
    
    // If looking roughly at the boss (dot product with forward > 0.9), hide the indicator
    // In camera local space, forward is (0, 0, -1) so dot product is -toBoss.z
    if (-toBoss.z > 0.9) {
      this.hud.updateBossIndicator(false, 0, 0, 0, 0);
      return;
    }
    
    // Project to 2D Screen direction (+y down for screen coords)
    let dx = toBoss.x;
    let dy = -toBoss.y;
    
    // Avoid singularity
    if (Math.abs(dx) < 0.001 && Math.abs(dy) < 0.001) {
      dy = 1;
    }

    const dir = new THREE.Vector2(dx, dy).normalize();
    
    // Stiffen smoothing (less lerp time means faster reaction)
    if (!this._indicatorDir) {
      this._indicatorDir = dir.clone();
    } else {
      this._indicatorDir.lerp(dir, 20 * delta).normalize();
    }
    
    dx = this._indicatorDir.x;
    dy = this._indicatorDir.y;
    
    const angle = Math.atan2(dx, -dy);
    
    // Clamp to screen edge (push indicator further in)
    const halfW = window.innerWidth / 2;
    const halfH = window.innerHeight / 2;
    const marginW = 150; // Keep it inside screen, much further in
    const marginH = 150; 
    const boundX = halfW - marginW;
    const boundY = halfH - marginH;
    
    const tX = boundX / (Math.abs(dx) || 0.0001);
    const tY = boundY / (Math.abs(dy) || 0.0001);
    const t = Math.min(tX, tY);
    
    const sx = halfW + dx * t;
    const sy = halfH + dy * t;
    
    this.hud.updateBossIndicator(true, sx, sy, angle, Math.floor(dist));
  }

  _updateMinimap() {
    const playerPos = this.player.mesh.position;
    const camInvQuat = this.camera.quaternion.clone().invert();
    const bossPos = this.levels.isBossUnlocked() ? this.levels.bossWorldPosition : null;
    this.hud.updateMinimap(true, bossPos, playerPos, camInvQuat, this.asteroidField.getColliders());
  }

  _setBossVisible(visible) {
    if (this.bossMesh) {
      this.bossMesh.visible = visible;
    }
  }

  _gameOver() {
    this.running = false;
    this.hud.setPauseVisible(false);
    if (this.crosshair) {
      this.crosshair.classList.add('hidden');
    }
    this.hud.showMessage('GAME OVER');
  }

  _victory() {
    this.running = false;
    this.hud.setPauseVisible(false);
    if (this.crosshair) {
      this.crosshair.classList.add('hidden');
    }
    this.hud.showMessage('EARTH IS SAVED!');
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

    if (this.levels.boss && this.levels.boss.health > 0) {
      const distance = this._intersectAimSphere(this.levels.boss.position, 200);
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
        if (this._projectileHitsSphere(projectiles[i], sphere.center, sphere.radius)) {
          // _closestPoint was computed by _projectileHitsSphere
          this._spawnSparks(_closestPoint.clone());
          // NOTE: do NOT modify asteroid velocity from projectile hits;
          // bullets are cosmetic and should not push asteroids.
          this.projectiles.remove(i);
          break;
        }
      }
    }
  }

  // Spawn a short-lived spark particle burst at world `pos`.
  _spawnSparks(pos, options = {}) {
    const count = options.count || 12;
    const positions = new Float32Array(count * 3);
    const velocities = new Array(count);
    for (let k = 0; k < count; k++) {
      positions[k * 3] = pos.x;
      positions[k * 3 + 1] = pos.y;
      positions[k * 3 + 2] = pos.z;
      const dir = new THREE.Vector3((Math.random() - 0.5), (Math.random() - 0.5), (Math.random() - 0.5)).normalize();
      velocities[k] = dir.multiplyScalar(18 * (0.5 + Math.random()));
    }

    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({ color: 0xffcc66, size: 0.6, sizeAttenuation: true, depthWrite: false });
    const points = new THREE.Points(geom, mat);
    this._effectGroup.add(points);

    this._sparks.push({ mesh: points, velocities, life: 0, ttl: options.ttl || 0.75 });
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
        // apply damping
        p.velocities[k].multiplyScalar(Math.pow(0.2, delta * 60));
      }
      posAttr.needsUpdate = true;

      // fade out material
      p.mesh.material.opacity = Math.max(0, 1 - p.life / p.ttl);
      p.mesh.material.transparent = true;

      if (p.life >= p.ttl) {
        this._effectGroup.remove(p.mesh);
        p.mesh.geometry.dispose();
        p.mesh.material.dispose();
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
