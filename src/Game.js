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
const _camOffset = new THREE.Vector3(0, 2.2, 11);
const _camTarget = new THREE.Vector3();
const _camLookTarget = new THREE.Vector3();
const _shipForward = new THREE.Vector3();
const _segment = new THREE.Vector3();
const _toCenter = new THREE.Vector3();
const _closestPoint = new THREE.Vector3();
const _collisionNormal = new THREE.Vector3();
const _velocityNormal = new THREE.Vector3();
const _velocityTangent = new THREE.Vector3();
// Debug flag: when true the camera will not follow the ship (helps observe movement)
const DEBUG_FREEZE_CAMERA = false;
const PLAYER_COLLISION_RADIUS = 1.1;
const ASTEROID_BOUNCE = 0.35;
const ASTEROID_SURFACE_FRICTION = 0.92;
const PLAYER_HIT_COOLDOWN = 1.0;

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.running = false;
    this.score = 0;
    this.lives = 3;
    this.playerHitCooldown = 0;
    this.clock = new THREE.Clock();

    // Camera follow smoothing (0–1, lower = more lag/visible movement)
    this.cameraLerp = 0.5;

    // Renderer
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0x000011);

    // Scene
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x000011, 0.000001);
    //change fog here 0 is no fog

    // Camera — extend far plane for distant planet
    this.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 50000);
    this.camera.position.set(0, 3, 20);

    // Lighting — replace generic directional with a sun
    // AMBIENT_INTENSITY: controls overall scene brightness (0 = dark, 2 = bright)
    const AMBIENT_INTENSITY = 1.0;
    const ambient = new THREE.AmbientLight(0xffffff, AMBIENT_INTENSITY);
    this.scene.add(ambient);

    // Sun — a warm directional light from far away, locked in the background
    this.sunLight = new THREE.DirectionalLight(0xfff5e0, 1.8);
    this.sunLight.position.set(2000, 1000, -3000);
    this.scene.add(this.sunLight);

    // Small visible sun sphere (emissive, no shadows needed)
    const sunGeo = new THREE.SphereGeometry(100, 32, 32);
    const sunMat = new THREE.MeshBasicMaterial({ color: 0xffee88, fog: false });
    this.sunMesh = new THREE.Mesh(sunGeo, sunMat);
    this.sunMesh.position.copy(this.sunLight.position);
    this.scene.add(this.sunMesh);

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

    // Large decorative asteroid field around the player zone
    this.asteroidField = new AsteroidField(this.scene);

    // Planet — large Earth in the background, unreachable
    this._loadPlanet();

    // Handle resize
    window.addEventListener('resize', () => this._onResize());
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.clock.start();
    this.levels.setLevel(1);
    this.hud.update(this.score, this.levels.current, this.lives);
    this._loop();
  }

  _loop() {
    if (!this.running) return;
    requestAnimationFrame(() => this._loop());

    const delta = this.clock.getDelta();
    this.playerHitCooldown = Math.max(0, this.playerHitCooldown - delta);

    // Mouse → pitch / yaw
    const { dx, dy } = this.input.consumeMouseDelta();
    this.player.rotate(dx, dy, delta);

    // W → forward thrust
    if (this.input.isDown('w')) {
      this.player.thrust(delta);
    }

    // A / D → manual roll
    let rollInput = 0;
    if (this.input.isDown('a')) rollInput += 1;   // roll left
    if (this.input.isDown('d')) rollInput -= 1;   // roll right
    this.player.manualRollInput = rollInput;

    // Fire vaporizer — hold Space or left mouse button for rapid-fire
    if (this.input.isDown(' ') || this.input.isDown('mouseleft')) {
      _shipForward.set(0, 0, -1).applyQuaternion(this.player.getQuaternion());
      const fired = this.projectiles.fire(this.player.getPosition(), _shipForward, this.player.velocity);
      if (fired) {
        this.player.applyRecoil(this.projectiles.cooldownTime);
      }
    }

    // Update subsystems
    this.player.update(delta);
    this.projectiles.update(delta);
    const playerPos = this.player.getPosition();
    this.debris.update(delta, this.levels.getSpawnConfig(), playerPos);
    this.starfield.update(delta, this.camera);
    this.asteroidField.update(delta);
    this._checkAsteroidPlayerCollisions();

    // Camera follows behind ship
    this._updateCamera();

    // Keep sun and planet locked relative to camera (unreachable background)
    this._updateBackground(delta);

    // Collision: projectiles vs debris
    this._checkProjectileDebrisCollisions();

    // Collision: debris vs player (misses / hits)
    this._checkDebrisPlayerCollisions();

    // Level progression
    this.levels.update(this.score);

    // Boss-specific logic
    if (this.levels.current === 3) {
      this._updateBoss(delta);
    }

    this.hud.update(this.score, this.levels.current, this.lives);
    this.input.resetPressed();
    this.renderer.render(this.scene, this.camera);
  }

  _checkProjectileDebrisCollisions() {
    const projectiles = this.projectiles.getActive();
    const debrisList = this.debris.getActive();

    for (let i = projectiles.length - 1; i >= 0; i--) {
      for (let j = debrisList.length - 1; j >= 0; j--) {
        const hitRadius = debrisList[j].hitRadius || 1.0;
        if (this._projectileHitsSphere(projectiles[i], debrisList[j].position, hitRadius)) {
          this.score += debrisList[j].points || 100;
          this.projectiles.remove(i);
          this.debris.remove(j);
          break;
        }
      }
    }
  }

  _checkDebrisPlayerCollisions() {
    const debrisList = this.debris.getActive();
    const playerPos = this.player.getPosition();
    // Ship forward for "passed behind" dot-product test
    _shipForward.set(0, 0, -1).applyQuaternion(this.player.getQuaternion());

    for (let i = debrisList.length - 1; i >= 0; i--) {
      const d = debrisList[i];
      const toDebris = d.position.clone().sub(playerPos);
      const dist = toDebris.length();

      // Direct hit
      if (dist < 1.5) {
        this._damagePlayer();
        this.debris.remove(i);
        continue;
      }

      // Debris passed behind the player (dot < 0 means behind, and close-ish)
      if (dist < 8 && toDebris.dot(_shipForward) < -2) {
        this.score = Math.max(0, this.score - 50);
        this.debris.remove(i);
      }
    }
  }

  _checkAsteroidPlayerCollisions() {
    const asteroids = this.asteroidField.getColliders();
    const playerPos = this.player.mesh.position;

    for (let i = 0; i < asteroids.length; i++) {
      const sphere = asteroids[i].boundingSphere;
      const minDistance = PLAYER_COLLISION_RADIUS + sphere.radius;

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

      playerPos.addScaledVector(_collisionNormal, minDistance - distance);

      const normalSpeed = this.player.velocity.dot(_collisionNormal);
      if (normalSpeed >= 0) continue;

      _velocityNormal.copy(_collisionNormal).multiplyScalar(normalSpeed);
      _velocityTangent.copy(this.player.velocity).sub(_velocityNormal).multiplyScalar(ASTEROID_SURFACE_FRICTION);
      this.player.velocity.copy(_velocityTangent).addScaledVector(_collisionNormal, -normalSpeed * ASTEROID_BOUNCE);
    }
  }

  _damagePlayer() {
    if (this.playerHitCooldown > 0 || this.lives <= 0) {
      return false;
    }

    this.lives--;
    this.playerHitCooldown = PLAYER_HIT_COOLDOWN;
    if (this.lives <= 0) {
      this._gameOver();
    }

    return true;
  }

  _updateBoss(delta) {
    if (!this.levels.boss) return;
    // Boss health bar shown in HUD
    this.hud.updateBossBar(this.levels.boss.health, this.levels.boss.maxHealth);

    // Check projectile hits on boss (distance-based)
    const projectiles = this.projectiles.getActive();
    for (let i = projectiles.length - 1; i >= 0; i--) {
      const p = projectiles[i];
      if (this._projectileHitsSphere(p, this.levels.boss.position, 8)) {
        this.levels.boss.health -= 10;
        this.projectiles.remove(i);
        if (this.levels.boss.health <= 0) {
          this._victory();
        }
      }
    }
  }

  _gameOver() {
    this.running = false;
    this.hud.showMessage('GAME OVER');
  }

  _victory() {
    this.running = false;
    this.hud.showMessage('EARTH IS SAVED!');
  }

  _updateCamera() {
    if (DEBUG_FREEZE_CAMERA) return;

    const shipPos = this.player.mesh.position;
    const shipQuat = this.player.mesh.quaternion;

    // Desired camera position: offset behind & above the ship,
    // rotated by the ship's quaternion
    _camTarget.copy(_camOffset).applyQuaternion(shipQuat).add(shipPos);

    // Smooth follow
    this.camera.position.lerp(_camTarget, this.cameraLerp);

    // Set camera up to the ship's local up so lookAt never flips
    // (default world-up (0,1,0) degenerates when looking near-vertical)
    this.camera.up.set(0, 1, 0).applyQuaternion(shipQuat);

    // Look exactly along the ship's forward axis so the screen center
    // matches the firing vanishing point.
    _shipForward.set(0, 0, -1).applyQuaternion(shipQuat);
    _camLookTarget.copy(this.camera.position).addScaledVector(_shipForward, 200);
    this.camera.lookAt(_camLookTarget);
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
    return _closestPoint.distanceTo(center) <= radius;
  }

  _updateBackground(delta) {
    const camPos = this.camera.position;

    // Sun stays at fixed offset from camera — always in background
    this.sunLight.position.set(
      camPos.x + 2000,
      camPos.y + 1000,
      camPos.z - 3000
    );
    this.sunMesh.position.copy(this.sunLight.position);

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
    const normal  = texLoader.load(texPath + 'Earth_NormalNRM_6K.jpg');
    const clouds  = texLoader.load(texPath + 'Earth_Clouds_6K.jpg');
    const night   = texLoader.load(texPath + 'Earth_Illumination_6K.jpg');

    // Main planet sphere
    const planetGeo = new THREE.SphereGeometry(1600, 64, 64);
    const planetMat = new THREE.MeshStandardMaterial({
      map: diffuse,
      normalMap: normal,
      // emissiveMap: night,
      // emissive: new THREE.Color(0.3, 0.3, 0.15),
      roughness: 0.8,
      metalness: 0.1,
      fog: false,
    });
    this.planet = new THREE.Mesh(planetGeo, planetMat);
    this.planet.position.set(-1200, -600, -3500);
    this.scene.add(this.planet);

    // Cloud layer — slightly larger, transparent sphere
    const cloudGeo = new THREE.SphereGeometry(805, 64, 64);
    const cloudMat = new THREE.MeshStandardMaterial({
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
