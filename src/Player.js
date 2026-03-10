import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';

const _forward = new THREE.Vector3();
const _pitchQ = new THREE.Quaternion();
const _yawQ = new THREE.Quaternion();
const _rollQ = new THREE.Quaternion();
const _xAxis = new THREE.Vector3(1, 0, 0);
const _yAxis = new THREE.Vector3(0, 1, 0);
const _zAxis = new THREE.Vector3(0, 0, 1);

// Map material name → texture file prefixes for PBR textures
const MATERIAL_TEXTURE_MAP = {
  'Body': 'Fighter_03_Body',
  'Blue_Lights': 'Fighter_03_Blue_Lights',
  'White_Lights': 'Fighter_03_White_Lights',
  'Rear_Lights': 'Fighter_03_Rear_Lights',
  'Windows': 'Fighter_03_Windows',
};

export class Player {
  constructor(scene) {
    // Flight parameters
    this.thrustPower = 200;
    this.recoilAcceleration = 70;
    this.mouseSensitivity = 0.0024;
    this.turnAcceleration = 16.0;
    this.maxTurnRate = 2.9;
    this.turnDamping = 7.5;
    this.rollOnYaw = -0.4;           // cosmetic roll from turning (subtle)
    this.rollReturnSpeed = 3.0;
    this.dampening = 0.98;
    this.manualRollSpeed = 3.0;     // how fast A/D rolls the ship
    this.maxRoll = Math.PI / 4;     // ~25 degrees max roll either way

    // Model scale — tweak this to resize the ship
    this.modelScale = 0.005;

    // State
    this.velocity = new THREE.Vector3();
    this.currentRoll = 0;
    this.manualRollInput = 0;       // -1 (A/left), 0, +1 (D/right)
    this.baseQuaternion = new THREE.Quaternion();
    this.yawRate = 0;
    this.pitchRate = 0;
    this.turnInputYaw = 0;
    this.turnInputPitch = 0;
    this.yaw = 0;
    this.pitch = 0;
    this.maxPitch = Math.PI / 2 - 0.1;

    // Use a Group as the root so position/quaternion math works
    // even before the FBX finishes loading
    this.mesh = new THREE.Group();
    this.mesh.position.set(0, 0, 10);
    scene.add(this.mesh);

    // Engine glow (kept as simple sphere on the group)
    const glowGeo = new THREE.SphereGeometry(0.3, 8, 8);
    const glowMat = new THREE.MeshBasicMaterial({ color: 0x00ff88 });
    this.engineGlow = new THREE.Mesh(glowGeo, glowMat);
    this.engineGlow.position.set(0, 0, 1.2);
    this.mesh.add(this.engineGlow);

    // Load FBX model
    this._loadModel();
  }

  _loadModel() {
    const loader = new FBXLoader();
    const texLoader = new THREE.TextureLoader();
    const texPath = '/models/fighter/textures/';

    loader.load('/models/fighter/Fighter_03.fbx', (fbx) => {
      fbx.scale.setScalar(this.modelScale);
      // Rotate so the model faces -Z (forward in our coordinate system)
      fbx.rotation.y = Math.PI;

      // Apply PBR textures per material group
      fbx.traverse((child) => {
        if (!child.isMesh) return;

        const matName = child.material ? child.material.name : '';
        const prefix = MATERIAL_TEXTURE_MAP[matName];

        if (prefix) {
          const baseColor = texLoader.load(texPath + prefix + '_BaseColor.png');
          baseColor.colorSpace = THREE.SRGBColorSpace;
          const normal = texLoader.load(texPath + prefix + '_Normal.png');
          const roughness = texLoader.load(texPath + prefix + '_Roughness.png');
          const metallic = texLoader.load(texPath + prefix + '_Metallic.png');

          const mat = new THREE.MeshStandardMaterial({
            map: baseColor,
            normalMap: normal,
            roughnessMap: roughness,
            metalnessMap: metallic,
            metalness: 1.0,
            roughness: 1.0,
            // Per-object ambient: base emissive so the ship is always visible
            emissive: new THREE.Color(0.25, 0.25, 0.25),
            emissiveIntensity: 1.0,
          });

          // Emissive textures exist for lights — override with full brightness
          if (matName.includes('Lights')) {
            const emissive = texLoader.load(texPath + prefix + '_Emissive.png');
            mat.emissiveMap = emissive;
            mat.emissive = new THREE.Color(1, 1, 1);
          }

          child.material = mat;
        }

        child.castShadow = true;
        child.receiveShadow = true;
      });

      this.mesh.add(fbx);
    });
  }

  /**
   * Rotate the ship based on mouse movement.
   * Mouse movement drives turn acceleration; the actual rotation is
   * integrated in update() with damping and a max turn rate.
   */
  rotate(dx, dy, delta) {
    const dt = Math.max(delta, 1 / 240);

    // Convert mouse delta into normalized turn intent.
    this.turnInputYaw = THREE.MathUtils.clamp((-dx * this.mouseSensitivity) / dt, -1, 1);
    this.turnInputPitch = THREE.MathUtils.clamp((-dy * this.mouseSensitivity) / dt, -1, 1);
  }

  /**
   * Apply forward thrust along the ship's facing direction.
   */
  thrust(delta) {
    _forward.set(0, 0, -1).applyQuaternion(this.baseQuaternion);
    this.velocity.addScaledVector(_forward, this.thrustPower * delta);
  }

  applyRecoil(duration) {
    _forward.set(0, 0, -1).applyQuaternion(this.baseQuaternion);
    this.velocity.addScaledVector(_forward, -this.recoilAcceleration * duration);
  }

  update(delta) {
    // Angular acceleration with capped turn rate gives the ship more weight
    // while remaining responsive.
    this.yawRate += this.turnInputYaw * this.turnAcceleration * delta;
    this.pitchRate += this.turnInputPitch * this.turnAcceleration * delta;

    const turnDecay = Math.exp(-this.turnDamping * delta);
    this.yawRate *= turnDecay;
    this.pitchRate *= turnDecay;

    this.yawRate = THREE.MathUtils.clamp(this.yawRate, -this.maxTurnRate, this.maxTurnRate);
    this.pitchRate = THREE.MathUtils.clamp(this.pitchRate, -this.maxTurnRate, this.maxTurnRate);

    this.yaw += this.yawRate * delta;

    const nextPitch = this.pitch + this.pitchRate * delta;
    this.pitch = THREE.MathUtils.clamp(nextPitch, -this.maxPitch, this.maxPitch);
    if (this.pitch !== nextPitch) {
      this.pitchRate = 0;
    }

    // Rebuild base quaternion from yaw (world Y) then pitch (local X)
    _yawQ.setFromAxisAngle(_yAxis, this.yaw);
    _pitchQ.setFromAxisAngle(_xAxis, this.pitch);
    this.baseQuaternion.copy(_yawQ).multiply(_pitchQ);

    // Framerate-independent drag: same decay per real second regardless of FPS
    this.velocity.multiplyScalar(Math.pow(this.dampening, delta * 60));

    // Integrate position
    this.mesh.position.addScaledVector(this.velocity, delta);

    // Roll combines: cosmetic tilt from turning + manual A/D input
    const turnRoll = -(this.yawRate / this.maxTurnRate) * this.rollOnYaw;
    const manualRoll = this.manualRollInput * this.maxRoll;
    const targetRoll = THREE.MathUtils.clamp(turnRoll + manualRoll, -this.maxRoll, this.maxRoll);
    this.currentRoll = THREE.MathUtils.lerp(this.currentRoll, targetRoll, Math.min(1, this.rollReturnSpeed * delta));

    // Compose visual quaternion: base (yaw+pitch) * cosmetic roll
    _rollQ.setFromAxisAngle(_zAxis, this.currentRoll);
    this.mesh.quaternion.copy(this.baseQuaternion).multiply(_rollQ);
    this.mesh.quaternion.normalize();

    // Engine glow pulsing
    const scale = 0.8 + Math.sin(Date.now() * 0.008) * 0.2;
    this.engineGlow.scale.setScalar(scale);

    // Mouse intent only applies for the current frame.
    this.turnInputYaw = 0;
    this.turnInputPitch = 0;
  }

  getPosition() {
    return this.mesh.position.clone();
  }

  getQuaternion() {
    return this.baseQuaternion.clone();
  }
}
