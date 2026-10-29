// Level 0 — The Lobby. Endless mono-yellow office space: partitions, room
// clusters, long halls and tall pillar halls under humming fluorescent light.
// Exit: a pit where "the carpet forgets to hold".
import { TILE, CS, T_SOLID, T_FLOOR, F_ROOM, F_DARK, F_RESERVED, F_LANDMARK } from '../chunk.js';
import { openPorts, ensureConnected, carveRect, fillRect, openTile } from '../gen.js';
import { placeLandmark } from '../level.js';
import { addProp } from '../props.js';
import { addLight, addDecal, addObject, addPickup, addContainer, addNote, addLocker, wallSpots, wallPos, yawFor, freeTile, addWayfinding, addVignette, sideExitAt, nearestExit, addPortArrow } from './common.js';
import { hash01, makeNoise2D, RNG } from '../../core/rng.js';

const darkNoise = makeNoise2D(404);

const LOOT = [
  ['almondWater', 30, [1, 1]], ['snackBar', 22], ['battery', 18, [1, 2]], ['bandage', 14],
  ['glowstick', 10, [1, 3]], ['cannedBeans', 8], ['flashlight', 3], ['lighter', 3], ['knife', 2], ['painkillers', 5], [null, 25],
];
const BOX_LOOT = [
  ['almondWater', 25], ['snackBar', 20], ['battery', 18, [1, 3]], ['bandage', 12], ['glowstick', 12, [1, 3]],
  ['decoy', 4], ['flashlight', 4], ['lighter', 4], ['crowbar', 2], ['ammo9', 3, [4, 8]], [null, 20],
];

const T = (ceil = 3) => ({ floor: 0, ceil, fmat: 0, cmat: 0 });

function zoneFor(cx, cz, seed) {
  if (cx === 0 && cz === 0) return 'partition';
  const h = hash01(Math.floor(cx / 2), Math.floor(cz / 2), seed, 3) * 0.6 + hash01(cx, cz, seed, 4) * 0.4;
  if (h < 0.38) return 'partition';
  if (h < 0.6) return 'rooms';
  if (h < 0.8) return 'halls';
  return 'pillars';
}

function genPartition(c, rng, ceil) {
  carveRect(c, 0, 0, CS - 1, CS - 1, T(ceil));
  const n = rng.int(9, 16);
  for (let k = 0; k < n; k++) {
    const horiz = rng.chance(0.5);
    const len = rng.int(2, 7);
    const x = rng.int(1, CS - 2), z = rng.int(1, CS - 2);
    const x1 = horiz ? Math.min(CS - 2, x + len) : x, z1 = horiz ? z : Math.min(CS - 2, z + len);
    fillRect(c, x, z, x1, z1, 0);
    if (rng.chance(0.35)) {
      // L return
      const l2 = rng.int(2, 4);
      if (horiz) fillRect(c, x1, z1, x1, Math.min(CS - 2, z1 + l2), 0);
      else fillRect(c, x1, z1, Math.min(CS - 2, x1 + l2), z1, 0);
    }
  }
  // occasional square column
  for (let k = rng.int(0, 3); k > 0; k--) { const x = rng.int(2, 13), z = rng.int(2, 13); fillRect(c, x, z, x, z, 0); }
}

function genRooms(c, rng, ceil) {
  fillRect(c, 0, 0, CS - 1, CS - 1, 0);
  const leaves = [];
  const split = (x0, z0, x1, z1, depth) => {
    const w = x1 - x0 + 1, h = z1 - z0 + 1;
    if (depth > 3 || (w < 8 && h < 8) || (depth > 1 && rng.chance(0.2))) { leaves.push([x0, z0, x1, z1]); return; }
    const vertical = w > h ? true : h > w ? false : rng.chance(0.5);
    if (vertical && w >= 8) {
      const s = rng.int(x0 + 3, x1 - 4);
      split(x0, z0, s, z1, depth + 1); split(s + 1, z0, x1, z1, depth + 1);
      const dz = rng.int(z0 + 1, z1 - 1);
      carveRect(c, s, dz, s + 1, dz + (rng.chance(0.4) ? 1 : 0), { ...T(ceil), flags: F_RESERVED });
    } else if (!vertical && h >= 8) {
      const s = rng.int(z0 + 3, z1 - 4);
      split(x0, z0, x1, s, depth + 1); split(x0, s + 1, x1, z1, depth + 1);
      const dx = rng.int(x0 + 1, x1 - 1);
      carveRect(c, dx, s, dx + (rng.chance(0.4) ? 1 : 0), s + 1, { ...T(ceil), flags: F_RESERVED });
    } else leaves.push([x0, z0, x1, z1]);
  };
  split(0, 0, CS - 1, CS - 1, 0);
  for (const [x0, z0, x1, z1] of leaves) {
    const rc = rng.chance(0.3) ? ceil - 0.3 : ceil;
    carveRect(c, x0, z0, x1 - 1, z1 - 1, { ...T(rc), flags: F_ROOM });
  }
}

function genHalls(c, rng, ceil) {
  fillRect(c, 0, 0, CS - 1, CS - 1, 0);
  const offX = rng.int(1, 4), offZ = rng.int(1, 4);
  for (let z = offZ; z < CS - 1; z += rng.int(4, 6)) carveRect(c, 0, z, CS - 1, z + (rng.chance(0.5) ? 1 : 0), T(ceil));
  for (let x = offX; x < CS - 1; x += rng.int(4, 7)) carveRect(c, x, 0, x + (rng.chance(0.3) ? 1 : 0), CS - 1, T(ceil));
  // a couple of side rooms
  for (let k = rng.int(1, 3); k > 0; k--) {
    const x = rng.int(1, 10), z = rng.int(1, 10);
    carveRect(c, x, z, x + rng.int(2, 4), z + rng.int(2, 4), { ...T(ceil - 0.2), flags: F_ROOM });
  }
}

function genPillars(c, rng) {
  carveRect(c, 0, 0, CS - 1, CS - 1, T(4.2));
  const step = 3, ox = rng.int(0, 2), oz = rng.int(0, 2);
  for (let lz = oz; lz < CS; lz += step) for (let lx = ox; lx < CS; lx += step) {
    if (rng.chance(0.12) || lx === 0 || lz === 0 || lx === CS - 1 || lz === CS - 1) continue;
    const x = c.tx(lx), z = c.tz(lz);
    addProp(c, 'pillar', x, 0, z, 0, { w: 0.7, h: 4.2, mat: 'pillarPaint', trim: 'trim' });
  }
  c.meta.pillars = true;
}

// A small dim room with a hole in the floor: "where the carpet forgets to hold".
function pitRoom(c, rng, lx, lz) {
  const ex = Math.max(3, Math.min(CS - 4, lx)), ez = Math.max(3, Math.min(CS - 4, lz));
  fillRect(c, ex - 3, ez - 3, ex + 3, ez + 3, 0);
  carveRect(c, ex - 2, ez - 2, ex + 2, ez + 2, { floor: 0, ceil: 2.8, fmat: 0, cmat: 0, flags: F_RESERVED | F_ROOM });
  // doorway + corridor out toward the chunk centre
  const side = rng.int(0, 3);
  const dx = [1, 0, -1, 0][side], dz = [0, 1, 0, -1][side];
  for (let k = 3; k < 10; k++) {
    const tx = ex + dx * k, tz = ez + dz * k;
    if (tx < 0 || tz < 0 || tx >= CS || tz >= CS) break;
    openTile(c, tx, tz, { ...T(2.8), flags: F_RESERVED });
  }
  // the pit
  for (let z = ez - 1; z <= ez; z++) for (let x = ex - 1; x <= ex; x++) {
    openTile(c, x, z, { floor: -9, ceil: 2.8, fmat: 1, cmat: 0, flags: F_LANDMARK | F_DARK });
  }
  const px = c.x0 + ex * TILE, pz = c.z0 + ez * TILE;
  addObject(c, { kind: 'exit', x: px, y: -3, z: pz, r: 2.2, to: 'L1', label: 'the pit' });
  addLight(c, { x: px + 1.6, y: 2.4, z: pz + 1.6, kind: 'bulb', cord: 0.4, color: [1, 0.75, 0.45], intensity: 3, range: 7, flicker: 0.6 });
  for (let k = 0; k < 7; k++) {
    const a = rng.float(0, Math.PI * 2), d = rng.float(2.0, 3.6);
    addDecal(c, { name: rng.pick(['stain', 'blood2', 'footprints']), x: px + Math.cos(a) * d, y: 0.005, z: pz + Math.sin(a) * d, nx: 0, ny: 1, nz: 0, size: rng.float(0.8, 1.6), rot: rng.float(0, 6.28) });
  }
  c.meta.exitRoom = { x: px, z: pz };
}

export default {
  id: 'L0',
  name: 'Level 0',
  title: 'The Lobby',
  next: 'L1',
  objective: 'Find where the carpet forgets to hold — a hole in the floor. Follow the EXIT arrows and listen for the draft.',
  sideExit: { p: 0.1, minR: 2 },
  subtitle: 'The hum is louder than you remember.',
  palette: {
    floor: [{ mat: 'carpet', scale: 2.5 }, { mat: 'black', scale: 2 }],
    wall: [{ mat: 'wallpaper', scaleU: 2, scaleV: 3, trim: 'trim', trimH: 0.11 }],
    ceil: [{ mat: 'ceilingTile', scale: 2 }],
    ledge: { mat: 'concrete', scale: 2 },
    soffit: { mat: 'wallpaper', scaleU: 2, scaleV: 3 },
  },
  materials: ['carpet', 'wallpaper', 'ceilingTile', 'lightPanel', 'trim', 'concrete', 'pillarPaint', 'cardboard', 'woodCrate', 'paintedMetal', 'laminate', 'plastic', 'darkMetal', 'black', 'paper', 'fabric', 'glowWhite', 'bulbWarm', 'chrome', 'plasticDark'],
  ambient: [0.05, 0.043, 0.02],
  bakeGain: 0.085,
  exposure: 1.0,
  fog: { color: 0x1c1808, density: 0.045 },
  background: 0x0c0a04,
  grade: { lift: [0.02, 0.015, 0.0], gamma: [1.0, 1.0, 0.95], gain: [1.06, 1.0, 0.82], saturation: 0.9, tint: [1, 0.98, 0.9], vignette: 0.5, grain: 0.05, bloomStrength: 0.45, bloomThreshold: 0.85 },
  hemi: { sky: 0x6e6438, ground: 0x221e10, intensity: 0.22 },
  portConfig: { min: 2, max: 4, wMin: 1, wMax: 3 },
  ambience: 'lobby',
  notes: ['l0_a', 'l0_b', 'l0_c', 'l0_d', 'l0_e', 'gen_a', 'gen_b'],
  entities: { primary: 'hush', max: 2, rare: ['lookalike'] },

  // Set piece: the fluorescents die in a wave racing toward you, then return.
  setPiece(game, levelId, ctx, p) {
    if (Math.random() < 0.5) {
      game.hostEvent(levelId, { k: 'lightWave', x: p.x, z: p.z, a: Math.random() * Math.PI * 2 });
      return true;
    }
    return false;
  },

  clientEvent(game, m) {
    if (m.k !== 'lightWave') return;
    // the lights stutter, die, and come back: three blackout pulses
    const pulses = [[0, 0.22], [550, 0.35], [1250, 2.6]];
    for (const [delay, dur] of pulses) setTimeout(() => { game.blackoutT = Math.max(game.blackoutT, dur); }, delay);
    const dx = Math.cos(m.a), dz = Math.sin(m.a);
    game.sfx('distantThud', { x: m.x + dx * 20, y: 2, z: m.z + dz * 20 }, { volume: 0.7 });
    setTimeout(() => { game.sfx('hushClick', { x: m.x - dx * 8, y: 1.5, z: m.z - dz * 8 }, { volume: 0.6 }); game.stats.scare(5); }, 1600);
  },

  landmarks(level) {
    const exit = placeLandmark(level, 'L0exit', 55, 95);
    return [{ type: 'spawn', tx: 8, tz: 8 }, { type: 'exit', ...exit }];
  },

  generate(c, ctx) {
    const { rng, level, ports, landmarks } = ctx;
    const zone = zoneFor(c.cx, c.cz, ctx.seed);
    c.meta.zone = zone;
    const ceil = zone === 'pillars' ? 4.2 : (hash01(c.cx, c.cz, ctx.seed, 9) < 0.25 ? 2.7 : 3.0);
    if (zone === 'partition') genPartition(c, rng, ceil);
    else if (zone === 'rooms') genRooms(c, rng, ceil);
    else if (zone === 'halls') genHalls(c, rng, ceil);
    else genPillars(c, rng);

    const tmpl = () => T(ceil);
    openPorts(c, ports, tmpl, 2);

    // landmarks
    for (const lm of landmarks) {
      if (lm.type === 'spawn') {
        carveRect(c, lm.lx - 2, lm.lz - 2, lm.lx + 2, lm.lz + 2, { ...T(ceil), flags: F_RESERVED });
      } else if (lm.type === 'exit') {
        pitRoom(c, rng, lm.lx, lm.lz);
      }
    }

    const side = sideExitAt(level, c.cx, c.cz);
    if (side) pitRoom(c, rng, side.lx, side.lz);
    ensureConnected(c, ports, tmpl);

    // ---- lights
    const goal = nearestExit(level, c.x0 + 16, c.z0 + 16);
    const nearExit = Math.hypot(c.x0 + 16 - goal.x, c.z0 + 16 - goal.z) < 40;
    for (let lz = 0; lz < CS; lz++) for (let lx = 0; lx < CS; lx++) {
      const i = lz * CS + lx;
      if (c.type[i] !== T_FLOOR || (c.flags[i] & F_LANDMARK)) continue;
      const tx = c.cx * CS + lx, tz = c.cz * CS + lz;
      const pillars = zone === 'pillars';
      if (pillars ? (tx % 3 !== 1 || tz % 3 !== 1) : (tx % 2 !== 0 || tz % 3 !== 0)) continue;
      const dark = darkNoise(tx / 14, tz / 14, 4096) > (pillars ? 0.62 : 0.72);
      if (dark && !(Math.abs(tx - 8) < 4 && Math.abs(tz - 8) < 4)) { c.flags[i] |= F_DARK; if (!rng.chance(0.15)) continue; }
      const r = rng.next();
      const broken = r < (nearExit ? 0.15 : 0.05) || dark;
      const flicker = !broken && r < (nearExit ? 0.35 : 0.12) ? rng.float(0.3, 0.9) : 0;
      addLight(c, {
        x: c.tx(lx), y: c.ceil[i] - 0.01, z: c.tz(lz), kind: 'panel', w: 1.2, d: 0.6,
        color: [1, 0.93, 0.72], intensity: pillars ? 7 : 5, range: pillars ? 11 : 8.5, flicker, broken,
      });
    }

    // ---- props & decor
    const spots = wallSpots(c, (lx, lz, i) => freeTile(c, i));
    const pick = () => (spots.length ? spots.splice(rng.int(0, spots.length - 1), 1)[0] : null);
    if (zone !== 'pillars' || rng.chance(0.5)) {
      for (let k = rng.int(0, 3); k > 0; k--) {
        const s = pick(); if (!s) break;
        const p = wallPos(c, s, 0.55);
        const kind = rng.weighted([['boxes', 3], ['chair', 2], ['fallenChair', 2], ['table', 1], ['cabinet', 1], ['plant', 1], ['waterCooler', 0.6], ['sofa', 0.5]]);
        addProp(c, kind, p.x, 0, p.z, yawFor(s.nx, s.nz) + (kind === 'fallenChair' ? rng.float(0, 6) : 0));
      }
    }
    // wall decor: frames, vents
    for (let k = rng.int(0, 2); k > 0; k--) {
      const s = pick(); if (!s) break;
      const p = wallPos(c, s, 0);
      addProp(c, rng.chance(0.5) ? 'vent' : 'wallShelfSign', p.x, rng.chance(0.5) ? 2.6 : 1.9, p.z, yawFor(s.nx, s.nz));
    }
    // decals
    const allSpots = wallSpots(c);
    // EXIT arrows: beside the doorway that leads toward the nearest exit (they
    // chain chunk to chunk), plus an occasional loose one on any wall
    if (!addPortArrow(c, rng, ports, goal, { count: 2 })) addWayfinding(c, rng, allSpots, goal, { name: 'arrow' });
    if (rng.chance(0.3)) addWayfinding(c, rng, allSpots, goal, { name: 'arrow2' });
    if (rng.chance(0.25) && allSpots.length) {
      const s = rng.pick(allSpots), p = wallPos(c, s);
      addDecal(c, { name: rng.pick(['text0', 'text1', 'text2', 'text3', 'hand', 'tally', 'scratch', 'eye']), x: p.x, y: rng.float(1.0, 1.8), z: p.z, nx: s.nx, ny: 0, nz: s.nz, size: rng.float(0.7, 1.1), rot: rng.float(-0.1, 0.1) });
    }
    if (allSpots.length) for (let k = rng.int(0, 2); k > 0; k--) {
      const s = rng.pick(allSpots), p = wallPos(c, s);
      addDecal(c, { name: 'drip', x: p.x, y: c.ceil[s.i] - 0.6, z: p.z, nx: s.nx, ny: 0, nz: s.nz, size: 1.2 });
    }
    for (let k = rng.int(1, 4); k > 0; k--) {
      const lx = rng.int(0, CS - 1), lz = rng.int(0, CS - 1), i = lz * CS + lx;
      if (c.type[i] !== T_FLOOR || (c.flags[i] & F_LANDMARK)) continue;
      addDecal(c, { name: rng.chance(0.85) ? 'stain' : 'footprints', x: c.tx(lx) + rng.float(-0.6, 0.6), y: 0.004, z: c.tz(lz) + rng.float(-0.6, 0.6), nx: 0, ny: 1, nz: 0, size: rng.float(1, 2.2), rot: rng.float(0, 6.28) });
    }
    // missing ceiling tiles
    for (let k = rng.int(0, 2); k > 0; k--) {
      const lx = rng.int(0, CS - 1), lz = rng.int(0, CS - 1), i = lz * CS + lx;
      if (c.type[i] !== T_FLOOR || c.lights.some(l => Math.abs(l.x - c.tx(lx)) < 1 && Math.abs(l.z - c.tz(lz)) < 1)) continue;
      addProp(c, 'ceilingHole', c.tx(lx) + 0.25, c.ceil[i], c.tz(lz) + 0.25, 0);
      if (rng.chance(0.5)) addProp(c, 'hangingWires', c.tx(lx) + 0.25, c.ceil[i], c.tz(lz) + 0.25, 0);
    }

    // ---- interactive objects
    for (let k = rng.int(1, 3); k > 0; k--) {
      const lx = rng.int(0, CS - 1), lz = rng.int(0, CS - 1), i = lz * CS + lx;
      if (!freeTile(c, i)) continue;
      addPickup(c, rng, LOOT, c.tx(lx) + rng.float(-0.5, 0.5), 0, c.tz(lz) + rng.float(-0.5, 0.5));
    }
    if (rng.chance(0.45)) {
      const s = pick();
      if (s) { const p = wallPos(c, s, 0.4); addContainer(c, rng, 'cardboard', BOX_LOOT, p.x, 0, p.z, yawFor(s.nx, s.nz)); }
    }
    if (rng.chance(0.3)) {
      const s = pick();
      if (s) { const p = wallPos(c, s, 0.32); addContainer(c, rng, 'cabinet', BOX_LOOT, p.x, 0, p.z, yawFor(s.nx, s.nz), [1, 2]); }
    }
    if (rng.chance(0.3)) {
      const s = pick();
      if (s) { const p = wallPos(c, s, 0.36); addLocker(c, p.x, 0, p.z, yawFor(s.nx, s.nz)); }
    }
    if (rng.chance(0.14) || (c.cx === 0 && c.cz === 0)) {
      const s = pick();
      if (s) {
        const p = wallPos(c, s, 0.5);
        addProp(c, 'table', p.x, 0, p.z, yawFor(s.nx, s.nz));
        addNote(c, (c.cx === 0 && c.cz === 0) ? 'l0_start' : rng.pick(this.notes), p.x, 0.79, p.z, yawFor(s.nx, s.nz));
      }
    }
    if (Math.abs(c.cx) + Math.abs(c.cz) > 1 && rng.chance(0.07)) addVignette(c, rng, addProp, this.notes);
    // entity spawn hints: dark quiet spots far from spawn
    if (Math.abs(c.cx) + Math.abs(c.cz) > 1 && rng.chance(0.5)) {
      for (let k = 0; k < 10; k++) {
        const lx = rng.int(0, CS - 1), lz = rng.int(0, CS - 1), i = lz * CS + lx;
        if (c.type[i] === T_FLOOR && !(c.flags[i] & F_LANDMARK)) { c.spawns.push({ x: c.tx(lx), z: c.tz(lz) }); break; }
      }
    }
  },
};
