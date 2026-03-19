const SOUNDTRACK_URL = '/audioloop.wav';
const SPACE_AMBIENCE_URL = '/space.m4a';
const BOOST_URL = '/boostbass.m4a';
const DEFAULT_BAND_COUNT = 14;
const DEFAULT_AMBIENCE_DURATION = 10;
const MAIN_MENU_VOLUME = 0.68;
const MAIN_IN_LEVEL_VOLUME = 0.1;
const AMBIENCE_IN_LEVEL_VOLUME = 0.78;
const AMBIENCE_OVERLAP_SECONDS = 1.25;
const AMBIENCE_THRUST_RELEASE_FADE_MS = 320;
const BOOST_VOLUME = 0.62;
const BOOST_FADE_OUT_MS = 500;
const BOOST_FADE_IN_MS = 120;

class SoundtrackManager {
  constructor() {
    this._audioEl = document.createElement('audio');
    this._audioEl.src = SOUNDTRACK_URL;
    this._audioEl.loop = true;
    this._audioEl.preload = 'auto';
    this._audioEl.crossOrigin = 'anonymous';
    this._audioEl.volume = MAIN_MENU_VOLUME;

    this._ambientEls = [document.createElement('audio'), document.createElement('audio')];
    for (let i = 0; i < this._ambientEls.length; i++) {
      const ambient = this._ambientEls[i];
      ambient.src = SPACE_AMBIENCE_URL;
      ambient.loop = false;
      ambient.preload = 'auto';
      ambient.crossOrigin = 'anonymous';
      ambient.volume = 0;
    }
    this._ambientPrimaryIndex = 0;
    this._ambientSwapTimer = null;
    this._ambientFadeRaf = null;
    this._mainFadeRaf = null;
    this._inLevel = false;
    this._thrusting = false;

    this._boostEl = document.createElement('audio');
    this._boostEl.src = BOOST_URL;
    this._boostEl.loop = true;
    this._boostEl.preload = 'auto';
    this._boostEl.crossOrigin = 'anonymous';
    this._boostEl.volume = 0;
    this._boosting = false;
    this._boostFadeRaf = null;

    this._audioContext = null;
    this._sourceNode = null;
    this._analyser = null;
    this._fftData = null;
    this._bandCache = new Array(DEFAULT_BAND_COUNT).fill(0);
    this._bandRanges = [];
    this._bandRangeKey = '';
    this._peakFollower = 0.72;
    this._playing = false;
  }

  _clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  _rebuildBandRanges(targetCount, minFrequency, maxFrequency, nyquist) {
    if (!this._fftData || !this._fftData.length) {
      this._bandRanges = [];
      this._bandRangeKey = '';
      return;
    }

    const maxBin = this._fftData.length - 1;
    const safeMinFreq = Math.max(8, minFrequency);
    const safeMaxFreq = Math.max(safeMinFreq + 1, maxFrequency);
    const ratio = safeMaxFreq / safeMinFreq;

    this._bandRanges = new Array(targetCount);
    for (let i = 0; i < targetCount; i++) {
      const startT = i / targetCount;
      const endT = (i + 1) / targetCount;

      const startFreq = safeMinFreq * Math.pow(ratio, startT);
      const endFreq = safeMinFreq * Math.pow(ratio, endT);

      let startBin = this._clamp(Math.floor((startFreq / nyquist) * maxBin), 1, maxBin - 1);
      let endBin = this._clamp(Math.ceil((endFreq / nyquist) * maxBin), startBin + 1, maxBin);

      // Ensure low-end bands are not too narrow so sub-bass is visible.
      if (i <= 1) {
        endBin = Math.min(maxBin, Math.max(endBin, startBin + 3));
      } else if (i <= 3) {
        endBin = Math.min(maxBin, Math.max(endBin, startBin + 2));
      }

      this._bandRanges[i] = { startBin, endBin };
    }

    this._bandRangeKey = `${targetCount}|${this._fftData.length}|${Math.round(minFrequency)}|${Math.round(maxFrequency)}|${Math.round(nyquist)}`;
  }

  _ensureGraph() {
    if (this._analyser) return;

    const ContextCtor = window.AudioContext || window.webkitAudioContext;
    if (!ContextCtor) return;

    this._audioContext = this._audioContext ?? new ContextCtor();

    if (!this._sourceNode) {
      this._sourceNode = this._audioContext.createMediaElementSource(this._audioEl);
    }

    this._analyser = this._audioContext.createAnalyser();
    this._analyser.fftSize = 2048;
    this._analyser.smoothingTimeConstant = 0.56;
    this._analyser.minDecibels = -100;
    this._analyser.maxDecibels = -16;
    this._fftData = new Uint8Array(this._analyser.frequencyBinCount);

    this._sourceNode.connect(this._analyser);
    this._analyser.connect(this._audioContext.destination);
  }

  async start() {
    this._ensureGraph();

    try {
      if (this._audioContext && this._audioContext.state === 'suspended') {
        await this._audioContext.resume();
      }
      if (this._audioEl.paused) {
        await this._audioEl.play();
      }
      if (this._inLevel && this._thrusting) {
        await this._startSpaceAmbience();
      }
      this._playing = true;
    } catch (error) {
      // Ignore autoplay failures; playback will start on the next user gesture.
    }
  }

  _cancelAnimationFrame(refName) {
    const id = this[refName];
    if (id != null) {
      cancelAnimationFrame(id);
      this[refName] = null;
    }
  }

  _clearAmbientSwapTimer() {
    if (this._ambientSwapTimer != null) {
      window.clearTimeout(this._ambientSwapTimer);
      this._ambientSwapTimer = null;
    }
  }

  _fadeAudioElementVolume(audioEl, from, to, durationMs, rafField, onComplete = null) {
    this._cancelAnimationFrame(rafField);

    const safeDurationMs = Math.max(1, durationMs);
    const startTime = performance.now();
    audioEl.volume = from;

    const step = () => {
      const elapsed = performance.now() - startTime;
      const t = this._clamp(elapsed / safeDurationMs, 0, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      audioEl.volume = from + (to - from) * eased;

      if (t < 1) {
        this[rafField] = requestAnimationFrame(step);
        return;
      }

      this[rafField] = null;
      audioEl.volume = to;
      onComplete?.();
    };

    this[rafField] = requestAnimationFrame(step);
  }

  _fadeBoost(toVolume, durationMs, onComplete = null) {
    this._fadeAudioElementVolume(
      this._boostEl,
      this._boostEl.volume,
      toVolume,
      durationMs,
      '_boostFadeRaf',
      onComplete
    );
  }

  _fadeOutSpaceAmbience(durationMs = AMBIENCE_THRUST_RELEASE_FADE_MS) {
    this._clearAmbientSwapTimer();
    this._cancelAnimationFrame('_ambientFadeRaf');

    const primary = this._ambientEls[this._ambientPrimaryIndex];
    const secondary = this._ambientEls[1 - this._ambientPrimaryIndex];
    const fromPrimary = primary.volume;
    const fromSecondary = secondary.volume;
    const safeDurationMs = Math.max(1, durationMs);
    const startTime = performance.now();

    const step = () => {
      const elapsed = performance.now() - startTime;
      const t = this._clamp(elapsed / safeDurationMs, 0, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      const scalar = 1 - eased;

      primary.volume = fromPrimary * scalar;
      secondary.volume = fromSecondary * scalar;

      if (t < 1) {
        this._ambientFadeRaf = requestAnimationFrame(step);
        return;
      }

      this._ambientFadeRaf = null;
      if (this._inLevel && this._thrusting) {
        this._startSpaceAmbience();
        return;
      }

      primary.pause();
      secondary.pause();
      primary.currentTime = 0;
      secondary.currentTime = 0;
      primary.volume = 0;
      secondary.volume = 0;
      this._ambientPrimaryIndex = 0;
    };

    this._ambientFadeRaf = requestAnimationFrame(step);
  }

  _scheduleAmbientCrossfade() {
    if (!this._inLevel || !this._thrusting) return;

    const current = this._ambientEls[this._ambientPrimaryIndex];
    const duration = Number.isFinite(current.duration) && current.duration > 0
      ? current.duration
      : DEFAULT_AMBIENCE_DURATION;
    const overlap = Math.max(0.35, AMBIENCE_OVERLAP_SECONDS);
    const remainingBeforeCrossfade = Math.max(0.2, duration - overlap - current.currentTime);
    this._clearAmbientSwapTimer();
    this._ambientSwapTimer = window.setTimeout(() => {
      this._ambientSwapTimer = null;
      this._crossfadeAmbientLoop();
    }, remainingBeforeCrossfade * 1000);
  }

  async _startSpaceAmbience() {
    this._clearAmbientSwapTimer();
    this._cancelAnimationFrame('_ambientFadeRaf');

    const primary = this._ambientEls[this._ambientPrimaryIndex];
    const secondary = this._ambientEls[1 - this._ambientPrimaryIndex];

    secondary.pause();
    secondary.currentTime = 0;
    secondary.volume = 0;

    try {
      if (primary.paused) {
        primary.currentTime = 0;
        await primary.play();
      }
    } catch (error) {
      return;
    }

    this._fadeAudioElementVolume(primary, primary.volume, AMBIENCE_IN_LEVEL_VOLUME, 650, '_ambientFadeRaf');
    this._scheduleAmbientCrossfade();
  }

  _crossfadeAmbientLoop() {
    if (!this._inLevel || !this._thrusting) return;

    const from = this._ambientEls[this._ambientPrimaryIndex];
    const to = this._ambientEls[1 - this._ambientPrimaryIndex];
    const overlapMs = Math.max(350, AMBIENCE_OVERLAP_SECONDS * 1000);

    this._cancelAnimationFrame('_ambientFadeRaf');
    to.currentTime = 0;
    to.volume = 0;
    to.play().catch(() => {
      this._scheduleAmbientCrossfade();
    });

    const startTime = performance.now();
    const step = () => {
      if (!this._inLevel || !this._thrusting) {
        this._ambientFadeRaf = null;
        return;
      }

      const elapsed = performance.now() - startTime;
      const t = this._clamp(elapsed / overlapMs, 0, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      from.volume = AMBIENCE_IN_LEVEL_VOLUME * (1 - eased);
      to.volume = AMBIENCE_IN_LEVEL_VOLUME * eased;

      if (t < 1) {
        this._ambientFadeRaf = requestAnimationFrame(step);
        return;
      }

      from.pause();
      from.currentTime = 0;
      from.volume = 0;
      to.volume = AMBIENCE_IN_LEVEL_VOLUME;
      this._ambientPrimaryIndex = 1 - this._ambientPrimaryIndex;
      this._ambientFadeRaf = null;
      this._scheduleAmbientCrossfade();
    };

    this._ambientFadeRaf = requestAnimationFrame(step);
  }

  _stopSpaceAmbience() {
    this._clearAmbientSwapTimer();
    this._cancelAnimationFrame('_ambientFadeRaf');

    for (let i = 0; i < this._ambientEls.length; i++) {
      const ambient = this._ambientEls[i];
      ambient.pause();
      ambient.currentTime = 0;
      ambient.volume = 0;
    }
    this._ambientPrimaryIndex = 0;
  }

  setInLevel(inLevel) {
    this._inLevel = !!inLevel;

    const targetMainVolume = this._inLevel ? MAIN_IN_LEVEL_VOLUME : MAIN_MENU_VOLUME;
    this._fadeAudioElementVolume(this._audioEl, this._audioEl.volume, targetMainVolume, 700, '_mainFadeRaf');

    if (this._inLevel && this._thrusting) {
      this._startSpaceAmbience();
    } else {
      this._stopSpaceAmbience();
      this.setBoosting(false);
    }
  }

  setThrusting(thrusting) {
    const nextThrusting = !!thrusting;
    if (nextThrusting === this._thrusting) return;
    this._thrusting = nextThrusting;

    if (this._inLevel && this._thrusting) {
      this._startSpaceAmbience();
    } else {
      this._fadeOutSpaceAmbience();
    }
  }

  setBoosting(boosting) {
    const wantsBoost = !!boosting && this._inLevel;
    if (wantsBoost === this._boosting) return;
    this._boosting = wantsBoost;

    if (wantsBoost) {
      this._boostEl.currentTime = 0;
      this._boostEl.play().catch(() => {
        // Ignore autoplay/gesture restrictions; it will retry next boost frame.
      });
      this._fadeBoost(BOOST_VOLUME, BOOST_FADE_IN_MS);
      return;
    }

    this._fadeBoost(0, BOOST_FADE_OUT_MS, () => {
      if (this._boosting) return;
      this._boostEl.pause();
      this._boostEl.currentTime = 0;
    });
  }

  getBandLevels(count = DEFAULT_BAND_COUNT) {
    const targetCount = Math.max(1, Math.floor(count || DEFAULT_BAND_COUNT));

    if (this._bandCache.length !== targetCount) {
      this._bandCache = new Array(targetCount).fill(0);
    }

    if (!this._analyser || !this._fftData || !this._playing) {
      for (let i = 0; i < this._bandCache.length; i++) {
        this._bandCache[i] *= 0.82;
      }
      this._peakFollower *= 0.96;
      return this._bandCache;
    }

    this._analyser.getByteFrequencyData(this._fftData);

    const nyquist = (this._audioContext?.sampleRate ?? 48000) * 0.5;
    const minFrequency = 18;
    const maxFrequency = Math.min(nyquist * 0.985, 19000);
    const rangeKey = `${targetCount}|${this._fftData.length}|${Math.round(minFrequency)}|${Math.round(maxFrequency)}|${Math.round(nyquist)}`;
    if (this._bandRangeKey !== rangeKey || this._bandRanges.length !== targetCount) {
      this._rebuildBandRanges(targetCount, minFrequency, maxFrequency, nyquist);
    }

    const targetLevels = new Array(targetCount).fill(0);
    let framePeak = 0;

    for (let i = 0; i < targetCount; i++) {
      const range = this._bandRanges[i];
      const start = range?.startBin ?? 1;
      const end = range?.endBin ?? Math.min(this._fftData.length - 1, start + 1);

      let total = 0;
      let samples = 0;
      const span = Math.max(1, end - start);

      for (let bin = start; bin <= end; bin++) {
        const normalized = (this._fftData[bin] ?? 0) / 255;
        const positionInBand = (bin - start) / span;
        const centerWeight = 1 + (1 - Math.abs(positionInBand - 0.5) * 2) * 0.28;
        total += normalized * centerWeight;
        samples += centerWeight;
      }

      const avg = samples > 0 ? total / samples : 0;
      const gated = this._clamp((avg - 0.065) / 0.935, 0, 1);
      const compressed = Math.pow(gated, 0.74);

      // Slightly emphasize low and high edges so bass + treble movement reads clearly.
      const bandPosition = targetCount <= 1 ? 0.5 : (i / (targetCount - 1));
      const edgeShape = Math.abs((bandPosition * 2) - 1);
      let emphasis = 1 + edgeShape * 0.24;
      if (i <= 1) emphasis += 0.08;
      if (i >= targetCount - 2) emphasis += 0.1;

      const target = this._clamp(compressed * emphasis, 0, 1);
      targetLevels[i] = target;
      framePeak = Math.max(framePeak, target);
    }

    this._peakFollower = Math.max(framePeak, this._peakFollower * 0.93);
    const normalizationDenominator = Math.max(0.72, this._peakFollower);

    for (let i = 0; i < targetCount; i++) {
      const target = this._clamp((targetLevels[i] / normalizationDenominator) * 0.9, 0, 1);
      const current = this._bandCache[i] ?? 0;
      const smoothing = target > current ? 0.58 : 0.16;
      this._bandCache[i] = current + (target - current) * smoothing;
    }

    return this._bandCache;
  }
}

export const soundtrackManager = new SoundtrackManager();
