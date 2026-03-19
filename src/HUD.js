import * as THREE from 'three';

export class HUD {
  constructor() {
    this.hudRoot = document.getElementById('hud');
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
    this.pauseSensitivityInput = document.getElementById('pause-sensitivity');
    this.pauseSensitivityValue = document.getElementById('pause-sensitivity-value');
    this.pauseResumeBtn = document.getElementById('pause-resume-btn');
    this.pauseRestartBtn = document.getElementById('pause-restart-btn');
    this.levelTimerEl = document.getElementById('level-timer');
    this.objectivesPanel = document.getElementById('objectives-panel');
    this.objectivesList = document.getElementById('objectives-list');
    this.objectivesRequiredList = document.getElementById('objectives-required-list');
    this.objectivesOptionalTitle = document.getElementById('objectives-optional-title');
    this.objectivesOptionalList = document.getElementById('objectives-optional-list');
    this.tutorialCallout = document.getElementById('tutorial-callout');
    this.tutorialCalloutTitle = document.getElementById('tutorial-callout-title');
    this.tutorialCalloutText = document.getElementById('tutorial-callout-text');
    this.tutorialCalloutRequirements = document.getElementById('tutorial-callout-requirements');
    this.tutorialCalloutTimer = document.getElementById('tutorial-callout-timer');
    this.tutorialCalloutTimerProgress = document.getElementById('tutorial-callout-timer-progress');
    this.tutorialCalloutTimerTrack = document.getElementById('tutorial-callout-timer-track');
    this.musicVisualizer = document.getElementById('music-visualizer');
    this.musicVisualizerBars = this.musicVisualizer
      ? Array.from(this.musicVisualizer.querySelectorAll('.visualizer-bar'))
      : [];
    if (this.minimapCanvas) {
      this.minimapCtx = this.minimapCanvas.getContext('2d');
    }
    this.damageVignette = document.getElementById('damage-vignette');
    this.trashteroidRangeAlertEl = document.createElement('div');
    this.trashteroidRangeAlertEl.id = 'trashteroid-range-alert';
    this.trashteroidRangeAlertEl.classList.add('hidden');
    this.trashteroidRangeAlertEl.setAttribute('aria-live', 'polite');
    this.trashteroidRangeAlertEl.textContent = 'TRASHTEROID OUT OF RANGE, MOVE CLOSER.';
    this.bossVulnerabilityEl = document.createElement('div');
    this.bossVulnerabilityEl.id = 'boss-vulnerability-status';
    this.bossVulnerabilityEl.classList.add('hidden');
    this.bossVulnerabilityEl.setAttribute('aria-live', 'polite');
    this.bossVulnerabilityEl.textContent = 'SHIELDED - 30S';
    if (this.hudRoot) {
      this.hudRoot.appendChild(this.trashteroidRangeAlertEl);
      this.hudRoot.appendChild(this.bossVulnerabilityEl);
    }
    this._lowHealth = false;
    this._speedSamples = [];
    this._tutorialCalloutHideTimer = null;
    this._tutorialCalloutAnimationFrame = null;
    this._tutorialCalloutRouteTimer = null;
    this._reducedMotion = false;
    this._reducedFlashing = false;
    this._musicVisualizerEnabled = false;
    this._musicVisualizerPhase = 0;
    this._musicVisualizerEnergy = 0;
    this._gameplayVisible = false;
  }

  setAccessibilitySettings(settings = {}) {
    this._reducedMotion = !!settings.reducedMotion;
    this._reducedFlashing = !!settings.reducedFlashing;
    this._musicVisualizerEnabled = !!settings.musicVisualizer;

    this._setMusicVisualizerVisible(this._gameplayVisible && this._musicVisualizerEnabled);

    if (this._reducedFlashing && this.damageVignette) {
      this.damageVignette.classList.remove('flashing', 'pulsing');
    }
  }

  setGameplayVisible(visible) {
    this._gameplayVisible = !!visible;

    if (this.hudRoot) {
      this.hudRoot.classList.toggle('hidden', !visible);
    }

    this._setMusicVisualizerVisible(this._gameplayVisible && this._musicVisualizerEnabled);

    if (visible) return;

    this.clearDamageIndicators();

    if (this.levelTimerEl) this.levelTimerEl.classList.add('hidden');
    if (this.objectivesPanel) this.objectivesPanel.classList.add('hidden');
    if (this.boostBarContainer) this.boostBarContainer.classList.add('hidden');
    if (this.bossContainer) this.bossContainer.classList.add('hidden');
    if (this.minimap) this.minimap.classList.add('hidden');
    if (this.bossIndicator) this.bossIndicator.classList.add('hidden');
    if (this.trashteroidRangeAlertEl) this.trashteroidRangeAlertEl.classList.add('hidden');
    if (this.bossVulnerabilityEl) this.bossVulnerabilityEl.classList.add('hidden');
    if (this.tutorialCallout) this.tutorialCallout.classList.add('hidden');
  }

  setTrashteroidRangeAlert(visible = false, message = 'TRASHTEROID OUT OF RANGE, MOVE CLOSER.') {
    if (!this.trashteroidRangeAlertEl) return;
    this.trashteroidRangeAlertEl.textContent = message;
    this.trashteroidRangeAlertEl.classList.toggle('hidden', !visible);
  }

  setBossVulnerabilityStatus(state = 'shielded', secondsRemaining = 0, visible = true) {
    if (!this.bossVulnerabilityEl) return;
    const safeSeconds = Math.max(0, Math.ceil(secondsRemaining));
    if (state === 'vulnerable') {
      this.bossVulnerabilityEl.textContent = `VULNERABLE! DESTROY THE TRASHTEROID: ${safeSeconds}`;
      this.bossVulnerabilityEl.classList.add('vulnerable');
      this.bossVulnerabilityEl.classList.remove('shielded');
    } else {
      this.bossVulnerabilityEl.textContent = `SHIELDED. VULNERABLE IN: ${safeSeconds}`;
      this.bossVulnerabilityEl.classList.add('shielded');
      this.bossVulnerabilityEl.classList.remove('vulnerable');
    }
    this.bossVulnerabilityEl.classList.toggle('hidden', !visible);
  }

  _setMusicVisualizerVisible(visible) {
    if (!this.musicVisualizer) return;
    this.musicVisualizer.classList.toggle('hidden', !visible);
    this.musicVisualizer.setAttribute('aria-hidden', visible ? 'false' : 'true');
    this.musicVisualizer.classList.toggle('music-visualizer-gameplay', !!visible);
    this.musicVisualizer.style.setProperty('--visualizer-energy', visible ? '0.2' : '0');

    if (!visible) {
      this._musicVisualizerEnergy = 0;
      for (let i = 0; i < this.musicVisualizerBars.length; i++) {
        const bar = this.musicVisualizerBars[i];
        bar.style.transform = 'scaleX(0.12)';
        bar.style.opacity = '0.44';
      }
    }
  }

  updateMusicVisualizer(levelsOrIntensity = 0, delta = 0) {
    if (!this._musicVisualizerEnabled || !this._gameplayVisible) return;
    if (!this.musicVisualizerBars.length) return;

    const dt = Math.max(0.005, delta || 0.016);
    this._musicVisualizerPhase += dt * 8.4;

    if (Array.isArray(levelsOrIntensity)) {
      const lastBarIndex = Math.max(1, this.musicVisualizerBars.length - 1);
      let totalLevel = 0;

      for (let i = 0; i < this.musicVisualizerBars.length; i++) {
        const bar = this.musicVisualizerBars[i];
        const rawLevel = THREE.MathUtils.clamp(levelsOrIntensity[i % levelsOrIntensity.length] ?? 0, 0, 1);
        const bandOffset = (i / lastBarIndex) * Math.PI * 2;
        const wave = 0.86 + Math.sin(this._musicVisualizerPhase * 2.2 + bandOffset) * 0.14;
        const level = THREE.MathUtils.clamp((0.04 + Math.pow(rawLevel, 0.9) * 0.9) * wave, 0, 1);
        totalLevel += level;
        bar.style.transform = `scaleX(${0.12 + level * 1.1})`;
        bar.style.opacity = `${0.36 + level * 0.56}`;
      }

      const avgLevel = totalLevel / this.musicVisualizerBars.length;
      this.musicVisualizer.style.setProperty('--visualizer-energy', `${avgLevel.toFixed(3)}`);
      return;
    }

    const targetEnergy = THREE.MathUtils.clamp(levelsOrIntensity, 0, 1);
    const smoothing = 1 - Math.exp(-dt * 9);
    this._musicVisualizerEnergy += (targetEnergy - this._musicVisualizerEnergy) * smoothing;

    for (let i = 0; i < this.musicVisualizerBars.length; i++) {
      const bar = this.musicVisualizerBars[i];
      const wave = (Math.sin(this._musicVisualizerPhase * 2 + i * 0.58) + 1) * 0.5;
      const ripple = (Math.sin(this._musicVisualizerPhase * 4.1 + i * 0.92) + 1) * 0.5;
      const level = THREE.MathUtils.clamp(
        0.06 + this._musicVisualizerEnergy * (0.34 + wave * 0.48) + ripple * 0.08,
        0.08,
        1
      );
      bar.style.transform = `scaleX(${0.12 + level * 1.1})`;
      bar.style.opacity = `${0.36 + level * 0.56}`;
    }

    this.musicVisualizer.style.setProperty('--visualizer-energy', `${this._musicVisualizerEnergy.toFixed(3)}`);
  }

  updateBossIndicator(visible, x, y, angle, distance, label = 'TRASHTEROID') {
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
    this.bossIndicatorDist.textContent = `${label} ${distance} mi`;
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

  flashDamage() {
    if (!this.damageVignette) return;
    if (this._reducedFlashing) return;
    const el = this.damageVignette;
    // Restart the flash animation by toggling the class
    el.classList.remove('flashing');
    void el.offsetWidth; // force reflow so the animation restarts
    el.classList.add('flashing');
    el.addEventListener('animationend', () => el.classList.remove('flashing'), { once: true });
  }

  setLowHealth(enabled) {
    if (!this.damageVignette) return;
    this._lowHealth = !!enabled;
    const el = this.damageVignette;
    el.classList.toggle('low', !!enabled);
    el.classList.toggle('pulsing', !!enabled && !this._reducedFlashing);
  }

  clearDamageIndicators() {
    if (!this.damageVignette) return;
    this._lowHealth = false;
    this.damageVignette.classList.remove('low', 'pulsing', 'flashing', 'flash', 'death');
    this.damageVignette.style.opacity = '0';
  }

  setDeathVignette(enabled) {
    if (!this.damageVignette) return;

    if (!enabled) {
      this.damageVignette.classList.remove('death');
      this.damageVignette.style.opacity = '0';
      return;
    }

    this.damageVignette.classList.remove('flashing', 'pulsing');
    this.damageVignette.classList.add('death');
    this.damageVignette.style.opacity = '1';
  }

  updateBossBar(health, maxHealth) {
    if (!this.bossContainer || !this.bossFill) return;
    this.bossContainer.classList.remove('hidden');
    const pct = Math.max(0, (health / maxHealth) * 100);
    this.bossFill.style.width = `${pct}%`;
  }

  setBossBarVisible(visible) {
    if (!this.bossContainer) return;
    this.bossContainer.classList.toggle('hidden', !visible);
    if (!visible && this.bossVulnerabilityEl) {
      this.bossVulnerabilityEl.classList.add('hidden');
    }
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
    if (!this.objectivesPanel) return;
    this.objectivesPanel.classList.remove('hidden');

    const required = objectives.filter(o => !o.bonus);
    const optional = objectives.filter(o => o.bonus);

    // If the new split lists exist, render into them. Otherwise fall back to old single list.
    if (this.objectivesRequiredList && this.objectivesOptionalList && this.objectivesOptionalTitle) {
      this.objectivesRequiredList.innerHTML = '';
      this.objectivesOptionalList.innerHTML = '';

      for (const obj of required) {
        const li = document.createElement('li');
        if (obj.complete) li.classList.add('complete');
        if (obj.failed) li.classList.add('failed');

        const check = document.createElement('span');
        check.className = 'obj-check';
        check.textContent = obj.complete ? '✓' : (obj.failed ? '✗' : '○');

        const text = document.createElement('span');
        const progress = obj.target > 1 ? ` (${Math.min(obj.current, obj.target)}/${obj.target})` : '';
        text.textContent = obj.label + progress;

        li.appendChild(check);
        li.appendChild(text);
        this.objectivesRequiredList.appendChild(li);
      }

      if (optional.length > 0) {
        this.objectivesOptionalTitle.classList.remove('hidden');
        this.objectivesOptionalList.classList.remove('hidden');
        for (const obj of optional) {
          const li = document.createElement('li');
          li.classList.add('bonus');
          if (obj.complete) li.classList.add('complete');
          if (obj.failed) li.classList.add('failed');

          const check = document.createElement('span');
          check.className = 'obj-check';
          check.textContent = obj.complete ? '✓' : (obj.failed ? '✗' : '◇');

          const text = document.createElement('span');
          const progress = obj.target > 1 ? ` (${Math.min(obj.current, obj.target)}/${obj.target})` : '';
          text.textContent = obj.label + progress;

          li.appendChild(check);
          li.appendChild(text);
          this.objectivesOptionalList.appendChild(li);
        }
      } else {
        this.objectivesOptionalTitle.classList.add('hidden');
        this.objectivesOptionalList.classList.add('hidden');
      }
      return;
    }

    // Fallback for older markup: render everything into single list
    if (!this.objectivesList) return;
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

  _renderTutorialRequirements(requirements = []) {
    if (!this.tutorialCalloutRequirements) return;

    this.tutorialCalloutRequirements.textContent = '';

    for (let i = 0; i < requirements.length; i++) {
      const requirement = requirements[i];
      const li = document.createElement('li');
      li.className = 'tutorial-callout-requirement';
      if (requirement.complete) {
        li.classList.add('checked');
      }

      const check = document.createElement('span');
      check.className = 'tutorial-callout-check';
      check.textContent = requirement.complete ? '✓' : '';

      const text = document.createElement('span');
      text.className = 'tutorial-callout-requirement-label';
      text.textContent = requirement.label;

      li.appendChild(check);
      li.appendChild(text);
      this.tutorialCalloutRequirements.appendChild(li);
    }
  }

  _setTutorialCalloutTimer(progress = null, visible = false) {
    if (!this.tutorialCalloutTimer) return;

    if (!visible || progress == null) {
      this.tutorialCalloutTimer.classList.add('hidden');
      return;
    }

    const clamped = THREE.MathUtils.clamp(progress, 0, 1);
    const circumference = 100;
    const offset = (1 - clamped) * circumference;

    if (this.tutorialCalloutTimerProgress) {
      this.tutorialCalloutTimerProgress.style.strokeDasharray = `${circumference}`;
      this.tutorialCalloutTimerProgress.style.strokeDashoffset = `${offset}`;
    }
    if (this.tutorialCalloutTimerTrack) {
      this.tutorialCalloutTimerTrack.style.strokeDasharray = `${circumference}`;
      this.tutorialCalloutTimerTrack.style.strokeDashoffset = `0`;
    }

    this.tutorialCalloutTimer.classList.remove('hidden');
  }

  showTutorialCallout(title, text, options = {}) {
    if (!this.tutorialCallout || !this.tutorialCalloutTitle || !this.tutorialCalloutText) return;
    const placement = options.placement ?? 'center';
    const animate = this._reducedMotion ? false : (options.animate ?? false);
    const keepTopLeftRoute =
      !animate
      && placement === 'top-left'
      && this.tutorialCallout.classList.contains('tutorial-callout-routing-top-left');

    if (!keepTopLeftRoute) {
      if (this._tutorialCalloutHideTimer) {
        clearTimeout(this._tutorialCalloutHideTimer);
        this._tutorialCalloutHideTimer = null;
      }
      if (this._tutorialCalloutAnimationFrame) {
        cancelAnimationFrame(this._tutorialCalloutAnimationFrame);
        this._tutorialCalloutAnimationFrame = null;
      }
      if (this._tutorialCalloutRouteTimer) {
        clearTimeout(this._tutorialCalloutRouteTimer);
        this._tutorialCalloutRouteTimer = null;
      }
    }

    this.tutorialCalloutTitle.textContent = title;
    this.tutorialCalloutText.textContent = text;
    this._renderTutorialRequirements(options.requirements ?? []);
    this._setTutorialCalloutTimer(options.timerProgress ?? null, !!options.showTimer);

    if (keepTopLeftRoute) {
      this.tutorialCallout.classList.remove('hidden', 'tutorial-callout-entering', 'tutorial-callout-leaving');
      return;
    }

    this.tutorialCallout.classList.remove(
      'hidden',
      'tutorial-callout-leaving',
      'tutorial-callout-entering',
      'tutorial-callout-routing-top-left'
    );

    if (animate && placement === 'top-left') {
      delete this.tutorialCallout.dataset.placement;
      this.tutorialCallout.classList.add('tutorial-callout-routing-top-left');
      this.tutorialCallout.classList.remove('hidden');
      // Force the center state to be committed before moving to top-left.
      void this.tutorialCallout.offsetWidth;
      this._tutorialCalloutAnimationFrame = window.requestAnimationFrame(() => {
        this._tutorialCalloutAnimationFrame = window.requestAnimationFrame(() => {
          this.tutorialCallout.dataset.placement = 'top-left';
          this._tutorialCalloutAnimationFrame = null;
          this._tutorialCalloutRouteTimer = window.setTimeout(() => {
            this.tutorialCallout.classList.remove('tutorial-callout-routing-top-left');
            this._tutorialCalloutRouteTimer = null;
          }, 460);
        });
      });
      return;
    }

    this.tutorialCallout.dataset.placement = placement;

    if (animate) {
      this.tutorialCallout.classList.add('tutorial-callout-entering');
      this._tutorialCalloutAnimationFrame = window.requestAnimationFrame(() => {
        this.tutorialCallout.classList.remove('tutorial-callout-entering');
        this._tutorialCalloutAnimationFrame = null;
      });
    }

    this.tutorialCallout.classList.remove('hidden');
  }

  hideTutorialCallout(options = {}) {
    if (!this.tutorialCallout) return;
    const animated = this._reducedMotion ? false : (options.animated ?? false);

    if (this._tutorialCalloutHideTimer) {
      clearTimeout(this._tutorialCalloutHideTimer);
      this._tutorialCalloutHideTimer = null;
    }
    if (this._tutorialCalloutAnimationFrame) {
      cancelAnimationFrame(this._tutorialCalloutAnimationFrame);
      this._tutorialCalloutAnimationFrame = null;
    }
    if (this._tutorialCalloutRouteTimer) {
      clearTimeout(this._tutorialCalloutRouteTimer);
      this._tutorialCalloutRouteTimer = null;
    }

    if (!animated) {
      this.tutorialCallout.classList.remove(
        'tutorial-callout-entering',
        'tutorial-callout-leaving',
        'tutorial-callout-routing-top-left'
      );
      this.tutorialCallout.classList.add('hidden');
      this._setTutorialCalloutTimer(null, false);
      delete this.tutorialCallout.dataset.placement;
      return;
    }

    this.tutorialCallout.classList.remove('tutorial-callout-entering', 'tutorial-callout-routing-top-left');
    this.tutorialCallout.classList.add('tutorial-callout-leaving');
    this._tutorialCalloutHideTimer = window.setTimeout(() => {
      this.tutorialCallout.classList.add('hidden');
      this.tutorialCallout.classList.remove('tutorial-callout-leaving');
      this._setTutorialCalloutTimer(null, false);
      delete this.tutorialCallout.dataset.placement;
      this._tutorialCalloutHideTimer = null;
    }, 220);
  }

  setPauseVisible(visible) {
    if (!this.pauseScreen) return;
    this.pauseScreen.classList.toggle('hidden', !visible);
    this.pauseScreen.setAttribute('aria-hidden', visible ? 'false' : 'true');
  }

  updatePauseStats(shotsFired, trashHits) {
    if (!this.pauseAccuracyValue || !this.pauseAccuracyDetail) return;
    const percent = shotsFired > 0 ? Math.round(((trashHits / shotsFired) * 100) * 4) : 0;
    this.pauseAccuracyValue.textContent = `${percent.toFixed(shotsFired > 0 ? 1 : 0)}%`;
    this.pauseAccuracyDetail.textContent = `${trashHits} trash cleared / ${shotsFired} vaporize bursts`;
  }

  setPauseSensitivity(rawSensitivity) {
    if (!this.pauseSensitivityInput || !this.pauseSensitivityValue) return;
    const displayValue = Math.round(rawSensitivity * 1000);
    this.pauseSensitivityInput.value = `${displayValue}`;
    this.pauseSensitivityValue.textContent = `${displayValue}`;
  }

  showMessage(text, options = {}) {
    const animateIn = !!options.animateIn;
    const keepDamageVignette = !!options.keepDamageVignette;
    const onPlayAgain = options.onPlayAgain ?? (() => window.location.reload());

    if (keepDamageVignette) {
      this.setDeathVignette(true);
    } else {
      this.clearDamageIndicators();
    }
    this.setGameplayVisible(false);
    this.setPauseVisible(false);

    if (this.overlay) {
      this.overlay.classList.remove('overlay-reveal');
    }

    this.overlay.classList.remove('hidden');
    this.overlay.querySelector('h1').textContent = text;

    if (animateIn && this.overlay) {
      void this.overlay.offsetWidth;
      this.overlay.classList.add('overlay-reveal');
    }

    const btn = this.overlay.querySelector('#start-btn');
    btn.textContent = 'PLAY AGAIN';
    btn.onclick = onPlayAgain;
  }
}
