import { Game } from './Game.js';
import { IntroScene } from './IntroScene.js';
import { LevelSelect } from './LevelSelect.js';

const overlay = document.getElementById('overlay');
const startBtn = document.getElementById('start-btn');
const canvas = document.getElementById('game-canvas');
const crosshair = document.getElementById('crosshair');

let game = null;
const introScene = new IntroScene(canvas);
introScene.show();

/* ── Level Select Screen ── */
const levelSelect = new LevelSelect(canvas, (levelId) => {
  // Player confirmed a level — launch the game
  crosshair.classList.remove('hidden');
  canvas.requestPointerLock();
  game = new Game(canvas, levelId);
  game.start();
});

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
