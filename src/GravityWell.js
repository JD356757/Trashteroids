import * as THREE from 'three';

/**
 * A single moving gravity well that pulls the player inward.
 *
 * Sits ahead of the player at level start. Once the player passes it, it
 * teleports forward to the next anchor point. Visually: a dark sphere
 * with a swirling violet ring + faint outer halo. Inside the core radius
 * the player takes continuous damage (it's a black hole, not a hug).
 */

const _toPlayer = new THREE.Vector3();
const _forward = new THREE.Vector3();
const _scratch = new THREE.Vector3();

export class GravityWell {
  constructor(scene) {
    this.scene = scene;
    this.enabled = false;
    this.config = null;
    this.anchor = new THREE.Vector3();

    this.group = new THREE.Group();
    this.group.visible = false;
    scene.add(this.group);

    const coreGeom = new THREE.SphereGeometry(40, 24, 16);
    const coreMat = new THREE.MeshBasicMaterial({
      color: 0x080014,
      transparent: true,
      opacity: 0.95,
    });
    this.core = new THREE.Mesh(coreGeom, coreMat);
    this.group.add(this.core);

    const ringGeom = new THREE.TorusGeometry(72, 4, 8, 48);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xb27dff,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
    });
    this.ring = new THREE.Mesh(ringGeom, ringMat);
    this.group.add(this.ring);

    const ring2 = new THREE.Mesh(
      new THREE.TorusGeometry(110, 2.5, 8, 56),
      new THREE.MeshBasicMaterial({
        color: 0x7a3ad6,
        transparent: true,
        opacity: 0.45,
        depthWrite: false,
      }),
    );
    ring2.rotation.x = Math.PI / 2.2;
    this.group.add(ring2);
    this.ring2 = ring2;

    const haloGeom = new THREE.SphereGeometry(160, 24, 16);
    const haloMat = new THREE.MeshBasicMaterial({
      color: 0x6a2bff,
      transparent: true,
      opacity: 0.06,
      depthWrite: false,
      side: THREE.BackSide,
    });
    this.halo = new THREE.Mesh(haloGeom, haloMat);
    this.group.add(this.halo);
  }

  setEnabled(on, config = null, player = null) {
    this.enabled = !!on && !!config;
    this.config = config;
    this.group.visible = this.enabled;
    if (!this.enabled || !player) return;

    // Place anchor a configured distance ahead of the player.
    _forward.set(0, 0, -1).applyQuaternion(player.baseQuaternion).normalize();
    this.anchor.copy(player.mesh.position)
      .addScaledVector(_forward, config.forwardOffset ?? 1400);
    this.group.position.copy(this.anchor);
  }

  /**
   * Apply pull force on the player. Returns damage dealt this frame
   * (when player is inside the core radius), or 0.
   *
   * `boosting` lets the well "shrink" when the player is actively boosting,
   * giving them a way to escape its reach. When not boosting, the well
   * pulls from much farther away.
   */
  update(delta, player, { boosting = false } = {}) {
    if (!this.enabled || !player) return 0;
    const cfg = this.config;

    // Slowly rotate visuals.
    this.ring.rotation.z += delta * 0.6;
    this.ring2.rotation.z -= delta * 0.4;
    this.core.scale.setScalar(0.95 + 0.05 * Math.sin(performance.now() * 0.004));

    _toPlayer.copy(player.mesh.position).sub(this.anchor);
    const dist = _toPlayer.length();
    const baseRadius = cfg.effectiveRadius ?? 700;
    const lazyRadius = cfg.effectiveRadiusUnboosted ?? baseRadius * 1.7;
    const effectiveRadius = boosting ? baseRadius : lazyRadius;

    // If the player has overshot the well (gone past it forward), advance
    // to the next anchor so the level always has one ahead.
    _forward.set(0, 0, -1).applyQuaternion(player.baseQuaternion).normalize();
    _scratch.copy(this.anchor).sub(player.mesh.position);
    if (_scratch.dot(_forward) < -300) {
      // Re-anchor ahead of the player.
      this.anchor.copy(player.mesh.position)
        .addScaledVector(_forward, cfg.forwardOffset ?? 1400);
      this.group.position.copy(this.anchor);
      return 0;
    }

    if (dist > effectiveRadius) {
      this.group.position.copy(this.anchor);
      return 0;
    }

    // Pull the player toward the anchor. Force grows as player nears.
    const pullStrength = cfg.pullStrength ?? 250;
    const t = 1 - dist / effectiveRadius;            // 0 at edge, 1 at center
    const pull = pullStrength * (t * t + 0.15);
    if (dist > 0.01) {
      _toPlayer.multiplyScalar(-pull * delta / dist);
      player.velocity.add(_toPlayer);
    }
    this.group.position.copy(this.anchor);

    // Core damage region.
    const coreRadius = cfg.coreRadius ?? 60;
    if (dist < coreRadius) {
      return cfg.coreDamage ?? 18;
    }
    return 0;
  }

  clear() {
    this.enabled = false;
    this.group.visible = false;
  }
}
