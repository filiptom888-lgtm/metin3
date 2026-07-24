/**
 * Procedural BGM + SFX via Web Audio (no asset downloads).
 * Starts after first user gesture (browser autoplay rules).
 */
export class AudioManager {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.musicGain = null;
    this.sfxGain = null;
    this.musicVol = Number(localStorage.getItem("metin3_music") ?? 0.35);
    this.sfxVol = Number(localStorage.getItem("metin3_sfx") ?? 0.55);
    this.muted = localStorage.getItem("metin3_mute") === "1";
    this._bgmNodes = [];
    this._started = false;
    this._bgmOn = true;
  }

  async unlock() {
    if (this._started) return;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    this.ctx = new Ctx();
    this.master = this.ctx.createGain();
    this.musicGain = this.ctx.createGain();
    this.sfxGain = this.ctx.createGain();
    this.musicGain.connect(this.master);
    this.sfxGain.connect(this.master);
    this.master.connect(this.ctx.destination);
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
    const t0 = this.ctx.currentTime + 0.05;
    // Soft drone pad — Asian-ish pentatonic feel
    const notes = [110, 146.83, 164.81, 196, 220];
    for (let i = 0; i < notes.length; i++) {
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      const f = this.ctx.createBiquadFilter();
      osc.type = i % 2 ? "triangle" : "sine";
      osc.frequency.value = notes[i];
      f.type = "lowpass";
      f.frequency.value = 600 + i * 80;
      g.gain.value = 0.04 + (i === 0 ? 0.03 : 0);
      osc.connect(f);
      f.connect(g);
      g.connect(this.musicGain);
      osc.start(t0);
      // slow vibrato / swell
      const lfo = this.ctx.createOscillator();
      const lfoG = this.ctx.createGain();
      lfo.frequency.value = 0.08 + i * 0.02;
      lfoG.gain.value = 4 + i;
      lfo.connect(lfoG);
      lfoG.connect(osc.frequency);
      lfo.start(t0);
      this._bgmNodes.push(osc, lfo, g, f, lfoG);
    }
    // Light pulse "drum" via filtered noise envelope loop
    this._pulseTimer = setInterval(() => this._pulse(), 1800);
  }

  stopBgm() {
    this._bgmOn = false;
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

  _pulse() {
    if (!this.ctx || this.muted || !this._bgmOn) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(55, t);
    osc.frequency.exponentialRampToValueAtTime(40, t + 0.25);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.08, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
    osc.connect(g);
    g.connect(this.musicGain);
    osc.start(t);
    osc.stop(t + 0.45);
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
