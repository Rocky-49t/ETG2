// LevelInstance: one procedural level for one seed. Owns chunk data (generated
// lazily and cached), landmark placement, and all spatial queries: collision,
// ground height, raycasts, line of sight and A* pathfinding.
import { ChunkData, TILE, CS, CHUNK, T_SOLID, T_FLOOR, T_VOID, F_NAVBLOCK, NO_WATER, OPEN_SKY } from './chunk.js';
import { chunkPorts, chunkRng, passable } from './gen.js';
import { hash4, hashString, RNG } from '../core/rng.js';

const MAX_CACHED = 220;

export class LevelInstance {
  constructor(def, seed) {
    this.def = def;
    this.id = def.id;
    this.seed = seed >>> 0;
    this.levelSeed = hash4(this.seed, hashString(def.id));
    this.chunks = new Map();
    this.tick = 0;
    this._last = null;
    this.landmarks = def.landmarks ? def.landmarks(this) : [];
    this.byType = {};
    for (const l of this.landmarks) this.byType[l.type] = l;
  }

  // ------------------------------------------------------------------ chunks
  chunk(cx, cz) {
    const key = cx + ',' + cz;
    let c = this.chunks.get(key);
    if (!c) {
      c = new ChunkData(cx, cz);
      const ports = chunkPorts(this.levelSeed, cx, cz, this.def.portConfig);
      const rng = chunkRng(this.levelSeed, this.id, cx, cz);
      const lms = this.landmarks.filter(l => Math.floor(l.tx / CS) === cx && Math.floor(l.tz / CS) === cz)
        .map(l => ({ ...l, lx: l.tx - cx * CS, lz: l.tz - cz * CS }));
      this.def.generate(c, { level: this, rng, ports, landmarks: lms, seed: this.levelSeed });
      this.chunks.set(key, c);
      if (this.chunks.size > MAX_CACHED) this.evict();
    }
    c.used = this.tick;
    return c;
  }

  hasChunk(cx, cz) { return this.chunks.has(cx + ',' + cz); }

  evict() {
    const arr = [...this.chunks.values()].sort((a, b) => a.used - b.used);
    for (let k = 0; k < arr.length - MAX_CACHED * 0.8; k++) {
      if (arr[k].pinned) continue;
      this.chunks.delete(arr[k].key);
    }
  }

  // Tile lookup -> [chunk, index]
  tile(tx, tz) {
    const cx = Math.floor(tx / CS), cz = Math.floor(tz / CS);
    let c = this._last;
    if (!c || c.cx !== cx || c.cz !== cz) { c = this.chunk(cx, cz); this._last = c; }
    return [c, (tz - cz * CS) * CS + (tx - cx * CS)];
  }

  typeAt(tx, tz) { const [c, i] = this.tile(tx, tz); return c.type[i]; }

  isSolidW(x, z) { return this.typeAt(Math.floor(x / TILE), Math.floor(z / TILE)) === T_SOLID; }

  // Floor height at world x,z (ramps interpolated). -Infinity over void, +Infinity in walls.
  floorAt(x, z) {
    const tx = Math.floor(x / TILE), tz = Math.floor(z / TILE);
    const [c, i] = this.tile(tx, tz);
    const t = c.type[i];
    if (t === T_SOLID) return Infinity;
    if (t === T_VOID) return -Infinity;
    return this._floorIn(c, i, x - tx * TILE, z - tz * TILE);
  }

  _floorIn(c, i, fx, fz) {
    const r = c.ramp[i];
    if (r < 0) return c.floor[i];
    let t;
    if (r === 0) t = fx / TILE; else if (r === 1) t = fz / TILE; else if (r === 2) t = 1 - fx / TILE; else t = 1 - fz / TILE;
    return c.floor[i] + c.rampH[i] * Math.min(1, Math.max(0, t));
  }

  ceilAt(x, z) {
    const [c, i] = this.tile(Math.floor(x / TILE), Math.floor(z / TILE));
    return c.type[i] === T_SOLID ? -Infinity : c.ceil[i];
  }

  waterAt(x, z) {
    const [c, i] = this.tile(Math.floor(x / TILE), Math.floor(z / TILE));
    return c.water[i];
  }

  flagsAt(x, z) {
    const [c, i] = this.tile(Math.floor(x / TILE), Math.floor(z / TILE));
    return c.flags[i];
  }

  // ------------------------------------------------------------------ collision
  // Push a vertical cylinder (feet at body.y) out of walls, ledges, low
  // ceilings and prop colliders. body: {x,y,z,r,h,step}
  resolve(body) {
    const r = body.r, step = body.step ?? 0.45;
    for (let iter = 0; iter < 3; iter++) {
      let moved = false;
      const tx0 = Math.floor((body.x - r) / TILE), tx1 = Math.floor((body.x + r) / TILE);
      const tz0 = Math.floor((body.z - r) / TILE), tz1 = Math.floor((body.z + r) / TILE);
      for (let tz = tz0; tz <= tz1; tz++) {
        for (let tx = tx0; tx <= tx1; tx++) {
          const [c, i] = this.tile(tx, tz);
          const t = c.type[i];
          const x0 = tx * TILE, z0 = tz * TILE;
          let block = false;
          if (t === T_SOLID) block = true;
          else if (t === T_FLOOR) {
            const qx = Math.min(Math.max(body.x, x0), x0 + TILE), qz = Math.min(Math.max(body.z, z0), z0 + TILE);
            const f = this._floorIn(c, i, qx - x0, qz - z0);
            if (f > body.y + step) block = true;
            else if (c.ceil[i] < OPEN_SKY && c.ceil[i] < body.y + body.h - 0.02 && !(body.y > c.ceil[i])) block = true;
          }
          if (block && this._pushRect(body, x0, z0, x0 + TILE, z0 + TILE)) moved = true;
        }
      }
      // prop colliders
      const cx0 = Math.floor((body.x - r - 1) / CHUNK), cx1 = Math.floor((body.x + r + 1) / CHUNK);
      const cz0 = Math.floor((body.z - r - 1) / CHUNK), cz1 = Math.floor((body.z + r + 1) / CHUNK);
      for (let cz = cz0; cz <= cz1; cz++) for (let cx = cx0; cx <= cx1; cx++) {
        const ch = this.chunk(cx, cz);
        const list = ch.colliders;
        for (let k = 0; k < list.length; k++) {
          const b = list[k];
          if (b.disabled) continue;
          if (b.x1 < body.x - r || b.x0 > body.x + r || b.z1 < body.z - r || b.z0 > body.z + r) continue;
          if (b.y1 <= body.y + step || b.y0 >= body.y + body.h) continue;
          if (this._pushRect(body, b.x0, b.z0, b.x1, b.z1)) moved = true;
        }
        if (ch.dynamicColliders) for (const b of ch.dynamicColliders) {
          if (b.disabled) continue;
          if (b.y1 <= body.y + step || b.y0 >= body.y + body.h) continue;
          if (this._pushRect(body, b.x0, b.z0, b.x1, b.z1)) moved = true;
        }
      }
      if (!moved) break;
    }
  }

  _pushRect(body, x0, z0, x1, z1) {
    const r = body.r;
    const qx = Math.min(Math.max(body.x, x0), x1), qz = Math.min(Math.max(body.z, z0), z1);
    let dx = body.x - qx, dz = body.z - qz;
    const d2 = dx * dx + dz * dz;
    if (d2 >= r * r) return false;
    if (d2 > 1e-10) {
      const d = Math.sqrt(d2), k = (r - d) / d;
      body.x += dx * k; body.z += dz * k;
    } else {
      // centre inside: push along the shallowest axis
      const l = body.x - x0, rr = x1 - body.x, t = body.z - z0, b = z1 - body.z;
      const m = Math.min(l, rr, t, b);
      if (m === l) body.x = x0 - r; else if (m === rr) body.x = x1 + r; else if (m === t) body.z = z0 - r; else body.z = z1 + r;
    }
    return true;
  }

  // Ground height under a body (floor or the top of a prop it stands on).
  groundAt(body) {
    let g = this.floorAt(body.x, body.z);
    if (g === Infinity) g = body.y; // inside a wall: don't teleport
    const r = body.r * 0.75, step = body.step ?? 0.45;
    const cx = Math.floor(body.x / CHUNK), cz = Math.floor(body.z / CHUNK);
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      const ch = this.chunks.get((cx + dx) + ',' + (cz + dz));
      if (!ch) continue;
      const scan = list => {
        for (const b of list) {
          if (b.disabled) continue;
          if (b.x1 < body.x - r || b.x0 > body.x + r || b.z1 < body.z - r || b.z0 > body.z + r) continue;
          if (b.y1 <= body.y + step + 0.01 && b.y1 > g) g = b.y1;
        }
      };
      scan(ch.colliders);
      if (ch.dynamicColliders) scan(ch.dynamicColliders);
    }
    return g;
  }

  // Lowest overhead obstacle above a body (ceiling or prop underside).
  headAt(body) {
    let h = this.ceilAt(body.x, body.z);
    if (h === -Infinity) h = OPEN_SKY;
    return h;
  }

  // Move a body horizontally with collision, in sub-steps.
  move(body, dx, dz) {
    const dist = Math.hypot(dx, dz);
    const steps = Math.max(1, Math.ceil(dist / (body.r * 0.8)));
    for (let s = 0; s < steps; s++) {
      body.x += dx / steps;
      body.z += dz / steps;
      this.resolve(body);
    }
  }

  // ------------------------------------------------------------------ raycasts
  // Returns {dist, x,y,z, nx,ny,nz, what:'wall'|'floor'|'ceil'|'prop'} or null.
  raycast(ox, oy, oz, dx, dy, dz, maxD, opts = {}) {
    const len = Math.hypot(dx, dy, dz) || 1;
    dx /= len; dy /= len; dz /= len;
    let best = null;
    // --- tile DDA
    let tx = Math.floor(ox / TILE), tz = Math.floor(oz / TILE);
    const stepX = dx > 0 ? 1 : -1, stepZ = dz > 0 ? 1 : -1;
    const tDeltaX = Math.abs(dx) > 1e-9 ? TILE / Math.abs(dx) : Infinity;
    const tDeltaZ = Math.abs(dz) > 1e-9 ? TILE / Math.abs(dz) : Infinity;
    let tMaxX = Math.abs(dx) > 1e-9 ? ((dx > 0 ? (tx + 1) * TILE - ox : ox - tx * TILE) / Math.abs(dx)) : Infinity;
    let tMaxZ = Math.abs(dz) > 1e-9 ? ((dz > 0 ? (tz + 1) * TILE - oz : oz - tz * TILE) / Math.abs(dz)) : Infinity;
    let t = 0, lastAxis = -1;
    for (let guard = 0; guard < 400 && t <= maxD; guard++) {
      const [c, i] = this.tile(tx, tz);
      const type = c.type[i];
      const tNext = Math.min(tMaxX, tMaxZ, maxD);
      if (type === T_SOLID) {
        best = { dist: t, x: ox + dx * t, y: oy + dy * t, z: oz + dz * t, nx: lastAxis === 0 ? -stepX : 0, ny: 0, nz: lastAxis === 1 ? -stepZ : 0, what: 'wall' };
        break;
      }
      const f = type === T_VOID ? -Infinity : (c.ramp[i] >= 0 ? c.floor[i] + c.rampH[i] * 0.5 : c.floor[i]);
      const ce = c.ceil[i] >= OPEN_SKY ? Infinity : c.ceil[i];
      if (dy < 0 && f > -Infinity) {
        const th = (f - oy) / dy;
        if (th >= t - 1e-6 && th <= tNext) { best = { dist: Math.max(th, 0), x: ox + dx * th, y: f, z: oz + dz * th, nx: 0, ny: 1, nz: 0, what: 'floor' }; break; }
      }
      if (dy > 0 && ce < Infinity) {
        const th = (ce - oy) / dy;
        if (th >= t - 1e-6 && th <= tNext) { best = { dist: Math.max(th, 0), x: ox + dx * th, y: ce, z: oz + dz * th, nx: 0, ny: -1, nz: 0, what: 'ceil' }; break; }
      }
      if (tNext >= maxD) break;
      if (tMaxX < tMaxZ) { t = tMaxX; tMaxX += tDeltaX; tx += stepX; lastAxis = 0; }
      else { t = tMaxZ; tMaxZ += tDeltaZ; tz += stepZ; lastAxis = 1; }
    }
    // --- props
    if (!opts.ignoreProps) {
      const lim = best ? best.dist : maxD;
      const ex = ox + dx * lim, ez = oz + dz * lim;
      const cx0 = Math.floor(Math.min(ox, ex) / CHUNK), cx1 = Math.floor(Math.max(ox, ex) / CHUNK);
      const cz0 = Math.floor(Math.min(oz, ez) / CHUNK), cz1 = Math.floor(Math.max(oz, ez) / CHUNK);
      const idx = 1 / dx, idy = 1 / dy, idz = 1 / dz;
      for (let cz = cz0; cz <= cz1; cz++) for (let cx = cx0; cx <= cx1; cx++) {
        const ch = this.chunks.get(cx + ',' + cz);
        if (!ch) continue;
        const test = list => {
          for (const b of list) {
            if (b.disabled || (opts.thin && b.thin)) continue;
            let t1 = (b.x0 - ox) * idx, t2 = (b.x1 - ox) * idx;
            let tmin = Math.min(t1, t2), tmax = Math.max(t1, t2);
            t1 = (b.y0 - oy) * idy; t2 = (b.y1 - oy) * idy;
            tmin = Math.max(tmin, Math.min(t1, t2)); tmax = Math.min(tmax, Math.max(t1, t2));
            t1 = (b.z0 - oz) * idz; t2 = (b.z1 - oz) * idz;
            tmin = Math.max(tmin, Math.min(t1, t2)); tmax = Math.min(tmax, Math.max(t1, t2));
            if (tmax >= Math.max(tmin, 0) && tmin < (best ? best.dist : maxD) && tmin >= 0) {
              const px = ox + dx * tmin, py = oy + dy * tmin, pz = oz + dz * tmin;
              let nx = 0, ny = 0, nz = 0;
              const e = 1e-3;
              if (Math.abs(px - b.x0) < e) nx = -1; else if (Math.abs(px - b.x1) < e) nx = 1;
              else if (Math.abs(py - b.y0) < e) ny = -1; else if (Math.abs(py - b.y1) < e) ny = 1;
              else if (Math.abs(pz - b.z0) < e) nz = -1; else nz = 1;
              best = { dist: tmin, x: px, y: py, z: pz, nx, ny, nz, what: 'prop', collider: b };
            }
          }
        };
        test(ch.colliders);
        if (ch.dynamicColliders) test(ch.dynamicColliders);
      }
    }
    return best;
  }

  lineOfSight(ax, ay, az, bx, by, bz, opts) {
    const dx = bx - ax, dy = by - ay, dz = bz - az;
    const d = Math.hypot(dx, dy, dz);
    if (d < 1e-4) return true;
    const hit = this.raycast(ax, ay, az, dx, dy, dz, d, opts);
    return !hit || hit.dist >= d - 0.05;
  }

  // Cheap 2D tile visibility (walls only), used for light baking.
  tileLOS(ax, az, bx, bz) {
    let tx = Math.floor(ax / TILE), tz = Math.floor(az / TILE);
    const ttx = Math.floor(bx / TILE), ttz = Math.floor(bz / TILE);
    const dx = bx - ax, dz = bz - az;
    const stepX = dx > 0 ? 1 : -1, stepZ = dz > 0 ? 1 : -1;
    const tDeltaX = Math.abs(dx) > 1e-9 ? TILE / Math.abs(dx) : Infinity;
    const tDeltaZ = Math.abs(dz) > 1e-9 ? TILE / Math.abs(dz) : Infinity;
    let tMaxX = Math.abs(dx) > 1e-9 ? ((dx > 0 ? (tx + 1) * TILE - ax : ax - tx * TILE) / Math.abs(dx)) : Infinity;
    let tMaxZ = Math.abs(dz) > 1e-9 ? ((dz > 0 ? (tz + 1) * TILE - az : az - tz * TILE) / Math.abs(dz)) : Infinity;
    for (let g = 0; g < 64; g++) {
      if (tx === ttx && tz === ttz) return true;
      if (tMaxX < tMaxZ) { tMaxX += tDeltaX; tx += stepX; } else { tMaxZ += tDeltaZ; tz += stepZ; }
      if (tMaxX > 1 + tDeltaX && tMaxZ > 1 + tDeltaZ && (tx !== ttx || tz !== ttz)) { /* past end */ }
      if (this.typeAt(tx, tz) === T_SOLID) return tx === ttx && tz === ttz ? true : false;
    }
    return true;
  }

  // ------------------------------------------------------------------ navigation
  walkable(tx, tz) {
    const [c, i] = this.tile(tx, tz);
    return c.type[i] === T_FLOOR && !(c.flags[i] & F_NAVBLOCK);
  }

  _tileFloor(tx, tz) {
    const [c, i] = this.tile(tx, tz);
    return [c.ramp[i] >= 0 ? c.floor[i] + c.rampH[i] * 0.5 : c.floor[i], c.water[i]];
  }

  canStep(ax, az, bx, bz) {
    if (!this.walkable(bx, bz)) return false;
    const [fa, wa] = this._tileFloor(ax, az), [fb, wb] = this._tileFloor(bx, bz);
    // ramps: allow larger difference between ramp tile and its ends
    const [ca, ia] = this.tile(ax, az), [cb, ib] = this.tile(bx, bz);
    if (ca.ramp[ia] >= 0 || cb.ramp[ib] >= 0) return Math.abs(fa - fb) <= 1.6;
    return passable(fa, wa, fb, wb);
  }

  // A* over tiles. Returns array of {x,z} waypoints (world) or null.
  findPath(sx, sz, gx, gz, opts = {}) {
    const maxNodes = opts.maxNodes || 1600;
    const avoidWater = opts.avoidWater ?? false;
    const waterOnly = opts.waterOnly ?? false;
    const s = [Math.floor(sx / TILE), Math.floor(sz / TILE)];
    let g = [Math.floor(gx / TILE), Math.floor(gz / TILE)];
    if (s[0] === g[0] && s[1] === g[1]) return [{ x: gx, z: gz }];
    if (!this.walkable(g[0], g[1])) {
      // find nearest walkable goal
      let found = null;
      for (let r = 1; r <= 2 && !found; r++) for (let dz = -r; dz <= r && !found; dz++) for (let dx = -r; dx <= r; dx++) {
        if (this.walkable(g[0] + dx, g[1] + dz)) { found = [g[0] + dx, g[1] + dz]; break; }
      }
      if (!found) return null;
      g = found;
    }
    const key = (x, z) => ((x + 32768) << 16) | ((z + 32768) & 0xffff);
    const open = new Heap();
    const gScore = new Map(), came = new Map(), closed = new Set();
    const h = (x, z) => Math.hypot(x - g[0], z - g[1]);
    const sk = key(s[0], s[1]);
    gScore.set(sk, 0);
    open.push(sk, h(s[0], s[1]), s[0], s[1]);
    let expanded = 0, bestK = sk, bestH = h(s[0], s[1]);
    const dirs = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.414], [1, -1, 1.414], [-1, 1, 1.414], [-1, -1, 1.414]];
    while (open.size) {
      const cur = open.pop();
      const ck = cur.k;
      if (closed.has(ck)) continue;
      closed.add(ck);
      if (cur.x === g[0] && cur.z === g[1]) { bestK = ck; bestH = 0; break; }
      if (++expanded > maxNodes) break;
      const hc = h(cur.x, cur.z);
      if (hc < bestH) { bestH = hc; bestK = ck; }
      const gc = gScore.get(ck);
      for (const [dx, dz, cost] of dirs) {
        const nx = cur.x + dx, nz = cur.z + dz;
        const nk = key(nx, nz);
        if (closed.has(nk)) continue;
        if (!this.canStep(cur.x, cur.z, nx, nz)) continue;
        if (dx && dz && (!this.walkable(cur.x + dx, cur.z) || !this.walkable(cur.x, cur.z + dz))) continue;
        let extra = 0;
        const [, wn] = this._tileFloor(nx, nz);
        const [fn] = this._tileFloor(nx, nz);
        const wet = wn > fn + 0.5;
        if (avoidWater && wet) extra += 6;
        if (waterOnly && !wet) continue;
        const ng = gc + cost + extra;
        if (ng < (gScore.get(nk) ?? Infinity)) {
          gScore.set(nk, ng);
          came.set(nk, ck);
          open.push(nk, ng + h(nx, nz), nx, nz);
        }
      }
    }
    if (bestK === sk) return null;
    const out = [];
    let k = bestK;
    while (k !== undefined && k !== sk) {
      const x = (k >> 16) - 32768, z = (k & 0xffff) - 32768;
      out.push({ x: (x + 0.5) * TILE, z: (z + 0.5) * TILE });
      k = came.get(k);
    }
    out.reverse();
    if (bestH === 0 && out.length) out[out.length - 1] = { x: gx, z: gz };
    return out;
  }

  // Utility: random walkable point near (x,z) within radius (metres).
  randomWalkableNear(x, z, radius, rng = Math.random, tries = 30) {
    for (let k = 0; k < tries; k++) {
      const a = rng() * Math.PI * 2, d = rng() * radius;
      const px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d;
      const tx = Math.floor(px / TILE), tz = Math.floor(pz / TILE);
      if (this.walkable(tx, tz)) return { x: (tx + 0.5) * TILE, z: (tz + 0.5) * TILE };
    }
    return null;
  }

  spawnPoint() {
    const s = this.byType.spawn;
    if (s) return { x: (s.tx + 0.5) * TILE, z: (s.tz + 0.5) * TILE, y: this.floorAt((s.tx + 0.5) * TILE, (s.tz + 0.5) * TILE) };
    return { x: TILE * 8.5, z: TILE * 8.5, y: 0 };
  }
}

// Minimal binary heap keyed by priority.
class Heap {
  constructor() { this.a = []; }
  get size() { return this.a.length; }
  push(k, p, x, z) {
    const a = this.a;
    a.push({ k, p, x, z });
    let i = a.length - 1;
    while (i > 0) {
      const j = (i - 1) >> 1;
      if (a[j].p <= a[i].p) break;
      [a[i], a[j]] = [a[j], a[i]];
      i = j;
    }
  }
  pop() {
    const a = this.a;
    const top = a[0];
    const last = a.pop();
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1, r = l + 1;
        let m = i;
        if (l < a.length && a[l].p < a[m].p) m = l;
        if (r < a.length && a[r].p < a[m].p) m = r;
        if (m === i) break;
        [a[i], a[m]] = [a[m], a[i]];
        i = m;
      }
    }
    return top;
  }
}

// Place landmarks at a seeded angle/distance from the origin.
export function placeLandmark(level, salt, minTiles, maxTiles, angleRange = [0, Math.PI * 2]) {
  const rng = new RNG(hash4(level.levelSeed, hashString(salt)));
  const a = angleRange[0] + rng.next() * (angleRange[1] - angleRange[0]);
  const d = minTiles + rng.next() * (maxTiles - minTiles);
  return { tx: Math.round(8 + Math.cos(a) * d), tz: Math.round(8 + Math.sin(a) * d) };
}
