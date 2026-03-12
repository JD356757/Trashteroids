import { Game } from './Game.js';
import { IntroScene } from './IntroScene.js';
import { LevelSelect } from './LevelSelect.js';

const overlay = document.getElementById('overlay');
const startBtn = document.getElementById('start-btn');
const canvas = document.getElementById('game-canvas');
const crosshair = document.getElementById('crosshair');
const hud = document.getElementById('hud');
const fpsCounter = document.getElementById('fps-counter');
const boostBar = document.getElementById('boost-bar-container');
const bossBar = document.getElementById('boss-bar-container');
const bossIndicator = document.getElementById('boss-indicator');
const minimap = document.getElementById('minimap');

let game = null;
const introScene = new IntroScene(canvas);

function setScreenMode(mode) {
  document.body.dataset.screen = mode;

  const inGame = mode === 'game';
  hud.classList.toggle('hidden', !inGame);
  fpsCounter.classList.toggle('hidden', !inGame);
  crosshair.classList.toggle('hidden', !inGame);

  if (!inGame) {
    boostBar.classList.add('hidden');
    bossBar.classList.add('hidden');
    bossIndicator.classList.add('hidden');
    minimap.classList.add('hidden');
  }
}

const levelSelect = new LevelSelect(canvas, (levelId) => {
  setScreenMode('game');
  canvas.requestPointerLock();
  game = new Game(canvas, levelId);
  game.start();
});

function showLevelSelect() {
  if (overlay.classList.contains('hidden')) return;
  introScene.hide();
  overlay.classList.add('hidden');
  setScreenMode('select');
  levelSelect.show();
}

startBtn.addEventListener('click', showLevelSelect);

window.addEventListener('keydown', (e) => {
  if (e.key === '9') {
    showLevelSelect();
  }
});

setScreenMode('intro');
introScene.show();
