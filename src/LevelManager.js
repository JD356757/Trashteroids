/**
 * Manages level configs and current level state.
 * Objective and boss behavior both key off this shared config.
 */

export const LEVEL_CONFIGS = {
  1: {
    label: 'LEVEL 1 - 25,000 km to trashteroid',
    briefingTagline: 'To get closer to the trashteroid, you must clear out the giant trash fields surrounding Earth. Destroy enough of the pollution before time runs out.',
    timer: 120,
    mission: {
      successTitle: 'SECTOR 1 CLEARED',
      successSubtitle: 'Required objective complete.',
      primary: {
        trashRequired: 1,
        recycleRequired: 1,
      },
      bonus: {
        fastTrashRequired: 3,
        fastSpeedDisplay: 200,
        specialRequired: 5,
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
    label: 'LEVEL 2 - Inside the trashteroid',
    briefingTagline: "Breach the trashteroid's shell and destroy 6 of its 10 weak spots to weaken its core. Find them lodged in the tunnel walls.",
    timer: 180,
    interior: true,
    tunnelData: 'level2',
    bakedMeshUrl: '/models/level2_interior.glb',
    mission: {
      successTitle: 'CORE STRUCTURE COMPROMISED',
      successSubtitle: 'Trashteroid weakened. Final assault window open.',
      primary: {
        weakSpotsRequired: 6,
        weakSpotsTotal: 10,
      },
      bonus: {},
    },
    spawn: {
      maxActive: 0,
      bootstrapActive: 0,
      forwardSpawnMin: 1000,
      forwardSpawnMax: 1500,
      lateralSpread: 0,
      verticalRange: 0,
      minGap: 100,
      modelScale: 14,
      scaleMin: 1,
      scaleMax: 1,
      backwardDrift: 0,
      lateralDrift: 0,
      rotationSpeed: 0,
      progressPerSpawn: 99999,
      despawnDistance: 200,
      recycleBehindDistance: 100,
      points: 0,
    },
  },
  3: {
    label: 'LEVEL 3 - 10 km from the trashteroid',
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
        bonusTrashRequired: 100,
        bonusRecycleRequired: 20,
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

function _starsText(stars) {
  if (stars >= 3) return 'Three stars. Flawless.';
  if (stars === 2) return 'Two stars. Solid work.';
  return 'One star. Primary objective met.';
}

export const LEVEL_BRIEFINGS = {
  1: [
    { speaker: 'MISSION_CONTROL', text: "Pilot, this is Mission Control. You are now in Earth's outer debris field." },
    { speaker: 'PILOT', text: "Copy. I am reading a lot of contacts on scope." },
    { speaker: 'MISSION_CONTROL', text: "A century of garbage that humanity launched into orbit. All of it is still up here, and now it is falling back." },
    { speaker: 'MISSION_CONTROL', text: "Your mission: destroy 20 trash clusters and collect 9 recyclables before the two minute timer runs out." },
    { speaker: 'MISSION_CONTROL', text: "Use your vaporizer on trash. Use your recycling beam on the green canisters." },
    { speaker: 'PILOT', text: "Understood. Starting my run." },
  ],
  2: [
    { speaker: 'MISSION_CONTROL', text: "[PHASE 1 DEBUG] You are inside the trashteroid tunnel layout." },
    { speaker: 'MISSION_CONTROL', text: "Cyan lines mark tunnel centerlines. Wireframe spheres are chambers and junctions." },
    { speaker: 'MISSION_CONTROL', text: "Ten pulsing red spheres are the weak spots. Walls are not built yet — fly through and validate the topology." },
    { speaker: 'PILOT', text: "Copy. Just feeling out the layout." },
  ],
  3: [
    { speaker: 'MISSION_CONTROL', text: "Pilot. The Trashteroid is right in front of you." },
    { speaker: 'PILOT', text: "I see it. The thing is the size of a moon." },
    { speaker: 'MISSION_CONTROL', text: "It is shedding large debris chunks at high speed. Shoot them down or dodge them." },
    { speaker: 'MISSION_CONTROL', text: "Your mission: destroy the Trashteroid. Keep firing your vaporizer at it until it is gone. You have five minutes." },
    { speaker: 'PILOT', text: "Going in." },
  ],
};

export const LEVEL_DIALOGUES = {
  1: {
    success: (score, stars) => [
      { speaker: 'MISSION_CONTROL', text: "Pilot, Sector One is clear. Good work out there." },
      { speaker: 'PILOT', text: "It was close. That last wave came in fast." },
      { speaker: 'MISSION_CONTROL', text: `Score: ${score}. ${_starsText(stars)}` },
      { speaker: 'MISSION_CONTROL', text: "Long range scan is confirming the Trashteroid. It is much bigger than we expected." },
      { speaker: 'PILOT', text: "How much bigger?" },
      { speaker: 'MISSION_CONTROL', text: "Think less asteroid, more second moon. Get moving. Sector Two is next." },
    ],
    timeout: (score) => [
      { speaker: 'MISSION_CONTROL', text: "Pilot, the timer ran out. Sector One is not cleared." },
      { speaker: 'PILOT', text: "The debris kept regenerating faster than I could hit it." },
      { speaker: 'MISSION_CONTROL', text: `Score: ${score}. You need 20 trash and 9 recyclables in under two minutes.` },
      { speaker: 'MISSION_CONTROL', text: "Try focusing on the clusters directly in your path. Do not chase everything." },
      { speaker: 'PILOT', text: "Got it. Going again." },
    ],
  },
  2: {
    success: (score, stars) => [
      { speaker: 'MISSION_CONTROL', text: "You reached it. Pilot, you are right next to the Trashteroid." },
      { speaker: 'PILOT', text: "This thing is gigantic. I can see old satellites crushed into the surface." },
      { speaker: 'MISSION_CONTROL', text: `Score: ${score}. ${_starsText(stars)}` },
      { speaker: 'MISSION_CONTROL', text: "Our sensors found a weak point at the core. You need to hit it from close range." },
      { speaker: 'PILOT', text: "How do I get to it?" },
      { speaker: 'MISSION_CONTROL', text: "Fight through the debris around it. The core will be exposed. Keep firing." },
    ],
    timeout: (score) => [
      { speaker: 'MISSION_CONTROL', text: "Time is up. You did not reach the Trashteroid." },
      { speaker: 'PILOT', text: "The debris density was too high. I kept getting blocked." },
      { speaker: 'MISSION_CONTROL', text: `Score: ${score}. You need 40 trash, 15 recyclables, then close 1,500 km to the Trashteroid.` },
      { speaker: 'MISSION_CONTROL', text: "Clear the trash first, then push forward without stopping." },
      { speaker: 'PILOT', text: "Understood. Trying again." },
    ],
  },
  3: {
    success: (score, stars) => [
      { speaker: 'MISSION_CONTROL', text: "Pilot! We are reading a massive explosion on our scopes. Did you destroy it?" },
      { speaker: 'PILOT', text: "It is gone, Control. Nothing left." },
      { speaker: 'MISSION_CONTROL', text: `Score: ${score}. ${_starsText(stars)}` },
      { speaker: 'MISSION_CONTROL', text: "Earth orbit is clear. The Trashteroid is destroyed. You just saved everyone on the planet." },
      { speaker: 'PILOT', text: "Just doing the job." },
      { speaker: 'MISSION_CONTROL', text: "Come home, pilot. You earned it." },
    ],
    timeout: (score) => [
      { speaker: 'MISSION_CONTROL', text: "Pilot, the timer ran out. The Trashteroid is still intact." },
      { speaker: 'PILOT', text: "I could not break through the debris field in time." },
      { speaker: 'MISSION_CONTROL', text: `Score: ${score}. You need to destroy the Trashteroid itself. Keep firing at it.` },
      { speaker: 'MISSION_CONTROL', text: "Ignore the small debris if you can and focus all fire on the Trashteroid." },
      { speaker: 'PILOT', text: "Going back in." },
    ],
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
