import { clamp } from './utils.js';

export class AudioManager {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.comp = null;
    this.noiseBuffer = null;
    this.engine = null;
    this.muted = localStorage.getItem('tank-country-muted') === '1';
    this.enabled = false;
    this._volume = 0.62;
  }

  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    this.ctx = new Ctx();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : this._volume;
    this.comp = this.ctx.createDynamicsCompressor();
    this.comp.threshold.value = -18;
    this.comp.knee.value = 18;
    this.comp.ratio.value = 4;
    this.comp.attack.value = 0.004;
    this.comp.release.value = 0.25;
    this.master.connect(this.comp);
    this.comp.connect(this.ctx.destination);
    this.noiseBuffer = this.createNoiseBuffer(2.5);
    this.enabled = true;
    this.buildEngine();
  }

  createNoiseBuffer(seconds = 2) {
    const ctx = this.ctx;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const white = Math.random() * 2 - 1;
      last = 0.97 * last + 0.03 * white;
      data[i] = white * 0.55 + last * 2.2;
    }
    return buffer;
  }

  setMuted(muted) {
    this.muted = muted;
    localStorage.setItem('tank-country-muted', muted ? '1' : '0');
    if (this.master) {
      const now = this.ctx.currentTime;
      this.master.gain.cancelScheduledValues(now);
      this.master.gain.setTargetAtTime(muted ? 0 : this._volume, now, 0.05);
    }
  }

  toggleMuted() {
    this.setMuted(!this.muted);
    return this.muted;
  }

  resume() {
    if (this.ctx?.state === 'suspended') this.ctx.resume();
  }

  // -------------------------------------------------------------------------

  buildEngine() {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const out = ctx.createGain();
    out.gain.value = 0;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 210;
    filter.Q.value = 1.1;
    out.connect(filter);
    filter.connect(this.master);

    const osc1 = ctx.createOscillator();
    osc1.type = 'sawtooth';
    osc1.frequency.value = 38;
    const osc2 = ctx.createOscillator();
    osc2.type = 'square';
    osc2.frequency.value = 22;
    const gain1 = ctx.createGain();
    gain1.gain.value = 0.24;
    const gain2 = ctx.createGain();
    gain2.gain.value = 0.1;
    osc1.connect(gain1);
    osc2.connect(gain2);
    gain1.connect(out);
    gain2.connect(out);

    const noise = ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;
    noise.loop = true;
    const nf = ctx.createBiquadFilter();
    nf.type = 'bandpass';
    nf.frequency.value = 130;
    nf.Q.value = 0.9;
    const ng = ctx.createGain();
    ng.gain.value = 0.045;
    noise.connect(nf);
    nf.connect(ng);
    ng.connect(out);

    // engine lfo gives it a mechanical wobble
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 7.5;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.06;
    lfo.connect(lfoGain);
    lfoGain.connect(gain1.gain);

    osc1.start();
    osc2.start();
    noise.start();
    lfo.start();
    this.engine = { out, filter, osc1, osc2, lfo, noise, nf };
    out.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.1);
  }

  setEngine(speedRatio, active = true, damage = 1) {
    if (!this.engine || !this.ctx) return;
    const now = this.ctx.currentTime;
    const ratio = clamp(speedRatio, 0, 1);
    const base = 33 + ratio * 33;
    const vol = active ? 0.02 + ratio * 0.06 : 0.006;
    this.engine.out.gain.setTargetAtTime(vol, now, 0.14);
    this.engine.osc1.frequency.setTargetAtTime(base, now, 0.16);
    this.engine.osc2.frequency.setTargetAtTime(base * 0.55, now, 0.16);
    this.engine.filter.frequency.setTargetAtTime(180 + ratio * 380, now, 0.2);
    this.engine.nf.frequency.setTargetAtTime(110 + ratio * 260, now, 0.2);
    this.engine.lfo.frequency.setTargetAtTime(6 + ratio * 8, now, 0.2);
    if (damage < 0.35) {
      this.engine.osc1.frequency.setTargetAtTime(base * 0.8, now, 0.3);
    }
  }

  engineOff() {
    if (!this.engine || !this.ctx) return;
    this.engine.out.gain.setTargetAtTime(0.0001, this.ctx.currentTime, 0.3);
  }

  // -------------------------------------------------------------------------
  // helpers

  noiseBurst({
    duration = 0.5,
    gain = 0.3,
    filterType = 'lowpass',
    freq = 1200,
    freqEnd = null,
    q = 1,
    attack = 0.004,
    delay = 0,
  } = {}) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t0 = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.setValueAtTime(freq, t0);
    if (freqEnd !== null) filter.frequency.exponentialRampToValueAtTime(Math.max(30, freqEnd), t0 + duration);
    filter.Q.value = q;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t0);
    env.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t0 + attack);
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    src.connect(filter);
    filter.connect(env);
    env.connect(this.master);
    src.start(t0);
    src.stop(t0 + duration + 0.05);
  }

  tone({
    freq = 220,
    freqEnd = null,
    type = 'sine',
    duration = 0.3,
    gain = 0.1,
    attack = 0.005,
    delay = 0,
    pan = 0,
  } = {}) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t0 = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (freqEnd !== null) osc.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), t0 + duration);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t0);
    env.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t0 + attack);
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    let node = env;
    if (ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = clamp(pan, -1, 1);
      env.connect(p);
      node = p;
    }
    osc.connect(env);
    node.connect(this.master);
    osc.start(t0);
    osc.stop(t0 + duration + 0.05);
  }

  // -------------------------------------------------------------------------
  // weapons / impacts

  cannon() {
    if (!this.ctx) return;
    this.noiseBurst({ duration: 0.65, gain: 0.52, filterType: 'lowpass', freq: 3200, freqEnd: 140, q: 0.8 });
    this.noiseBurst({ duration: 0.18, gain: 0.3, filterType: 'highpass', freq: 1500, freqEnd: 500 });
    this.tone({ freq: 105, freqEnd: 32, type: 'sine', duration: 0.55, gain: 0.45, attack: 0.002 });
    this.tone({ freq: 58, freqEnd: 28, type: 'triangle', duration: 0.7, gain: 0.3, delay: 0.02 });
  }

  enemyCannon() {
    if (!this.ctx) return;
    this.noiseBurst({ duration: 0.4, gain: 0.24, filterType: 'lowpass', freq: 1800, freqEnd: 100, q: 0.8 });
    this.tone({ freq: 88, freqEnd: 34, type: 'sine', duration: 0.36, gain: 0.2 });
  }

  explosion(size = 1) {
    if (!this.ctx) return;
    const s = clamp(size, 0.5, 3);
    this.noiseBurst({ duration: 0.55 + s * 0.28, gain: 0.4 * Math.min(s, 2), filterType: 'lowpass', freq: 1600, freqEnd: 70, q: 0.7 });
    this.noiseBurst({ duration: 0.12, gain: 0.22 * s, filterType: 'highpass', freq: 900, freqEnd: 300 });
    this.tone({ freq: 76 * (1 / s), freqEnd: 22, type: 'sine', duration: 0.55 + s * 0.2, gain: 0.32, attack: 0.003 });
  }

  distantExplosion() {
    this.explosion(0.6);
  }

  metalHit() {
    if (!this.ctx) return;
    this.tone({ freq: 1300, freqEnd: 500, type: 'triangle', duration: 0.15, gain: 0.07 });
    this.noiseBurst({ duration: 0.12, gain: 0.16, filterType: 'bandpass', freq: 2400, q: 1.2 });
    this.tone({ freq: 300, freqEnd: 110, type: 'square', duration: 0.18, gain: 0.05 });
  }

  ricochet() {
    if (!this.ctx) return;
    this.tone({ freq: 2100, freqEnd: 620, type: 'sine', duration: 0.24, gain: 0.08 });
  }

  reload() {
    if (!this.ctx) return;
    this.noiseBurst({ duration: 0.06, gain: 0.1, filterType: 'highpass', freq: 2000 });
    this.tone({ freq: 180, freqEnd: 120, type: 'square', duration: 0.07, gain: 0.04 });
  }

  rifle() {
    if (!this.ctx) return;
    this.noiseBurst({ duration: 0.09, gain: 0.12, filterType: 'highpass', freq: 2400, freqEnd: 900, q: 0.7 });
    this.tone({ freq: 320, freqEnd: 110, type: 'square', duration: 0.07, gain: 0.035 });
  }

  artillery() {
    if (!this.ctx) return;
    this.noiseBurst({ duration: 0.55, gain: 0.24, filterType: 'lowpass', freq: 1400, freqEnd: 90, q: 0.7 });
    this.tone({ freq: 82, freqEnd: 28, type: 'sine', duration: 0.5, gain: 0.2, attack: 0.004 });
    this.tone({ freq: 48, freqEnd: 24, type: 'triangle', duration: 0.65, gain: 0.14, delay: 0.03 });
  }

  mg() {
    if (!this.ctx) return;
    this.noiseBurst({ duration: 0.055, gain: 0.09, filterType: 'bandpass', freq: 1800, q: 0.8 });
    this.tone({ freq: 240, freqEnd: 90, type: 'square', duration: 0.045, gain: 0.025 });
  }

  flak() {
    if (!this.ctx) return;
    for (let i = 0; i < 3; i++) {
      this.noiseBurst({ duration: 0.09, gain: 0.11, filterType: 'bandpass', freq: 1300, q: 0.8, delay: i * 0.11 });
      this.tone({ freq: 140, freqEnd: 70, type: 'square', duration: 0.06, gain: 0.035, delay: i * 0.11 });
    }
  }

  bombWhistle(duration = 1.7) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t0 = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1300, t0);
    osc.frequency.exponentialRampToValueAtTime(280, t0 + duration);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t0);
    env.gain.exponentialRampToValueAtTime(0.035, t0 + 0.12);
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    osc.connect(env);
    env.connect(this.master);
    osc.start(t0);
    osc.stop(t0 + duration + 0.05);
    // airy whistle layer
    this.noiseBurst({ duration, gain: 0.02, filterType: 'bandpass', freq: 1800, freqEnd: 420, q: 5 });
  }

  shellWhistle(duration = 0.9) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t0 = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(900, t0);
    osc.frequency.exponentialRampToValueAtTime(180, t0 + duration);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t0);
    env.gain.exponentialRampToValueAtTime(0.018, t0 + 0.08);
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    osc.connect(env);
    env.connect(this.master);
    osc.start(t0);
    osc.stop(t0 + duration + 0.05);
  }

  barnCollapse() {
    if (!this.ctx) return;
    this.noiseBurst({ duration: 1.3, gain: 0.22, filterType: 'lowpass', freq: 900, freqEnd: 90 });
    for (let i = 0; i < 4; i++) {
      this.noiseBurst({ duration: 0.1, gain: 0.1, filterType: 'bandpass', freq: 700 + i * 300, q: 2, delay: i * 0.13 });
    }
    this.tone({ freq: 62, freqEnd: 28, type: 'sine', duration: 1.2, gain: 0.18 });
  }

  bomberDrone(duration = 12) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t0 = ctx.currentTime;
    const out = ctx.createGain();
    out.gain.setValueAtTime(0.0001, t0);
    out.gain.exponentialRampToValueAtTime(0.035, t0 + 1.6);
    out.gain.setValueAtTime(0.035, t0 + duration - 2.4);
    out.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 330;
    filter.connect(out);
    out.connect(this.master);
    const osc1 = ctx.createOscillator();
    osc1.type = 'sawtooth';
    osc1.frequency.value = 54;
    const osc2 = ctx.createOscillator();
    osc2.type = 'sawtooth';
    osc2.frequency.value = 57.5;
    const g = ctx.createGain();
    g.gain.value = 0.32;
    osc1.connect(g);
    osc2.connect(g);
    g.connect(filter);
    const noise = ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;
    noise.loop = true;
    const nf = ctx.createBiquadFilter();
    nf.type = 'bandpass';
    nf.frequency.value = 260;
    nf.Q.value = 0.6;
    const ng = ctx.createGain();
    ng.gain.value = 0.14;
    noise.connect(nf);
    nf.connect(ng);
    ng.connect(filter);
    osc1.start(t0);
    osc2.start(t0);
    noise.start(t0);
    osc1.stop(t0 + duration + 0.1);
    osc2.stop(t0 + duration + 0.1);
    noise.stop(t0 + duration + 0.1);
  }

  capture() {
    if (!this.ctx) return;
    const notes = [392, 523.25, 659.25, 783.99];
    notes.forEach((f, i) => {
      this.tone({ freq: f, type: 'triangle', duration: 0.38, gain: 0.075, delay: i * 0.12 });
      this.tone({ freq: f * 2, type: 'sine', duration: 0.24, gain: 0.025, delay: i * 0.12 });
    });
  }

  victory() {
    if (!this.ctx) return;
    const notes = [261.63, 329.63, 392, 523.25, 392, 523.25, 659.25, 783.99];
    notes.forEach((f, i) => {
      this.tone({ freq: f, type: 'triangle', duration: i === notes.length - 1 ? 1.2 : 0.3, gain: 0.09, delay: i * 0.17 });
    });
  }

  defeat() {
    if (!this.ctx) return;
    const notes = [220, 196, 174.61, 146.83];
    notes.forEach((f, i) => {
      this.tone({ freq: f, type: 'sawtooth', duration: i === notes.length - 1 ? 1.8 : 0.55, gain: 0.07, delay: i * 0.4 });
    });
  }

  ui() {
    if (!this.ctx) return;
    this.tone({ freq: 660, type: 'sine', duration: 0.06, gain: 0.035 });
  }

  warning() {
    if (!this.ctx) return;
    for (let i = 0; i < 2; i++) {
      this.tone({ freq: 440, type: 'square', duration: 0.14, gain: 0.035, delay: i * 0.25 });
      this.tone({ freq: 330, type: 'square', duration: 0.14, gain: 0.03, delay: i * 0.25 + 0.14 });
    }
  }
}
