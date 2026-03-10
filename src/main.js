import { Game } from './Game.js';

const overlay = document.getElementById('overlay');
const startBtn = document.getElementById('start-btn');
const canvas = document.getElementById('game-canvas');
const crosshair = document.getElementById('crosshair');

const game = new Game(canvas);

function startGame() {
  if (overlay.classList.contains('hidden')) return;
  overlay.classList.add('hidden');
  crosshair.classList.remove('hidden');
  // Request pointer lock so mouse controls the ship
  canvas.requestPointerLock();
  game.start();
}

startBtn.addEventListener('click', startGame);

// Allow pressing 9 to skip cutscene / overlay
window.addEventListener('keydown', (e) => {
  if (e.key === '9') {
    startGame();
  }
});
