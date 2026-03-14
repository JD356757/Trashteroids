import * as THREE from 'three';

/**
 * Manages level configs and current level state.
 * Level progression is driven entirely by objective completion in Game.js.
 */

const LEVEL_CONFIGS = {
  1: {
    label: 'LEVEL 1 - 15,000 mi',
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

export class LevelManager {
  constructor() {
    this.current = 1;
  }

  setLevel(n) {
    this.current = n;
  }

  getSpawnConfig() {
    return LEVEL_CONFIGS[this.current].spawn;
  }

  getLabel() {
    return LEVEL_CONFIGS[this.current].label;
  }
}
