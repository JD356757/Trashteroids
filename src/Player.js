import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const _forward = new THREE.Vector3();
const _pitchQ = new THREE.Quaternion();
const _yawQ = new THREE.Quaternion();
const _rollQ = new THREE.Quaternion();
const _xAxis = new THREE.Vector3(1, 0, 0);
const _yAxis = new THREE.Vector3(0, 1, 0);
const _zAxis = new THREE.Vector3(0, 0, 1);
const _localUp = new THREE.Vector3();

export class Player {
  constructor(scene) {
    // --- Flight parameters ---
    this.thrustPower = 500;
    this.boostMultiplier = 2.0;
    this.recoilAcceleration = 42;
    this.mouseSensitivity = 0.024;
    this.turnAcceleration = 5.0;   // unused
    this.maxTurnRate = 2.9;
    this.turnSmoothing = 18;        // how quickly rate tracks input (higher = snappier)
    this.rollOnYaw = -0.4;
    this.rollReturnSpeed = 3.0;
    this.pitchOnPitch = 0.3;
    this.dampening = 0.98;
    this.manualRollSpeed = 5.0;
    this.maxRoll = Math.PI / 4;
    this.rollLiftPower = 180;
    this.rollYawCoupling = 1;

    this.modelScale = 1;
    this.velocity = new THREE.Vector3();
    this.currentRoll = 0;
    this.manualRollInput = 0;
    this.baseQuaternion = new THREE.Quaternion();
    this.yawRate = 0;
    this.pitchRate = 0;
    this.turnInputYaw = 0;
    this.turnInputPitch = 0;
    this.flashTimer = 0;
    this.thrustActive = false;

    this.mesh = new THREE.Group();
    this.mesh.position.set(0, 0, 10);
    scene.add(this.mesh);

    this.thrusterOffsetLeft = new THREE.Vector3(-2.55, 0, 1.6);
    this.thrusterOffsetRight = new THREE.Vector3(2.55, 0, 1.6);
    this.thrustLevel = 0;

    // --- Particle system ---
    this._emitterSettings = {
      positionBase: new THREE.Vector3(0, 0, -0.75),
      positionSpread: new THREE.Vector3(0.06, 0.06, 0.14),
      velocityBase: new THREE.Vector3(0, 0, 82),
      velocitySpread: new THREE.Vector3(8, 8, 26),
      sizeBase: 0.5,
      sizeSpread: 1.5,
      opacityBase: 2,
      particlesPerSecond: 2400,
      particleDeathAge: 0.07,
    };
    this._particlePoolSize = 1200;
    this._particleIndex = 0;
    this._particlePositions = new Float32Array(this._particlePoolSize * 3);
    this._particleVel = new Float32Array(this._particlePoolSize * 3);
    this._particleColors = new Float32Array(this._particlePoolSize * 3);
    this._particleSizes = new Float32Array(this._particlePoolSize);
    this._particleAlphas = new Float32Array(this._particlePoolSize);
    this._particleAges = new Float32Array(this._particlePoolSize);
    this._particleLives = new Float32Array(this._particlePoolSize);

    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(this._particlePositions, 3));
    geom.setAttribute('color', new THREE.BufferAttribute(this._particleColors, 3));
    geom.setAttribute('size', new THREE.BufferAttribute(this._particleSizes, 1));
    geom.setAttribute('alpha', new THREE.BufferAttribute(this._particleAlphas, 1));

    const loader = new THREE.TextureLoader();
    const sprite = loader.load('fireparticle.png');
    const mat = new THREE.ShaderMaterial({
      uniforms: { map: { value: sprite } },
      vertexShader: `
        attribute vec3 color;
        attribute float size;
        attribute float alpha;
        varying float vAlpha;
        varying vec3 vColor;
        void main() {
          vAlpha = alpha;
          vColor = color;
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = size * (300.0 / -mvPosition.z);
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: `
        uniform sampler2D map;
        varying float vAlpha;
        varying vec3 vColor;
        void main() {
          vec4 t = texture2D(map, gl_PointCoord);
          gl_FragColor = vec4(t.rgb * vColor, t.a * vAlpha);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexColors: false,
    });
    this._particlePoints = new THREE.Points(geom, mat);
    this._particlePoints.frustumCulled = false;
    this.mesh.add(this._particlePoints);
    this._spawnAccumulator = 0;
    this._loadModel();
  }

  _loadModel() {
    const loader = new GLTFLoader();

    loader.load('/models/spaceshipactual.glb', (gltf) => {
      const model = gltf.scene;
      model.scale.setScalar(this.modelScale);
      // Rotate so the model faces -Z (forward in our coordinate system)
      model.rotation.y = Math.PI;

      model.traverse((child) => {
        if (!child.isMesh) return;
        child.castShadow = true;
        child.receiveShadow = true;

        const materials = Array.isArray(child.material) ? child.material : [child.material];
        const converted = materials.map((mat) => {
          if (!mat) return mat;

          // Use Basic material so the ship is not affected by world lighting.
          const newMat = new THREE.MeshBasicMaterial({
            color: mat.color ? mat.color.clone() : new THREE.Color(0xffffff),
          });
          if (mat.map) newMat.map = mat.map;
          if (mat.alphaMap) newMat.alphaMap = mat.alphaMap;
          if (mat.transparent) newMat.transparent = true;

          newMat.userData.originalColor = newMat.color.clone();
          newMat.userData.originalMap = newMat.map ?? null;
          return newMat;
        });

        child.material = Array.isArray(child.material) ? converted : converted[0];
      });

      this.mesh.add(model);
    });
  }



  rotate(dx, dy, delta) {
    const dt = Math.max(delta, 1 / 240);

    // Convert mouse delta into normalized turn intent.
    this.turnInputYaw = THREE.MathUtils.clamp((-dx * this.mouseSensitivity / 8) / dt, -1, 1);
    this.turnInputPitch = THREE.MathUtils.clamp((-dy * this.mouseSensitivity / 8) / dt, -1, 1);
  }

  thrust(delta, boostMultiplier = 1) {
    _forward.set(0, 0, -1).applyQuaternion(this.baseQuaternion);
    this.velocity.addScaledVector(_forward, this.thrustPower * boostMultiplier * delta);
    // mark thrust active for exhaust visuals
    this.thrustActive = true;
    this.thrustLevel = Math.min(1.35, boostMultiplier);
  }


  applyRecoil(duration) {
    _forward.set(0, 0, -1).applyQuaternion(this.baseQuaternion);
    this.velocity.addScaledVector(_forward, -this.recoilAcceleration * duration);
  }



  update(delta) {
    // --- Smooth turn rate toward capped input target ---
    const targetYaw   = this.turnInputYaw   * this.maxTurnRate;
    const targetPitch = this.turnInputPitch * this.maxTurnRate;
    const follow = 1 - Math.exp(-this.turnSmoothing * delta);
    this.yawRate   += (targetYaw   - this.yawRate)   * follow;
    this.pitchRate += (targetPitch - this.pitchRate) * follow;


    const yawAngle = this.yawRate * delta;
    const pitchAngle = this.pitchRate * delta;
    if (yawAngle !== 0) {
      _yawQ.setFromAxisAngle(_yAxis, yawAngle);
      this.baseQuaternion.multiply(_yawQ);
    }
    if (pitchAngle !== 0) {
      _pitchQ.setFromAxisAngle(_xAxis, pitchAngle);
      this.baseQuaternion.multiply(_pitchQ);
    }
    this.baseQuaternion.normalize();
    // --- Drag and position integration ---
    this.velocity.multiplyScalar(Math.pow(this.dampening, delta * 60));
    this.mesh.position.addScaledVector(this.velocity, delta);
    // --- Roll and visual orientation ---
    const turnRoll = -(this.yawRate / this.maxTurnRate) * this.rollOnYaw;
    const manualRoll = this.manualRollInput * this.maxRoll;
    const targetRoll = THREE.MathUtils.clamp(turnRoll + manualRoll, -this.maxRoll, this.maxRoll);
    this.currentRoll = THREE.MathUtils.lerp(this.currentRoll, targetRoll, Math.min(1, this.rollReturnSpeed * delta));
    const rollVisualPitch = Math.abs(this.currentRoll) * 0.3;
    const inputPitch = (this.pitchRate / this.maxTurnRate) * this.pitchOnPitch;
    let cosmeticPitch = rollVisualPitch + inputPitch;
    cosmeticPitch = THREE.MathUtils.clamp(cosmeticPitch, -0.6, 0.6);
    _rollQ.setFromAxisAngle(_zAxis, this.currentRoll);
    _pitchQ.setFromAxisAngle(_xAxis, cosmeticPitch);
    _pitchQ.premultiply(_rollQ);
    _pitchQ.normalize();
    this.mesh.quaternion.copy(this.baseQuaternion).multiply(_pitchQ);
    this.mesh.quaternion.normalize();
    // --- Roll-based swoop ---
    if (Math.abs(this.currentRoll) > 0.01) {
      _localUp.set(1, 0, 0).applyQuaternion(this.baseQuaternion);
      this.velocity.addScaledVector(_localUp, -Math.sin(this.currentRoll) * this.rollLiftPower * delta);
      // yawRate coupling already applied above
    }
    // --- Particle emitter update ---
    if (this._particlePoints) {
      const flameLevel = this.thrustActive ? this.thrustLevel : 0;
      const s = this._emitterSettings;
      const spawnRate = s.particlesPerSecond * flameLevel;
      this._spawnAccumulator += spawnRate * delta;
      const spawnCount = Math.floor(this._spawnAccumulator);
      this._spawnAccumulator -= spawnCount;
      if (!this.thrustActive) this._spawnAccumulator = 0;
      const emitters = [this.thrusterOffsetLeft, this.thrusterOffsetRight];
      const spawnPerThruster = spawnCount > 0 ? Math.max(1, Math.ceil(spawnCount / emitters.length)) : 0;
      for (const emitterOffset of emitters) {
        for (let i = 0; i < spawnPerThruster; i++) {
          const basePos = emitterOffset.clone().add(s.positionBase);
          basePos.x += (Math.random() * 2 - 1) * s.positionSpread.x;
          basePos.y += (Math.random() * 2 - 1) * s.positionSpread.y;
          basePos.z += (Math.random() * 2 - 1) * s.positionSpread.z;
          const velLocal = new THREE.Vector3(
            s.velocityBase.x + (Math.random() * 2 - 1) * s.velocitySpread.x,
            s.velocityBase.y + (Math.random() * 2 - 1) * s.velocitySpread.y,
            s.velocityBase.z + (Math.random() * 2 - 1) * s.velocitySpread.z
          );
          const plumeTightness = 1 - flameLevel * 0.35;
          velLocal.x *= plumeTightness;
          velLocal.y *= plumeTightness;
          const idx = this._particleIndex % this._particlePoolSize;
          this._particleIndex++;
          this._particlePositions[idx * 3 + 0] = basePos.x;
          this._particlePositions[idx * 3 + 1] = basePos.y;
          this._particlePositions[idx * 3 + 2] = basePos.z;
          this._particleVel[idx * 3 + 0] = velLocal.x;
          this._particleVel[idx * 3 + 1] = velLocal.y;
          this._particleVel[idx * 3 + 2] = velLocal.z;
          this._particleSizes[idx] = (s.sizeBase + (Math.random() * 2 - 1) * s.sizeSpread) * (0.75 + flameLevel * 0.5);
          this._particleAges[idx] = 0;
          this._particleLives[idx] = s.particleDeathAge * (0.85 + flameLevel * 0.35);
          this._particleAlphas[idx] = s.opacityBase * (0.8 + flameLevel * 0.2);
          const heat = Math.random();
          let r, g, b;
          if (heat > 0.72) {
            r = 0.45; g = 0.75; b = 1.0;
          } else if (heat > 0.3) {
            r = 1.0; g = 0.62 + Math.random() * 0.18; b = 0.14;
          } else {
            r = 1.0; g = 0.94; b = 0.72;
          }
          this._particleColors[idx * 3 + 0] = r;
          this._particleColors[idx * 3 + 1] = g;
          this._particleColors[idx * 3 + 2] = b;
        }
      }
      for (let p = 0; p < this._particlePoolSize; p++) {
        const life = this._particleLives[p];
        if (life <= 0) continue;
        this._particleAges[p] += delta;
        const age = this._particleAges[p];
        if (age >= life) {
          this._particleLives[p] = 0;
          this._particleAlphas[p] = 0;
          continue;
        }
        this._particlePositions[p * 3 + 0] += this._particleVel[p * 3 + 0] * delta;
        this._particlePositions[p * 3 + 1] += this._particleVel[p * 3 + 1] * delta;
        this._particlePositions[p * 3 + 2] += this._particleVel[p * 3 + 2] * delta;
        this._particleVel[p * 3 + 0] *= 0.985;
        this._particleVel[p * 3 + 1] *= 0.985;
        this._particleVel[p * 3 + 2] *= 0.94;
        const t = age / life;
        const alphaEnvelope = Math.sin(Math.PI * Math.min(1, t)) * (1 - t * 0.35);
        this._particleAlphas[p] = alphaEnvelope * s.opacityBase;
        this._particleSizes[p] *= 0.985 + t * 0.025;
      }
      const posAttr = this._particlePoints.geometry.attributes.position;
      posAttr.needsUpdate = true;
      const colorAttr = this._particlePoints.geometry.attributes.color;
      colorAttr.needsUpdate = true;
      const sizeAttr = this._particlePoints.geometry.attributes.size;
      sizeAttr.array.set(this._particleSizes);
      sizeAttr.needsUpdate = true;
      const alphaAttr = this._particlePoints.geometry.attributes.alpha;
      alphaAttr.array.set(this._particleAlphas);
      alphaAttr.needsUpdate = true;
    }
    this.thrustActive = false;
    this.thrustLevel = 0;
    this.turnInputYaw = 0;
    this.turnInputPitch = 0;
  }

  // (getPosition and getQuaternion removed as unused)
}
