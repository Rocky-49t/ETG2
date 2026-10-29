// Level 2 — Offices & Sewers. Abandoned office floors (cubicle farms, offices
// with doors, conference and utility rooms) above a network of sewer tunnels.
// Sewer chunks connect to each other at sewer depth; stairs lead up wherever
// they border an office chunk. Exit: a powered STAIRWELL door — find a fuse
// in a sewer pump room and restore power at the fuse box.
import * as THREE from 'three';
import { TILE, CS, T_SOLID, T_FLOOR, F_ROOM, F_DARK, F_RESERVED, F_LANDMARK, NO_WATER } from '../chunk.js';
import { openPorts, ensureConnected, carveRect, fillRect, openTile, carveL, portTiles, chunkPorts } from '../gen.js';
import { placeLandmark } from '../level.js';
import { addProp, registerProps } from '../props.js';
import { addLight, addDecal, addObject, addPickup, addContainer, addNote, addLocker, wallSpots, wallPos, yawFor, freeTile, addWayfinding } from './common.js';
import { hash01 } from '../../core/rng.js';
import { registerObjectKind } from '../../game/objects.js';
import { makeWaterMaterial, makeEnvMap } from '../../gfx/water.js';

const SEWER_F = -3.5, SEWER_C = -0.5, CH_F = -4.3, CH_W = -3.8;
const COOL = [0.82, 0.9, 1.0], SEWER_LAMP = [0.72, 0.85, 0.5];

const LOOT = [
  ['almondWater', 16], ['waterBottle', 12], ['snackBar', 14], ['energyDrink', 6], ['battery', 18, [1, 2]], ['bandage', 12], ['painkillers', 8],
  ['glowstick', 10, [1, 2]], ['ammo9', 10, [6, 12]], ['shells', 5, [2, 4]], ['decoy', 4], ['pistol', 2], ['knife', 3], ['ductTape', 4], [null, 16],
];
const DESK_LOOT = [
  ['battery', 22, [1, 2]], ['snackBar', 14], ['painkillers', 10], ['almondWater', 10], ['ammo9', 8, [5, 10]], ['glowstick', 8], ['bandage', 8],
  ['decoy', 4], ['flashlight', 3], ['energyDrink', 6], [null, 18],
];
const PUMP_LOOT = [['shells', 14, [3, 6]], ['ammo9', 14, [8, 15]], ['medkit', 6], ['bandage', 10], ['battery', 12, [2, 3]], ['shotgun', 5], ['smg', 3], ['flare', 8, [1, 2]], [null, 8]];

registerProps({
  vending: {
    colliders: [[-0.45, 0, -0.4, 0.45, 1.9, 0.4]],
    build(p, B) {
      B.box('paintedMetal', 0, 0.95, 0, 0.9, 1.9, 0.8, 1);
      B.box('glass', -0.1, 1.15, 0.405, 0.55, 1.1, 0.01, 1);
      B.box('glowWhite', -0.1, 1.15, 0.38, 0.5, 1.0, 0.01, 1);
      for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) B.box(k % 2 ? 'glowRed' : 'glowAmber', -0.3 + k * 0.13, 0.75 + r * 0.24, 0.35, 0.08, 0.1, 0.05, 0.2);
      B.box('darkMetal', 0.33, 1.2, 0.41, 0.15, 0.4, 0.02, 0.3);
    },
  },
  conferenceTable: {
    colliders: [[-1.9, 0, -0.75, 1.9, 0.78, 0.75]],
    build(p, B) {
      B.box('laminate', 0, 0.75, 0, 3.8, 0.06, 1.5, 1);
      for (const x of [-1.2, 1.2]) B.box('darkMetal', x, 0.36, 0, 0.12, 0.72, 0.6, 0.5);
    },
  },
  copier: {
    colliders: [[-0.45, 0, -0.35, 0.45, 1.1, 0.35]],
    build(p, B) {
      B.box('plastic', 0, 0.45, 0, 0.9, 0.9, 0.7, 1);
      B.box('plasticDark', 0, 0.98, -0.05, 0.85, 0.16, 0.6, 1);
      B.box('glowGreen', 0.3, 1.0, 0.26, 0.04, 0.02, 0.02, 0.1);
      B.box('paper', -0.1, 0.92, 0.33, 0.35, 0.02, 0.15, 0.3);
    },
  },
  sewerPipe: {
    colliders: null,
    build(p, B) {
      const len = p.len || 2;
      B.tube('rustMetal', -len / 2, 0, 0, len / 2, 0, 0, 0.18, 10);
      for (let x = -len / 2 + 0.3; x < len / 2; x += 1) B.cyl('darkMetal', x, -0.2, 0, 0.2, 0.04, 10, false);
    },
  },
  fuseBoxProp: {
    colliders: null,
    build(p, B) {
      B.box('paintedMetal', 0, 1.35, 0.1, 0.55, 0.8, 0.2, 0.5);
      B.box('hazard', 0, 1.82, 0.12, 0.55, 0.08, 0.16, 0.3);
      B.tube('darkMetal', 0, 1.75, 0.05, 0, 3.0, 0.05, 0.04, 6);
    },
  },
});

// Stairwell door: locked until the fuse box is powered.
registerObjectKind('stairDoor', {
  build(o, game) {
    const g = new THREE.Group();
    const mat = game.lib.dyn('darkMetal');
    const pivot = new THREE.Group(); pivot.position.set(-0.9, 0, 0);
    const panel = new THREE.Mesh(new THREE.BoxGeometry(1.8, 2.35, 0.08), mat); panel.position.set(0.9, 1.175, 0); panel.castShadow = true; pivot.add(panel);
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.06, 0.06), game.lib.dyn('chrome')); bar.position.set(0.9, 1.05, 0.08); pivot.add(bar);
    const sign = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.18, 0.01), new THREE.MeshBasicMaterial({ color: 0x30c050 })); sign.position.set(0.9, 2.0, 0.05); pivot.add(sign);
    g.add(pivot);
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.03), new THREE.MeshBasicMaterial({ color: 0xff2010 }));
    lamp.position.set(1.2, 2.45, 0.06); g.add(lamp);
    g.userData.pivot = pivot; g.userData.lamp = lamp;
    return g;
  },
  prompt(o, s, game) {
    if (s?.open) return null;
    return game.world.flag('L2', 'power') ? 'Open stairwell door' : 'Stairwell — no power';
  },
  radius: 1.2, centerY: 0.8,
  animate(mesh, o, s, dt, ) {
    const k = mesh.userData.k = (mesh.userData.k ?? 0) + ((s?.open ? 1 : 0) - (mesh.userData.k ?? 0)) * Math.min(1, dt * 3);
    mesh.userData.pivot.rotation.y = -k * 1.65;
    mesh.userData.lamp.material.color.set(s?.powered || s?.open ? 0x30ff60 : 0xff2010);
  },
});
registerObjectKind('fusebox', {
  build(o, game) {
    const g = new THREE.Group();
    const door = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.72, 0.03), game.lib.dyn('paintedMetal'));
    door.position.set(0, 1.35, 0.215); g.add(door);
    const slot = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.2, 0.04), new THREE.MeshStandardMaterial({ color: 0x5a8fd0, emissive: 0x112244 }));
    slot.position.set(0, 1.3, 0.24); slot.visible = false; g.add(slot);
    g.userData.slot = slot;
    return g;
  },
  prompt(o, s, game) {
    if (s?.on) return null;
    return game.inventory.has('fuse') ? 'Insert industrial fuse' : 'Fuse box — empty socket';
  },
  radius: 0.6, centerY: 1.2,
  animate(mesh, o, s) { mesh.userData.slot.visible = !!s?.on; },
});

function zoneFor(level, cx, cz) {
  const by = level.byType;
  const inChunk = l => l && Math.floor(l.tx / CS) === cx && Math.floor(l.tz / CS) === cz;
  if (inChunk(by.key)) return 'sewer';
  if (inChunk(by.exit) || inChunk(by.spawn)) return 'office';
  if (Math.abs(cx) + Math.abs(cz) <= 0) return 'office';
  const h = hash01(cx, cz, level.levelSeed, 21) * 0.7 + hash01(Math.floor(cx / 2), Math.floor(cz / 2), level.levelSeed, 22) * 0.3;
  return h < 0.32 ? 'sewer' : 'office';
}

// ---------------------------------------------------------------- office chunk
function genOffice(c, ctx) {
  const { rng, ports } = ctx;
  const CE = 2.8;
  const T = (extra = {}) => ({ floor: 0, ceil: CE, fmat: 0, cmat: 0, ...extra });
  fillRect(c, 0, 0, CS - 1, CS - 1, 0);
  const zc = rng.int(5, 9), xc = rng.int(5, 9);
  carveRect(c, 0, zc, CS - 1, zc + 1, T());
  carveRect(c, xc, 0, xc + 1, CS - 1, T());
  const quads = [[0, 0, xc - 2, zc - 2], [xc + 3, 0, CS - 1, zc - 2], [0, zc + 3, xc - 2, CS - 1], [xc + 3, zc + 3, CS - 1, CS - 1]];
  const rooms = [];
  for (const [x0, z0, x1, z1] of quads) {
    const w = x1 - x0 + 1, h = z1 - z0 + 1;
    if (w < 3 || h < 3) continue;
    // split big quadrants into two rooms
    const parts = [];
    if (w >= 8 && rng.chance(0.6)) { const s = rng.int(x0 + 3, x1 - 3); parts.push([x0, z0, s - 1, z1], [s + 1, z0, x1, z1]); }
    else if (h >= 8 && rng.chance(0.6)) { const s = rng.int(z0 + 3, z1 - 3); parts.push([x0, z0, x1, s - 1], [x0, s + 1, x1, z1]); }
    else parts.push([x0, z0, x1, z1]);
    for (const [a, b, cc, d] of parts) {
      const rw = cc - a + 1, rh = d - b + 1;
      if (rw < 2 || rh < 2) continue;
      const big = rw * rh;
      const type = big >= 30 ? rng.weighted([['cubicles', 5], ['conference', 1], ['break', 1]]) : big >= 12 ? rng.weighted([['office', 3], ['conference', 1], ['utility', 2], ['break', 1]]) : rng.weighted([['office', 3], ['utility', 2]]);
      carveRect(c, a, b, cc, d, T({ flags: F_ROOM, ceil: type === 'conference' ? 3.0 : CE }));
      rooms.push({ type, x: a, z: b, w: rw, h: rh });
    }
  }
  // doorways from each room to the nearest corridor
  for (const r of rooms) {
    const cands = [];
    for (let x = r.x; x < r.x + r.w; x++) { cands.push([x, r.z - 1, 0, -1]); cands.push([x, r.z + r.h, 0, 1]); }
    for (let z = r.z; z < r.z + r.h; z++) { cands.push([r.x - 1, z, -1, 0]); cands.push([r.x + r.w, z, 1, 0]); }
    const ok = cands.filter(([x, z, dx, dz]) => {
      const bx = x + dx, bz = z + dz;
      if (x < 0 || z < 0 || x >= CS || z >= CS || bx < 0 || bz < 0 || bx >= CS || bz >= CS) return false;
      return c.type[z * CS + x] === T_SOLID && c.type[bz * CS + bx] === T_FLOOR && !(c.flags[bz * CS + bx] & F_ROOM);
    });
    const pickD = ok.length ? ok[rng.int(0, ok.length - 1)] : cands.find(([x, z]) => x > 0 && z > 0 && x < CS - 1 && z < CS - 1);
    if (!pickD) continue;
    const [dx, dz, nx, nz] = pickD;
    openTile(c, dx, dz, T({ flags: F_RESERVED }));
    r.door = { lx: dx, lz: dz, nx, nz };
  }
  openPorts(c, ports, () => T(), 1);
  for (const [px, pz] of portTiles(ports)) carveL(c, px, pz, xc, zc, T(), rng, 1);
  ensureConnected(c, ports, () => T());
  return rooms;
}

function dressOffice(c, ctx, rooms, def) {
  const { rng } = ctx;
  // ceiling panels on a grid in corridors and rooms
  for (let lz = 0; lz < CS; lz++) for (let lx = 0; lx < CS; lx++) {
    const i = lz * CS + lx;
    if (c.type[i] !== T_FLOOR || (c.flags[i] & F_LANDMARK)) continue;
    const tx = c.cx * CS + lx, tz = c.cz * CS + lz;
    if (tx % 2 !== 0 || tz % 2 !== 0) continue;
    const dark = hash01(Math.floor(tx / 6), Math.floor(tz / 6), ctx.seed, 5) < 0.18;
    if (dark && rng.chance(0.85)) { c.flags[i] |= F_DARK; continue; }
    const r = rng.next();
    addLight(c, { kind: 'panel', x: c.tx(lx), y: c.ceil[i] - 0.01, z: c.tz(lz), w: 1.2, d: 0.6, color: COOL, intensity: 4.2, range: 8, flicker: r < 0.1 ? rng.float(0.3, 0.9) : 0, broken: r > 0.95 });
  }
  const take = arr => (arr.length ? arr.splice(rng.int(0, arr.length - 1), 1)[0] : null);
  for (const r of rooms) {
    const x0 = c.x0 + r.x * TILE, z0 = c.z0 + r.z * TILE, W = r.w * TILE, H = r.h * TILE;
    const cx = x0 + W / 2, cz = z0 + H / 2;
    const spots = wallSpots(c, (lx, lz, i) => freeTile(c, i) && lx >= r.x && lx < r.x + r.w && lz >= r.z && lz < r.z + r.h);
    if (r.door && (r.type === 'office' || r.type === 'conference' || r.type === 'utility') && rng.chance(0.75)) {
      const d = r.door;
      const x = c.tx(d.lx), z = c.tz(d.lz);
      const along = d.nx !== 0 ? 'z' : 'x';
      const ry = along === 'z' ? Math.PI / 2 : 0;
      const o = addObject(c, { kind: 'door', x, y: 0, z, ry, mat: 'laminate' });
      o.collider = c.addCollider(along === 'x' ? x - 1 : x - 0.05, 0, along === 'z' ? z - 1 : z - 0.05, along === 'x' ? x + 1 : x + 0.05, 2.4, along === 'z' ? z + 1 : z + 0.05, false);
      o.collider.door = true;
    }
    if (r.type === 'cubicles') {
      // rows of 2x2 m cubicles with aisles
      for (let gz = r.z; gz + 1 < r.z + r.h; gz += 2) {
        for (let gx = r.x; gx + 1 < r.x + r.w; gx += 3) {
          if (rng.chance(0.15)) continue;
          const ox = c.x0 + gx * TILE + 1.5, oz = c.z0 + gz * TILE + 1.5;
          if (ox > x0 + W - 1.2 || oz > z0 + H - 1.2) continue;
          addProp(c, 'cubicleWall', ox, 0, oz - 1.45, 0, { len: 2.9 });
          addProp(c, 'cubicleWall', ox - 1.45, 0, oz, Math.PI / 2, { len: 2.9 });
          addProp(c, 'desk', ox - 0.1, 0, oz - 0.95, 0, { monitor: rng.chance(0.8), papers: rng.chance(0.6) });
          if (rng.chance(0.85)) addProp(c, rng.chance(0.8) ? 'officeChair' : 'fallenChair', ox + rng.float(-0.3, 0.3), 0, oz - 0.2, rng.float(-0.6, 0.6) + (rng.chance(0.2) ? Math.PI : 0));
          if (rng.chance(0.12)) addContainer(c, rng, 'cardboard', DESK_LOOT, ox + 0.6, 0, oz + 0.4, rng.float(0, 1), [1, 2]);
          if (rng.chance(0.15)) addPickup(c, rng, DESK_LOOT, ox - 0.4, 0.78, oz - 0.9);
          if (rng.chance(0.04)) addNote(c, rng.pick(def.notes), ox + 0.3, 0.78, oz - 0.95, rng.float(-0.4, 0.4));
        }
      }
    } else if (r.type === 'office') {
      const s = take(spots);
      if (s) { const p = wallPos(c, s, 0.6); addProp(c, 'desk', p.x, 0, p.z, yawFor(s.nx, s.nz) + Math.PI, { monitor: true, papers: true }); addProp(c, 'officeChair', p.x + s.nx * 0.9, 0, p.z + s.nz * 0.9, yawFor(s.nx, s.nz) + Math.PI); if (rng.chance(0.3)) addPickup(c, rng, DESK_LOOT, p.x - s.nz * 0.4, 0.78, p.z + s.nx * 0.4); }
      const s2 = take(spots); if (s2) { const p = wallPos(c, s2, 0.32); addContainer(c, rng, 'cabinet', DESK_LOOT, p.x, 0, p.z, yawFor(s2.nx, s2.nz), [1, 2]); }
      const s3 = take(spots); if (s3) { const p = wallPos(c, s3, 0.3); addProp(c, 'plant', p.x, 0, p.z, 0); }
      if (rng.chance(0.25)) { const s4 = take(spots); if (s4) { const p = wallPos(c, s4, 0.36); addLocker(c, p.x, 0, p.z, yawFor(s4.nx, s4.nz)); } }
      if (rng.chance(0.2)) addNote(c, rng.pick(def.notes), cx + 0.3, 0.004, cz, rng.float(0, 6));
    } else if (r.type === 'conference') {
      addProp(c, 'conferenceTable', cx, 0, cz, W > H ? 0 : Math.PI / 2);
      for (let k = -1; k <= 1; k++) for (const sd of [-1, 1]) {
        const a = W > H ? 0 : Math.PI / 2;
        const ox = Math.cos(a) * k * 1.1 - Math.sin(a) * sd * 1.05, oz = Math.sin(a) * k * 1.1 + Math.cos(a) * sd * 1.05;
        addProp(c, rng.chance(0.85) ? 'officeChair' : 'fallenChair', cx + ox, 0, cz + oz, a + (sd > 0 ? Math.PI : 0) + rng.float(-0.3, 0.3));
      }
      addProp(c, 'paperPile', cx + 0.5, 0.79, cz, 0);
    } else if (r.type === 'utility') {
      for (let k = 0; k < 3; k++) { const s = take(spots); if (s) { const p = wallPos(c, s, 0.3); addProp(c, rng.chance(0.5) ? 'shelf' : 'boxes', p.x, 0, p.z, yawFor(s.nx, s.nz)); } }
      const s = take(spots); if (s) { const p = wallPos(c, s, 0.4); addContainer(c, rng, 'toolbox', LOOT, p.x, 0, p.z, yawFor(s.nx, s.nz), [1, 2]); }
      addProp(c, 'bucket', cx, 0, cz, 0);
      if (rng.chance(0.4)) { const s2 = take(spots); if (s2) { const p = wallPos(c, s2, 0.36); addLocker(c, p.x, 0, p.z, yawFor(s2.nx, s2.nz)); } }
    } else if (r.type === 'break') {
      addProp(c, 'table', cx, 0, cz, 0);
      for (const [dx, dz, a] of [[-0.9, 0, Math.PI / 2], [0.9, 0, -Math.PI / 2]]) addProp(c, 'chair', cx + dx, 0, cz + dz, a);
      const s = take(spots); if (s) { const p = wallPos(c, s, 0.42); addProp(c, 'vending', p.x, 0, p.z, yawFor(s.nx, s.nz)); }
      const s2 = take(spots); if (s2) { const p = wallPos(c, s2, 0.32); addProp(c, 'waterCooler', p.x, 0, p.z, yawFor(s2.nx, s2.nz)); }
      const s3 = take(spots); if (s3) { const p = wallPos(c, s3, 0.36); addProp(c, 'copier', p.x, 0, p.z, yawFor(s3.nx, s3.nz)); }
      if (rng.chance(0.5)) addPickup(c, rng, LOOT, cx, 0.78, cz);
    }
  }
}

// ---------------------------------------------------------------- sewer chunk
function genSewer(c, ctx, zoneOf) {
  const { rng, ports, level } = ctx;
  fillRect(c, 0, 0, CS - 1, CS - 1, 1);
  const walk = { floor: SEWER_F, ceil: SEWER_C, fmat: 1, cmat: 1 };
  const chan = { floor: CH_F, ceil: SEWER_C, fmat: 1, cmat: 1, water: CH_W };
  const n = zoneOf(c.cx, c.cz - 1) === 'sewer', s = zoneOf(c.cx, c.cz + 1) === 'sewer';
  const w = zoneOf(c.cx - 1, c.cz) === 'sewer', e = zoneOf(c.cx + 1, c.cz) === 'sewer';
  // hub
  carveRect(c, 5, 5, 10, 10, { ...walk, ceil: 0.6, flags: F_ROOM });
  carveRect(c, 7, 5, 8, 10, { ...chan, ceil: 0.6 });
  carveRect(c, 5, 7, 10, 8, { ...chan, ceil: 0.6 });
  // tunnels to sewer neighbours (3 wide: walkway / channel / walkway)
  const tunnelZ = (x0, x1) => { carveRect(c, x0, 6, x1, 9, walk); carveRect(c, x0, 7, x1, 8, chan); };
  const tunnelX = (z0, z1) => { carveRect(c, 6, z0, 9, z1, walk); carveRect(c, 7, z0, 8, z1, chan); };
  if (w) tunnelZ(0, 5); if (e) tunnelZ(10, CS - 1); if (n) tunnelX(0, 5); if (s) tunnelX(10, CS - 1);
  // office-facing edges: corridor at floor 0 joining ports, then stairs down
  const sides = { n: !n, s: !s, w: !w, e: !e };
  for (const side of ['n', 's', 'w', 'e']) {
    if (!sides[side]) continue;
    const list = ports[side];
    if (!list.length) continue;
    const top = { floor: 0, ceil: 2.6, fmat: 2, cmat: 1 };
    const idx = list.flatMap(p => Array.from({ length: p.w }, (_, j) => p.i + j));
    const lo = Math.min(7, ...idx), hi = Math.max(7, ...idx);
    // tile mapping: along = index along edge, depth = distance from edge
    const T = (along, depth) => side === 'n' ? [along, depth] : side === 's' ? [along, CS - 1 - depth] : side === 'w' ? [depth, along] : [CS - 1 - depth, along];
    for (const i of idx) { const [x, z] = T(i, 0); openTile(c, x, z, top); }
    for (let a = lo; a <= hi; a++) { const [x, z] = T(a, 1); openTile(c, x, z, top); }
    // stairs at along=7: depth 2 and 3
    const dir = side === 'n' ? 3 : side === 's' ? 1 : side === 'w' ? 2 : 0; // rises toward the edge
    const [ax, az] = T(7, 2), [bx, bz] = T(7, 3);
    openTile(c, ax, az, { floor: -1.75, ceil: 2.2, fmat: 2, cmat: 1, flags: F_RESERVED });
    openTile(c, bx, bz, { floor: SEWER_F, ceil: 0.5, fmat: 2, cmat: 1, flags: F_RESERVED });
    c.ramp[az * CS + ax] = dir; c.rampH[az * CS + ax] = 1.75;
    c.ramp[bz * CS + bx] = dir; c.rampH[bz * CS + bx] = 1.75;
    for (let d = 4; d <= 5; d++) { const [x, z] = T(7, d); if (c.type[z * CS + x] !== T_FLOOR) openTile(c, x, z, walk); }
    c.meta.stairs = c.meta.stairs || [];
    c.meta.stairs.push({ x: c.tx(ax), z: c.tz(az) });
  }
  return { n, s, w, e };
}

function dressSewer(c, ctx, def, isKey) {
  const { rng } = ctx;
  // lamps along tunnel walls
  for (let lz = 0; lz < CS; lz++) for (let lx = 0; lx < CS; lx++) {
    const i = lz * CS + lx;
    if (c.type[i] !== T_FLOOR || c.floor[i] !== SEWER_F) continue;
    const tx = c.cx * CS + lx, tz = c.cz * CS + lz;
    if ((tx * 7 + tz * 3) % 5 !== 0) continue;
    const sides = [[0, -1], [0, 1], [-1, 0], [1, 0]].filter(([dx, dz]) => { const x = lx + dx, z = lz + dz; return x >= 0 && z >= 0 && x < CS && z < CS && c.type[z * CS + x] === T_SOLID; });
    if (!sides.length) continue;
    const [dx, dz] = sides[0];
    addLight(c, { kind: 'cage', x: c.tx(lx) + dx * 0.88, y: SEWER_F + 2.2, z: c.tz(lz) + dz * 0.88, nx: -dx, nz: -dz, color: SEWER_LAMP, intensity: 6, range: 10, flicker: rng.chance(0.2) ? rng.float(0.3, 0.8) : 0, broken: rng.chance(0.1) });
    if (rng.chance(0.5)) addProp(c, 'sewerPipe', c.tx(lx) + dx * 0.75, SEWER_C - 0.3, c.tz(lz) + dz * 0.75, dx ? Math.PI / 2 : 0, { len: 2.05 });
  }
  // the hub junction gets a hanging work lamp
  addLight(c, { kind: 'bulb', cord: 0.5, shade: true, x: c.x0 + 8 * TILE, y: 0.6 - 0.6, z: c.z0 + 8 * TILE, color: [0.9, 1, 0.7], intensity: 5, range: 11, flicker: rng.chance(0.4) ? 0.35 : 0 });
  // stair landings get a light
  for (const st of c.meta.stairs || []) addLight(c, { kind: 'cage', x: st.x, y: 1.9, z: st.z, nx: 0, nz: 0, color: SEWER_LAMP, intensity: 2.5, range: 6 });
  c.meta.drips = [];
  for (let k = 0; k < 4; k++) c.meta.drips.push({ x: c.x0 + rng.float(10, 22), z: c.z0 + rng.float(10, 22), y: SEWER_C, t: rng.float(0, 3) });
  // loot on walkways
  const spots = wallSpots(c, (lx, lz, i) => freeTile(c, i) && c.floor[i] === SEWER_F);
  const take = arr => (arr.length ? arr.splice(rng.int(0, arr.length - 1), 1)[0] : null);
  if (rng.chance(0.6)) { const s = take(spots); if (s) { const p = wallPos(c, s, 0.4); addPickup(c, rng, LOOT, p.x, SEWER_F, p.z); } }
  if (rng.chance(0.35)) { const s = take(spots); if (s) { const p = wallPos(c, s, 0.4); addContainer(c, rng, 'crate', PUMP_LOOT, p.x, SEWER_F, p.z, yawFor(s.nx, s.nz), [1, 2]); } }
  if (rng.chance(0.15)) { const s = take(spots); if (s) { const p = wallPos(c, s, 0.3); addNote(c, rng.pick(def.notes), p.x, SEWER_F + 0.005, p.z, rng.float(0, 6)); } }
  const ws = wallSpots(c, (lx, lz, i) => c.floor[i] === SEWER_F);
  for (let k = rng.int(0, 2); k > 0 && ws.length; k--) { const s = rng.pick(ws), p = wallPos(c, s); addDecal(c, { name: rng.pick(['drip', 'stain', 'scratch', 'hand']), x: p.x, y: SEWER_F + rng.float(0.6, 2), z: p.z, nx: s.nx, ny: 0, nz: s.nz, size: rng.float(0.8, 1.3) }); }
  // the pump room with the fuse
  if (isKey) {
    // carve a side room off the hub
    const side = rng.int(0, 3);
    const rect = [[1, 1, 4, 4], [11, 1, 14, 4], [1, 11, 4, 14], [11, 11, 14, 14]][side];
    carveRect(c, rect[0], rect[1], rect[2], rect[3], { floor: SEWER_F, ceil: 0.2, fmat: 1, cmat: 1, flags: F_ROOM | F_RESERVED });
    const ccx = (rect[0] + rect[2]) >> 1, ccz = (rect[1] + rect[3]) >> 1;
    carveL(c, ccx, ccz, 7, 7, { floor: SEWER_F, ceil: SEWER_C, fmat: 1, cmat: 1 }, rng, 1);
    // re-cut channel crossing so the hub stays wet
    const cxw = c.x0 + (rect[0] + rect[2] + 1) / 2 * TILE, czw = c.z0 + (rect[1] + rect[3] + 1) / 2 * TILE;
    addProp(c, 'machine', cxw - 1.5, SEWER_F, czw - 1.2, 0, { w: 1.6 });
    addProp(c, 'tank', cxw + 1.6, SEWER_F, czw + 1.4, 0);
    addObject(c, { kind: 'pickup', item: 'fuse', qty: 1, x: cxw + 0.3, y: SEWER_F, z: czw + 0.2, ry: 0.5 });
    addNote(c, 'l2_a', cxw - 0.5, SEWER_F + 0.005, czw + 0.6, 0.3);
    addContainer(c, rng, 'toolbox', PUMP_LOOT, cxw + 1.2, SEWER_F, czw - 1.4, 0, [2, 3]);
    addLight(c, { kind: 'bulb', cord: 0.4, x: cxw, y: 0.2 - 0.5, z: czw, color: [1, 0.85, 0.6], intensity: 4, range: 8, flicker: 0.25 });
    addDecal(c, { name: 'text2', x: cxw, y: SEWER_F + 0.005, z: czw - 0.8, nx: 0, ny: 1, nz: 0, size: 1.3, rot: 0 });
  }
}

export default {
  id: 'L2',
  name: 'Level 2',
  title: 'Offices & Sewers',
  next: 'L3',
  objective: 'Restore power to the STAIRWELL. A fuse is kept in a sewer pump room.',
  objectiveText(game) {
    if (game.world.flag('L2', 'power')) return 'Power restored. Get to the STAIRWELL door.';
    return game.inventory.has('fuse') ? 'You have a fuse. Find the STAIRWELL and its fuse box.' : 'Find a fuse in the sewer pump rooms (take the stairs down), then power the STAIRWELL.';
  },
  subtitle: 'Somewhere below the carpet, water is running.',
  palette: {
    floor: [{ mat: 'officeCarpet', scale: 2 }, { mat: 'sewerFloor', scale: 2.5 }, { mat: 'concrete', scale: 3, stairMat: 'concrete' }, { mat: 'black', scale: 2 }],
    wall: [{ mat: 'drywall', scaleU: 2.4, scaleV: 2.8, trim: 'trim', trimH: 0.1 }, { mat: 'sewerBrick', scaleU: 2.4, scaleV: 2.4, vBase: 'abs' }],
    ceil: [{ mat: 'ceilingTile', scale: 2 }, { mat: 'concrete', scale: 3 }],
    ledge: { mat: 'sewerBrick', scale: 2.4 },
    soffit: { mat: 'concrete', scaleU: 3, scaleV: 3 },
  },
  materials: ['officeCarpet', 'drywall', 'trim', 'ceilingTile', 'lightPanel', 'sewerFloor', 'sewerBrick', 'concrete', 'fabric', 'laminate', 'plastic', 'plasticDark', 'monitorOff', 'paper', 'darkMetal', 'paintedMetal', 'chrome', 'cardboard', 'woodCrate', 'rustMetal', 'glass', 'glowWhite', 'glowRed', 'glowAmber', 'glowGreen', 'bulbWarm', 'hazard', 'black', 'rubber', 'pillarPaint'],
  ambient: [0.022, 0.026, 0.03],
  bakeGain: 0.085,
  exposure: 1.15,
  fog: { color: 0x0b0f12, density: 0.05 },
  background: 0x05070a,
  grade: { lift: [0.0, 0.01, 0.02], gamma: [1.02, 1.0, 0.98], gain: [0.95, 1.0, 1.06], saturation: 0.78, tint: [0.95, 1, 1.04], vignette: 0.55, grain: 0.05, bloomStrength: 0.5, bloomThreshold: 0.82 },
  hemi: { sky: 0x3a4450, ground: 0x0a0c0e, intensity: 0.16 },
  dust: { color: 0xdfe8ff, opacity: 0.25 },
  waterMat: 'water',
  waterFog: 0.25, waterFogColor: 0x1a2412,
  portConfig: { min: 1, max: 3, wMin: 1, wMax: 2 },
  ambience: 'offices',
  notes: ['l2_a', 'l2_b', 'l2_c', 'l2_d', 'l2_e', 'gen_a', 'gen_c'],
  decalTexts: ['STAIRWELL', 'LIGHT ITS SKULL', 'DON\'T PICK UP', 'IT FOLLOWS'],
  entities: { primary: 'inkwalker', max: 1, spawnCd: 75, minDist: 28, maxDist: 44, rare: ['lookalike'] },
  eventSounds: ['phoneRing', 'knock', 'distantThud', 'inkStep', 'scrape', 'whisper'],

  landmarks(level) {
    const exit = placeLandmark(level, 'L2exit', 45, 75);
    const ea = Math.atan2(exit.tz - 8, exit.tx - 8);
    const key = placeLandmark(level, 'L2key', 28, 44, [ea + 1.2, ea + 2.6]);
    return [{ type: 'spawn', tx: 8, tz: 8 }, { type: 'exit', ...exit }, { type: 'key', ...key }];
  },

  setupScene(game) {
    const env = makeEnvMap(game.engine.renderer, 0x2a3328, 0x1a2015, 0x050605);
    game.lib.register('water', makeWaterMaterial(game.lib, { color: 0x2c3a1e, opacity: 0.88, envMap: env, envIntensity: 0.6, normalScale: 0.25, flow: 1.6 }));
  },

  generate(c, ctx) {
    const { rng, level, landmarks } = ctx;
    const zoneOf = (cx, cz) => zoneFor(level, cx, cz);
    const zone = zoneOf(c.cx, c.cz);
    c.meta.zone = zone;
    const isKey = landmarks.some(l => l.type === 'key');
    if (zone === 'sewer') {
      genSewer(c, ctx, zoneOf);
      dressSewer(c, ctx, this, isKey);
    } else {
      const rooms = genOffice(c, ctx);
      for (const lm of landmarks) {
        const lx = Math.max(3, Math.min(CS - 4, lm.lx)), lz = Math.max(3, Math.min(CS - 4, lm.lz));
        if (lm.type === 'spawn') carveRect(c, lx - 1, lz - 1, lx + 1, lz + 1, { floor: 0, ceil: 2.8, fmat: 0, cmat: 0, flags: F_RESERVED });
        if (lm.type === 'exit') this.buildStairwell(c, ctx, lx, lz);
      }
      ensureConnected(c, ctx.ports, () => ({ floor: 0, ceil: 2.8, fmat: 0, cmat: 0 }));
      dressOffice(c, ctx, rooms.filter(r => !r.removed), this);
      // spawn: a note on the floor where you land
      if (landmarks.some(l => l.type === 'spawn')) addNote(c, 'l2_b', c.tx(8) + 0.6, 0.004, c.tz(8) + 0.4, 0.8);
      // stairs down marked on office walls near sewer access
      const exitL = level.byType.exit;
      const exitW = { x: (exitL.tx + 0.5) * TILE, z: (exitL.tz + 0.5) * TILE };
      const ws = wallSpots(c, (lx, lz, i) => !(c.flags[i] & F_ROOM));
      if (rng.chance(0.45)) addWayfinding(c, rng, ws, exitW, { name: 'arrow2' });
      if (rng.chance(0.25) && ws.length) { const s = rng.pick(ws), p = wallPos(c, s); addDecal(c, { name: rng.pick(['text1', 'text2', 'text3', 'hand', 'eye']), x: p.x, y: rng.float(1.1, 1.7), z: p.z, nx: s.nx, ny: 0, nz: s.nz, size: 0.9 }); }
      // ink trails
      for (let k = rng.int(0, 2); k > 0; k--) {
        const lx = rng.int(0, CS - 1), lz = rng.int(0, CS - 1), i = lz * CS + lx;
        if (c.type[i] !== T_FLOOR) continue;
        addDecal(c, { name: rng.pick(['blood', 'footprints', 'stain']), x: c.tx(lx), y: 0.005, z: c.tz(lz), nx: 0, ny: 1, nz: 0, size: rng.float(0.9, 1.8), rot: rng.float(0, 6.28) });
      }
      for (let k = rng.int(0, 2); k > 0; k--) {
        const lx = rng.int(0, CS - 1), lz = rng.int(0, CS - 1), i = lz * CS + lx;
        if (!freeTile(c, i)) continue;
        addPickup(c, rng, LOOT, c.tx(lx) + rng.float(-0.5, 0.5), 0, c.tz(lz) + rng.float(-0.5, 0.5));
      }
    }
  },

  buildStairwell(c, ctx, lx, lz) {
    const { rng } = ctx;
    fillRect(c, lx - 3, lz - 3, lx + 3, lz + 3, 0);
    carveRect(c, lx - 2, lz - 2, lx + 2, lz + 1, { floor: 0, ceil: 3.0, fmat: 2, cmat: 1, flags: F_ROOM | F_RESERVED | F_LANDMARK });
    // entrance from the south
    for (let z = lz + 2; z < Math.min(CS, lz + 8); z++) openTile(c, lx, z, { floor: 0, ceil: 2.8, fmat: 0, cmat: 0, flags: F_RESERVED });
    // stair tile behind the north wall
    const bx = lx, bz = lz - 3;
    openTile(c, bx, bz, { floor: -1.7, ceil: 3.0, fmat: 2, cmat: 1, flags: F_LANDMARK | F_DARK });
    c.ramp[bz * CS + bx] = 1; c.rampH[bz * CS + bx] = 1.7;
    const x = c.tx(lx), zWall = c.z0 + (lz - 2) * TILE;
    const door = addObject(c, { kind: 'stairDoor', x, y: 0, z: zWall + 0.04, ry: 0 });
    door.collider = c.addCollider(x - 1, 0, zWall - 0.1, x + 1, 3, zWall + 0.1, false);
    addObject(c, { kind: 'fusebox', x: x + 1.6, y: 0, z: zWall + 0.02, ry: 0 });
    addProp(c, 'fuseBoxProp', x + 1.6, 0, zWall, 0);
    addObject(c, { kind: 'exit', x: c.tx(bx), y: -0.6, z: c.tz(bz), r: 1.2, to: 'L3', requires: 'stairOpen' });
    addDecal(c, { name: 'text0', x: x - 1.8, y: 1.9, z: zWall + 0.01, nx: 0, ny: 0, nz: 1, size: 1.2 });
    addLight(c, { kind: 'cage', x: x - 1.0, y: 2.7, z: zWall + 0.12, nx: 0, nz: 1, color: [1, 0.3, 0.2], intensity: 3, range: 7, flicker: 0.4 });
    addLight(c, { kind: 'panel', x, y: 2.99, z: zWall + 3, w: 1.2, d: 0.6, color: COOL, intensity: 3.5, range: 7, flicker: 0.5 });
    addNote(c, 'l2_d', x - 2.4, 0.004, zWall + 2.5, 0.3);
    addProp(c, 'fallenChair', x + 2.5, 0, zWall + 3, 1.2);
  },

  interact(game, o, s) {
    if (o.kind === 'fusebox' && !s?.on) {
      if (game.inventory.has('fuse')) {
        game.inventory.consume('fuse', 1);
        game.request({ t: 'int', l: 'L2', id: o.id, a: 'fuse' });
        game.sfx('unlock', o, {});
      } else { game.sfx('doorLocked', o, {}); game.subtitle('The socket is empty. You need an industrial fuse.', 2); }
    } else if (o.kind === 'stairDoor' && !s?.open) {
      if (game.world.flag('L2', 'power')) game.request({ t: 'int', l: 'L2', id: o.id, a: 'open' });
      else { game.sfx('doorLocked', o, {}); game.subtitle('The door\'s magnetic lock is dead. No power.', 2); }
    }
  },

  hostInteract(game, pid, o, s, m) {
    if (o.kind === 'fusebox' && m.a === 'fuse' && !s.on) {
      game.hostBroadcast({ t: 'os', l: 'L2', id: o.id, s: { on: true } });
      game.hostBroadcast({ t: 'flag', l: 'L2', k: 'power', v: true });
      game.hostEvent('L2', { k: 'sound', name: 'metalDoor', x: o.x, y: 1.5, z: o.z, volume: 0.7 });
      game.hostEvent('L2', { k: 'subtitle', text: 'Relays thunk. Somewhere a lock disengages with a buzz.', dur: 3 });
      // light the door lamp
      const door = game.getLevel('L2').chunk(Math.floor(o.x / 32), Math.floor(o.z / 32)).objects.find(d => d.kind === 'stairDoor');
      if (door) game.hostBroadcast({ t: 'os', l: 'L2', id: door.id, s: { powered: true } });
    } else if (o.kind === 'stairDoor' && m.a === 'open' && game.world.flag('L2', 'power')) {
      game.hostBroadcast({ t: 'os', l: 'L2', id: o.id, s: { open: true, powered: true } });
      game.hostBroadcast({ t: 'flag', l: 'L2', k: 'stairOpen', v: true });
      if (o.collider) o.collider.disabled = true;
    }
  },

  onFlag(game, l, k) {
    if (l === 'L2' && k === 'stairOpen') for (const ch of game.getLevel('L2').chunks.values()) for (const o of ch.objects) if (o.kind === 'stairDoor' && o.collider) o.collider.disabled = true;
  },

  setPiece(game, levelId, ctx, p) {
    const lvl = ctx.level;
    const ch = lvl.chunk(Math.floor(p.x / 32), Math.floor(p.z / 32));
    const doors = ch.objects.filter(o => o.kind === 'door' && game.world.get(levelId, o.id)?.open && Math.hypot(o.x - p.x, o.z - p.z) > 4);
    if (!doors.length) return false;
    const o = doors[Math.floor(Math.random() * doors.length)];
    game.hostBroadcast({ t: 'os', l: levelId, id: o.id, s: { ...(game.world.get(levelId, o.id) || {}), open: false } });
    if (o.collider) o.collider.disabled = false;
    game.hostEvent(levelId, { k: 'sound', name: 'doorClose', x: o.x, y: 1, z: o.z, volume: 1.4 });
    return true;
  },

  // entities open office doors they walk into
  hostUpdate(game, ctx) {
    for (const e of game.entities.byLevel('L2')) {
      if (e.state === 'dead' || (e.speedNow || 0) < 0.3) continue;
      const ch = ctx.level.chunk(Math.floor(e.x / 32), Math.floor(e.z / 32));
      for (const o of ch.objects) {
        if (o.kind !== 'door') continue;
        if (Math.hypot(o.x - e.x, o.z - e.z) > 1.6) continue;
        const s = game.world.get('L2', o.id);
        if (!s?.open) { game.hostBroadcast({ t: 'os', l: 'L2', id: o.id, s: { ...(s || {}), open: true } }); if (o.collider) o.collider.disabled = true; }
      }
    }
  },

  clientUpdate(game, dt) {
    const P = game.player.pos;
    const ch = game.level.chunks.get(Math.floor(P.x / 32) + ',' + Math.floor(P.z / 32));
    if (!ch?.meta.drips) return;
    for (const d of ch.meta.drips) {
      d.t -= dt;
      if (d.t <= 0) {
        d.t = 1.5 + Math.random() * 3;
        game.effects.spawn({ x: d.x, y: d.y - 0.05, z: d.z, vy: -1, grav: 9.8, life: 0.5, size: 0.03, r: 0.6, g: 0.7, b: 0.5, a: 0.8, floor: SEWER_F });
        setTimeout(() => game.sfx('drip', { x: d.x, y: SEWER_F, z: d.z }, { volume: 0.8 }), 350);
      }
    }
  },
};
