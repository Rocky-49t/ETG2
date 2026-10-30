// Helpers shared by level generators: lights, decals, interactive objects,
// loot rolls and wall-adjacency queries.
import { TILE, CS, T_SOLID, T_FLOOR, F_RESERVED, F_NAVBLOCK, F_LANDMARK } from '../chunk.js';
import { hash4, hash01 } from '../../core/rng.js';

export function addLight(c, l) {
  l.seed = hash4(Math.round(l.x * 10), Math.round(l.z * 10), 7) % 10000;
  l.flicker = l.flicker || 0;
  l.range = l.range || 9;
  l.color = l.color || [1, 0.95, 0.8];
  l.intensity = l.intensity ?? 6;
  l.kind = l.kind || 'panel';
  c.lights.push(l);
  return l;
}

export function addDecal(c, d) { c.decals.push(d); return d; }

let objCounter = 0;
export function addObject(c, o) {
  o.id = c.key + ':' + c.objects.length;
  c.objects.push(o);
  return o;
}

// Roll loot from a table [[itemId, weight, [min,max]], ...]
export function rollLoot(rng, table, rolls = 1) {
  const out = [];
  for (let r = 0; r < rolls; r++) {
    const e = rng.weighted(table.map(t => [t, t[1]]));
    if (!e || e[0] === null) continue;
    const q = e[2] ? rng.int(e[2][0], e[2][1]) : 1;
    const existing = out.find(o => o.item === e[0]);
    if (existing && !e[3]) existing.qty += q; else out.push({ item: e[0], qty: q });
  }
  return out;
}

// Loot scales with the number of players: every pickup has a few extra copies
// that only exist once the session has had at least `mp` players, and
// containers carry extra pre-rolled entries gated the same way. Generation
// stays deterministic for every peer; the gate is applied at runtime.
const MP_TIERS = [2, 4, 6];
export function addPickup(c, rng, table, x, y, z) {
  const loot = rollLoot(rng, table, 1)[0];
  if (!loot) return null;
  const o = addObject(c, { kind: 'pickup', item: loot.item, qty: loot.qty, x, y, z, ry: rng.float(0, Math.PI * 2) });
  for (const mp of MP_TIERS) {
    if (!rng.chance(0.75)) continue;
    const extra = rollLoot(rng, table, 1)[0];
    if (!extra) continue;
    const a = rng.float(0, Math.PI * 2), d = rng.float(0.35, 0.7);
    addObject(c, { kind: 'pickup', item: extra.item, qty: extra.qty, x: x + Math.cos(a) * d, y, z: z + Math.sin(a) * d, ry: rng.float(0, Math.PI * 2), mp });
  }
  return o;
}

export function addContainer(c, rng, ctype, table, x, y, z, ry, rolls = [1, 3]) {
  const loot = rollLoot(rng, table, rng.int(rolls[0], rolls[1]));
  const lootMp = rollLoot(rng, table, 4).map((it, k) => ({ ...it, mp: [2, 3, 5, 7][k] }));
  const o = addObject(c, { kind: 'container', ctype, loot, lootMp, x, y, z, ry });
  // solid furniture: players and creatures bump into it
  const dims = CONTAINER_DIMS[ctype];
  if (dims) {
    const side = Math.abs(Math.sin(ry || 0)) > 0.7;
    const hx = (side ? dims[2] : dims[0]) / 2, hz = (side ? dims[0] : dims[2]) / 2;
    o.collider = c.addCollider(x - hx, y, z - hz, x + hx, y + dims[1], z + hz, false);
    o.collider.keep = true;
  }
  return o;
}
const CONTAINER_DIMS = { cabinet: [0.5, 1.32, 0.62], crate: [0.82, 0.58, 0.57], cardboard: [0.6, 0.44, 0.45] };

export function addNote(c, noteId, x, y, z, ry = 0) {
  return addObject(c, { kind: 'note', noteId, x, y, z, ry });
}

export function addLocker(c, x, y, z, ry) {
  // hiding locker with a collider so it reads as solid
  const o = addObject(c, { kind: 'locker', x, y, z, ry });
  const hx = Math.abs(Math.sin(ry)) > 0.5 ? 0.3 : 0.35, hz = Math.abs(Math.sin(ry)) > 0.5 ? 0.35 : 0.3;
  c.addCollider(x - hx, y, z - hz, x + hx, y + 2.0, z + hz, true);
  return o;
}

// Wall-adjacent open tiles within the chunk: returns [{lx,lz,i,nx,nz}] where
// (nx,nz) points from the wall into the open tile.
export function wallSpots(c, filter = () => true) {
  const out = [];
  for (let lz = 0; lz < CS; lz++) for (let lx = 0; lx < CS; lx++) {
    const i = lz * CS + lx;
    if (c.type[i] !== T_FLOOR || c.ramp[i] >= 0) continue;
    if (!filter(lx, lz, i)) continue;
    const chk = (x, z, nx, nz) => {
      if (x < 0 || z < 0 || x >= CS || z >= CS) return;
      if (c.type[z * CS + x] === T_SOLID) out.push({ lx, lz, i, nx, nz });
    };
    chk(lx + 1, lz, -1, 0); chk(lx - 1, lz, 1, 0); chk(lx, lz + 1, 0, -1); chk(lx, lz - 1, 0, 1);
  }
  return out;
}

// World position on the wall face of a wall spot, offset into the room.
export function wallPos(c, s, inset = 0.0) {
  const cx = c.tx(s.lx), cz = c.tz(s.lz);
  return { x: cx - s.nx * (TILE / 2 - inset), z: cz - s.nz * (TILE / 2 - inset) };
}

// yaw so that local +z faces along (nx,nz)
export function yawFor(nx, nz) { return Math.atan2(nx, nz); }

export function freeTile(c, i) {
  return c.type[i] === T_FLOOR && !(c.flags[i] & (F_RESERVED | F_NAVBLOCK | F_LANDMARK)) && c.ramp[i] < 0;
}

// Wall-mounted EXIT sign / arrow pointing toward a world target. Exit signs
// ('arrow') use left/right when the target lies along the wall, and an up
// arrow (ahead) or down arrow (behind you) when it lies across it.
export function addWayfinding(c, rng, spots, target, opts = {}) {
  if (!target || !spots.length) return;
  const s = rng.pick(spots);
  const p = wallPos(c, s);
  const dx = target.x - p.x, dz = target.z - p.z;
  // decal u axis for wall normal n is (nz, 0, -nx)
  const ux = s.nz, uz = -s.nx;
  const lat = ux * dx + uz * dz, nor = s.nx * dx + s.nz * dz;
  let name = opts.name || rng.pick(['arrow', 'arrow2']);
  let flip = lat < 0;
  if (name === 'arrow' && Math.abs(lat) < Math.abs(nor) * 0.6) { name = nor < 0 ? 'exitU' : 'exitD'; flip = false; }
  const sign = name === 'arrow' || name.startsWith('exit');
  addDecal(c, { name, x: p.x, y: opts.y ?? rng.float(1.2, 1.6), z: p.z, nx: s.nx, ny: 0, nz: s.nz, size: opts.size || (sign ? 0.8 : rng.float(0.6, 0.9)), flip, rot: sign && opts.style !== 'spray' ? 0 : rng.float(-0.1, 0.1) });
}

export function tileCenter(c, lx, lz) { return { x: c.tx(lx), z: c.tz(lz) }; }

// Environmental storytelling vignette: the remains of a wanderer (with their
// backpack) or an abandoned camp, placed on a free tile.
const PACK_LOOT = [['cleanWater', 12], ['dirtyWater', 10], ['gpsBoard', 4], ['antenna', 4], ['cloth', 6], ['battery', 18, [1, 3]], ['bandage', 14], ['snackBar', 12], ['flare', 8], ['glowstick', 10, [1, 3]], ['ammo9', 8, [5, 10]], ['painkillers', 8], ['knife', 3], ['lighter', 4]];
export function addVignette(c, rng, addPropFn, noteIds, floorY = 0) {
  for (let k = 0; k < 12; k++) {
    const lx = rng.int(2, CS - 3), lz = rng.int(2, CS - 3), i = lz * CS + lx;
    if (!freeTile(c, i) || c.floor[i] !== floorY) continue;
    const x = c.tx(lx), z = c.tz(lz), ry = rng.float(0, Math.PI * 2);
    // prop-local (u,v) -> world, matching the mesher's Y rotation
    const at = (u, v) => [x + u * Math.cos(ry) + v * Math.sin(ry), z - u * Math.sin(ry) + v * Math.cos(ry)];
    if (rng.chance(0.55)) {
      addPropFn(c, 'remains', x, floorY, z, ry);
      const [bx, bz] = at(-0.7, 0.45);
      addContainer(c, rng, 'backpack', PACK_LOOT, bx, floorY, bz, ry + 1, [1, 3]);
      addDecal(c, { name: 'blood2', x, y: floorY + 0.004, z, nx: 0, ny: 1, nz: 0, size: 1.4, rot: ry });
    } else {
      addPropFn(c, 'camp', x, floorY, z, ry);
      const [bx, bz] = at(0.8, -0.75);
      addContainer(c, rng, 'backpack', PACK_LOOT, bx, floorY, bz, ry + 0.4, [1, 2]);
      addDecal(c, { name: 'tally', x: x + 0.1, y: floorY + 0.004, z: z + 0.1, nx: 0, ny: 1, nz: 0, size: 1.0, rot: ry });
    }
    if (noteIds && rng.chance(0.6)) addNote(c, rng.pick(noteIds), x + rng.float(-0.8, 0.8), floorY + 0.005, z + rng.float(-0.8, 0.8), rng.float(0, 6));
    return true;
  }
  return false;
}

// ---------------------------------------------------------------- side exits
// Besides the guaranteed landmark exit, some chunks hold a secondary exit.
// Whether a chunk has one (and where) depends only on the seed, so wayfinding
// can point at exits in chunks that haven't been generated yet.
export function sideExitAt(level, cx, cz) {
  const se = level.def.sideExit;
  if (!se) return null;
  if (Math.max(Math.abs(cx), Math.abs(cz)) < (se.minR ?? 2)) return null;
  if (hash01(cx, cz, level.levelSeed, 7771) >= se.p) return null;
  const lm = level.landmarks.some(l => Math.floor(l.tx / CS) === cx && Math.floor(l.tz / CS) === cz);
  if (lm) return null;
  const lx = 4 + Math.floor(hash01(cx, cz, level.levelSeed, 7772) * 8);
  const lz = 4 + Math.floor(hash01(cx, cz, level.levelSeed, 7773) * 8);
  return { lx, lz, x: (cx * CS + lx + 0.5) * TILE, z: (cz * CS + lz + 0.5) * TILE };
}

// Nearest known exit (landmark or side exit) to a world point.
export function nearestExit(level, x, z, R = 5) {
  let best = null, bd = Infinity;
  const e = level.byType.exit;
  if (e) { const ex = (e.tx + 0.5) * TILE, ez = (e.tz + 0.5) * TILE; bd = Math.hypot(ex - x, ez - z); best = { x: ex, z: ez, main: true }; }
  const ccx = Math.floor(x / (CS * TILE)), ccz = Math.floor(z / (CS * TILE));
  for (let dz = -R; dz <= R; dz++) for (let dx = -R; dx <= R; dx++) {
    const se = sideExitAt(level, ccx + dx, ccz + dz);
    if (!se) continue;
    const d = Math.hypot(se.x - x, se.z - z);
    if (d < bd) { bd = d; best = se; }
  }
  return best;
}

// Arrow next to the chunk doorway that leads toward `target`, so arrows chain
// from chunk to chunk instead of only pointing "roughly that way".
export function addPortArrow(c, rng, ports, target, opts = {}) {
  if (!target) return false;
  const W = CS * TILE;
  const inside = target.x >= c.x0 && target.x < c.x0 + W && target.z >= c.z0 && target.z < c.z0 + W;
  let goal = null;
  if (inside) goal = { lx: Math.floor((target.x - c.x0) / TILE), lz: Math.floor((target.z - c.z0) / TILE), x: target.x, z: target.z };
  else {
    let bd = Infinity;
    for (const side of ['n', 's', 'w', 'e']) for (const p of ports[side]) {
      const mid = p.i + p.w / 2;
      const lx = side === 'w' ? 0 : side === 'e' ? CS - 1 : Math.floor(mid);
      const lz = side === 'n' ? 0 : side === 's' ? CS - 1 : Math.floor(mid);
      const ox = side === 'w' ? -1 : side === 'e' ? 1 : 0, oz = side === 'n' ? -1 : side === 's' ? 1 : 0;
      const wx = c.x0 + (side === 'w' || side === 'e' ? lx + 0.5 : mid) * TILE + ox * TILE * 2;
      const wz = c.z0 + (side === 'n' || side === 's' ? lz + 0.5 : mid) * TILE + oz * TILE * 2;
      const d = Math.hypot(wx - target.x, wz - target.z);
      if (d < bd) { bd = d; goal = { lx, lz, x: c.tx(lx), z: c.tz(lz) }; }
    }
  }
  if (!goal) return false;
  const spots = wallSpots(c, (lx, lz, i) => Math.abs(lx - goal.lx) + Math.abs(lz - goal.lz) <= (opts.reach ?? 4) && c.floor[i] === 0)
    .filter(s => Math.abs(s.nx * (goal.x - c.tx(s.lx))) + Math.abs(s.nz * (goal.z - c.tz(s.lz))) < TILE * 1.5);
  if (!spots.length) return false;
  for (let k = 0; k < Math.min(opts.count ?? 1, spots.length); k++) {
    const s = spots.splice(rng.int(0, spots.length - 1), 1)[0];
    addWayfinding(c, rng, [s], goal, { name: opts.name || 'arrow', size: opts.size || 0.85, y: opts.y ?? 1.45 });
  }
  return true;
}

// Secondary exit for levels whose main exit needs a key: a floor hatch that can
// be forced open (noisy) or pried with a crowbar. Placed in open floor so it
// never blocks a corridor. Call after the chunk's layout is final.
export function addHatchExit(c, level, opts = {}) {
  const se = sideExitAt(level, c.cx, c.cz);
  if (!se) return null;
  const ok = (lx, lz) => {
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      const x = lx + dx, z = lz + dz;
      if (x < 1 || z < 1 || x >= CS - 1 || z >= CS - 1) return false;
      const i = z * CS + x;
      if (c.type[i] !== T_FLOOR || c.floor[i] !== 0 || c.ramp[i] >= 0 || (c.flags[i] & (F_LANDMARK | F_NAVBLOCK))) return false;
      if (c.water && c.water[i] > -1e5 && c.water[i] > c.floor[i]) return false;
    }
    return true;
  };
  for (let r = 0; r < 6; r++) for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
    if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
    const lx = se.lx + dx, lz = se.lz + dz;
    if (!ok(lx, lz)) continue;
    c.flags[lz * CS + lx] |= F_RESERVED | F_LANDMARK;
    return addObject(c, { kind: 'hatch', x: c.tx(lx), y: 0, z: c.tz(lz), ry: (hash01(c.cx, c.cz, 91) * 4 | 0) * Math.PI / 2, to: level.def.next, label: opts.label || 'maintenance hatch', mat: opts.mat });
  }
  return null;
}

// Rare door on a wall that leads to another level (back doors, alternate
// exits). Placement depends only on the chunk hash so it is stable.
export function addLevelDoor(c, level, rng, to, opts = {}) {
  if (Math.max(Math.abs(c.cx), Math.abs(c.cz)) < (opts.minR ?? 2)) return null;
  if (hash01(c.cx, c.cz, level.levelSeed, opts.salt ?? 811) >= (opts.p ?? 0.04)) return null;
  const spots = wallSpots(c, (lx, lz, i) => freeTile(c, i) && c.floor[i] === (opts.floor ?? 0) && c.ceil[i] - c.floor[i] >= 2.8 && lx > 0 && lz > 0 && lx < CS - 1 && lz < CS - 1);
  if (!spots.length) return null;
  let s = spots[Math.floor(hash01(c.cx, c.cz, level.levelSeed, (opts.salt ?? 811) + 1) * spots.length)];
  // near a given point (so wayfinding toward a side exit lands on the door)
  if (opts.near) s = spots.reduce((b, q) => (Math.hypot(c.tx(q.lx) - opts.near.x, c.tz(q.lz) - opts.near.z) < Math.hypot(c.tx(b.lx) - opts.near.x, c.tz(b.lz) - opts.near.z) ? q : b), s);
  const p = wallPos(c, s, 0.08);
  c.flags[s.i] |= F_RESERVED;
  const label = opts.label || ('LEVEL ' + to.slice(1));
  return addObject(c, { kind: 'levelDoor', to, label, x: p.x, y: opts.floor ?? 0, z: p.z, ry: yawFor(s.nx, s.nz) });
}

// Remove props, colliders, lights and objects inside a world rect (used when
// a landmark is carved over geometry that was already generated).
export function clearArea(c, x0, z0, x1, z1) {
  const inside = (x, z) => x > x0 && x < x1 && z > z0 && z < z1;
  c.props = c.props.filter(p => !inside(p.x, p.z));
  c.colliders = c.colliders.filter(b => !(b.x0 < x1 && b.x1 > x0 && b.z0 < z1 && b.z1 > z0) || b.keep);
  c.lights = c.lights.filter(l => !inside(l.x, l.z));
  c.objects = c.objects.filter(o => !inside(o.x, o.z));
}
