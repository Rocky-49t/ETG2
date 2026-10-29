// Procedural audio engine (Web Audio API). Everything is synthesized: no
// audio files. Provides spatial one-shots, loops, reverb, an underwater /
// muffle filter, per-level ambience beds and a tension drone.
import { settings } from '../core/settings.js';
import { SFX } from './sfx.js';
import { AMBIENCE } from './ambience.js';

class AudioEngine {
  constructor() {
    this.ctx = null;
    this.ready = false;
    this.voices = [];
    this.loops = new Set();
    this.listenerPos = { x: 0, y: 0, z: 0 };
    this.ambience = null;
    this.tensionLevel = 0;
  }

  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = this.ctx = new AC({ latencyHint: 'interactive' });
    this.master = ctx.createGain();
    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -14; this.comp.knee.value = 10; this.comp.ratio.value = 4;
    this.comp.attack.value = 0.003; this.comp.release.value = 0.25;
    this.muffle = ctx.createBiquadFilter();
    this.muffle.type = 'lowpass'; this.muffle.frequency.value = 20000; this.muffle.Q.value = 0.5;
    this.master.connect(this.muffle).connect(this.comp).connect(ctx.destination);

    this.sfxBus = ctx.createGain();
    this.ambBus = ctx.createGain();
    this.musicBus = ctx.createGain();
    this.uiBus = ctx.createGain();
    this.sfxBus.connect(this.master); this.ambBus.connect(this.master); this.musicBus.connect(this.master);
    this.uiBus.connect(this.comp);

    // reverb send
    this.reverb = ctx.createConvolver();
    this.reverbGain = ctx.createGain();
    this.reverbGain.gain.value = 0.35;
    this.reverb.connect(this.reverbGain).connect(this.master);
    this.setReverb(1.6, 2.5);

    this.noise = {
      white: this._noiseBuffer('white', 3),
      pink: this._noiseBuffer('pink', 4),
      brown: this._noiseBuffer('brown', 4),
    };
    this.applyVolumes();
    settings.on('change', k => { if (k.endsWith('Volume')) this.applyVolumes(); });
    this.ready = true;
    this._startTension();
  }

  applyVolumes() {
    if (!this.ctx) return;
    const m = settings.get('masterVolume');
    this.master.gain.value = m;
    this.uiBus.gain.value = m * 0.6;
    this.sfxBus.gain.value = settings.get('sfxVolume');
    this.ambBus.gain.value = settings.get('musicVolume') * 0.9;
    this.musicBus.gain.value = settings.get('musicVolume');
  }

  get now() { return this.ctx ? this.ctx.currentTime : 0; }

  _noiseBuffer(kind, seconds) {
    const ctx = this.ctx;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, last = 0;
      for (let i = 0; i < len; i++) {
        const w = Math.random() * 2 - 1;
        if (kind === 'white') d[i] = w * 0.5;
        else if (kind === 'pink') {
          b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852;
          b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
          d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11; b6 = w * 0.115926;
        } else {
          last = (last + 0.02 * w) / 1.02;
          d[i] = last * 3.5;
        }
      }
    }
    return buf;
  }

  setReverb(seconds, decay = 2.5) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        const t = i / len;
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, decay) * (i < 40 ? i / 40 : 1);
      }
    }
    this.reverb.buffer = buf;
  }

  setReverbMix(v) { if (this.reverbGain) this.reverbGain.gain.setTargetAtTime(v, this.now, 0.5); }

  // Listener from camera.
  updateListener(cam) {
    if (!this.ready) return;
    const l = this.ctx.listener;
    const p = cam.position;
    this.listenerPos = { x: p.x, y: p.y, z: p.z };
    const fx = -Math.sin(cam.rotation.y) * Math.cos(cam.rotation.x), fy = Math.sin(cam.rotation.x), fz = -Math.cos(cam.rotation.y) * Math.cos(cam.rotation.x);
    const t = this.now;
    if (l.positionX) {
      l.positionX.setTargetAtTime(p.x, t, 0.02); l.positionY.setTargetAtTime(p.y, t, 0.02); l.positionZ.setTargetAtTime(p.z, t, 0.02);
      l.forwardX.setTargetAtTime(fx, t, 0.02); l.forwardY.setTargetAtTime(fy, t, 0.02); l.forwardZ.setTargetAtTime(fz, t, 0.02);
      l.upX.value = 0; l.upY.value = 1; l.upZ.value = 0;
    } else {
      l.setPosition(p.x, p.y, p.z); l.setOrientation(fx, fy, fz, 0, 1, 0);
    }
  }

  setUnderwater(on) {
    if (!this.ready) return;
    this.muffle.frequency.setTargetAtTime(on ? 520 : 20000, this.now, 0.08);
  }
  setMuffle(amount) { // 0..1 (hiding in a locker, downed)
    if (!this.ready) return;
    this.muffle.frequency.setTargetAtTime(20000 * Math.pow(0.04, amount), this.now, 0.15);
  }

  // Create an output chain for a sound: [panner?] -> gain -> bus (+ reverb send).
  _out(opts) {
    const ctx = this.ctx;
    const g = ctx.createGain();
    g.gain.value = opts.volume ?? 1;
    let head = g;
    if (opts.occluded) {
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900;
      lp.connect(g); head = lp;
    }
    if (opts.pos) {
      const p = ctx.createPanner();
      p.panningModel = settings.get('quality') === 'low' ? 'equalpower' : 'HRTF';
      p.distanceModel = 'inverse';
      p.refDistance = opts.ref ?? 2;
      p.maxDistance = 200;
      p.rolloffFactor = opts.rolloff ?? 1.2;
      if (p.positionX) { p.positionX.value = opts.pos.x; p.positionY.value = opts.pos.y; p.positionZ.value = opts.pos.z; }
      else p.setPosition(opts.pos.x, opts.pos.y, opts.pos.z);
      p.connect(head);
      g._panner = p;
      head = p;
    }
    g.connect(opts.bus || this.sfxBus);
    if ((opts.reverb ?? 0.5) > 0) {
      const s = ctx.createGain(); s.gain.value = opts.reverb ?? 0.5;
      g.connect(s).connect(this.reverb);
    }
    return { input: head, gain: g };
  }

  // Play a one-shot recipe by name.
  play(name, opts = {}) {
    if (!this.ready) return null;
    const recipe = SFX[name];
    if (!recipe) return null;
    if (opts.pos) {
      const d = Math.hypot(opts.pos.x - this.listenerPos.x, opts.pos.y - this.listenerPos.y, opts.pos.z - this.listenerPos.z);
      if (d > (opts.maxDist ?? 70)) return null;
    }
    // voice limit
    const t = this.now;
    this.voices = this.voices.filter(v => v.end > t);
    if (this.voices.length > 40) return null;
    const out = this._out(opts);
    const dur = recipe(this, out.input, opts, t) || 1;
    this.voices.push({ end: t + dur });
    setTimeout(() => { try { out.gain.disconnect(); } catch { /* ignore */ } }, (dur + 0.6) * 1000);
    return out;
  }

  // Looping positional sound; recipe returns {stop(), set(params)}.
  loop(name, opts = {}) {
    if (!this.ready) return null;
    const recipe = SFX[name];
    if (!recipe) return null;
    const out = this._out({ ...opts, reverb: opts.reverb ?? 0.3 });
    const ctl = recipe(this, out.input, { ...opts, loop: true }, this.now) || {};
    const handle = {
      out,
      setPos: p => {
        const pn = out.gain._panner;
        if (!pn) return;
        if (pn.positionX) { pn.positionX.setTargetAtTime(p.x, this.now, 0.05); pn.positionY.setTargetAtTime(p.y, this.now, 0.05); pn.positionZ.setTargetAtTime(p.z, this.now, 0.05); }
        else pn.setPosition(p.x, p.y, p.z);
      },
      setVolume: v => out.gain.gain.setTargetAtTime(v, this.now, 0.1),
      set: (k, v) => ctl.set?.(k, v),
      stop: (fade = 0.3) => {
        out.gain.gain.setTargetAtTime(0, this.now, fade / 3);
        setTimeout(() => { try { ctl.stop?.(); out.gain.disconnect(); } catch { /* ignore */ } }, fade * 1000 + 100);
        this.loops.delete(handle);
      },
    };
    this.loops.add(handle);
    return handle;
  }

  // Level ambience bed.
  setAmbience(profile) {
    if (!this.ready) return;
    if (this.ambience) { this.ambience.stop(); this.ambience = null; }
    const fn = AMBIENCE[profile];
    if (!fn) return;
    const out = this.ctx.createGain();
    out.gain.value = 0;
    out.connect(this.ambBus);
    out.gain.setTargetAtTime(1, this.now, 1.5);
    const ctl = fn(this, out);
    this.ambience = {
      update: (dt, info) => ctl.update?.(dt, info),
      stop: () => {
        out.gain.setTargetAtTime(0, this.now, 0.6);
        setTimeout(() => { try { ctl.stop?.(); out.disconnect(); } catch { /* ignore */ } }, 2500);
      },
    };
    const rv = ctl.reverb || [1.6, 2.5, 0.35];
    this.setReverb(rv[0], rv[1]);
    this.setReverbMix(rv[2]);
  }

  // Tension drone: low dissonant pad that swells with danger.
  _startTension() {
    const ctx = this.ctx;
    const g = ctx.createGain(); g.gain.value = 0;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 300;
    g.connect(this.musicBus);
    lp.connect(g);
    const freqs = [41.2, 43.65, 61.7, 87.3];
    this.tensionOsc = freqs.map((f, i) => {
      const o = ctx.createOscillator(); o.type = i % 2 ? 'sawtooth' : 'triangle'; o.frequency.value = f;
      const og = ctx.createGain(); og.gain.value = 0.12;
      o.connect(og).connect(lp); o.start();
      return o;
    });
    const n = ctx.createBufferSource(); n.buffer = this.noise.pink; n.loop = true;
    const nf = ctx.createBiquadFilter(); nf.type = 'bandpass'; nf.frequency.value = 900; nf.Q.value = 3;
    const ng = ctx.createGain(); ng.gain.value = 0.05;
    n.connect(nf).connect(ng).connect(g); n.start();
    this.tension = { g, lp, nf };
  }

  setTension(v, dt = 0.1) {
    if (!this.ready || !this.tension) return;
    this.tensionLevel += (v - this.tensionLevel) * Math.min(1, dt * 0.8);
    const tl = this.tensionLevel;
    this.tension.g.gain.setTargetAtTime(tl * tl * 0.5, this.now, 0.3);
    this.tension.lp.frequency.setTargetAtTime(180 + tl * 900, this.now, 0.3);
    this.tension.nf.frequency.setTargetAtTime(500 + tl * 2200, this.now, 0.5);
  }

  stopAll() {
    for (const l of [...this.loops]) l.stop(0.2);
    if (this.ambience) { this.ambience.stop(); this.ambience = null; }
    this.setTension(0, 10);
  }
}

export const audio = new AudioEngine();
