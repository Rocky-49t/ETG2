// Seeded randomness, hashing and noise. Everything procedural in the game
// derives from these so that a world seed reproduces the same world on every peer.

export function hashString(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^= h >>> 16) >>> 0;
}

// Integer hash of up to 4 ints -> uint32
export function hash4(a, b = 0, c = 0, d = 0) {
  let h = Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b | 0, 0x165667b1) ^ Math.imul(c | 0, 0x9e3779b1) ^ Math.imul(d | 0, 0x85ebca77);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  h = Math.imul(h, 0x297a2d39);
  h ^= h >>> 15;
  return h >>> 0;
}

export function hash01(a, b = 0, c = 0, d = 0) {
  return hash4(a, b, c, d) / 4294967296;
}

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function rng() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Convenience wrapper with helpers.
export class RNG {
  constructor(seed) {
    this.next = mulberry32(typeof seed === 'string' ? hashString(seed) : seed);
  }
  float(a = 0, b = 1) { return a + (b - a) * this.next(); }
  int(a, b) { return a + Math.floor(this.next() * (b - a + 1)); }
  chance(p) { return this.next() < p; }
  pick(arr) { return arr[Math.floor(this.next() * arr.length)]; }
  weighted(entries) {
    // entries: [[value, weight], ...]
    let total = 0;
    for (const e of entries) total += e[1];
    let r = this.next() * total;
    for (const e of entries) {
      r -= e[1];
      if (r <= 0) return e[0];
    }
    return entries[entries.length - 1][0];
  }
  shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }
  sign() { return this.next() < 0.5 ? -1 : 1; }
}

// ---------------------------------------------------------------------------
// Noise. Periodic value noise so textures tile seamlessly.

const smooth = t => t * t * t * (t * (t * 6 - 15) + 10);

export function makeNoise2D(seed = 1) {
  const s = seed | 0;
  // returns value in [0,1]
  return function noise(x, y, period = 256) {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const p = period | 0;
    const x0 = ((xi % p) + p) % p, y0 = ((yi % p) + p) % p;
    const x1 = (x0 + 1) % p, y1 = (y0 + 1) % p;
    const a = hash01(x0, y0, s), b = hash01(x1, y0, s);
    const c = hash01(x0, y1, s), d = hash01(x1, y1, s);
    const u = smooth(xf), v = smooth(yf);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
}

export function fbm(noise, x, y, period, octaves = 4, gain = 0.5, lac = 2) {
  let amp = 0.5, sum = 0, norm = 0, f = 1;
  for (let i = 0; i < octaves; i++) {
    sum += amp * noise(x * f, y * f, period * f);
    norm += amp;
    amp *= gain;
    f *= lac;
  }
  return sum / norm;
}

// Cellular / worley noise (periodic), returns distance to nearest feature [0..~1]
export function makeWorley(seed = 1) {
  return function worley(x, y, period) {
    const xi = Math.floor(x), yi = Math.floor(y);
    let best = 9, second = 9, id = 0;
    for (let oy = -1; oy <= 1; oy++) {
      for (let ox = -1; ox <= 1; ox++) {
        const cx = xi + ox, cy = yi + oy;
        const wx = ((cx % period) + period) % period, wy = ((cy % period) + period) % period;
        const fx = cx + hash01(wx, wy, seed, 1), fy = cy + hash01(wx, wy, seed, 2);
        const dx = fx - x, dy = fy - y;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < best) { second = best; best = d; id = hash4(wx, wy, seed); }
        else if (d < second) second = d;
      }
    }
    return { f1: best, f2: second, id };
  };
}

// Simple 1D smooth noise used for flicker/wind (not periodic).
export function noise1(t, seed = 0) {
  const i = Math.floor(t), f = t - i;
  const a = hash01(i, seed), b = hash01(i + 1, seed);
  return a + (b - a) * smooth(f);
}

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (a, b, v) => {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
export const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt));
export function angleDiff(a, b) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}
