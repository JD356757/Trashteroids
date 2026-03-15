import * as THREE from 'three';

export class HUD {
  constructor() {
    this.scoreEl = document.getElementById('hud-score');
    this.levelEl = document.getElementById('hud-level');
    this.livesEl = document.getElementById('hud-lives');
    this.hullFill = document.getElementById('hull-bar-fill');
    this.hullPercent = document.getElementById('hull-percent');
    this.bossContainer = document.getElementById('boss-bar-container');
    this.bossFill = document.getElementById('boss-bar-fill');
    this.overlay = document.getElementById('overlay');
    this.bossIndicator = document.getElementById('boss-indicator');
    this.bossIndicatorArrow = document.getElementById('boss-indicator-arrow');
    this.bossIndicatorDist = document.getElementById('boss-indicator-dist');
    this.minimap = document.getElementById('minimap');
    this.minimapCanvas = document.getElementById('minimap-canvas');
    this.boostBarContainer = document.getElementById('boost-bar-container');
    this.boostBarFill = document.getElementById('boost-bar-fill');
    this.boostBarLabel = document.getElementById('boost-bar-label');
    this.speedometerValue = document.getElementById('speedometer-value');
    this.pauseScreen = document.getElementById('pause-screen');
    this.pauseAccuracyValue = document.getElementById('pause-accuracy-value');
    this.pauseAccuracyDetail = document.getElementById('pause-accuracy-detail');
    this.pauseSpeedValue = document.getElementById('pause-speed-value');
    this.pauseSpeedDetail = document.getElementById('pause-speed-detail');
    this.pauseSensitivityInput = document.getElementById('pause-sensitivity');
    this.pauseSensitivityValue = document.getElementById('pause-sensitivity-value');
    this.pauseResumeBtn = document.getElementById('pause-resume-btn');
    this.pauseRestartBtn = document.getElementById('pause-restart-btn');
    this.levelTimerEl = document.getElementById('level-timer');
    this.objectivesPanel = document.getElementById('objectives-panel');
    this.objectivesList = document.getElementById('objectives-list');
    this.tutorialCallout = document.getElementById('tutorial-callout');
    this.tutorialCalloutTitle = document.getElementById('tutorial-callout-title');
    this.tutorialCalloutText = document.getElementById('tutorial-callout-text');
    if (this.minimapCanvas) {
      this.minimapCtx = this.minimapCanvas.getContext('2d');
    }
    this.damageVignette = document.getElementById('damage-vignette');
    this._lowHealth = false;
    this._flashTimer = null;
    this._fadeTimer = null;
    this._speedSamples = [];
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

    ctx.strokeStyle = 'rgba(181, 232, 255, 0.16)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx, 0);
    ctx.lineTo(cx, 150);
    ctx.moveTo(0, cy);
    ctx.lineTo(150, cy);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.14)';
    ctx.beginPath();
    ctx.arc(cx, cy, radius * 0.55, 0, Math.PI * 2);
    ctx.stroke();

    const offset = new THREE.Vector3();

    if (asteroids && playerPos && camInvQuat) {
      ctx.fillStyle = '#dbc8f4';
      for (let i = 0; i < asteroids.length; i++) {
        const ast = asteroids[i];
        offset.copy(ast.boundingSphere.center).sub(playerPos);

        if (offset.lengthSq() > maxRange * maxRange) continue;

        offset.applyQuaternion(camInvQuat);

        const dx = offset.x / maxRange;
        const dy = offset.z / maxRange;

        if (dx * dx + dy * dy <= 1) {
          const px = cx + dx * radius;
          const py = cy + dy * radius;
          const size = ast.boundingSphere.radius > 6 ? 2.4 : 1.25;
          ctx.beginPath();
          ctx.arc(px, py, size, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    if (bossPos && playerPos && camInvQuat) {
      offset.copy(bossPos).sub(playerPos);
      const bossDist = offset.length();
      offset.applyQuaternion(camInvQuat);
      offset.y = 0;
      offset.normalize();

      let bx;
      let by;
      if (bossDist < maxRange) {
        bx = cx + (offset.x * (bossDist / maxRange) * radius);
        by = cy + (offset.z * (bossDist / maxRange) * radius);
      } else {
        bx = cx + (offset.x * radius * 0.9);
        by = cy + (offset.z * radius * 0.9);
      }

      ctx.fillStyle = '#ff8ea4';
      ctx.shadowColor = '#ff8ea4';
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.arc(bx, by, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    }

    ctx.save();
    ctx.translate(cx, cy);
    ctx.fillStyle = '#8ff7ef';
    ctx.shadowColor = '#8ff7ef';
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.moveTo(0, -7);
    ctx.lineTo(4.5, 5);
    ctx.lineTo(-4.5, 5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  update(score, level, lives) {
    this.scoreEl.textContent = `SCORE ${Math.max(0, Math.floor(score)).toString().padStart(6, '0')}`;
    // update hull progress bar and percent
    const pct = Math.max(0, Math.min(100, Math.round(lives)));
    if (this.hullFill) this.hullFill.style.width = `${pct}%`;
    if (this.hullPercent) this.hullPercent.textContent = `${pct}%`;

    // Level label
    const labels = {
      1: 'SECTOR 01 / 15,000 MI',
      2: 'SECTOR 02 / 5,000 MI',
      3: 'SECTOR 03 / BOSS VEIL',
    };
    this.levelEl.textContent = labels[level] || `SECTOR ${level}`;

    // also update low-health state if needed
    if (this.damageVignette) {
      const low = pct <= 20;
      if (low !== this._lowHealth) this.setLowHealth(low);
    }
  }

  flashDamage(amount = 1) {
    if (!this.damageVignette) return;
    // clear any existing fade timers so repeated hits stack correctly
    if (this._fadeTimer) {
      clearTimeout(this._fadeTimer);
      this._fadeTimer = null;
    }

    const el = this.damageVignette;
    const lowOpacity = this._lowHealth ? 0.28 : 0;
    const flashOpacity = Math.min(0.95, 0.4 + Math.min(amount, 4) * 0.15);

    // Immediately show at full flash opacity (no CSS transition)
    el.style.transition = 'none';
    el.style.opacity = `${flashOpacity}`;
    // force reflow so the immediate style takes effect
    // eslint-disable-next-line no-unused-expressions
    el.offsetWidth;

    // then schedule a slow fade back down to the lowOpacity
    // use a CSS transition only for the fade-out controlled here
    el.style.transition = 'opacity 900ms cubic-bezier(.22,.9,.3,1)';
    // small timeout to ensure transition is applied
    setTimeout(() => {
      el.style.opacity = `${lowOpacity}`;
    }, 20);

    // clear transition after fade completes to keep future flashes instant
    this._fadeTimer = setTimeout(() => {
      el.style.transition = '';
      // if low health is enabled, keep the lowOpacity; otherwise ensure fully hidden
      el.style.opacity = `${lowOpacity}`;
      this._fadeTimer = null;
    }, 950);
  }

  setLowHealth(enabled) {
    if (!this.damageVignette) return;
    this._lowHealth = !!enabled;
    this.damageVignette.classList.toggle('low', !!enabled);
    // Cancel any ongoing fade so low-health state appears immediately
    if (this._fadeTimer) {
      clearTimeout(this._fadeTimer);
      this._fadeTimer = null;
    }
    // Apply low-health opacity immediately (no transition)
    const el = this.damageVignette;
    el.style.transition = 'none';
    el.style.opacity = enabled ? '0.28' : '0';
    // ensure the style takes effect
    // eslint-disable-next-line no-unused-expressions
    el.offsetWidth;
    // clear inline transition so future flashes can set their own
    el.style.transition = '';
  }

  updateBossBar(health, maxHealth) {
    this.bossContainer.classList.remove('hidden');
    const pct = Math.max(0, (health / maxHealth) * 100);
    this.bossFill.style.width = `${pct}%`;
  }

  updateSpeedometer(speed) {
    if (!this.speedometerValue) return;
    this._speedSamples.push(speed);
    if (this._speedSamples.length > 5) this._speedSamples.shift();
    const avg = this._speedSamples.reduce((s, v) => s + v, 0) / this._speedSamples.length;
    this.speedometerValue.textContent = String(Math.round(avg * 0.45)).padStart(3, '0');
  }

  updateTimer(secondsLeft) {
    if (!this.levelTimerEl) return;
    if (secondsLeft < 0) secondsLeft = 0;
    this.levelTimerEl.classList.remove('hidden');
    const m = Math.floor(secondsLeft / 60);
    const s = Math.floor(secondsLeft % 60);
    this.levelTimerEl.textContent = `${m}:${String(s).padStart(2, '0')}`;
    this.levelTimerEl.classList.toggle('urgent', secondsLeft <= 30);
  }

  hideTimer() {
    if (this.levelTimerEl) this.levelTimerEl.classList.add('hidden');
  }

  // objectives: array of { label, current, target, complete, bonus }
  updateObjectives(objectives) {
    if (!this.objectivesPanel || !this.objectivesList) return;
    this.objectivesPanel.classList.remove('hidden');
    this.objectivesList.innerHTML = '';
    for (const obj of objectives) {
      const li = document.createElement('li');
      if (obj.bonus) li.classList.add('bonus');
      if (obj.complete) li.classList.add('complete');
      if (obj.failed) li.classList.add('failed');

      const check = document.createElement('span');
      check.className = 'obj-check';
      check.textContent = obj.complete ? '✓' : (obj.failed ? '✗' : (obj.bonus ? '◇' : '○'));

      const text = document.createElement('span');
      const progress = obj.target > 1 ? ` (${Math.min(obj.current, obj.target)}/${obj.target})` : '';
      text.textContent = obj.label + progress;

      li.appendChild(check);
      li.appendChild(text);
      this.objectivesList.appendChild(li);
    }
  }

  updateBoostBar(charge, active) {
    if (!this.boostBarFill || !this.boostBarContainer) return;
    this.boostBarContainer.classList.remove('hidden');
    const pct = Math.max(0, Math.min(1, charge)) * 100;
    this.boostBarFill.style.width = `${pct}%`;
    this.boostBarFill.classList.toggle('boosting', !!active);
    if (this.boostBarLabel) {
      this.boostBarLabel.textContent = 'BOOST';
    }
  }

  showTutorialCallout(title, text, options = {}) {
    if (!this.tutorialCallout || !this.tutorialCalloutTitle || !this.tutorialCalloutText) return;
    const placement = options.placement ?? 'center';
    this.tutorialCalloutTitle.textContent = title;
    this.tutorialCalloutText.textContent = text;
    this.tutorialCallout.dataset.placement = placement;
    this.tutorialCallout.classList.remove('hidden');
  }

  hideTutorialCallout() {
    if (!this.tutorialCallout) return;
    this.tutorialCallout.classList.add('hidden');
    delete this.tutorialCallout.dataset.placement;
  }

  setPauseVisible(visible) {
    if (!this.pauseScreen) return;
    this.pauseScreen.classList.toggle('hidden', !visible);
    this.pauseScreen.setAttribute('aria-hidden', visible ? 'false' : 'true');
  }

  updatePauseStats(shotsFired, trashHits, averageSpeed) {
    if (!this.pauseAccuracyValue || !this.pauseAccuracyDetail) return;
    const percent = shotsFired > 0 ? Math.round(((trashHits / shotsFired) * 100) * 4) : 0;
    this.pauseAccuracyValue.textContent = `${percent.toFixed(shotsFired > 0 ? 1 : 0)}%`;
    this.pauseAccuracyDetail.textContent = `${trashHits} trash hits / ${shotsFired} shots`;
    if (this.pauseSpeedValue && this.pauseSpeedDetail) {
      this.pauseSpeedValue.textContent = `${Math.round(averageSpeed)}`;
      this.pauseSpeedDetail.textContent = `${Math.round(averageSpeed)} units/s average`;
    }
  }

  setPauseSensitivity(rawSensitivity) {
    if (!this.pauseSensitivityInput || !this.pauseSensitivityValue) return;
    const displayValue = Math.round(rawSensitivity * 1000);
    this.pauseSensitivityInput.value = `${displayValue}`;
    this.pauseSensitivityValue.textContent = `${displayValue}`;
  }

  showMessage(text) {
    this.setPauseVisible(false);
    this.overlay.classList.remove('hidden');
    this.overlay.querySelector('h1').textContent = text;
    const btn = this.overlay.querySelector('#start-btn');
    btn.textContent = 'PLAY AGAIN';
    btn.onclick = () => window.location.reload();
  }
}
