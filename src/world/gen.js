// Generation helpers shared by every level generator: deterministic edge
// "ports" that guarantee chunks connect to their neighbours, carving tools,
// connectivity repair and simple placement utilities.
import { RNG, hash4, hashString } from '../core/rng.js';
import { CS, TILE, T_SOLID, T_FLOOR, F_RESERVED, F_ROOM, F_LANDMARK, NO_WATER } from './chunk.js';

const KIND_H = 1, KIND_V = 2;

// Openings along one shared chunk edge. Both neighbours compute the same list.
export function edgePorts(seed, kind, a, b, cfg = {}) {
  const rng = new RNG(hash4(seed, kind, a, b));
  const min = cfg.min ?? 1, max = cfg.max ?? 3, wMin = cfg.wMin ?? 1, wMax = cfg.wMax ?? 2;
  const count = rng.int(min, max);
  const ports = [];
  const used = new Uint8Array(CS);
  for (let k = 0; k < count * 4 && ports.length < count; k++) {
    const w = rng.int(wMin, wMax);
    const i = rng.int(2, CS - 2 - w);
    let ok = true;
    for (let j = i - 1; j <= i + w; j++) if (used[j]) ok = false;
    if (!ok) continue;
    for (let j = i; j < i + w; j++) used[j] = 1;
    ports.push({ i, w });
  }
  return ports;
}

export function chunkPorts(seed, cx, cz, cfg) {
  return {
    n: edgePorts(seed, KIND_H, cx, cz, cfg),
    s: edgePorts(seed, KIND_H, cx, cz + 1, cfg),
    w: edgePorts(seed, KIND_V, cx, cz, cfg),
    e: edgePorts(seed, KIND_V, cx + 1, cz, cfg),
  };
}

// Local tile coordinates of every port tile.
export function portTiles(ports) {
  const out = [];
  for (const p of ports.n) for (let j = 0; j < p.w; j++) out.push([p.i + j, 0, 'n']);
  for (const p of ports.s) for (let j = 0; j < p.w; j++) out.push([p.i + j, CS - 1, 's']);
  for (const p of ports.w) for (let j = 0; j < p.w; j++) out.push([0, p.i + j, 'w']);
  for (const p of ports.e) for (let j = 0; j < p.w; j++) out.push([CS - 1, p.i + j, 'e']);
  return out;
}

export function chunkRng(seed, levelId, cx, cz, salt = 0) {
  return new RNG(hash4(seed, hashString(levelId), cx * 7919 + salt, cz));
}

// Open a tile with a template {floor, ceil, fmat, cmat, flags}.
export function openTile(c, lx, lz, t) {
  if (lx < 0 || lz < 0 || lx >= CS || lz >= CS) return;
  const i = lz * CS + lx;
  c.type[i] = t.type ?? T_FLOOR;
  c.floor[i] = t.floor ?? 0;
  c.ceil[i] = t.ceil ?? 3;
  if (t.fmat !== undefined) c.fmat[i] = t.fmat;
  if (t.cmat !== undefined) c.cmat[i] = t.cmat;
  if (t.water !== undefined) c.water[i] = t.water;
  if (t.flags) c.flags[i] |= t.flags;
}

export function carveRect(c, x0, z0, x1, z1, t) {
  const ax = Math.max(0, Math.min(x0, x1)), bx = Math.min(CS - 1, Math.max(x0, x1));
  const az = Math.max(0, Math.min(z0, z1)), bz = Math.min(CS - 1, Math.max(z0, z1));
  for (let z = az; z <= bz; z++) for (let x = ax; x <= bx; x++) openTile(c, x, z, t);
}

export function fillRect(c, x0, z0, x1, z1, wmat = 0) {
  const ax = Math.max(0, Math.min(x0, x1)), bx = Math.min(CS - 1, Math.max(x0, x1));
  const az = Math.max(0, Math.min(z0, z1)), bz = Math.min(CS - 1, Math.max(z0, z1));
  for (let z = az; z <= bz; z++) for (let x = ax; x <= bx; x++) {
    const i = z * CS + x;
    c.type[i] = T_SOLID; c.wmat[i] = wmat; c.water[i] = NO_WATER; c.flags[i] = 0;
  }
}

// L-shaped corridor between two local tiles, `width` tiles wide.
export function carveL(c, ax, az, bx, bz, t, rng, width = 1) {
  const horizontalFirst = rng ? rng.chance(0.5) : true;
  const mx = horizontalFirst ? bx : ax, mz = horizontalFirst ? az : bz;
  const seg = (x0, z0, x1, z1) => {
    const hw = width - 1;
    carveRect(c, Math.min(x0, x1), Math.min(z0, z1), Math.max(x0, x1) + hw, Math.max(z0, z1) + hw, t);
  };
  seg(ax, az, mx, mz);
  seg(mx, mz, bx, bz);
}

// Whether a body can move between two adjacent open tiles (step or swim).
export function passable(fa, wa, fb, wb) {
  if (Math.abs(fa - fb) <= 0.65) return true;
  const surf = Math.max(wa, wb);
  return surf > Math.min(fa, fb) + 0.3 && Math.max(fa, fb) <= surf + 0.7;
}

function walkableLocal(c, i) {
  return c.type[i] === T_FLOOR;
}

function edgeFloor(c, i, dir) {
  // floor height at the edge of tile i heading in dir (handles ramps)
  const r = c.ramp[i];
  if (r < 0) return c.floor[i];
  const rise = c.rampH[i];
  // dir: 0:+x 1:+z 2:-x 3:-z ; ramp rises toward r
  if (dir === r) return c.floor[i] + rise;
  if ((dir + 2) % 4 === r) return c.floor[i];
  return c.floor[i] + rise * 0.5;
}

// Connected components on walkable tiles (height-aware).
export function components(c) {
  const comp = new Int16Array(CS * CS).fill(-1);
  const list = [];
  const q = [];
  for (let s = 0; s < CS * CS; s++) {
    if (comp[s] >= 0 || !walkableLocal(c, s)) continue;
    const id = list.length;
    const tiles = [];
    comp[s] = id; q.length = 0; q.push(s);
    while (q.length) {
      const i = q.pop();
      tiles.push(i);
      const x = i % CS, z = (i / CS) | 0;
      const nb = [[x + 1, z, 0], [x, z + 1, 1], [x - 1, z, 2], [x, z - 1, 3]];
      for (const [nx, nz, d] of nb) {
        if (nx < 0 || nz < 0 || nx >= CS || nz >= CS) continue;
        const j = nz * CS + nx;
        if (comp[j] >= 0 || !walkableLocal(c, j)) continue;
        if (!passable(edgeFloor(c, i, d), c.water[i], edgeFloor(c, j, (d + 2) % 4), c.water[j])) continue;
        comp[j] = id; q.push(j);
      }
    }
    list.push(tiles);
  }
  return { comp, list };
}

// Make every walkable component reachable from the first port's component by
// carving shortest corridors through solid tiles. `template(lx,lz,fromTile)`
// returns the tile settings for carved tiles.
export function ensureConnected(c, ports, template) {
  const pts = portTiles(ports);
  for (let pass = 0; pass < 12; pass++) {
    const { comp, list } = components(c);
    if (list.length <= 1) return;
    // main = component of first port tile, or the largest
    let main = -1;
    for (const [x, z] of pts) { const id = comp[z * CS + x]; if (id >= 0) { main = id; break; } }
    if (main < 0) { let best = 0; list.forEach((t, k) => { if (t.length > best) { best = t.length; main = k; } }); }
    // pick another component, BFS from it to main
    const other = list.findIndex((t, k) => k !== main && !t.every(i => c.flags[i] & F_LANDMARK));
    if (other < 0) return;
    const prev = new Int16Array(CS * CS).fill(-2);
    const q = [];
    for (const i of list[other]) { prev[i] = -1; q.push(i); }
    let found = -1;
    for (let h = 0; h < q.length && found < 0; h++) {
      const i = q[h];
      const x = i % CS, z = (i / CS) | 0;
      for (const [nx, nz] of [[x + 1, z], [x - 1, z], [x, z + 1], [x, z - 1]]) {
        if (nx < 0 || nz < 0 || nx >= CS || nz >= CS) continue;
        const j = nz * CS + nx;
        if (prev[j] !== -2) continue;
        prev[j] = i;
        if (comp[j] === main) { found = j; break; }
        q.push(j);
      }
    }
    if (found < 0) return;
    // carve path back
    let i = prev[found];
    let guard = 0;
    while (i >= 0 && comp[i] !== other && guard++ < 300) {
      const x = i % CS, z = (i / CS) | 0;
      if (c.type[i] !== T_FLOOR) openTile(c, x, z, template(x, z));
      else {
        // walkable but wrong height: level it to the template height
        const t = template(x, z);
        c.floor[i] = t.floor ?? c.floor[i]; c.ramp[i] = -1;
      }
      c.flags[i] |= F_RESERVED;
      i = prev[i];
    }
  }
}

// Ensure the ports themselves are open (and reach one tile inward).
export function openPorts(c, ports, template, depth = 1) {
  for (const [x, z, side] of portTiles(ports)) {
    for (let d = 0; d < depth; d++) {
      const lx = side === 'w' ? x + d : side === 'e' ? x - d : x;
      const lz = side === 'n' ? z + d : side === 's' ? z - d : z;
      const i = lz * CS + lx;
      if (c.type[i] !== T_FLOOR) openTile(c, lx, lz, template(lx, lz));
      c.flags[i] |= F_RESERVED;
    }
  }
}

// Find a random open tile matching predicate.
export function randomOpenTile(c, rng, pred = () => true, tries = 60) {
  for (let k = 0; k < tries; k++) {
    const lx = rng.int(0, CS - 1), lz = rng.int(0, CS - 1);
    const i = lz * CS + lx;
    if (c.type[i] === T_FLOOR && pred(lx, lz, i)) return [lx, lz];
  }
  return null;
}

// Neighbour wall info for a tile: which sides are solid (within chunk only).
export function wallSides(c, lx, lz) {
  const out = [];
  const chk = (x, z, nx, nz) => {
    if (x < 0 || z < 0 || x >= CS || z >= CS) return;
    if (c.type[z * CS + x] === T_SOLID) out.push([nx, nz]);
  };
  chk(lx + 1, lz, 1, 0); chk(lx - 1, lz, -1, 0); chk(lx, lz + 1, 0, 1); chk(lx, lz - 1, 0, -1);
  return out;
}

export function isRoom(c, i) { return (c.flags[i] & F_ROOM) !== 0; }
export { TILE, CS };
