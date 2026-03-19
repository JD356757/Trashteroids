/**
 * Manages level configs and current level state.
 * Objective and boss behavior both key off this shared config.
 */

export const LEVEL_CONFIGS = {
  1: {
    label: 'LEVEL 1 - 15,000 miles to trashteroid',
    briefingTagline: 'To get closer to the trashteroid, you must clear out the giant trash fields surrounding Earth. Destroy enough of the pollution before time runs out.',
    timer: 180,
    mission: {
      successTitle: 'SECTOR 1 CLEARED',
      successSubtitle: 'Required objective complete.',
      primary: {
        trashRequired: 20,
        recycleRequired: 9,
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
    briefingTagline: 'Get to the trashteroid. Clear the path by destroying more trash.',
    timer: 240,
    trashteroidScale: 70,
    mission: {
      successTitle: 'SECTOR 2 CLEARED',
      successSubtitle: 'Trashteroid reached. Final assault window open.',
      primary: {
        trashRequired: 40,
        recycleRequired: 15,
        reachTrashteroid: true,
        reachDistanceDisplay: 1500,
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
        fastTrashRequired: 0,
        fastSpeedDisplay: 300,
        shieldThreshold: 90,
      },
    },
    boss: {
      maxHealth: 2200,
      startDistance: 5000,
      asteroidTarget: 70,
      strafeAmplitude: 140,
      verticalAmplitude: 80,
      strafeFrequency: 0.42,
      verticalFrequency: 0.28,
      moveSharpness: 1.12,
      speedRatio: 1.015,
      shotInterval: 0.55,
      projectileSpeed: 480,
      projectileDamage: 48,
      projectileLifetime: 9.5,
      collisionRadius: 72,
      contactDamage: 26,
      bossScale: 40,
      projectileBurstCount: 3,
      projectileSpreadScale: 0.019,
      projectileVerticalSpreadScale: 0.01,
      projectileAimError: 0.01,
    },
    spawn: {
      maxActive: 0,
      bootstrapActive: 0,
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

const LEVEL_UNLOCK_STORAGE_KEY = 'trashteroid_unlocked_level';
const LEVEL_STARS_STORAGE_KEY = 'trashteroid_level_stars';

function getMaxConfiguredLevel() {
  const keys = Object.keys(LEVEL_CONFIGS).map((entry) => Number(entry));
  return keys.length > 0 ? Math.max(...keys) : 1;
}

export function getUnlockedLevel() {
  const maxConfigured = getMaxConfiguredLevel();

  try {
    const raw = window.localStorage.getItem(LEVEL_UNLOCK_STORAGE_KEY);
    const parsed = raw == null ? NaN : Number(raw);
    if (Number.isFinite(parsed)) {
      return Math.min(maxConfigured, Math.max(1, Math.floor(parsed)));
    }
  } catch (error) {
    // Ignore storage errors and fall back to level 1.
  }

  return 1;
}

export function setUnlockedLevel(level) {
  const maxConfigured = getMaxConfiguredLevel();
  const clamped = Math.min(maxConfigured, Math.max(1, Math.floor(level)));

  try {
    window.localStorage.setItem(LEVEL_UNLOCK_STORAGE_KEY, `${clamped}`);
  } catch (error) {
    // Ignore storage failures and keep runtime behavior.
  }

  return clamped;
}

export function unlockLevel(level) {
  const nextUnlocked = Math.max(getUnlockedLevel(), Math.floor(level));
  return setUnlockedLevel(nextUnlocked);
}

function getDefaultLevelStarsMap() {
  const map = {};
  for (const level of Object.keys(LEVEL_CONFIGS)) {
    map[level] = 0;
  }
  return map;
}

function sanitizeStarsMap(rawMap) {
  const fallback = getDefaultLevelStarsMap();
  if (!rawMap || typeof rawMap !== 'object') {
    return fallback;
  }

  for (const level of Object.keys(fallback)) {
    const parsed = Number(rawMap[level]);
    if (Number.isFinite(parsed)) {
      fallback[level] = Math.min(3, Math.max(0, Math.floor(parsed)));
    }
  }

  return fallback;
}

function saveLevelStarsMap(starsMap) {
  try {
    window.localStorage.setItem(LEVEL_STARS_STORAGE_KEY, JSON.stringify(starsMap));
  } catch (error) {
    // Ignore storage failures and keep runtime behavior.
  }
}

export function getAllLevelStars() {
  try {
    const raw = window.localStorage.getItem(LEVEL_STARS_STORAGE_KEY);
    if (!raw) {
      return getDefaultLevelStarsMap();
    }
    const parsed = JSON.parse(raw);
    return sanitizeStarsMap(parsed);
  } catch (error) {
    return getDefaultLevelStarsMap();
  }
}

export function getLevelStars(level) {
  const map = getAllLevelStars();
  const key = String(Math.floor(level));
  return map[key] ?? 0;
}

export function recordLevelStars(level, stars) {
  const map = getAllLevelStars();
  const key = String(Math.floor(level));
  if (!(key in map)) {
    return 0;
  }

  const clampedStars = Math.min(3, Math.max(0, Math.floor(stars)));
  map[key] = Math.max(map[key], clampedStars);
  saveLevelStarsMap(map);
  return map[key];
}

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
