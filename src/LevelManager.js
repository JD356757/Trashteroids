import * as THREE from 'three';

/**
 * Manages level progression, spawn configs, and boss state.
 *
 * Level 1: 15,000 mi - light trash stream
 * Level 2:  5,000 mi - faster stream, wider lanes
 * Level 3:      1 mi - boss approach with dense front-loaded pressure
 */

const LEVEL_CONFIGS = {
  1: {
    label: 'LEVEL 1 - 15,000 mi',
    scoreThreshold: 0,
    spawn: {
      maxActive: 22,
      bootstrapActive: 10,
      forwardSpawnMin: 950,
      forwardSpawnMax: 1325,
      lateralSpread: 190,
      verticalRange: 100,
      minGap: 72,
      modelScale: 14.8,
      scaleMin: 0.9,
      scaleMax: 1.15,
      backwardDrift: 10,
      lateralDrift: 4,
      rotationSpeed: 0.32,
      progressPerSpawn: 90,
      despawnDistance: 2100,
      recycleBehindDistance: 165,
      points: 250,
    },
  },
  2: {
    label: 'LEVEL 2 - 5,000 mi',
    scoreThreshold: 2000,
    spawn: {
      maxActive: 30,
      bootstrapActive: 12,
      forwardSpawnMin: 1025,
      forwardSpawnMax: 1450,
      lateralSpread: 250,
      verticalRange: 130,
      minGap: 76,
      modelScale: 15.6,
      scaleMin: 0.88,
      scaleMax: 1.2,
      backwardDrift: 13,
      lateralDrift: 6,
      rotationSpeed: 0.44,
      progressPerSpawn: 72,
      despawnDistance: 2350,
      recycleBehindDistance: 180,
      points: 325,
    },
  },
  3: {
    label: 'LEVEL 3 - 1 mi [BOSS]',
    scoreThreshold: 5000,
    spawn: {
      maxActive: 38,
      bootstrapActive: 14,
      forwardSpawnMin: 1080,
      forwardSpawnMax: 1560,
      lateralSpread: 320,
      verticalRange: 160,
      minGap: 84,
      modelScale: 16.2,
      scaleMin: 0.88,
      scaleMax: 1.24,
      backwardDrift: 16,
      lateralDrift: 8,
      rotationSpeed: 0.58,
      progressPerSpawn: 58,
      despawnDistance: 2550,
      recycleBehindDistance: 210,
      points: 400,
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
