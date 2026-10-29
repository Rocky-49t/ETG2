// Procedural PBR texture toolkit (no Three.js dependency, worker-safe).
// Recipes paint albedo / height / roughness / metalness / emissive into float
// buffers; pack() turns those into RGBA byte arrays for DataTextures.
import { makeNoise2D, makeWorley, fbm, hash01, clamp, smoothstep } from '../core/rng.js';

export class Surface {
  constructor(n) {
    this.n = n;
    const N = n * n;
    this.r = new Float32Array(N);
    this.g = new Float32Array(N);
    this.b = new Float32Array(N);
    this.h = new Float32Array(N);
    this.rough = new Float32Array(N).fill(0.85);
    this.metal = new Float32Array(N);
    this.er = null; // emissive (optional)
  }
  enableEmissive() {
    const N = this.n * this.n;
    this.er = new Float32Array(N); this.eg = new Float32Array(N); this.eb = new Float32Array(N);
  }
  // fn(u, v, i, x, y)
  each(fn) {
    const n = this.n;
    for (let y = 0; y < n; y++) {
      const v = y / n;
      for (let x = 0; x < n; x++) fn(x / n, v, y * n + x, x, y);
    }
  }
  set(i, r, g, b) { this.r[i] = r; this.g[i] = g; this.b[i] = b; }
  mul(i, k) { this.r[i] *= k; this.g[i] *= k; this.b[i] *= k; }
  mix(i, r, g, b, t) {
    this.r[i] += (r - this.r[i]) * t;
    this.g[i] += (g - this.g[i]) * t;
    this.b[i] += (b - this.b[i]) * t;
  }
}

// Shared noise sources (seeded constants so textures are stable between runs).
export const N1 = makeNoise2D(11);
export const N2 = makeNoise2D(23);
export const N3 = makeNoise2D(37);
export const W1 = makeWorley(5);
export const W2 = makeWorley(9);

export const f = (noise, u, v, freq, oct = 4, gain = 0.5) => fbm(noise, u * freq, v * freq, freq, oct, gain);

const toByte = v => (v <= 0 ? 0 : v >= 1 ? 255 : (v * 255) | 0);

// Pack a painted surface into RGBA byte arrays: colour, normal (from the
// height field, wrapping), roughness(G)+metalness(B) and optional emissive.
// Pure JS so it runs inside a worker.
export function pack(s, opts = {}) {
  const n = s.n, N = n * n;
  const normalStrength = (opts.normal ?? 2.0) * (n / 512);
  const out = { size: n, metal: !!opts.metal };
  const color = new Uint8Array(N * 4);
  for (let i = 0, j = 0; i < N; i++, j += 4) {
    color[j] = toByte(s.r[i]); color[j + 1] = toByte(s.g[i]); color[j + 2] = toByte(s.b[i]); color[j + 3] = 255;
  }
  out.color = color;
  if (opts.normal !== 0) {
    const nd = new Uint8Array(N * 4);
    const H = s.h;
    for (let y = 0; y < n; y++) {
      const ym = ((y - 1 + n) % n) * n, yp = ((y + 1) % n) * n, yr = y * n;
      for (let x = 0; x < n; x++) {
        const xm = (x - 1 + n) % n, xp = (x + 1) % n;
        const ddx = (H[yr + xm] - H[yr + xp]) * normalStrength;
        // rows are stored top-down; DataTextures are uploaded bottom-up (flipY false)
        const ddy = (H[ym + x] - H[yp + x]) * normalStrength;
        const len = Math.sqrt(ddx * ddx + ddy * ddy + 1);
        const j = (yr + x) * 4;
        nd[j] = toByte((ddx / len) * 0.5 + 0.5);
        nd[j + 1] = toByte((ddy / len) * 0.5 + 0.5);
        nd[j + 2] = toByte((1 / len) * 0.5 + 0.5);
        nd[j + 3] = 255;
      }
    }
    out.normal = nd;
  }
  const rd = new Uint8Array(N * 4);
  for (let i = 0, j = 0; i < N; i++, j += 4) {
    rd[j] = 255; rd[j + 1] = toByte(s.rough[i]); rd[j + 2] = toByte(s.metal[i]); rd[j + 3] = 255;
  }
  out.rough = rd;
  if (s.er) {
    const ed = new Uint8Array(N * 4);
    for (let i = 0, j = 0; i < N; i++, j += 4) {
      ed[j] = toByte(s.er[i]); ed[j + 1] = toByte(s.eg[i]); ed[j + 2] = toByte(s.eb[i]); ed[j + 3] = 255;
    }
    out.emissive = ed;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Reusable painting helpers.

// Brick/tile layout. du/dv/d are distances to the cell edge in texture
// space (fractions of the full texture), handy for mortar and bevels.
export function brickCell(u, v, cols, rows, offset = 0.5) {
  const row = Math.floor(v * rows);
  const uu = u * cols + (row & 1 ? offset : 0);
  const col = Math.floor(uu);
  const bu = uu - col, bv = v * rows - row;
  const du = Math.min(bu, 1 - bu) / cols, dv = Math.min(bv, 1 - bv) / rows;
  const wrapCol = ((col % cols) + cols) % cols;
  const wrapRow = ((row % rows) + rows) % rows;
  return { du, dv, d: Math.min(du, dv), id: hash01(wrapCol, wrapRow, 77), id2: hash01(wrapCol, wrapRow, 91), col: wrapCol, row: wrapRow, bu, bv };
}

// Stain blobs: returns 0..1 coverage with a darker rim (tide-mark) value.
export function stain(u, v, freq, threshold, seedNoise = N2) {
  const n = f(seedNoise, u, v, freq, 5, 0.55);
  const t = smoothstep(threshold, threshold + 0.08, n);
  const rim = smoothstep(threshold - 0.015, threshold + 0.01, n) * (1 - smoothstep(threshold + 0.01, threshold + 0.05, n));
  return { t, rim, n };
}

export { hash01, clamp, smoothstep };
