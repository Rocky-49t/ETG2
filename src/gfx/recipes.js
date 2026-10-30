// Texture recipes. Each paints into a Surface and returns finalize() options.
// Coordinates u,v are in [0,1) and every pattern is periodic so textures tile.
import { N1, N2, N3, W1, W2, f, brickCell, stain, hash01, clamp, smoothstep } from './texgen.js';

const fract = x => x - Math.floor(x);

export const RECIPES = {
  // ------------------------------------------------------------- Prologue lab
  labPanel(s) {
    // white composite wall panels on a 2x3 grid with seams, screws and a kick strip
    s.each((u, v, i) => {
      const pu = fract(u * 2), pv = fract(v * 3);
      const seam = Math.min(pu, 1 - pu) < 0.008 || Math.min(pv, 1 - pv) < 0.006;
      const n = f(N1, u, v, 8, 3) - 0.5, fine = f(N2, u, v, 140, 2) - 0.5;
      let r = 0.86, g = 0.87, b = 0.88;
      r += n * 0.03 + fine * 0.02; g += n * 0.03 + fine * 0.02; b += n * 0.025 + fine * 0.02;
      let h = 0.55 + fine * 0.05;
      if (seam) { r -= 0.3; g -= 0.3; b -= 0.3; h = 0.2; }
      const sx = Math.min(pu, 1 - pu), sy = Math.min(pv, 1 - pv);
      if (Math.hypot(sx - 0.03, sy - 0.03) < 0.008) { r = g = b = 0.6; h = 0.75; }
      if (v < 0.07) { r = 0.32; g = 0.34; b = 0.36; h = 0.6; }          // kick strip
      else if (v < 0.075) { r = 0.2; g = 0.2; b = 0.22; h = 0.3; }
      s.set(i, r, g, b);
      s.h[i] = h;
      s.rough[i] = v < 0.07 ? 0.5 : 0.35;
    });
    return { normal: 0.6 };
  },
  labFloor(s) {
    // grey epoxy floor with large tiles, scuffs and yellow-black safety stripe edges
    s.each((u, v, i) => {
      const tu = fract(u * 2), tv = fract(v * 2);
      const seam = Math.min(tu, 1 - tu) < 0.004 || Math.min(tv, 1 - tv) < 0.004;
      const n = f(N1, u, v, 6, 4) - 0.5, sc = f(N2, u * 3, v, 40, 3);
      let r = 0.46, g = 0.48, b = 0.5;
      r += n * 0.06; g += n * 0.06; b += n * 0.06;
      const scuff = smoothstep(0.72, 0.8, sc) * 0.08;
      r -= scuff; g -= scuff; b -= scuff;
      if (seam) { r -= 0.1; g -= 0.1; b -= 0.1; }
      s.set(i, r, g, b);
      s.h[i] = seam ? 0.3 : 0.5 + n * 0.05;
      s.rough[i] = 0.32 + scuff * 2;
    });
    return { normal: 0.5 };
  },
  labCeil(s) {
    // clean ceiling grid with perforated tiles
    const grid = 4;
    s.each((u, v, i) => {
      const c = brickCell(u, v, grid, grid, 0);
      let r = 0.88, g = 0.89, b = 0.9, h = 0.45;
      const holes = (Math.sin(u * Math.PI * 2 * 96) * Math.sin(v * Math.PI * 2 * 96)) > 0.8;
      if (holes) { r -= 0.12; g -= 0.12; b -= 0.12; h = 0.35; }
      if (c.d < 0.007) { r = 0.75; g = 0.76; b = 0.78; h = 0.8; }
      s.set(i, r, g, b);
      s.h[i] = h;
      s.rough[i] = c.d < 0.007 ? 0.4 : 0.9;
    });
    return { normal: 0.6 };
  },

  // ------------------------------------------------------------- Level 0
  wallpaper(s) {
    const stripes = 8;
    s.each((u, v, i) => {
      const su = u * stripes, si = Math.floor(su), lu = su - si;
      const patterned = si % 2 === 1;
      let r = 0.80, g = 0.71, b = 0.42;
      if (patterned) { r -= 0.035; g -= 0.035; b -= 0.02; }
      // tiny chevron/diamond motif in patterned stripes
      let h = 0.5;
      if (patterned) {
        const mv = fract(v * 14 + (si % 4 === 1 ? 0.5 : 0));
        const dd = Math.abs(lu - 0.5) * 1.3 + Math.abs(mv - 0.5);
        const ring = smoothstep(0.30, 0.27, dd) * smoothstep(0.18, 0.21, dd);
        const dot = smoothstep(0.08, 0.05, dd);
        const m = Math.max(ring, dot);
        r -= m * 0.07; g -= m * 0.07; b -= m * 0.035;
        h += m * 0.08;
      }
      // thin pinstripes at stripe edges
      const edge = Math.min(lu, 1 - lu);
      if (edge < 0.035) { r -= 0.06; g -= 0.06; b -= 0.04; }
      // paper seams every two stripes
      if ((si % 2 === 0) && lu < 0.012) { h += 0.25; r += 0.03; g += 0.03; }
      // fibres and mottling
      const fib = f(N1, u, v, 96, 2) - 0.5;
      const mot = f(N2, u, v, 3, 4) - 0.5;
      r += fib * 0.05 + mot * 0.10; g += fib * 0.05 + mot * 0.09; b += fib * 0.03 + mot * 0.05;
      h += fib * 0.15;
      // water damage near the floor (v ~ 0 at bottom)
      const wick = smoothstep(0.22, 0.0, v) * (0.55 + 0.45 * f(N3, u, 0.1, 6, 3));
      r -= wick * 0.22; g -= wick * 0.25; b -= wick * 0.2;
      // tide-mark stains
      const st = { t: 0, rim: 0, n: 0.5 }; // stains come from the world-space shader term
      r -= st.t * 0.10 + st.rim * 0.12; g -= st.t * 0.12 + st.rim * 0.14; b -= st.t * 0.12 + st.rim * 0.1;
      // ceiling smoke yellowing (top)
      const top = smoothstep(0.8, 1.0, v);
      r -= top * 0.05; g -= top * 0.06; b -= top * 0.08;
      s.set(i, r, g, b);
      s.h[i] = h;
      s.rough[i] = 0.82 + fib * 0.1 - st.t * 0.1;
    });
    return { normal: 1.2 };
  },

  carpet(s) {
    s.each((u, v, i) => {
      const fib = f(N1, u, v, 160, 2);
      const loop = Math.sin(u * Math.PI * 2 * 96) * Math.sin(v * Math.PI * 2 * 96) * 0.5 + 0.5;
      const mot = f(N2, u, v, 4, 5);
      let r = 0.60, g = 0.52, b = 0.30;
      const k = (fib - 0.5) * 0.16 + (loop - 0.5) * 0.04 + (mot - 0.5) * 0.18;
      r += k; g += k * 0.95; b += k * 0.7;
      // damp patches come from a world-space shader term (see patchBaked) so they don't tile
      const st = { t: 0 };
      // small dark spots
      const sp = W1(u * 18, v * 18, 18);
      if (sp.f1 < 0.12 && hash01(sp.id, 3) < 0.25) { r *= 0.72; g *= 0.70; b *= 0.68; }
      s.set(i, r, g, b);
      s.h[i] = fib * 0.7 + loop * 0.3;
      s.rough[i] = 0.97 - st.t * 0.25;
    });
    return { normal: 1.6 };
  },

  ceilingTile(s) {
    const grid = 4;
    s.each((u, v, i) => {
      const c = brickCell(u, v, grid, grid, 0);
      let r = 0.80, g = 0.78, b = 0.70;
      const tileShade = (c.id - 0.5) * 0.05;
      r += tileShade; g += tileShade; b += tileShade * 0.8;
      const pits = W1(u * 64, v * 64, 64);
      const pit = smoothstep(0.18, 0.08, pits.f1) * (hash01(pits.id) < 0.6 ? 1 : 0);
      const mot = f(N1, u, v, 48, 3) - 0.5;
      r += mot * 0.06 - pit * 0.12; g += mot * 0.06 - pit * 0.12; b += mot * 0.05 - pit * 0.1;
      let h = 0.4 - pit * 0.25 + mot * 0.1;
      // T-bar grid
      const bar = c.d < 0.006;
      if (bar) { r = 0.70; g = 0.69; b = 0.66; h = 0.85; }
      else if (c.d < 0.010) h -= 0.12;
      // water stains: world-space shader term (patchBaked), not baked into the repeat
      s.set(i, r, g, b);
      s.h[i] = h;
      s.rough[i] = bar ? 0.5 : 0.95;
      s.metal[i] = bar ? 0.6 : 0;
    });
    return { normal: 1.0, metal: true };
  },

  lightPanel(s) {
    s.enableEmissive();
    s.each((u, v, i) => {
      const fx = Math.min(u, 1 - u), fy = Math.min(v, 1 - v);
      const frame = fx < 0.06 || fy < 0.06;
      const prism = (Math.sin(u * 220) * Math.sin(v * 220)) * 0.5 + 0.5;
      if (frame) {
        s.set(i, 0.75, 0.74, 0.7); s.h[i] = 0.9; s.rough[i] = 0.45; s.metal[i] = 0.5;
        s.er[i] = s.eg[i] = s.eb[i] = 0;
      } else {
        const e = 0.85 + prism * 0.15 - smoothstep(0.12, 0.06, Math.min(fx, fy)) * 0.3;
        s.set(i, 0.95, 0.95, 0.9); s.h[i] = 0.4 + prism * 0.1; s.rough[i] = 0.3;
        s.er[i] = e; s.eg[i] = e * 0.97; s.eb[i] = e * 0.86;
      }
    });
    return { normal: 0.6, metal: true };
  },

  trim(s) {
    s.each((u, v, i) => {
      const grain = f(N1, u * 0.25, v * 6, 24, 3);
      let r = 0.42, g = 0.32, b = 0.20;
      r += (grain - 0.5) * 0.1; g += (grain - 0.5) * 0.08; b += (grain - 0.5) * 0.05;
      const scuff = f(N2, u, v, 16, 3);
      if (scuff > 0.64) { r *= 0.8; g *= 0.8; b *= 0.8; }
      // top bevel
      if (v > 0.85) { r *= 1.12; g *= 1.12; b *= 1.12; }
      s.set(i, r, g, b);
      s.h[i] = v > 0.85 ? 0.8 : 0.5 + grain * 0.1;
      s.rough[i] = 0.55;
    });
    return { normal: 1.0 };
  },

  // ------------------------------------------------------------- Generic
  concrete(s) {
    s.each((u, v, i) => {
      const n = f(N1, u, v, 6, 5);
      const spk = f(N2, u, v, 90, 2);
      const w = W1(u * 6, v * 6, 6);
      const crack = smoothstep(0.03, 0.0, w.f2 - w.f1) * smoothstep(0.55, 0.68, f(N3, u, v, 5, 3));
      let c = 0.52 + (n - 0.5) * 0.18 + (spk - 0.5) * 0.08 - crack * 0.18;
      const st = { t: 0, rim: 0, n: 0.5 }; // stains come from the world-space shader term
      c -= st.t * 0.08;
      s.set(i, c, c * 0.98, c * 0.95);
      s.h[i] = 0.5 + (spk - 0.5) * 0.3 + (n - 0.5) * 0.2 - crack * 0.6;
      s.rough[i] = 0.9 - st.t * 0.2;
    });
    return { normal: 1.4 };
  },

  pillarPaint(s) {
    // painted concrete pillar, cream with chipped corners and grime bands
    s.each((u, v, i) => {
      const n = f(N1, u, v, 5, 4), chip = f(N2, u, v, 12, 4);
      let r = 0.83, g = 0.76, b = 0.55;
      r += (n - 0.5) * 0.1; g += (n - 0.5) * 0.1; b += (n - 0.5) * 0.08;
      const chipped = chip > 0.79;
      if (chipped) { r = g = b = 0.5 + (n - 0.5) * 0.2; }
      const grime = smoothstep(0.2, 0.0, v) * 0.25;
      r -= grime; g -= grime; b -= grime * 0.8;
      s.set(i, r, g, b);
      s.h[i] = chipped ? 0.3 : 0.6;
      s.rough[i] = chipped ? 0.95 : 0.7;
    });
    return { normal: 1.0 };
  },

  woodCrate(s) {
    const planks = 4;
    s.each((u, v, i) => {
      const pi = Math.floor(v * planks), lv = v * planks - pi;
      const off = hash01(pi, 5);
      const grain = f(N1, u * 0.5 + off, v * 8, 32, 4);
      const ring = fract(grain * 6);
      let r = 0.55, g = 0.40, b = 0.24;
      const k = (grain - 0.5) * 0.25 + (ring < 0.15 ? -0.06 : 0) + (hash01(pi, 9) - 0.5) * 0.1;
      r += k; g += k * 0.85; b += k * 0.6;
      const gap = lv < 0.04 || lv > 0.96;
      if (gap) { r *= 0.35; g *= 0.35; b *= 0.35; }
      // nails
      const nx = Math.min(fract(u * 2), 1 - fract(u * 2));
      const nail = nx < 0.04 && Math.abs(lv - 0.5) < 0.06;
      if (nail) { r = 0.3; g = 0.3; b = 0.32; }
      const dirt = f(N2, u, v, 3, 4);
      r -= dirt * 0.12; g -= dirt * 0.12; b -= dirt * 0.1;
      s.set(i, r, g, b);
      s.h[i] = gap ? 0 : 0.6 + (grain - 0.5) * 0.2;
      s.rough[i] = nail ? 0.4 : 0.8;
      s.metal[i] = nail ? 1 : 0;
    });
    return { normal: 2.0, metal: true };
  },

  cardboard(s) {
    s.each((u, v, i) => {
      const n = f(N1, u, v, 12, 4);
      const corr = Math.sin(v * Math.PI * 2 * 48) * 0.5 + 0.5;
      let r = 0.62, g = 0.48, b = 0.30;
      r += (n - 0.5) * 0.12; g += (n - 0.5) * 0.1; b += (n - 0.5) * 0.06;
      const tape = Math.abs(u - 0.5) < 0.08;
      if (tape) { r = 0.70; g = 0.60; b = 0.42; }
      const st = stain(u, v, 3, 0.66);
      r -= st.t * 0.15; g -= st.t * 0.15; b -= st.t * 0.1;
      s.set(i, r, g, b);
      s.h[i] = tape ? 0.6 : 0.45 + corr * 0.05;
      s.rough[i] = tape ? 0.4 : 0.9;
    });
    return { normal: 0.8 };
  },

  paintedMetal(s) {
    // olive/gray locker paint with chips and rust streaks
    s.each((u, v, i) => {
      const n = f(N1, u, v, 8, 4);
      let r = 0.36, g = 0.42, b = 0.38;
      r += (n - 0.5) * 0.06; g += (n - 0.5) * 0.06; b += (n - 0.5) * 0.05;
      const chip = f(N2, u, v, 14, 5);
      const rust = smoothstep(0.68, 0.76, chip) * 0.8;
      const streak = smoothstep(0.7, 0.9, f(N3, u * 6, v * 0.5, 6, 3)) * (1 - v);
      const rr = Math.max(rust, streak * 0.7);
      r += (0.45 - r) * rr; g += (0.22 - g) * rr; b += (0.10 - b) * rr;
      const scratch = Math.abs(fract(u * 37 + v * 3 + n) - 0.5) < 0.01 && n > 0.55;
      if (scratch) { r += 0.15; g += 0.15; b += 0.15; }
      s.set(i, r, g, b);
      s.h[i] = 0.6 - rust * 0.3;
      s.rough[i] = 0.45 + rust * 0.45;
      s.metal[i] = scratch ? 1 : 0.55 - rust * 0.5;
    });
    return { normal: 0.8, metal: true };
  },

  paper(s) {
    s.each((u, v, i) => {
      const n = f(N1, u, v, 40, 3);
      let c = 0.88 + (n - 0.5) * 0.06;
      const line = fract(v * 22) < 0.04 && v > 0.12 && v < 0.92 ? 0.12 : 0;
      const st = stain(u, v, 2, 0.68);
      s.set(i, c - st.t * 0.12, c - line * 0.6 - st.t * 0.16, c - line * 0.2 - st.t * 0.25);
      s.h[i] = 0.5;
      s.rough[i] = 0.9;
    });
    return { normal: 0.3 };
  },

  // ------------------------------------------------------------- Level 1
  brick(s) {
    s.each((u, v, i) => {
      const c = brickCell(u, v, 4, 16);
      const n = f(N1, u, v, 24, 4);
      const mortarW = 0.0085;
      const isMortar = c.d < mortarW;
      let r, g, b, h;
      if (isMortar) {
        const m = 0.36 + (n - 0.5) * 0.1;
        r = m; g = m * 0.96; b = m * 0.9; h = 0.1 + n * 0.1;
      } else {
        const tone = c.id;
        r = 0.42 + tone * 0.14; g = 0.20 + tone * 0.06; b = 0.13 + tone * 0.04;
        if (c.id2 > 0.88) { r *= 0.6; g *= 0.6; b *= 0.6; } // burnt bricks
        r += (n - 0.5) * 0.12; g += (n - 0.5) * 0.06; b += (n - 0.5) * 0.04;
        const bevel = smoothstep(mortarW, mortarW + 0.008, c.d);
        h = 0.45 + bevel * 0.35 + (f(N2, u, v, 60, 2) - 0.5) * 0.15;
        // chips
        const chip = f(N3, u, v, 40, 3);
        if (chip > 0.7) { h -= 0.2; r *= 0.85; g *= 0.85; b *= 0.85; }
      }
      // soot and efflorescence
      const soot = f(N2, u, v, 4, 4);
      const k = smoothstep(0.5, 0.8, soot) * 0.22;
      r *= 1 - k; g *= 1 - k; b *= 1 - k;
      const salt = smoothstep(0.74, 0.86, f(N3, u, v, 8, 3)) * 0.12;
      r += salt; g += salt; b += salt * 0.95;
      s.set(i, r, g, b);
      s.h[i] = h;
      s.rough[i] = isMortar ? 0.95 : 0.85;
    });
    return { normal: 2.4 };
  },

  rustMetal(s) {
    s.each((u, v, i) => {
      const n = f(N1, u, v, 6, 5);
      const rustN = f(N2, u, v, 12, 5) * 0.7 + f(N3, u, v, 40, 3) * 0.3;
      const rust = smoothstep(0.46, 0.66, rustN) * 0.85;
      let r = 0.36, g = 0.34, b = 0.31;
      r += (n - 0.5) * 0.08; g += (n - 0.5) * 0.08; b += (n - 0.5) * 0.08;
      const rr = 0.40 + (f(N3, u, v, 30, 3) - 0.5) * 0.2;
      r += (rr - r) * rust; g += (rr * 0.48 - g) * rust; b += (rr * 0.22 - b) * rust;
      s.set(i, r, g, b);
      s.h[i] = 0.5 + rust * (f(N3, u, v, 40, 2) - 0.3) * 0.6;
      s.rough[i] = 0.45 + rust * 0.5;
      s.metal[i] = 0.85 - rust * 0.8;
    });
    return { normal: 1.6, metal: true };
  },

  grate(s) {
    s.each((u, v, i) => {
      const gu = fract(u * 8), gv = fract(v * 8);
      const bar = gu < 0.18 || gv < 0.18;
      const n = f(N1, u, v, 10, 4);
      const rust = smoothstep(0.5, 0.65, f(N2, u, v, 6, 4));
      let c = bar ? 0.36 + (n - 0.5) * 0.1 : 0.04;
      let r = c, g = c, b = c * 1.02;
      if (bar) { r += rust * 0.12; g += rust * 0.02; b -= rust * 0.04; }
      s.set(i, r, g, b);
      s.h[i] = bar ? 0.8 : 0;
      s.rough[i] = bar ? 0.5 + rust * 0.4 : 1;
      s.metal[i] = bar ? 0.8 - rust * 0.6 : 0;
    });
    return { normal: 3, metal: true };
  },

  industrialFloor(s) {
    s.each((u, v, i) => {
      const n = f(N1, u, v, 5, 5);
      const spk = f(N2, u, v, 120, 2);
      const slab = brickCell(u, v, 2, 2, 0);
      const seam = slab.d < 0.004;
      let c = 0.36 + (n - 0.5) * 0.14 + (spk - 0.5) * 0.06 + (slab.id - 0.5) * 0.04;
      // oil stains
      const st = { t: 0, rim: 0, n: 0.5 }; // stains come from the world-space shader term
      c -= st.t * 0.14 + st.rim * 0.06;
      // painted hazard line on one edge
      let r = c, g = c * 0.97, b = c * 0.93;
      const w = W1(u * 5, v * 5, 5);
      const crack = smoothstep(0.03, 0, w.f2 - w.f1) * smoothstep(0.5, 0.62, f(N2, u, v, 4, 3));
      r -= crack * 0.2; g -= crack * 0.2; b -= crack * 0.2;
      if (seam) { r *= 0.5; g *= 0.5; b *= 0.5; }
      s.set(i, r, g, b);
      s.h[i] = seam ? 0.1 : 0.5 + (spk - 0.5) * 0.2 - crack * 0.5;
      s.rough[i] = 0.85 - st.t * 0.5;
    });
    return { normal: 1.6 };
  },

  hazard(s) {
    s.each((u, v, i) => {
      const stripe = fract((u + v) * 4) < 0.5;
      const n = f(N1, u, v, 12, 4);
      let r = stripe ? 0.75 : 0.08, g = stripe ? 0.58 : 0.08, b = stripe ? 0.08 : 0.07;
      const wear = smoothstep(0.55, 0.7, f(N2, u, v, 10, 4));
      r += (0.35 - r) * wear; g += (0.34 - g) * wear; b += (0.32 - b) * wear;
      r += (n - 0.5) * 0.06; g += (n - 0.5) * 0.06;
      s.set(i, r, g, b);
      s.h[i] = 0.5 - wear * 0.1;
      s.rough[i] = 0.6 + wear * 0.3;
    });
    return { normal: 0.6 };
  },

  // ------------------------------------------------------------- Level 2
  officeCarpet(s) {
    s.each((u, v, i) => {
      const t = brickCell(u, v, 4, 4, 0);
      const dir = (t.col + t.row) % 2;
      const stripe = Math.sin((dir ? u : v) * Math.PI * 2 * 128) * 0.5 + 0.5;
      const fib = f(N1, u, v, 180, 2);
      let r = 0.25, g = 0.28, b = 0.33;
      const k = (fib - 0.5) * 0.08 + (stripe - 0.5) * 0.03 + (t.id - 0.5) * 0.03;
      r += k; g += k; b += k;
      const st = { t: 0, rim: 0, n: 0.5 }; // stains come from the world-space shader term
      r -= st.t * 0.06; g -= st.t * 0.06; b -= st.t * 0.07;
      if (t.d < 0.002) { r *= 0.8; g *= 0.8; b *= 0.8; }
      s.set(i, r, g, b);
      s.h[i] = fib * 0.6 + stripe * 0.2;
      s.rough[i] = 0.97;
    });
    return { normal: 1.3 };
  },

  drywall(s) {
    s.each((u, v, i) => {
      const n = f(N1, u, v, 6, 5), fine = f(N2, u, v, 120, 2);
      let r = 0.72, g = 0.72, b = 0.68;
      r += (n - 0.5) * 0.06 + (fine - 0.5) * 0.03; g += (n - 0.5) * 0.06 + (fine - 0.5) * 0.03; b += (n - 0.5) * 0.05;
      const grime = smoothstep(0.25, 0.0, v) * (0.5 + f(N3, u, 0.3, 8, 3) * 0.5) * 0.3;
      r -= grime; g -= grime; b -= grime * 0.9;
      // scuff marks at chair-rail height
      const sc = smoothstep(0.7, 0.78, f(N2, u * 4, v, 16, 3)) * smoothstep(0.25, 0.32, v) * smoothstep(0.42, 0.35, v) * smoothstep(0.5, 0.68, f(N1, u, 0.7, 3, 2));
      r -= sc * 0.16; g -= sc * 0.16; b -= sc * 0.16;
      // mould spots
      const mould = smoothstep(0.76, 0.84, f(N3, u, v, 6, 5));
      r -= mould * 0.12; g -= mould * 0.09; b -= mould * 0.12;
      s.set(i, r, g, b);
      s.h[i] = 0.5 + (fine - 0.5) * 0.15;
      s.rough[i] = 0.85;
    });
    return { normal: 0.7 };
  },

  fabric(s) {
    s.each((u, v, i) => {
      const weave = (Math.sin(u * Math.PI * 2 * 160) + Math.sin(v * Math.PI * 2 * 160)) * 0.25 + 0.5;
      const n = f(N1, u, v, 8, 4);
      let r = 0.30, g = 0.33, b = 0.38;
      const k = (weave - 0.5) * 0.06 + (n - 0.5) * 0.06;
      r += k; g += k; b += k;
      const st = stain(u, v, 2, 0.68);
      r -= st.t * 0.07; g -= st.t * 0.07; b -= st.t * 0.07;
      s.set(i, r, g, b);
      s.h[i] = weave;
      s.rough[i] = 1;
    });
    return { normal: 0.8 };
  },

  laminate(s) {
    s.each((u, v, i) => {
      const grain = f(N1, u * 0.2, v * 3, 20, 4);
      const ring = fract(grain * 9);
      let r = 0.56, g = 0.42, b = 0.28;
      const k = (grain - 0.5) * 0.18 + (ring < 0.2 ? -0.04 : 0);
      r += k; g += k * 0.85; b += k * 0.65;
      s.set(i, r, g, b);
      s.h[i] = 0.5 + k * 0.3;
      s.rough[i] = 0.45 + (grain - 0.5) * 0.2;
    });
    return { normal: 0.6 };
  },

  sewerBrick(s) {
    s.each((u, v, i) => {
      const c = brickCell(u, v, 3, 12);
      const n = f(N1, u, v, 20, 4);
      const isMortar = c.d < 0.011;
      let r, g, b, h;
      if (isMortar) { r = 0.16; g = 0.17; b = 0.14; h = 0.1; }
      else {
        r = 0.40 + c.id * 0.1; g = 0.35 + c.id * 0.08; b = 0.27 + c.id * 0.06;
        h = 0.5 + smoothstep(0.011, 0.02, c.d) * 0.3 + (n - 0.5) * 0.2;
      }
      // slime toward the bottom and drips
      const slime = smoothstep(0.45, 0.0, v) * (0.6 + 0.4 * f(N2, u, v, 8, 3));
      const drip = smoothstep(0.75, 0.9, f(N3, u * 8, v * 0.6, 8, 3));
      const k = Math.max(slime, drip * 0.7);
      r += (0.14 - r) * k; g += (0.20 - g) * k; b += (0.10 - b) * k;
      s.set(i, r, g, b);
      s.h[i] = h;
      s.rough[i] = 0.75 - k * 0.55; // wet = glossy
    });
    return { normal: 2.2 };
  },

  sewerFloor(s) {
    s.each((u, v, i) => {
      const n = f(N1, u, v, 6, 5);
      const w = W2(u * 8, v * 8, 8);
      const cobble = smoothstep(0.0, 0.12, w.f2 - w.f1);
      let c = 0.34 + (n - 0.5) * 0.12 + hash01(w.id) * 0.08;
      c *= 0.6 + cobble * 0.4;
      const slime = smoothstep(0.5, 0.7, f(N2, u, v, 4, 4));
      s.set(i, c - slime * 0.05, c + slime * 0.03, c - slime * 0.08);
      s.h[i] = cobble * 0.7 + (n - 0.5) * 0.2;
      s.rough[i] = 0.35 + (1 - cobble) * 0.3;
    });
    return { normal: 2 };
  },

  // ------------------------------------------------------------- Level 3
  poolTile(s) {
    const tiles = 16;
    s.each((u, v, i) => {
      const c = brickCell(u, v, tiles, tiles, 0);
      const grout = c.d < 0.0045;
      let r, g, b, h;
      if (grout) { r = 0.62; g = 0.66; b = 0.66; h = 0.1; }
      else {
        const t = (c.id - 0.5) * 0.04;
        r = 0.86 + t; g = 0.90 + t; b = 0.90 + t;
        if (c.id2 > 0.93) { r -= 0.12; g -= 0.02; b += 0.0; } // occasional cyan tile
        h = 0.6 + smoothstep(0.0045, 0.008, c.d) * 0.3;
      }
      const grime = smoothstep(0.7, 0.84, f(N1, u, v, 3, 4)) * 0.08;
      r -= grime; g -= grime * 0.8; b -= grime;
      s.set(i, r, g, b);
      s.h[i] = h;
      s.rough[i] = grout ? 0.8 : 0.12 + grime;
    });
    return { normal: 1.6 };
  },

  poolTileBlue(s) {
    const tiles = 16;
    s.each((u, v, i) => {
      const c = brickCell(u, v, tiles, tiles, 0);
      const grout = c.d < 0.0045;
      let r, g, b, h;
      if (grout) { r = 0.55; g = 0.66; b = 0.68; h = 0.1; }
      else {
        const t = (c.id - 0.5) * 0.08;
        r = 0.22 + t; g = 0.58 + t; b = 0.72 + t;
        h = 0.6 + smoothstep(0.0045, 0.008, c.d) * 0.3;
      }
      s.set(i, r, g, b);
      s.h[i] = h;
      s.rough[i] = grout ? 0.7 : 0.1;
    });
    return { normal: 1.6 };
  },

  // ------------------------------------------------------------- Level 5
  bridgeConcrete(s) {
    s.each((u, v, i) => {
      const n = f(N1, u, v, 4, 5);
      const spk = f(N2, u, v, 100, 2);
      const slab = brickCell(u, v, 1, 2, 0);
      const joint = slab.d < 0.004;
      let c = 0.56 + (n - 0.5) * 0.16 + (spk - 0.5) * 0.08;
      const streak = smoothstep(0.6, 0.85, f(N3, u * 10, v * 0.6, 10, 3)) * 0.12;
      c -= streak;
      const w = W1(u * 4, v * 4, 4);
      const crack = smoothstep(0.03, 0, w.f2 - w.f1) * smoothstep(0.52, 0.62, f(N2, u, v, 3, 3));
      c -= crack * 0.25;
      if (joint) c *= 0.55;
      s.set(i, c, c * 0.99, c * 0.97);
      s.h[i] = joint ? 0 : 0.5 + (spk - 0.5) * 0.25 - crack * 0.5;
      s.rough[i] = 0.92;
    });
    return { normal: 1.6 };
  },

  stone(s) {
    s.each((u, v, i) => {
      const c = brickCell(u, v, 2, 4);
      const n = f(N1, u, v, 10, 5);
      const mortar = c.d < 0.008;
      let k = mortar ? 0.25 : 0.42 + c.id * 0.1 + (n - 0.5) * 0.16;
      s.set(i, k, k * 0.98, k * 0.96);
      s.h[i] = mortar ? 0 : 0.5 + smoothstep(0.008, 0.03, c.d) * 0.4 + (n - 0.5) * 0.3;
      s.rough[i] = 0.9;
    });
    return { normal: 2 };
  },

  // ------------------------------------------------------------- Water
  waterNormal(s) {
    s.each((u, v, i) => {
      const a = f(N1, u, v, 6, 4, 0.55), b = f(N2, u + 0.37, v + 0.11, 12, 3, 0.5);
      const w = W2(u * 5, v * 5, 5);
      s.h[i] = a * 0.6 + b * 0.3 + (w.f2 - w.f1) * 0.25;
      s.set(i, 0.5, 0.5, 1);
      s.rough[i] = 0.05;
    });
    return { normal: 3.2 };
  },

  // ------------------------------------------------------------- Creatures
  bone(s) {
    s.each((u, v, i) => {
      const n = f(N1, u, v, 10, 5), fine = f(N2, u, v, 60, 2);
      let r = 0.80, g = 0.76, b = 0.64;
      const k = (n - 0.5) * 0.18 + (fine - 0.5) * 0.06;
      r += k; g += k; b += k * 0.8;
      const crack = Math.abs(fract(n * 8) - 0.5) < 0.03 ? 0.2 : 0;
      r -= crack; g -= crack; b -= crack;
      s.set(i, r, g, b);
      s.h[i] = n * 0.7 + fine * 0.3 - crack;
      s.rough[i] = 0.6;
    });
    return { normal: 2 };
  },

  chitin(s) {
    s.each((u, v, i) => {
      const w = W1(u * 12, v * 12, 12);
      const plate = smoothstep(0.0, 0.1, w.f2 - w.f1);
      const n = f(N1, u, v, 8, 4);
      let r = 0.45 + hash01(w.id) * 0.12, g = 0.30 + hash01(w.id) * 0.06, b = 0.10;
      r *= 0.55 + plate * 0.45; g *= 0.55 + plate * 0.45; b *= 0.55 + plate * 0.45;
      r += (n - 0.5) * 0.08;
      s.set(i, r, g, b);
      s.h[i] = plate * 0.8 + n * 0.2;
      s.rough[i] = 0.3 + (1 - plate) * 0.4;
    });
    return { normal: 2.5 };
  },

  skinPale(s) {
    s.each((u, v, i) => {
      const n = f(N1, u, v, 12, 5), vein = f(N2, u, v, 6, 5);
      let r = 0.78, g = 0.72, b = 0.68;
      r += (n - 0.5) * 0.12; g += (n - 0.5) * 0.1; b += (n - 0.5) * 0.1;
      const vv = smoothstep(0.03, 0.0, Math.abs(vein - 0.5)) * 0.25;
      r -= vv * 0.6; g -= vv * 0.4; b += vv * 0.1;
      s.set(i, r, g, b);
      s.h[i] = n;
      s.rough[i] = 0.55;
    });
    return { normal: 1.2 };
  },
};
