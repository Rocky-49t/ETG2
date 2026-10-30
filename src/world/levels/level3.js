// Level 3 — Pool Rooms. Endless white-tiled halls, pools of impossibly clear
// water, flooded corridors and skylights onto a sky that isn't there.
// Exit: the MAIN DRAIN at the bottom of the deepest pool, unlocked with the
// drain valve key from a pump room.
import * as THREE from 'three';
import { TILE, CS, T_SOLID, T_FLOOR, F_ROOM, F_DARK, F_RESERVED, F_LANDMARK, NO_WATER } from '../chunk.js';
import { openPorts, ensureConnected, carveRect, fillRect, openTile, carveL, portTiles } from '../gen.js';
import { placeLandmark } from '../level.js';
import { addProp, registerProps, LIGHT_VISUALS } from '../props.js';
import { addLight, addDecal, addObject, addPickup, addContainer, addNote, addLocker, wallSpots, wallPos, yawFor, freeTile, addWayfinding, addVignette, addLevelDoor, sideExitAt, nearestExit, addPortArrow, clearArea } from './common.js';
import { hash01 } from '../../core/rng.js';
import { registerObjectKind } from '../../game/objects.js';
import { makeWaterMaterial, makeEnvMap } from '../../gfx/water.js';
import { worldUniforms } from '../../gfx/materials.js';

const WL = -0.25; // water level everywhere in this level
const WHITE = [0.9, 0.97, 1.0], DEEPBLUE = [0.62, 0.8, 1.0];
const STAIR = { side: 6, band: 1.6, rise: 0.25, steps: 8, H: 30 };

const LOOT = [
  ['cleanWater', 14], ['dirtyWater', 10], ['blueberryFireSalts', 12], ['purifier', 4, [1, 2]], ['cloth', 5], ['snackBar', 12], ['cannedBeans', 6], ['battery', 14, [1, 2]], ['bandage', 12], ['medkit', 3], ['painkillers', 8],
  ['glowstick', 10, [1, 3]], ['ammo9', 8, [6, 12]], ['shells', 6, [2, 5]], ['decoy', 5], ['energyDrink', 6], [null, 14],
];

registerProps({
  tilePillar: {
    colliders: [[-0.45, 0, -0.45, 0.45, 12, 0.45]],
    build(p, B) { B.box('poolTile', 0, (p.h || 6) / 2, 0, 0.9, p.h || 6, 0.9, 1); B.box('poolTileBlue', 0, 0.15, 0, 0.94, 0.3, 0.94, 1); },
  },
  poolLadder: {
    colliders: null,
    build(p, B) {
      const d = p.depth || 2;
      for (const sx of [-0.22, 0.22]) { B.tube('chrome', sx, -d, 0.15, sx, 0.6, 0.15, 0.025, 6); B.tube('chrome', sx, 0.6, 0.15, sx, 0.75, -0.25, 0.025, 6); B.tube('chrome', sx, 0.75, -0.25, sx, 0.0, -0.45, 0.025, 6); }
      for (let y = -d + 0.3; y < 0; y += 0.3) B.box('chrome', 0, y, 0.15, 0.44, 0.03, 0.06, 0.3);
    },
  },
  lifeguard: {
    colliders: [[-0.5, 0, -0.5, 0.5, 2.2, 0.5]],
    build(p, B) {
      for (const sx of [-0.4, 0.4]) for (const sz of [-0.4, 0.4]) B.tube('chrome', sx, 0, sz, sx * 0.6, 1.8, sz * 0.6, 0.03, 6);
      B.box('laminate', 0, 1.8, 0, 0.6, 0.05, 0.5, 0.5);
      B.box('laminate', 0, 2.1, -0.24, 0.6, 0.6, 0.04, 0.5);
      for (let y = 0.4; y < 1.8; y += 0.35) B.box('chrome', 0, y, 0.33, 0.6, 0.03, 0.04, 0.3);
    },
  },
  lounger: {
    colliders: [[-0.35, 0, -1.0, 0.35, 0.45, 1.0]],
    navBlock: false,
    build(p, B) {
      B.box('plastic', 0, 0.35, 0.2, 0.65, 0.05, 1.3, 0.5);
      B.setTransform(p.x, p.y + 0.35, p.z, p.ry);
      const m = B.M.clone(); const r = new (m.constructor)().makeRotationX(-0.6); m.multiply(r); B.setMatrix(m);
      B.box('plastic', 0, 0.0, -0.4, 0.65, 0.05, 0.8, 0.5);
      B.setTransform(p.x, p.y, p.z, p.ry);
      for (const sx of [-0.28, 0.28]) for (const sz of [-0.6, 0.8]) B.box('chrome', sx, 0.17, sz, 0.03, 0.34, 0.03, 0.2);
    },
  },
  floatRing: {
    // a proper life ring: four red/white bands, a grab line looped round it
    colliders: null,
    build(p, B) {
      for (let k = 0; k < 4; k++) {
        const g = new THREE.TorusGeometry(0.32, 0.095, 10, 10, Math.PI / 2);
        g.rotateZ(k * Math.PI / 2 + (p.alt ? Math.PI / 4 : 0));
        g.rotateX(Math.PI / 2);
        B.geometry(k % 2 ? 'ringWhite' : 'ringRed', g, null);
      }
      const rope = new THREE.TorusGeometry(0.33, 0.012, 4, 40);
      rope.rotateX(Math.PI / 2); rope.translate(0, 0.07, 0);
      B.geometry('rope', rope, null);
      for (let k = 0; k < 4; k++) {
        const a = k * Math.PI / 2 + Math.PI / 4;
        const loop = new THREE.TorusGeometry(0.1, 0.012, 4, 10);
        loop.rotateY(-a); loop.translate(Math.cos(a) * 0.32, 0, Math.sin(a) * 0.32);
        B.geometry('rope', loop, null);
      }
    },
  },
  poolRail: {
    // chrome handrail along a pool or ledge edge (len along local x)
    colliders: p => [[-(p.len || 2) / 2, 0, -0.05, (p.len || 2) / 2, 1.05, 0.05]],
    navBlock: false,
    build(p, B) {
      const len = p.len || 2;
      for (let x = -len / 2 + 0.1; x <= len / 2 - 0.09; x += (len - 0.2) / Math.max(1, Math.round(len - 0.2))) B.tube('railSteel', x, 0, 0, x, 1.0, 0, 0.022, 6);
      B.tube('railSteel', -len / 2 + 0.1, 1.0, 0, len / 2 - 0.1, 1.0, 0, 0.026, 6);
      B.tube('railSteel', -len / 2 + 0.1, 0.55, 0, len / 2 - 0.1, 0.55, 0, 0.018, 6);
    },
  },
  spiralStair: {
    // square spiral staircase climbing round a tiled core inside a 6 m shaft:
    // flights along each wall, landings in the corners
    colliders: p => spiralParts(p.h || STAIR.H).boxes,
    build(p, B) {
      const { boxes, top } = spiralParts(p.h || STAIR.H);
      const S = STAIR.side, half = S / 2, core = half - STAIR.band;
      for (const b of boxes) {
        if (b.core) { B.box('poolTile', 0, b[4] / 2, 0, core * 2, b[4], core * 2, 1); continue; }
        const w = b[3] - b[0], d = b[5] - b[2];
        B.box(b.land ? 'poolTileBlue' : 'poolTile', (b[0] + b[3]) / 2, b[4] - 0.15, (b[2] + b[5]) / 2, w, 0.3, d, 1);
        B.box('chrome', (b[0] + b[3]) / 2, b[4] + 0.004, (b[2] + b[5]) / 2, w * 0.98, 0.008, d * 0.98, 0.3);
      }
      // handrail on the core, a band of blue tile every turn
      for (let y = 1; y < top; y += 2) B.box('poolTileBlue', 0, y, 0, core * 2 + 0.02, 0.18, core * 2 + 0.02, 0.4);
    },
  },
});

// Stair geometry (prop-local, origin at the shaft centre). Each step is a
// slab collider; the player walks round and up. Returns {boxes, top, land}.
function spiralParts(H) {
  const S = STAIR.side, half = S / 2, band = STAIR.band, rise = STAIR.rise, n = STAIR.steps;
  const boxes = [];
  const core = [-(half - band), 0, -(half - band), half - band, H + 3, half - band];
  core.core = true; boxes.push(core);
  // walk the band clockwise: corners NW -> NE -> SE -> SW
  const corners = [[-half, -half], [half - band, -half], [half - band, half - band], [-half, half - band]];
  let y = 0, k = 0, lastLanding = null;
  while (y + rise * n <= H) {
    const [cx, cz] = corners[k % 4];
    const land = [cx, y - 0.3, cz, cx + band, y, cz + band]; land.land = true;
    if (y > 0) boxes.push(land);
    lastLanding = { x: cx + band / 2, z: cz + band / 2, y, side: k % 4 };
    // flight from this corner to the next
    const tread = (S - 2 * band) / n;
    for (let s = 0; s < n; s++) {
      const top = y + rise * (s + 1);
      let b;
      if (k % 4 === 0) b = [-half + band + s * tread, top - 0.3, -half, -half + band + (s + 1) * tread, top, -half + band];
      else if (k % 4 === 1) b = [half - band, top - 0.3, -half + band + s * tread, half, top, -half + band + (s + 1) * tread];
      else if (k % 4 === 2) b = [half - band - (s + 1) * tread, top - 0.3, half - band, half - band - s * tread, top, half];
      else b = [-half, top - 0.3, half - band - (s + 1) * tread, -half + band, top, half - band - s * tread];
      boxes.push(b);
    }
    y += rise * n; k++;
  }
  const [cx, cz] = corners[k % 4];
  const land = [cx, y - 0.3, cz, cx + band, y, cz + band]; land.land = true; boxes.push(land);
  lastLanding = { x: cx + band / 2, z: cz + band / 2, y, side: k % 4 };
  return { boxes, top: y, land: lastLanding };
}

// Hatch in the ceiling at the top of the spiral staircase.
registerObjectKind('roofHatch', {
  build(o, game) {
    const g = new THREE.Group();
    const frame = game.lib.dyn('darkMetal');
    for (const [x, z, w, d] of [[0, -0.6, 1.3, 0.1], [0, 0.6, 1.3, 0.1], [-0.6, 0, 0.1, 1.3], [0.6, 0, 0.1, 1.3]]) { const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.1, d), frame); m.position.set(x, 2.55, z); g.add(m); }
    const lid = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.06, 1.1), game.lib.dyn('paintedMetal')); lid.position.set(0, 2.58, 0); g.add(lid);
    const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.025, 6, 14), game.lib.dyn('chrome')); wheel.rotation.x = Math.PI / 2; wheel.position.set(0, 2.5, 0); g.add(wheel);
    // a short ladder up to it
    for (const sx of [-0.22, 0.22]) { const r = new THREE.Mesh(new THREE.BoxGeometry(0.04, 2.6, 0.04), frame); r.position.set(sx, 1.3, 0.62); g.add(r); }
    for (let y = 0.3; y < 2.5; y += 0.3) { const r = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.44, 5), frame); r.rotation.z = Math.PI / 2; r.position.set(0, y, 0.62); g.add(r); }
    return g;
  },
  prompt: () => 'Climb through the hatch',
  radius: 1.1, centerY: 1.6,
});

LIGHT_VISUALS.skylight = (l, B) => {
  const w = l.w || 4, d = l.d || 4;
  B.quad('skyGlow', [l.x - w / 2, l.y, l.z - d / 2], [l.x + w / 2, l.y, l.z - d / 2], [l.x + w / 2, l.y, l.z + d / 2], [l.x - w / 2, l.y, l.z + d / 2], [0, -1, 0]);
  for (let k = 1; k < 4; k++) {
    B.box('darkMetal', l.x - w / 2 + k * w / 4, l.y - 0.06, l.z, 0.08, 0.12, d, 0.5);
    B.box('darkMetal', l.x, l.y - 0.06, l.z - d / 2 + k * d / 4, w, 0.12, 0.08, 0.5);
  }
};
LIGHT_VISUALS.strip = (l, B, mat = 'glowWhite') => {
  B.box('poolTile', l.x, l.y + 0.03, l.z, 0.3, 0.06, l.d || 2, 0.5);
  B.box(mat, l.x, l.y - 0.01, l.z, 0.12, 0.03, (l.d || 2) - 0.1, 0.5);
};

registerObjectKind('drainGrate', {
  build(o, game) {
    const g = new THREE.Group();
    const pivot = new THREE.Group(); pivot.position.set(-0.95, 0, 0);
    const mat = game.lib.dyn('chrome');
    for (let i = 0; i < 9; i++) { const bar = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.06, 0.05), mat); bar.position.set(0.95, 0.03, -0.9 + i * 0.225); pivot.add(bar); }
    for (const x of [0.05, 0.95, 1.85]) { const bar = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.08, 1.9), mat); bar.position.set(x, 0.04, 0); pivot.add(bar); }
    const valve = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.025, 6, 14), game.lib.dyn('glowRed'));
    valve.rotation.x = Math.PI / 2; valve.position.set(0.95, 0.12, 0); pivot.add(valve);
    g.add(pivot);
    g.userData.pivot = pivot; g.userData.valve = valve;
    return g;
  },
  prompt(o, s, game) {
    if (s?.open) return null;
    return game.inventory.has('drainKey') ? 'Unlock the main drain' : 'Main drain — locked valve';
  },
  radius: 1.3, centerY: 0.1,
  animate(mesh, o, s, dt) {
    const k = mesh.userData.k = (mesh.userData.k ?? 0) + ((s?.open ? 1 : 0) - (mesh.userData.k ?? 0)) * Math.min(1, dt * 1.5);
    mesh.userData.pivot.rotation.z = k * 1.9;
    mesh.userData.valve.rotation.z += (s?.open ? 0 : 0.3) * dt;
  },
});

function zoneFor(level, cx, cz) {
  const by = level.byType;
  const inChunk = l => l && Math.floor(l.tx / CS) === cx && Math.floor(l.tz / CS) === cz;
  if (inChunk(by.exit)) return 'deep';
  if (inChunk(by.key)) return 'corridors';
  if (cx === 0 && cz === 0) return 'hall';
  // the blue halls: whole districts of darker, deeper pools
  if (Math.max(Math.abs(cx), Math.abs(cz)) > 1 && hash01(Math.floor(cx / 3), Math.floor(cz / 3), level.levelSeed, 35) < 0.22) return 'blue';
  const h = hash01(cx, cz, level.levelSeed, 31) * 0.65 + hash01(Math.floor(cx / 2), Math.floor(cz / 2), level.levelSeed, 32) * 0.35;
  return h < 0.45 ? 'hall' : h < 0.75 ? 'corridors' : 'flooded';
}

function carvePool(c, x0, z0, x1, z1, depth, rng, opts = {}) {
  for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
    const i = z * CS + x;
    if (c.type[i] !== T_FLOOR) continue;
    c.floor[i] = -depth; c.water[i] = WL; c.fmat[i] = 1; c.flags[i] |= F_RESERVED;
  }
  // steps at one end
  if (opts.steps !== false && depth <= 3) {
    const alongX = x1 - x0 >= z1 - z0;
    const n = Math.ceil(depth / 1.3);
    const rise = depth / n;
    for (let k = 0; k < n; k++) {
      if (alongX) {
        const x = x0 + k;
        for (let z = z0; z <= z1; z++) { const i = z * CS + x; c.floor[i] = -depth + rise * (n - 1 - k); c.ramp[i] = 2; c.rampH[i] = rise; }
      } else {
        const z = z0 + k;
        for (let x = x0; x <= x1; x++) { const i = z * CS + x; c.floor[i] = -depth + rise * (n - 1 - k); c.ramp[i] = 3; c.rampH[i] = rise; }
      }
    }
  }
}

// Chrome rails along some edges of a pool (never the steps end).
function railPool(c, rng, x0, z0, x1, z1, steps) {
  const alongX = x1 - x0 >= z1 - z0;
  const dry = (x, z) => x >= 0 && z >= 0 && x < CS && z < CS && c.type[z * CS + x] === T_FLOOR && c.floor[z * CS + x] === 0 && c.ramp[z * CS + x] < 0;
  const sides = [['n', 0, -1], ['s', 0, 1], ['w', -1, 0], ['e', 1, 0]];
  for (const [side, dx, dz] of sides) {
    if (steps && (alongX ? side === 'w' : side === 'n')) continue;
    if (!rng.chance(0.6)) continue;
    const gap = rng.int(0, 3);
    const len = dx ? z1 - z0 + 1 : x1 - x0 + 1;
    for (let k = 0; k < len; k++) {
      if (k === gap) continue; // a way in
      const px = dx ? (dx < 0 ? x0 : x1) : x0 + k, pz = dz ? (dz < 0 ? z0 : z1) : z0 + k;
      if (!dry(px + dx, pz + dz)) continue;
      const wx = c.x0 + (px + 0.5) * TILE + dx * (TILE / 2 + 0.07), wz = c.z0 + (pz + 0.5) * TILE + dz * (TILE / 2 + 0.07);
      addProp(c, 'poolRail', wx, 0, wz, dx ? Math.PI / 2 : 0, { len: TILE });
    }
  }
}

// A raised tiled ledge with a stair and railings, inside a hall.
function raisedLedge(c, rng, ceil) {
  const H = 1.75;
  for (let tries = 0; tries < 8; tries++) {
    const w = rng.int(2, 4), h = rng.int(3, 5);
    const x0 = rng.int(2, CS - 3 - w), z0 = rng.int(2, CS - 3 - h);
    let ok = true;
    for (let z = z0 - 1; z <= z0 + h && ok; z++) for (let x = x0 - 1; x <= x0 + w && ok; x++) {
      const i = z * CS + x;
      if (c.type[i] !== T_FLOOR || c.floor[i] !== 0 || (c.flags[i] & F_RESERVED) || c.ramp[i] >= 0) ok = false;
    }
    if (!ok) continue;
    for (let z = z0; z < z0 + h; z++) for (let x = x0; x < x0 + w; x++) { const i = z * CS + x; c.floor[i] = H; c.fmat[i] = 1; c.flags[i] |= F_RESERVED; }
    // a stair tile on the south side, rising north onto the ledge
    const sx = x0 + rng.int(0, w - 1), sz = z0 + h;
    const si = sz * CS + sx;
    c.floor[si] = 0; c.ramp[si] = 3; c.rampH[si] = H; c.flags[si] |= F_RESERVED;
    // railings on the open edges (not where the stair arrives)
    for (let z = z0; z < z0 + h; z++) for (let x = x0; x < x0 + w; x++) {
      for (const [dx, dz] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
        const nx = x + dx, nz = z + dz;
        if (nx >= x0 && nx < x0 + w && nz >= z0 && nz < z0 + h) continue;
        if (nx === sx && nz === sz) continue;
        if (c.type[nz * CS + nx] !== T_FLOOR) continue;
        addProp(c, 'poolRail', c.x0 + (x + 0.5) * TILE + dx * (TILE / 2 - 0.08), H, c.z0 + (z + 0.5) * TILE + dz * (TILE / 2 - 0.08), dx ? Math.PI / 2 : 0, { len: TILE });
      }
    }
    // a few things up there: a lounger, the lifeguard's kit
    const cx = c.x0 + (x0 + w / 2) * TILE, cz = c.z0 + (z0 + h / 2) * TILE;
    addProp(c, 'lounger', cx - 0.6, H, cz, rng.float(-0.3, 0.3));
    if (rng.chance(0.7)) addContainer(c, rng, rng.chance(0.5) ? 'cabinet' : 'crate', LOOT, c.x0 + (x0 + 0.5) * TILE, H, c.z0 + (z0 + 0.4) * TILE, 0, [1, 3]);
    if (rng.chance(0.5)) addPickup(c, rng, LOOT, cx + 0.7, H, cz + 0.6);
    return { x0, z0, w, h };
  }
  return null;
}

// The rare way to Level 4: a tall square shaft with a staircase spiralling up
// round a tiled core, and a hatch in the ceiling at the very top.
function spiralExit(c, rng, se, level) {
  const lx = Math.max(2, Math.min(CS - 5, se.lx - 1)), lz = Math.max(2, Math.min(CS - 5, se.lz - 1));
  const H = STAIR.H;
  clearArea(c, c.x0 + (lx - 1) * TILE, c.z0 + (lz - 1) * TILE, c.x0 + (lx + 4) * TILE, c.z0 + (lz + 4) * TILE);
  fillRect(c, lx - 1, lz - 1, lx + 3, lz + 3, 0);
  const { top, land } = spiralParts(H);
  carveRect(c, lx, lz, lx + 2, lz + 2, { floor: 0, ceil: top + 2.8, fmat: 0, cmat: 1, water: NO_WATER, flags: F_ROOM | F_RESERVED | F_LANDMARK | F_DARK });
  // doorway on the west side at the foot of the first flight (NW corner), then a corridor out
  openTile(c, lx - 1, lz, { floor: 0, ceil: 3, fmat: 0, cmat: 0, water: NO_WATER, flags: F_RESERVED });
  for (let x = lx - 2; x >= 0; x--) {
    const i = lz * CS + x;
    const wasOpen = c.type[i] === T_FLOOR;
    if (wasOpen && c.floor[i] === 0 && !(c.water[i] > NO_WATER + 1)) break;
    openTile(c, x, lz, { floor: 0, ceil: 3, fmat: 0, cmat: 0, water: NO_WATER });
  }
  const ox = c.x0 + (lx + 1.5) * TILE, oz = c.z0 + (lz + 1.5) * TILE;
  addProp(c, 'spiralStair', ox, 0, oz, 0, { h: H });
  addObject(c, { kind: 'roofHatch', x: ox + land.x, y: top, z: oz + land.z, ry: 0, to: level.def.next });
  addDecal(c, { name: 'text3', x: c.x0 + (lx - 1) * TILE + 0.01, y: 2.2, z: c.z0 + (lz + 0.5) * TILE, nx: 1, ny: 0, nz: 0, size: 1 });
  // bare bulbs every turn, and a cold light at the top
  for (let y = 2.8; y < top; y += 4) addLight(c, { kind: 'bulb', cord: 0.15, x: ox + (y % 8 < 4 ? -2.2 : 2.2), y: y + 1.6, z: oz + (y % 8 < 4 ? -2.2 : 2.2), color: [0.8, 0.95, 1], intensity: 2.6, range: 7, flicker: rng.chance(0.25) ? 0.4 : 0, broken: rng.chance(0.15) });
  addLight(c, { kind: 'none', x: ox + land.x, y: top + 2.2, z: oz + land.z, color: [1, 0.95, 0.85], intensity: 3, range: 6 });
  addNote(c, 'l3_d', ox - 2.3, 0.005, oz - 1.6, 0.4);
  return true;
}

export default {
  id: 'L3',
  name: 'Level 3',
  title: 'Pool Rooms',
  next: 'L4',
  objective: 'Find the drain valve key in a pump room, then open the MAIN DRAIN in the deepest pool.',
  objectiveText(game) {
    if (game.world.flag('L3', 'drainOpen')) return 'The main drain is open. Swim down through it.';
    return game.inventory.has('drainKey') ? 'You have the valve key. Find the deepest pool and unlock the MAIN DRAIN at its bottom.' : 'Find the drain valve key in a pump room (listen for machinery), then the MAIN DRAIN.';
  },
  subtitle: 'The water is warm, and far too clear.',
  palette: {
    floor: [{ mat: 'poolTile', scale: 2 }, { mat: 'poolTileBlue', scale: 2, stairMat: 'poolTile' }, { mat: 'black', scale: 2 }, { mat: 'poolTileDeep', scale: 2, stairMat: 'poolTileBlue' }],
    wall: [{ mat: 'poolTile', scaleU: 2, scaleV: 2, vBase: 'abs' }, { mat: 'poolTileBlue', scaleU: 2, scaleV: 2, vBase: 'abs' }],
    ceil: [{ mat: 'poolTile', scale: 2 }, { mat: 'concrete', scale: 3 }],
    ledge: { mat: 'poolTileBlue', scale: 2 },
    soffit: { mat: 'poolTile', scaleU: 2, scaleV: 2 },
  },
  materials: ['poolTile', 'poolTileBlue', 'poolTileDeep', 'ringRed', 'ringWhite', 'rope', 'railSteel', 'concrete', 'chrome', 'plastic', 'laminate', 'darkMetal', 'paintedMetal', 'rustMetal', 'glowWhite', 'glowRed', 'glowGreen', 'glowAmber', 'black', 'paper', 'cardboard', 'woodCrate', 'bulbWarm', 'hazard', 'plasticDark', 'rubber'],
  ambient: [0.065, 0.078, 0.088],
  bakeGain: 0.07,
  exposure: 1.0,
  fog: { color: 0x84a0a8, density: 0.022 },
  background: 0x8fa8b0,
  waterFog: 0.09, waterFogColor: 0x2a8a96,
  grade: { lift: [0.01, 0.02, 0.03], gamma: [1.0, 1.0, 1.0], gain: [0.98, 1.02, 1.04], saturation: 0.88, tint: [0.97, 1.0, 1.02], vignette: 0.42, grain: 0.035, bloomStrength: 0.45, bloomThreshold: 0.86 },
  hemi: { sky: 0xdff4ff, ground: 0x5a7a80, intensity: 0.35 },
  dust: { color: 0xffffff, opacity: 0.18 },
  waterMat: 'water',
  portConfig: { min: 2, max: 3, wMin: 1, wMax: 3 },
  ambience: 'pools',
  surface: 'tile',
  lockerStyle: 'metal',
  notes: ['l3_a', 'l3_b', 'l3_c', 'l3_d', 'gen_a', 'gen_b', 'lore_rucky'],
  decalTexts: ['MAIN DRAIN', 'LISTEN FOR IT', 'STAY DRY', 'NO LIFEGUARD'],
  entities: {
    primary: 'undertow', max: 1, spawnCd: 50, minDist: 14, maxDist: 30, rare: ['lookalike'],
    spawnFilter: (level, x, z) => level.waterAt(x, z) > level.floorAt(x, z) + 1.4,
    // the blue halls are where they breed
    secondary: [{ type: 'undertow', max: 1, spawnCd: 60, chance: 0.12, boost: ctx => ctx.players.some(p => zoneFor(ctx.level, Math.floor(p.x / 32), Math.floor(p.z / 32)) === 'blue') }],
  },
  exitStyle: 'mosaic',
  containerMats: { cabinet: 'poolTile', crate: 'poolTileBlue', cardboard: 'soggyCardboard' },
  allowBlackout: false,
  eventSounds: ['splash', 'drip', 'whisper', 'tideGroan', 'knock'],

  landmarks(level) {
    const exit = placeLandmark(level, 'L3exit', 45, 70);
    const ea = Math.atan2(exit.tz - 8, exit.tx - 8);
    const key = placeLandmark(level, 'L3key', 24, 40, [ea + 1.3, ea + 2.5]);
    return [{ type: 'spawn', tx: 8, tz: 8 }, { type: 'exit', ...exit }, { type: 'key', ...key }];
  },

  setupScene(game) {
    const env = makeEnvMap(game.engine.renderer, 0xe8f6ff, 0xb0d8e0, 0x2a7a88, [[0, 9, 0, 0xffffff, 6]]);
    const water = makeWaterMaterial(game.lib, { color: 0x167f8f, opacity: 0.42, envMap: env, envIntensity: 0.75, normalScale: 0.55, flow: 0.7 });
    game.lib.register('water', water);
    game.lib.register('waterDeep', makeWaterMaterial(game.lib, { color: 0x0a2a5a, opacity: 0.7, envMap: env, envIntensity: 0.5, normalScale: 0.5, flow: 0.5 }));
    game.lib.register('skyGlow', new THREE.MeshBasicMaterial({ color: new THREE.Color(0xd8f0ff).multiplyScalar(2.2) }));
    // caustics on submerged tiles
    for (const name of ['poolTileBlue', 'poolTile', 'poolTileDeep']) {
      const m = game.lib.get(name);
      if (m.userData.caustics) continue;
      m.userData.caustics = true;
      const prev = m.onBeforeCompile;
      m.onBeforeCompile = shader => {
        prev(shader);
        shader.uniforms.cTime = worldUniforms.time;
        shader.fragmentShader = shader.fragmentShader
          .replace('uniform float bakedScale;', `uniform float bakedScale;\nuniform float cTime;
            float etgCaustic(vec2 uv, float t) {
              vec2 p = mod(uv * 6.28318, 6.28318) - 250.0;
              vec2 i = p; float c = 1.0; float inten = 0.005;
              for (int n = 0; n < 4; n++) {
                float tt = t * (1.0 - (3.5 / float(n + 1)));
                i = p + vec2(cos(tt - i.x) + sin(tt + i.y), sin(tt - i.y) + cos(tt + i.x));
                c += 1.0 / length(vec2(p.x / (sin(i.x + tt) / inten), p.y / (cos(i.y + tt) / inten)));
              }
              c /= 4.0; c = 1.17 - pow(c, 1.4);
              return pow(abs(c), 8.0);
            }`)
          .replace('irradiance += vBaked * bakedTint * (bakedScale * 3.14159);', `irradiance += vBaked * bakedTint * (bakedScale * 3.14159);
            if (vWPos.y < ${(WL - 0.05).toFixed(2)}) {
              float depthK = clamp(1.0 - (${WL.toFixed(2)} - vWPos.y) / 9.0, 0.15, 1.0);
              float cs = etgCaustic(vWPos.xz * 0.3, cTime * 0.6);
              irradiance += vec3(0.55, 0.9, 1.0) * cs * 3.0 * depthK;
              irradiance *= vec3(0.75, 0.95, 1.0);
            }`);
      };
      m.customProgramCacheKey = () => 'bakedCaustic' + name;
      m.needsUpdate = true;
    }
  },

  sideExit: { p: 0.05, minR: 2 },

  generate(c, ctx) {
    const { rng, level, ports, landmarks } = ctx;
    const zone = zoneFor(level, c.cx, c.cz);
    c.meta.zone = zone;
    const T = (ceil = 3.2, extra = {}) => ({ floor: 0, ceil, fmat: 0, cmat: 0, ...extra });

    if (zone === 'hall' || zone === 'deep') {
      const ceil = zone === 'deep' ? 7 : rng.pick([5, 6, 7]);
      carveRect(c, 0, 0, CS - 1, CS - 1, T(ceil, { flags: F_ROOM }));
      // a few solid wall blocks to break sightlines
      for (let k = rng.int(1, 3); k > 0; k--) { const x = rng.int(1, 12), z = rng.int(1, 12); fillRect(c, x, z, x + rng.int(0, 2), z + rng.int(0, 2), 0); }
      if (zone === 'deep') {
        const lm = landmarks.find(l => l.type === 'exit');
        const ex = Math.max(4, Math.min(CS - 5, lm.lx)), ez = Math.max(4, Math.min(CS - 5, lm.lz));
        carveRect(c, ex - 4, ez - 4, ex + 4, ez + 4, T(ceil, { flags: F_ROOM | F_RESERVED }));
        carvePool(c, ex - 3, ez - 3, ex + 2, ez + 2, 6, rng, { steps: false });
        // drain shaft
        const i = ez * CS + ex;
        c.floor[i] = -11; c.flags[i] |= F_LANDMARK;
        const gx = c.x0 + ex * TILE + 1, gz = c.z0 + ez * TILE + 1;
        const grate = addObject(c, { kind: 'drainGrate', x: gx, y: -6.0, z: gz, ry: 0 });
        grate.collider = c.addCollider(gx - 1, -6.15, gz - 1, gx + 1, -5.95, gz + 1, false);
        addObject(c, { kind: 'exit', x: gx, y: -8.0, z: gz, r: 1.1, to: 'L4', requires: 'drainOpen' });
        addProp(c, 'poolLadder', c.x0 + (ex - 3) * TILE + 0.5, 0, c.z0 + (ez - 3) * TILE + 0.02, 0, { depth: 6 });
        addLight(c, { kind: 'none', x: gx, y: -5.4, z: gz, color: [0.4, 1, 0.9], intensity: 3, range: 6, flicker: 0.1 });
        addDecal(c, { name: 'text0', x: c.x0 + (ex - 4) * TILE + 1, y: 0.005, z: c.z0 + (ez + 3.5) * TILE, nx: 0, ny: 1, nz: 0, size: 1.6, rot: 0 });
        c.meta.deepPool = { x: gx, z: gz };
      } else {
        const pools = rng.int(1, 2);
        for (let k = 0; k < pools; k++) {
          const w = rng.int(3, 7), h = rng.int(3, 5);
          const x = rng.int(2, CS - 3 - w), z = rng.int(2, CS - 3 - h);
          const steps = rng.chance(0.7);
          carvePool(c, x, z, x + w - 1, z + h - 1, rng.pick([1.4, 2.2, 3.0, 4.5]), rng, { steps });
          if (rng.chance(0.45)) railPool(c, rng, x, z, x + w - 1, z + h - 1, steps);
          if (rng.chance(0.5)) addProp(c, 'lifeguard', c.x0 + (x + w) * TILE + 0.7, 0, c.z0 + (z + 0.5) * TILE, -Math.PI / 2);
          if (rng.chance(0.6)) addProp(c, 'floatRing', c.x0 + (x + rng.float(0.5, w - 0.5)) * TILE, WL + 0.02, c.z0 + (z + rng.float(0.5, h - 0.5)) * TILE, 0, { alt: rng.chance(0.5) });
          addLight(c, { kind: 'skylight', x: c.x0 + (x + w / 2) * TILE, y: ceil - 0.01, z: c.z0 + (z + h / 2) * TILE, w: Math.min(6, w * 1.4), d: Math.min(5, h * 1.4), color: [0.85, 0.95, 1.0], intensity: 7.5, range: 14 });
        }
        if (rng.chance(0.45)) raisedLedge(c, rng, ceil);
      }
      // pillars on a loose grid (not in pools)
      for (let lz = 2; lz < CS - 1; lz += 4) for (let lx = 2; lx < CS - 1; lx += 4) {
        const i = lz * CS + lx;
        if (c.type[i] !== T_FLOOR || c.floor[i] !== 0 || (c.flags[i] & F_RESERVED) || rng.chance(0.25)) continue;
        addProp(c, 'tilePillar', c.tx(lx), 0, c.tz(lz), 0, { h: ceil });
      }
      // ceiling strip lights
      for (let lz = 1; lz < CS; lz += 3) for (let lx = 1; lx < CS; lx += 4) {
        const i = lz * CS + lx;
        if (c.type[i] !== T_FLOOR || rng.chance(0.2)) continue;
        addLight(c, { kind: 'strip', x: c.tx(lx), y: c.ceil[i] - 0.01, z: c.tz(lz), d: 2.4, color: WHITE, intensity: 4.2, range: 10, flicker: rng.chance(0.08) ? 0.5 : 0 });
      }
    } else if (zone === 'blue') {
      // the blue halls: tall, dim, navy-tiled, with big deep pools of dark water
      const ceil = rng.pick([6, 7, 8]);
      carveRect(c, 0, 0, CS - 1, CS - 1, T(ceil, { flags: F_ROOM, fmat: 1 }));
      for (let i = 0; i < CS * CS; i++) c.wmat[i] = 1;
      for (let k = rng.int(0, 2); k > 0; k--) { const x = rng.int(1, 12), z = rng.int(1, 12); fillRect(c, x, z, x + rng.int(0, 1), z + rng.int(0, 2), 1); }
      c.meta.waterMat = 'waterDeep';
      const pools = rng.int(1, 2);
      for (let k = 0; k < pools; k++) {
        const w = rng.int(6, 10), h = rng.int(5, 8);
        const x = rng.int(1, CS - 2 - w), z = rng.int(1, CS - 2 - h);
        const steps = rng.chance(0.5);
        carvePool(c, x, z, x + w - 1, z + h - 1, rng.pick([4.5, 6, 7.5]), rng, { steps });
        for (let zz = z; zz < z + h; zz++) for (let xx = x; xx < x + w; xx++) { const i = zz * CS + xx; if (c.type[i] === T_FLOOR && c.floor[i] < -0.1) c.fmat[i] = 3; }
        if (rng.chance(0.6)) railPool(c, rng, x, z, x + w - 1, z + h - 1, steps);
        if (rng.chance(0.4)) addProp(c, 'floatRing', c.x0 + (x + rng.float(0.5, w - 0.5)) * TILE, WL + 0.02, c.z0 + (z + rng.float(0.5, h - 0.5)) * TILE, 0, { alt: rng.chance(0.5) });
        // a single dim skylight over the deep end
        if (rng.chance(0.6)) addLight(c, { kind: 'skylight', x: c.x0 + (x + w / 2) * TILE, y: ceil - 0.01, z: c.z0 + (z + h / 2) * TILE, w: 4, d: 4, color: [0.6, 0.78, 1.0], intensity: 4.5, range: 14 });
      }
      for (let lz = 2; lz < CS - 1; lz += 5) for (let lx = 2; lx < CS - 1; lx += 5) {
        const i = lz * CS + lx;
        if (c.type[i] !== T_FLOOR || c.floor[i] !== 0 || (c.flags[i] & F_RESERVED) || rng.chance(0.3)) continue;
        addProp(c, 'tilePillar', c.tx(lx), 0, c.tz(lz), 0, { h: ceil });
      }
      for (let lz = 1; lz < CS; lz += 4) for (let lx = 2; lx < CS; lx += 5) {
        const i = lz * CS + lx;
        if (c.type[i] !== T_FLOOR || rng.chance(0.35)) continue;
        addLight(c, { kind: 'strip', x: c.tx(lx), y: c.ceil[i] - 0.01, z: c.tz(lz), d: 2.4, color: DEEPBLUE, intensity: 3.2, range: 10, flicker: rng.chance(0.15) ? 0.5 : 0, broken: rng.chance(0.1) });
      }
    } else if (zone === 'corridors') {
      fillRect(c, 0, 0, CS - 1, CS - 1, 0);
      const ox = rng.int(1, 3), oz = rng.int(1, 3);
      for (let z = oz; z < CS - 1; z += rng.int(4, 6)) carveRect(c, 0, z, CS - 1, z + (rng.chance(0.4) ? 1 : 0), T(3));
      for (let x = ox; x < CS - 1; x += rng.int(4, 6)) carveRect(c, x, 0, x + (rng.chance(0.4) ? 1 : 0), CS - 1, T(3));
      for (let k = rng.int(1, 3); k > 0; k--) { const x = rng.int(1, 10), z = rng.int(1, 10); carveRect(c, x, z, x + rng.int(2, 4), z + rng.int(2, 3), T(3.6, { flags: F_ROOM })); }
      // shallow flooded stretches
      for (let k = rng.int(0, 2); k > 0; k--) {
        const x = rng.int(0, 12), z = rng.int(0, 12);
        for (let zz = z; zz < z + 4; zz++) for (let xx = x; xx < x + 4; xx++) { const i = zz * CS + xx; if (c.type[i] === T_FLOOR && !(c.flags[i] & F_RESERVED)) { c.floor[i] = -0.55; c.water[i] = WL; } }
      }
      for (let lz = 0; lz < CS; lz++) for (let lx = 0; lx < CS; lx++) {
        const i = lz * CS + lx;
        const tx = c.cx * CS + lx, tz = c.cz * CS + lz;
        if (c.type[i] !== T_FLOOR || (tx + tz) % 3 !== 0) continue;
        addLight(c, { kind: 'strip', x: c.tx(lx), y: c.ceil[i] - 0.01, z: c.tz(lz), d: 1.6, color: WHITE, intensity: 3.1, range: 7.5, flicker: rng.chance(0.1) ? rng.float(0.3, 0.8) : 0, broken: rng.chance(0.06) });
      }
    } else { // flooded
      carveRect(c, 0, 0, CS - 1, CS - 1, T(4));
      for (let k = rng.int(3, 6); k > 0; k--) { const x = rng.int(1, 13), z = rng.int(1, 13); fillRect(c, x, z, x + rng.int(0, 2), z + rng.int(0, 1), 0); }
      for (let i = 0; i < CS * CS; i++) if (c.type[i] === T_FLOOR) { c.floor[i] = -0.5; c.water[i] = WL; }
      // a deeper trench across the room
      const z = rng.int(4, 10);
      for (let x = 2; x < CS - 2; x++) { const i = z * CS + x; if (c.type[i] === T_FLOOR) { c.floor[i] = -2.4; c.fmat[i] = 1; } }
      for (let lz = 1; lz < CS; lz += 3) for (let lx = 1; lx < CS; lx += 3) {
        const i = lz * CS + lx;
        if (c.type[i] !== T_FLOOR) continue;
        addLight(c, { kind: 'strip', x: c.tx(lx), y: c.ceil[i] - 0.01, z: c.tz(lz), d: 2, color: [0.8, 0.95, 1.0], intensity: 3.0, range: 8, flicker: rng.chance(0.15) ? 0.5 : 0, broken: rng.chance(0.1) });
      }
    }

    // pump room (key)
    for (const lm of landmarks) {
      if (lm.type === 'spawn') carveRect(c, lm.lx - 2, lm.lz - 2, lm.lx + 2, lm.lz + 2, { ...T(c.ceil[lm.lz * CS + lm.lx] || 5), floor: 0, water: NO_WATER, flags: F_RESERVED });
      if (lm.type === 'key') {
        const kx = Math.max(3, Math.min(CS - 4, lm.lx)), kz = Math.max(3, Math.min(CS - 4, lm.lz));
        fillRect(c, kx - 3, kz - 3, kx + 3, kz + 3, 0);
        carveRect(c, kx - 2, kz - 2, kx + 2, kz + 2, { floor: 0, ceil: 3.6, fmat: 0, cmat: 1, water: NO_WATER, flags: F_ROOM | F_RESERVED });
        for (let z = kz + 3; z < CS; z++) openTile(c, kx, z, T(3, { water: NO_WATER }));
        const cx = c.tx(kx), cz = c.tz(kz);
        addProp(c, 'machine', cx - 1.4, 0, cz - 1.6, 0, { w: 1.8 });
        addProp(c, 'tank', cx + 1.8, 0, cz - 1.4, 0);
        addProp(c, 'pipeV', cx - 3.0, 0, cz + 1.0, 0, { h: 3.6 });
        addProp(c, 'workbench', cx + 0.2, 0, cz + 2.9, Math.PI);
        addObject(c, { kind: 'pickup', item: 'drainKey', qty: 1, x: cx + 0.4, y: 0.96, z: cz + 2.8, ry: 0.3 });
        addNote(c, 'l3_c', cx - 0.4, 0.96, cz + 2.7, 0.2);
        addLight(c, { kind: 'bulb', cord: 0.5, x: cx, y: 2.9, z: cz, color: [1, 0.9, 0.7], intensity: 5, range: 9, flicker: 0.2 });
        c.meta.pump = { x: cx, z: cz };
      }
    }

    const se = sideExitAt(level, c.cx, c.cz);
    if (se) spiralExit(c, rng, se, level);
    openPorts(c, ports, () => T(3), 1);
    ensureConnected(c, ports, () => T(3));

    // decor & loot on dry tiles
    const dry = (lx, lz, i) => freeTile(c, i) && c.floor[i] === 0 && c.water[i] === NO_WATER;
    const spots = wallSpots(c, dry);
    const take = arr => (arr.length ? arr.splice(rng.int(0, arr.length - 1), 1)[0] : null);
    for (let k = rng.int(0, 2); k > 0; k--) { const s = take(spots); if (s) { const p = wallPos(c, s, 0.5); addProp(c, 'lounger', p.x, 0, p.z, yawFor(s.nx, s.nz)); } }
    if (rng.chance(0.3)) { const s = take(spots); if (s) { const p = wallPos(c, s, 0.36); addLocker(c, p.x, 0, p.z, yawFor(s.nx, s.nz)); } }
    if (rng.chance(0.35)) { const s = take(spots); if (s) { const p = wallPos(c, s, 0.4); addContainer(c, rng, rng.chance(0.5) ? 'cardboard' : 'cabinet', LOOT, p.x, 0, p.z, yawFor(s.nx, s.nz), [1, 2]); } }
    if (rng.chance(0.15)) { const s = take(spots); if (s) { const p = wallPos(c, s, 0.4); addNote(c, rng.pick(this.notes), p.x, 0.005, p.z, rng.float(0, 6)); } }
    if (rng.chance(0.06)) addVignette(c, rng, addProp, this.notes);
    addLevelDoor(c, level, rng, 'L2', { p: 0.03, minR: 3, salt: 1401, label: 'LEVEL 2' });
    for (let k = rng.int(1, 2); k > 0; k--) {
      const lx = rng.int(0, CS - 1), lz = rng.int(0, CS - 1), i = lz * CS + lx;
      if (!dry(lx, lz, i)) continue;
      addPickup(c, rng, LOOT, c.tx(lx) + rng.float(-0.5, 0.5), 0, c.tz(lz) + rng.float(-0.5, 0.5));
    }
    // some loot at the bottom of pools (dive for it)
    if (rng.chance(0.35)) {
      for (let k = 0; k < 10; k++) {
        const lx = rng.int(0, CS - 1), lz = rng.int(0, CS - 1), i = lz * CS + lx;
        if (c.type[i] === T_FLOOR && c.floor[i] < -1.2 && c.ramp[i] < 0 && !(c.flags[i] & F_LANDMARK)) { addPickup(c, rng, LOOT, c.tx(lx), c.floor[i], c.tz(lz)); break; }
      }
    }
    const goal = nearestExit(level, c.x0 + 16, c.z0 + 16);
    const ws = wallSpots(c);
    if (!addPortArrow(c, rng, ports, goal, { count: 1 }) && rng.chance(0.5)) addWayfinding(c, rng, ws, goal, { name: 'arrow' });
    if (rng.chance(0.2) && ws.length) { const s = rng.pick(ws), p = wallPos(c, s); addDecal(c, { name: rng.pick(['text1', 'text2', 'text3', 'drip', 'hand']), x: p.x, y: rng.float(0.9, 1.7), z: p.z, nx: s.nx, ny: 0, nz: s.nz, size: 1 }); }
    for (let k = rng.int(0, 2); k > 0; k--) {
      const lx = rng.int(0, CS - 1), lz = rng.int(0, CS - 1), i = lz * CS + lx;
      if (!dry(lx, lz, i)) continue;
      addDecal(c, { name: rng.chance(0.6) ? 'stain' : 'footprints', x: c.tx(lx), y: 0.004, z: c.tz(lz), nx: 0, ny: 1, nz: 0, size: rng.float(0.8, 1.6), rot: rng.float(0, 6.28) });
    }
  },

  setPiece(game, levelId, ctx, p) {
    const lvl = ctx.level;
    for (let k = 0; k < 20; k++) {
      const a = Math.random() * Math.PI * 2, d = 6 + Math.random() * 10;
      const x = p.x + Math.cos(a) * d, z = p.z + Math.sin(a) * d;
      if (lvl.waterAt(x, z) > lvl.floorAt(x, z) + 1) {
        game.hostEvent(levelId, { k: 'poolSplash', x, y: WL, z });
        return true;
      }
    }
    return false;
  },

  clientEvent(game, m) {
    if (m.k !== 'poolSplash') return;
    game.effects.burst('splash', m);
    game.sfx('splash', m, { volume: 1.1, ref: 5 });
    setTimeout(() => game.sfx('tideGurgle', m, { volume: 0.5 }), 700);
  },

  interact(game, o, s) {
    if (o.kind === 'roofHatch') {
      game.sfx('metalGroan', o, { volume: 0.8 });
      game.subtitle('The wheel turns. Above the hatch: carpet, and the smell of old rain.', 2.5);
      game.useExit(o.to);
      return;
    }
    if (o.kind === 'drainGrate' && !s?.open) {
      if (game.inventory.has('drainKey')) { game.request({ t: 'int', l: 'L3', id: o.id, a: 'open' }); game.sfx('unlock', o, {}); }
      else { game.sfx('doorLocked', o, {}); game.subtitle('The valve won\'t budge. You need the drain valve key.', 2); }
    }
  },

  hostInteract(game, pid, o, s, m) {
    if (o.kind === 'drainGrate' && m.a === 'open' && !s.open) {
      game.hostBroadcast({ t: 'os', l: 'L3', id: o.id, s: { open: true } });
      game.hostBroadcast({ t: 'flag', l: 'L3', k: 'drainOpen', v: true });
      if (o.collider) o.collider.disabled = true;
      game.hostEvent('L3', { k: 'subtitle', text: 'The grate swings open. Below it, a current pulls downward.', dur: 3 });
      game.hostEvent('L3', { k: 'sound', name: 'metalDoor', x: o.x, y: o.y, z: o.z, volume: 0.6 });
    }
  },

  onFlag(game, l, k) {
    if (l === 'L3' && k === 'drainOpen') for (const ch of game.getLevel('L3').chunks.values()) for (const o of ch.objects) if (o.kind === 'drainGrate' && o.collider) o.collider.disabled = true;
  },

  clientUpdate(game, dt) {
    const P = game.player;
    // darker, murkier water in the blue halls
    const blue = game.level.chunks.get(Math.floor(P.pos.x / 32) + ',' + Math.floor(P.pos.z / 32))?.meta.zone === 'blue';
    game.waterFogNow = blue ? 0.16 : undefined; game.waterFogColorNow = blue ? 0x0c2850 : undefined;
    // pull toward the open drain when close
    if (!game.world.flag('L3', 'drainOpen')) return;
    const ch = game.level.chunks.get(Math.floor(P.pos.x / 32) + ',' + Math.floor(P.pos.z / 32));
    const dp = ch?.meta.deepPool;
    if (dp && P.swimming && Math.hypot(dp.x - P.pos.x, dp.z - P.pos.z) < 3 && P.pos.y < -3.5) {
      P.vel.y -= dt * 4;
      P.vel.x += (dp.x - P.pos.x) * dt * 2;
      P.vel.z += (dp.z - P.pos.z) * dt * 2;
    }
  },
};
