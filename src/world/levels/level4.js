// Level 4 — The Quiet Rooms. Beige walls, gray carpet, a gray-green ceiling.
// Windows onto a bright sky that isn't there, throwing daylight onto the
// floor; everywhere the windows don't reach is dark. Empty rooms behind doors,
// big dead restaurants full of tables, thin tunnels to storage units and
// staircases that go nowhere. Platinum snakes drift along the carpet.
// Exit: a toll room — a tone lock guarding a vault with the LEVEL 5 door.
// There are several; they re-seal (with a new order) whenever the level is
// re-entered.
import * as THREE from 'three';
import { TILE, CS, T_SOLID, T_FLOOR, F_ROOM, F_DARK, F_RESERVED, F_LANDMARK } from '../chunk.js';
import { openPorts, ensureConnected, carveRect, fillRect, openTile, carveL, portTiles } from '../gen.js';
import { placeLandmark } from '../level.js';
import { addProp, registerProps } from '../props.js';
import { addLight, addDecal, addObject, addPickup, addContainer, addNote, addLocker, wallSpots, wallPos, yawFor, freeTile, addWayfinding, addVignette, addLevelDoor, sideExitAt, nearestExit, addPortArrow } from './common.js';
import { hash01, hash4 } from '../../core/rng.js';
import { registerObjectKind } from '../../game/objects.js';

const CE = 3.0;
const DAY = [1.0, 0.95, 0.86], LAMP = [1.0, 0.82, 0.6];

const LOOT = [
  ['goanJuice', 12], ['vigorTonic', 6], ['fireSalts', 12], ['cleanWater', 10], ['battery', 14, [1, 2]], ['bandage', 10], ['medkit', 4], ['painkillers', 8],
  ['ammo9', 8, [6, 12]], ['shells', 5, [2, 5]], ['rifleAmmo', 3, [8, 16]], ['glowstick', 8, [1, 3]], ['flare', 5], ['gpsBoard', 2], ['antenna', 2], ['wire', 4],
  ['scrap', 5], ['knife', 3], ['decoy', 4], ['level5Key', 1], [null, 14],
];
const UNIT_LOOT = [['battery', 14, [2, 3]], ['medkit', 6], ['bandage', 10, [1, 2]], ['ammo9', 10, [8, 15]], ['shells', 8, [3, 6]], ['rifleAmmo', 5, [10, 20]], ['flare', 8, [1, 2]], ['scrap', 8, [1, 3]], ['wire', 6], ['ductTape', 5], ['goanJuice', 8], ['cloth', 5], [null, 6]];
const VEND_GOODS = [['fireSalts', 5], ['goanJuice', 4], ['vigorTonic', 2], ['cleanWater', 2]];
// tone-lock vocabulary: each plate has a word, a colour and a pitch
const WORDS = ['GLASS', 'TOLL', 'WATCHER', 'BRIDGE', 'WINDOW', 'CARPET', 'RAIN', 'STAIR', 'COIN', 'SKY'];
const PLATE_COLORS = [0x58b8ff, 0xf2efe6, 0xd9c07a, 0xe0705a, 0x7ad99a];
const PLATE_NAMES = ['blue', 'white', 'gold', 'red', 'green'];
const PENTA = [261.6, 293.7, 329.6, 392.0, 440.0, 523.3, 587.3];

registerProps({
  // A window onto a sky that isn't there, with daylight slanting onto the floor.
  fakeWindow: {
    colliders: null,
    build(p, B) {
      const w = p.w || 1.6, y0 = 0.9, y1 = 2.3, hw = w / 2;
      B.quad('windowSky', [-hw, y0, 0.015], [hw, y0, 0.015], [hw, y1, 0.015], [-hw, y1, 0.015], [0, 0, 1], [[0, 0], [1, 0], [1, 1], [0, 1]]);
      // frame, mullions, sill
      B.box('windowFrame', 0, y1 + 0.05, 0.04, w + 0.2, 0.1, 0.08, 0.5);
      B.box('windowFrame', 0, y0 - 0.05, 0.04, w + 0.2, 0.1, 0.08, 0.5);
      B.box('windowFrame', -hw - 0.05, (y0 + y1) / 2, 0.04, 0.1, y1 - y0 + 0.2, 0.08, 0.5);
      B.box('windowFrame', hw + 0.05, (y0 + y1) / 2, 0.04, 0.1, y1 - y0 + 0.2, 0.08, 0.5);
      B.box('windowFrame', 0, (y0 + y1) / 2, 0.035, 0.05, y1 - y0, 0.04, 0.5);
      B.box('windowFrame', 0, (y0 + y1) / 2 + 0.15, 0.035, w, 0.05, 0.04, 0.5);
      B.box('windowFrame', 0, y0 - 0.1, 0.12, w + 0.3, 0.05, 0.24, 0.5);
      // the light shaft: a prism from the window down onto the floor
      const near = 1.1, far = 3.4, f = 0.012;
      const BL = [-hw, y0, 0.05], BR = [hw, y0, 0.05], TL = [-hw, y1, 0.05], TR = [hw, y1, 0.05];
      const NL = [-hw - 0.05, f, near], NR = [hw + 0.05, f, near], FL = [-hw - 0.15, f, far], FR = [hw + 0.15, f, far];
      B.quad('lightShaft', BL, TL, FL, NL, [1, 0, 0]);
      B.quad('lightShaft', BR, NR, FR, TR, [-1, 0, 0]);
      B.quad('lightShaft', TL, TR, FR, FL, [0, -1, 0]);
      B.quad('lightShaft', BL, NL, NR, BR, [0, 1, 0]);
      B.quad('lightPool', NL, NR, FR, FL, [0, 1, 0]);
    },
  },
  cafeTable: {
    colliders: [[-0.45, 0, -0.45, 0.45, 0.76, 0.45]],
    build(p, B) {
      B.cyl('laminate', 0, 0.72, 0, 0.48, 0.04, 16, true);
      B.cyl('darkMetal', 0, 0.02, 0, 0.05, 0.7, 8, false);
      B.cyl('darkMetal', 0, 0, 0, 0.26, 0.03, 12, true);
    },
  },
  counter: {
    colliders: p => [[-(p.len || 4) / 2, 0, -0.35, (p.len || 4) / 2, 1.05, 0.35]],
    build(p, B) {
      const len = p.len || 4;
      B.box('darkWood', 0, 0.5, 0, len, 1.0, 0.65, 1);
      B.box('laminate', 0, 1.03, 0.02, len + 0.1, 0.05, 0.75, 1);
      B.box('trim', 0, 0.06, 0.33, len, 0.12, 0.02, 1);
      for (let x = -len / 2 + 0.6; x < len / 2 - 0.3; x += 1.2) B.box('chrome', x, 1.12, -0.1, 0.25, 0.12, 0.25, 0.3);
    },
  },
  stool: {
    colliders: [[-0.18, 0, -0.18, 0.18, 0.72, 0.18]],
    navBlock: false,
    build(p, B) { B.cyl('fabric', 0, 0.66, 0, 0.18, 0.08, 10, true); B.cyl('chrome', 0, 0, 0, 0.03, 0.66, 6, false); B.cyl('chrome', 0, 0, 0, 0.17, 0.02, 10, true); },
  },
  // stairs that climb to a blank wall (a painted door at the top)
  nowhereStair: {
    colliders: p => {
      const n = p.n || 9, rise = 0.24, tread = 0.32, out = [];
      for (let k = 0; k < n; k++) { const z1 = 0.3 + (n - k) * tread; out.push([-0.6, 0, z1 - tread, 0.6, (k + 1) * rise, z1]); }
      out.push([-0.6, 0, 0, 0.6, n * rise, 0.32]);
      return out;
    },
    build(p, B) {
      const n = p.n || 9, rise = 0.24, tread = 0.32;
      for (let k = 0; k < n; k++) {
        const z1 = 0.3 + (n - k) * tread, top = (k + 1) * rise;
        B.box('beigeWall', 0, top / 2, z1 - tread / 2, 1.2, top, tread, 1);
        B.box('grayCarpet', 0, top + 0.005, z1 - tread / 2, 1.18, 0.01, tread - 0.01, 1);
      }
      B.box('beigeWall', 0, n * rise / 2, 0.15, 1.2, n * rise, 0.32, 1);
      // handrail on one side
      B.tube('darkWood', 0.62, 1.0, 0.3 + n * tread, 0.62, n * rise + 0.9, 0.2, 0.03, 6);
      // the door painted on the wall at the top
      const y = n * rise;
      B.box('windowFrame', 0, y + 1.05, 0.01, 1.0, 2.1, 0.02, 0.5);
      B.box('laminate', 0, y + 1.0, 0.025, 0.86, 1.98, 0.01, 0.5);
      B.box('chrome', 0.32, y + 1.0, 0.035, 0.08, 0.03, 0.02, 0.3);
    },
  },
});

// Tone plate: a low pedestal with a glowing disc and an engraved word.
const FLASH = new Map();
registerObjectKind('tonePlate', {
  build(o, game) {
    const g = new THREE.Group();
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.7, 0.18, 20), game.lib.dyn('darkMetal')); base.position.y = 0.09; g.add(base);
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.04, 20), new THREE.MeshStandardMaterial({ color: o.color, emissive: o.color, emissiveIntensity: 0.25, roughness: 0.3 }));
    disc.position.y = 0.2; g.add(disc);
    // engraved word on a little stand behind the plate
    const c = document.createElement('canvas'); c.width = 256; c.height = 64;
    const x = c.getContext('2d'); x.fillStyle = '#2a2c2e'; x.fillRect(0, 0, 256, 64); x.fillStyle = '#d8d2b8'; x.font = 'bold 40px Georgia, serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(o.word, 128, 34);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.175), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6 }));
    sign.position.set(0, 0.62, -0.62); sign.rotation.x = -0.35; g.add(sign);
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.6, 0.05), game.lib.dyn('darkMetal')); post.position.set(0, 0.3, -0.64); g.add(post);
    g.userData.disc = disc;
    return g;
  },
  prompt: o => `Press the ${o.word} plate`,
  radius: 0.75, centerY: 0.1,
  animate(mesh, o) {
    const f = FLASH.get(o.id) || 0;
    const k = Math.max(0, f - performance.now()) / 700;
    mesh.userData.disc.material.emissiveIntensity = 0.25 + k * 3;
    mesh.userData.disc.position.y = 0.2 - k * 0.03;
  },
});
// The lock panel beside the vault door.
registerObjectKind('toneLock', {
  build(o, game) {
    const g = new THREE.Group();
    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.8, 0.06), game.lib.dyn('chrome')); plate.position.set(0, 1.45, 0.03); g.add(plate);
    const grille = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.03, 18), game.lib.dyn('darkMetal')); grille.rotation.x = Math.PI / 2; grille.position.set(0, 1.6, 0.07); g.add(grille);
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.06, 0.03), new THREE.MeshBasicMaterial({ color: 0xff3020 })); lamp.position.set(0, 1.2, 0.07); g.add(lamp);
    g.userData.lamp = lamp;
    return g;
  },
  prompt: (o, s, game) => (lockSolved(game, o, s) ? 'The lock is silent' : o.variant === 'plaque' ? 'Read the lock\'s plaque' : 'Listen to the lock'),
  radius: 0.55, centerY: 1.3,
  animate(mesh, o, s) { mesh.userData.lamp.material.color.setHex(s?.solved ? 0x30ff60 : 0xff3020); },
});
// The vault door: heavy, round-cornered steel. Opens when the lock is solved.
registerObjectKind('vaultDoor', {
  build(o, game) {
    const g = new THREE.Group();
    const pivot = new THREE.Group(); pivot.position.set(-1.0, 0, 0); g.add(pivot);
    const steel = new THREE.MeshStandardMaterial({ color: 0x9aa2a8, roughness: 0.35, metalness: 0.7 });
    const slab = new THREE.Mesh(new THREE.BoxGeometry(2.0, 2.5, 0.22), steel); slab.position.set(1.0, 1.25, 0); slab.castShadow = true; pivot.add(slab);
    const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.04, 8, 20), game.lib.dyn('chrome')); wheel.position.set(1.0, 1.25, 0.14); pivot.add(wheel);
    for (let k = 0; k < 3; k++) { const s = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.04, 0.04), game.lib.dyn('chrome')); s.position.set(1.0, 1.25, 0.14); s.rotation.z = k * Math.PI / 3; pivot.add(s); }
    for (const y of [0.4, 2.1]) { const h = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.3, 8), game.lib.dyn('darkMetal')); h.position.set(0.02, y, 0.1); pivot.add(h); }
    const label = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.18), new THREE.MeshBasicMaterial({ color: 0xd8d0a8 })); label.position.set(1.0, 2.05, 0.115); pivot.add(label);
    g.userData.pivot = pivot; g.userData.wheel = wheel;
    return g;
  },
  prompt: (o, s, game) => {
    if (vaultOpen(game, o, s)) return null;
    return game.inventory.has('level5Key') ? 'Use the Bridge Key on the vault door' : 'Vault door — sealed by the tone lock';
  },
  radius: 1.2, centerY: 1.0,
  animate(mesh, o, s, dt) {
    const want = s?.op && s.ep === (window.__etgL4Epoch ?? 0) ? 1 : 0;
    const k = mesh.userData.k = (mesh.userData.k ?? 0) + (want - (mesh.userData.k ?? 0)) * Math.min(1, dt * 1.2);
    mesh.userData.pivot.rotation.y = -k * 1.8;
    mesh.userData.wheel.rotation.z = k * 6;
  },
});
// A door that is only painted on.
registerObjectKind('fakeDoor', { build: () => null, prompt: () => 'Try the door', radius: 0.7, centerY: 1.0 });

const epochOf = game => game.world.flag('L4', 'epoch') || 0;
function lockSolved(game, o, s) { return !!(s?.solved && s.ep === epochOf(game)); }
function vaultOpen(game, o, s) { return !!(s?.op && s.ep === epochOf(game)); }

// The order a lock wants, for this visit (it changes every re-entry).
export function lockOrder(o, epoch) {
  const n = o.n, idx = Array.from({ length: n }, (_, i) => i);
  let h = hash4(o.seed, epoch, 4242);
  for (let i = n - 1; i > 0; i--) { h = hash4(h, i); const j = h % (i + 1); [idx[i], idx[j]] = [idx[j], idx[i]]; }
  return idx;
}

function zoneFor(level, cx, cz) {
  const by = level.byType;
  const inChunk = l => l && Math.floor(l.tx / CS) === cx && Math.floor(l.tz / CS) === cz;
  if (inChunk(by.spawn) || inChunk(by.exit)) return 'rooms';
  const h = hash01(cx, cz, level.levelSeed, 51) * 0.6 + hash01(Math.floor(cx / 2), Math.floor(cz / 2), level.levelSeed, 52) * 0.4;
  return h < 0.18 ? 'restaurant' : h > 0.82 ? 'units' : 'rooms';
}

// ------------------------------------------------------------------ layout
function genRooms(c, ctx, zone) {
  const { rng, ports } = ctx;
  const T = (extra = {}) => ({ floor: 0, ceil: CE, fmat: 0, cmat: 0, ...extra });
  fillRect(c, 0, 0, CS - 1, CS - 1, 0);
  const rooms = [];
  if (zone === 'restaurant') {
    // one huge dining room
    carveRect(c, 1, 1, CS - 2, CS - 2, T({ ceil: 3.8, flags: F_ROOM }));
    rooms.push({ type: 'restaurant', x: 1, z: 1, w: CS - 2, h: CS - 2 });
  } else {
    const zc = rng.int(5, 9), xc = rng.int(5, 9);
    carveRect(c, 0, zc, CS - 1, zc + 1, T());
    carveRect(c, xc, 0, xc + 1, CS - 1, T());
    const quads = [[0, 0, xc - 2, zc - 2], [xc + 3, 0, CS - 1, zc - 2], [0, zc + 3, xc - 2, CS - 1], [xc + 3, zc + 3, CS - 1, CS - 1]];
    for (const [x0, z0, x1, z1] of quads) {
      const w = x1 - x0 + 1, h = z1 - z0 + 1;
      if (w < 3 || h < 3) continue;
      const parts = [];
      if (w >= 7 && rng.chance(0.65)) { const s = rng.int(x0 + 3, x1 - 3); parts.push([x0, z0, s - 1, z1], [s + 1, z0, x1, z1]); }
      else if (h >= 7 && rng.chance(0.65)) { const s = rng.int(z0 + 3, z1 - 3); parts.push([x0, z0, x1, s - 1], [x0, s + 1, x1, z1]); }
      else parts.push([x0, z0, x1, z1]);
      for (const [a, b, cc, d] of parts) {
        const rw = cc - a + 1, rh = d - b + 1;
        if (rw < 2 || rh < 2) continue;
        const big = rw * rh;
        const type = zone === 'units' && big < 30 ? 'unit'
          : big >= 30 ? rng.weighted([['dining', 2], ['empty', 3], ['lounge', 1.5], ['stairs', 1]])
          : big >= 9 ? rng.weighted([['empty', 5], ['lounge', 2], ['stairs', 1.2], ['vend', 1.2], ['unit', 1]])
          : rng.weighted([['empty', 4], ['unit', 1.5]]);
        if (type === 'unit') { rooms.push(...storageUnit(c, rng, a, b, cc, d)); continue; }
        carveRect(c, a, b, cc, d, T({ flags: F_ROOM, ceil: type === 'stairs' ? 4.2 : type === 'dining' ? 3.6 : CE }));
        rooms.push({ type, x: a, z: b, w: rw, h: rh });
      }
    }
    // a doorway from each room to the nearest corridor
    for (const r of rooms) {
      if (r.door || r.type === 'unit') continue;
      const cands = [];
      for (let x = r.x; x < r.x + r.w; x++) { cands.push([x, r.z - 1, 0, -1]); cands.push([x, r.z + r.h, 0, 1]); }
      for (let z = r.z; z < r.z + r.h; z++) { cands.push([r.x - 1, z, -1, 0]); cands.push([r.x + r.w, z, 1, 0]); }
      const ok = cands.filter(([x, z, dx, dz]) => {
        const bx = x + dx, bz = z + dz;
        if (x < 0 || z < 0 || x >= CS || z >= CS || bx < 0 || bz < 0 || bx >= CS || bz >= CS) return false;
        return c.type[z * CS + x] === T_SOLID && c.type[bz * CS + bx] === T_FLOOR && !(c.flags[bz * CS + bx] & F_ROOM);
      });
      if (!ok.length) continue;
      const [dx, dz, nx, nz] = ok[rng.int(0, ok.length - 1)];
      openTile(c, dx, dz, T({ flags: F_RESERVED }));
      r.door = { lx: dx, lz: dz, nx, nz };
    }
  }
  openPorts(c, ports, () => T(), 1);
  for (const [px, pz] of portTiles(ports)) carveL(c, px, pz, 8, 8, T(), rng, 1);
  return rooms;
}

// A storage unit at the end of a thin, low tunnel.
function storageUnit(c, rng, a, b, cc, d) {
  const rw = cc - a + 1, rh = d - b + 1;
  if (rw < 2 || rh < 2) return [];
  // the unit takes the far end of the quadrant; a 1-wide tunnel runs to it
  const w = Math.min(3, rw), h = Math.min(3, rh);
  const ux = a + ((hash01(a, b, 1) * (rw - w + 1)) | 0), uz = b + ((hash01(a, b, 2) * (rh - h + 1)) | 0);
  carveRect(c, ux, uz, ux + w - 1, uz + h - 1, { floor: 0, ceil: 2.6, fmat: 1, cmat: 1, flags: F_ROOM | F_DARK });
  // tunnel: from the unit's middle out toward the chunk centre until it meets open floor
  const mx = ux + (w >> 1), mz = uz + (h >> 1);
  const dx = Math.sign(8 - mx) || 1, dz = Math.sign(8 - mz) || 1;
  const horiz = Math.abs(8 - mx) > Math.abs(8 - mz);
  let x = mx, z = mz, door = null;
  for (let k = 0; k < 14; k++) {
    if (horiz) x += dx; else z += dz;
    if (x < 0 || z < 0 || x >= CS || z >= CS) break;
    const i = z * CS + x;
    if (c.type[i] === T_FLOOR && !(x >= ux && x < ux + w && z >= uz && z < uz + h)) break;
    const first = !door && !(x >= ux && x < ux + w && z >= uz && z < uz + h);
    openTile(c, x, z, { floor: 0, ceil: 2.2, fmat: 1, cmat: 1, flags: F_DARK | (first ? F_RESERVED : 0) });
    if (first) door = { lx: x, lz: z, nx: horiz ? dx : 0, nz: horiz ? 0 : dz };
  }
  return [{ type: 'unit', x: ux, z: uz, w, h, door }];
}

function dress(c, ctx, rooms, def) {
  const { rng, level } = ctx;
  const take = arr => (arr.length ? arr.splice(rng.int(0, arr.length - 1), 1)[0] : null);
  c.meta.windows = [];
  const win = (s, wpos) => {
    const p = wpos || wallPos(c, s, 0.0);
    const ry = yawFor(s.nx, s.nz);
    addProp(c, 'fakeWindow', p.x, 0, p.z, ry, { w: 1.6 });
    c.meta.windows.push({ x: p.x, z: p.z, nx: s.nx, nz: s.nz });
    addLight(c, { kind: 'none', x: p.x + s.nx * 1.6, y: 1.5, z: p.z + s.nz * 1.6, color: DAY, intensity: 5.5, range: 9 });
    c.flags[s.i] |= F_RESERVED;
  };
  const used = new Set();
  for (const r of rooms) {
    const inRoom = (lx, lz) => lx >= r.x && lx < r.x + r.w && lz >= r.z && lz < r.z + r.h;
    const spots = wallSpots(c, (lx, lz, i) => freeTile(c, i) && inRoom(lx, lz));
    const x0 = c.x0 + r.x * TILE, z0 = c.z0 + r.z * TILE, W = r.w * TILE, H = r.h * TILE, cx = x0 + W / 2, cz = z0 + H / 2;
    // doors to rooms (units get a roll-up style metal door)
    if (r.door && r.type !== 'restaurant' && rng.chance(r.type === 'unit' ? 1 : 0.7)) {
      const d = r.door, x = c.tx(d.lx), z = c.tz(d.lz);
      const along = d.nx !== 0 ? 'z' : 'x';
      const o = addObject(c, { kind: 'door', x, y: 0, z, ry: along === 'z' ? Math.PI / 2 : 0, mat: r.type === 'unit' ? 'paintedMetal' : 'laminate' });
      o.collider = c.addCollider(along === 'x' ? x - 1 : x - 0.05, 0, along === 'z' ? z - 1 : z - 0.05, along === 'x' ? x + 1 : x + 0.05, 2.4, along === 'z' ? z + 1 : z + 0.05, false);
      o.collider.door = true;
    }
    // windows: the only real light here
    if (r.type !== 'unit') {
      const nWin = r.type === 'restaurant' ? rng.int(4, 7) : r.type === 'dining' ? rng.int(2, 4) : rng.chance(0.65) ? rng.int(1, 2) : 0;
      for (let k = 0; k < nWin; k++) { const s = take(spots); if (s && !used.has(s.i)) { used.add(s.i); win(s); } }
    }
    if (r.type === 'restaurant' || r.type === 'dining') {
      // rows of tables with chairs, a counter, hanging lamps (mostly dead)
      const step = 2.7;
      for (let tz = z0 + 2.2; tz < z0 + H - 1.6; tz += step) for (let tx = x0 + 2.2; tx < x0 + W - 1.6; tx += step) {
        const lx = Math.floor((tx - c.x0) / TILE), lz = Math.floor((tz - c.z0) / TILE);
        if (!freeTile(c, lz * CS + lx) || rng.chance(0.1)) continue;
        addProp(c, 'cafeTable', tx, 0, tz, 0);
        for (let k = 0; k < 4; k++) {
          if (rng.chance(0.15)) continue;
          const a = k * Math.PI / 2 + rng.float(-0.25, 0.25), ox = Math.sin(a) * 0.78, oz = Math.cos(a) * 0.78;
          addProp(c, rng.chance(0.95) ? 'chair' : 'fallenChair', tx + ox, 0, tz + oz, Math.atan2(ox, oz), { mat: 'fabric' });
        }
        if (rng.chance(0.25)) addLight(c, { kind: 'bulb', cord: 0.9, shade: true, x: tx, y: c.ceil[lz * CS + lx] - 0.9, z: tz, color: LAMP, intensity: 2.4, range: 6, flicker: rng.chance(0.3) ? 0.5 : 0, broken: rng.chance(0.4) });
        if (rng.chance(0.05)) addPickup(c, rng, LOOT, tx + 0.15, 0.76, tz - 0.1);
      }
      const s = take(spots);
      if (s) {
        const p = wallPos(c, s, 1.2), ry = yawFor(s.nx, s.nz);
        addProp(c, 'counter', p.x, 0, p.z, ry, { len: 4 });
        for (let k = -1; k <= 1; k++) addProp(c, 'stool', p.x + s.nz * k * 1.2 + s.nx * 0.75, 0, p.z - s.nx * k * 1.2 + s.nz * 0.75, 0);
        if (rng.chance(0.4)) addContainer(c, rng, 'cardboard', LOOT, p.x - s.nz * 1.6 - s.nx * 0.5, 0, p.z + s.nx * 1.6 - s.nz * 0.5, ry, [1, 2]);
        const mp = wallPos(c, s, 0.01);
        addObject(c, { kind: 'sign', text: rng.pick(['GOAN JUICE  2.50', 'FIRE SALTS  1.00', 'SOUP OF THE DAY: ███', 'CLOSED']), x: mp.x, y: 0, z: mp.z, ry, w: 1.4, h: 2.3, size: 34, bg: '#2a2c26', fg: '#e8e0c0', border: '#8a8060' });
      }
      const sv = take(spots); if (sv) { const p = wallPos(c, sv, 0.43); addVendor(c, rng, p.x, 0, p.z, yawFor(sv.nx, sv.nz)); }
      for (let k = rng.int(1, 3); k > 0; k--) { const sp = take(spots); if (sp) { const p = wallPos(c, sp, 0.35); addProp(c, 'plant', p.x, 0, p.z, rng.float(0, 6)); } }
    } else if (r.type === 'lounge') {
      const s = take(spots); if (s) { const p = wallPos(c, s, 0.5); addProp(c, 'sofa', p.x, 0, p.z, yawFor(s.nx, s.nz)); }
      for (let k = rng.int(2, 4); k > 0; k--) { const sp = take(spots); if (sp) { const p = wallPos(c, sp, 0.35); addProp(c, 'plant', p.x, 0, p.z, rng.float(0, 6)); } }
      if (rng.chance(0.5)) addProp(c, 'table', cx, 0, cz, rng.chance(0.5) ? 0 : Math.PI / 2);
      if (rng.chance(0.3)) addPickup(c, rng, LOOT, cx, 0.78, cz);
    } else if (r.type === 'stairs') {
      const s = take(spots);
      if (s) {
        const p = wallPos(c, s, 0.0);
        addProp(c, 'nowhereStair', p.x, 0, p.z, yawFor(s.nx, s.nz), { n: 9 });
        addObject(c, { kind: 'fakeDoor', x: p.x + s.nx * 0.2, y: 9 * 0.24, z: p.z + s.nz * 0.2, ry: yawFor(s.nx, s.nz) });
      }
      if (rng.chance(0.4)) { const sp = take(spots); if (sp) { const p = wallPos(c, sp, 0.35); addProp(c, 'plant', p.x, 0, p.z, 0); } }
    } else if (r.type === 'vend') {
      for (let k = rng.int(1, 2); k > 0; k--) { const s = take(spots); if (s) { const p = wallPos(c, s, 0.43); addVendor(c, rng, p.x, 0, p.z, yawFor(s.nx, s.nz)); } }
      if (rng.chance(0.5)) { const s = take(spots); if (s) { const p = wallPos(c, s, 0.4); addProp(c, 'bench', p.x, 0, p.z, yawFor(s.nx, s.nz)); } }
    } else if (r.type === 'unit') {
      // shelves and boxes, worth searching
      const s = take(spots); if (s) { const p = wallPos(c, s, 0.45); addProp(c, 'storageShelf', p.x, 0, p.z, yawFor(s.nx, s.nz), { len: 1.8 }); }
      for (let k = rng.int(1, 3); k > 0; k--) { const sp = take(spots); if (sp) { const p = wallPos(c, sp, 0.4); addContainer(c, rng, rng.pick(['cardboard', 'crate', 'cardboard']), UNIT_LOOT, p.x, 0, p.z, yawFor(sp.nx, sp.nz), [1, 2]); } }
      if (rng.chance(0.5)) addLight(c, { kind: 'bulb', cord: 0.2, x: cx, y: 2.6 - 0.3, z: cz, color: LAMP, intensity: 1.8, range: 5, flicker: 0.4, broken: rng.chance(0.3) });
    } else {
      // empty rooms: maybe one chair facing the window, maybe nothing at all
      if (c.meta.windows.length && rng.chance(0.25)) { const w = c.meta.windows[c.meta.windows.length - 1]; addProp(c, 'chair', w.x + w.nx * 2.2, 0, w.z + w.nz * 2.2, Math.atan2(-w.nx, -w.nz) + Math.PI, { mat: 'fabric' }); }
      if (rng.chance(0.3)) { const sp = take(spots); if (sp) { const p = wallPos(c, sp, 0.35); addProp(c, 'plant', p.x, 0, p.z, 0); } }
      if (rng.chance(0.12)) addContainer(c, rng, 'cardboard', LOOT, cx + rng.float(-1, 1), 0, cz + rng.float(-1, 1), rng.float(0, 6), [1, 2]);
      if (rng.chance(0.08)) addNote(c, rng.pick(def.notes), cx, 0.004, cz, rng.float(0, 6));
    }
  }
  // corridor windows, rare ceiling lamps, fake plants
  const cspots = wallSpots(c, (lx, lz, i) => freeTile(c, i) && !(c.flags[i] & F_ROOM));
  for (let k = rng.int(0, 2); k > 0; k--) { const s = take(cspots); if (s && !used.has(s.i)) { used.add(s.i); win(s); } }
  for (let k = rng.int(0, 2); k > 0; k--) { const s = take(cspots); if (s) { const p = wallPos(c, s, 0.35); addProp(c, 'plant', p.x, 0, p.z, rng.float(0, 6)); } }
  for (let lz = 1; lz < CS; lz += 4) for (let lx = 1; lx < CS; lx += 4) {
    const i = lz * CS + lx;
    if (c.type[i] !== T_FLOOR || (c.flags[i] & F_ROOM) || !rng.chance(0.18)) continue;
    addLight(c, { kind: 'bulb', cord: 0.05, shade: true, x: c.tx(lx), y: c.ceil[i] - 0.1, z: c.tz(lz), color: LAMP, intensity: 2, range: 6, flicker: rng.chance(0.3) ? 0.4 : 0, broken: rng.chance(0.3) });
  }
  // darkness: everywhere the windows don't reach
  for (let lz = 0; lz < CS; lz++) for (let lx = 0; lx < CS; lx++) {
    const i = lz * CS + lx;
    if (c.type[i] !== T_FLOOR) continue;
    const x = c.tx(lx), z = c.tz(lz);
    if (!c.meta.windows.some(w => Math.hypot(w.x - x, w.z - z) < 6)) c.flags[i] |= F_DARK;
  }
}

function addVendor(c, rng, x, y, z, ry) {
  const stock = rng.int(3, 6);
  const goods = [];
  for (let k = 0; k < stock; k++) goods.push(rng.weighted(VEND_GOODS));
  const o = addObject(c, { kind: 'vendor', x, y, z, ry, stock, goods, shelf: [...new Set(goods)], label: 'vending machine', color: rng.pick([0x3a6a5a, 0x8a2a24, 0x5a5a62]) });
  const side = Math.abs(Math.sin(ry)) > 0.5;
  const hx = side ? 0.42 : 0.47, hz = side ? 0.47 : 0.42;
  c.addCollider(x - hx, y, z - hz, x + hx, y + 1.95, z + hz, true);
  return o;
}

// ------------------------------------------------------------------ toll rooms
// A puzzle room (plates + lock) in front of a vault holding the LEVEL 5 door.
function tollRoom(c, rng, at, level, main) {
  const px = Math.max(1, Math.min(CS - 8, at.lx - 3)), pz = Math.max(1, Math.min(CS - 11, at.lz - 4));
  fillRect(c, px - 1, pz - 1, px + 6, pz + 10, 0);
  // vault (3x3) at the north, door tile, then the plate room (6x5)
  carveRect(c, px + 1, pz, px + 3, pz + 2, { floor: 0, ceil: 3.2, fmat: 2, cmat: 1, flags: F_ROOM | F_RESERVED | F_LANDMARK });
  openTile(c, px + 2, pz + 3, { floor: 0, ceil: 2.8, fmat: 2, cmat: 1, flags: F_RESERVED | F_LANDMARK });
  carveRect(c, px, pz + 4, px + 5, pz + 8, { floor: 0, ceil: 3.4, fmat: 0, cmat: 0, flags: F_ROOM | F_RESERVED });
  // the way in: south doorway, then a corridor down to open floor
  for (let z = pz + 9; z < CS; z++) {
    const i = z * CS + px + 2;
    if (c.type[i] === T_FLOOR && z > pz + 9) break;
    openTile(c, px + 2, z, { floor: 0, ceil: CE, fmat: 0, cmat: 0 });
  }
  const seed = hash4(c.cx, c.cz, level.levelSeed, 61);
  const n = 3 + (seed % 3);
  const variant = (seed >> 3) % 2 ? 'plaque' : 'tones';
  const words = WORDS.slice().sort((a, b) => hash4(seed, a.charCodeAt(0) * 31 + a.length) - hash4(seed, b.charCodeAt(0) * 31 + b.length)).slice(0, n);
  const pitches = PENTA.slice().sort((a, b) => hash4(seed, a | 0) - hash4(seed, b | 0)).slice(0, n);
  const rx0 = c.x0 + px * TILE, rz0 = c.z0 + (pz + 4) * TILE;
  const lock = addObject(c, { kind: 'toneLock', x: c.tx(px + 2) + 1.55, y: 0, z: c.z0 + (pz + 4) * TILE + 0.01, ry: 0, seed, n, variant, words, scratch: (seed >> 5) % n });
  lock.plates = [];
  for (let i = 0; i < n; i++) {
    const x = rx0 + 1.6 + i * ((6 * TILE - 3.2) / Math.max(1, n - 1)), z = rz0 + 5.2;
    const pl = addObject(c, { kind: 'tonePlate', x, y: 0, z, ry: 0, lock: lock.id, i, word: words[i], color: PLATE_COLORS[i], cname: PLATE_NAMES[i], freq: pitches[i] });
    lock.plates.push(pl.id);
    c.addCollider(x - 0.55, 0, z - 0.55, x + 0.55, 0.18, z + 0.55, true);
  }
  // vault door + LEVEL 5 door inside
  const vx = c.tx(px + 2), vz = c.z0 + (pz + 3) * TILE + 1.0;
  const vd = addObject(c, { kind: 'vaultDoor', x: vx, y: 0, z: vz, ry: 0, lock: lock.id });
  vd.collider = c.addCollider(vx - 1, 0, vz - 0.15, vx + 1, 2.6, vz + 0.15, false);
  lock.vault = vd.id;
  addObject(c, { kind: 'levelDoor', to: level.def.next, label: 'LEVEL 5', x: vx, y: 0, z: c.z0 + pz * TILE + 0.08, ry: 0 });
  addLight(c, { kind: 'none', x: vx, y: 2.4, z: c.z0 + (pz + 1.5) * TILE, color: [0.75, 0.85, 1], intensity: 3, range: 7 });
  if (rng.chance(0.6)) addContainer(c, rng, 'crate', UNIT_LOOT, vx + 1.8, 0, c.z0 + (pz + 0.6) * TILE, 0, [2, 3]);
  // the plate room: cold top light and a window or two
  addLight(c, { kind: 'bulb', cord: 0.3, shade: true, x: rx0 + 6, y: 3.4 - 0.4, z: rz0 + 5, color: [0.95, 0.95, 1], intensity: 3.5, range: 10, flicker: 0.1 });
  addProp(c, 'fakeWindow', rx0 + 0.0, 0, rz0 + 6, Math.PI / 2, { w: 1.6 });
  c.meta.windows.push({ x: rx0, z: rz0 + 6, nx: 1, nz: 0 });
  addDecal(c, { name: 'text1', x: rx0 + 12 - 0.01, y: 1.8, z: rz0 + 4, nx: -1, ny: 0, nz: 0, size: 1.1 });
  if (main) addNote(c, 'l4_c', rx0 + 9, 0.004, rz0 + 8, 0.4);
  c.meta.toll = { lock: lock.id };
}

export default {
  id: 'L4',
  name: 'Level 4',
  title: 'The Quiet Rooms',
  next: 'L5',
  objective: 'Find a toll room. Solve its tone lock to open the vault with the LEVEL 5 door.',
  objectiveText(game) {
    return 'Find a toll room (follow the signs). Press its plates in the order the lock wants to open the vault and reach LEVEL 5.';
  },
  subtitle: 'Daylight through the windows. There is nothing outside them.',
  palette: {
    floor: [{ mat: 'grayCarpet', scale: 2 }, { mat: 'concrete', scale: 3, stairMat: 'concrete' }, { mat: 'laminate', scale: 2 }],
    wall: [{ mat: 'beigeWall', scaleU: 2.4, scaleV: 3, trim: 'trim', trimH: 0.1 }, { mat: 'concrete', scaleU: 3, scaleV: 3 }],
    ceil: [{ mat: 'ggCeiling', scale: 2 }, { mat: 'concrete', scale: 3 }],
    ledge: { mat: 'beigeWall', scale: 2.4 },
    soffit: { mat: 'beigeWall', scaleU: 2.4, scaleV: 3 },
  },
  materials: ['grayCarpet', 'beigeWall', 'ggCeiling', 'trim', 'concrete', 'laminate', 'windowFrame', 'darkWood', 'fabric', 'plastic', 'plasticDark', 'darkMetal', 'paintedMetal', 'chrome', 'cardboard', 'woodCrate', 'glowWhite', 'glowRed', 'glowAmber', 'glowGreen', 'bulbWarm', 'black', 'paper', 'rubber', 'monitorOff'],
  ambient: [0.014, 0.014, 0.013],
  bakeGain: 0.09,
  dynGain: 1.2,
  exposure: 1.1,
  fog: { color: 0x0e0d0b, density: 0.05 },
  background: 0x090807,
  grade: { lift: [0.01, 0.01, 0.0], gamma: [1.0, 1.0, 1.02], gain: [1.04, 1.0, 0.94], saturation: 0.8, tint: [1.02, 1.0, 0.96], vignette: 0.55, grain: 0.045, bloomStrength: 0.5, bloomThreshold: 0.8 },
  hemi: { sky: 0x4a4a40, ground: 0x0c0c0a, intensity: 0.1 },
  dust: { color: 0xfff2d8, opacity: 0.35 },
  portConfig: { min: 1, max: 3, wMin: 1, wMax: 2 },
  ambience: 'quiet',
  surface: 'carpet',
  lockerStyle: 'metal',
  exitStyle: 'plaque',
  notes: ['l4_a', 'l4_b', 'l4_c', 'gen_a'],
  decalTexts: ['THE WINDOWS LIE', 'DON\'T WAVE BACK', 'TOLL PAID', 'LISTEN TO THE LOCK'],
  entities: { primary: 'platsnake', max: 2, spawnCd: 55, minDist: 18, maxDist: 34, rare: ['lookalike'] },
  eventSounds: ['knock', 'distantThud', 'scrape', 'whisper'],
  sideExit: { p: 0.06, minR: 2 },

  landmarks(level) {
    const exit = placeLandmark(level, 'L4exit', 40, 65);
    return [{ type: 'spawn', tx: 8, tz: 8 }, { type: 'exit', ...exit }];
  },

  setupScene(game) {
    // the sky in the windows: a bright painted gradient with soft clouds
    const cv = document.createElement('canvas'); cv.width = 128; cv.height = 128;
    const x = cv.getContext('2d');
    const gr = x.createLinearGradient(0, 128, 0, 0); gr.addColorStop(0, '#f4f1e6'); gr.addColorStop(0.45, '#bcd6ea'); gr.addColorStop(1, '#7eaed6');
    x.fillStyle = gr; x.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 14; i++) { const cx = Math.random() * 128, cy = 30 + Math.random() * 60, r = 8 + Math.random() * 16; const g2 = x.createRadialGradient(cx, cy, 1, cx, cy, r); g2.addColorStop(0, 'rgba(255,255,255,0.7)'); g2.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g2; x.fillRect(cx - r, cy - r, r * 2, r * 2); }
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
    const sky = new THREE.MeshBasicMaterial({ map: tex, color: new THREE.Color(1.25, 1.25, 1.25) });
    game.lib.register('windowSky', sky);
    game.lib.register('lightShaft', new THREE.MeshBasicMaterial({ color: new THREE.Color(0.075, 0.07, 0.055), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
    game.lib.register('lightPool', new THREE.MeshBasicMaterial({ color: new THREE.Color(0.11, 0.1, 0.075), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
    this.figure = null;
  },

  teardownScene(game) {
    if (this.figure) { game.engine.scene.remove(this.figure.mesh); this.figure = null; }
  },

  generate(c, ctx) {
    const { rng, level, landmarks } = ctx;
    const zone = zoneFor(level, c.cx, c.cz);
    c.meta.zone = zone;
    const rooms = genRooms(c, ctx, zone);
    c.meta.windows = [];
    let toll = null;
    for (const lm of landmarks) {
      if (lm.type === 'spawn') carveRect(c, lm.lx - 1, lm.lz - 1, lm.lx + 1, lm.lz + 1, { floor: 0, ceil: CE, fmat: 0, cmat: 0, flags: F_RESERVED });
      if (lm.type === 'exit') toll = { lx: lm.lx, lz: lm.lz, main: true };
    }
    if (!toll) { const se = sideExitAt(level, c.cx, c.cz); if (se) toll = { lx: se.lx, lz: se.lz }; }
    const tollRooms = [];
    if (toll) {
      // rooms the toll room overwrote are gone
      const px = Math.max(1, Math.min(CS - 8, toll.lx - 3)), pz = Math.max(1, Math.min(CS - 11, toll.lz - 4));
      for (const r of rooms) if (r.x + r.w > px - 1 && r.x < px + 7 && r.z + r.h > pz - 1 && r.z < pz + 11) r.removed = true;
      tollRoom(c, rng, toll, level, toll.main);
    }
    ensureConnected(c, ctx.ports, () => ({ floor: 0, ceil: CE, fmat: 0, cmat: 0 }));
    const keep = c.meta.windows;
    dress(c, ctx, rooms.filter(r => !r.removed), this);
    c.meta.windows.push(...keep);
    // arrival: a note where you land
    if (landmarks.some(l => l.type === 'spawn')) addNote(c, 'l4_a', c.tx(8) + 0.5, 0.004, c.tz(8) + 0.6, 0.6);
    addLevelDoor(c, level, rng, 'L3', { p: 0.03, minR: 3, salt: 1501, label: 'LEVEL 3' });
    // signs toward the nearest toll room
    const goal = nearestExit(level, c.x0 + 16, c.z0 + 16);
    const ws = wallSpots(c, (lx, lz, i) => !(c.flags[i] & F_ROOM));
    if (!addPortArrow(c, rng, ctx.ports, goal, { count: 1 }) && rng.chance(0.5)) addWayfinding(c, rng, ws, goal, { name: 'arrow' });
    if (rng.chance(0.2) && ws.length) { const s = rng.pick(ws), p = wallPos(c, s); addDecal(c, { name: rng.pick(['text0', 'text1', 'text2', 'text3']), x: p.x, y: rng.float(1.2, 1.7), z: p.z, nx: s.nx, ny: 0, nz: s.nz, size: 0.9 }); }
    if (rng.chance(0.05)) addVignette(c, rng, addProp, this.notes);
    for (let k = rng.int(0, 1); k > 0; k--) {
      const lx = rng.int(0, CS - 1), lz = rng.int(0, CS - 1), i = lz * CS + lx;
      if (freeTile(c, i)) addPickup(c, rng, LOOT, c.tx(lx), 0, c.tz(lz));
    }
  },

  onEnter(game) {
    window.__etgL4Epoch = epochOf(game);
  },

  // ---- tone locks
  interact(game, o, s) {
    const ep = epochOf(game);
    if (o.kind === 'tonePlate') {
      game.request({ t: 'int', l: 'L4', id: o.id, a: 'press' });
    } else if (o.kind === 'toneLock') {
      if (lockSolved(game, o, s)) { game.subtitle('The lock gives a soft, steady tone.', 2); return; }
      const order = lockOrder(o, ep);
      if (o.variant === 'plaque') {
        // the plaque lists the words in order; one is scratched out
        const list = order.map((i, k) => (k === o.scratch ? '██████' : o.words[i]));
        game.subtitle(`The plaque reads: ${list.join(' — ')}`, 6);
      } else {
        // it plays the order, lighting each plate as it sounds
        game.subtitle('The lock hums a short phrase. The plates answer it, one by one.', 3);
        const plates = o.plates.map(id => game.objects.all.get(id)?.o).filter(Boolean);
        order.forEach((i, k) => setTimeout(() => {
          const p = plates[i]; if (!p) return;
          FLASH.set(p.id, performance.now() + 700);
          game.sfx('plateTone', { x: p.x, y: 0.5, z: p.z }, { freq: p.freq, volume: 0.9 });
        }, 600 + k * 750));
      }
    } else if (o.kind === 'vaultDoor') {
      if (vaultOpen(game, o, s)) return;
      if (game.inventory.has('level5Key')) {
        game.inventory.consume('level5Key', 1);
        game.request({ t: 'int', l: 'L4', id: o.id, a: 'key' });
        game.sfx('unlock', o, {});
      } else { game.sfx('doorLocked', o, {}); game.subtitle('Steel, and no keyhole you can use. The lock beside it decides.', 2.5); }
    } else if (o.kind === 'fakeDoor') {
      game.sfx('knock', o, { volume: 0.7 });
      game.subtitle(['The door is painted on.', 'Paint, over plaster. The handle is painted too.', 'You knock. Something knocks back, very far away.'][Math.floor(Math.random() * 3)], 2.5);
    }
  },

  hostInteract(game, pid, o, s, m) {
    const ep = epochOf(game);
    const lvl = game.getLevel('L4');
    const findObj = id => { for (const ch of lvl.chunks.values()) { const f = ch.objects.find(x => x.id === id); if (f) return f; } return null; };
    const openVault = (lock, vaultId) => {
      const vd = findObj(vaultId);
      game.hostBroadcast({ t: 'os', l: 'L4', id: vaultId, s: { op: true, ep } });
      if (vd?.collider) vd.collider.disabled = true;
      if (lock) game.hostBroadcast({ t: 'os', l: 'L4', id: lock.id, s: { solved: true, ep, input: [] } });
      const at = vd || o;
      game.hostEvent('L4', { k: 'sound', name: 'lockOpen', x: at.x, y: 1.2, z: at.z, volume: 1 });
      game.hostEvent('L4', { k: 'subtitle', text: 'The vault door unseals with a long sigh of air. Behind it: a door marked 5.', dur: 3.5 });
    };
    if (o.kind === 'tonePlate' && m.a === 'press') {
      const lock = findObj(o.lock);
      if (!lock) return;
      let ls = game.world.get('L4', lock.id) || {};
      if (ls.ep !== ep) ls = { input: [], ep };
      game.hostEvent('L4', { k: 'tone', id: o.id, x: o.x, z: o.z, freq: o.freq });
      if (ls.solved) return;
      const order = lockOrder(lock, ep);
      const input = [...(ls.input || []), o.i];
      const ok = input.every((v, k) => v === order[k]);
      if (!ok) {
        game.hostBroadcast({ t: 'os', l: 'L4', id: lock.id, s: { input: [], ep } });
        setTimeout(() => game.hostEvent('L4', { k: 'sound', name: 'lockBuzz', x: lock.x, y: 1.4, z: lock.z, volume: 1 }), 350);
        game.hostEvent('L4', { k: 'subtitle', text: `${o.word}. The lock coughs and resets.`, dur: 2 });
        game.noises.push({ x: o.x, y: 0, z: o.z, r: 18, l: 'L4', pid });
        return;
      }
      if (input.length < order.length) {
        game.hostBroadcast({ t: 'os', l: 'L4', id: lock.id, s: { input, ep } });
        game.hostEvent('L4', { k: 'subtitle', text: `${o.word} accepted. ${order.length - input.length} to go.`, dur: 1.6 });
        return;
      }
      setTimeout(() => openVault(lock, lock.vault), 500);
    } else if (o.kind === 'vaultDoor' && m.a === 'key' && !vaultOpen(game, o, s)) {
      openVault(findObj(o.lock), o.id);
    }
  },

  clientEvent(game, m) {
    if (m.k === 'tone') {
      FLASH.set(m.id, performance.now() + 700);
      game.sfx('plateTone', { x: m.x, y: 0.5, z: m.z }, { freq: m.freq, volume: 1 });
    }
  },

  // the epoch changes when someone comes back to an empty Level 4
  hostArrive(game, pid) {
    const others = [...game.pstate].some(([id, s]) => id !== pid && s.lvl === 'L4') || (pid !== game.myId && game.levelId === 'L4');
    if (!others) game.hostBroadcast({ t: 'flag', l: 'L4', k: 'epoch', v: epochOf(game) + 1 });
  },

  onFlag(game, l, k) {
    if (l !== 'L4' || k !== 'epoch') return;
    window.__etgL4Epoch = epochOf(game);
    for (const ch of game.getLevel('L4').chunks.values()) this.applyRuntime(game, null, ch);
  },

  applyRuntime(game, level, c) {
    for (const o of c.objects) if (o.kind === 'vaultDoor' && o.collider) o.collider.disabled = vaultOpen(game, o, game.world.get('L4', o.id));
  },

  // ---- dark figures behind the windows when sanity is low
  clientUpdate(game, dt) {
    const P = game.player.pos;
    const F = this.figure;
    if (F) {
      F.t += dt;
      const cam = game.engine.camera;
      const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
      const to = new THREE.Vector3(F.mesh.position.x - cam.position.x, F.mesh.position.y - cam.position.y, F.mesh.position.z - cam.position.z);
      const d = to.length(); to.normalize();
      const looking = dir.dot(to) > 0.975 && d < 22;
      if (looking) { F.seen += dt; if (!F.noticed) { F.noticed = true; game.stats.scare(4); } }
      // it steps out of view when stared at, or when its time is up
      if (F.seen > 0.9 || F.t > F.life) F.leaving = true;
      F.op = F.leaving ? Math.max(0, F.op - dt * 1.6) : Math.min(1, F.op + dt * 0.8);
      if (F.leaving) F.mesh.position.addScaledVector(F.side, dt * 0.6);
      F.mesh.material.opacity = F.op * 0.92;
      if (F.leaving && F.op <= 0) { game.engine.scene.remove(F.mesh); this.figure = null; this.figCd = 8 + Math.random() * 14; }
      return;
    }
    this.figCd = (this.figCd ?? 6) - dt;
    if (this.figCd > 0 || game.stats.sanity >= 50) return;
    this.figCd = 3 + Math.random() * 6;
    if (Math.random() > 0.5) return;
    // a window in front of the player, not too close, in line of sight
    const cam = game.engine.camera;
    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
    const cands = [];
    const ccx = Math.floor(P.x / 32), ccz = Math.floor(P.z / 32);
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      for (const w of game.level.chunks.get((ccx + dx) + ',' + (ccz + dz))?.meta.windows || []) {
        const vx = w.x - P.x, vz = w.z - P.z, d = Math.hypot(vx, vz);
        if (d < 4 || d > 20) continue;
        if ((vx * dir.x + vz * dir.z) / d < 0.55) continue;
        if (vx * w.nx + vz * w.nz > 0) continue; // must face us
        if (!game.level.lineOfSight(P.x, P.y + 1.5, P.z, w.x + w.nx * 0.3, 1.6, w.z + w.nz * 0.3)) continue;
        cands.push(w);
      }
    }
    if (!cands.length) return;
    const w = cands[Math.floor(Math.random() * cands.length)];
    if (!this.figTex) this.figTex = makeFigureTexture();
    const far = Math.random() < 0.6;
    const h = far ? 0.7 + Math.random() * 0.35 : 1.35;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(h * 0.55, h), new THREE.MeshBasicMaterial({ map: this.figTex, transparent: true, opacity: 0, depthWrite: false, color: 0x000000, fog: false }));
    const ux = w.nz, uz = -w.nx; // along the wall
    const off = (Math.random() - 0.5) * 0.9;
    mesh.position.set(w.x + w.nx * 0.025 + ux * off, far ? 0.95 + h / 2 : 0.9 + h / 2 - 0.05, w.z + w.nz * 0.025 + uz * off);
    mesh.rotation.y = Math.atan2(w.nx, w.nz);
    mesh.renderOrder = 2;
    game.engine.scene.add(mesh);
    this.figure = { mesh, t: 0, life: 3 + Math.random() * 5, seen: 0, op: 0, leaving: false, side: new THREE.Vector3(ux, 0, uz).multiplyScalar(Math.random() < 0.5 ? 1 : -1) };
  },
};

// A soft-edged human silhouette: head, shoulders, a body that fades out.
function makeFigureTexture() {
  const c = document.createElement('canvas'); c.width = 64; c.height = 128;
  const x = c.getContext('2d');
  x.fillStyle = '#fff';
  x.filter = 'blur(2px)';
  x.beginPath(); x.ellipse(32, 20, 10, 12, 0, 0, Math.PI * 2); x.fill();
  x.beginPath(); x.moveTo(14, 44); x.quadraticCurveTo(32, 30, 50, 44); x.lineTo(54, 128); x.lineTo(10, 128); x.closePath(); x.fill();
  x.fillRect(29, 28, 6, 10);
  const t = new THREE.CanvasTexture(c);
  // use the drawn shape as alpha; the mesh colour is black
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
