import { Game } from './Game.js';
import { IntroScene } from './IntroScene.js';
import { LevelSelect } from './LevelSelect.js';
import { soundtrackManager } from './AudioManager.js';

const overlay = document.getElementById('overlay');
const startBtn = document.getElementById('start-btn');
const canvas = document.getElementById('game-canvas');
const crosshair = document.getElementById('crosshair');
const screenFade = document.getElementById('screen-fade');
const SCREEN_FADE_MS = 420;

let game = null;
const introScene = new IntroScene(canvas);
introScene.show();

/* ── Shared renderer for LevelSelect (same WebGL context as IntroScene) ── */
const levelSelect = new LevelSelect(canvas, launchGame, introScene.renderer, introScene);

const unlockSoundtrack = () => {
  soundtrackManager.start();
};
window.addEventListener('pointerdown', unlockSoundtrack, { once: true });
window.addEventListener('keydown', unlockSoundtrack, { once: true });

function runScreenFade(midpoint) {
  if (!screenFade) {
    midpoint?.();
    return Promise.resolve();
  }

  screenFade.classList.remove('hidden');
  // Force layout so the transition always starts from opacity 0.
  // eslint-disable-next-line no-unused-expressions
  screenFade.offsetWidth;

  requestAnimationFrame(() => {
    screenFade.classList.add('visible');
  });

  return new Promise((resolve) => {
    window.setTimeout(() => {
      midpoint?.();
      // Double-RAF: ensure the new scene has painted at least one frame before
      // starting the fade-out, preventing a content pop mid-transition.
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          screenFade.classList.remove('visible');
          // Use transitionend so 'hidden' is never added before the fade completes.
          const onDone = () => {
            screenFade.classList.add('hidden');
            resolve();
          };
          screenFade.addEventListener('transitionend', onDone, { once: true });
          // Safety fallback in case transitionend doesn't fire (e.g. tab hidden).
          window.setTimeout(onDone, SCREEN_FADE_MS + 100);
        });
      });
    }, SCREEN_FADE_MS);
  });
}

function launchGame({ levelId, tutorialMode }) {
  soundtrackManager.start();
  introScene.hide();
  levelSelect.hide();
  crosshair.classList.remove('hidden');
  canvas.requestPointerLock();
  game?.dispose?.();
  game = new Game(canvas, levelId, {
    tutorialMode,
    onReturnToLevelSelect: () => {
      runScreenFade(() => {
        game?.dispose?.();
        game = null;
        if (document.pointerLockElement) {
          document.exitPointerLock();
        }
        crosshair.classList.add('hidden');
        overlay.classList.add('hidden');
        introScene.showBackground();
        levelSelect.show();
      });
    },
  });
  game.start();
}

function showCrawl(onComplete) {
  const crawl = document.getElementById('mission-crawl');
  const stageEl = document.getElementById('crawl-stage');
  const textEl = document.getElementById('crawl-text');
  const continueBtn = document.getElementById('crawl-continue');
  if (!crawl || !textEl) { onComplete(); return; }

  const CRAWL_TEXT = 
    'THE YEAR IS 2162.\n\n' +
    'FOR OVER A CENTURY, HUMANITY CELEBRATED\n' +
    'THE "GREAT CLEANSING"—\n' +
    'A REVOLUTIONARY WASTE DISPOSAL PROGRAM\n' +
    'THAT LAUNCHED EARTH\'S GARBAGE\n' +
    'INTO ORBIT VIA MASSIVE RAIL CANNONS.\n\n' +
    'CITIES GLEAMED.\n' +
    'OCEANS CLEARED.\n' +
    'WE THOUGHT WE SOLVED THE TRASH PROBLEM FOREVER.\n\n' +
    'WE WERE CATASTROPHICALLY WRONG.\n\n' +
    'TWO WEEKS AGO, THE INTERNATIONAL SPACY AGENCY DETECTED\n' +
    'A MOON-SIZED ANOMALY HURTLING TOWARD EARTH:\n' +
    'THE TRASHTEROID.\n\n' +
    'A COLOSSAL BODY OF COMPRESSED WASTE,\n' +
    'A VIOLENT PROJECTILE BORN FROM OUR OWN FILTH.\n\n' +
    'ESTIMATED IMPACT: 13 DAYS.\n\n' +
    'THE RESULTING EXTINCTION-LEVEL EVENT\n' +
    'WILL POISON THE ATMOSPHERE AND RENDER\n' +
    'OUR HOME UNINHABITABLE FOR CENTURIES.\n\n' +
    'IN AN UNPRECEDENTED EMERGENCY RESPONSE,\n' +
    'THE INTERNATIONAL SPACE AGENCY HAS SENT\n' +
    'YOU INTO EARTH ORBIT WITH\n' +
    'TWO TOOLS: A TRASH VAPORIZER.\n' +
    'AND A RECYCLING BEAM.\n\n' +
    'YOUR MISSION:\n\n' +
    'OBLITERATE THE TRASHTEROID.\n' +
    'SAVE THE EARTH...';

  crawl.classList.remove('hidden');
  crawl.setAttribute('aria-hidden', 'false');
  textEl.textContent = '';
  if (stageEl) stageEl.scrollTop = 0;
  if (continueBtn) continueBtn.classList.add('hidden');

  let done = false;
  let i = 0;
  let timeout = null;
  let smoothScrollRaf = null;
  let smoothScrollTarget = 0;
  let smoothScrollCurrent = stageEl ? stageEl.scrollTop : 0;

  const stopSmoothScroll = () => {
    if (!smoothScrollRaf) return;
    cancelAnimationFrame(smoothScrollRaf);
    smoothScrollRaf = null;
  };

  const runSmoothScroll = () => {
    if (!stageEl) {
      smoothScrollRaf = null;
      return;
    }
    const maxScroll = Math.max(stageEl.scrollHeight - stageEl.clientHeight, 0);
    smoothScrollTarget = Math.min(smoothScrollTarget, maxScroll);
    smoothScrollCurrent += (smoothScrollTarget - smoothScrollCurrent) * 0.18;

    if (Math.abs(smoothScrollTarget - smoothScrollCurrent) < 0.35) {
      smoothScrollCurrent = smoothScrollTarget;
    }

    stageEl.scrollTop = smoothScrollCurrent;

    if (Math.abs(smoothScrollTarget - smoothScrollCurrent) < 0.35) {
      smoothScrollRaf = null;
      return;
    }

    smoothScrollRaf = requestAnimationFrame(runSmoothScroll);
  };

  const queueScrollToBottom = () => {
    if (!stageEl) return;
    smoothScrollTarget = Math.max(stageEl.scrollHeight - stageEl.clientHeight, 0);
    if (smoothScrollRaf) return;
    smoothScrollCurrent = stageEl.scrollTop;
    smoothScrollRaf = requestAnimationFrame(runSmoothScroll);
  };

  const finish = () => {
    if (done) return;
    done = true;
    if (timeout) clearTimeout(timeout);
    stopSmoothScroll();
    window.removeEventListener('keydown', keySkip);
    if (continueBtn) continueBtn.removeEventListener('click', finish);
    crawl.classList.add('hidden');
    crawl.setAttribute('aria-hidden', 'true');
    if (continueBtn) continueBtn.classList.add('hidden');
    onComplete();
  };

  const type = () => {
    if (i >= CRAWL_TEXT.length) {
      if (continueBtn) {
        continueBtn.classList.remove('hidden');
        continueBtn.addEventListener('click', finish, { once: true });
      }
      return;
    }
    const ch = CRAWL_TEXT[i++];
    textEl.textContent += ch;
    queueScrollToBottom();
    const delay = ch === '.' ? 620
                : (ch === '!' || ch === '?') ? 560
                : ch === ',' ? 170
                : ch === '\n' ? 240
                : 44;
    timeout = setTimeout(type, delay);
  };

  const keySkip = () => finish();
  window.addEventListener('keydown', keySkip);
  type();
}

function showLevelSelect() {
  if (overlay.classList.contains('hidden')) return;
  soundtrackManager.start();
  overlay.classList.add('hidden');
  runScreenFade(() => {
    introScene.showBackground();
    if (document.pointerLockElement) document.exitPointerLock();
    if (crosshair) crosshair.classList.add('hidden');
    levelSelect.show();
  });
}

startBtn.addEventListener('click', () => {
  soundtrackManager.start();
  overlay.classList.add('hidden');
  showCrawl(() => {
    runScreenFade(() => {
      introScene.showBackground();
      if (document.pointerLockElement) document.exitPointerLock();
      if (crosshair) crosshair.classList.add('hidden');
      levelSelect.show();
    });
  });
});

// Allow pressing 9 to skip cutscene / overlay straight to level select
window.addEventListener('keydown', (e) => {
  if (e.key === '9') {
    soundtrackManager.start();
    showLevelSelect();
  }
});
