import * as THREE from 'three';

/**
 * Manages level progression, spawn configs, and boss state.
 *
 * Level 1: 15,000 mi — sparse debris, single type
 * Level 2:  5,000 mi — denser, faster, soda cans + trash cans
 * Level 3:      1 mi — BOSS BATTLE, chunks break off trashteroid
 */

const LEVEL_CONFIGS = {
  1: {
    label: 'LEVEL 1 — 15,000 mi',
    scoreThreshold: 0,
    spawn: {
      interval: 1.6,       // seconds between spawns
      speed: 12,
      speedVariance: 4,
      spawnRadius: 70,
      types: ['trashBag'],
    },
  },
  2: {
    label: 'LEVEL 2 — 5,000 mi',
    scoreThreshold: 2000,
    spawn: {
      interval: 0.9,
      speed: 18,
      speedVariance: 6,
      spawnRadius: 65,
      types: ['trashBag', 'sodaCan', 'trashCan', 'stone'],
    },
  },
  3: {
    label: 'LEVEL 3 — 1 mi  [BOSS]',
    scoreThreshold: 5000,
    spawn: {
      interval: 0.7,
      speed: 22,
      speedVariance: 8,
      spawnRadius: 55,
      types: ['chunk', 'trashBag', 'sodaCan', 'stone'],
    },
  },
};

export class LevelManager {
  constructor() {
    this.current = 1;
    this.boss = null;
    this.bossWorldPosition = new THREE.Vector3(0, 0, -2000); // Boss is far away
    this.bossZoneRadiusSq = 1000 * 1000;
  }

  setLevel(n) {
    this.current = n;
    if (n === 3) {
      this._initBoss();
    }
  }

  getSpawnConfig() {
    return LEVEL_CONFIGS[this.current].spawn;
  }

  getLabel() {
    return LEVEL_CONFIGS[this.current].label;
  }

  update(score, playerPos) {
    if (!playerPos) return;
    const distSq = playerPos.distanceToSquared(this.bossWorldPosition);
    if (distSq < this.bossZoneRadiusSq) {
      if (this.current !== 3) this.setLevel(3);
    } else if (distSq < 6000 * 6000) {
      if (this.current !== 2 && this.current !== 3) this.setLevel(2);
    }
  }

  _initBoss() {
    this.boss = {
      health: 800,
      maxHealth: 800,
      position: this.bossWorldPosition.clone(),
    };
  }
}
