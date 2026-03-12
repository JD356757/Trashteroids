import * as THREE from 'three';

/**
 * Manages level progression, spawn configs, and boss state.
 *
 * Level 1: 15,000 mi - sparse debris
 * Level 2:  5,000 mi - denser debris field
 * Level 3:      1 mi - boss battle
 */

const LEVEL_CONFIGS = {
  1: {
    label: 'LEVEL 1 - 15,000 mi',
    scoreThreshold: 0,
    spawn: {
      interval: 1.6,
      speed: 12,
      speedVariance: 4,
      spawnRadius: 70,
      types: ['bluePlasticBag', 'bottle', 'soda1'],
    },
  },
  2: {
    label: 'LEVEL 2 - 5,000 mi',
    scoreThreshold: 2000,
    spawn: {
      interval: 0.9,
      speed: 18,
      speedVariance: 6,
      spawnRadius: 65,
      types: ['bluePlasticBag', 'bottle', 'laptop', 'soda1', 'soda2', 'soda3'],
    },
  },
  3: {
    label: 'LEVEL 3 - 1 mi [BOSS]',
    scoreThreshold: 5000,
    spawn: {
      interval: 0.7,
      speed: 22,
      speedVariance: 8,
      spawnRadius: 55,
      types: ['bluePlasticBag', 'bottle', 'laptop', 'soda1', 'soda2', 'soda3'],
    },
  },
};

const TRASH_TO_UNLOCK_BOSS = 30;

export class LevelManager {
  constructor() {
    this.current = 1;
    this.boss = null;
    this.trashDestroyed = 0;
    this.bossUnlocked = false;
    this.bossWorldPosition = new THREE.Vector3(0, 0, -2000);
    this.bossZoneRadiusSq = 1000 * 1000;
  }

  setLevel(n) {
    this.current = n;
    if (n === 3) {
      this.bossUnlocked = true;
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
    if (this.bossUnlocked && distSq < this.bossZoneRadiusSq) {
      if (this.current !== 3) this.setLevel(3);
    } else if (distSq < 6000 * 6000) {
      if (this.current !== 2 && this.current !== 3) this.setLevel(2);
    }
  }

  registerTrashDestroyed() {
    this.trashDestroyed++;
    if (this.trashDestroyed >= TRASH_TO_UNLOCK_BOSS) {
      this.bossUnlocked = true;
    }
  }

  isBossUnlocked() {
    return this.bossUnlocked;
  }

  getBossUnlockProgress() {
    return {
      destroyed: this.trashDestroyed,
      required: TRASH_TO_UNLOCK_BOSS,
      remaining: Math.max(0, TRASH_TO_UNLOCK_BOSS - this.trashDestroyed),
    };
  }

  _initBoss() {
    if (this.boss) return;

    this.boss = {
      health: 800,
      maxHealth: 800,
      position: this.bossWorldPosition.clone(),
    };
  }
}
