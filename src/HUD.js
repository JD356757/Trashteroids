export class HUD {
  constructor() {
    this.scoreEl = document.getElementById('hud-score');
    this.levelEl = document.getElementById('hud-level');
    this.livesEl = document.getElementById('hud-lives');
    this.bossContainer = document.getElementById('boss-bar-container');
    this.bossFill = document.getElementById('boss-bar-fill');
    this.overlay = document.getElementById('overlay');
    this.bossIndicator = document.getElementById('boss-indicator');
    this.bossIndicatorArrow = document.getElementById('boss-indicator-arrow');
    this.bossIndicatorDist = document.getElementById('boss-indicator-dist');
  }

  updateBossIndicator(visible, angle, distance) {
    if (!visible) {
      if (!this.bossIndicator.classList.contains('hidden')) {
        this.bossIndicator.classList.add('hidden');
      }
      return;
    }
    this.bossIndicator.classList.remove('hidden');
    this.bossIndicator.style.transform = `translate(-50%, -50%) rotate(${angle}rad) translateY(-200px)`;
    this.bossIndicatorDist.style.transform = `translateX(-50%) rotate(${-angle}rad)`;
    this.bossIndicatorDist.textContent = `${distance} mi`;
  }

  update(score, level, lives) {
    this.scoreEl.textContent = `SCORE: ${score}`;
    this.livesEl.textContent = 'LIVES: ' + '♥'.repeat(Math.max(0, lives));

    const labels = {
      1: 'LEVEL 1 — 15,000 mi',
      2: 'LEVEL 2 — 5,000 mi',
      3: 'LEVEL 3 — 1 mi  [BOSS]',
    };
    this.levelEl.textContent = labels[level] || `LEVEL ${level}`;
  }

  updateBossBar(health, maxHealth) {
    this.bossContainer.classList.remove('hidden');
    const pct = Math.max(0, (health / maxHealth) * 100);
    this.bossFill.style.width = `${pct}%`;
  }

  showMessage(text) {
    this.overlay.classList.remove('hidden');
    this.overlay.querySelector('h1').textContent = text;
    this.overlay.querySelector('.subtitle').textContent = '';
    const btn = this.overlay.querySelector('#start-btn');
    btn.textContent = 'PLAY AGAIN';
    btn.onclick = () => window.location.reload();
  }
}
