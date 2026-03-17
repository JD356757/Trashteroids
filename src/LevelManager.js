/**
 * Manages level configs and current level state.
 * Objective and boss behavior both key off this shared config.
 */

export const LEVEL_CONFIGS = {
  1: {
    label: 'LEVEL 1 - 15,000 miles to trashteroid',
    briefingTagline: 'Giant fields of trash detected near Earth orbit. Clear the pollution before time runs out.',
    timer: 180,
    mission: {
      successTitle: 'SECTOR 1 CLEARED',
      successSubtitle: 'Required objective complete.',
      primary: {
        trashRequired: 30,
      },
      bonus: {
        fastTrashRequired: 3,
        fastSpeedDisplay: 200,
        shieldThreshold: 90,
      },
    },
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
    label: 'LEVEL 2 - 15,000 miles to trashteroid',
    briefingTagline: 'Make your way to the trashteroid. Clear the path by destroying more trash.',
    timer: 240,
    mission: {
      successTitle: 'SECTOR 2 CLEARED',
      successSubtitle: 'Trashteroid reached. Final assault window open.',
      primary: {
        trashRequired: 40,
        reachTrashteroid: true,
        reachDistanceDisplay: 60,
      },
      bonus: {
        fastTrashRequired: 4,
        fastSpeedDisplay: 250,
        shieldThreshold: 90,
      },
    },
    spawn: {
      maxActive: 26,
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
    label: 'LEVEL 3 - 0.1 mi from the trashteroid',
    briefingTagline: 'The trashteroid is heading for Earth, and chunks of trash are flying off of it. Destroy the trashteroid and its byproducts before it reaches Earth. Be quick… TIME IS RUNNING OUT!',
    timer: 300,
    mission: {
      successTitle: 'TRASHTEROID DESTROYED',
      successSubtitle: 'Earth orbit is clear.',
      primary: {
        destroyTrashteroid: true,
      },
      bonus: {
        fastTrashRequired: 5,
        fastSpeedDisplay: 300,
        shieldThreshold: 90,
      },
    },
    boss: {
      maxHealth: 1400,
      startDistance: 900,
      strafeAmplitude: 140,
      verticalAmplitude: 80,
      strafeFrequency: 0.42,
      verticalFrequency: 0.28,
      moveSharpness: 1.12,
      speedRatio: 1.015,
      shotInterval: 0.58,
      projectileSpeed: 1020,
      projectileDamage: 32,
      projectileLifetime: 5.5,
      collisionRadius: 66,
      contactDamage: 16,
    },
    spawn: {
      maxActive: 18,
      bootstrapActive: 8,
      forwardSpawnMin: 980,
      forwardSpawnMax: 1425,
      lateralSpread: 220,
      verticalRange: 140,
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
    this.current = LEVEL_CONFIGS[n] ? n : 1;
  }

  getConfig(level = this.current) {
    return LEVEL_CONFIGS[level] ?? LEVEL_CONFIGS[1];
  }

  getCurrentConfig() {
    return this.getConfig(this.current);
  }

  getSpawnConfig() {
    return this.getCurrentConfig().spawn;
  }

  getMissionConfig() {
    return this.getCurrentConfig().mission;
  }

  getTimerSeconds() {
    return this.getCurrentConfig().timer ?? 0;
  }

  getLabel() {
    return this.getCurrentConfig().label;
  }

  getNextLevel(level = this.current) {
    const nextLevel = level + 1;
    return LEVEL_CONFIGS[nextLevel] ? nextLevel : null;
  }
}
