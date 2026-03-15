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
      requestAnimationFrame(() => {
        screenFade.classList.remove('visible');
      });
      window.setTimeout(() => {
        screenFade.classList.add('hidden');
        resolve();
      }, SCREEN_FADE_MS);
    }, SCREEN_FADE_MS);
  });
}

function launchGame({ levelId, tutorialMode }) {
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
        levelSelect.show();
      });
    },
  });
  game.start();
}

/* ── Level Select Screen ── */
const levelSelect = new LevelSelect(canvas, launchGame);

function showLevelSelect() {
  if (overlay.classList.contains('hidden')) return;
  introScene.hide();
  overlay.classList.add('hidden');
  levelSelect.show();
}

startBtn.addEventListener('click', showLevelSelect);

// Allow pressing 9 to skip cutscene / overlay straight to level select
window.addEventListener('keydown', (e) => {
  if (e.key === '9') {
    showLevelSelect();
  }
});
