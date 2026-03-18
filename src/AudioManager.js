const SOUNDTRACK_URL = '/audioloop.wav';
const DEFAULT_BAND_COUNT = 14;

class SoundtrackManager {
  constructor() {
    this._audioEl = document.createElement('audio');
    this._audioEl.src = SOUNDTRACK_URL;
    this._audioEl.loop = true;
    this._audioEl.preload = 'auto';
    this._audioEl.crossOrigin = 'anonymous';
    this._audioEl.volume = 0.68;

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
      this._playing = true;
    } catch (error) {
      // Ignore autoplay failures; playback will start on the next user gesture.
    }
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
