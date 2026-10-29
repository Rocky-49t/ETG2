// Level 1 — Industrial Tunnels. Brick service corridors full of pipes,
// machine halls, boiler rooms with furnaces, storage, break rooms and a
// foreman's office. Exit: the SERVICE DOOR, opened with a keycard.
import * as THREE from 'three';
import { TILE, CS, T_SOLID, T_FLOOR, F_ROOM, F_DARK, F_RESERVED, F_LANDMARK, OPEN_SKY } from '../chunk.js';
import { openPorts, ensureConnected, carveRect, fillRect, openTile, carveL, portTiles } from '../gen.js';
import { placeLandmark } from '../level.js';
import { addProp, registerProps } from '../props.js';
import { addLight, addDecal, addObject, addPickup, addContainer, addNote, addLocker, wallSpots, wallPos, yawFor, freeTile, addWayfinding } from './common.js';
import { hash01 } from '../../core/rng.js';
import { registerObjectKind } from '../../game/objects.js';
import { ITEMS } from '../../game/items.js';

const LOOT = [
  ['almondWater', 18], ['waterBottle', 12], ['snackBar', 14], ['cannedBeans', 8], ['battery', 14, [1, 2]], ['bandage', 12],
  ['flare', 10, [1, 2]], ['lighter', 6], ['ammo9', 10, [6, 12]], ['glowstick', 8, [1, 2]], ['crowbar', 3], ['knife', 3], ['pistol', 2], ['ductTape', 4], [null, 18],
];
const CRATE_LOOT = [
  ['flare', 16, [1, 2]], ['ammo9', 16, [8, 15]], ['battery', 12, [1, 3]], ['cannedBeans', 10], ['waterBottle', 10], ['bandage', 10], ['medkit', 3],
  ['lighter', 6], ['pistol', 4], ['shells', 4, [3, 6]], ['crowbar', 4], ['ductTape', 6], ['energyDrink', 5], [null, 10],
];

const ORANGE = [1, 0.62, 0.3];

registerProps({
  furnace: {
    colliders: [[-0.9, 0, -0.7, 0.9, 2.4, 0.7]],
    build(p, B) {
      B.box('brick', 0, 1.2, 0, 1.8, 2.4, 1.4, 1);
      B.box('darkMetal', 0, 0.75, 0.71, 1.0, 0.8, 0.04, 0.5);
      B.box('glowAmber', 0, 0.62, 0.735, 0.7, 0.35, 0.01, 0.5);
      for (let i = 0; i < 5; i++) B.box('darkMetal', -0.3 + i * 0.15, 0.62, 0.745, 0.03, 0.4, 0.02, 0.3);
      B.tube('rustMetal', 0, 2.4, -0.2, 0, 3.6, -0.2, 0.22, 10);
    },
  },
  boiler: {
    colliders: [[-1.6, 0, -0.8, 1.6, 2.0, 0.8]],
    build(p, B) {
      B.setTransform(p.x, p.y + 1.05, p.z, p.ry);
      const m = B.M.clone();
      const rz = new (m.constructor)().makeRotationZ(Math.PI / 2);
      B.setMatrix(m.multiply(rz));
      B.cyl('rustMetal', 0, -1.5, 0, 0.75, 3.0, 18, true, 0.75, 1.5);
      for (const y of [-1.2, -0.4, 0.4, 1.2]) B.cyl('darkMetal', 0, y, 0, 0.77, 0.06, 18, false);
      B.setTransform(p.x, p.y, p.z, p.ry);
      for (const x of [-1.1, 1.1]) B.box('darkMetal', x, 0.15, 0, 0.2, 0.3, 1.2, 0.5);
      B.tube('rustMetal', 0.8, 1.7, 0, 0.8, 3.2, 0, 0.1, 8);
      B.cyl('glowRed', -1.2, 1.5, 0.76, 0.05, 0.02, 8);
    },
  },
  controlPanel: {
    colliders: [[-0.6, 0, -0.3, 0.6, 1.3, 0.3]],
    build(p, B, rng) {
      B.box('paintedMetal', 0, 0.55, 0, 1.2, 1.1, 0.6, 1);
      B.setTransform(p.x, p.y + 1.1, p.z, p.ry);
      B.box('paintedMetal', 0, 0.12, -0.05, 1.2, 0.24, 0.5, 1);
      for (let i = 0; i < 8; i++) {
        const mat = (rng ? rng.next() : 0.5) < 0.3 ? 'glowRed' : (rng ? rng.next() : 0.5) < 0.5 ? 'glowGreen' : 'glowAmber';
        B.box(mat, -0.45 + i * 0.13, 0.26, 0.05, 0.05, 0.02, 0.05, 0.1);
      }
      B.box('monitorOff', 0, 0.17, 0.205, 0.5, 0.15, 0.01, 0.5);
    },
  },
  workbench: {
    colliders: [[-1.0, 0, -0.4, 1.0, 0.95, 0.4]],
    build(p, B, rng) {
      B.box('woodCrate', 0, 0.88, 0, 2.0, 0.08, 0.8, 1);
      for (const sx of [-0.9, 0.9]) for (const sz of [-0.32, 0.32]) B.box('darkMetal', sx, 0.42, sz, 0.06, 0.84, 0.06, 0.5);
      B.box('woodCrate', 0, 0.2, 0, 1.9, 0.04, 0.7, 1);
      B.box('rustMetal', -0.5, 0.97, -0.1, 0.4, 0.12, 0.25, 0.4);
      B.box('darkMetal', 0.4, 0.95, 0.1, 0.3, 0.06, 0.06, 0.3);
      B.box('pillarPaint', 0, 1.6, -0.38, 2.0, 1.2, 0.04, 1);
      for (let i = 0; i < 6; i++) B.box('darkMetal', -0.8 + i * 0.3, 1.5 + (i % 2) * 0.2, -0.33, 0.04, 0.3, 0.04, 0.2);
    },
  },
  conduit: {
    colliders: null,
    build(p, B) {
      const h = p.h || 2.5;
      B.box('darkMetal', 0, h / 2, 0.03, 0.08, h, 0.06, 0.5);
      B.box('darkMetal', 0, h * 0.55, 0.06, 0.25, 0.35, 0.12, 0.3);
      B.box('hazard', 0, h * 0.55, 0.121, 0.2, 0.06, 0.005, 0.3);
    },
  },
  serviceFrame: {
    colliders: null,
    build(p, B) {
      // hazard frame around the service door (local -z is the wall)
      B.box('hazard', -1.05, 1.3, 0.04, 0.2, 2.6, 0.08, 0.6);
      B.box('hazard', 1.05, 1.3, 0.04, 0.2, 2.6, 0.08, 0.6);
      B.box('hazard', 0, 2.65, 0.04, 2.3, 0.2, 0.08, 0.6);
      B.box('darkMetal', 1.4, 1.35, 0.06, 0.18, 0.28, 0.1, 0.3);
    },
  },
});

// The service door: a heavy shutter with a keycard reader.
registerObjectKind('serviceDoor', {
  build(o, game) {
    const g = new THREE.Group();
    const shutter = new THREE.Group();
    const mat = game.lib.dyn('paintedMetal');
    for (let i = 0; i < 9; i++) {
      const slat = new THREE.Mesh(new THREE.BoxGeometry(1.95, 0.27, 0.07), mat);
      slat.position.set(0, 0.14 + i * 0.28, 0);
      slat.castShadow = true;
      shutter.add(slat);
    }
    g.add(shutter);
    const led = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.02), new THREE.MeshBasicMaterial({ color: 0xff2010 }));
    led.position.set(1.4, 1.42, 0.12);
    g.add(led);
    g.userData.shutter = shutter;
    g.userData.led = led;
    return g;
  },
  prompt(o, s, game) {
    if (s?.open) return null;
    return game.inventory.has('keycard') ? 'Swipe service keycard' : 'Service door — keycard required';
  },
  radius: 1.3,
  centerY: 0.8,
  animate(mesh, o, s, dt) {
    const k = mesh.userData.k = (mesh.userData.k ?? 0) + ((s?.open ? 1 : 0) - (mesh.userData.k ?? 0)) * Math.min(1, dt * 0.8);
    mesh.userData.shutter.position.y = k * 2.45;
    mesh.userData.shutter.scale.y = 1 - k * 0.85;
    mesh.userData.led.material.color.set(s?.open ? 0x30ff60 : 0xff2010);
  },
});

function zoneRooms(c, rng, isStart) {
  fillRect(c, 0, 0, CS - 1, CS - 1, 0);
  const rooms = [];
  const types = [['machine', 3], ['storage', 3], ['boiler', 2], ['breakroom', 1.5], ['office', 1], ['pump', 1]];
  const tries = 26;
  for (let k = 0; k < tries && rooms.length < 4; k++) {
    const type = rng.weighted(types);
    const [wmin, wmax] = type === 'machine' ? [6, 9] : type === 'boiler' ? [5, 7] : type === 'office' ? [3, 4] : [4, 6];
    const w = rng.int(wmin, wmax), h = rng.int(wmin, wmax);
    const x = rng.int(1, CS - 1 - w), z = rng.int(1, CS - 1 - h);
    if (rooms.some(r => x < r.x + r.w + 1 && x + w + 1 > r.x && z < r.z + r.h + 1 && z + h + 1 > r.z)) continue;
    rooms.push({ type, x, z, w, h, cx: x + (w >> 1), cz: z + (h >> 1) });
  }
  for (const r of rooms) {
    const ceil = r.type === 'machine' ? 5.5 : r.type === 'boiler' ? 4.5 : 3.2;
    carveRect(c, r.x, r.z, r.x + r.w - 1, r.z + r.h - 1, { floor: 0, ceil, fmat: r.type === 'machine' && rng.chance(0.5) ? 1 : 0, cmat: r.type === 'machine' ? 1 : 0, flags: F_ROOM });
    for (let z = r.z; z < r.z + r.h; z++) for (let x = r.x; x < r.x + r.w; x++) c.wmat[z * CS + x] = 0;
  }
  return rooms;
}

export default {
  id: 'L1',
  name: 'Level 1',
  title: 'Industrial Tunnels',
  next: 'L2',
  objective: 'Find the service keycard and open the SERVICE DOOR.',
  objectiveText(game) {
    if (game.world.flag('L1', 'serviceDoor')) return 'The service door is open. Go through.';
    return game.inventory.has('keycard') ? 'You have the keycard. Find the SERVICE DOOR (hazard-striped frame).' : 'Find the service keycard (foreman\'s office or break room), then the SERVICE DOOR.';
  },
  subtitle: 'Brick, steam and the smell of hot iron.',
  palette: {
    floor: [{ mat: 'industrialFloor', scale: 4 }, { mat: 'grate', scale: 1 }, { mat: 'black', scale: 2 }],
    wall: [{ mat: 'brick', scaleU: 2.4, scaleV: 2.4, vBase: 'abs' }, { mat: 'concrete', scaleU: 3, scaleV: 3, vBase: 'abs' }],
    ceil: [{ mat: 'concrete', scale: 3 }, { mat: 'rustMetal', scale: 2 }],
    ledge: { mat: 'concrete', scale: 2 },
    soffit: { mat: 'brick', scaleU: 2.4, scaleV: 2.4 },
  },
  materials: ['industrialFloor', 'grate', 'brick', 'concrete', 'rustMetal', 'darkMetal', 'paintedMetal', 'hazard', 'woodCrate', 'cardboard', 'pillarPaint', 'black', 'glowAmber', 'glowRed', 'glowGreen', 'bulbWarm', 'glowWhite', 'monitorOff', 'laminate', 'plastic', 'chrome', 'paper', 'rubber', 'bone', 'plasticDark', 'fabric'],
  ambient: [0.028, 0.017, 0.01],
  bakeGain: 0.1,
  exposure: 1.05,
  fog: { color: 0x150c06, density: 0.06 },
  background: 0x080503,
  grade: { lift: [0.02, 0.01, 0.0], gamma: [1.0, 1.0, 1.05], gain: [1.12, 0.98, 0.82], saturation: 0.95, tint: [1, 0.96, 0.9], vignette: 0.55, grain: 0.055, bloomStrength: 0.7, bloomThreshold: 0.78 },
  hemi: { sky: 0x4a3020, ground: 0x0e0806, intensity: 0.16 },
  dust: { color: 0xffc890, opacity: 0.3 },
  portConfig: { min: 1, max: 2, wMin: 1, wMax: 2 },
  ambience: 'tunnels',
  surface: 'concrete',
  notes: ['l1_a', 'l1_b', 'l1_c', 'l1_d', 'l1_e', 'gen_a', 'gen_c'],
  decalTexts: ['SERVICE EXIT', 'DOGS HATE FIRE', 'KEEP MOVING', 'NOT DOGS'],
  entities: { primary: 'marrowhound', max: 2, pack: [2, 3], spawnCd: 55, minDist: 24, maxDist: 40, rare: ['lookalike'] },
  eventSounds: ['metalGroan', 'distantThud', 'steamHiss', 'howl', 'knock'],

  landmarks(level) {
    const exit = placeLandmark(level, 'L1exit', 45, 75);
    // keys on roughly the opposite side from the exit, nearer the start
    const ea = Math.atan2(exit.tz - 8, exit.tx - 8);
    const key = placeLandmark(level, 'L1key', 22, 38, [ea + 1.4, ea + 2.4]);
    const key2 = placeLandmark(level, 'L1key2', 30, 50, [ea - 2.4, ea - 1.2]);
    return [{ type: 'spawn', tx: 8, tz: 8 }, { type: 'exit', ...exit }, { type: 'key', ...key }, { type: 'key2', ...key2 }];
  },

  staticFires(level, x, z) {
    const out = [];
    const cx = Math.floor(x / 32), cz = Math.floor(z / 32);
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      if (!level.hasChunk(cx + dx, cz + dz)) continue;
      for (const f of level.chunk(cx + dx, cz + dz).meta.fires || []) out.push(f);
    }
    return out;
  },

  generate(c, ctx) {
    const { rng, level, ports, landmarks } = ctx;
    const corridor = (x, z) => ({ floor: 0, ceil: 3.0, fmat: 0, cmat: 0 });
    const rooms = zoneRooms(c, rng);
    // landmark rooms override
    for (const lm of landmarks) {
      const lx = Math.max(3, Math.min(CS - 4, lm.lx)), lz = Math.max(3, Math.min(CS - 4, lm.lz));
      let type = lm.type === 'spawn' ? 'start' : lm.type === 'exit' ? 'exit' : lm.type === 'key' ? 'office' : 'breakroom';
      const w = type === 'exit' ? 6 : 5, h = type === 'exit' ? 5 : 4;
      const r = { type, x: Math.max(1, lx - (w >> 1)), z: Math.max(1, lz - (h >> 1)), w, h, landmark: lm.type };
      r.cx = r.x + (w >> 1); r.cz = r.z + (h >> 1);
      // remove overlapping procedural rooms (fill them back in)
      for (let i = rooms.length - 1; i >= 0; i--) {
        const o = rooms[i];
        if (r.x < o.x + o.w + 1 && r.x + r.w + 1 > o.x && r.z < o.z + o.h + 1 && r.z + r.h + 1 > o.z) { fillRect(c, o.x, o.z, o.x + o.w - 1, o.z + o.h - 1, 0); rooms.splice(i, 1); }
      }
      carveRect(c, r.x, r.z, r.x + r.w - 1, r.z + r.h - 1, { floor: 0, ceil: 3.3, fmat: 0, cmat: 0, flags: F_ROOM });
      rooms.push(r);
    }
    // corridors: chain rooms, then ports to nearest room
    const order = [...rooms].sort((a, b) => a.cx - b.cx || a.cz - b.cz);
    for (let i = 0; i < order.length - 1; i++) carveL(c, order[i].cx, order[i].cz, order[i + 1].cx, order[i + 1].cz, corridor(), rng, rng.chance(0.3) ? 2 : 1);
    openPorts(c, ports, corridor, 1);
    for (const [px, pz] of portTiles(ports)) {
      let best = null, bd = 1e9;
      for (const r of rooms) { const d = Math.abs(r.cx - px) + Math.abs(r.cz - pz); if (d < bd) { bd = d; best = r; } }
      if (best) carveL(c, px, pz, best.cx, best.cz, corridor(), rng, 1);
      else carveL(c, px, pz, 8, 8, corridor(), rng, 1);
    }
    if (!rooms.length) carveRect(c, 6, 6, 9, 9, corridor());
    // re-carve rooms so corridors didn't lower their ceilings
    for (const r of rooms) {
      const ceil = r.type === 'machine' ? 5.5 : r.type === 'boiler' ? 4.5 : 3.3;
      for (let z = r.z; z < r.z + r.h; z++) for (let x = r.x; x < r.x + r.w; x++) { const i = z * CS + x; c.ceil[i] = ceil; c.flags[i] |= F_ROOM; }
    }
    ensureConnected(c, ports, corridor);

    const exitL = level.byType.exit;
    const exitW = { x: (exitL.tx + 0.5) * TILE, z: (exitL.tz + 0.5) * TILE };
    c.meta.fires = [];
    c.meta.vents = [];

    // ---- corridor dressing: pipes along walls, wall lamps
    for (let lz = 0; lz < CS; lz++) for (let lx = 0; lx < CS; lx++) {
      const i = lz * CS + lx;
      if (c.type[i] !== T_FLOOR || (c.flags[i] & F_ROOM)) continue;
      const x = c.tx(lx), z = c.tz(lz), ce = c.ceil[i];
      const solid = (dx, dz) => { const nx = lx + dx, nz = lz + dz; return nx < 0 || nz < 0 || nx >= CS || nz >= CS ? false : c.type[nz * CS + nx] === T_SOLID; };
      const tx = c.cx * CS + lx, tz = c.cz * CS + lz;
      if (solid(0, -1)) addProp(c, 'pipeRun', x, ce, z - 0.82, 0, { len: 2.02, n: (tz % 3) + 1 });
      else if (solid(1, 0)) addProp(c, 'pipeRun', x + 0.82, ce, z, Math.PI / 2, { len: 2.02, n: (tx % 2) + 1 });
      if ((tx + tz * 3) % 5 === 0) {
        const sides = [[0, -1], [0, 1], [-1, 0], [1, 0]].filter(([dx, dz]) => solid(dx, dz));
        if (sides.length) {
          const [dx, dz] = sides[0];
          const dead = rng.chance(0.12);
          addLight(c, { kind: 'cage', x: x + dx * 0.88, y: 2.3, z: z + dz * 0.88, nx: -dx, nz: -dz, color: ORANGE, intensity: 3.6, range: 8, flicker: !dead && rng.chance(0.15) ? rng.float(0.3, 0.8) : 0, broken: dead });
        }
      }
      // steam vents in some corridor walls
      if (rng.chance(0.012)) {
        const sides = [[0, -1], [0, 1], [-1, 0], [1, 0]].filter(([dx, dz]) => solid(dx, dz));
        if (sides.length) {
          const [dx, dz] = sides[0];
          addProp(c, 'vent', x + dx * 0.98, 0.9, z + dz * 0.98, yawFor(-dx, -dz));
          c.meta.vents.push({ x: x + dx * 0.95, y: 0.6, z: z + dz * 0.95, nx: -dx, nz: -dz, phase: rng.float(0, 10), period: rng.float(5, 9) });
        }
      }
    }

    // ---- rooms
    const spots = wallSpots(c, (lx, lz, i) => freeTile(c, i) && (c.flags[i] & F_ROOM));
    const spotsIn = r => spots.filter(s => s.lx >= r.x && s.lx < r.x + r.w && s.lz >= r.z && s.lz < r.z + r.h);
    const take = (arr) => (arr.length ? arr.splice(rng.int(0, arr.length - 1), 1)[0] : null);
    for (const r of rooms) {
      const x0 = c.x0 + r.x * TILE, z0 = c.z0 + r.z * TILE, W = r.w * TILE, H = r.h * TILE;
      const cxw = x0 + W / 2, czw = z0 + H / 2;
      const rs = spotsIn(r);
      const ceil = c.ceil[r.cz * CS + r.cx];
      // lights: hanging bulbs on a grid
      for (let gz = r.z + 1; gz < r.z + r.h; gz += 3) for (let gx = r.x + 1; gx < r.x + r.w; gx += 3) {
        const broken = rng.chance(0.1);
        addLight(c, { kind: r.type === 'machine' ? 'bulb' : 'bulb', shade: r.type === 'machine' || r.type === 'storage', cord: r.type === 'machine' ? 1.6 : 0.5, x: c.tx(gx), y: ceil - (r.type === 'machine' ? 1.7 : 0.6), z: c.tz(gz), color: ORANGE, intensity: r.type === 'machine' ? 6 : 4, range: r.type === 'machine' ? 11 : 8, flicker: !broken && rng.chance(0.15) ? rng.float(0.2, 0.7) : 0, broken });
      }
      if (r.type === 'machine') {
        for (let k = 0; k < 3; k++) {
          const px = x0 + rng.float(2.4, W - 2.4), pz = z0 + rng.float(2.4, H - 2.4);
          addProp(c, rng.chance(0.5) ? 'machine' : rng.chance(0.5) ? 'tank' : 'boiler', px, 0, pz, rng.int(0, 3) * Math.PI / 2, { w: rng.float(1.4, 2.2) });
        }
        for (let k = 0; k < 2; k++) { const s = take(rs); if (s) { const p = wallPos(c, s, 0.5); addProp(c, 'controlPanel', p.x, 0, p.z, yawFor(s.nx, s.nz)); } }
        for (let k = 0; k < 2; k++) { const s = take(rs); if (s) { const p = wallPos(c, s, 0.05); addProp(c, 'pipeV', p.x, 0, p.z, 0, { h: ceil }); } }
      } else if (r.type === 'storage') {
        for (let k = 0; k < 4; k++) { const s = take(rs); if (s) { const p = wallPos(c, s, 0.3); addProp(c, 'shelf', p.x, 0, p.z, yawFor(s.nx, s.nz)); } }
        for (let k = 0; k < 4; k++) {
          const px = cxw + rng.float(-W / 3, W / 3), pz = czw + rng.float(-H / 3, H / 3);
          const kind = rng.weighted([['crate', 3], ['barrel', 2], ['pallet', 1], ['boxes', 1]]);
          addProp(c, kind, px, 0, pz, rng.float(0, 0.4), { stack: rng.chance(0.3), s: rng.float(0.8, 1.1) });
        }
        const s = take(rs); if (s) { const p = wallPos(c, s, 0.4); addContainer(c, rng, 'crate', CRATE_LOOT, p.x, 0, p.z, yawFor(s.nx, s.nz), [1, 3]); }
      } else if (r.type === 'boiler') {
        const s = take(rs);
        if (s) {
          const p = wallPos(c, s, 0.75);
          addProp(c, 'furnace', p.x, 0, p.z, yawFor(s.nx, s.nz));
          const fx = p.x + s.nx * 0.9, fz = p.z + s.nz * 0.9;
          addLight(c, { kind: 'none', x: fx, y: 0.9, z: fz, color: [1, 0.45, 0.12], intensity: 5, range: 7, flicker: 0.15, noBake: false });
          c.meta.fires.push({ x: fx, z: fz, r: 3.2 });
        }
        addProp(c, 'boiler', cxw, 0, czw, rng.chance(0.5) ? 0 : Math.PI / 2);
        for (let k = 0; k < 2; k++) { const s2 = take(rs); if (s2) { const p = wallPos(c, s2, 0.4); addProp(c, 'barrel', p.x, 0, p.z, 0); } }
      } else if (r.type === 'breakroom' || r.landmark === 'key2') {
        addProp(c, 'table', cxw, 0, czw, 0, { top: 'laminate' });
        for (const [dx, dz, a] of [[-0.9, 0, Math.PI / 2], [0.9, 0, -Math.PI / 2], [0, 0.7, Math.PI]]) addProp(c, 'chair', cxw + dx, 0, czw + dz, a);
        for (let k = 0; k < 2; k++) { const s = take(rs); if (s) { const p = wallPos(c, s, 0.34); addLocker(c, p.x, 0, p.z, yawFor(s.nx, s.nz)); } }
        const s = take(rs); if (s) { const p = wallPos(c, s, 0.32); addProp(c, 'waterCooler', p.x, 0, p.z, yawFor(s.nx, s.nz)); }
        if (r.landmark === 'key2') {
          addObject(c, { kind: 'pickup', item: 'keycard', qty: 1, x: cxw + 0.2, y: 0.79, z: czw - 0.1, ry: 0.4 });
          addNote(c, 'l1_e', cxw - 0.4, 0.79, czw + 0.15, 0.2);
        } else if (rng.chance(0.6)) addNote(c, rng.pick(this.notes), cxw - 0.3, 0.79, czw, 0.3);
      } else if (r.type === 'office' || r.landmark === 'key') {
        const s = take(rs);
        if (s) {
          const p = wallPos(c, s, 0.6);
          addProp(c, 'desk', p.x, 0, p.z, yawFor(s.nx, s.nz) + Math.PI, { monitor: true, papers: true });
          if (r.landmark === 'key') {
            addObject(c, { kind: 'pickup', item: 'keycard', qty: 1, x: p.x + s.nx * 0.05 + s.nz * 0.3, y: 0.78, z: p.z + s.nz * 0.05 - s.nx * 0.3, ry: 1.2 });
            addNote(c, 'l1_a', p.x - s.nz * 0.35, 0.78, p.z + s.nx * 0.35, 0);
          }
        }
        const s2 = take(rs); if (s2) { const p = wallPos(c, s2, 0.32); addContainer(c, rng, 'cabinet', CRATE_LOOT, p.x, 0, p.z, yawFor(s2.nx, s2.nz), [1, 2]); }
        const s3 = take(rs); if (s3) { const p = wallPos(c, s3, 0.6); addProp(c, 'workbench', p.x, 0, p.z, yawFor(s3.nx, s3.nz)); }
        if (r.landmark === 'key') addDecal(c, { name: 'text3', x: cxw, y: 0.005, z: czw, nx: 0, ny: 1, nz: 0, size: 1.4, rot: 0.2 });
      } else if (r.type === 'pump') {
        addProp(c, 'tank', cxw - 1.2, 0, czw, 0);
        addProp(c, 'machine', cxw + 1.4, 0, czw, Math.PI / 2, { w: 1.4 });
      } else if (r.type === 'start') {
        addProp(c, 'ceilingHole', cxw, ceil, czw, 0);
        addProp(c, 'debris', cxw + 0.8, 0, czw + 0.4, 0, { mat: 'concrete' });
        addDecal(c, { name: 'stain', x: cxw, y: 0.005, z: czw, nx: 0, ny: 1, nz: 0, size: 2, rot: 0 });
        const s = take(rs); if (s) { const p = wallPos(c, s, 0.5); addProp(c, 'table', p.x, 0, p.z, yawFor(s.nx, s.nz)); addNote(c, 'l1_b', p.x, 0.79, p.z, 0.4); }
        const s2 = take(rs); if (s2) { const p = wallPos(c, s2, 0.4); addContainer(c, rng, 'crate', [['flare', 10, [1, 2]], ['lighter', 6], ['waterBottle', 5]], p.x, 0, p.z, yawFor(s2.nx, s2.nz), [2, 2]); }
      } else if (r.type === 'exit') {
        // service door set into the wall farthest from the room entrance
        const cand = rs.filter(s => (s.nz !== 0 ? s.lx > r.x && s.lx < r.x + r.w - 1 : s.lz > r.z && s.lz < r.z + r.h - 1));
        const s = cand.length ? cand[Math.floor(cand.length / 2)] : rs[0];
        if (s) {
          const p = wallPos(c, s, 0);
          const ry = yawFor(s.nx, s.nz);
          // carve the stairwell behind the door
          const bx = s.lx - s.nx, bz = s.lz - s.nz;
          openTile(c, bx, bz, { floor: -1.6, ceil: 3.0, fmat: 2, cmat: 0, flags: F_LANDMARK | F_DARK });
          const bi = bz * CS + bx;
          if (bx >= 0 && bz >= 0 && bx < CS && bz < CS) { c.ramp[bi] = s.nx > 0 ? 0 : s.nx < 0 ? 2 : s.nz > 0 ? 1 : 3; c.rampH[bi] = 1.6; }
          const door = addObject(c, { kind: 'serviceDoor', x: p.x + s.nx * 0.04, y: 0, z: p.z + s.nz * 0.04, ry });
          door.collider = c.addCollider(p.x - (s.nz ? 1 : 0.1), 0, p.z - (s.nx ? 1 : 0.1), p.x + (s.nz ? 1 : 0.1), 3, p.z + (s.nx ? 1 : 0.1), false);
          addProp(c, 'serviceFrame', p.x, 0, p.z, ry);
          addObject(c, { kind: 'exit', x: c.tx(bx), y: -0.6, z: c.tz(bz), r: 1.2, to: 'L2', requires: 'serviceDoor' });
          addDecal(c, { name: 'text0', x: p.x + s.nx * 0.01 + s.nz * 1.9, y: 1.8, z: p.z + s.nz * 0.01 - s.nx * 1.9, nx: s.nx, ny: 0, nz: s.nz, size: 1.1 });
          addLight(c, { kind: 'cage', x: p.x + s.nx * 0.12, y: 2.95, z: p.z + s.nz * 0.12, nx: s.nx, nz: s.nz, color: [1, 0.25, 0.15], intensity: 4, range: 7, flicker: 0.3 });
          for (let k = 0; k < 3; k++) addDecal(c, { name: 'arrow', x: p.x + s.nx * (1.5 + k * 0.8), y: 0.005, z: p.z + s.nz * (1.5 + k * 0.8), nx: 0, ny: 1, nz: 0, size: 0.8, rot: Math.atan2(-s.nz, -s.nx) });
        }
      }
    }

    // ---- loose loot, containers, notes, lockers
    for (let k = rng.int(1, 3); k > 0; k--) {
      const lx = rng.int(0, CS - 1), lz = rng.int(0, CS - 1), i = lz * CS + lx;
      if (!freeTile(c, i)) continue;
      addPickup(c, rng, LOOT, c.tx(lx) + rng.float(-0.5, 0.5), 0, c.tz(lz) + rng.float(-0.5, 0.5));
    }
    const allSpots = wallSpots(c, (lx, lz, i) => freeTile(c, i));
    if (rng.chance(0.4)) { const s = take(allSpots); if (s) { const p = wallPos(c, s, 0.3); addContainer(c, rng, 'toolbox', CRATE_LOOT, p.x, 0, p.z, yawFor(s.nx, s.nz), [1, 2]); } }
    if (rng.chance(0.25)) { const s = take(allSpots); if (s) { const p = wallPos(c, s, 0.34); addLocker(c, p.x, 0, p.z, yawFor(s.nx, s.nz)); } }
    if (rng.chance(0.18)) { const s = take(allSpots); if (s) { const p = wallPos(c, s, 0.5); addProp(c, 'crate', p.x, 0, p.z, 0, { s: 0.8 }); addNote(c, rng.pick(this.notes), p.x, 0.81, p.z, 0.5); } }
    // decals & wayfinding (hazard arrows toward the exit)
    const wspots = wallSpots(c);
    if (rng.chance(0.55)) addWayfinding(c, rng, wspots, exitW, { name: 'arrow' });
    if (rng.chance(0.3) && wspots.length) { const s = rng.pick(wspots), p = wallPos(c, s); addDecal(c, { name: rng.pick(['text1', 'text2', 'scratch', 'tally', 'hand']), x: p.x, y: rng.float(1.1, 1.8), z: p.z, nx: s.nx, ny: 0, nz: s.nz, size: rng.float(0.8, 1.1) }); }
    for (let k = rng.int(1, 3); k > 0; k--) {
      const lx = rng.int(0, CS - 1), lz = rng.int(0, CS - 1), i = lz * CS + lx;
      if (c.type[i] !== T_FLOOR || c.ramp[i] >= 0) continue;
      addDecal(c, { name: rng.chance(0.7) ? 'stain' : 'blood2', x: c.tx(lx) + rng.float(-0.5, 0.5), y: 0.005, z: c.tz(lz) + rng.float(-0.5, 0.5), nx: 0, ny: 1, nz: 0, size: rng.float(0.8, 2), rot: rng.float(0, 6.28) });
    }
  },

  // steam vents: periodic bursts that scald; furnace embers
  clientUpdate(game, dt) {
    const P = game.player.pos;
    const cx = Math.floor(P.x / 32), cz = Math.floor(P.z / 32);
    const t = game.time;
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      const ch = game.level.chunks.get((cx + dx) + ',' + (cz + dz));
      if (!ch) continue;
      for (const v of ch.meta.vents || []) {
        const d = Math.hypot(v.x - P.x, v.z - P.z);
        if (d > 18) continue;
        const ph = (t + v.phase) % v.period;
        const bursting = ph < 1.6;
        if (Math.random() < dt * (bursting ? 20 : 2)) game.effects.burst('steam', { x: v.x, y: v.y + 0.3, z: v.z }, { x: v.nx * (bursting ? 2.5 : 0.4), y: 0.1, z: v.nz * (bursting ? 2.5 : 0.4) });
        if (bursting && !v.played) { v.played = true; game.sfx('steamHiss', v, { volume: 0.9, ref: 2 }); }
        if (!bursting) v.played = false;
        if (bursting) {
          // inside the jet?
          const rx = P.x - v.x, rz = P.z - v.z;
          const along = rx * v.nx + rz * v.nz, side = Math.abs(rx * v.nz - rz * v.nx);
          if (along > 0 && along < 2.6 && side < 0.7 && P.y < 1.5) { game.stats.damage(dt * 14, 'steam'); if (Math.random() < dt * 3) game.subtitle('Scalding steam!', 1, 'warn'); }
        }
      }
      for (const f of ch.meta.fires || []) {
        if (Math.hypot(f.x - P.x, f.z - P.z) < 14 && Math.random() < dt * 6) game.effects.burst('ember', { x: f.x + (Math.random() - 0.5) * 0.5, y: 0.8, z: f.z + (Math.random() - 0.5) * 0.5 });
      }
    }
  },

  interact(game, o, s) {
    if (o.kind === 'serviceDoor') {
      if (s?.open) return;
      if (game.inventory.has('keycard')) {
        game.request({ t: 'int', l: 'L1', id: o.id, a: 'swipe' });
        game.sfx('unlock', o, {});
      } else {
        game.sfx('doorLocked', o, {});
        game.subtitle('The reader blinks red. You need the service keycard.', 2.2);
      }
    }
  },

  hostInteract(game, pid, o, s, m) {
    if (o.kind === 'serviceDoor' && m.a === 'swipe' && !s.open) {
      game.hostBroadcast({ t: 'os', l: 'L1', id: o.id, s: { open: true } });
      game.hostBroadcast({ t: 'flag', l: 'L1', k: 'serviceDoor', v: true });
      if (o.collider) o.collider.disabled = true;
      game.hostEvent('L1', { k: 'sound', name: 'metalDoor', x: o.x, y: 1, z: o.z, volume: 1 });
      game.hostEvent('L1', { k: 'subtitle', text: 'The service door grinds open. Stairs lead down into the dark.', dur: 3.5 });
    }
  },

  onFlag(game, l, k, v) {
    if (l === 'L1' && k === 'serviceDoor') {
      // open the door collider on clients too
      for (const ch of game.getLevel('L1').chunks.values()) for (const o of ch.objects) if (o.kind === 'serviceDoor' && o.collider) o.collider.disabled = true;
    }
  },
};
