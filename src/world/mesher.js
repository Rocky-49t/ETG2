// Turns ChunkData into renderable geometry: floors, ceilings, walls, ledges,
// stairs, trims, props, fixtures, decals and water — all merged per material
// with baked lighting (light pools + occlusion) in a vertex attribute.
import * as THREE from 'three';
import { GeoBuilder } from './builder.js';
import { PROP_DEFS, LIGHT_VISUALS } from './props.js';
import { TILE, CS, T_SOLID, T_FLOOR, T_VOID, NO_WATER, OPEN_SKY } from './chunk.js';
import { RNG, hash4, clamp, smoothstep } from '../core/rng.js';
import { decalUV } from '../gfx/materials.js';

const DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]]; // +x, +z, -x, -z

export function buildChunkMesh(level, c, lib) {
  const def = level.def;
  const pal = def.palette;
  const B = new GeoBuilder();
  const fixtures = [];

  // ---- gather lights from the 3x3 neighbourhood for baking
  const bakeLights = [];
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
    const n = level.chunk(c.cx + dx, c.cz + dz);
    for (const l of n.lights) {
      if (l.flicker > 0 || l.broken || l.noBake) continue;
      const k = l.intensity * (def.bakeGain ?? 0.06);
      bakeLights.push({ x: l.x, y: l.y, z: l.z, r: l.color[0] * k, g: l.color[1] * k, b: l.color[2] * k, range: l.range || 9, tx: Math.floor(l.x / TILE), tz: Math.floor(l.z / TILE) });
    }
  }
  const amb = def.ambient || [0.02, 0.02, 0.02];
  const losCache = new Map();
  const solidW = (x, z) => level.typeAt(Math.floor(x / TILE), Math.floor(z / TILE)) === T_SOLID;

  const aoAt = (x, y, z, nx, ny, nz) => {
    const px = x + nx * 0.3, pz = z + nz * 0.3;
    let cnt = 0;
    const o = 0.6, d = 0.45;
    if (solidW(px + o, pz)) cnt += 1;
    if (solidW(px - o, pz)) cnt += 1;
    if (solidW(px, pz + o)) cnt += 1;
    if (solidW(px, pz - o)) cnt += 1;
    if (solidW(px + d, pz + d)) cnt += 0.5;
    if (solidW(px - d, pz + d)) cnt += 0.5;
    if (solidW(px + d, pz - d)) cnt += 0.5;
    if (solidW(px - d, pz - d)) cnt += 0.5;
    let ao = 1 - Math.max(0, cnt - (Math.abs(ny) < 0.5 ? 1 : 0)) * 0.09;
    if (Math.abs(ny) < 0.5) {
      const f = level.floorAt(px, pz), ce = level.ceilAt(px, pz);
      if (f > -Infinity && f < Infinity) ao *= 0.5 + 0.5 * smoothstep(0, 0.8, y - f);
      if (ce < OPEN_SKY && ce > -Infinity) ao *= 0.72 + 0.28 * smoothstep(0, 0.6, ce - y);
    }
    return ao;
  };

  B.bake = (x, y, z, nx, ny, nz, cheap) => {
    const omni = nx === 0 && ny === 0 && nz === 0;
    const ao = cheap ? 1 : aoAt(x, y, z, nx, ny, nz);
    let r = amb[0] * ao, g = amb[1] * ao, b = amb[2] * ao;
    const sx = x + nx * 0.25, sz = z + nz * 0.25;
    const stx = Math.floor(sx / TILE), stz = Math.floor(sz / TILE);
    for (let i = 0; i < bakeLights.length; i++) {
      const L = bakeLights[i];
      const lx = L.x - x, ly = L.y - y, lz = L.z - z;
      const d2 = lx * lx + ly * ly + lz * lz;
      const R = L.range;
      if (d2 > R * R) continue;
      const d = Math.sqrt(d2) + 1e-4;
      let wrap = 1;
      if (!omni) {
        const ndl = (nx * lx + ny * ly + nz * lz) / d;
        wrap = Math.max(0, ndl * 0.65 + 0.35);
        if (wrap <= 0) continue;
      }
      const key = stx * 73856093 ^ stz * 19349663 ^ i * 83492791;
      let vis = losCache.get(key);
      if (vis === undefined) {
        vis = (stx === L.tx && stz === L.tz) ? 1 : (level.tileLOS(sx, sz, L.x, L.z) ? 1 : 0.06);
        losCache.set(key, vis);
      }
      const fall = (1 - d2 / (R * R));
      const att = (fall * fall) / (1 + d2 * 0.18);
      const k = wrap * att * vis * (0.55 + 0.45 * ao);
      r += L.r * k; g += L.g * k; b += L.b * k;
    }
    return [r, g, b];
  };

  const fm = i => pal.floor[c.fmat[i]] || pal.floor[0];
  const cm = i => pal.ceil[c.cmat[i]] || pal.ceil[0];
  const wm = (cc, i) => pal.wall[cc.wmat[i]] || pal.wall[0];
  const openWallH = def.openWallHeight ?? 6;

  for (let lz = 0; lz < CS; lz++) {
    for (let lx = 0; lx < CS; lx++) {
      const i = lz * CS + lx;
      const type = c.type[i];
      if (type === T_SOLID) continue;
      const tx = c.cx * CS + lx, tz = c.cz * CS + lz;
      const x0 = tx * TILE, z0 = tz * TILE, x1 = x0 + TILE, z1 = z0 + TILE;
      const f = c.floor[i], ce = c.ceil[i];
      const hasCeil = ce < OPEN_SKY;
      const ramp = c.ramp[i];

      if (type === T_FLOOR) {
        const F = fm(i);
        if (ramp < 0) {
          const s = F.scale || 2;
          B.grid(F.mat, [x0, f, z0], [0, 0, TILE], [TILE, 0, 0], 2, 2, [0, 1, 0], (x, y, z) => [x / s, z / s]);
        } else {
          // stepped stairs: 5 steps rising toward the ramp direction
          const steps = 5, rise = c.rampH[i];
          for (let k = 0; k < steps; k++) {
            const t0 = k / steps, t1 = (k + 1) / steps;
            const top = f + rise * (k + 1) / steps;
            let bx0, bx1, bz0, bz1;
            if (ramp === 0) { bx0 = x0 + t0 * TILE; bx1 = x0 + t1 * TILE; bz0 = z0; bz1 = z1; }
            else if (ramp === 2) { bx1 = x1 - t0 * TILE; bx0 = x1 - t1 * TILE; bz0 = z0; bz1 = z1; }
            else if (ramp === 1) { bz0 = z0 + t0 * TILE; bz1 = z0 + t1 * TILE; bx0 = x0; bx1 = x1; }
            else { bz1 = z1 - t0 * TILE; bz0 = z1 - t1 * TILE; bx0 = x0; bx1 = x1; }
            const bottom = f - 0.02;
            B.box(F.stairMat || F.mat, (bx0 + bx1) / 2, (bottom + top) / 2, (bz0 + bz1) / 2, bx1 - bx0, top - bottom, bz1 - bz0, F.scale || 2);
          }
        }
      }
      if (hasCeil && type === T_FLOOR) {
        const C = cm(i);
        const s = C.scale || 2;
        B.grid(C.mat, [x0, ce, z0], [TILE, 0, 0], [0, 0, TILE], 2, 2, [0, -1, 0], (x, y, z) => [x / s, z / s]);
      }

      // neighbours
      for (let d = 0; d < 4; d++) {
        const ntx = tx + DIRS[d][0], ntz = tz + DIRS[d][1];
        const [nc, ni] = level.tile(ntx, ntz);
        const nt = nc.type[ni];
        // face geometry along the shared edge
        let o, eu, n, uFn;
        // y-range filled in per case
        const edge = (y0, y1, mat, scaleU, scaleV, vBase) => {
          if (y1 - y0 < 0.01) return;
          const h = y1 - y0;
          const segV = Math.max(1, Math.round(h / 1.0));
          let origin, euv;
          if (d === 0) { origin = [x1, y0, z0]; euv = [0, 0, TILE]; n = [-1, 0, 0]; uFn = (x, y, z) => z; }
          else if (d === 2) { origin = [x0, y0, z1]; euv = [0, 0, -TILE]; n = [1, 0, 0]; uFn = (x, y, z) => -z; }
          else if (d === 1) { origin = [x1, y0, z1]; euv = [-TILE, 0, 0]; n = [0, 0, -1]; uFn = (x, y, z) => -x; }
          else { origin = [x0, y0, z0]; euv = [TILE, 0, 0]; n = [0, 0, 1]; uFn = (x, y, z) => x; }
          B.grid(mat, origin, euv, [0, h, 0], 2, segV, n, (x, y, z) => [uFn(x, y, z) / scaleU, (y - vBase) / scaleV]);
          return { origin, euv, n };
        };

        if (nt === T_SOLID) {
          const W = wm(nc, ni);
          const bottom = ramp >= 0 ? f : f;
          const top = hasCeil ? ce : f + openWallH;
          edge(bottom - 0.01, top + 0.01, W.mat, W.scaleU || 2, W.scaleV || 3, W.vBase === 'abs' ? 0 : f);
          // baseboard trim
          if (W.trim && ramp < 0) {
            const t = 0.03, h = W.trimH || 0.11;
            const [dx, dz] = DIRS[d];
            const cxw = (x0 + x1) / 2 + dx * (TILE / 2 - t / 2), czw = (z0 + z1) / 2 + dz * (TILE / 2 - t / 2);
            B.box(W.trim, cxw, f + h / 2, czw, dx ? t : TILE, h, dz ? t : TILE, 0.5, 63 & ~(dx > 0 ? 1 : dx < 0 ? 2 : dz > 0 ? 16 : 32));
          }
          if (W.crown && hasCeil) {
            const t = 0.05, h = 0.08;
            const [dx, dz] = DIRS[d];
            const cxw = (x0 + x1) / 2 + dx * (TILE / 2 - t / 2), czw = (z0 + z1) / 2 + dz * (TILE / 2 - t / 2);
            B.box(W.crown, cxw, ce - h / 2, czw, dx ? t : TILE, h, dz ? t : TILE, 0.5, 63 & ~(dx > 0 ? 1 : dx < 0 ? 2 : dz > 0 ? 16 : 32) & ~4);
          }
        } else if (nt === T_FLOOR || nt === T_VOID) {
          // ledge: we are higher than neighbour
          const nf = nt === T_VOID ? f - (def.voidLedge ?? 1.2) : nc.floor[ni];
          const nRamp = nt === T_FLOOR ? nc.ramp[ni] : -1;
          if (type === T_FLOOR && ramp < 0 && f > nf + 0.01 && (nRamp < 0 || (nRamp !== d && (nRamp + 2) % 4 !== d) || f > nf + nc.rampH[ni] + 0.01)) {
            // the face sits on the shared edge facing the LOWER neighbour (it
            // must be visible from below, e.g. a pool's side walls)
            const L = pal.ledge || pal.floor[0];
            const y0 = nf, h = f - nf, sc = L.scale || 2;
            let origin, euv, nn, uF;
            if (d === 0) { origin = [x1, y0, z1]; euv = [0, 0, -TILE]; nn = [1, 0, 0]; uF = (z, x) => -z; }
            else if (d === 2) { origin = [x0, y0, z0]; euv = [0, 0, TILE]; nn = [-1, 0, 0]; uF = (z, x) => z; }
            else if (d === 1) { origin = [x0, y0, z1]; euv = [TILE, 0, 0]; nn = [0, 0, 1]; uF = (z, x) => x; }
            else { origin = [x1, y0, z0]; euv = [-TILE, 0, 0]; nn = [0, 0, -1]; uF = (z, x) => -x; }
            B.grid(L.mat, origin, euv, [0, h, 0], 2, Math.max(1, Math.round(h / 1.0)), nn, (x, y, z) => [uF(z, x) / sc, y / sc]);
          }
          // soffit: our ceiling lower than neighbour's
          if (hasCeil && nt === T_FLOOR) {
            const nce = nc.ceil[ni];
            if (nce > ce + 0.01) {
              const S = pal.soffit || pal.wall[0];
              const top = nce >= OPEN_SKY ? ce + (def.soffitOpen ?? 1.5) : nce;
              // face sits on shared edge facing the neighbour: reverse direction
              const y0 = ce, y1 = top;
              const h = y1 - y0;
              let origin, euv, nn, uF;
              if (d === 0) { origin = [x1, y0, z1]; euv = [0, 0, -TILE]; nn = [1, 0, 0]; uF = z => -z; }
              else if (d === 2) { origin = [x0, y0, z0]; euv = [0, 0, TILE]; nn = [-1, 0, 0]; uF = z => z; }
              else if (d === 1) { origin = [x0, y0, z1]; euv = [TILE, 0, 0]; nn = [0, 0, 1]; uF = (z, x) => x; }
              else { origin = [x1, y0, z0]; euv = [-TILE, 0, 0]; nn = [0, 0, -1]; uF = (z, x) => -x; }
              const sU = S.scaleU || 2, sV = S.scaleV || 3;
              B.grid(S.mat, origin, euv, [0, h, 0], 2, 1, nn, (x, y, z) => [uF(z, x) / sU, (y - ce) / sV]);
            }
          }
        }
      }

      // water surface
      if (c.water[i] > NO_WATER + 1 && c.water[i] > f - 0.01 && (c.meta.waterMat || def.waterMat)) {
        const w = c.water[i];
        B.quad(c.meta.waterMat || def.waterMat, [x0, w, z1], [x1, w, z1], [x1, w, z0], [x0, w, z0], [0, 1, 0], [[x0 / 2.5, z1 / 2.5], [x1 / 2.5, z1 / 2.5], [x1 / 2.5, z0 / 2.5], [x0 / 2.5, z0 / 2.5]]);
      }
    }
  }

  // ---- props
  const rng = new RNG(hash4(level.levelSeed, c.cx, c.cz, 991));
  for (const p of c.props) {
    const pd = PROP_DEFS[p.kind];
    if (!pd) continue;
    B.setTransform(p.x, p.y, p.z, p.ry, p.scale || 1);
    B.setAnchor(p.x, p.y + 0.6, p.z);
    pd.build(p, B, rng);
    B.resetTransform();
  }

  // ---- light fixtures
  for (const l of c.lights) {
    const vis = LIGHT_VISUALS[l.kind] || LIGHT_VISUALS.panel;
    if (l.flicker > 0 || l.broken) {
      const FB = new GeoBuilder();
      FB.bake = B.bake;
      FB.setAnchor(l.x, l.y - 0.3, l.z);
      const emissiveKey = l.kind === 'panel' ? 'lightPanel' : (l.kind === 'tube' || l.kind === 'flood' || l.kind === 'strip') ? 'glowWhite' : 'bulbWarm';
      const mat = lib.dyn(emissiveKey).clone();
      mat.userData.baseIntensity = mat.emissiveIntensity;
      vis(l, FB, '__fixture');
      const g = FB.build(name => (name === '__fixture' ? mat : lib.get(name)), { castShadow: false });
      fixtures.push({ light: l, group: g, mat });
    } else {
      B.setAnchor(l.x, l.y - 0.3, l.z);
      vis(l, B);
      B.anchor = null;
    }
  }

  // ---- decals
  for (const dcl of c.decals) {
    // the EXIT arrow has a pre-mirrored twin so its lettering never reads backwards
    const twin = dcl.flip && dcl.name === 'arrow';
    const [u0, v0, u1, v1] = decalUV(twin ? 'arrowL' : dcl.name);
    const s = dcl.size || 1;
    const h = s / 2;
    const nx = dcl.nx || 0, ny = dcl.ny || 0, nz = dcl.nz || 0;
    const px = dcl.x + nx * 0.012, py = dcl.y + ny * 0.012, pz = dcl.z + nz * 0.012;
    // tangent u in the decal plane, v = n x u (so u x v = n)
    let ux, uy, uz;
    if (Math.abs(ny) > 0.5) { ux = 1; uy = 0; uz = 0; }
    else { ux = nz; uy = 0; uz = -nx; if (dcl.flip && !twin) { ux = -ux; uz = -uz; } }
    let vx = ny * uz - nz * uy, vy = nz * ux - nx * uz, vz = nx * uy - ny * ux;
    const r = dcl.rot || 0;
    if (r) {
      const cr = Math.cos(r), sr = Math.sin(r);
      const a1 = ux * cr + vx * sr, a2 = uy * cr + vy * sr, a3 = uz * cr + vz * sr;
      vx = vx * cr - ux * sr; vy = vy * cr - uy * sr; vz = vz * cr - uz * sr;
      ux = a1; uy = a2; uz = a3;
    }
    const P = (a, b) => [px + ux * a * h + vx * b * h, py + uy * a * h + vy * b * h, pz + uz * a * h + vz * b * h];
    B.anchor = null;
    B.quad('decals', P(-1, -1), P(1, -1), P(1, 1), P(-1, 1), [nx, ny, nz], [[u0, v0], [u1, v0], [u1, v1], [u0, v1]]);
  }

  // ---- level-specific extra geometry
  def.buildExtra?.(level, c, B, rng);

  const group = B.build(name => lib.get(name));
  group.name = 'chunk ' + c.key;
  for (const fx of fixtures) group.add(fx.group);
  return { group, fixtures };
}
