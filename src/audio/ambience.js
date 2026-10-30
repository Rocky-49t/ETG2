// Per-level ambience beds. Each profile builds continuous layers on `out`
// and schedules randomized one-shots around the listener.

const rnd = (a, b) => a + Math.random() * (b - a);

function noiseLayer(A, out, kind, type, freq, Q, vol) {
  const n = A.ctx.createBufferSource(); n.buffer = A.noise[kind]; n.loop = true;
  const f = A.ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = Q;
  const g = A.ctx.createGain(); g.gain.value = vol;
  n.connect(f).connect(g).connect(out); n.start(0, Math.random() * 3);
  return { n, f, g, stop: () => n.stop() };
}
function oscLayer(A, out, type, freq, vol, detune = 0) {
  const o = A.ctx.createOscillator(); o.type = type; o.frequency.value = freq; o.detune.value = detune;
  const g = A.ctx.createGain(); g.gain.value = vol;
  o.connect(g).connect(out); o.start();
  return { o, g, stop: () => o.stop() };
}
function lfo(A, param, rate, depth) {
  const o = A.ctx.createOscillator(); o.frequency.value = rate;
  const g = A.ctx.createGain(); g.gain.value = depth;
  o.connect(g).connect(param); o.start();
  return { stop: () => o.stop() };
}
// schedule random positional one-shots near the listener
function scheduler(A, events) {
  const timers = events.map(e => rnd(e.min * 0.3, e.max));
  return dt => {
    for (let i = 0; i < events.length; i++) {
      timers[i] -= dt;
      if (timers[i] <= 0) {
        const e = events[i];
        timers[i] = rnd(e.min, e.max);
        const L = A.listenerPos;
        const a = Math.random() * Math.PI * 2, d = rnd(e.dist?.[0] ?? 8, e.dist?.[1] ?? 30);
        A.play(e.name, { pos: { x: L.x + Math.cos(a) * d, y: L.y + rnd(-1, 2), z: L.z + Math.sin(a) * d }, volume: e.volume ?? 0.6, ref: 4, reverb: 0.8, ...(e.opts || {}) });
      }
    }
  };
}

export const AMBIENCE = {
  lab(A, out) {
    // clean HVAC, server fans, distant machine room whir and an occasional PA chime
    const hvac = noiseLayer(A, out, 'pink', 'lowpass', 520, 0.5, 0.1);
    const fans = noiseLayer(A, out, 'white', 'bandpass', 2400, 1.2, 0.012);
    const whir = oscLayer(A, out, 'triangle', 92, 0.02);
    const l1 = lfo(A, whir.o.frequency, 0.08, 3);
    const hum = oscLayer(A, out, 'sine', 60, 0.02);
    const sched = scheduler(A, [
      { name: 'beepAlert', min: 14, max: 30, dist: [6, 16], volume: 0.25 },
      { name: 'paper', min: 18, max: 40, dist: [4, 10], volume: 0.3 },
      { name: 'click', min: 6, max: 14, dist: [3, 9], volume: 0.3 },
    ]);
    return {
      reverb: [1.2, 3.0, 0.25],
      update: dt => sched(dt),
      stop: () => { hvac.stop(); fans.stop(); whir.stop(); l1.stop(); hum.stop(); },
    };
  },

  lobby(A, out) {
    // mains hum + harmonics, buzzy ballast, room tone
    const hum = [oscLayer(A, out, 'sine', 60, 0.05), oscLayer(A, out, 'sine', 120, 0.035, 3), oscLayer(A, out, 'sine', 180, 0.012, -4), oscLayer(A, out, 'sine', 240, 0.006)];
    const buzzO = A.ctx.createOscillator(); buzzO.type = 'sawtooth'; buzzO.frequency.value = 120;
    const bf = A.ctx.createBiquadFilter(); bf.type = 'bandpass'; bf.frequency.value = 3200; bf.Q.value = 6;
    const bg = A.ctx.createGain(); bg.gain.value = 0.012;
    buzzO.connect(bf).connect(bg).connect(out); buzzO.start();
    const l1 = lfo(A, bg.gain, 0.13, 0.006);
    const room = noiseLayer(A, out, 'brown', 'lowpass', 200, 0.5, 0.18);
    const air = noiseLayer(A, out, 'pink', 'bandpass', 600, 0.4, 0.02);
    const sched = scheduler(A, [
      { name: 'distantThud', min: 25, max: 70, dist: [20, 45], volume: 0.5 },
      { name: 'knock', min: 80, max: 200, dist: [12, 30], volume: 0.4 },
      { name: 'footstepsFake', min: 90, max: 220, dist: [14, 30], volume: 0.35 },
      { name: 'metalGroan', min: 60, max: 150, dist: [20, 40], volume: 0.25 },
    ]);
    return {
      reverb: [1.4, 2.8, 0.32],
      update: dt => sched(dt),
      stop: () => { hum.forEach(h => h.stop()); buzzO.stop(); l1.stop(); room.stop(); air.stop(); },
    };
  },

  tunnels(A, out) {
    const drone = oscLayer(A, out, 'sawtooth', 43, 0.0);
    const df = A.ctx.createBiquadFilter(); df.type = 'lowpass'; df.frequency.value = 160;
    drone.g.disconnect(); drone.g.connect(df).connect(out); drone.g.gain.value = 0.12;
    const l1 = lfo(A, df.frequency, 0.07, 60);
    const rumble = noiseLayer(A, out, 'brown', 'lowpass', 140, 0.7, 0.35);
    const hiss = noiseLayer(A, out, 'pink', 'highpass', 4000, 0.5, 0.008);
    const sched = scheduler(A, [
      { name: 'steamHiss', min: 10, max: 28, dist: [6, 20], volume: 0.35 },
      { name: 'metalGroan', min: 14, max: 40, dist: [12, 35], volume: 0.45 },
      { name: 'drip', min: 1.5, max: 5, dist: [3, 12], volume: 0.7 },
      { name: 'distantThud', min: 18, max: 50, dist: [20, 45], volume: 0.6 },
      { name: 'howl', min: 70, max: 160, dist: [40, 70], volume: 0.25 },
    ]);
    return {
      reverb: [2.6, 2.2, 0.42],
      update: dt => sched(dt),
      stop: () => { drone.stop(); l1.stop(); rumble.stop(); hiss.stop(); },
    };
  },

  offices(A, out) {
    const hvac = noiseLayer(A, out, 'pink', 'lowpass', 380, 0.6, 0.12);
    const hum = oscLayer(A, out, 'sine', 60, 0.03);
    const hum2 = oscLayer(A, out, 'sine', 120, 0.015);
    const sched = scheduler(A, [
      { name: 'phoneRing', min: 70, max: 170, dist: [14, 35], volume: 0.5 },
      { name: 'drip', min: 3, max: 9, dist: [4, 14], volume: 0.5 },
      { name: 'distantThud', min: 30, max: 80, dist: [25, 45], volume: 0.4 },
      { name: 'inkStep', min: 25, max: 60, dist: [12, 25], volume: 0.4 },
      { name: 'paper', min: 20, max: 50, dist: [5, 14], volume: 0.4 },
    ]);
    // sewer water layer controlled by info.sewer
    const water = noiseLayer(A, out, 'pink', 'bandpass', 600, 0.7, 0);
    const wl = lfo(A, water.f.frequency, 0.23, 150);
    return {
      reverb: [1.8, 2.5, 0.35],
      update: (dt, info) => {
        sched(dt);
        const w = info?.sewer ? 0.32 : 0.0;
        water.g.gain.setTargetAtTime(w, A.now, 0.8);
        hvac.g.gain.setTargetAtTime(info?.sewer ? 0.04 : 0.12, A.now, 0.8);
        A.setReverbMix(info?.sewer ? 0.55 : 0.35);
      },
      stop: () => { hvac.stop(); hum.stop(); hum2.stop(); water.stop(); wl.stop(); },
    };
  },

  pools(A, out) {
    const lap = noiseLayer(A, out, 'pink', 'bandpass', 520, 0.8, 0.14);
    const l1 = lfo(A, lap.g.gain, 0.17, 0.07);
    const l2 = lfo(A, lap.f.frequency, 0.11, 140);
    const tone1 = oscLayer(A, out, 'sine', 98, 0.012);
    const tone2 = oscLayer(A, out, 'sine', 146.8, 0.008, 6);
    const sched = scheduler(A, [
      { name: 'drip', min: 0.8, max: 3, dist: [3, 16], volume: 0.9 },
      { name: 'splash', min: 30, max: 80, dist: [20, 40], volume: 0.25 },
      { name: 'tideGroan', min: 60, max: 140, dist: [30, 60], volume: 0.18 },
      { name: 'whisper', min: 90, max: 200, dist: [8, 18], volume: 0.3 },
    ]);
    return {
      reverb: [3.8, 1.8, 0.55],
      update: dt => sched(dt),
      stop: () => { lap.stop(); l1.stop(); l2.stop(); tone1.stop(); tone2.stop(); },
    };
  },

  bridge(A, out) {
    const wind = noiseLayer(A, out, 'pink', 'bandpass', 500, 0.9, 0.35);
    const wind2 = noiseLayer(A, out, 'white', 'bandpass', 1500, 2.5, 0.03);
    const l1 = lfo(A, wind.f.frequency, 0.05, 260);
    const l2 = lfo(A, wind.g.gain, 0.09, 0.15);
    const l3 = lfo(A, wind2.f.frequency, 0.13, 700);
    const sub = oscLayer(A, out, 'sine', 36.7, 0.06);
    const sched = scheduler(A, [
      { name: 'metalGroan', min: 12, max: 30, dist: [20, 50], volume: 0.4 },
      { name: 'distantThud', min: 20, max: 60, dist: [50, 90], volume: 0.5 },
      { name: 'goanerBleat', min: 120, max: 260, dist: [80, 120], volume: 0.12 },
    ]);
    return {
      reverb: [4.5, 3.0, 0.22],
      update: dt => sched(dt),
      stop: () => { wind.stop(); wind2.stop(); l1.stop(); l2.stop(); l3.stop(); sub.stop(); },
    };
  },

  menu(A, out) {
    const hum = [oscLayer(A, out, 'sine', 60, 0.04), oscLayer(A, out, 'sine', 120, 0.025, 3)];
    const room = noiseLayer(A, out, 'brown', 'lowpass', 180, 0.5, 0.15);
    const pad = [oscLayer(A, out, 'triangle', 55, 0.025), oscLayer(A, out, 'triangle', 82.4, 0.015, 5), oscLayer(A, out, 'triangle', 65.4, 0.012, -6)];
    return { reverb: [2, 2.5, 0.4], stop: () => { hum.forEach(h => h.stop()); room.stop(); pad.forEach(p => p.stop()); } };
  },
};
