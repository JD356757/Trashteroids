import { Game } from './Game.js';
import { IntroScene } from './IntroScene.js';
import { LevelSelect } from './LevelSelect.js';

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

function showLevelSelect() {
  if (overlay.classList.contains('hidden')) return;
  runScreenFade(() => {
    overlay.classList.add('hidden');
    introScene.showBackground();
    if (document.pointerLockElement) document.exitPointerLock();
    if (crosshair) crosshair.classList.add('hidden');
    levelSelect.show();
  });
}

startBtn.addEventListener('click', showLevelSelect);

// Allow pressing 9 to skip cutscene / overlay straight to level select
window.addEventListener('keydown', (e) => {
  if (e.key === '9') {
    showLevelSelect();
  }
});
