// Bases: faction settlements built into levels — Ririqian outposts and
// strongholds (Level 2, Level Gug), abandoned Didystani bases (Level 3) and
// tiny Did'h Wanderer camps (Level 4).
//
// Placement is deterministic: the level is divided into cells of a few
// chunks and each cell may hold one base covering 1–3 chunks. A base's layout
// is computed once from its seed *and the level's own geometry* (the raw
// chunks it sits on): rooms prefer to be carved into wall mass, the core
// prefers open floor, and nothing is built over water, ramps, drops or exits.
// Each chunk then carves and furnishes only its own part, so the result is
// identical whichever chunk is generated first. Walls, floors and ceilings use
// the level's own materials, so a base reads as part of the place.
import { ChunkData, TILE, CS, CHUNK, T_SOLID, T_FLOOR, F_ROOM, F_RESERVED, F_LANDMARK, F_DARK, F_BASE, NO_WATER } from '../chunk.js';
import { chunkPorts, chunkRng, ensureConnected } from '../gen.js';
import { hash01, hash4, RNG } from '../../core/rng.js';
import { addProp } from '../props.js';
import { addLight, addDecal, addObject, addPickup, addContainer, addNote, addLocker, sideExitAt } from '../levels/common.js';
import { arabicGibberish, didystaniName, traderOffers } from './objects.js';
import './props.js';

const K_NONE = 0, K_ROOM = 1, K_YARD = 2, K_CORR = 3, K_DOOR = 4, K_ENTR = 5, K_WALL = 6;
const NC = { tiny: 1, outpost: 1, small: 1, medium: 2, large: 2, city: 3 };
const interior = k => k === K_ROOM || k === K_YARD || k === K_CORR || k === K_DOOR;

// room size ranges [wMin, wMax, hMin, hMax] in tiles
const ROLE_SIZE = {
  quarters: [3, 5, 3, 5], housing: [4, 6, 4, 6], meeting: [3, 5, 3, 4], vault: [2, 3, 2, 3], watch: [3, 3, 3, 4], armory: [3, 4, 3, 4],
  medbay: [3, 5, 3, 4], rec: [3, 5, 3, 5], storage: [3, 4, 2, 4], power: [3, 5, 3, 4], comms: [3, 4, 3, 3], industrial: [4, 6, 3, 5],
  computers: [3, 5, 3, 4], research: [3, 5, 3, 4], mess: [4, 5, 3, 4], command: [3, 4, 3, 3], cells: [3, 4, 3, 3], water: [3, 4, 2, 3],
  shrine: [2, 3, 2, 3], camp: [3, 4, 3, 3], stall: [2, 3, 2, 3],
};
const ROLE_NAME = {
  quarters: 'BARRACKS', housing: 'HOUSING', meeting: 'BRIEFING', vault: 'VAULT', watch: 'WATCH', armory: 'ARMORY', medbay: 'INFIRMARY', rec: 'RECREATION',
  storage: 'STORES', power: 'POWER', comms: 'RADIO', industrial: 'WORKSHOP', computers: 'COMPUTERS', research: 'RESEARCH', mess: 'MESS', command: 'COMMAND',
  cells: 'CELLS', water: 'WATER', shrine: 'DID\'H', camp: 'CAMP', stall: 'TRADE',
};

// which rooms a base has, by faction and size; [role, chance] (chance 1 if omitted)
const PLANS = {
  rq: {
    outpost: [['quarters'], ['meeting'], ['storage'], ['watch'], ['comms', 0.45]],
    small: [['quarters'], ['meeting'], ['storage'], ['watch'], ['armory', 0.6], ['medbay', 0.5], ['comms', 0.65], ['power', 0.5], ['mess', 0.4]],
    medium: [['quarters'], ['quarters'], ['meeting'], ['storage'], ['watch'], ['armory'], ['medbay'], ['comms'], ['power'], ['mess'], ['command'], ['computers', 0.6], ['research', 0.3], ['rec', 0.4], ['water', 0.4]],
    large: [['quarters'], ['quarters'], ['quarters'], ['meeting'], ['storage'], ['storage'], ['watch'], ['armory'], ['medbay'], ['comms'], ['power'], ['power'], ['mess'], ['command'], ['computers'], ['research'], ['industrial'], ['rec'], ['vault'], ['cells', 0.4], ['water']],
    city: [['housing'], ['housing'], ['housing'], ['housing'], ['quarters'], ['quarters'], ['meeting'], ['meeting'], ['storage'], ['storage'], ['storage'], ['watch'], ['armory'], ['armory'], ['medbay'], ['comms'], ['power'], ['power'], ['mess'], ['mess'], ['command'], ['computers'], ['computers'], ['research'], ['industrial'], ['industrial'], ['rec'], ['rec'], ['vault'], ['cells'], ['water'], ['water']],
  },
  dd: {
    outpost: [['quarters'], ['storage'], ['watch', 0.6], ['meeting', 0.5]],
    small: [['quarters'], ['meeting'], ['storage'], ['medbay', 0.6], ['armory', 0.5], ['comms', 0.5], ['power', 0.4]],
    medium: [['quarters'], ['quarters'], ['meeting'], ['storage'], ['armory'], ['medbay'], ['comms'], ['power'], ['mess'], ['command'], ['research', 0.5]],
    large: [['quarters'], ['quarters'], ['meeting'], ['storage'], ['storage'], ['armory'], ['medbay'], ['comms'], ['power'], ['mess'], ['command'], ['research'], ['vault'], ['industrial'], ['rec'], ['computers'], ['water']],
  },
  didh: { tiny: [['shrine'], ['camp'], ['stall', 0.85], ['storage', 0.45]] },
};

// ------------------------------------------------------------------ placement
function cfgOf(level) { return level.def.bases; }

function baseInCell(level, gx, gz) {
  const cfg = cfgOf(level);
  if (!cfg) return null;
  level._bases ??= new Map();
  const key = gx + ',' + gz;
  if (level._bases.has(key)) return level._bases.get(key);
  let b = null;
  const s = level.levelSeed, cell = cfg.cell;
  const boost = cfg.boost ? cfg.boost(level, gx * cell + (cell >> 1), gz * cell + (cell >> 1)) : 1;
  if (hash01(gx, gz, s, 9001) < cfg.chance * boost) {
    const tot = cfg.sizes.reduce((n, [, w]) => n + w, 0);
    let r = hash01(gx, gz, s, 9004) * tot, size = cfg.sizes[0][0];
    for (const [k, w] of cfg.sizes) { if (r < w) { size = k; break; } r -= w; }
    const nc = NC[size];
    const cx0 = gx * cell + Math.floor(hash01(gx, gz, s, 9002) * (cell - nc + 1));
    const cz0 = gz * cell + Math.floor(hash01(gx, gz, s, 9003) * (cell - nc + 1));
    let ok = true;
    for (let cz = cz0; cz < cz0 + nc && ok; cz++) for (let cx = cx0; cx < cx0 + nc && ok; cx++) {
      if (Math.max(Math.abs(cx), Math.abs(cz)) < (cfg.minR ?? 3)) ok = false;
      else if (level.landmarks.some(l => Math.floor(l.tx / CS) === cx && Math.floor(l.tz / CS) === cz)) ok = false;
      else if (sideExitAt(level, cx, cz)) ok = false;
      else if (cfg.avoid?.(level, cx, cz)) ok = false;
    }
    if (ok) b = { id: `${level.id}:${gx}:${gz}`, gx, gz, cx0, cz0, nc, size, faction: cfg.faction, seed: hash4(gx, gz, s, 9005) };
  }
  level._bases.set(key, b);
  return b;
}

// The base (if any) whose region covers chunk (cx, cz), with its layout.
export function baseAtChunk(level, cx, cz) {
  const cfg = cfgOf(level);
  if (!cfg) return null;
  const b = baseInCell(level, Math.floor(cx / cfg.cell), Math.floor(cz / cfg.cell));
  if (!b || cx < b.cx0 || cz < b.cz0 || cx >= b.cx0 + b.nc || cz >= b.cz0 + b.nc) return null;
  const L = layoutOf(level, b);
  return L ? b : null;
}

// Every base near a point (for the host's NPC spawner and the radio scanner).
export function basesNear(level, x, z, R) {
  const cfg = cfgOf(level);
  if (!cfg) return [];
  const out = [];
  const cell = cfg.cell * CHUNK;
  for (let gz = Math.floor((z - R) / cell); gz <= Math.floor((z + R) / cell); gz++) for (let gx = Math.floor((x - R) / cell); gx <= Math.floor((x + R) / cell); gx++) {
    const b = baseInCell(level, gx, gz);
    if (!b) continue;
    const L = layoutOf(level, b);
    if (!L) continue;
    if (Math.hypot(L.cx - x, L.cz - z) <= R + b.nc * CHUNK * 0.7) out.push(b);
  }
  return out;
}
export function baseLayout(level, b) { return layoutOf(level, b); }

// Transmitters: Ririqian bases with a radio room. Coordinates are only
// approximate (a fixed per-base error of up to ~25 m).
export function radioSources(level, x, z, R) {
  const out = [];
  for (const b of basesNear(level, x, z, R)) {
    if (b.faction !== 'rq') continue;
    const L = layoutOf(level, b);
    const comms = L.rooms.find(r => r.role === 'comms');
    if (!comms) continue;
    const ex = (hash01(b.seed, 1) - 0.5) * 50, ez = (hash01(b.seed, 2) - 0.5) * 50;
    const sx = Math.round((comms.wx + ex) / 5) * 5, sz = Math.round((comms.wz + ez) / 5) * 5;
    const d = Math.hypot(comms.wx - x, comms.wz - z);
    if (d > R) continue;
    out.push({ x: sx, z: sz, faction: b.faction, strength: 1 - d / R, base: b.id });
  }
  return out;
}

// ------------------------------------------------------------------ raw level
// The level as it would be without any base (generated on the side, cached).
function rawChunk(level, cx, cz) {
  level._raw ??= new Map();
  const key = cx + ',' + cz;
  let c = level._raw.get(key);
  if (c) return c;
  c = new ChunkData(cx, cz);
  const ports = chunkPorts(level.levelSeed, cx, cz, level.def.portConfig);
  const rng = chunkRng(level.levelSeed, level.id, cx, cz);
  const lms = level.landmarks.filter(l => Math.floor(l.tx / CS) === cx && Math.floor(l.tz / CS) === cz).map(l => ({ ...l, lx: l.tx - cx * CS, lz: l.tz - cz * CS }));
  level.def.generate(c, { level, rng, ports, landmarks: lms, seed: level.levelSeed, raw: true });
  if (level._raw.size > 48) level._raw.clear();
  level._raw.set(key, c);
  return c;
}

// ------------------------------------------------------------------ layout
function layoutOf(level, b) {
  level._layouts ??= new Map();
  if (level._layouts.has(b.id)) return level._layouts.get(b.id);
  let L = null;
  try { L = buildLayout(level, b); } catch (e) { console.warn('base layout failed', b.id, e); }
  level._layouts.set(b.id, L);
  return L;
}

function buildLayout(level, b) {
  const cfg = cfgOf(level);
  const rng = new RNG(b.seed);
  const W = b.nc * CS, TX0 = b.cx0 * CS, TZ0 = b.cz0 * CS;
  const M = 1;
  const Y = cfg.floorY ?? 0;
  const kind = new Uint8Array(W * W), rid = new Int16Array(W * W).fill(-1);
  const raw = (lx, lz) => {
    const tx = TX0 + lx, tz = TZ0 + lz, cx = Math.floor(tx / CS), cz = Math.floor(tz / CS);
    const c = rawChunk(level, cx, cz), i = (tz - cz * CS) * CS + (tx - cx * CS);
    return { c, i };
  };
  const okCache = new Int8Array(W * W).fill(-1);
  // a tile a base may occupy (as floor or wall)
  const ok = (lx, lz) => {
    if (lx < M || lz < M || lx >= W - M || lz >= W - M) return false;
    const k = lz * W + lx;
    if (okCache[k] >= 0) return okCache[k] === 1;
    const { c, i } = raw(lx, lz);
    let v = true;
    if (c.type[i] === T_FLOOR) {
      if (Math.abs(c.floor[i] - Y) > 0.05 || c.ramp[i] >= 0) v = false;
      if (c.water[i] > NO_WATER + 1 && c.water[i] > c.floor[i] - 0.01) v = false;
    } else if (c.type[i] !== T_SOLID) v = false;
    if (c.flags[i] & F_LANDMARK) v = false;
    okCache[k] = v ? 1 : 0;
    return v;
  };
  const solid = (lx, lz) => { const { c, i } = raw(lx, lz); return c.type[i] === T_SOLID; };
  const openRaw = (lx, lz) => { const { c, i } = raw(lx, lz); return c.type[i] === T_FLOOR && Math.abs(c.floor[i] - Y) < 0.05 && c.ramp[i] < 0 && !(c.water[i] > NO_WATER + 1 && c.water[i] > c.floor[i] - 0.01); };
  const at = (lx, lz) => (lx < 0 || lz < 0 || lx >= W || lz >= W ? K_NONE : kind[lz * W + lx]);
  // a rect (plus its 1-tile wall ring) fits if every tile is buildable and
  // nothing else is inside it (walls may be shared)
  const fits = (x0, z0, w, h) => {
    for (let z = z0 - 1; z <= z0 + h; z++) for (let x = x0 - 1; x <= x0 + w; x++) {
      if (!ok(x, z)) return false;
      const inside = x >= x0 && x < x0 + w && z >= z0 && z < z0 + h;
      if (inside ? at(x, z) !== K_NONE : interior(at(x, z)) && at(x, z) !== K_DOOR) return false;
    }
    return true;
  };
  const mark = (x0, z0, w, h, k, r) => { for (let z = z0; z < z0 + h; z++) for (let x = x0; x < x0 + w; x++) { kind[z * W + x] = k; rid[z * W + x] = r; } };
  const solidFrac = (x0, z0, w, h) => { let n = 0; for (let z = z0; z < z0 + h; z++) for (let x = x0; x < x0 + w; x++) n += solid(x, z) ? 1 : 0; return n / (w * h); };

  const rooms = [];
  const big = b.size === 'medium' || b.size === 'large' || b.size === 'city';
  const ceil = cfg.ceil ?? 3.0;
  // ---- core: an open yard (bigger bases) or a corridor hub
  let core = null;
  if (big && (b.size !== 'medium' || rng.chance(0.6))) {
    let best = null;
    for (let t = 0; t < 60; t++) {
      const w = Math.round(W * rng.float(0.3, b.size === 'city' ? 0.55 : 0.45)), h = Math.round(W * rng.float(0.28, 0.45));
      const x0 = rng.int(M + 2, W - M - 2 - w), z0 = rng.int(M + 2, W - M - 2 - h);
      if (x0 < 2 || z0 < 2 || !fits(x0, z0, w, h)) continue;
      const centre = 1 - Math.hypot(x0 + w / 2 - W / 2, z0 + h / 2 - W / 2) / W;
      const score = (1 - solidFrac(x0, z0, w, h)) * 0.6 + centre * 0.6 + rng.next() * 0.2;
      if (!best || score > best.score) best = { x0, z0, w, h, score };
    }
    if (best) {
      core = { role: 'yard', x: best.x0, z: best.z0, w: best.w, h: best.h, ceil: cfg.yardCeil ?? Math.max(ceil + 1.5, 4.5) };
      rooms.push(core); mark(core.x, core.z, core.w, core.h, K_YARD, 0);
      // an annex bulging off one side makes the yard less of a rectangle
      for (let t = 0; t < 10; t++) {
        const w = rng.int(3, Math.max(3, core.w >> 1)), h = rng.int(2, 4);
        const side = rng.int(0, 3);
        const x0 = side < 2 ? core.x + rng.int(0, core.w - w) : side === 2 ? core.x - w : core.x + core.w;
        const z0 = side === 0 ? core.z - h : side === 1 ? core.z + core.h : core.z + rng.int(0, Math.max(0, core.h - h));
        let fine = true;
        for (let z = z0 - 1; z <= z0 + h && fine; z++) for (let x = x0 - 1; x <= x0 + w && fine; x++) if (!ok(x, z) || (at(x, z) !== K_NONE && at(x, z) !== K_YARD)) fine = false;
        if (fine) { mark(x0, z0, w, h, K_YARD, 0); break; }
      }
    }
  }
  if (!core) {
    // corridor hub: 2 wide, 2-4 arms from a centre that's buildable
    let cx = -1, cz = -1;
    for (let t = 0; t < 80 && cx < 0; t++) { const x = rng.int(W * 0.3, W * 0.7) | 0, z = rng.int(W * 0.3, W * 0.7) | 0; if (fits(x, z, 2, 2)) { cx = x; cz = z; } }
    if (cx < 0) return null;
    core = { role: 'hall', x: cx, z: cz, w: 2, h: 2, ceil };
    rooms.push(core);
    mark(cx, cz, 2, 2, K_CORR, 0);
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]].sort(() => rng.next() - 0.5).slice(0, b.size === 'tiny' ? 2 : rng.int(2, 4));
    for (const [dx, dz] of dirs) {
      const len = rng.int(3, Math.max(4, Math.floor(W / 2) - 3));
      for (let s = 1; s <= len; s++) {
        const x0 = dx > 0 ? cx + 1 + s : dx < 0 ? cx - s : cx, z0 = dz > 0 ? cz + 1 + s : dz < 0 ? cz - s : cz;
        const w = dx ? 1 : 2, h = dz ? 1 : 2;
        let fine = true;
        for (let z = z0 - 1; z <= z0 + h && fine; z++) for (let x = x0 - 1; x <= x0 + w && fine; x++) if (!ok(x, z) || at(x, z) === K_ROOM) fine = false;
        if (!fine) break;
        mark(x0, z0, w, h, K_CORR, 0);
      }
    }
  }

  // ---- rooms, grown off the core and off each other
  const plan = (PLANS[b.faction][b.size] || PLANS[b.faction].small).filter(([, p]) => p === undefined || rng.chance(p)).map(([r]) => r);
  for (const role of plan) {
    const [w0, w1, h0, h1] = ROLE_SIZE[role] || [3, 4, 3, 4];
    let best = null;
    // anchor tiles on the footprint's edge (the core preferred over rooms)
    const edge = [];
    for (let lz = M; lz < W - M; lz++) for (let lx = M; lx < W - M; lx++) {
      const ak = at(lx, lz);
      if (!interior(ak) || ak === K_DOOR) continue;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (at(lx + dx, lz + dz) === K_NONE && at(lx + 2 * dx, lz + 2 * dz) === K_NONE) edge.push([lx, lz, dx, dz, ak]);
    }
    if (!edge.length) break;
    for (let t = 0; t < 160; t++) {
      const [ax, az, dx, dz, ak] = edge[rng.int(0, edge.length - 1)];
      if (ak === K_ROOM && rng.chance(0.55)) continue;
      const w = rng.int(w0, w1), h = rng.int(h0, h1);
      const rw = dx ? w : w, rh = dz ? h : h;
      let x0, z0;
      if (dx) { x0 = dx > 0 ? ax + 2 : ax - 1 - rw; z0 = az - rng.int(0, rh - 1); }
      else { z0 = dz > 0 ? az + 2 : az - 1 - rh; x0 = ax - rng.int(0, rw - 1); }
      if (!fits(x0, z0, rw, rh)) continue;
      const score = solidFrac(x0, z0, rw, rh) * 0.8 + rng.next() * 0.4 + (ak === K_YARD ? 0.2 : 0);
      if (!best || score > best.score) best = { x0, z0, w: rw, h: rh, door: [ax + dx, az + dz], from: ak, score };
      if (t > 60 && best) break;
    }
    if (!best) continue;
    const r = { role, x: best.x0, z: best.z0, w: best.w, h: best.h, ceil: role === 'watch' ? Math.max(ceil, 3.6) : role === 'industrial' || role === 'power' ? Math.max(ceil, 3.4) : ceil, door: { x: best.door[0], z: best.door[1] } };
    rooms.push(r);
    mark(r.x, r.z, r.w, r.h, K_ROOM, rooms.length - 1);
    kind[best.door[1] * W + best.door[0]] = K_DOOR; rid[best.door[1] * W + best.door[0]] = rooms.length - 1;
  }
  if (rooms.length < (b.size === 'tiny' ? 2 : 3)) return null;

  // ---- entrances: from the footprint straight out to the level's own floor
  const cand = [];
  for (let lz = M; lz < W - M; lz++) for (let lx = M; lx < W - M; lx++) {
    const k = at(lx, lz);
    if (k !== K_YARD && k !== K_CORR) continue;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      if (at(lx + dx, lz + dz) !== K_NONE) continue;
      const path = [];
      let x = lx + dx, z = lz + dz, reached = false;
      for (let s = 0; s < 14; s++) {
        if (x < 0 || z < 0 || x >= W || z >= W) break;
        // the far side of the wall ring, on the level's own open floor: done
        if (s >= 1 && openRaw(x, z) && at(x, z) === K_NONE && ![[1, 0], [-1, 0], [0, 1], [0, -1]].some(([ex, ez]) => interior(at(x + ex, z + ez)))) { reached = true; break; }
        if (!ok(x, z) && !(x === 0 || z === 0 || x === W - 1 || z === W - 1) || interior(at(x, z))) break;
        path.push([x, z]);
        x += dx; z += dz;
      }
      if (reached && path.length) cand.push({ path, dx, dz, from: k, score: -path.length + rng.next() * 3 + (k === K_YARD ? 2 : 0) });
    }
  }
  cand.sort((a, c) => c.score - a.score);
  const gated = b.faction === 'rq' ? (b.size === 'medium' || b.size === 'large' || b.size === 'city' || (b.size === 'small' && rng.chance(0.4))) : b.faction === 'dd' && big && rng.chance(0.5);
  const nEnt = gated ? 1 : b.size === 'tiny' || b.size === 'outpost' ? rng.int(1, 2) : rng.int(1, 3);
  const entrances = [];
  for (const e of cand) {
    if (entrances.length >= nEnt) break;
    if (entrances.some(o => Math.hypot(o.path[0][0] - e.path[0][0], o.path[0][1] - e.path[0][1]) < 6)) continue;
    entrances.push(e);
    for (const [x, z] of e.path) kind[z * W + x] = K_ENTR;
  }
  if (!entrances.length) return null;
  if (gated) entrances[0].gate = true;

  // ---- wall ring around every interior tile
  for (let lz = 0; lz < W; lz++) for (let lx = 0; lx < W; lx++) {
    if (kind[lz * W + lx] !== K_NONE) continue;
    let near = false;
    for (let dz = -1; dz <= 1 && !near; dz++) for (let dx = -1; dx <= 1 && !near; dx++) if (interior(at(lx + dx, lz + dz))) near = true;
    if (near) kind[lz * W + lx] = K_WALL;
  }
  // entrance corridors get walls along their sides
  for (const e of entrances) for (const [x, z] of e.path) for (const [sx, sz] of [[e.dz, e.dx], [-e.dz, -e.dx]]) {
    const wx = x + sx, wz = z + sz;
    if (wx >= 0 && wz >= 0 && wx < W && wz < W && kind[wz * W + wx] === K_NONE && ok(wx, wz)) kind[wz * W + wx] = K_WALL;
  }

  // world-space info
  for (const r of rooms) { r.wx = (TX0 + r.x + r.w / 2) * TILE; r.wz = (TZ0 + r.z + r.h / 2) * TILE; }
  const L = { b, W, TX0, TZ0, kind, rid, rooms, entrances, Y, cx: (TX0 + W / 2) * TILE, cz: (TZ0 + W / 2) * TILE };
  L.posts = makePosts(L, rng);
  L.alarmed = b.faction === 'rq' && (b.size === 'large' || b.size === 'city' || (b.size === 'medium' && rng.chance(0.5)));
  return L;
}

// Where NPCs stand (host spawner). [x, y, z, yaw, role, roomIndex]
function makePosts(L, rng) {
  const { b, TX0, TZ0, rooms, Y } = L;
  if (b.faction === 'dd') return [];
  const out = [];
  const at = (r, fx, fz) => [(TX0 + r.x + r.w * fx) * TILE, Y, (TZ0 + r.z + r.h * fz) * TILE];
  const budget = { tiny: rng.int(2, 4), outpost: rng.int(3, 4), small: rng.int(4, 6), medium: rng.int(7, 10), large: rng.int(11, 15), city: rng.int(18, 26) }[b.size];
  const add = (r, fx, fz, role, ri) => { if (out.length < budget) { const p = at(r, fx, fz); out.push([p[0], p[1], p[2], rng.float(0, 6.28), role, ri]); } };
  rooms.forEach((r, ri) => {
    switch (r.role) {
      case 'watch': add(r, 0.45, 0.5, 'sniper', ri); break;
      case 'command': add(r, 0.5, 0.45, 'officer', ri); break;
      case 'armory': add(r, 0.5, 0.6, 'guard', ri); break;
      case 'comms': add(r, 0.4, 0.55, 'radio', ri); break;
      case 'stall': add(r, 0.5, 0.55, 'trader', ri); break;
      case 'shrine': add(r, 0.5, 0.6, 'prayer', ri); break;
    }
  });
  for (const e of L.entrances) { const [x, z] = e.path[0]; out.push([(TX0 + x + 0.5 - e.dx * 1.2) * TILE, Y, (TZ0 + z + 0.5 - e.dz * 1.2) * TILE, Math.atan2(e.dx, e.dz), b.faction === 'didh' ? 'idle' : 'guard', -1]); }
  for (let k = 0; out.length < budget && k < 60; k++) {
    const ri = rng.int(0, rooms.length - 1), r = rooms[ri];
    if (r.role === 'vault' || r.role === 'cells') continue;
    add(r, rng.float(0.25, 0.75), rng.float(0.25, 0.75), r.role === 'yard' || r.role === 'hall' ? 'patrol' : r.role === 'stall' ? 'idle' : 'idle', ri);
  }
  return out;
}

// ------------------------------------------------------------------ carving
// Called for every generated chunk of a level that has bases.
export function applyBases(level, c, ctx) {
  const b = baseAtChunk(level, c.cx, c.cz);
  if (!b) return;
  const cfg = cfgOf(level);
  const L = layoutOf(level, b);
  const { W, TX0, TZ0, kind, rid, rooms } = L;
  const ox = c.cx * CS - TX0, oz = c.cz * CS - TZ0;
  const inMask = (x, z) => { const lx = Math.floor((x - c.x0) / TILE), lz = Math.floor((z - c.z0) / TILE); if (lx < 0 || lz < 0 || lx >= CS || lz >= CS) return false; const k = kind[(lz + oz) * W + lx + ox]; return k !== K_NONE; };
  // clear whatever the level put where the base goes
  c.props = c.props.filter(p => !inMask(p.x, p.z));
  c.colliders = c.colliders.filter(q => !inMask((q.x0 + q.x1) / 2, (q.z0 + q.z1) / 2));
  c.lights = c.lights.filter(l => !inMask(l.x, l.z));
  c.objects = c.objects.filter(o => !inMask(o.x, o.z));
  c.decals = c.decals.filter(d => !inMask(d.x, d.z));
  for (let lz = 0; lz < CS; lz++) for (let lx = 0; lx < CS; lx++) {
    const k = kind[(lz + oz) * W + lx + ox];
    if (k === K_NONE) continue;
    const i = lz * CS + lx;
    if (k === K_WALL) {
      c.type[i] = T_SOLID; c.wmat[i] = cfg.wmat ?? 0; c.water[i] = NO_WATER; c.ramp[i] = -1; c.flags[i] = F_BASE | F_LANDMARK;
      continue;
    }
    const r = rooms[rid[(lz + oz) * W + lx + ox]] || rooms[0];
    c.type[i] = T_FLOOR; c.floor[i] = L.Y; c.ramp[i] = -1; c.water[i] = NO_WATER;
    c.ceil[i] = k === K_ENTR ? (cfg.ceil ?? 3) : k === K_DOOR ? Math.min(r.ceil, cfg.ceil ?? 3) : (r.ceil ?? cfg.ceil ?? 3);
    c.fmat[i] = cfg.fmat ?? 0; c.cmat[i] = cfg.cmat ?? 0;
    c.flags[i] = F_BASE | F_RESERVED | (k === K_ENTR ? 0 : F_ROOM | F_LANDMARK) | (b.faction === 'dd' && (hash01(lx + c.cx * 31, lz + c.cz * 17, b.seed) < 0.5) ? F_DARK : 0);
  }
  ensureConnected(c, ctx.ports, () => ({ floor: L.Y, ceil: cfg.ceil ?? 3, fmat: 0, cmat: 0 }));
  c.meta.base = b.id;
  dressBase(level, c, b, L, ox, oz);
}

// ------------------------------------------------------------------ dressing
const LOOT = {
  rq: {
    armory: [['rqRifle', 10], ['rqPistol', 10], ['rqSmg', 7], ['rqShotgun', 6], ['rqSniper', 2], ['sniper', 1.5], ['rqGrenade', 9, [1, 2]], ['grenade', 4], ['rifleAmmo', 16, [15, 30]], ['ammo9', 14, [12, 24]], ['shells', 8, [4, 8]], ['sniperAmmo', 5, [4, 8]], ['ririqianHelmet', 5], ['ririqianVest', 4], ['ririqianGreaves', 3], ['ririqianBoots', 3], ['plateCarrier', 1], ['rqMachete', 4], ['rqBaton', 3]],
    medbay: [['medkit', 10], ['bandage', 14, [2, 4]], ['painkillers', 10, [1, 2]], ['adrenaline', 4], ['purifier', 6, [1, 3]], ['cleanWater', 8]],
    storage: [['cannedBeans', 10, [1, 2]], ['snackBar', 8, [1, 3]], ['fireSalts', 8, [1, 2]], ['cleanWater', 8], ['battery', 12, [1, 3]], ['wire', 7], ['scrap', 8, [1, 3]], ['cloth', 6, [1, 2]], ['ductTape', 6], ['flare', 6, [1, 2]], ['smallPack', 2], ['largePack', 0.8], ['rifleAmmo', 4, [10, 20]], [null, 8]],
    mess: [['cannedBeans', 12, [1, 3]], ['snackBar', 10, [1, 2]], ['cleanWater', 10, [1, 2]], ['fireSalts', 6], ['energyDrink', 5], [null, 10]],
    quarters: [['snackBar', 6], ['cleanWater', 5], ['bandage', 6], ['battery', 6], ['ammo9', 6, [6, 12]], ['rqPistol', 2], ['painkillers', 4], ['goldBar', 2], [null, 16]],
    comms: [['antenna', 10], ['gpsBoard', 7], ['battery', 10, [1, 2]], ['wire', 8, [1, 2]], ['radioScanner', 2], ['transmitter', 1], [null, 6]],
    power: [['battery', 14, [2, 4]], ['wire', 10, [1, 3]], ['ductTape', 6], ['scrap', 6], ['fuse', 1], [null, 6]],
    industrial: [['scrap', 14, [2, 4]], ['wire', 10, [1, 3]], ['ductTape', 8], ['crowbar', 3], ['knife', 4], ['hardHat', 3], ['combatBoots', 2], [null, 6]],
    research: [['purifier', 6], ['adrenaline', 4], ['paleDraught', 2], ['grayGoo', 3], ['painkillers', 5], ['battery', 5], [null, 8]],
    command: [['vaultKey', 6], ['goldBar', 5, [1, 2]], ['rqPistol', 4], ['ammo9', 5, [8, 16]], ['rqGrenade', 3], ['cleanWater', 4], [null, 3]],
    vault: [['goldBar', 14, [2, 5]], ['largePack', 4], ['plateCarrier', 4], ['sniper', 4], ['rqSniper', 3], ['grenade', 6, [2, 3]], ['medkit', 6, [1, 2]], ['adrenaline', 4], ['sniperAmmo', 5, [6, 10]], ['ririqianHelmet', 3], ['ririqianVest', 3]],
    rec: [['snackBar', 6], ['energyDrink', 6], ['cleanWater', 4], ['goldBar', 1], [null, 14]],
    water: [['cleanWater', 14, [1, 3]], ['dirtyWater', 8, [1, 2]], ['purifier', 6, [1, 2]], [null, 6]],
  },
};
// abandoned Didystani bases: thinner pickings, older gear
LOOT.dd = {
  armory: [['pistol', 6], ['shotgun', 4], ['smg', 3], ['sniper', 3], ['rifle', 2], ['ammo9', 10, [6, 14]], ['shells', 8, [3, 6]], ['sniperAmmo', 5, [3, 6]], ['rifleAmmo', 4, [8, 16]], ['helmet', 4], ['vest', 2], ['legGuards', 3], ['combatBoots', 3], ['grenade', 3], ['knife', 4], [null, 14]],
  medbay: [['bandage', 10, [1, 2]], ['painkillers', 8], ['medkit', 4], ['purifier', 6], ['blueberryFireSalts', 4], [null, 12]],
  storage: [['cannedBeans', 8], ['blueberryFireSalts', 8], ['dirtyWater', 8], ['battery', 8, [1, 2]], ['cloth', 6], ['scrap', 6], ['wire', 4], ['flare', 4], ['smallPack', 2], [null, 18]],
  mess: [['cannedBeans', 8], ['dirtyWater', 8], ['blueberryFireSalts', 6], [null, 16]],
  quarters: [['bandage', 4], ['battery', 5], ['ammo9', 4, [4, 8]], ['cloth', 4], ['knife', 2], [null, 22]],
  comms: [['antenna', 8], ['gpsBoard', 5], ['wire', 6], ['battery', 4], [null, 10]],
  power: [['battery', 8, [1, 2]], ['wire', 8], ['ductTape', 4], ['scrap', 5], [null, 10]],
  industrial: [['scrap', 10, [1, 3]], ['wire', 6], ['ductTape', 6], ['crowbar', 3], ['knife', 3], [null, 10]],
  research: [['purifier', 4], ['painkillers', 4], ['paleDraught', 1], [null, 12]],
  command: [['pistol', 4], ['ammo9', 5, [6, 10]], ['sniperAmmo', 3, [3, 6]], ['vaultKey', 4], [null, 8]],
  vault: [['sniper', 6], ['sniperAmmo', 8, [5, 10]], ['vest', 4], ['helmet', 4], ['medkit', 5], ['largePack', 3], ['grenade', 5, [1, 2]], ['shotgun', 3], ['shells', 4, [4, 8]]],
  rec: [['cleanWater', 3], ['blueberryFireSalts', 3], [null, 20]],
  water: [['dirtyWater', 10, [1, 2]], ['purifier', 4], [null, 10]],
};
LOOT.didh = {
  storage: [['goanJuice', 8], ['fireSalts', 8, [1, 2]], ['cleanWater', 6], ['battery', 6], ['cloth', 6], ['didhCharm', 3], ['bandage', 6], [null, 8]],
  camp: [['fireSalts', 6], ['goanJuice', 5], ['cloth', 4], ['didhCharm', 2], [null, 10]],
};

const NOTE_POOLS = {
  rq: ['rq_missing', 'rq_portal', 'rq_orders', 'rq_rations', 'rq_doubt', 'rq_radio', 'rq_propaganda', 'rq_prisoner'],
  dd: ['dd_last', 'dd_orders', 'dd_overrun', 'dd_diary', 'dd_pools'],
  didh: ['didh_scripture', 'didh_trade', 'didh_wander'],
};

function dressBase(level, c, b, L, ox, oz) {
  const cfg = cfgOf(level);
  const rng = new RNG(hash4(b.seed, c.cx, c.cz, 77));
  const { W, TX0, TZ0, kind, rooms, Y } = L;
  const F = b.faction;
  const mine = (wx, wz) => wx >= c.x0 && wx < c.x0 + CHUNK && wz >= c.z0 && wz < c.z0 + CHUNK;
  const roomRng = (ri, salt = 0) => new RNG(hash4(b.seed, ri, 131 + salt));
  const loot = (role) => (LOOT[F] && (LOOT[F][role] || LOOT[F].storage)) || LOOT.rq.storage;
  const k = (lx, lz) => (lx < 0 || lz < 0 || lx >= W || lz >= W ? K_NONE : kind[lz * W + lx]);
  const W2 = (lx, lz) => [(TX0 + lx + 0.5) * TILE, (TZ0 + lz + 0.5) * TILE];

  rooms.forEach((r, ri) => {
    if (!mine(r.wx, r.wz)) return;
    const R = roomRng(ri);
    const x0 = (TX0 + r.x) * TILE, z0 = (TZ0 + r.z) * TILE, w = r.w * TILE, h = r.h * TILE, cx = x0 + w / 2, cz = z0 + h / 2;
    // wall spots: tiles along the room's edge facing a wall (not a doorway)
    const spots = [];
    for (let lz = r.z; lz < r.z + r.h; lz++) for (let lx = r.x; lx < r.x + r.w; lx++) {
      if (r.role === 'yard' && k(lx, lz) !== K_YARD) continue;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nk = k(lx + dx, lz + dz);
        if (nk !== K_WALL && nk !== K_NONE) continue;
        if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([ex, ez]) => k(lx + ex, lz + ez) === K_DOOR || k(lx + ex, lz + ez) === K_ENTR)) continue;
        const [tx, tz] = W2(lx, lz);
        spots.push({ x: tx + dx * (TILE / 2), z: tz + dz * (TILE / 2), nx: -dx, nz: -dz, lx, lz });
      }
    }
    const take = () => (spots.length ? spots.splice(R.int(0, spots.length - 1), 1)[0] : null);
    const atWall = (s, inset) => ({ x: s.x + s.nx * inset, z: s.z + s.nz * inset, ry: Math.atan2(s.nx, s.nz) });
    const prop = (kind2, s, inset, extra) => { const p = atWall(s, inset); addProp(c, kind2, p.x, Y, p.z, p.ry, extra); return p; };
    const cont = (ctype, s, inset, tbl, rolls) => { if (!s) return; const p = atWall(s, inset); addContainer(c, R, ctype, tbl || loot(r.role), p.x, Y, p.z, p.ry, rolls || [1, 2]); };
    const pick = (s, inset = 0.5, tbl) => { if (!s) return; const p = atWall(s, inset); addPickup(c, R, tbl || loot(r.role), p.x, Y, p.z); };
    // lights
    const lightKind = cfg.light || 'panel';
    const broken = F === 'dd' ? R.chance(0.55) : false;
    const lc = F === 'rq' && (r.role === 'armory' || r.role === 'command' || r.role === 'cells') ? [1, 0.55, 0.45] : cfg.lightColor || [1, 0.92, 0.8];
    if (r.role === 'yard') {
      for (let n = 0; n < Math.max(2, Math.round(r.w * r.h / 18)); n++) addLight(c, { kind: 'cage', x: x0 + R.float(1, w - 1), y: r.ceil - 0.3, z: z0 + R.float(1, h - 1), nx: 0, nz: 0, color: lc, intensity: 7, range: 14, flicker: F === 'dd' ? 0.5 : 0, broken });
    } else addLight(c, { kind: lightKind, x: cx, y: r.ceil - 0.01, z: cz, w: 1.2, d: 0.6, color: lc, intensity: lightKind === 'panel' ? 4.6 : 4.4, range: 10, flicker: F === 'dd' ? R.float(0.3, 0.9) : R.chance(0.1) ? 0.4 : 0, broken });
    // a door on the doorway
    if (r.door && r.role !== 'yard' && r.role !== 'hall' && r.role !== 'vault' && R.chance(F === 'didh' ? 0.3 : 0.6)) {
      const [dxw, dzw] = W2(r.door.x, r.door.z);
      const along = k(r.door.x - 1, r.door.z) === K_WALL || k(r.door.x + 1, r.door.z) === K_WALL ? 'x' : 'z';
      if (mine(dxw, dzw)) {
        const o = addObject(c, { kind: 'door', x: dxw, y: Y, z: dzw, ry: along === 'z' ? Math.PI / 2 : 0, mat: F === 'rq' ? 'paintedMetal' : F === 'dd' ? 'rustMetal' : 'darkWood' });
        o.collider = c.addCollider(along === 'x' ? dxw - 1 : dxw - 0.05, Y, along === 'z' ? dzw - 1 : dzw - 0.05, along === 'x' ? dxw + 1 : dxw + 0.05, Y + 2.4, along === 'z' ? dzw + 1 : dzw + 0.05, false);
        o.collider.door = true;
      }
    }
    // a name plate by the door: nonsense script for the Brotherhood
    if (r.door && r.role !== 'yard' && r.role !== 'hall') {
      const [dxw, dzw] = W2(r.door.x, r.door.z);
      const into = [[1, 0], [-1, 0], [0, 1], [0, -1]].find(([ex, ez]) => k(r.door.x + ex, r.door.z + ez) !== K_ROOM && interior(k(r.door.x + ex, r.door.z + ez)));
      if (into && mine(dxw, dzw)) {
        const [ex, ez] = into, px = -ez, pz = ex;
        const text = F === 'rq' ? arabicGibberish(hash4(b.seed, ri), 1) : F === 'didh' ? ROLE_NAME[r.role] : ROLE_NAME[r.role];
        addObject(c, { kind: 'sign', text, x: dxw + ex * (TILE / 2 + 0.012) + px * 1.3, y: Y, z: dzw + ez * (TILE / 2 + 0.012) + pz * 1.3, ry: Math.atan2(ex, ez), size: F === 'rq' ? 44 : 30, h: 1.75, bg: F === 'rq' ? '#1d1d20' : F === 'dd' ? '#3a5a50' : '#c8b890', fg: F === 'rq' ? '#e8e0d0' : '#f0ead8', border: F === 'rq' ? '#a81e18' : '#2a2018', rtl: F === 'rq' });
      }
    }
    furnish(c, level, b, L, r, ri, R, { spots, take, prop, cont, pick, atWall, x0, z0, w, h, cx, cz, Y, F, loot });
    // abandoned bases: wreckage, bones, stains
    if (F === 'dd') {
      if (R.chance(0.5)) addProp(c, 'brokenFurniture', cx + R.float(-w / 4, w / 4), Y, cz + R.float(-h / 4, h / 4), R.float(0, 6));
      if (R.chance(r.role === 'yard' ? 0.9 : 0.35)) { addProp(c, 'remains', cx + R.float(-w / 3, w / 3), Y, cz + R.float(-h / 3, h / 3), R.float(0, 6)); addDecal(c, { name: 'blood2', x: cx, y: Y + 0.005, z: cz, nx: 0, ny: 1, nz: 0, size: R.float(1.2, 2), rot: R.float(0, 6) }); }
      if (R.chance(0.3)) addProp(c, 'rubble', x0 + R.float(0.6, w - 0.6), Y, z0 + R.float(0.6, h - 0.6), R.float(0, 6));
      for (let n = R.int(0, 2); n > 0; n--) { const s = take(); if (s) addDecal(c, { name: R.pick(['scratch', 'blood', 'hand', 'drip']), x: s.x + s.nx * 0.01, y: Y + R.float(0.5, 1.8), z: s.z + s.nz * 0.01, nx: s.nx, ny: 0, nz: s.nz, size: R.float(0.8, 1.3) }); }
    }
    // lore
    if (R.chance(r.role === 'command' || r.role === 'comms' || r.role === 'research' ? 0.7 : 0.18)) {
      const pool = NOTE_POOLS[F];
      addNote(c, pool[hash4(b.seed, ri, 5) % pool.length], cx + R.float(-0.6, 0.6), Y + 0.005, cz + R.float(-0.6, 0.6), R.float(0, 6));
    }
  });

  // gates on gated entrances, alarms in big Ririqian bases
  L.entrances.forEach((e, ei) => {
    const [x, z] = e.path[0];
    const [wx, wz] = W2(x, z);
    if (!mine(wx, wz)) return;
    if (e.gate) {
      const gx = wx - e.dx * (TILE / 2 - 0.2), gz = wz - e.dz * (TILE / 2 - 0.2);
      const along = e.dx ? 'z' : 'x';
      const brokenAlready = b.faction === 'dd' && hash01(b.seed, 41) < 0.5;
      const o = addObject(c, { kind: 'gate', x: gx, y: Y, z: gz, ry: along === 'z' ? Math.PI / 2 : 0, hp: b.size === 'city' ? 520 : b.size === 'large' ? 400 : 280, faction: b.faction, base: b.id, broken0: brokenAlready });
      o.collider = c.addCollider(along === 'x' ? gx - 1 : gx - 0.08, Y, along === 'z' ? gz - 1 : gz - 0.08, along === 'x' ? gx + 1 : gx + 0.08, Y + 2.6, along === 'z' ? gz + 1 : gz + 0.08, false);
      if (brokenAlready) o.collider.disabled = true;
      if (b.faction === 'rq') addProp(c, 'sandbags', wx - e.dx * 3.2 + e.dz * 1.6, Y, wz - e.dz * 3.2 - e.dx * 1.6, Math.atan2(e.dx, e.dz) + Math.PI / 2, { len: 1.6 });
    }
  });
  if (L.alarmed) {
    rooms.forEach((r, ri) => {
      if (!(r.role === 'yard' || r.role === 'hall' || r.role === 'command' || r.role === 'quarters') || !mine(r.wx, r.wz)) return;
      const R = roomRng(ri, 9);
      const s = R.chance(1) && wallSpot(L, r, R);
      if (s) addObject(c, { kind: 'alarm', x: s.x, y: Y, z: s.z, ry: Math.atan2(s.nx, s.nz), base: b.id, y0: Math.min(r.ceil - 0.4, 2.6) });
    });
  }
  // Wanderers who trade stand at their stall
  L.posts.forEach((post, k) => {
    if (post[4] !== 'trader' || !mine(post[0], post[2])) return;
    addObject(c, { kind: 'trader', x: post[0], y: Y, z: post[2], base: b.id, post: k, offers: traderOffers(hash4(b.seed, k, 21)) });
  });
  c.meta.baseFaction = F;
}

function wallSpot(L, r, R) {
  const { W, TX0, TZ0, kind } = L;
  const k = (lx, lz) => (lx < 0 || lz < 0 || lx >= W || lz >= W ? K_NONE : kind[lz * W + lx]);
  for (let t = 0; t < 30; t++) {
    const lx = R.int(r.x, r.x + r.w - 1), lz = R.int(r.z, r.z + r.h - 1);
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (k(lx + dx, lz + dz) === K_WALL) return { x: (TX0 + lx + 0.5 + dx / 2) * TILE, z: (TZ0 + lz + 0.5 + dz / 2) * TILE, nx: -dx, nz: -dz };
  }
  return null;
}

// Furniture by room role.
function furnish(c, level, b, L, r, ri, R, ctx) {
  const { take, prop, cont, pick, atWall, x0, z0, w, h, cx, cz, Y, F, loot } = ctx;
  const rq = F === 'rq', dd = F === 'dd';
  const lootK = dd ? 0.55 : 1;
  const chance = p => R.chance(p * (dd ? 0.7 : 1));
  const image = (img, s, wv, hv, extra = {}) => { if (!s) return; const p = atWall(s, 0.01); addObject(c, { kind: 'image', img, x: p.x, y: Y, z: p.z, ry: p.ry, w: wv, hgt: hv, ...extra }); };
  // faction pictures: flags, portraits, posters
  const decorate = (n) => {
    for (let k = 0; k < n; k++) {
      const s = take();
      if (!s) return;
      if (rq) { const v = R.int(0, 3); image(['ririqiaFlag', 'ririqiaPoster', 'rucky', 'ruckyPropaganda'][v], s, v === 0 ? 1.4 : 0.8, v === 0 ? 1.05 : v === 1 ? 1.0 : 0.95, v === 0 ? { flag: true, y0: 1.75 } : { frame: v >= 2 ? 'gold' : null }); }
      else if (dd) { const v = R.int(0, 2); if (v === 0) image('didystanFlag', s, 1.4, 0.84, { flag: true, y0: 1.7, tilt: R.float(-0.06, 0.06) }); else image('didFigure:' + hash4(b.seed, ri, k), s, 0.62, 0.78, { frame: 'wood', tilt: R.chance(0.4) ? R.float(-0.25, 0.25) : 0 }); }
      else image('didh', s, 0.7, 0.88, { frame: 'wood' });
    }
  };
  switch (r.role) {
    case 'yard': {
      // the big hall: a watch post near the gate, crates, fuel, vehicles of a sort
      const e = L.entrances[0];
      if (rq || dd) {
        if (r.w >= 6 && r.h >= 6) addProp(c, 'watchPost', cx + R.float(-w / 5, w / 5), Y, cz + R.float(-h / 5, h / 5), R.int(0, 3) * Math.PI / 2, { mat: dd ? 'rustMetal' : 'darkWood' });
        for (let n = 0; n < Math.round(r.w * r.h / 14); n++) { const s = take(); if (!s) break; const t = R.int(0, 5); if (t === 0) prop('ammoCrates', s, 0.45, dd ? { band: 'teal' } : {}); else if (t === 1) prop('fuelDrums', s, 0.45, { mat: dd ? 'rustMetal' : 'rqRed' }); else if (t === 2) prop('sandbags', s, 0.4, { len: 1.8 }); else if (t === 3) cont('crate', s, 0.45, loot('storage'), [1, 2]); else if (t === 4) prop('foodCrates', s, 0.45); else prop('waterTanks', s, 0.6); }
        if (rq && b.size !== 'medium') addProp(c, 'antennaMast', x0 + 1, Y, z0 + 1, 0, { h: Math.min(r.ceil - 0.3, 5) });
        decorate(rq ? 3 : 2);
      }
      break;
    }
    case 'hall': decorate(rq ? 1 : 0); break;
    case 'quarters': case 'housing': {
      const n = Math.max(1, Math.floor(r.w * r.h / (r.role === 'housing' ? 4 : 5)));
      for (let k = 0; k < n; k++) { const s = take(); if (!s) break; prop(b.size === 'tiny' ? 'cot' : rq || dd ? 'bunkBed' : 'cot', s, 1.05, { blanket: rq ? 'rqRed' : dd ? 'teal' : 'olive' }); }
      for (let k = 0; k < Math.ceil(n / 2); k++) { const s = take(); if (s) cont('footlocker', s, 0.3, loot('quarters'), [0, 1]); }
      if (chance(0.5)) { const s = take(); if (s) addLocker(c, atWall(s, 0.36).x, Y, atWall(s, 0.36).z, atWall(s, 0.36).ry); }
      if (r.role === 'housing') { addProp(c, 'table', cx, Y, cz, 0); for (const sx of [-1.15, 1.15]) addProp(c, 'chair', cx + sx, Y, cz, sx < 0 ? -Math.PI / 2 : Math.PI / 2); addProp(c, 'rug', cx, Y, cz + 1.2, 0, { mat: rq ? 'rqRed' : 'teal' }); }
      decorate(1);
      break;
    }
    case 'meeting': {
      const along = w >= h;
      addProp(c, 'conferenceTable', cx, Y, cz, along ? 0 : Math.PI / 2);
      for (let kk = -1; kk <= 1; kk++) for (const sd of [-1, 1]) { const ox = along ? kk * 1.1 : sd * 1.22, oz = along ? sd * 1.22 : kk * 1.1; if (chance(0.85)) addProp(c, 'officeChair', cx + ox, Y, cz + oz, Math.atan2(along ? 0 : ox, along ? oz : 0)); }
      const s = take(); if (s) prop('mapBoard', s, 0.02);
      decorate(2);
      break;
    }
    case 'armory': {
      for (let k = 0; k < 2; k++) {
        const s = take(); if (!s) break;
        const p = prop('gunRack', s, 0.25, { red: rq });
        // weapons laid on the rack
        for (let n = 0; n < (dd ? 1 : 2); n++) if (chance(0.75)) addPickup(c, R, loot('armory').filter(([id]) => id && /rifle|Rifle|Pistol|pistol|Smg|smg|Shotgun|shotgun|sniper|Sniper|Machete|Baton/.test(id)), p.x + Math.cos(p.ry) * (n - 0.5) * 0.7 + Math.sin(p.ry) * 0.05, Y + 0.25, p.z - Math.sin(p.ry) * (n - 0.5) * 0.7 + Math.cos(p.ry) * 0.05);
      }
      for (let k = 0; k < 2; k++) { const s = take(); if (s) cont('ammo', s, 0.3, loot('armory'), dd ? [1, 1] : [1, 3]); }
      if (chance(0.6)) { const s = take(); if (s) { const p = atWall(s, 0.4); addProp(c, 'armorStand', p.x, Y, p.z, p.ry, { mat: rq ? 'rqBlack' : 'olive', helm: rq ? 'olive' : 'olive' }); addPickup(c, R, loot('armory').filter(([id]) => id && /Helmet|helmet|Vest|vest|Greaves|Guards|Boots|Carrier/.test(id)), p.x + 0.5, Y, p.z + 0.3); } }
      decorate(1);
      break;
    }
    case 'medbay': {
      for (let k = 0; k < Math.max(1, Math.floor(r.w / 2)); k++) { const s = take(); if (!s) break; prop('hospitalBed', s, 1.1); if (chance(0.5)) { const p = atWall(s, 0.4); addProp(c, 'ivStand', p.x + 0.6, Y, p.z, 0); } }
      const s = take(); if (s) cont('med', s, 0.18, loot('medbay'), dd ? [1, 1] : [2, 3]);
      if (chance(0.5)) pick(take(), 0.5, loot('medbay'));
      break;
    }
    case 'storage': {
      for (let k = 0; k < Math.max(2, Math.floor(r.w * r.h / 4)); k++) {
        const s = take(); if (!s) break;
        const t = R.int(0, 4);
        if (t === 0) prop('shelf', s, 0.3); else if (t === 1) cont('crate', s, 0.45, loot('storage'), dd ? [0, 1] : [1, 2]); else if (t === 2) cont('cardboard', s, 0.35, loot('storage'), [0, 2]); else if (t === 3) prop('foodCrates', s, 0.4); else prop('boxes', s, 0.35);
      }
      break;
    }
    case 'mess': {
      const along = w >= h;
      addProp(c, 'longTable', cx, Y, cz, along ? 0 : Math.PI / 2, { len: Math.min(3.4, (along ? w : h) - 1.4) });
      for (const sd of [-1, 1]) addProp(c, 'bench', cx + (along ? 0 : sd * 0.85), Y, cz + (along ? sd * 0.85 : 0), along ? 0 : Math.PI / 2);
      const s = take(); if (s) prop('stove', s, 0.4);
      const s2 = take(); if (s2) cont('cardboard', s2, 0.35, loot('mess'), [1, 2]);
      const s3 = take(); if (s3) prop('foodCrates', s3, 0.4);
      decorate(1);
      break;
    }
    case 'comms': {
      const s = take(); if (s) prop('radioDesk', s, 0.4);
      const s2 = take(); if (s2) prop('mapBoard', s2, 0.02);
      const s3 = take(); if (s3) cont('toolbox', s3, 0.35, loot('comms'), [1, 2]);
      const s4 = take() || s;
      if (rq && s4) { const p = atWall(s4, 0.2); addProp(c, 'antennaMast', p.x, Y, p.z, 0, { h: Math.min(r.ceil - 0.2, 3.4) }); }
      if (rq) addObject(c, { kind: 'radioSet', x: cx, y: Y, z: cz, base: b.id });
      break;
    }
    case 'power': {
      const s = take(); if (s) prop('generator', s, 0.85);
      const s2 = take(); if (s2) prop('fuelDrums', s2, 0.4, { mat: rq ? 'rqRed' : 'rustMetal' });
      const s3 = take(); if (s3) prop('gaugeWall', s3, 0.05);
      addProp(c, 'powerCables', cx, Y, cz, R.chance(0.5) ? 0 : Math.PI / 2, { len: Math.min(w, h) });
      const s4 = take(); if (s4) cont('toolbox', s4, 0.35, loot('power'), [1, 2]);
      break;
    }
    case 'industrial': {
      for (const [kk, inset] of [['workbench', 0.45], ['lathe', 0.5], ['machine', 0.7]]) { const s = take(); if (s) prop(kk, s, inset, kk === 'machine' ? { w: 1.6 } : undefined); }
      const s = take(); if (s) cont('toolbox', s, 0.35, loot('industrial'), [1, 2]);
      if (chance(0.5)) pick(take(), 0.6, loot('industrial'));
      break;
    }
    case 'computers': {
      for (let kk = 0; kk < Math.max(1, Math.floor(r.w * r.h / 5)); kk++) {
        const s = take(); if (!s) break;
        const p = atWall(s, 0.6), Rr = p.ry + Math.PI;
        addProp(c, 'desk', p.x, Y, p.z, Rr, { monitor: true, papers: R.chance(0.5) });
        addProp(c, 'officeChair', p.x + s.nx * 0.9, Y, p.z + s.nz * 0.9, Rr);
        if (rq) {
          const lx = -0.15, lz = -0.12, mx = p.x + lx * Math.cos(Rr) + lz * Math.sin(Rr), mz = p.z - lx * Math.sin(Rr) + lz * Math.cos(Rr);
          addObject(c, { kind: 'rqComputer', x: mx, y: Y, z: mz, ry: Rr, base: b.id, n: kk, seat: { x: p.x + s.nx * 0.85, z: p.z + s.nz * 0.85, yaw: Math.atan2(-(mx - p.x - s.nx * 0.85), -(mz - p.z - s.nz * 0.85)) } });
        }
      }
      const s = take(); if (s) prop('serverRack', s, 0.45);
      decorate(1);
      break;
    }
    case 'research': {
      const s = take(); if (s) prop('labTable', s, 0.45);
      const s2 = take(); if (s2) prop('specimenTank', s2, 0.5, { thing: R.chance(0.5) });
      const s3 = take(); if (s3) cont('cabinet', s3, 0.3, loot('research'), [1, 2]);
      const s4 = take(); if (s4) { const p = atWall(s4, 0.01); addObject(c, { kind: 'sign', text: rq ? arabicGibberish(hash4(b.seed, ri, 9), 3) : 'SAMPLE 7 — DO NOT OPEN', x: p.x, y: Y, z: p.z, ry: p.ry, w: 1.4, h: 1.5, size: 24, bg: '#f2f2ee', fg: '#203048', border: '#888', rtl: rq }); }
      break;
    }
    case 'command': {
      const s = take();
      if (s) { const p = atWall(s, 1.0); addProp(c, 'desk', p.x, Y, p.z, p.ry + Math.PI, { monitor: rq, papers: true }); addProp(c, 'officeChair', p.x + s.nx * 0.85, Y, p.z + s.nz * 0.85, p.ry); }
      const s2 = take(); if (s2) cont('safe', s2, 0.32, loot('command'), [1, 2]);
      const s3 = take(); if (s3) prop('mapBoard', s3, 0.02);
      decorate(2);
      // the vault code is no code at all: it is the key the officer carries
      break;
    }
    case 'vault': {
      const [dxw, dzw] = [(L.TX0 + r.door.x + 0.5) * TILE, (L.TZ0 + r.door.z + 0.5) * TILE];
      const kk = (lx, lz) => (lx < 0 || lz < 0 || lx >= L.W || lz >= L.W ? K_NONE : L.kind[lz * L.W + lx]);
      const along = kk(r.door.x - 1, r.door.z) === K_WALL || kk(r.door.x + 1, r.door.z) === K_WALL ? 'x' : 'z';
      if (dxw >= c.x0 && dxw < c.x0 + CHUNK && dzw >= c.z0 && dzw < c.z0 + CHUNK) {
        const o = addObject(c, { kind: 'baseVault', x: dxw, y: Y, z: dzw, ry: along === 'z' ? Math.PI / 2 : 0, faction: F, base: b.id });
        o.collider = c.addCollider(along === 'x' ? dxw - 1 : dxw - 0.15, Y, along === 'z' ? dzw - 1 : dzw - 0.15, along === 'x' ? dxw + 1 : dxw + 0.15, Y + 2.6, along === 'z' ? dzw + 1 : dzw + 0.15, false);
      }
      for (let k = 0; k < 3; k++) { const s = take(); if (s) cont(k === 0 ? 'safe' : 'ammo', s, 0.32, loot('vault'), dd ? [1, 2] : [2, 3]); }
      break;
    }
    case 'rec': {
      if (r.w >= 4 && r.h >= 3 && chance(0.6)) addProp(c, 'pingPong', cx, Y, cz, w >= h ? 0 : Math.PI / 2);
      else addProp(c, 'table', cx, Y, cz, 0);
      const s = take(); if (s) prop('sofa', s, 0.5);
      const s2 = take(); if (s2) prop('tvSet', s2, 0.35, { screen: rq ? 'screenRed' : 'screenBlue' });
      if (chance(0.5)) pick(take(), 0.5, loot('rec'));
      decorate(2);
      break;
    }
    case 'cells': {
      const along = w >= h;
      addProp(c, 'cellBars', cx + (along ? 0 : w / 6), Y, cz + (along ? h / 6 : 0), along ? 0 : Math.PI / 2, { len: (along ? w : h) - 0.3 });
      addProp(c, 'cot', cx + (along ? -w / 4 : w / 3), Y, cz + (along ? h / 3 : -h / 4), along ? Math.PI / 2 : 0);
      addProp(c, 'remains', cx + (along ? w / 4 : w / 3), Y, cz + (along ? h / 3 : h / 4), R.float(0, 6));
      addNote(c, 'rq_prisoner', cx + (along ? w / 5 : w / 3), Y + 0.005, cz + (along ? h / 3 : h / 5), 0.4);
      break;
    }
    case 'water': {
      const s = take(); if (s) prop('waterTanks', s, 0.6);
      const s2 = take(); if (s2) prop('pipeV', s2, 0.15, { h: r.ceil });
      const s3 = take(); if (s3) cont('crate', s3, 0.45, loot('water'), [1, 2]);
      break;
    }
    case 'watch': {
      // a small raised post inside: the marksman's perch
      addProp(c, 'watchPost', cx - 0.6, Y, cz, R.int(0, 3) * Math.PI / 2, { h: 1.2, mat: dd ? 'rustMetal' : 'darkWood' });
      if (chance(0.4)) addPickup(c, R, [['sniperAmmo', 8, [3, 6]], [rq ? 'rqSniper' : 'sniper', dd ? 2 : 1], ['flare', 4]], cx - 0.6, Y + 1.22, cz);
      break;
    }
    case 'shrine': {
      const s = take(); if (s) image(R.chance(0.08) ? 'didhDark' : 'didh', s, 0.8, 1.0, { frame: 'wood' });
      addProp(c, 'candles', cx, Y, cz - 0.3, 0);
      addProp(c, 'rug', cx, Y, cz + 0.3, 0, { w: 1.6, d: 1.2 });
      if (chance(0.5)) addPickup(c, R, [['didhCharm', 1]], cx + 0.3, Y, cz);
      break;
    }
    case 'camp': {
      for (let k = 0; k < 2; k++) { const s = take(); if (s) prop('bedroll', s, 1.0); }
      const s = take(); if (s) cont('backpack', s, 0.4, loot('camp'), [1, 2]);
      addProp(c, 'candles', cx, Y, cz, 0);
      decorate(1);
      break;
    }
    case 'stall': {
      const s = take(); if (s) prop('stall', s, 0.9);
      decorate(1);
      break;
    }
  }
}

export { K_ROOM, K_YARD, K_CORR, K_DOOR, K_ENTR, K_WALL };
