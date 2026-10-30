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
import { addLight, addDecal, addObject, addPickup, addContainer, addNote, addLocker, wallSpots, wallPos, yawFor, freeTile, addWayfinding, addHatchExit, addLevelDoor, sideExitAt, nearestExit, addPortArrow } from './common.js';
import { hash01 } from '../../core/rng.js';
import { registerObjectKind } from '../../game/objects.js';
import { makeWaterMaterial, makeEnvMap } from '../../gfx/water.js';

const SEWER_F = -3.5, SEWER_C = -0.5, CH_F = -4.3, CH_W = -3.8;
const COOL = [0.82, 0.9, 1.0], SEWER_LAMP = [0.72, 0.85, 0.5], PANEL_I = 3.0;
const VEND_GOODS = [['snackBar', 5], ['energyDrink', 3], ['cleanWater', 3], ['dirtyWater', 1]];

const LOOT = [
  ['dirtyWater', 14], ['cleanWater', 10], ['purifier', 5, [1, 2]], ['wire', 5], ['antenna', 2], ['gpsBoard', 2], ['snackBar', 14], ['energyDrink', 6], ['battery', 18, [1, 2]], ['bandage', 12], ['painkillers', 8],
  ['glowstick', 10, [1, 2]], ['ammo9', 10, [6, 12]], ['shells', 5, [2, 4]], ['decoy', 4], ['pistol', 2], ['knife', 3], ['ductTape', 4], [null, 16],
];
const DESK_LOOT = [
  ['battery', 22, [1, 2]], ['snackBar', 14], ['painkillers', 10], ['dirtyWater', 10], ['scrap', 5], ['ammo9', 8, [5, 10]], ['glowstick', 8], ['bandage', 8],
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
  if (sewerMain(level, cx, cz)) return 'sewer';
  const h = hash01(cx, cz, level.levelSeed, 21) * 0.7 + hash01(Math.floor(cx / 2), Math.floor(cz / 2), level.levelSeed, 22) * 0.3;
  return h < 0.28 ? 'sewer' : 'office';
}

// Long straight sewer mains run under the floors every few chunks, so the
// tunnels go on for a long way instead of forming small pockets.
function sewerMain(level, cx, cz) {
  const s = level.levelSeed;
  const ox = Math.floor(hash01(s, 31) * 5), oz = Math.floor(hash01(s, 32) * 5);
  if (((cz - oz) % 5 + 5) % 5 === 0 && hash01(Math.floor(cx / 6), cz, s, 33) < 0.7) return true;
  if (((cx - ox) % 5 + 5) % 5 === 0 && hash01(cx, Math.floor(cz / 6), s, 34) < 0.7) return true;
  return false;
}

// Dark office zones: whole blocks of chunks where the lights are dead.
function darkZone(level, cx, cz) {
  if (Math.abs(cx) + Math.abs(cz) <= 1) return false;
  return hash01(Math.floor(cx / 2), Math.floor(cz / 2), level.levelSeed, 41) < 0.2;
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
      const type = big >= 30 ? rng.weighted([['cubicles', 5], ['conference', 1], ['break', 1], ['storage', 1.5], ['maintenance', 1.2]]) : big >= 12 ? rng.weighted([['office', 3], ['conference', 1], ['utility', 2], ['break', 1.3]]) : rng.weighted([['office', 3], ['utility', 2]]);
      const ceil = type === 'conference' ? 3.0 : type === 'storage' || type === 'maintenance' ? 3.6 : CE;
      carveRect(c, a, b, cc, d, T({ flags: F_ROOM, ceil, fmat: type === 'maintenance' ? 2 : 0, cmat: type === 'storage' || type === 'maintenance' ? 1 : 0 }));
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
  const { rng, level } = ctx;
  const dz = c.meta.darkZone = darkZone(level, c.cx, c.cz) && !ctx.landmarks.length;
  const industrial = (lx, lz) => rooms.some(r => (r.type === 'storage' || r.type === 'maintenance') && lx >= r.x && lx < r.x + r.w && lz >= r.z && lz < r.z + r.h);
  // ceiling panels on a grid in corridors and rooms
  for (let lz = 0; lz < CS; lz++) for (let lx = 0; lx < CS; lx++) {
    const i = lz * CS + lx;
    if (c.type[i] !== T_FLOOR || (c.flags[i] & F_LANDMARK) || c.floor[i] !== 0) continue;
    const tx = c.cx * CS + lx, tz = c.cz * CS + lz;
    if (dz) c.flags[i] |= F_DARK;
    if (tx % 2 !== 0 || tz % 2 !== 0 || industrial(lx, lz)) continue;
    if (dz) {
      // a dead floor: the odd tube still stutters
      if (rng.chance(0.03)) addLight(c, { kind: 'panel', x: c.tx(lx), y: c.ceil[i] - 0.01, z: c.tz(lz), w: 1.2, d: 0.6, color: COOL, intensity: PANEL_I * 0.8, range: 7, flicker: rng.float(0.7, 0.95) });
      continue;
    }
    const dark = hash01(Math.floor(tx / 6), Math.floor(tz / 6), ctx.seed, 5) < 0.18;
    if (dark && rng.chance(0.85)) { c.flags[i] |= F_DARK; continue; }
    const r = rng.next();
    addLight(c, { kind: 'panel', x: c.tx(lx), y: c.ceil[i] - 0.01, z: c.tz(lz), w: 1.2, d: 0.6, color: COOL, intensity: PANEL_I, range: 8, flicker: r < 0.1 ? rng.float(0.3, 0.9) : 0, broken: r > 0.95 });
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
    if (r.door && r.type !== 'cubicles' && rng.chance(0.6)) officeSign(c, r, rng);
    if (r.type === 'cubicles') {
      // rows of 2x2 m cubicles with aisles
      for (let gz = r.z; gz + 1 < r.z + r.h; gz += 2) {
        for (let gx = r.x; gx + 1 < r.x + r.w; gx += 3) {
          if (rng.chance(0.15)) continue;
          const ox = c.x0 + gx * TILE + 1.5, oz = c.z0 + gz * TILE + 1.5;
          if (ox > x0 + W - 1.2 || oz > z0 + H - 1.2) continue;
          addProp(c, 'cubicleWall', ox, 0, oz - 1.45, 0, { len: 2.9 });
          addProp(c, 'cubicleWall', ox - 1.45, 0, oz, Math.PI / 2, { len: 2.9 });
          const mon = rng.chance(0.8);
          addProp(c, 'desk', ox - 0.1, 0, oz - 0.95, 0, { monitor: mon, papers: rng.chance(0.6) });
          if (mon && rng.chance(0.22)) addComputer(c, rng, ox - 0.1, oz - 0.95, 0, { x: ox - 0.1, z: oz - 0.2 });
          if (rng.chance(0.85)) addProp(c, rng.chance(0.8) ? 'officeChair' : 'fallenChair', ox + rng.float(-0.3, 0.3), 0, oz - 0.2, rng.float(-0.6, 0.6) + (rng.chance(0.2) ? Math.PI : 0));
          if (rng.chance(0.12)) addContainer(c, rng, 'cardboard', DESK_LOOT, ox + 0.6, 0, oz + 0.4, rng.float(0, 1), [1, 2]);
          if (rng.chance(0.15)) addPickup(c, rng, DESK_LOOT, ox - 0.4, 0.78, oz - 0.9);
          if (rng.chance(0.04)) addNote(c, rng.pick(def.notes), ox + 0.3, 0.78, oz - 0.95, rng.float(-0.4, 0.4));
        }
      }
    } else if (r.type === 'office') {
      const s = take(spots);
      if (s) {
        const p = wallPos(c, s, 0.6), R = yawFor(s.nx, s.nz) + Math.PI;
        addProp(c, 'desk', p.x, 0, p.z, R, { monitor: true, papers: true });
        addProp(c, 'officeChair', p.x + s.nx * 0.9, 0, p.z + s.nz * 0.9, R);
        if (rng.chance(0.75)) addComputer(c, rng, p.x, p.z, R, { x: p.x + s.nx * 0.85, z: p.z + s.nz * 0.85 });
        if (rng.chance(0.3)) addPickup(c, rng, DESK_LOOT, p.x - s.nz * 0.4, 0.78, p.z + s.nx * 0.4);
      }
      if (rng.chance(0.3)) { const sp = take(spots); if (sp) { const p = wallPos(c, sp, 0.0); addObject(c, { kind: 'phone', x: p.x, y: 0, z: p.z, ry: yawFor(sp.nx, sp.nz) }); } }
      const s2 = take(spots); if (s2) { const p = wallPos(c, s2, 0.32); addContainer(c, rng, 'cabinet', DESK_LOOT, p.x, 0, p.z, yawFor(s2.nx, s2.nz), [1, 2]); }
      const s3 = take(spots); if (s3) { const p = wallPos(c, s3, 0.3); addProp(c, 'plant', p.x, 0, p.z, 0); }
      if (rng.chance(0.25)) { const s4 = take(spots); if (s4) { const p = wallPos(c, s4, 0.36); addLocker(c, p.x, 0, p.z, yawFor(s4.nx, s4.nz)); } }
      if (rng.chance(0.2)) addNote(c, rng.pick(def.notes), cx + 0.3, 0.004, cz, rng.float(0, 6));
    } else if (r.type === 'conference') {
      addProp(c, 'conferenceTable', cx, 0, cz, W > H ? 0 : Math.PI / 2);
      for (let k = -1; k <= 1; k++) for (const sd of [-1, 1]) {
        if (rng.chance(0.12)) continue;
        // along the table's long axis k, out from its long edge by sd
        const ox = W > H ? k * 1.1 : sd * 1.22, oz = W > H ? sd * 1.22 : k * 1.1;
        const px = W > H ? 0 : ox, pz = W > H ? oz : 0;
        addProp(c, rng.chance(0.88) ? 'officeChair' : 'fallenChair', cx + ox, 0, cz + oz, Math.atan2(px, pz) + rng.float(-0.25, 0.25));
      }
      if (rng.chance(0.5)) { const sp = take(spots); if (sp) { const p = wallPos(c, sp, 0.0); addObject(c, { kind: 'phone', x: p.x, y: 0, z: p.z, ry: yawFor(sp.nx, sp.nz) }); } }
      addProp(c, 'paperPile', cx + 0.5, 0.79, cz, 0);
    } else if (r.type === 'utility') {
      for (let k = 0; k < 3; k++) { const s = take(spots); if (s) { const p = wallPos(c, s, 0.3); addProp(c, rng.chance(0.5) ? 'shelf' : 'boxes', p.x, 0, p.z, yawFor(s.nx, s.nz)); } }
      const s = take(spots); if (s) { const p = wallPos(c, s, 0.4); addContainer(c, rng, 'toolbox', LOOT, p.x, 0, p.z, yawFor(s.nx, s.nz), [1, 2]); }
      addProp(c, 'bucket', cx, 0, cz, 0);
      if (rng.chance(0.4)) { const s2 = take(spots); if (s2) { const p = wallPos(c, s2, 0.36); addLocker(c, p.x, 0, p.z, yawFor(s2.nx, s2.nz)); } }
    } else if (r.type === 'break') {
      addProp(c, 'table', cx, 0, cz, 0);
      for (const [dx, dz, a] of [[-1.15, 0, -Math.PI / 2], [1.15, 0, Math.PI / 2], [0, 0.85, 0]]) if (rng.chance(0.85)) addProp(c, 'chair', cx + dx, 0, cz + dz, a + rng.float(-0.2, 0.2));
      const s = take(spots); if (s) { const p = wallPos(c, s, 0.43); addVendor(c, rng, p.x, 0, p.z, yawFor(s.nx, s.nz)); }
      if (rng.chance(0.4)) { const s4 = take(spots); if (s4) { const p = wallPos(c, s4, 0.43); addVendor(c, rng, p.x, 0, p.z, yawFor(s4.nx, s4.nz)); } }
      if (rng.chance(0.45)) { const sp = take(spots); if (sp) { const p = wallPos(c, sp, 0.0); addObject(c, { kind: 'phone', x: p.x, y: 0, z: p.z, ry: yawFor(sp.nx, sp.nz) }); } }
      const s2 = take(spots); if (s2) { const p = wallPos(c, s2, 0.32); addProp(c, 'waterCooler', p.x, 0, p.z, yawFor(s2.nx, s2.nz)); }
      const s3 = take(spots); if (s3) { const p = wallPos(c, s3, 0.36); addProp(c, 'copier', p.x, 0, p.z, yawFor(s3.nx, s3.nz)); }
      if (rng.chance(0.5)) addPickup(c, rng, LOOT, cx, 0.78, cz);
    } else if (r.type === 'storage') {
      // long shelving rows with aisles; boxes and crates worth opening
      const alongX = W >= H;
      const len = (alongX ? W : H) - 2.4, rows = Math.floor(((alongX ? H : W) - 1.2) / 2.4);
      for (let k = 0; k < rows; k++) {
        const off = -((rows - 1) * 2.4) / 2 + k * 2.4;
        if (len < 2) break;
        addProp(c, 'storageShelf', alongX ? cx : cx + off, 0, alongX ? cz + off : cz, alongX ? 0 : Math.PI / 2, { len: Math.min(len, 9) });
        if (rng.chance(0.55)) { const t = rng.float(-0.4, 0.4) * len; addContainer(c, rng, rng.chance(0.6) ? 'cardboard' : 'crate', LOOT, alongX ? cx + t : cx + off + 1.15, 0, alongX ? cz + off + 1.15 : cz + t, rng.float(0, 6), [1, 2]); }
      }
      for (let k = 0; k < 2; k++) { const s2 = take(spots); if (s2) { const p = wallPos(c, s2, 0.36); addProp(c, 'boxes', p.x, 0, p.z, yawFor(s2.nx, s2.nz)); } }
      for (let k = 0; k < Math.max(1, rows); k++) addLight(c, { kind: 'cage', x: cx + (alongX ? rng.float(-2, 2) : 0), y: 3.5, z: cz + (alongX ? 0 : rng.float(-2, 2)), nx: 0, nz: 0, color: [1, 0.92, 0.75], intensity: 3.2, range: 10, flicker: rng.chance(0.2) ? 0.5 : 0, broken: c.meta.darkZone });
      if (rng.chance(0.25)) addNote(c, rng.pick(def.notes), cx + 0.6, 0.004, cz + 1.0, rng.float(0, 6));
    } else if (r.type === 'maintenance') {
      // boiler / pump plant: machines along the walls, pipes overhead
      const used = [];
      for (const [prop, inset, opt] of [['machine', 0.7, { w: 1.6 }], ['tank', 0.85], ['generator', 0.8], ['lathe', 0.5], ['workbench', 0.45]]) {
        if (rng.chance(0.25)) continue;
        const s2 = take(spots); if (!s2 || used.some(u => Math.abs(u.lx - s2.lx) + Math.abs(u.lz - s2.lz) < 2)) continue;
        used.push(s2);
        const p = wallPos(c, s2, inset);
        addProp(c, prop, p.x, 0, p.z, yawFor(s2.nx, s2.nz), opt);
      }
      for (let k = 0; k < 3; k++) addProp(c, 'sewerPipe', cx + (W > H ? 0 : (k - 1) * 1.4), 3.1, cz + (W > H ? (k - 1) * 1.4 : 0), W > H ? 0 : Math.PI / 2, { len: (W > H ? W : H) - 0.4 });
      const s3 = take(spots); if (s3) { const p = wallPos(c, s3, 0.4); addContainer(c, rng, 'toolbox', PUMP_LOOT, p.x, 0, p.z, yawFor(s3.nx, s3.nz), [1, 2]); }
      if (rng.chance(0.5)) { const s4 = take(spots); if (s4) { const p = wallPos(c, s4, 0.36); addLocker(c, p.x, 0, p.z, yawFor(s4.nx, s4.nz)); } }
      if (rng.chance(0.5)) { const sp = take(spots); if (sp) { const p = wallPos(c, sp, 0.0); addObject(c, { kind: 'phone', x: p.x, y: 0, z: p.z, ry: yawFor(sp.nx, sp.nz) }); } }
      addLight(c, { kind: 'cage', x: cx, y: 3.5, z: cz, nx: 0, nz: 0, color: [1, 0.75, 0.45], intensity: 3.5, range: 10, flicker: rng.chance(0.35) ? 0.4 : 0, broken: c.meta.darkZone && rng.chance(0.7) });
      addDecal(c, { name: 'stain', x: cx + rng.float(-1, 1), y: 0.005, z: cz + rng.float(-1, 1), nx: 0, ny: 1, nz: 0, size: 1.6, rot: rng.float(0, 6) });
    }
  }
}

// Office number plate beside a room's door, on the corridor side.
function officeSign(c, r, rng) {
  const d = r.door;
  const px = Math.abs(d.nz), pz = Math.abs(d.nx);
  for (const side of [1, -1]) {
    const wx = d.lx + px * side, wz = d.lz + pz * side, fx = wx + d.nx, fz = wz + d.nz;
    if (wx < 0 || wz < 0 || wx >= CS || wz >= CS || fx < 0 || fz < 0 || fx >= CS || fz >= CS) continue;
    if (c.type[wz * CS + wx] !== T_SOLID || c.type[fz * CS + fx] !== T_FLOOR) continue;
    const n = 200 + Math.floor(hash01(c.cx, c.cz, d.lx * 16 + d.lz, 61) * 99);
    const text = r.type === 'utility' ? 'UTILITY' : r.type === 'conference' ? `CONF ${String.fromCharCode(65 + (n % 6))}` : r.type === 'storage' ? `STORE ${n % 20}` : r.type === 'maintenance' ? 'PLANT' : r.type === 'break' ? 'BREAK RM' : String(n);
    const x = c.tx(d.lx) + d.nx * (TILE / 2 + 0.012) + px * side * 1.35, z = c.tz(d.lz) + d.nz * (TILE / 2 + 0.012) + pz * side * 1.35;
    addObject(c, { kind: 'sign', text, x, y: 0, z, ry: yawFor(d.nx, d.nz), size: text.length > 4 ? 34 : 50, h: 1.62 });
    return;
  }
}

// A desk computer: a glowing screen you can sit down at.
function addComputer(c, rng, dx, dz, R, seat) {
  // monitor sits at desk-local (-0.15, -0.12)
  const lx = -0.15, lz = -0.12;
  const x = dx + lx * Math.cos(R) + lz * Math.sin(R), z = dz - lx * Math.sin(R) + lz * Math.cos(R);
  const yaw = Math.atan2(-(x - seat.x), -(z - seat.z));
  return addObject(c, { kind: 'computer', x, y: 0, z, ry: R, infected: rng.chance(0.22), seat: { x: seat.x, z: seat.z, yaw } });
}

// A vending machine with a few things left in it — once in a while, a pale bottle.
function addVendor(c, rng, x, y, z, ry) {
  const stock = rng.int(2, 5);
  const goods = [];
  for (let k = 0; k < stock; k++) goods.push(rng.weighted(VEND_GOODS));
  if (rng.chance(0.3)) goods[rng.int(0, stock - 1)] = 'paleDraught';
  const shelf = [...new Set(goods)];
  const o = addObject(c, { kind: 'vendor', x, y, z, ry, stock, goods, shelf, label: 'vending machine', color: rng.pick([0x8a2a24, 0x24448a, 0x2a2a2a]) });
  const side = Math.abs(Math.sin(ry)) > 0.5;
  const hx = side ? 0.42 : 0.47, hz = side ? 0.47 : 0.42;
  c.addCollider(x - hx, y, z - hz, x + hx, y + 1.95, z + hz, true);
  return o;
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
    const A = 6; // the way down lands on the hub walkway, not in the channel
    const lo = Math.min(A, ...idx), hi = Math.max(A, ...idx);
    // tile mapping: along = index along edge, depth = distance from edge
    const T = (along, depth) => side === 'n' ? [along, depth] : side === 's' ? [along, CS - 1 - depth] : side === 'w' ? [depth, along] : [CS - 1 - depth, along];
    for (const i of idx) { const [x, z] = T(i, 0); openTile(c, x, z, top); }
    for (let a = lo; a <= hi; a++) { const [x, z] = T(a, 1); openTile(c, x, z, top); }
    const [ax, az] = T(A, 2), [bx, bz] = T(A, 3);
    c.meta.stairs = c.meta.stairs || [];
    if (hash01(c.cx, c.cz, level.levelSeed, side.charCodeAt(0)) < 0.3) {
      // stairs: depth 2 and 3
      const dir = side === 'n' ? 3 : side === 's' ? 1 : side === 'w' ? 2 : 0; // rises toward the edge
      openTile(c, ax, az, { floor: -1.75, ceil: 2.2, fmat: 2, cmat: 1, flags: F_RESERVED });
      openTile(c, bx, bz, { floor: SEWER_F, ceil: 0.5, fmat: 2, cmat: 1, flags: F_RESERVED });
      c.ramp[az * CS + ax] = dir; c.rampH[az * CS + ax] = 1.75;
      c.ramp[bz * CS + bx] = dir; c.rampH[bz * CS + bx] = 1.75;
      c.meta.stairs.push({ x: c.tx(ax), z: c.tz(az) });
    } else {
      // a ladder hole: an open shaft at depth 2 dropping to the walkway
      openTile(c, ax, az, { floor: SEWER_F, ceil: 2.6, fmat: 2, cmat: 1, flags: F_RESERVED });
      openTile(c, bx, bz, { ...walk, flags: F_RESERVED });
      const [tx0, tz0] = T(A, 1);
      // ladder bolted to the shaft wall on the side away from the hub channel
      const [wx, wz] = T(A - 1, 2);
      const px = (wx - ax), pz = (wz - az);
      const lx = c.tx(ax) + px * 0.86, lz = c.tz(az) + pz * 0.86;
      const [ex, ez] = T(A, 0);
      const inYaw = Math.atan2(-(c.tx(bx) - c.tx(ax)), -(c.tz(bz) - c.tz(az)));
      const upYaw = Math.atan2(-(c.tx(ex) - c.tx(ax)), -(c.tz(ez) - c.tz(az)));
      addObject(c, { kind: 'ladder', x: lx, y: SEWER_F, z: lz, ry: yawFor(-px, -pz), visual: true, len: -SEWER_F + 1.1, up: true, dest: { x: c.tx(tx0), y: 0, z: c.tz(tz0), yaw: upYaw } });
      addObject(c, { kind: 'ladder', x: c.tx(tx0) + (c.tx(ax) - c.tx(tx0)) * 0.55, y: 0, z: c.tz(tz0) + (c.tz(az) - c.tz(tz0)) * 0.55, ry: 0, up: false, dest: { x: c.tx(ax) - px * 0.2, y: SEWER_F, z: c.tz(az) - pz * 0.2, yaw: inYaw } });
      c.meta.stairs.push({ x: c.tx(ax), z: c.tz(az), ladder: true });
    }
    for (let d = 4; d <= 5; d++) { const [x, z] = T(A, d); if (c.type[z * CS + x] !== T_FLOOR) openTile(c, x, z, walk); }
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
  for (const st of c.meta.stairs || []) addLight(c, { kind: 'cage', x: st.x, y: st.ladder ? 2.5 : 1.9, z: st.z, nx: 0, nz: 0, color: SEWER_LAMP, intensity: st.ladder ? 3 : 2.5, range: st.ladder ? 8 : 6 });
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
  let pumpSide = -1;
  if (isKey) {
    // carve a side room off the hub
    const side = pumpSide = rng.int(0, 3);
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
  // now and then a rusted door off the tunnels, to somebody's old room
  if (rng.chance(0.3)) {
    const order = [0, 1, 2, 3].sort(() => rng.next() - 0.5);
    for (const corner of order) if (corner !== pumpSide && rustRoom(c, rng, corner, def)) break;
  }
}

// A small rusted room behind a door in one corner of a sewer chunk.
function rustRoom(c, rng, corner, def) {
  const mx = corner & 1, mz = corner >> 1;
  const X = x => (mx ? CS - 1 - x : x), Z = z => (mz ? CS - 1 - z : z);
  const room = []; for (let z = 1; z <= 3; z++) for (let x = 1; x <= 3; x++) room.push([x, z]);
  const path = [[2, 4], [2, 5], [3, 5], [4, 5]];
  // everything around must still be rock (no stairs, tunnels or other rooms)
  for (let z = 0; z <= 4; z++) for (let x = 0; x <= 4; x++) if (c.type[Z(z) * CS + X(x)] !== T_SOLID) return false;
  for (const [x, z] of path.slice(1)) if (c.type[Z(z) * CS + X(x)] !== T_SOLID) return false;
  if (c.type[Z(5) * CS + X(5)] !== T_FLOOR) return false;
  const roomT = { floor: SEWER_F, ceil: SEWER_F + 2.9, fmat: 1, cmat: 1, flags: F_ROOM };
  for (const [x, z] of room) openTile(c, X(x), Z(z), roomT);
  openTile(c, X(2), Z(4), { floor: SEWER_F, ceil: SEWER_F + 2.45, fmat: 1, cmat: 1, flags: F_RESERVED });
  for (const [x, z] of path.slice(1)) openTile(c, X(x), Z(z), { floor: SEWER_F, ceil: SEWER_C, fmat: 1, cmat: 1, flags: F_RESERVED });
  // rusted plate walls
  for (let z = 0; z <= 4; z++) for (let x = 0; x <= 4; x++) { const i = Z(z) * CS + X(x); if (c.type[i] === T_SOLID) c.wmat[i] = 2; }
  const dx = c.tx(X(2)), dz = c.tz(Z(4));
  const o = addObject(c, { kind: 'door', x: dx, y: SEWER_F, z: dz, ry: 0, mat: 'rustMetal' });
  o.collider = c.addCollider(dx - 1, SEWER_F, dz - 0.05, dx + 1, SEWER_F + 2.4, dz + 0.05, false);
  o.collider.door = true;
  const cx = c.tx(X(2)), cz = c.tz(Z(2));
  const at = (u, v) => [cx + (mx ? -u : u), cz + (mz ? -v : v)];
  if (rng.chance(0.55)) {
    // someone lived here
    const [bx, bz] = at(-1.6, -0.6); addProp(c, 'camp', bx, SEWER_F, bz, 0);
    const [kx, kz] = at(1.5, -1.6); addContainer(c, rng, 'backpack', LOOT, kx, SEWER_F, kz, rng.float(0, 6), [2, 3]);
    for (let k = 0; k < 3; k++) { const [tx, tz] = at(rng.float(-2, 2), -2.9); addDecal(c, { name: 'tally', x: tx, y: SEWER_F + rng.float(0.8, 1.8), z: tz, nx: 0, ny: 0, nz: mz ? -1 : 1, size: 0.8 }); }
    addNote(c, rng.pick(def.notes), cx + 0.4, SEWER_F + 0.005, cz + 0.3, rng.float(0, 6));
  } else {
    // an old valve room
    const [mx0, mz0] = at(-1.2, -1.9); addProp(c, 'machine', mx0, SEWER_F, mz0, mz ? Math.PI : 0, { w: 1.6 });
    const [tx, tz] = at(1.7, 1.0); addProp(c, 'tank', tx, SEWER_F, tz, 0);
    const [kx, kz] = at(1.6, -1.8); addContainer(c, rng, 'crate', PUMP_LOOT, kx, SEWER_F, kz, 0, [1, 3]);
    addProp(c, 'sewerPipe', cx, SEWER_F + 2.5, cz, 0, { len: 5.6 });
  }
  addLight(c, { kind: 'bulb', cord: 0.3, x: cx, y: SEWER_F + 2.9 - 0.35, z: cz, color: [1, 0.7, 0.45], intensity: 2.6, range: 7, flicker: rng.chance(0.5) ? 0.45 : 0, broken: rng.chance(0.2) });
  addDecal(c, { name: 'drip', x: dx + 1.2, y: SEWER_F + 1.6, z: dz + (mz ? -1 : 1) * 1.01, nx: 0, ny: 0, nz: mz ? -1 : 1, size: 1 });
  return true;
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
    wall: [{ mat: 'drywall', scaleU: 2.4, scaleV: 2.8, trim: 'trim', trimH: 0.1 }, { mat: 'sewerBrick', scaleU: 2.4, scaleV: 2.4, vBase: 'abs' }, { mat: 'rustMetal', scaleU: 2, scaleV: 2, vBase: 'abs' }],
    ceil: [{ mat: 'ceilingTile', scale: 2 }, { mat: 'concrete', scale: 3 }],
    ledge: { mat: 'sewerBrick', scale: 2.4 },
    soffit: { mat: 'concrete', scaleU: 3, scaleV: 3 },
  },
  materials: ['officeCarpet', 'drywall', 'trim', 'ceilingTile', 'lightPanel', 'sewerFloor', 'sewerBrick', 'concrete', 'fabric', 'laminate', 'plastic', 'plasticDark', 'monitorOff', 'paper', 'darkMetal', 'paintedMetal', 'chrome', 'cardboard', 'woodCrate', 'rustMetal', 'glass', 'glowWhite', 'glowRed', 'glowAmber', 'glowGreen', 'bulbWarm', 'hazard', 'black', 'rubber', 'pillarPaint'],
  ambient: [0.02, 0.024, 0.028],
  bakeGain: 0.1,
  dynGain: 1.3,
  exposure: 1.08,
  fog: { color: 0x0b0f12, density: 0.05 },
  background: 0x05070a,
  grade: { lift: [0.0, 0.01, 0.02], gamma: [1.02, 1.0, 0.98], gain: [0.95, 1.0, 1.06], saturation: 0.78, tint: [0.95, 1, 1.04], vignette: 0.55, grain: 0.05, bloomStrength: 0.38, bloomThreshold: 0.85 },
  hemi: { sky: 0x3a4450, ground: 0x0a0c0e, intensity: 0.16 },
  dust: { color: 0xdfe8ff, opacity: 0.25 },
  waterMat: 'water',
  waterFog: 0.25, waterFogColor: 0x1a2412,
  portConfig: { min: 1, max: 3, wMin: 1, wMax: 2 },
  ambience: 'offices',
  notes: ['l2_a', 'l2_b', 'l2_c', 'l2_d', 'l2_e', 'gen_a', 'gen_c', 'lore_tuff'],
  decalTexts: ['STAIRWELL', 'LIGHT ITS SKULL', 'DON\'T PICK UP', 'IT FOLLOWS'],
  entities: {
    primary: 'inkwalker', max: 1, spawnCd: 75, minDist: 28, maxDist: 44, rare: ['lookalike'],
    // the sewers are where they come from: a second one hunts down there
    secondary: [{ type: 'inkwalker', max: 1, spawnCd: 110, chance: 0, boost: ctx => ctx.players.some(p => p.y < -2) }],
  },
  exitStyle: 'emergency',
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

  sideExit: { p: 0.07, minR: 2 },

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
      const goal = nearestExit(level, c.x0 + 16, c.z0 + 16);
      const ws = wallSpots(c, (lx, lz, i) => !(c.flags[i] & F_ROOM));
      if (!addPortArrow(c, rng, ctx.ports, goal, { count: 1 }) && rng.chance(0.5)) addWayfinding(c, rng, ws, goal, { name: 'arrow' });
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
    // the alternate way on: a door marked LEVEL 3, wherever this chunk holds a side exit
    const floorY = zone === 'sewer' ? SEWER_F : 0;
    if (sideExitAt(level, c.cx, c.cz) && !addLevelDoor(c, level, rng, 'L3', { p: 1, minR: 0, salt: 1201, floor: floorY, label: 'LEVEL 3', near: sideExitAt(level, c.cx, c.cz) }))
      addHatchExit(c, level, { label: zone === 'sewer' ? 'manhole' : 'access hatch', mat: zone === 'sewer' ? 'rustMetal' : 'paintedMetal' });
    // and rarely, one back to the Lobby
    addLevelDoor(c, level, rng, 'L0', { p: 0.03, minR: 3, salt: 1301, floor: floorY, label: 'LEVEL 0' });
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
