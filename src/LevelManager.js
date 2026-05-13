/**
 * Manages level configs and current level state.
 * Objective and boss behavior both key off this shared config.
 */

export const LEVEL_CONFIGS = {
  1: {
    label: 'LEVEL 1 - Approach the Trashteroid',
    briefingTagline: 'Complete the flight tutorial, clear a path through the debris field, and get to the trashteroid.',
    timer: 120,
    trashteroidStartDistanceDisplay: 62500,
    trashteroidScale: 40,
    mission: {
      successTitle: 'TRASHTEROID REACHED',
      successSubtitle: 'You successfully cleared out debris in your path and reached the Trashteroid.',
      primary: {
        tutorialRequired: true,
        tutorialLabel: 'Complete mandatory flight tutorial',
        trashRequired: 5,
        recycleRequired: 5,
        reachTrashteroid: true,
        reachDistanceDisplay: 5000,
        reachLabel: 'Reach the Trashteroid',
        reachedLabel: 'Reached the Trashteroid',
        briefingReachLabel: 'Get to the Trashteroid',
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
    briefingTagline: "Navigate the dark tunnels inside the trashteroid's core. Look for weak spots and destroy them. But if you spend too long inside, you won't survive...",
    timer: 180,
    interior: true,
    tunnelData: 'level2',
    bakedMeshUrl: '/models/level2_interior.glb',
    mission: {
      successTitle: 'TRASHTEROID STRUCTURE COMPROMISED',
      successSubtitle: 'You weakened the outer shell of the Trashteroid. Now destroy it from the outside, once and for all.',
      primary: {
        weakSpotsRequired: 6,
        weakSpotsTotal: 10,
      },
      bonus: {
        shieldThreshold: 90,
      },
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
    label: 'LEVEL 3 - Destroy the trashteroid',
    briefingTagline: "The interior destruction blasted you back into space but it weakened the trashteroid's outer shell. Survive the storm of debris flying out of it and destroy it before it can reach the earth.",
    timer: 300,
    mission: {
      successTitle: 'TRASHTEROID DESTROYED',
      successSubtitle: 'Threat neutralized. Good job, pilot.',
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

export const LEVEL_BRIEFINGS = {
  1: [
    { speaker: 'MISSION_CONTROL', text: "Pilot, you've just entered Earth orbit. The first thing you should do is complete your flight tutorial to get a feel for the ship's controls.", voiceover: '/voiceovers/level1mc1cut.mp3' },
    { speaker: 'MISSION_CONTROL', text: "Once you've done that, your real mission begins. Destroy 5 trash clusters and collect 5 recyclables. This will clear a path for you to get to the Trashteroid. Once you get there, we'll send you into its core to destroy it from the inside out.", voiceover: '/voiceovers/level1mc2cut.mp3' },
    { speaker: 'PILOT', text: "Roger that. Finish the tutorial, clear out the debris, and get to the Trashteroid.", voiceover: '/voiceovers/level1pilot1cut.mp3' },
  ],
  2: [
    { speaker: 'MISSION_CONTROL', text: "We identified structural weaknesses inside the Trashteroid's core. To destroy them, we've guided you inside the core, through a breach in the Trashteroid's surface.", voiceover: '/voiceovers/level2mc1cut.mp3' },
    { speaker: 'PILOT', text: "I am inside. Radar is showing narrow, branching tunnels, large chambers, and debris scattered all around.", voiceover: '/voiceovers/level2pilot1cut.mp3' },
    { speaker: 'MISSION_CONTROL', text: "Ten weak spots are distributed throughout the tunnels. They'll glow red once you get close. Destroy at least six of them to weaken the Trashteroid.", voiceover: '/voiceovers/level2mc2cut.mp3' },
    { speaker: 'MISSION_CONTROL', text: "Keep your speed under control and try to stay clear of the tunnel walls. We wouldn't want you crashing, now, would we...", voiceover: '/voiceovers/level2mc3cut.mp3' },
    { speaker: 'PILOT', text: "Understood. Going after the weak spots now.", voiceover: '/voiceovers/level2pilot2cut.mp3' },
  ],
  3: [
    { speaker: 'MISSION_CONTROL', text: "The interior collapse blew you back outside, but it did exactly what we needed. The Trashteroid's outer shell is breaking apart.", voiceover: '/voiceovers/level3mc1cut.mp3' },
    { speaker: 'PILOT', text: "I can see that. The whole surface has debris shooting out of it.", voiceover: '/voiceovers/level3pilot1cut.mp3' },
    { speaker: 'MISSION_CONTROL', text: "Perfect, that means the job's half done. We just need you to finish it off. Here's the plan: you have to --- [STATIC] --- so that --- [STATIC] --- blow --- [STATIC].", voiceover: '/voiceovers/level3mc2cut.mp3' },
    { speaker: 'PILOT', text: "Mission Control, you're cutting out. I think the interior explosion must have damaged my comms system.", voiceover: '/voiceovers/level3pilot2cut.mp3' },
    { speaker: 'MISSION_CONTROL', text: "[STATIC]", voiceover: '/voiceovers/static.mp3' },
    { speaker: 'PILOT', text: "I'm on my own. If I keep grinding at the Trashteroid with my Vaporizer beam, I should be able to blow it up.", voiceover: '/voiceovers/level3pilot3cut.mp3' },
  ],
};

// Played only on level failure (timeout / missed primary objective). Success
// skips straight to the next level's pre-level briefing — no debrief.
export const LEVEL_FAILURE_DIALOGUES = {
  1: () => [
    { speaker: 'MISSION_CONTROL', text: "Pilot, you ran out of time. The Trashteroid got too close to Earth." },
  ],
  2: () => [
    { speaker: 'MISSION_CONTROL', text: "Pilot, you didn't destroy enough weak spots. Get back in there and finish the job." },
  ],
  3: () => [
    { speaker: 'MISSION_CONTROL', text: "Pilot, you ran out of time. The Trashteroid got too close to Earth, and gravity is only speeding it up now. We can't stop it anymore." },
  ],
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
