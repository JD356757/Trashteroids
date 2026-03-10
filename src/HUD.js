import * as THREE from 'three';

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
    this.minimap = document.getElementById('minimap');
    this.minimapCanvas = document.getElementById('minimap-canvas');
    if (this.minimapCanvas) {
      this.minimapCtx = this.minimapCanvas.getContext('2d');
    }
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
    const maxRange = 600; // units
    
    // Draw crosshair helper lines
    ctx.strokeStyle = 'rgba(0, 255, 255, 0.15)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx, 0); ctx.lineTo(cx, 150);
    ctx.moveTo(0, cy); ctx.lineTo(150, cy);
    ctx.stroke();

    const _v = new THREE.Vector3();

    // Draw Asteroids
    if (asteroids && playerPos && camInvQuat) {
      ctx.fillStyle = 'rgba(200, 255, 255, 0.6)';
      for (let i = 0; i < asteroids.length; i++) {
        const ast = asteroids[i];
        _v.copy(ast.boundingSphere.center).sub(playerPos);
        
        if (_v.lengthSq() > maxRange * maxRange) continue;
        
        _v.applyQuaternion(camInvQuat);
        
        const dx = _v.x / maxRange;
        const dy = _v.z / maxRange; // +z is backward, so +dy is down on minimap
        
        if (dx*dx + dy*dy <= 1) {
          const px = cx + dx * radius;
          const py = cy + dy * radius;
          
          let size = ast.boundingSphere.radius > 6 ? 2.5 : 1.2;
          ctx.beginPath();
          ctx.arc(px, py, size, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    // Draw Boss
    if (bossPos && playerPos && camInvQuat) {
      _v.copy(bossPos).sub(playerPos);
      const bossDist = _v.length();
      _v.applyQuaternion(camInvQuat);
      _v.y = 0; // Project to XZ plane
      _v.normalize(); // Boss is always shown on the edge if outside range, or clamped
      
      // Calculate minimap position
      let bx, by;
      if (bossDist < maxRange) {
        bx = cx + (_v.x * (bossDist / maxRange) * radius);
        by = cy + (_v.z * (bossDist / maxRange) * radius);
      } else {
        bx = cx + (_v.x * radius * 0.9);
        by = cy + (_v.z * radius * 0.9);
      }
      
      ctx.fillStyle = '#f44';
      ctx.shadowColor = '#f44';
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.arc(bx, by, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    }

    // Draw Player (cyan arrowhead)
    ctx.save();
    ctx.translate(cx, cy);
    ctx.fillStyle = '#0ff';
    ctx.shadowColor = '#0ff';
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
