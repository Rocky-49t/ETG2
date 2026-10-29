// Helpers shared by level generators: lights, decals, interactive objects,
// loot rolls and wall-adjacency queries.
import { TILE, CS, T_SOLID, T_FLOOR, F_RESERVED, F_NAVBLOCK, F_LANDMARK } from '../chunk.js';
import { hash4 } from '../../core/rng.js';

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

export function addPickup(c, rng, table, x, y, z) {
  const loot = rollLoot(rng, table, 1)[0];
  if (!loot) return null;
  return addObject(c, { kind: 'pickup', item: loot.item, qty: loot.qty, x, y, z, ry: rng.float(0, Math.PI * 2) });
}

export function addContainer(c, rng, ctype, table, x, y, z, ry, rolls = [1, 3]) {
  const loot = rollLoot(rng, table, rng.int(rolls[0], rolls[1]));
  return addObject(c, { kind: 'container', ctype, loot, x, y, z, ry });
}

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

// Wall-mounted arrow decal pointing (roughly) toward a world target.
export function addWayfinding(c, rng, spots, target, opts = {}) {
  if (!target || !spots.length) return;
  const s = rng.pick(spots);
  const p = wallPos(c, s);
  const dx = target.x - p.x, dz = target.z - p.z;
  // decal u axis for wall normal n is (nz, 0, -nx)
  const ux = s.nz, uz = -s.nx;
  const flip = ux * dx + uz * dz < 0;
  addDecal(c, { name: opts.name || rng.pick(['arrow', 'arrow2']), x: p.x, y: opts.y ?? rng.float(1.1, 1.7), z: p.z, nx: s.nx, ny: 0, nz: s.nz, size: opts.size || rng.float(0.6, 0.9), flip, rot: rng.float(-0.12, 0.12) });
}

export function tileCenter(c, lx, lz) { return { x: c.tx(lx), z: c.tz(lz) }; }

// Environmental storytelling vignette: the remains of a wanderer (with their
// backpack) or an abandoned camp, placed on a free tile.
const PACK_LOOT = [['almondWater', 20], ['battery', 18, [1, 3]], ['bandage', 14], ['snackBar', 12], ['flare', 8], ['glowstick', 10, [1, 3]], ['ammo9', 8, [5, 10]], ['painkillers', 8], ['knife', 3], ['lighter', 4]];
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
