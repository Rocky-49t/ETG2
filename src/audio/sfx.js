// Sound recipes. Each takes (audioEngine, destinationNode, opts, startTime)
// and returns its duration in seconds (one-shots) or a controller (loops).

const rnd = (a, b) => a + Math.random() * (b - a);

function noiseSrc(A, kind = 'white', rate = 1) {
  const s = A.ctx.createBufferSource();
  s.buffer = A.noise[kind];
  s.playbackRate.value = rate;
  s.loop = true;
  return s;
}
function filt(A, type, freq, Q = 1) {
  const f = A.ctx.createBiquadFilter();
  f.type = type; f.frequency.value = freq; f.Q.value = Q;
  return f;
}
function gain(A, v = 1) { const g = A.ctx.createGain(); g.gain.value = v; return g; }
function osc(A, type, freq) { const o = A.ctx.createOscillator(); o.type = type; o.frequency.value = freq; return o; }
// Attack/decay envelope on a gain param.
function env(g, t, a, peak, d, sustain = 0) {
  g.gain.cancelScheduledValues(t);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(peak, t + a);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0001, sustain || 0.0001), t + a + d);
}
function burst(A, dest, t, { kind = 'white', type = 'bandpass', freq = 1000, Q = 1, a = 0.002, d = 0.1, vol = 1, rate = 1, sweepTo = null }) {
  const n = noiseSrc(A, kind, rate);
  const f = filt(A, type, freq, Q);
  if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + a + d);
  const g = gain(A, 0);
  n.connect(f).connect(g).connect(dest);
  env(g, t, a, vol, d);
  n.start(t, Math.random() * 2);
  n.stop(t + a + d + 0.05);
  return a + d;
}
function tone(A, dest, t, { type = 'sine', freq = 440, to = null, a = 0.005, d = 0.2, vol = 0.5, detune = 0 }) {
  const o = osc(A, type, freq);
  o.detune.value = detune;
  if (to) o.frequency.exponentialRampToValueAtTime(Math.max(1, to), t + a + d);
  const g = gain(A, 0);
  o.connect(g).connect(dest);
  env(g, t, a, vol, d);
  o.start(t);
  o.stop(t + a + d + 0.05);
  return a + d;
}

export const SFX = {
  // ---------------------------------------------------------------- player
  step(A, dest, o, t) {
    const s = o.surface || 'carpet';
    const v = (o.volume ?? 1);
    if (s === 'carpet') { burst(A, dest, t, { kind: 'pink', type: 'lowpass', freq: 520, d: 0.09, vol: 0.5 * v }); tone(A, dest, t, { freq: 70, to: 45, d: 0.07, vol: 0.25 * v }); return 0.12; }
    if (s === 'concrete' || s === 'tile') {
      burst(A, dest, t, { type: 'bandpass', freq: s === 'tile' ? 2600 : 1700, Q: 1.2, d: 0.06, vol: 0.5 * v });
      burst(A, dest, t + 0.012, { kind: 'pink', type: 'lowpass', freq: 400, d: 0.08, vol: 0.4 * v });
      return 0.12;
    }
    if (s === 'metal') {
      burst(A, dest, t, { type: 'bandpass', freq: 2200, Q: 2, d: 0.05, vol: 0.45 * v });
      tone(A, dest, t, { type: 'triangle', freq: rnd(380, 460), d: 0.18, vol: 0.12 * v });
      tone(A, dest, t, { type: 'sine', freq: rnd(900, 1100), d: 0.12, vol: 0.05 * v });
      return 0.2;
    }
    if (s === 'water') {
      burst(A, dest, t, { type: 'bandpass', freq: 900, Q: 0.8, d: 0.18, vol: 0.55 * v, sweepTo: 2600 });
      burst(A, dest, t + 0.05, { type: 'highpass', freq: 3000, d: 0.12, vol: 0.2 * v });
      return 0.25;
    }
    return 0.1;
  },
  land(A, dest, o, t) {
    tone(A, dest, t, { freq: 90, to: 40, d: 0.18, vol: 0.6 * (o.volume ?? 1) });
    burst(A, dest, t, { kind: 'pink', type: 'lowpass', freq: 700, d: 0.15, vol: 0.6 * (o.volume ?? 1) });
    return 0.25;
  },
  splash(A, dest, o, t) {
    const v = o.volume ?? 1;
    burst(A, dest, t, { type: 'bandpass', freq: 700, Q: 0.6, a: 0.01, d: 0.5, vol: 0.8 * v, sweepTo: 3000 });
    burst(A, dest, t + 0.08, { type: 'highpass', freq: 2500, d: 0.6, vol: 0.3 * v });
    for (let i = 0; i < 4; i++) tone(A, dest, t + 0.1 + i * 0.07, { freq: rnd(500, 1300), to: rnd(1400, 2200), d: 0.06, vol: 0.06 * v });
    return 0.8;
  },
  swim(A, dest, o, t) {
    burst(A, dest, t, { kind: 'pink', type: 'bandpass', freq: 600, Q: 0.7, a: 0.05, d: 0.35, vol: 0.35, sweepTo: 1400 });
    return 0.4;
  },
  bubbles(A, dest, o, t) {
    for (let i = 0; i < 6; i++) tone(A, dest, t + i * rnd(0.04, 0.1), { freq: rnd(300, 700), to: rnd(900, 1500), d: 0.05, vol: 0.08 });
    return 0.7;
  },
  breathe(A, dest, o, t) {
    burst(A, dest, t, { kind: 'pink', type: 'bandpass', freq: 1100, Q: 0.8, a: 0.35, d: 0.6, vol: 0.18 * (o.volume ?? 1) });
    return 1;
  },
  heartbeat(A, dest, o, t) {
    const v = o.volume ?? 0.6;
    tone(A, dest, t, { freq: 58, to: 40, a: 0.01, d: 0.14, vol: v });
    tone(A, dest, t + 0.22, { freq: 52, to: 38, a: 0.01, d: 0.16, vol: v * 0.75 });
    return 0.5;
  },
  hurt(A, dest, o, t) {
    tone(A, dest, t, { type: 'sawtooth', freq: rnd(180, 230), to: 120, a: 0.01, d: 0.18, vol: 0.12 });
    burst(A, dest, t, { kind: 'pink', type: 'lowpass', freq: 500, d: 0.2, vol: 0.5 });
    return 0.3;
  },
  // ---------------------------------------------------------------- items
  pickup(A, dest, o, t) {
    burst(A, dest, t, { kind: 'pink', type: 'bandpass', freq: 2500, Q: 0.7, d: 0.08, vol: 0.3 });
    tone(A, dest, t + 0.03, { type: 'triangle', freq: 820, to: 1250, d: 0.08, vol: 0.06 });
    return 0.15;
  },
  drink(A, dest, o, t) {
    for (let i = 0; i < 4; i++) {
      tone(A, dest, t + i * 0.24, { freq: rnd(160, 220), to: rnd(320, 420), a: 0.02, d: 0.12, vol: 0.18 });
      burst(A, dest, t + i * 0.24, { kind: 'pink', type: 'lowpass', freq: 600, d: 0.1, vol: 0.18 });
    }
    return 1.1;
  },
  eat(A, dest, o, t) {
    for (let i = 0; i < 5; i++) burst(A, dest, t + i * 0.18 + rnd(0, 0.04), { type: 'bandpass', freq: rnd(1800, 3200), Q: 1.5, d: 0.06, vol: 0.35 });
    return 1;
  },
  bandage(A, dest, o, t) {
    burst(A, dest, t, { type: 'bandpass', freq: 3500, Q: 1, a: 0.02, d: 0.4, vol: 0.3, sweepTo: 1800 });
    burst(A, dest, t + 0.7, { type: 'bandpass', freq: 3000, Q: 1, a: 0.02, d: 0.3, vol: 0.25 });
    return 1.2;
  },
  pills(A, dest, o, t) {
    for (let i = 0; i < 6; i++) tone(A, dest, t + i * 0.05, { type: 'square', freq: rnd(2500, 4000), d: 0.02, vol: 0.03 });
    return 0.5;
  },
  click(A, dest, o, t) {
    tone(A, dest, t, { type: 'square', freq: 1800, d: 0.012, vol: 0.06 });
    burst(A, dest, t, { type: 'highpass', freq: 4000, d: 0.02, vol: 0.2 });
    return 0.05;
  },
  ui(A, dest, o, t) { tone(A, dest, t, { type: 'triangle', freq: o.freq || 660, d: 0.06, vol: 0.05 }); return 0.08; },
  battery(A, dest, o, t) {
    tone(A, dest, t, { type: 'square', freq: 900, d: 0.02, vol: 0.05 });
    tone(A, dest, t + 0.12, { type: 'square', freq: 1300, d: 0.02, vol: 0.05 });
    return 0.2;
  },
  throw(A, dest, o, t) { burst(A, dest, t, { kind: 'pink', type: 'bandpass', freq: 700, Q: 1, a: 0.04, d: 0.18, vol: 0.4, sweepTo: 2200 }); return 0.25; },
  thud(A, dest, o, t) {
    tone(A, dest, t, { freq: 120, to: 60, d: 0.1, vol: 0.3 * (o.volume ?? 1) });
    burst(A, dest, t, { type: 'bandpass', freq: 1200, d: 0.05, vol: 0.25 * (o.volume ?? 1) });
    return 0.15;
  },
  glowCrack(A, dest, o, t) {
    burst(A, dest, t, { type: 'highpass', freq: 3000, d: 0.04, vol: 0.4 });
    burst(A, dest, t + 0.06, { type: 'bandpass', freq: 2000, d: 0.3, vol: 0.12, sweepTo: 5000 });
    return 0.4;
  },
  flareLoop(A, dest, o) {
    const n = noiseSrc(A, 'pink'); const f = filt(A, 'bandpass', 2600, 0.5); const g = gain(A, 0.35);
    const lfo = osc(A, 'sine', 9); const lg = gain(A, 0.12); lfo.connect(lg).connect(g.gain);
    n.connect(f).connect(g).connect(dest); n.start(); lfo.start();
    return { stop() { n.stop(); lfo.stop(); } };
  },
  musicBox(A, dest, o) {
    // loud tinkling melody loop
    const notes = [0, 4, 7, 12, 7, 4, 2, 5, 9, 14, 9, 5];
    let i = 0, stopped = false;
    const base = 880;
    const tick = () => {
      if (stopped) return;
      const t = A.now;
      const f = base * Math.pow(2, notes[i % notes.length] / 12);
      tone(A, dest, t, { type: 'sine', freq: f, a: 0.002, d: 0.5, vol: 0.35 });
      tone(A, dest, t, { type: 'sine', freq: f * 2.01, a: 0.002, d: 0.25, vol: 0.08 });
      i++;
      setTimeout(tick, 210 + (i % 4 === 0 ? 100 : 0));
    };
    tick();
    return { stop() { stopped = true; } };
  },
  lighterFlick(A, dest, o, t) {
    burst(A, dest, t, { type: 'highpass', freq: 5000, d: 0.03, vol: 0.4 });
    burst(A, dest, t + 0.04, { kind: 'pink', type: 'bandpass', freq: 1200, a: 0.02, d: 0.3, vol: 0.2 });
    return 0.4;
  },
  fireLoop(A, dest) {
    const n = noiseSrc(A, 'pink'); const f = filt(A, 'lowpass', 900, 0.5); const g = gain(A, 0.25);
    n.connect(f).connect(g).connect(dest); n.start();
    let alive = true;
    const crackle = () => {
      if (!alive) return;
      burst(A, dest, A.now, { type: 'highpass', freq: 2500, d: 0.01, vol: rnd(0.05, 0.2) });
      setTimeout(crackle, rnd(40, 260));
    };
    crackle();
    return { stop() { alive = false; n.stop(); } };
  },
  // ---------------------------------------------------------------- weapons
  pistol(A, dest, o, t) {
    burst(A, dest, t, { type: 'lowpass', freq: 3800, a: 0.001, d: 0.14, vol: 1.0 });
    burst(A, dest, t, { type: 'highpass', freq: 2000, a: 0.001, d: 0.05, vol: 0.6 });
    tone(A, dest, t, { freq: 140, to: 45, a: 0.001, d: 0.16, vol: 0.9 });
    return 0.4;
  },
  rifle(A, dest, o, t) {
    // sharp supersonic crack, mechanical clack, then a rolling boom tail
    burst(A, dest, t, { type: 'highpass', freq: 2600, a: 0.0005, d: 0.035, vol: 0.9 });
    burst(A, dest, t, { type: 'lowpass', freq: 3000, a: 0.001, d: 0.12, vol: 1.0 });
    tone(A, dest, t, { freq: 160, to: 40, a: 0.001, d: 0.18, vol: 0.95 });
    burst(A, dest, t + 0.03, { kind: 'pink', type: 'lowpass', freq: 420, a: 0.01, d: 0.45, vol: 0.45 });
    burst(A, dest, t + 0.012, { type: 'bandpass', freq: 3200, Q: 3, d: 0.02, vol: 0.18 });
    return 0.6;
  },
  smg(A, dest, o, t) {
    burst(A, dest, t, { type: 'lowpass', freq: 3200, a: 0.001, d: 0.09, vol: 0.85 });
    tone(A, dest, t, { freq: 120, to: 50, a: 0.001, d: 0.1, vol: 0.7 });
    return 0.25;
  },
  shotgun(A, dest, o, t) {
    burst(A, dest, t, { type: 'lowpass', freq: 2500, a: 0.001, d: 0.35, vol: 1.3 });
    burst(A, dest, t, { kind: 'pink', type: 'lowpass', freq: 600, a: 0.002, d: 0.5, vol: 1.0 });
    tone(A, dest, t, { freq: 90, to: 32, a: 0.001, d: 0.3, vol: 1.1 });
    return 0.8;
  },
  pump(A, dest, o, t) {
    burst(A, dest, t, { type: 'bandpass', freq: 1500, Q: 2, d: 0.08, vol: 0.4 });
    burst(A, dest, t + 0.18, { type: 'bandpass', freq: 2200, Q: 2, d: 0.06, vol: 0.45 });
    tone(A, dest, t + 0.18, { type: 'square', freq: 600, d: 0.03, vol: 0.05 });
    return 0.4;
  },
  dryfire(A, dest, o, t) { tone(A, dest, t, { type: 'square', freq: 2400, d: 0.015, vol: 0.08 }); burst(A, dest, t, { type: 'highpass', freq: 5000, d: 0.02, vol: 0.2 }); return 0.05; },
  reload(A, dest, o, t) {
    const steps = o.steps || [0, 0.35, 0.8];
    for (const s of steps) {
      burst(A, dest, t + s, { type: 'bandpass', freq: rnd(1600, 2600), Q: 3, d: 0.04, vol: 0.4 });
      tone(A, dest, t + s, { type: 'square', freq: rnd(700, 1000), d: 0.015, vol: 0.04 });
    }
    return steps[steps.length - 1] + 0.1;
  },
  shellIn(A, dest, o, t) { burst(A, dest, t, { type: 'bandpass', freq: 1900, Q: 3, d: 0.05, vol: 0.35 }); return 0.1; },
  swing(A, dest, o, t) { burst(A, dest, t, { kind: 'pink', type: 'bandpass', freq: 500, Q: 1.2, a: 0.03, d: 0.16, vol: 0.5, sweepTo: 1800 }); return 0.22; },
  hitFlesh(A, dest, o, t) {
    tone(A, dest, t, { freq: 110, to: 50, d: 0.12, vol: 0.55 });
    burst(A, dest, t, { kind: 'pink', type: 'lowpass', freq: 900, d: 0.12, vol: 0.6 });
    burst(A, dest, t, { type: 'bandpass', freq: 2200, Q: 1, d: 0.05, vol: 0.2 });
    return 0.2;
  },
  hitBone(A, dest, o, t) {
    burst(A, dest, t, { type: 'bandpass', freq: 2800, Q: 3, d: 0.06, vol: 0.5 });
    tone(A, dest, t, { type: 'triangle', freq: rnd(600, 900), d: 0.08, vol: 0.12 });
    return 0.12;
  },
  hitWall(A, dest, o, t) {
    burst(A, dest, t, { type: 'bandpass', freq: rnd(1500, 3000), Q: 1.5, d: 0.07, vol: 0.4 });
    tone(A, dest, t, { type: 'triangle', freq: rnd(300, 500), d: 0.12, vol: 0.06 });
    return 0.15;
  },
  ricochet(A, dest, o, t) { tone(A, dest, t, { type: 'sine', freq: rnd(2500, 3500), to: rnd(900, 1400), d: 0.25, vol: 0.06 }); return 0.3; },
  // ---------------------------------------------------------------- world
  doorOpen(A, dest, o, t) {
    const v = o.volume ?? 1;
    const s = osc(A, 'sawtooth', rnd(90, 130)); const f = filt(A, 'bandpass', 900, 8); const g = gain(A, 0);
    s.frequency.linearRampToValueAtTime(rnd(160, 240), t + 0.6);
    s.connect(f).connect(g).connect(dest);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.12 * v, t + 0.1); g.gain.linearRampToValueAtTime(0.0001, t + 0.7);
    s.start(t); s.stop(t + 0.75);
    burst(A, dest, t, { type: 'bandpass', freq: 800, d: 0.06, vol: 0.3 * v });
    return 0.8;
  },
  doorClose(A, dest, o, t) {
    tone(A, dest, t, { freq: 80, to: 45, d: 0.2, vol: 0.6 * (o.volume ?? 1) });
    burst(A, dest, t, { kind: 'pink', type: 'lowpass', freq: 800, d: 0.2, vol: 0.7 * (o.volume ?? 1) });
    return 0.3;
  },
  doorLocked(A, dest, o, t) {
    for (let i = 0; i < 3; i++) burst(A, dest, t + i * 0.09, { type: 'bandpass', freq: 1400, Q: 4, d: 0.04, vol: 0.4 });
    return 0.35;
  },
  unlock(A, dest, o, t) {
    burst(A, dest, t, { type: 'bandpass', freq: 2000, Q: 4, d: 0.05, vol: 0.4 });
    tone(A, dest, t + 0.15, { type: 'square', freq: 1200, d: 0.05, vol: 0.06 });
    tone(A, dest, t + 0.25, { type: 'square', freq: 1600, d: 0.08, vol: 0.06 });
    return 0.4;
  },
  metalDoor(A, dest, o, t) {
    tone(A, dest, t, { type: 'sawtooth', freq: 55, to: 50, a: 0.05, d: 1.2, vol: 0.3 });
    burst(A, dest, t, { kind: 'brown', type: 'lowpass', freq: 400, a: 0.1, d: 1.3, vol: 0.9 });
    burst(A, dest, t + 1.2, { type: 'bandpass', freq: 600, d: 0.3, vol: 0.6 });
    return 1.6;
  },
  locker(A, dest, o, t) {
    burst(A, dest, t, { type: 'bandpass', freq: 1300, Q: 2, d: 0.12, vol: 0.5 });
    tone(A, dest, t, { type: 'triangle', freq: rnd(240, 320), d: 0.4, vol: 0.12 });
    tone(A, dest, t, { type: 'sine', freq: rnd(700, 820), d: 0.3, vol: 0.05 });
    return 0.5;
  },
  rummage(A, dest, o, t) {
    for (let i = 0; i < 5; i++) burst(A, dest, t + i * rnd(0.06, 0.12), { kind: 'pink', type: 'bandpass', freq: rnd(1200, 3000), Q: 1, d: 0.07, vol: 0.25 });
    return 0.7;
  },
  paper(A, dest, o, t) { burst(A, dest, t, { type: 'bandpass', freq: 4000, Q: 0.8, a: 0.03, d: 0.25, vol: 0.2 }); return 0.3; },
  fallWhoosh(A, dest, o, t) { burst(A, dest, t, { kind: 'pink', type: 'bandpass', freq: 400, Q: 0.8, a: 0.4, d: 1.6, vol: 0.8, sweepTo: 2400 }); return 2; },
  transition(A, dest, o, t) {
    tone(A, dest, t, { type: 'sine', freq: 50, to: 25, a: 0.5, d: 2.5, vol: 0.6 });
    burst(A, dest, t, { kind: 'brown', type: 'lowpass', freq: 300, a: 0.5, d: 2.5, vol: 0.8 });
    return 3;
  },
  lightBuzz(A, dest) {
    const o1 = osc(A, 'sawtooth', 120); const f = filt(A, 'bandpass', 2400, 4); const g = gain(A, 0.0);
    o1.connect(f).connect(g).connect(dest); o1.start();
    return { stop() { o1.stop(); }, set(k, v) { if (k === 'level') g.gain.setTargetAtTime(v * 0.08, A.now, 0.01); } };
  },
  // muffled speech: a run of formant-filtered syllables
  talk(A, dest, o, t) {
    const dur = Math.min(4.5, o.dur || 2), pitch = o.pitch || 1;
    let tt = t;
    while (tt < t + dur) {
      const syl = rnd(0.07, 0.17);
      const f0 = (110 + Math.random() * 40) * pitch;
      const v = osc(A, 'sawtooth', f0);
      const f1 = filt(A, 'bandpass', rnd(500, 900) * pitch, 4); const f2 = filt(A, 'bandpass', rnd(1200, 2200) * pitch, 6);
      const g = gain(A, 0);
      v.connect(f1).connect(g); v.connect(f2).connect(g); g.connect(dest);
      g.gain.setValueAtTime(0, tt); g.gain.linearRampToValueAtTime(0.09 * (o.volume ?? 1), tt + 0.02); g.gain.linearRampToValueAtTime(0, tt + syl);
      v.start(tt); v.stop(tt + syl + 0.02);
      tt += syl + (Math.random() < 0.2 ? rnd(0.12, 0.3) : rnd(0.01, 0.05));
    }
    return dur + 0.2;
  },
  beepAlert(A, dest, o, t) {
    tone(A, dest, t, { type: 'square', freq: 880, d: 0.09, vol: 0.05 * (o.volume ?? 1) });
    tone(A, dest, t + 0.14, { type: 'square', freq: 660, d: 0.12, vol: 0.05 * (o.volume ?? 1) });
    return 0.35;
  },
  radioStatic(A, dest, o, t) {
    burst(A, dest, t, { type: 'bandpass', freq: 2400, Q: 0.8, a: 0.02, d: 0.9, vol: 0.18 * (o.volume ?? 1) });
    burst(A, dest, t + 0.1, { type: 'highpass', freq: 5000, a: 0.01, d: 0.5, vol: 0.08 });
    return 1.1;
  },
  spark(A, dest, o, t) {
    for (let i = 0; i < 4; i++) burst(A, dest, t + i * rnd(0.02, 0.06), { type: 'highpass', freq: 3500, a: 0.001, d: 0.02, vol: 0.25 * (o.volume ?? 1) });
    tone(A, dest, t, { type: 'square', freq: 120, d: 0.08, vol: 0.04 });
    return 0.3;
  },
  transferWhine(A, dest, o, t) {
    // rising scream of the binding array + sub drop at the end
    const v = osc(A, 'sawtooth', 120); const f = filt(A, 'bandpass', 600, 3); const g = gain(A, 0);
    v.frequency.setValueAtTime(120, t); v.frequency.exponentialRampToValueAtTime(1800, t + 3.8);
    f.frequency.setValueAtTime(600, t); f.frequency.exponentialRampToValueAtTime(4200, t + 3.8);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.16, t + 3.2); g.gain.linearRampToValueAtTime(0, t + 4.1);
    v.connect(f).connect(g).connect(dest); v.start(t); v.stop(t + 4.2);
    burst(A, dest, t, { kind: 'pink', type: 'lowpass', freq: 900, a: 3.5, d: 0.6, vol: 0.5 });
    tone(A, dest, t + 3.9, { freq: 70, to: 25, a: 0.01, d: 1.4, vol: 0.9 });
    return 5.5;
  },
  machineHum(A, dest) {
    const o1 = osc(A, 'sawtooth', 55); const o2 = osc(A, 'sine', 110.5); const o3 = osc(A, 'triangle', 220);
    const f = filt(A, 'lowpass', 400, 1.5); const g = gain(A, 0);
    const lfoO = osc(A, 'sine', 3.1); const lg = gain(A, 0.0); lfoO.connect(lg).connect(g.gain);
    o1.connect(f); o2.connect(f); o3.connect(f); f.connect(g).connect(dest);
    o1.start(); o2.start(); o3.start(); lfoO.start();
    return {
      stop() { o1.stop(); o2.stop(); o3.stop(); lfoO.stop(); },
      set(k, v) {
        if (k !== 'level') return;
        g.gain.setTargetAtTime(v * 0.22, A.now, 0.3);
        lg.gain.setTargetAtTime(v * 0.06, A.now, 0.3);
        f.frequency.setTargetAtTime(300 + v * 2400, A.now, 0.5);
        o1.frequency.setTargetAtTime(55 + v * 30, A.now, 0.8); o3.frequency.setTargetAtTime(220 + v * 260, A.now, 0.8);
      },
    };
  },
  // faint two-note chirp from objective items (keycards, fuses, valve keys)
  keyChirp(A, dest, o, t) {
    tone(A, dest, t, { freq: 1320, d: 0.09, vol: 0.05 });
    tone(A, dest, t + 0.12, { freq: 1760, d: 0.12, vol: 0.04 });
    return 0.3;
  },
  // cold air moaning up out of an exit: low wind with a slow swell and a hollow tone
  draftLoop(A, dest) {
    const n = noiseSrc(A, 'brown'); const f = filt(A, 'bandpass', 260, 0.9); const g = gain(A, 0.0);
    const lfo = osc(A, 'sine', 0.13); const lg = gain(A, 120); lfo.connect(lg).connect(f.frequency);
    const t1 = osc(A, 'sine', 73); const tg = gain(A, 0.035);
    const sw = osc(A, 'sine', 0.07); const sg = gain(A, 0.02); sw.connect(sg).connect(tg.gain);
    n.connect(f).connect(g).connect(dest); t1.connect(tg).connect(g);
    n.start(); lfo.start(); t1.start(); sw.start();
    return { stop() { n.stop(); lfo.stop(); t1.stop(); sw.stop(); }, set(k, v) { if (k === 'level') g.gain.setTargetAtTime(v * 0.9, A.now, 0.4); } };
  },
  machineLoop(A, dest, o) {
    const base = o.freq || 48;
    const o1 = osc(A, 'sawtooth', base); const o2 = osc(A, 'square', base * 2.01);
    const f = filt(A, 'lowpass', 280, 1.5); const g = gain(A, 0.18);
    const lfo = osc(A, 'sine', rnd(0.8, 2.5)); const lg = gain(A, 0.06); lfo.connect(lg).connect(g.gain);
    const n = noiseSrc(A, 'pink'); const nf = filt(A, 'bandpass', 1800, 2); const ng = gain(A, 0.05);
    o1.connect(f); o2.connect(f); f.connect(g).connect(dest); n.connect(nf).connect(ng).connect(dest);
    o1.start(); o2.start(); lfo.start(); n.start();
    return { stop() { o1.stop(); o2.stop(); lfo.stop(); n.stop(); } };
  },
  steamHiss(A, dest, o, t) { burst(A, dest, t, { type: 'highpass', freq: 3000, a: 0.08, d: rnd(0.8, 1.8), vol: 0.4 }); return 2; },
  waterLoop(A, dest) {
    const n = noiseSrc(A, 'pink'); const f = filt(A, 'bandpass', 700, 0.6); const g = gain(A, 0.3);
    const lfo = osc(A, 'sine', 0.3); const lg = gain(A, 200); lfo.connect(lg).connect(f.frequency);
    n.connect(f).connect(g).connect(dest); n.start(); lfo.start();
    return { stop() { n.stop(); lfo.stop(); } };
  },
  drip(A, dest, o, t) {
    const f0 = rnd(900, 1800);
    tone(A, dest, t, { freq: f0, to: f0 * 1.8, a: 0.001, d: 0.06, vol: 0.12 * (o.volume ?? 1) });
    return 0.1;
  },
  phoneRing(A, dest, o, t) {
    for (let r = 0; r < 2; r++) {
      for (let i = 0; i < 12; i++) {
        tone(A, dest, t + r * 2 + i * 0.05, { type: 'square', freq: 480, d: 0.04, vol: 0.03 });
        tone(A, dest, t + r * 2 + i * 0.05, { type: 'square', freq: 620, d: 0.04, vol: 0.03 });
      }
    }
    return 4;
  },
  distantThud(A, dest, o, t) {
    tone(A, dest, t, { freq: 45, to: 30, a: 0.02, d: 0.8, vol: 0.5 });
    burst(A, dest, t, { kind: 'brown', type: 'lowpass', freq: 200, a: 0.02, d: 0.9, vol: 0.6 });
    return 1;
  },
  metalGroan(A, dest, o, t) {
    const s = osc(A, 'sawtooth', rnd(40, 70)); const f = filt(A, 'bandpass', rnd(300, 600), 12); const g = gain(A, 0);
    s.frequency.linearRampToValueAtTime(rnd(30, 90), t + 2.5);
    f.frequency.linearRampToValueAtTime(rnd(200, 900), t + 2.5);
    s.connect(f).connect(g).connect(dest);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.3, t + 0.6); g.gain.linearRampToValueAtTime(0.0001, t + 2.8);
    s.start(t); s.stop(t + 3);
    return 3;
  },
  // ---------------------------------------------------------------- horror
  stinger(A, dest, o, t) {
    const k = o.intensity ?? 1;
    const base = rnd(55, 75);
    [1, 1.06, 1.5, 2.12, 2.83].forEach((m, i) => tone(A, dest, t, { type: i % 2 ? 'sawtooth' : 'triangle', freq: base * m, a: 0.02, d: 2.2, vol: 0.08 * k }));
    burst(A, dest, t, { type: 'bandpass', freq: 3000, Q: 6, a: 0.01, d: 1.5, vol: 0.4 * k, sweepTo: 600 });
    tone(A, dest, t, { freq: 60, to: 28, a: 0.005, d: 1.2, vol: 0.7 * k });
    return 2.4;
  },
  scrape(A, dest, o, t) {
    const n = noiseSrc(A, 'white'); const f = filt(A, 'bandpass', 2400, 14); const g = gain(A, 0);
    f.frequency.linearRampToValueAtTime(rnd(900, 4000), t + 1.4);
    n.connect(f).connect(g).connect(dest);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.5, t + 0.3); g.gain.linearRampToValueAtTime(0.0001, t + 1.5);
    n.start(t); n.stop(t + 1.6);
    return 1.6;
  },
  whisper(A, dest, o, t) {
    const dur = rnd(0.8, 1.8);
    for (let i = 0; i < 6; i++) {
      const st = t + (i / 6) * dur;
      burst(A, dest, st, { kind: 'white', type: 'bandpass', freq: rnd(1200, 3200), Q: 6, a: 0.05, d: rnd(0.1, 0.25), vol: rnd(0.08, 0.2) * (o.volume ?? 1) });
    }
    return dur + 0.3;
  },
  footstepsFake(A, dest, o, t) {
    for (let i = 0; i < 5; i++) SFX.step(A, dest, { surface: o.surface || 'carpet', volume: 0.8 }, t + i * 0.42);
    return 2.4;
  },
  knock(A, dest, o, t) {
    for (let i = 0; i < 3; i++) { tone(A, dest, t + i * 0.28, { freq: 160, to: 90, d: 0.08, vol: 0.5 }); burst(A, dest, t + i * 0.28, { type: 'bandpass', freq: 900, d: 0.05, vol: 0.4 }); }
    return 1;
  },
  // ---------------------------------------------------------------- entities
  hushClick(A, dest, o, t) {
    for (let i = 0; i < 3; i++) burst(A, dest, t + i * rnd(0.05, 0.09), { type: 'bandpass', freq: rnd(2500, 4200), Q: 8, d: 0.015, vol: 0.5 });
    return 0.3;
  },
  hushInhale(A, dest, o, t) {
    burst(A, dest, t, { kind: 'pink', type: 'bandpass', freq: 1500, Q: 1.5, a: 0.6, d: 0.4, vol: 0.4, sweepTo: 2600 });
    return 1.1;
  },
  hushShriek(A, dest, o, t) {
    const s = osc(A, 'sawtooth', 900); const f = filt(A, 'bandpass', 2500, 5); const g = gain(A, 0);
    s.frequency.exponentialRampToValueAtTime(2200, t + 0.25); s.frequency.exponentialRampToValueAtTime(1300, t + 0.9);
    const lfo = osc(A, 'sine', 32); const lg = gain(A, 120); lfo.connect(lg).connect(s.frequency);
    s.connect(f).connect(g).connect(dest);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.35, t + 0.05); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.0);
    s.start(t); s.stop(t + 1.05); lfo.start(t); lfo.stop(t + 1.05);
    return 1.1;
  },
  growl(A, dest, o, t) {
    const dur = o.dur || rnd(0.8, 1.4);
    const s = osc(A, 'sawtooth', rnd(55, 75)); const f = filt(A, 'lowpass', 500, 4); const g = gain(A, 0);
    const am = osc(A, 'square', rnd(18, 28)); const ag = gain(A, 0.35); am.connect(ag).connect(g.gain);
    s.connect(f).connect(g).connect(dest);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.5 * (o.volume ?? 1), t + 0.15); g.gain.linearRampToValueAtTime(0.0001, t + dur);
    s.start(t); s.stop(t + dur + 0.05); am.start(t); am.stop(t + dur + 0.05);
    burst(A, dest, t, { kind: 'pink', type: 'bandpass', freq: 400, Q: 2, a: 0.1, d: dur, vol: 0.25 });
    return dur;
  },
  bark(A, dest, o, t) {
    tone(A, dest, t, { type: 'sawtooth', freq: 260, to: 120, a: 0.01, d: 0.18, vol: 0.4 });
    burst(A, dest, t, { type: 'bandpass', freq: 900, Q: 2, d: 0.15, vol: 0.6 });
    SFX.hitBone(A, dest, {}, t + 0.05);
    return 0.3;
  },
  howl(A, dest, o, t) {
    const s = osc(A, 'sawtooth', 300); const f = filt(A, 'bandpass', 900, 3); const g = gain(A, 0);
    s.frequency.linearRampToValueAtTime(520, t + 0.6); s.frequency.linearRampToValueAtTime(380, t + 2.0);
    const vib = osc(A, 'sine', 5.5); const vg = gain(A, 12); vib.connect(vg).connect(s.frequency);
    s.connect(f).connect(g).connect(dest);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.3, t + 0.3); g.gain.linearRampToValueAtTime(0.0001, t + 2.2);
    s.start(t); s.stop(t + 2.3); vib.start(t); vib.stop(t + 2.3);
    return 2.3;
  },
  boneRattle(A, dest, o, t) {
    for (let i = 0; i < 7; i++) burst(A, dest, t + i * rnd(0.03, 0.07), { type: 'bandpass', freq: rnd(2000, 4500), Q: 6, d: 0.02, vol: 0.3 * (o.volume ?? 1) });
    return 0.5;
  },
  inkMoan(A, dest, o, t) {
    const s = osc(A, 'sawtooth', rnd(70, 90)); const f = filt(A, 'bandpass', 600, 6); const g = gain(A, 0);
    f.frequency.linearRampToValueAtTime(900, t + 1.5);
    s.frequency.linearRampToValueAtTime(rnd(50, 60), t + 2);
    s.connect(f).connect(g).connect(dest);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.35, t + 0.4); g.gain.linearRampToValueAtTime(0.0001, t + 2.2);
    s.start(t); s.stop(t + 2.3);
    return 2.3;
  },
  inkScreech(A, dest, o, t) {
    const s = osc(A, 'square', 1400); const f = filt(A, 'bandpass', 3000, 3); const g = gain(A, 0);
    s.frequency.exponentialRampToValueAtTime(600, t + 0.8);
    const lfo = osc(A, 'sawtooth', 45); const lg = gain(A, 300); lfo.connect(lg).connect(s.frequency);
    s.connect(f).connect(g).connect(dest);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.3, t + 0.03); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
    s.start(t); s.stop(t + 0.95); lfo.start(t); lfo.stop(t + 0.95);
    burst(A, dest, t, { type: 'highpass', freq: 3000, d: 0.6, vol: 0.3 });
    return 1;
  },
  inkStep(A, dest, o, t) {
    burst(A, dest, t, { type: 'bandpass', freq: rnd(2500, 3500), Q: 5, d: 0.025, vol: 0.4 });
    burst(A, dest, t + 0.03, { type: 'bandpass', freq: rnd(1500, 2000), Q: 5, d: 0.02, vol: 0.25 });
    return 0.1;
  },
  stunned(A, dest, o, t) {
    tone(A, dest, t, { type: 'sawtooth', freq: 400, to: 90, a: 0.01, d: 0.8, vol: 0.25 });
    SFX.boneRattle(A, dest, {}, t);
    return 0.9;
  },
  tideGurgle(A, dest, o, t) {
    for (let i = 0; i < 10; i++) tone(A, dest, t + i * rnd(0.05, 0.12), { freq: rnd(80, 220), to: rnd(200, 500), d: 0.08, vol: 0.2 });
    burst(A, dest, t, { kind: 'brown', type: 'lowpass', freq: 300, a: 0.2, d: 1.2, vol: 0.5 });
    return 1.4;
  },
  tideGroan(A, dest, o, t) {
    const s = osc(A, 'sine', 120); const g = gain(A, 0);
    s.frequency.linearRampToValueAtTime(70, t + 1.0); s.frequency.linearRampToValueAtTime(160, t + 2.4);
    const s2 = osc(A, 'triangle', 61); s2.frequency.linearRampToValueAtTime(40, t + 2.4);
    s.connect(g); s2.connect(g); g.connect(dest);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.4, t + 0.5); g.gain.linearRampToValueAtTime(0.0001, t + 2.6);
    s.start(t); s.stop(t + 2.7); s2.start(t); s2.stop(t + 2.7);
    return 2.7;
  },
  goanerRoar(A, dest, o, t) {
    const dur = o.dur || 2.4, k = o.volume ?? 1;
    [38, 41, 57, 76, 113].forEach((fq, i) => {
      const s = osc(A, 'sawtooth', fq * rnd(0.98, 1.02)); const f = filt(A, 'lowpass', 900, 2); const g = gain(A, 0);
      s.frequency.linearRampToValueAtTime(fq * 0.7, t + dur);
      s.connect(f).connect(g).connect(dest);
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.16 * k, t + 0.25); g.gain.linearRampToValueAtTime(0.0001, t + dur);
      s.start(t); s.stop(t + dur + 0.05);
    });
    burst(A, dest, t, { kind: 'pink', type: 'bandpass', freq: 700, Q: 1, a: 0.2, d: dur, vol: 0.8 * k, sweepTo: 300 });
    burst(A, dest, t, { kind: 'brown', type: 'lowpass', freq: 160, a: 0.1, d: dur, vol: 1.0 * k });
    return dur + 0.2;
  },
  goanerBleat(A, dest, o, t) {
    // the goat in the goaner
    const s = osc(A, 'sawtooth', 300); const f = filt(A, 'bandpass', 1300, 2); const g = gain(A, 0);
    const vib = osc(A, 'square', 22); const vg = gain(A, 40); vib.connect(vg).connect(s.frequency);
    s.frequency.linearRampToValueAtTime(240, t + 1.2);
    s.connect(f).connect(g).connect(dest);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.35, t + 0.08); g.gain.linearRampToValueAtTime(0.0001, t + 1.3);
    s.start(t); s.stop(t + 1.35); vib.start(t); vib.stop(t + 1.35);
    return 1.4;
  },
  wingBuzz(A, dest) {
    const s = osc(A, 'sawtooth', 95); const s2 = osc(A, 'sawtooth', 97.5); const f = filt(A, 'bandpass', 400, 1.2); const g = gain(A, 0.25);
    const am = osc(A, 'sine', 31); const ag = gain(A, 0.12); am.connect(ag).connect(g.gain);
    s.connect(f); s2.connect(f); f.connect(g).connect(dest);
    s.start(); s2.start(); am.start();
    return { stop() { s.stop(); s2.stop(); am.stop(); }, set(k, v) { if (k === 'pitch') { s.frequency.setTargetAtTime(95 * v, A.now, 0.1); s2.frequency.setTargetAtTime(97.5 * v, A.now, 0.1); } } };
  },
  stomp(A, dest, o, t) {
    const k = o.volume ?? 1;
    tone(A, dest, t, { freq: 60, to: 25, a: 0.002, d: 0.6, vol: 0.9 * k });
    burst(A, dest, t, { kind: 'brown', type: 'lowpass', freq: 300, d: 0.6, vol: 0.9 * k });
    burst(A, dest, t, { type: 'bandpass', freq: 900, d: 0.2, vol: 0.4 * k });
    return 0.8;
  },
  crumble(A, dest, o, t) {
    burst(A, dest, t, { kind: 'brown', type: 'lowpass', freq: 500, a: 0.05, d: 1.6, vol: 0.9 });
    for (let i = 0; i < 12; i++) burst(A, dest, t + rnd(0, 1.2), { type: 'bandpass', freq: rnd(600, 2500), Q: 2, d: 0.05, vol: rnd(0.1, 0.4) });
    return 1.8;
  },
  warn(A, dest, o, t) {
    tone(A, dest, t, { type: 'triangle', freq: 220, to: 330, a: 0.05, d: 0.5, vol: 0.2 });
    return 0.6;
  },
  victory(A, dest, o, t) {
    [0, 4, 7, 12, 16].forEach((n, i) => tone(A, dest, t + i * 0.18, { type: 'triangle', freq: 220 * Math.pow(2, n / 12), a: 0.02, d: 2.2, vol: 0.12 }));
    return 3;
  },
  revive(A, dest, o, t) {
    [0, 7, 12].forEach((n, i) => tone(A, dest, t + i * 0.1, { type: 'sine', freq: 330 * Math.pow(2, n / 12), d: 0.4, vol: 0.1 }));
    return 0.8;
  },
  downed(A, dest, o, t) {
    tone(A, dest, t, { type: 'sine', freq: 300, to: 80, a: 0.02, d: 1.4, vol: 0.3 });
    return 1.5;
  },
};

// ---------------------------------------------------------------- Level 2 additions, spider
Object.assign(SFX, {
  spiderShriek(A, dest, o, t) {
    // chittering, rising screech: a buzzing square swept up, chopped fast
    const s = osc(A, 'square', 1800); const f = filt(A, 'bandpass', 3200, 2.5); const g = gain(A, 0);
    s.frequency.exponentialRampToValueAtTime(3600, t + 0.35); s.frequency.exponentialRampToValueAtTime(2400, t + 1.0);
    const fm = osc(A, 'sawtooth', 70); const fg = gain(A, 500); fm.connect(fg).connect(s.frequency);
    const am = osc(A, 'square', 38); const ag = gain(A, 0.5); am.connect(ag).connect(g.gain);
    s.connect(f).connect(g).connect(dest);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.32, t + 0.04); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.05);
    for (const n of [s, fm, am]) { n.start(t); n.stop(t + 1.1); }
    burst(A, dest, t, { type: 'highpass', freq: 4500, a: 0.02, d: 0.9, vol: 0.35 });
    for (let i = 0; i < 9; i++) burst(A, dest, t + i * 0.07, { type: 'bandpass', freq: rnd(2500, 5000), Q: 6, d: 0.02, vol: 0.3 });
    return 1.1;
  },
  spiderHiss(A, dest, o, t) {
    const d = rnd(0.8, 1.4);
    const n = noiseSrc(A, 'white'); const f = filt(A, 'highpass', 3800, 0.7); const f2 = filt(A, 'peaking', 6500, 2); f2.gain.value = 8;
    const g = gain(A, 0); const am = osc(A, 'triangle', rnd(14, 22)); const ag = gain(A, 0.12); am.connect(ag).connect(g.gain);
    n.connect(f).connect(f2).connect(g).connect(dest);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.32, t + 0.08); g.gain.setValueAtTime(0.3, t + d * 0.6); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    n.start(t, Math.random()); n.stop(t + d + 0.05); am.start(t); am.stop(t + d + 0.05);
    burst(A, dest, t, { kind: 'pink', type: 'bandpass', freq: 900, Q: 3, a: 0.05, d: d * 0.8, vol: 0.12 });
    return d;
  },
  spiderBite(A, dest, o, t) {
    burst(A, dest, t, { type: 'bandpass', freq: 3800, Q: 4, d: 0.03, vol: 0.6 });
    burst(A, dest, t + 0.04, { type: 'bandpass', freq: 2600, Q: 4, d: 0.04, vol: 0.55 });
    burst(A, dest, t + 0.05, { kind: 'pink', type: 'lowpass', freq: 600, d: 0.12, vol: 0.6 });
    tone(A, dest, t + 0.04, { freq: 110, to: 50, d: 0.12, vol: 0.4 });
    return 0.3;
  },
  skitter(A, dest, o, t) {
    const v = o.volume ?? 1;
    for (let i = 0; i < 4; i++) burst(A, dest, t + i * rnd(0.012, 0.03), { type: 'bandpass', freq: rnd(2800, 5200), Q: 7, d: 0.012, vol: 0.35 * v });
    return 0.15;
  },

  // ------------------------------------------------------------ Deedee
  paleSong(A, dest, o) {
    // a breathy, slightly-wrong lullaby sung by something that learned it
    // from a recording: formant-filtered voice with a tremulous vibrato
    const out = gain(A, 0.5);
    const f1 = filt(A, 'bandpass', 420, 5), f2 = filt(A, 'bandpass', 980, 7), f3 = filt(A, 'bandpass', 2600, 9);
    const lp = filt(A, 'lowpass', 3200, 0.5);
    const mix = gain(A, 1);
    mix.connect(f1).connect(lp); mix.connect(f2).connect(lp);
    const g3 = gain(A, 0.35); mix.connect(f3).connect(g3).connect(lp);
    lp.connect(out).connect(dest);
    const breath = noiseSrc(A, 'pink'); const bf = filt(A, 'bandpass', 1400, 1.2); const bg = gain(A, 0.03);
    breath.connect(bf).connect(bg).connect(out); breath.start();
    const MEL = [[0, 2], [3, 1], [7, 1], [5, 2], [3, 1], [2, 1], [0, 3], [-2, 1], [0, 1], [3, 2], [2, 1], [-1.4, 1], [0, 4], [null, 2],
      [7, 2], [8, 1], [7, 1], [5, 2], [3, 2], [5, 1], [3, 1], [2, 2], [0, 3], [null, 1], [-5, 2], [-2, 1], [0, 5], [null, 3]];
    const base = 330 * (0.97 + Math.random() * 0.06);
    let i = Math.floor(Math.random() * MEL.length), stopped = false;
    const beat = 0.42;
    const tick = () => {
      if (stopped) return;
      const [semi, len] = MEL[i % MEL.length];
      const t = A.now + 0.02, dur = len * beat;
      if (semi !== null) {
        const off = Math.random() < 0.12 ? -0.45 : 0; // now and then, a note slides flat
        const f = base * Math.pow(2, (semi + off) / 12);
        const v1 = osc(A, 'sawtooth', f), v2 = osc(A, 'triangle', f * 1.002);
        const vib = osc(A, 'sine', 5.2 + Math.random()); const vg = gain(A, f * 0.012); vib.connect(vg); vg.connect(v1.frequency); vg.connect(v2.frequency);
        if (off) v1.frequency.linearRampToValueAtTime(f * 0.97, t + dur);
        const g = gain(A, 0);
        v1.connect(g); v2.connect(g); g.connect(mix);
        g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.22, t + 0.14); g.gain.setValueAtTime(0.2, t + dur * 0.8); g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.1);
        for (const n of [v1, v2, vib]) { n.start(t); n.stop(t + dur + 0.15); }
      }
      i++;
      setTimeout(tick, dur * 1000 * (1 + (Math.random() - 0.5) * 0.08));
    };
    tick();
    return { stop() { stopped = true; try { breath.stop(); } catch { /* ignore */ } } };
  },
  paleVanish(A, dest, o, t) {
    burst(A, dest, t, { kind: 'pink', type: 'bandpass', freq: 2200, Q: 0.8, a: 0.05, d: 1.2, vol: 0.5, sweepTo: 250 });
    for (let i = 0; i < 10; i++) burst(A, dest, t + rnd(0, 0.5), { type: 'highpass', freq: 5000, d: 0.015, vol: 0.25 });
    tone(A, dest, t, { type: 'sine', freq: 660, to: 1320, a: 0.3, d: 0.9, vol: 0.06 });
    return 1.4;
  },
  paleScream(A, dest, o, t) {
    // several throats at once, sliding apart: a shriek that turns into a roar
    const d = o.short ? 0.55 : 1.8;
    const sh = A.ctx.createWaveShaper(); const curve = new Float32Array(256);
    for (let k = 0; k < 256; k++) { const x = k / 128 - 1; curve[k] = Math.tanh(x * 4); }
    sh.curve = curve;
    const fA = filt(A, 'bandpass', 900, 3), fB = filt(A, 'bandpass', 1500, 4);
    const g = gain(A, 0);
    sh.connect(fA).connect(g); sh.connect(fB).connect(g); g.connect(dest);
    for (const [f0, f1, type] of [[620, 1100, 'sawtooth'], [655, 380, 'sawtooth'], [1240, 1900, 'square'], [180, 90, 'sawtooth']]) {
      const s = osc(A, type, f0); s.frequency.exponentialRampToValueAtTime(f1, t + d);
      const fm = osc(A, 'sine', rnd(28, 40)); const fg = gain(A, f0 * 0.06); fm.connect(fg).connect(s.frequency);
      const sg = gain(A, 0.25); s.connect(sg).connect(sh);
      s.start(t); s.stop(t + d + 0.05); fm.start(t); fm.stop(t + d + 0.05);
    }
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.5, t + 0.05); g.gain.setValueAtTime(0.45, t + d * 0.5); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    burst(A, dest, t, { type: 'highpass', freq: 2500, a: 0.02, d: d * 0.9, vol: 0.3 });
    return d + 0.1;
  },

  // ------------------------------------------------------------ office machines
  vend(A, dest, o, t) {
    const m = osc(A, 'sawtooth', 70); const f = filt(A, 'lowpass', 300, 2); const g = gain(A, 0);
    m.connect(f).connect(g).connect(dest);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.18, t + 0.05); g.gain.setValueAtTime(0.18, t + 0.7); g.gain.linearRampToValueAtTime(0.0001, t + 0.8);
    m.start(t); m.stop(t + 0.85);
    tone(A, dest, t + 0.95, { freq: 90, to: 50, d: 0.15, vol: 0.5 });
    burst(A, dest, t + 0.95, { kind: 'pink', type: 'lowpass', freq: 800, d: 0.12, vol: 0.6 });
    burst(A, dest, t + 1.05, { type: 'bandpass', freq: 2200, Q: 5, d: 0.05, vol: 0.2 });
    return 1.3;
  },
  dialTone(A, dest) {
    const a = osc(A, 'sine', 350), b = osc(A, 'sine', 440); const g = gain(A, 0.06);
    a.connect(g); b.connect(g); g.connect(dest); a.start(); b.start();
    return { stop() { a.stop(); b.stop(); } };
  },
  dtmf(A, dest, o, t) {
    const K = { 1: [697, 1209], 2: [697, 1336], 3: [697, 1477], 4: [770, 1209], 5: [770, 1336], 6: [770, 1477], 7: [852, 1209], 8: [852, 1336], 9: [852, 1477], '*': [941, 1209], 0: [941, 1336], '#': [941, 1477] };
    const [lo, hi] = K[o.digit] || K[0];
    tone(A, dest, t, { freq: lo, a: 0.005, d: 0.16, vol: 0.12 });
    tone(A, dest, t, { freq: hi, a: 0.005, d: 0.16, vol: 0.12 });
    return 0.2;
  },
  phoneError(A, dest, o, t) {
    [913.8, 1370.6, 1776.7].forEach((f, i) => tone(A, dest, t + i * 0.34, { freq: f, a: 0.01, d: 0.3, vol: 0.12 }));
    return 1.1;
  },
  ringback(A, dest, o, t) {
    for (const f of [440, 480]) { const s = osc(A, 'sine', f); const g = gain(A, 0); s.connect(g).connect(dest); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.07, t + 0.02); g.gain.setValueAtTime(0.07, t + 1.9); g.gain.linearRampToValueAtTime(0.0001, t + 2); s.start(t); s.stop(t + 2.05); }
    return 2.1;
  },
  ladder(A, dest, o, t) {
    for (let i = 0; i < 4; i++) {
      burst(A, dest, t + i * 0.28, { type: 'bandpass', freq: rnd(900, 1300), Q: 9, d: 0.08, vol: 0.4 });
      tone(A, dest, t + i * 0.28, { type: 'triangle', freq: rnd(400, 520), d: 0.12, vol: 0.06 });
    }
    return 1.2;
  },
});

Object.assign(SFX, {
  // dial-up handshake: dial pulses, answer tone, the screech, then hiss
  modem(A, dest, o, t) {
    for (let i = 0; i < 7; i++) SFX.dtmf(A, dest, { digit: String((i * 3 + 1) % 10) }, t + i * 0.12);
    tone(A, dest, t + 1.0, { freq: 2100, a: 0.01, d: 0.6, vol: 0.06 });
    tone(A, dest, t + 1.7, { type: 'square', freq: 1200, to: 2400, a: 0.01, d: 0.5, vol: 0.04 });
    for (let i = 0; i < 6; i++) tone(A, dest, t + 2.2 + i * 0.12, { type: 'sawtooth', freq: rnd(900, 2600), a: 0.005, d: 0.1, vol: 0.035 });
    burst(A, dest, t + 2.9, { type: 'bandpass', freq: 1800, Q: 0.6, a: 0.02, d: 1.2, vol: 0.12 });
    return 4.2;
  },
});

// ---------------------------------------------------------------- Level 4
Object.assign(SFX, {
  snakeHiss(A, dest, o, t) {
    burst(A, dest, t, { type: 'highpass', freq: 3200, a: 0.06, d: 1.1, vol: 0.32 });
    // metal on metal: a rising ring under the hiss
    tone(A, dest, t, { type: 'triangle', freq: 1460, to: 1880, a: 0.05, d: 1.0, vol: 0.05 });
    tone(A, dest, t, { type: 'sine', freq: 2210, a: 0.05, d: 0.8, vol: 0.03 });
    return 1.2;
  },
  snakeStrike(A, dest, o, t) {
    burst(A, dest, t, { kind: 'pink', type: 'bandpass', freq: 900, Q: 1.5, a: 0.01, d: 0.25, vol: 0.5, sweepTo: 2600 });
    tone(A, dest, t + 0.25, { type: 'square', freq: 320, to: 120, d: 0.2, vol: 0.12 });
    burst(A, dest, t + 0.3, { type: 'bandpass', freq: 3000, Q: 8, d: 0.4, vol: 0.18 });
    return 0.8;
  },
  snakeScrape(A, dest, o, t) {
    const v = o.volume ?? 1;
    burst(A, dest, t, { type: 'bandpass', freq: rnd(1800, 2600), Q: 6, a: 0.05, d: 0.35, vol: 0.18 * v });
    tone(A, dest, t, { type: 'sine', freq: rnd(2800, 3400), a: 0.05, d: 0.3, vol: 0.012 * v });
    return 0.45;
  },
  // tone-lock plates: a bell partial stack at the given pitch
  plateTone(A, dest, o, t) {
    const f = o.freq || 440;
    tone(A, dest, t, { type: 'sine', freq: f, a: 0.004, d: 1.6, vol: 0.22 });
    tone(A, dest, t, { type: 'sine', freq: f * 2.01, a: 0.004, d: 0.9, vol: 0.08 });
    tone(A, dest, t, { type: 'sine', freq: f * 3.02, a: 0.004, d: 0.5, vol: 0.04 });
    tone(A, dest, t, { type: 'triangle', freq: f * 0.5, a: 0.01, d: 1.2, vol: 0.05 });
    return 1.7;
  },
  lockBuzz(A, dest, o, t) {
    tone(A, dest, t, { type: 'sawtooth', freq: 110, a: 0.01, d: 0.45, vol: 0.18 });
    tone(A, dest, t, { type: 'square', freq: 116, a: 0.01, d: 0.45, vol: 0.08 });
    return 0.5;
  },
  lockOpen(A, dest, o, t) {
    [523, 659, 784, 1046].forEach((f, i) => tone(A, dest, t + i * 0.12, { type: 'sine', freq: f, a: 0.004, d: 0.9, vol: 0.14 }));
    burst(A, dest, t + 0.6, { kind: 'brown', type: 'lowpass', freq: 300, a: 0.05, d: 1.2, vol: 0.5 });
    tone(A, dest, t + 0.6, { freq: 60, to: 40, a: 0.05, d: 1.1, vol: 0.3 });
    return 2;
  },
});
