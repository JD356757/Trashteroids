/**
 * Manages level configs and current level state.
 * Objective and boss behavior both key off this shared config.
 */

export const LEVEL_CONFIGS = {
  1: {
    label: 'LEVEL 1 - 25,000 km approach',
    briefingTagline: 'Complete the mandatory flight checkout, clear a safe corridor through the debris field, then push to the trashteroid breach and enter the tunnel system.',
    timer: 120,
    trashteroidStartDistanceDisplay: 25000,
    mission: {
      successTitle: 'BREACH WINDOW LOCKED',
      successSubtitle: 'Approach corridor secured. Tunnel insertion authorized.',
      primary: {
        tutorialRequired: true,
        tutorialLabel: 'Complete mandatory flight tutorial',
        trashRequired: 5,
        recycleRequired: 5,
        reachTrashteroid: true,
        reachDistanceDisplay: 250,
        reachLabel: 'Enter Trashteroid breach',
        reachedLabel: 'Entered Trashteroid breach',
        briefingReachLabel: 'Reach the Trashteroid and enter the breach',
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
      successSubtitle: 'Outer shell weakened. Final exterior strike window open.',
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
    label: 'LEVEL 3 - Exterior final assault',
    briefingTagline: 'The interior strike blasted you back outside and cracked the shell. The trashteroid is vulnerable now. Stay on the exterior, survive the debris storm, and destroy it before it can hit Earth.',
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
      startDistanceDisplay: 5000,
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
    { speaker: 'MISSION_CONTROL', text: "Pilot, you are entering Earth's outer debris field on final approach to the Trashteroid." },
    { speaker: 'MISSION_CONTROL', text: "Your flight checkout is mandatory. Once it is complete, destroy 5 trash clusters and collect 5 recyclables to clear a stable approach lane." },
    { speaker: 'MISSION_CONTROL', text: "When the corridor is open, burn straight for the breach window we found on the surface and enter the tunnel system." },
    { speaker: 'PILOT', text: "Copy. Finish the checkout, clear the lane, then punch into the Trashteroid." },
  ],
  2: [
    { speaker: 'MISSION_CONTROL', text: "We identified structural weaknesses in the Trashteroid's shell and guided you through a breach into its tunnel system." },
    { speaker: 'PILOT', text: "I am inside. Reading narrow chambers, branching routes, and debris fused into the walls." },
    { speaker: 'MISSION_CONTROL', text: "Ten weak spots are distributed through the network. Destroy at least five of them to make the outside more vulnerable." },
    { speaker: 'MISSION_CONTROL', text: "Stay centered on the tunnel line, keep your speed controlled, and do not let the walls pin you down." },
    { speaker: 'PILOT', text: "Understood. Hunting weak spots now." },
  ],
  3: [
    { speaker: 'MISSION_CONTROL', text: "The interior collapse blew you back outside, but it did exactly what we needed. The shell is breaking apart." },
    { speaker: 'PILOT', text: "I see the fractures. The whole surface is venting debris." },
    { speaker: 'MISSION_CONTROL', text: "The Trashteroid is finally vulnerable. Stay outside, keep pressure on the main body, and destroy it before impact. You have five minutes." },
    { speaker: 'PILOT', text: "Copy. Ending this now." },
  ],
};

export const LEVEL_DIALOGUES = {
  1: {
    success: (score, stars) => [
      { speaker: 'MISSION_CONTROL', text: "Pilot, the debris lane is clear and our breach scan just stabilized." },
      { speaker: 'PILOT', text: "I have the opening in sight." },
      { speaker: 'MISSION_CONTROL', text: `Score: ${score}. ${_starsText(stars)}` },
      { speaker: 'MISSION_CONTROL', text: "We found structural weak points beneath the shell. We are feeding you a route into the tunnel system now." },
      { speaker: 'PILOT', text: "Send it. I am going in." },
    ],
    timeout: (score) => [
      { speaker: 'MISSION_CONTROL', text: "Pilot, the lane never opened. You are still too far out to make the breach." },
      { speaker: 'PILOT', text: "Too much debris on the approach. I kept losing the corridor." },
      { speaker: 'MISSION_CONTROL', text: `Score: ${score}. Complete the tutorial, destroy 5 trash, collect 5 recyclables, then drive into the breach.` },
      { speaker: 'MISSION_CONTROL', text: "Finish the checkout quickly, clear the center lane, and push straight at the target." },
      { speaker: 'PILOT', text: "Copy. Resetting for another run." },
    ],
  },
  2: {
    success: (score, stars) => [
      { speaker: 'MISSION_CONTROL', text: "Those weak spots are gone. Outer shell stress is spiking all across the surface." },
      { speaker: 'PILOT', text: "The tunnels are venting. Something just threw me clear of the breach." },
      { speaker: 'MISSION_CONTROL', text: `Score: ${score}. ${_starsText(stars)}` },
      { speaker: 'MISSION_CONTROL', text: "Good. You are back outside, and the Trashteroid is finally exposed." },
      { speaker: 'PILOT', text: "Then this next pass is the kill shot." },
      { speaker: 'MISSION_CONTROL', text: "Exactly. Finish it." },
    ],
    timeout: (score) => [
      { speaker: 'MISSION_CONTROL', text: "Pilot, the weak point network is still holding." },
      { speaker: 'PILOT', text: "The tunnel layout kept forcing me off the line." },
      { speaker: 'MISSION_CONTROL', text: `Score: ${score}. You need to destroy 5 of the 10 weak spots inside the Trashteroid.` },
      { speaker: 'MISSION_CONTROL', text: "Stay centered in the tunnels, then make clean runs through the chambers." },
      { speaker: 'PILOT', text: "Copy. Going back inside." },
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
