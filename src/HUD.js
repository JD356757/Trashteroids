import * as THREE from 'three';

const _minimapVector = new THREE.Vector3();

export class HUD {
  constructor() {
    this.scoreEl = document.getElementById('hud-score');
    this.levelEl = document.getElementById('hud-level');
    this.livesEl = document.getElementById('hud-lives');
    this.fpsEl = document.getElementById('fps-counter');
    this.bossContainer = document.getElementById('boss-bar-container');
    this.bossFill = document.getElementById('boss-bar-fill');
    this.overlay = document.getElementById('overlay');
    this.bossIndicator = document.getElementById('boss-indicator');
    this.bossIndicatorDist = document.getElementById('boss-indicator-dist');
    this.minimap = document.getElementById('minimap');
    this.minimapCanvas = document.getElementById('minimap-canvas');
    this.boostBarContainer = document.getElementById('boost-bar-container');
    this.boostBarFill = document.getElementById('boost-bar-fill');
    this.boostBarLabel = document.getElementById('boost-bar-label');
    if (this.minimapCanvas) {
      this.minimapCtx = this.minimapCanvas.getContext('2d');
    }

    this._lastScore = null;
    this._lastLevel = null;
    this._lastLives = null;
    this._lastBossPct = null;
    this._lastBoostPct = null;
    this._lastBoostActive = null;
    this._lastBoostLabel = null;
    this._lastFps = null;
  }

  updateBossIndicator(visible, x, y, angle, distance) {
    if (!visible) {
      if (!this.bossIndicator.classList.contains('hidden')) {
        this.bossIndicator.classList.add('hidden');
      }
      return;
    }
    this.bossIndicator.classList.remove('hidden');
    this.bossIndicator.style.left = `${x}px`;
    this.bossIndicator.style.top = `${y}px`;
    this.bossIndicator.style.transform = `translate(-50%, -50%) rotate(${angle}rad)`;
    this.bossIndicatorDist.style.transform = `translateX(-50%) rotate(${-angle}rad)`;
    this.bossIndicatorDist.textContent = `${distance} mi`;
  }

  updateMinimap(visible, bossPos, playerPos, camInvQuat, asteroids) {
    if (!visible || !this.minimapCanvas) {
      if (!this.minimap.classList.contains('hidden')) {
        this.minimap.classList.add('hidden');
      }
      return;
    }

    this.minimap.classList.remove('hidden');

    const ctx = this.minimapCtx;
    ctx.clearRect(0, 0, 150, 150);

    const cx = 75;
    const cy = 75;
    const radius = 75;
    const maxRange = 2000;

    ctx.strokeStyle = 'rgba(162, 207, 254, 0.2)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx, 0);
    ctx.lineTo(cx, 150);
    ctx.moveTo(0, cy);
    ctx.lineTo(150, cy);
    ctx.stroke();

    if (asteroids && playerPos && camInvQuat) {
      ctx.fillStyle = '#b19bb3';
      for (let i = 0; i < asteroids.length; i++) {
        const ast = asteroids[i];
        _minimapVector.copy(ast.boundingSphere.center).sub(playerPos);

        if (_minimapVector.lengthSq() > maxRange * maxRange) continue;

        _minimapVector.applyQuaternion(camInvQuat);

        const dx = _minimapVector.x / maxRange;
        const dy = _minimapVector.z / maxRange;

        if (dx * dx + dy * dy <= 1) {
          const px = cx + dx * radius;
          const py = cy + dy * radius;
          const size = ast.boundingSphere.radius > 6 ? 2.5 : 1.2;
          ctx.beginPath();
          ctx.arc(px, py, size, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    if (bossPos && playerPos && camInvQuat) {
      _minimapVector.copy(bossPos).sub(playerPos);
      const bossDist = _minimapVector.length();
      _minimapVector.applyQuaternion(camInvQuat);
      _minimapVector.y = 0;
      _minimapVector.normalize();

      let bx;
      let by;
      if (bossDist < maxRange) {
        bx = cx + (_minimapVector.x * (bossDist / maxRange) * radius);
        by = cy + (_minimapVector.z * (bossDist / maxRange) * radius);
      } else {
        bx = cx + (_minimapVector.x * radius * 0.9);
        by = cy + (_minimapVector.z * radius * 0.9);
      }

      ctx.fillStyle = '#f44';
      ctx.shadowColor = '#f44';
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.arc(bx, by, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    }

    ctx.save();
    ctx.translate(cx, cy);
    ctx.fillStyle = 'rgba(109, 230, 127, 1)';
    ctx.shadowColor = 'rgba(0, 151, 33, 1)';
    ctx.shadowBlur = 5;
    ctx.beginPath();
    ctx.moveTo(0, -6);
    ctx.lineTo(4, 4);
    ctx.lineTo(-4, 4);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  update(score, level, lives) {
    if (score !== this._lastScore) {
      this.scoreEl.textContent = `SCORE: ${score}`;
      this._lastScore = score;
    }

    if (lives !== this._lastLives) {
      this.livesEl.textContent = `LIVES: ${'\u2665'.repeat(Math.max(0, lives))}`;
      this._lastLives = lives;
    }

    const labels = {
      1: 'LEVEL 1 - 15,000 mi',
      2: 'LEVEL 2 - 5,000 mi',
      3: 'LEVEL 3 - 1 mi [BOSS]',
    };

    if (level !== this._lastLevel) {
      this.levelEl.textContent = labels[level] || `LEVEL ${level}`;
      this._lastLevel = level;
    }
  }

  updateBossBar(health, maxHealth) {
    this.bossContainer.classList.remove('hidden');
    const pct = Math.max(0, (health / maxHealth) * 100);
    if (pct !== this._lastBossPct) {
      this.bossFill.style.width = `${pct}%`;
      this._lastBossPct = pct;
    }
  }

  updateBoostBar(charge, active) {
    if (!this.boostBarFill || !this.boostBarContainer) return;
    this.boostBarContainer.classList.remove('hidden');
    const pct = Math.max(0, Math.min(1, charge)) * 100;
    if (pct !== this._lastBoostPct) {
      this.boostBarFill.style.width = `${pct}%`;
      this._lastBoostPct = pct;
    }
    if (active !== this._lastBoostActive) {
      this.boostBarFill.classList.toggle('boosting', !!active);
      this._lastBoostActive = active;
    }
    if (this.boostBarLabel) {
      const label = active ? 'BOOST' : 'RECHARGE';
      if (label !== this._lastBoostLabel) {
        this.boostBarLabel.textContent = label;
        this._lastBoostLabel = label;
      }
    }
  }

  updateFps(fps) {
    if (!this.fpsEl) return;
    const rounded = Math.max(0, Math.round(fps));
    if (rounded === this._lastFps) return;
    this.fpsEl.textContent = `FPS: ${rounded}`;
    this._lastFps = rounded;
  }

  showMessage(text) {
    this.overlay.classList.remove('hidden');
    this.overlay.querySelector('h1').textContent = text;
    const subtitle = this.overlay.querySelector('.subtitle');
    if (subtitle) subtitle.textContent = '';
    const btn = this.overlay.querySelector('#start-btn');
    btn.textContent = 'PLAY AGAIN';
    btn.onclick = () => window.location.reload();
  }
}
