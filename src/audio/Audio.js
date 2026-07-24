/**
 * Procedural BGM + SFX via Web Audio (no asset downloads).
 * Adventure / village feel — bright pentatonic, not gloomy drones.
 */
export class AudioManager {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.musicGain = null;
    this.sfxGain = null;
    this.musicVol = Number(localStorage.getItem("metin3_music") ?? 0.4);
    this.sfxVol = Number(localStorage.getItem("metin3_sfx") ?? 0.55);
    this.muted = localStorage.getItem("metin3_mute") === "1";
    this._bgmNodes = [];
    this._started = false;
    this._bgmOn = true;
    this._step = 0;
    this._melodyTimer = 0;
    this._bassTimer = 0;
  }

  async unlock() {
    if (this._started) return;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    this.ctx = new Ctx();
    this.master = this.ctx.createGain();
    this.musicGain = this.ctx.createGain();
    this.sfxGain = this.ctx.createGain();
    // Soft music bus with gentle high shelf warmth
    const musicFilter = this.ctx.createBiquadFilter();
    musicFilter.type = "lowpass";
    musicFilter.frequency.value = 4200;
    musicFilter.Q.value = 0.4;
    this.musicGain.connect(musicFilter);
    musicFilter.connect(this.master);
    this.sfxGain.connect(this.master);
    this.master.connect(this.ctx.destination);
    this._musicFilter = musicFilter;
    this._applyVolumes();
    if (this.ctx.state === "suspended") await this.ctx.resume();
    this._started = true;
    if (this._bgmOn && !this.muted) this.startBgm();
  }

  _applyVolumes() {
    if (!this.master) return;
    this.master.gain.value = this.muted ? 0 : 1;
    if (this.musicGain) this.musicGain.gain.value = this.musicVol;
    if (this.sfxGain) this.sfxGain.gain.value = this.sfxVol;
  }

  setMusicVolume(v) {
    this.musicVol = Math.max(0, Math.min(1, v));
    localStorage.setItem("metin3_music", String(this.musicVol));
    this._applyVolumes();
  }

  setSfxVolume(v) {
    this.sfxVol = Math.max(0, Math.min(1, v));
    localStorage.setItem("metin3_sfx", String(this.sfxVol));
    this._applyVolumes();
  }

  setMuted(m) {
    this.muted = !!m;
    localStorage.setItem("metin3_mute", this.muted ? "1" : "0");
    this._applyVolumes();
    if (!this.muted && this._started && this._bgmOn && !this._bgmNodes.length) this.startBgm();
  }

  toggleMute() {
    this.setMuted(!this.muted);
    return this.muted;
  }

  startBgm() {
    if (!this.ctx || this._bgmNodes.length) return;
    this._bgmOn = true;
    this._step = 0;
    const t0 = this.ctx.currentTime + 0.05;

    // Warm major pad (C major-ish open voicing) — airy, not dark
    const padNotes = [261.63, 329.63, 392.0, 523.25]; // C4 E4 G4 C5
    for (let i = 0; i < padNotes.length; i++) {
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      const f = this.ctx.createBiquadFilter();
      osc.type = i < 2 ? "sine" : "triangle";
      osc.frequency.value = padNotes[i];
      f.type = "lowpass";
      f.frequency.value = 1800 + i * 200;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.linearRampToValueAtTime(0.028 + i * 0.004, t0 + 1.8);
      osc.connect(f);
      f.connect(g);
      g.connect(this.musicGain);
      osc.start(t0);
      // gentle chorus wobble
      const lfo = this.ctx.createOscillator();
      const lfoG = this.ctx.createGain();
      lfo.frequency.value = 0.12 + i * 0.03;
      lfoG.gain.value = 1.5 + i * 0.4;
      lfo.connect(lfoG);
      lfoG.connect(osc.frequency);
      lfo.start(t0);
      this._bgmNodes.push(osc, lfo, g, f, lfoG);
    }

    // Soft shimmer (high fifth)
    const shimmer = this.ctx.createOscillator();
    const shG = this.ctx.createGain();
    shimmer.type = "sine";
    shimmer.frequency.value = 783.99; // G5
    shG.gain.value = 0.012;
    shimmer.connect(shG);
    shG.connect(this.musicGain);
    shimmer.start(t0);
    this._bgmNodes.push(shimmer, shG);

    // Melodic sequence — bright pentatonic adventure (C D E G A)
    // Tempo ~92 BPM, 8th notes
    this._melodyTimer = setInterval(() => this._melodyStep(), 160);
    this._bassTimer = setInterval(() => this._bassStep(), 640);
  }

  stopBgm() {
    this._bgmOn = false;
    clearInterval(this._melodyTimer);
    clearInterval(this._bassTimer);
    clearInterval(this._pulseTimer);
    for (const n of this._bgmNodes) {
      try {
        n.stop?.();
        n.disconnect?.();
      } catch {
        /* ignore */
      }
    }
    this._bgmNodes = [];
  }

  /** Lead melody — plucked pentatonic phrases */
  _melodyStep() {
    if (!this.ctx || this.muted || !this._bgmOn) return;
    const scale = [523.25, 587.33, 659.25, 783.99, 880.0, 1046.5]; // C5–C6 pentatonic-ish
    // Phrase patterns (index into scale, -1 = rest)
    const phrases = [
      [0, 2, 4, 2, 3, 4, 2, -1],
      [4, 3, 2, 0, 2, 3, 4, 5],
      [2, 4, 5, 4, 3, 2, 0, -1],
      [0, 2, 3, 4, 3, 2, 4, 2],
    ];
    const phrase = phrases[Math.floor(this._step / 8) % phrases.length];
    const noteIdx = phrase[this._step % 8];
    this._step++;
    if (noteIdx < 0) return;

    const t = this.ctx.currentTime;
    const freq = scale[noteIdx];
    // Soft pluck: triangle + short sine
    this._pluck(t, freq, 0.32, 0.07);
    if (this._step % 4 === 0) this._pluck(t + 0.02, freq * 1.5, 0.18, 0.025); // sparkle
  }

  _bassStep() {
    if (!this.ctx || this.muted || !this._bgmOn) return;
    const roots = [130.81, 146.83, 164.81, 196.0]; // C3 D3 E3 G3
    const i = Math.floor(this._step / 8) % roots.length;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(roots[i], t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.06, t + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
    osc.connect(g);
    g.connect(this.musicGain);
    osc.start(t);
    osc.stop(t + 0.6);

    // Light wood-block tick
    this._tick(t, 0.035);
  }

  _pluck(t, freq, dur, vol) {
    const osc = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    const f = this.ctx.createBiquadFilter();
    osc.type = "triangle";
    osc2.type = "sine";
    osc.frequency.setValueAtTime(freq, t);
    osc2.frequency.setValueAtTime(freq * 2.01, t);
    f.type = "lowpass";
    f.frequency.setValueAtTime(2400, t);
    f.frequency.exponentialRampToValueAtTime(800, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(f);
    osc2.connect(f);
    f.connect(g);
    g.connect(this.musicGain);
    osc.start(t);
    osc2.start(t);
    osc.stop(t + dur + 0.02);
    osc2.stop(t + dur + 0.02);
  }

  _tick(t, vol) {
    const len = Math.floor(this.ctx.sampleRate * 0.04);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const f = this.ctx.createBiquadFilter();
    f.type = "bandpass";
    f.frequency.value = 1800;
    f.Q.value = 4;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    src.connect(f);
    f.connect(g);
    g.connect(this.musicGain);
    src.start(t);
  }

  sfx(kind) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    switch (kind) {
      case "hit":
        this._noiseBurst(t, 0.08, 0.25, 1800);
        this._tone(t, 180, 0.07, "square", 0.12);
        break;
      case "crit":
        this._tone(t, 420, 0.12, "sawtooth", 0.18);
        this._tone(t + 0.05, 640, 0.1, "square", 0.12);
        this._noiseBurst(t, 0.12, 0.35, 2400);
        break;
      case "slash":
        this._noiseBurst(t, 0.1, 0.22, 3200);
        this._tone(t, 320, 0.08, "triangle", 0.1);
        break;
      case "skill":
        this._tone(t, 260, 0.15, "sine", 0.16);
        this._tone(t + 0.08, 390, 0.18, "triangle", 0.14);
        this._tone(t + 0.16, 520, 0.2, "sine", 0.1);
        break;
      case "aoe":
        this._noiseBurst(t, 0.2, 0.4, 900);
        this._tone(t, 90, 0.25, "sawtooth", 0.2);
        break;
      case "heal":
        this._tone(t, 523, 0.18, "sine", 0.12);
        this._tone(t + 0.08, 659, 0.2, "sine", 0.1);
        this._tone(t + 0.16, 784, 0.22, "triangle", 0.08);
        break;
      case "buff":
        this._tone(t, 300, 0.2, "triangle", 0.14);
        this._tone(t + 0.1, 450, 0.25, "sine", 0.12);
        break;
      case "loot":
        this._tone(t, 880, 0.08, "square", 0.1);
        this._tone(t + 0.06, 1175, 0.1, "square", 0.08);
        break;
      case "level":
        [523, 659, 784, 1046].forEach((f, i) => this._tone(t + i * 0.1, f, 0.18, "triangle", 0.14));
        break;
      case "death":
        this._tone(t, 200, 0.4, "sawtooth", 0.2);
        this._tone(t + 0.1, 120, 0.5, "triangle", 0.18);
        break;
      case "ui":
        this._tone(t, 660, 0.05, "sine", 0.06);
        break;
      case "pickup":
        this._tone(t, 740, 0.06, "triangle", 0.08);
        break;
      default:
        this._tone(t, 440, 0.06, "sine", 0.08);
    }
  }

  _tone(t, freq, dur, type, vol) {
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g);
    g.connect(this.sfxGain);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  _noiseBurst(t, dur, vol, filterHz) {
    const len = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const f = this.ctx.createBiquadFilter();
    f.type = "bandpass";
    f.frequency.value = filterHz;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f);
    f.connect(g);
    g.connect(this.sfxGain);
    src.start(t);
  }
}

export const audio = new AudioManager();
