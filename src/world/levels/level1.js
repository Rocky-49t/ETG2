// Level 1 — Industrial Tunnels. Brick service corridors full of pipes,
// machine halls, boiler rooms with furnaces, storage, break rooms and a
// foreman's office. Exit: the SERVICE DOOR, opened with a keycard.
import * as THREE from 'three';
import { TILE, CS, T_SOLID, T_FLOOR, F_ROOM, F_DARK, F_RESERVED, F_LANDMARK, OPEN_SKY } from '../chunk.js';
import { openPorts, ensureConnected, carveRect, fillRect, openTile, carveL, portTiles } from '../gen.js';
import { placeLandmark } from '../level.js';
import { addProp, registerProps } from '../props.js';
import { addLight, addDecal, addObject, addPickup, addContainer, addNote, addLocker, wallSpots, wallPos, yawFor, freeTile, addWayfinding, addVignette, addHatchExit, addLevelDoor, nearestExit, addPortArrow } from './common.js';
import { hash01 } from '../../core/rng.js';
import { registerObjectKind } from '../../game/objects.js';
import { ITEMS } from '../../game/items.js';

const LOOT = [
  ['dirtyWater', 16], ['cleanWater', 8], ['fireSalts', 14], ['snackBar', 8], ['scrap', 8], ['wire', 6], ['gpsBoard', 2], ['cannedBeans', 8], ['battery', 14, [1, 2]], ['bandage', 12],
  ['flare', 10, [1, 2]], ['lighter', 6], ['ammo9', 10, [6, 12]], ['glowstick', 8, [1, 2]], ['crowbar', 3], ['knife', 10], ['pistol', 2], ['ductTape', 4], [null, 18],
];
const CRATE_LOOT = [
  ['flare', 16, [1, 2]], ['ammo9', 16, [8, 15]], ['battery', 12, [1, 3]], ['cannedBeans', 10], ['cleanWater', 8], ['fireSalts', 10], ['scrap', 8], ['knife', 6], ['bandage', 10], ['medkit', 3],
  ['lighter', 6], ['pistol', 4], ['shells', 4, [3, 6]], ['crowbar', 4], ['ductTape', 6], ['energyDrink', 5], [null, 10],
];

const ORANGE = [1, 0.62, 0.3];
const PARTS = [['gpsBoard', 16], ['antenna', 10], ['wire', 20], ['scrap', 18], ['battery', 14, [1, 2]], ['ductTape', 12], ['knife', 8]];

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
  pipeCap: {
    // pipe run turning up into the ceiling where a wall ends
    colliders: null,
    build(p, B) {
      for (let k = 0; k < (p.n || 2); k++) {
        const r = 0.05 + (k % 3) * 0.03, zz = k * 0.22, yy = -0.15 - (k % 2) * 0.12;
        B.tube(p.mat || 'rustMetal', 0, yy, zz, 0, 0.25, zz, r, 8, 1);
        B.cyl('darkMetal', 0, yy - r * 0.6, zz, r * 1.25, r * 1.2, 8, true);
      }
    },
  },
  generator: {
    colliders: [[-1.4, 0, -0.75, 1.4, 1.9, 0.75]],
    build(p, B) {
      B.box('darkMetal', 0, 0.12, 0, 2.8, 0.24, 1.5, 1);
      B.setTransform(p.x, p.y + 0.95, p.z, p.ry);
      const m = B.M.clone(); m.multiply(new THREE.Matrix4().makeRotationZ(Math.PI / 2)); B.setMatrix(m);
      B.cyl('paintedMetal', 0, -1.1, 0, 0.62, 1.6, 18, true, 0.62, 1.2);
      for (const y of [-0.9, -0.5, -0.1, 0.3]) B.cyl('darkMetal', 0, y, 0, 0.65, 0.06, 18, false);
      B.cyl('rustMetal', 0, 0.5, 0, 0.35, 0.6, 12, true);
      B.setTransform(p.x, p.y, p.z, p.ry);
      B.box('hazard', 0, 0.26, 0.76, 2.8, 0.06, 0.02, 0.5);
      B.box('darkMetal', -1.15, 1.2, 0.5, 0.4, 0.5, 0.3, 0.3);
      B.box('glowRed', -1.15, 1.32, 0.66, 0.08, 0.08, 0.01, 0.1);
      B.tube('rubber', -1.15, 0.95, 0.5, -1.6, 0.05, 0.9, 0.04, 6);
    },
  },
  lathe: {
    colliders: [[-1.1, 0, -0.45, 1.1, 1.3, 0.45]],
    build(p, B) {
      B.box('paintedMetal', 0, 0.45, 0, 2.2, 0.9, 0.8, 1);
      B.box('darkMetal', 0, 0.95, 0, 2.0, 0.1, 0.5, 1);
      B.box('paintedMetal', -0.8, 1.15, 0, 0.45, 0.4, 0.45, 0.5);
      B.box('chrome', 0.1, 1.08, 0, 1.2, 0.04, 0.04, 0.3);
      B.box('paintedMetal', 0.6, 1.1, 0, 0.25, 0.25, 0.3, 0.5);
      B.cyl('darkMetal', -0.8, 1.15, 0.24, 0.08, 0.04, 10, true);
      B.box('rustMetal', 0, 0.02, 0.5, 2.2, 0.03, 0.2, 0.5);
    },
  },
  gaugeWall: {
    colliders: [[-1.2, 0, -0.18, 1.2, 2.4, 0.18]],
    build(p, B, rng) {
      B.box('paintedMetal', 0, 1.2, 0, 2.4, 2.4, 0.34, 1);
      for (let i = 0; i < 6; i++) {
        const x = -0.8 + (i % 3) * 0.8, y = 1.55 + Math.floor(i / 3) * 0.5;
        B.cyl('chrome', x, y, 0.17, 0.14, 0.04, 14, true);
        B.box((rng ? rng.next() : 0.5) < 0.3 ? 'glowRed' : 'pillarPaint', x, y, 0.2, 0.2, 0.2, 0.005, 0.2);
        B.box('black', x + 0.03, y + 0.02, 0.205, 0.1, 0.012, 0.005, 0.1);
      }
      for (let i = 0; i < 10; i++) B.box(i % 3 ? 'glowGreen' : 'glowAmber', -1.0 + i * 0.22, 0.95, 0.175, 0.05, 0.05, 0.01, 0.1);
      B.box('hazard', 0, 0.06, 0.17, 2.4, 0.12, 0.01, 0.5);
    },
  },
  rails: {
    // railway track along local X: ballast, sleepers and two rails
    colliders: null,
    build(p, B, rng) {
      const len = p.len || 2;
      B.box('concrete', 0, 0.04, 0, len, 0.08, 2.6, 2);
      for (let x = -len / 2 + 0.3; x < len / 2; x += 0.62) B.box('woodCrate', x, 0.11, 0, 0.22, 0.08, 2.2, 0.5);
      for (const z of [-0.72, 0.72]) { B.box('rustMetal', 0, 0.2, z, len, 0.1, 0.07, 1); B.box('rustMetal', 0, 0.16, z, len, 0.03, 0.14, 1); }
    },
  },
  trainCar: {
    colliders: [[-4, 0, -1.3, 4, 3.2, 1.3]],
    build(p, B) {
      B.box('rustMetal', 0, 1.7, 0, 8, 2.6, 2.6, 2);
      B.box('darkMetal', 0, 0.3, 0, 7.6, 0.4, 2.0, 1);
      for (let i = 0; i < 5; i++) for (const z of [-1.31, 1.31]) B.box('black', -3 + i * 1.5, 2.2, z, 1.0, 0.8, 0.02, 0.4);
      B.box('paintedMetal', 0, 3.05, 0, 7.8, 0.15, 2.2, 1);
      for (const x of [-2.8, 2.8]) for (const z of [-0.72, 0.72]) B.cyl('darkMetal', x, 0.05, z, 0.32, 0.12, 12, true);
    },
  },
  rubble: {
    colliders: p => [[-1.4, 0, -1.4, 1.4, p.h || 1.6, 1.4]],
    build(p, B, rng) {
      const r = () => (rng ? rng.next() : 0.5);
      for (let k = 0; k < 14; k++) { const s = 0.4 + r() * 0.7; B.box(k % 3 ? 'concrete' : 'brick', (r() - 0.5) * 2.4, s / 2 + r() * (p.h || 1.6) * 0.5, (r() - 0.5) * 2.4, s, s * 0.7, s, 0.5); }
    },
  },
  platformBench: {
    colliders: [[-0.9, 0, -0.25, 0.9, 0.5, 0.25]],
    build(p, B) {
      B.box('woodCrate', 0, 0.45, 0, 1.8, 0.05, 0.42, 1);
      B.box('woodCrate', 0, 0.75, -0.2, 1.8, 0.35, 0.04, 1);
      for (const x of [-0.75, 0.75]) B.box('darkMetal', x, 0.22, 0, 0.06, 0.45, 0.4, 0.3);
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

// Abandoned stations: a platform hall with a track trench running east-west
// through the chunk; the tunnels continue into the neighbouring chunks.
const STATION_ROWS = [10, 11, 12];
export function stationAt(level, cx, cz) {
  if (Math.max(Math.abs(cx), Math.abs(cz)) < 2) return false;
  if (hash01(cx, cz, level.levelSeed, 4401) >= 0.07) return false;
  if (level.landmarks.some(l => Math.floor(l.tx / CS) === cx && Math.floor(l.tz / CS) === cz)) return false;
  // keep stations apart so tunnels never overlap
  return !(hash01(cx - 1, cz, level.levelSeed, 4401) < 0.07 || hash01(cx - 2, cz, level.levelSeed, 4401) < 0.07);
}

function genStation(c, rng) {
  fillRect(c, 0, 0, CS - 1, CS - 1, 0);
  carveRect(c, 1, 3, CS - 2, 9, { floor: 0, ceil: 5.2, fmat: 0, cmat: 0, flags: F_ROOM });
  for (let x = 1; x < CS - 1; x++) c.fmat[9 * CS + x] = 3;              // yellow platform edge
  carveTunnel(c, 0, CS - 1);
  // stairs down from the platform into the trench
  for (const x of [5, 10]) { openTile(c, x, 9, { floor: -1.3, ceil: 5.2, fmat: 0, cmat: 0, flags: F_LANDMARK | F_RESERVED }); const i = 9 * CS + x; c.ramp[i] = 3; c.rampH[i] = 1.3; }
  c.meta.station = { x0: c.x0, z: c.tz(11) };
  // columns, benches, a dead ticket booth, a derailed car in one direction
  for (let x = 2; x < CS - 2; x += 4) addProp(c, 'pillar', c.tx(x), 0, c.tz(6), 0, { w: 0.8, h: 5.2, mat: 'concrete' });
  for (let x = 3; x < CS - 3; x += 4) if (rng.chance(0.7)) addProp(c, 'platformBench', c.tx(x) + 0.5, 0, c.tz(4) - 0.3, Math.PI);
  addProp(c, 'controlPanel', c.tx(13), 0, c.tz(3) - 0.4, Math.PI);
  if (rng.chance(0.6)) addProp(c, 'trainCar', c.x0 + (rng.chance(0.5) ? 7 : 25), -1.3, c.tz(11), rng.float(-0.06, 0.06));
  for (let k = 0; k < 3; k++) addProp(c, 'debris', c.tx(rng.int(2, 13)), 0, c.tz(rng.int(4, 8)), rng.float(0, 6), { mat: 'concrete' });
  for (let x = 2; x < CS - 2; x += 5) addLight(c, { kind: 'cage', x: c.tx(x), y: 3.6, z: c.z0 + 3 * TILE + 0.12, nx: 0, nz: 1, color: [1, 0.7, 0.4], intensity: 4, range: 10, flicker: rng.chance(0.5) ? rng.float(0.3, 0.8) : 0, broken: rng.chance(0.3) });
  addDecal(c, { name: 'lvl0', x: c.tx(7), y: 3.4, z: c.z0 + 3 * TILE + 0.01, nx: 0, ny: 0, nz: 1, size: 3.2 });
  for (const x of [3, 11]) addDecal(c, { name: 'num0', x: c.tx(x), y: 2.6, z: c.z0 + 3 * TILE + 0.01, nx: 0, ny: 0, nz: 1, size: 1.6 });
}

// track trench + rails from local x0..x1 (rubble at a dead end if asked)
function carveTunnel(c, x0, x1, deadEnd) {
  for (let x = x0; x <= x1; x++) {
    for (const z of [9, 13]) { const i = z * CS + x; if (!(c.flags[i] & F_ROOM && z === 9)) c.type[i] = T_SOLID; }
    for (const z of STATION_ROWS) openTile(c, x, z, { floor: -1.3, ceil: 4.6, fmat: 2, cmat: 0, flags: F_LANDMARK | F_RESERVED | F_DARK });
  }
  for (let x = x0; x <= x1; x += 2) addProp(c, 'rails', c.tx(x) + 1, -1.3, c.tz(11), 0, { len: 4.02 });
  for (let x = x0 + 1; x <= x1; x += 4) addProp(c, 'pipeRun', c.tx(x), 4.6 - 1.3, c.z0 + 13 * TILE - 0.18, 0, { len: 8.02, n: 2 });
  if (deadEnd !== undefined) addProp(c, 'rubble', c.tx(deadEnd), -1.3, c.tz(11), 0, { h: 2.4 });
}

function zoneRooms(c, rng, isStart) {
  fillRect(c, 0, 0, CS - 1, CS - 1, 0);
  const rooms = [];
  const types = [['machine', 3], ['storage', 3], ['boiler', 2], ['breakroom', 1.5], ['office', 1.2], ['pump', 1], ['generator', 1.2], ['workshop', 1.2]];
  const tries = 26;
  for (let k = 0; k < tries && rooms.length < 4; k++) {
    const type = rng.weighted(types);
    const [wmin, wmax] = type === 'machine' || type === 'generator' ? [6, 9] : type === 'boiler' ? [5, 7] : type === 'office' ? [3, 4] : [4, 6];
    const w = rng.int(wmin, wmax), h = rng.int(wmin, wmax);
    const x = rng.int(1, CS - 1 - w), z = rng.int(1, CS - 1 - h);
    if (rooms.some(r => x < r.x + r.w + 1 && x + w + 1 > r.x && z < r.z + r.h + 1 && z + h + 1 > r.z)) continue;
    rooms.push({ type, x, z, w, h, cx: x + (w >> 1), cz: z + (h >> 1) });
  }
  for (const r of rooms) {
    const ceil = r.type === 'machine' || r.type === 'generator' ? 5.5 : r.type === 'boiler' ? 4.5 : 3.2;
    r.cmat = r.type === 'machine' || r.type === 'generator' || r.type === 'boiler' ? 1 : 0;
    carveRect(c, r.x, r.z, r.x + r.w - 1, r.z + r.h - 1, { floor: 0, ceil, fmat: r.type === 'machine' && rng.chance(0.5) ? 1 : 0, cmat: r.cmat, flags: F_ROOM });
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
    return game.inventory.has('keycard') ? 'You have the keycard. Find a SERVICE DOOR (hazard-striped frame) — or force a maintenance hatch.' : 'Find a service keycard (foremen\'s offices, break rooms), then a SERVICE DOOR — or find a maintenance hatch in the floor.';
  },
  exitStyle: 'stencil',
  decalLabels: { num0: 'PLATFORM 2', lvl0: 'GOAN LINE  ·  RINGWAY', lvl1: 'LEVEL 0' },
  subtitle: 'Brick, steam and the smell of hot iron.',
  palette: {
    floor: [{ mat: 'industrialFloor', scale: 4 }, { mat: 'grate', scale: 1 }, { mat: 'concrete', scale: 2.5 }, { mat: 'hazard', scale: 1 }],
    wall: [{ mat: 'brick', scaleU: 2.4, scaleV: 2.4, vBase: 'abs' }, { mat: 'concrete', scaleU: 3, scaleV: 3, vBase: 'abs' }],
    ceil: [{ mat: 'concrete', scale: 3 }, { mat: 'rustMetal', scale: 2 }],
    ledge: { mat: 'concrete', scale: 2 },
    soffit: { mat: 'brick', scaleU: 2.4, scaleV: 2.4 },
  },
  materials: ['industrialFloor', 'grate', 'brick', 'concrete', 'rustMetal', 'darkMetal', 'paintedMetal', 'hazard', 'woodCrate', 'cardboard', 'pillarPaint', 'black', 'glowAmber', 'glowRed', 'glowGreen', 'bulbWarm', 'glowWhite', 'monitorOff', 'laminate', 'plastic', 'chrome', 'paper', 'rubber', 'bone', 'plasticDark', 'fabric'],
  ambient: [0.036, 0.023, 0.014],
  bakeGain: 0.16,
  dynGain: 2.2,
  exposure: 1.12,
  fog: { color: 0x150c06, density: 0.06 },
  background: 0x080503,
  grade: { lift: [0.02, 0.01, 0.0], gamma: [1.0, 1.0, 1.05], gain: [1.12, 0.98, 0.82], saturation: 0.95, tint: [1, 0.96, 0.9], vignette: 0.55, grain: 0.055, bloomStrength: 0.5, bloomThreshold: 0.84 },
  hemi: { sky: 0x4a3020, ground: 0x0e0806, intensity: 0.16 },
  dust: { color: 0xffc890, opacity: 0.3 },
  portConfig: { min: 1, max: 2, wMin: 1, wMax: 2 },
  ambience: 'tunnels',
  surface: 'concrete',
  notes: ['l1_a', 'l1_b', 'l1_c', 'l1_d', 'l1_e', 'gen_a', 'gen_c'],
  decalTexts: ['SERVICE EXIT', 'DOGS HATE FIRE', 'KEEP MOVING', 'NOT DOGS'],
  entities: {
    primary: 'marrowhound', max: 2, pack: [2, 3], spawnCd: 55, minDist: 24, maxDist: 40, rare: ['lookalike'],
    // the Scuttler: about a third as common as the hounds, far more so near stations
    secondary: [{ type: 'scuttler', max: 1, spawnCd: 150, chance: 0.5, boost: ctx => ctx.players.some(p => { for (let dx = -1; dx <= 1; dx++) if (stationAt(ctx.level, Math.floor(p.x / 32) + dx, Math.floor(p.z / 32))) return true; return false; }) }],
  },
  eventSounds: ['metalGroan', 'distantThud', 'steamHiss', 'howl', 'knock'],

  sideExit: { p: 0.07, minR: 2 },

  landmarks(level) {
    const exit = placeLandmark(level, 'L1exit', 45, 75);
    // keys on roughly the opposite side from the exit, nearer the start
    const ea = Math.atan2(exit.tz - 8, exit.tx - 8);
    const key = placeLandmark(level, 'L1key', 22, 38, [ea + 1.4, ea + 2.4]);
    const key2 = placeLandmark(level, 'L1key2', 30, 50, [ea - 2.4, ea - 1.2]);
    return [{ type: 'spawn', tx: 8, tz: 8 }, { type: 'exit', ...exit }, { type: 'key', ...key }, { type: 'key2', ...key2 }];
  },

  generateStation(c, ctx) {
    const { rng, level, ports } = ctx;
    genStation(c, rng);
    const corridor = () => ({ floor: 0, ceil: 3.0, fmat: 0, cmat: 0 });
    openPorts(c, ports, corridor, 1);
    for (const [px, pz] of portTiles(ports)) if (pz < 9 || pz > 13) carveL(c, px, pz, Math.max(2, Math.min(13, px)), pz > 13 ? 14 : 6, corridor(), rng, 1);
    // south side: a passage around the trench
    carveRect(c, 1, 14, CS - 2, 14, corridor());
    carveRect(c, 0, 3, 0, 14, corridor());
    for (const z of STATION_ROWS) openTile(c, 0, z, { floor: -1.3, ceil: 4.6, fmat: 2, cmat: 0, flags: F_LANDMARK | F_RESERVED | F_DARK });
    for (const z of STATION_ROWS) openTile(c, CS - 1, z, { floor: -1.3, ceil: 4.6, fmat: 2, cmat: 0, flags: F_LANDMARK | F_RESERVED | F_DARK });
    ensureConnected(c, ports, corridor);
    const spots = wallSpots(c, (lx, lz, i) => freeTile(c, i));
    for (let k = 0; k < 3; k++) { const s = spots.length ? spots.splice(rng.int(0, spots.length - 1), 1)[0] : null; if (s) { const p = wallPos(c, s, 0.4); addContainer(c, rng, k ? 'crate' : 'toolbox', k ? CRATE_LOOT : PARTS, p.x, 0, p.z, yawFor(s.nx, s.nz), [1, 3]); } }
    for (let k = rng.int(2, 4); k > 0; k--) { const lx = rng.int(1, 14), lz = rng.int(4, 8), i = lz * CS + lx; if (freeTile(c, i)) addPickup(c, rng, LOOT, c.tx(lx), 0, c.tz(lz)); }
    if (rng.chance(0.5)) addVignette(c, rng, addProp, this.notes);
    c.meta.fires = []; c.meta.vents = [];
  },

  setPiece(game, levelId, ctx, p) {
    const a = Math.random() * Math.PI * 2;
    game.hostEvent(levelId, { k: 'pipeBurst', x: p.x + Math.cos(a) * 5, y: 2.6, z: p.z + Math.sin(a) * 5 });
    return true;
  },

  clientEvent(game, m) {
    if (m.k !== 'pipeBurst') return;
    game.sfx('metalGroan', m, { volume: 1, ref: 4 });
    setTimeout(() => {
      game.sfx('steamHiss', m, { volume: 1.2, ref: 3 });
      game.sfx('hitWall', m, { volume: 1 });
      for (let i = 0; i < 25; i++) game.effects.burst('steam', m, { x: (Math.random() - 0.5) * 2, y: -0.5, z: (Math.random() - 0.5) * 2 });
      game.player.shake = Math.min(1, game.player.shake + 0.2);
    }, 900);
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
    if (stationAt(level, c.cx, c.cz)) return this.generateStation(c, ctx);
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
      const ceil = r.type === 'machine' || r.type === 'generator' ? 5.5 : r.type === 'boiler' ? 4.5 : 3.3;
      // one consistent ceiling per room (corridors carved through it reset cmat)
      for (let z = r.z; z < r.z + r.h; z++) for (let x = r.x; x < r.x + r.w; x++) { const i = z * CS + x; c.ceil[i] = ceil; c.cmat[i] = r.cmat ?? 0; c.flags[i] |= F_ROOM; }
    }
    // a station's tunnels run on into this chunk and end in a collapse
    if (stationAt(level, c.cx - 1, c.cz)) carveTunnel(c, 0, CS - 1, CS - 2);
    else if (stationAt(level, c.cx + 1, c.cz)) carveTunnel(c, 0, CS - 1, 1);
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
      // pipe runs hug north and east walls; at an inner corner both runs meet,
      // and where a wall ends the run bends up into the ceiling
      const PN = 2;
      if (c.flags[i] & F_LANDMARK) continue;
      if (solid(0, -1)) {
        addProp(c, 'pipeRun', x, ce, z - 0.82, 0, { len: 2.02, n: PN });
        for (const dx of [-1, 1]) { const ni = lz * CS + lx + dx; if (lx + dx >= 0 && lx + dx < CS && c.type[ni] === T_FLOOR && !solid(dx, -1) && c.ceil[ni] >= ce) addProp(c, 'pipeCap', x + dx * 1.0, ce, z - 0.82, 0, { n: PN }); }
      }
      if (solid(1, 0)) {
        addProp(c, 'pipeRun', x + 0.82, ce, z, Math.PI / 2, { len: 2.02, n: PN });
        for (const dz of [-1, 1]) { const ni = (lz + dz) * CS + lx; if (lz + dz >= 0 && lz + dz < CS && c.type[ni] === T_FLOOR && !solid(1, dz) && c.ceil[ni] >= ce) addProp(c, 'pipeCap', x + 0.82, ce, z + dz * 1.0, Math.PI / 2, { n: PN }); }
      }
      if ((tx + tz * 3) % 5 === 0) {
        const sides = [[0, -1], [0, 1], [-1, 0], [1, 0]].filter(([dx, dz]) => solid(dx, dz));
        if (sides.length) {
          const [dx, dz] = sides[0];
          const dead = rng.chance(0.12);
          addLight(c, { kind: 'cage', x: x + dx * 0.88, y: 2.3, z: z + dz * 0.88, nx: -dx, nz: -dz, color: ORANGE, intensity: 5.2, range: 9, flicker: !dead && rng.chance(0.15) ? rng.float(0.3, 0.8) : 0, broken: dead });
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
        addLight(c, { kind: r.type === 'machine' ? 'bulb' : 'bulb', shade: r.type === 'machine' || r.type === 'storage', cord: r.type === 'machine' ? 1.6 : 0.5, x: c.tx(gx), y: ceil - (r.type === 'machine' ? 1.7 : 0.6), z: c.tz(gz), color: ORANGE, intensity: r.type === 'machine' ? 9 : 6, range: r.type === 'machine' ? 12 : 9, flicker: !broken && rng.chance(0.15) ? rng.float(0.2, 0.7) : 0, broken });
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
        for (const [dx, dz, a] of [[-1.15, 0, -Math.PI / 2], [1.15, 0, Math.PI / 2], [0, 0.8, 0]]) addProp(c, 'chair', cxw + dx, 0, czw + dz, a + rng.float(-0.15, 0.15));
        for (let k = 0; k < 2; k++) { const s = take(rs); if (s) { const p = wallPos(c, s, 0.34); addLocker(c, p.x, 0, p.z, yawFor(s.nx, s.nz)); } }
        const s = take(rs); if (s) { const p = wallPos(c, s, 0.32); addProp(c, 'waterCooler', p.x, 0, p.z, yawFor(s.nx, s.nz)); }
        if (r.landmark === 'key2') {
          addObject(c, { kind: 'pickup', item: 'keycard', qty: 1, x: cxw + 0.2, y: 0.79, z: czw - 0.1, ry: 0.4 });
          addNote(c, 'l1_e', cxw - 0.4, 0.79, czw + 0.15, 0.2);
        } else if (hash01(c.cx, c.cz, level.levelSeed, 551) < 0.22) addObject(c, { kind: 'pickup', item: 'keycard', qty: 1, x: cxw + 0.25, y: 0.79, z: czw, ry: 0.9 });
        else if (rng.chance(0.6)) addNote(c, rng.pick(this.notes), cxw - 0.3, 0.79, czw, 0.3);
      } else if (r.type === 'office' || r.landmark === 'key') {
        const s = take(rs);
        if (s) {
          const p = wallPos(c, s, 0.6);
          addProp(c, 'desk', p.x, 0, p.z, yawFor(s.nx, s.nz) + Math.PI, { monitor: true, papers: true });
          if (r.landmark === 'key' || hash01(c.cx, c.cz, level.levelSeed, 552) < 0.25) {
            addObject(c, { kind: 'pickup', item: 'keycard', qty: 1, x: p.x + s.nx * 0.05 + s.nz * 0.3, y: 0.78, z: p.z + s.nz * 0.05 - s.nx * 0.3, ry: 1.2 });
            if (r.landmark === 'key') addNote(c, 'l1_a', p.x - s.nz * 0.35, 0.78, p.z + s.nx * 0.35, 0);
          }
        }
        const s2 = take(rs); if (s2) { const p = wallPos(c, s2, 0.32); addContainer(c, rng, 'cabinet', CRATE_LOOT, p.x, 0, p.z, yawFor(s2.nx, s2.nz), [1, 2]); }
        const s3 = take(rs); if (s3) { const p = wallPos(c, s3, 0.6); addProp(c, 'workbench', p.x, 0, p.z, yawFor(s3.nx, s3.nz)); }
        if (r.landmark === 'key') addDecal(c, { name: 'text3', x: cxw, y: 0.005, z: czw, nx: 0, ny: 1, nz: 0, size: 1.4, rot: 0.2 });
      } else if (r.type === 'generator') {
        addProp(c, 'generator', cxw, 0, czw, rng.chance(0.5) ? 0 : Math.PI / 2);
        for (let k = 0; k < 2; k++) { const s = take(rs); if (s) { const p = wallPos(c, s, 0.2); addProp(c, 'gaugeWall', p.x, 0, p.z, yawFor(s.nx, s.nz)); } }
        for (let k = 0; k < 2; k++) { const s = take(rs); if (s) { const p = wallPos(c, s, 0.05); addProp(c, 'conduit', p.x, 0, p.z, yawFor(s.nx, s.nz), { h: ceil - 0.3 }); } }
        const s = take(rs); if (s) { const p = wallPos(c, s, 0.3); addContainer(c, rng, 'toolbox', PARTS, p.x, 0, p.z, yawFor(s.nx, s.nz), [1, 2]); }
      } else if (r.type === 'workshop') {
        addProp(c, 'lathe', cxw, 0, czw - 0.6, 0);
        for (let k = 0; k < 2; k++) { const s = take(rs); if (s) { const p = wallPos(c, s, 0.45); addProp(c, 'workbench', p.x, 0, p.z, yawFor(s.nx, s.nz)); if (rng.chance(0.45)) addPickup(c, rng, [['knife', 30], ['ductTape', 20], ['scrap', 20], ['wire', 15], ['gpsBoard', 8]], p.x, 0.92, p.z); } }
        const s = take(rs); if (s) { const p = wallPos(c, s, 0.3); addProp(c, 'shelf', p.x, 0, p.z, yawFor(s.nx, s.nz)); }
        const s2 = take(rs); if (s2) { const p = wallPos(c, s2, 0.3); addContainer(c, rng, 'toolbox', PARTS, p.x, 0, p.z, yawFor(s2.nx, s2.nz), [1, 3]); }
      } else if (r.type === 'pump') {
        addProp(c, 'tank', cxw - 1.2, 0, czw, 0);
        addProp(c, 'machine', cxw + 1.4, 0, czw, Math.PI / 2, { w: 1.4 });
      } else if (r.type === 'start') {
        addProp(c, 'ceilingHole', cxw, ceil, czw, 0);
        addProp(c, 'debris', cxw + 0.8, 0, czw + 0.4, 0, { mat: 'concrete' });
        addDecal(c, { name: 'stain', x: cxw, y: 0.005, z: czw, nx: 0, ny: 1, nz: 0, size: 2, rot: 0 });
        const s = take(rs); if (s) { const p = wallPos(c, s, 0.5); addProp(c, 'table', p.x, 0, p.z, yawFor(s.nx, s.nz)); addNote(c, 'l1_b', p.x, 0.79, p.z, 0.4); }
        const s2 = take(rs); if (s2) { const p = wallPos(c, s2, 0.4); addContainer(c, rng, 'crate', [['flare', 10, [1, 2]], ['lighter', 6], ['cleanWater', 5], ['fireSalts', 5]], p.x, 0, p.z, yawFor(s2.nx, s2.nz), [2, 2]); }
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
    if (rng.chance(0.08)) addVignette(c, rng, addProp, this.notes);
    addHatchExit(c, level, { label: 'maintenance hatch', mat: 'rustMetal' });
    addLevelDoor(c, level, rng, 'L0', { p: 0.035 });
    // decals & wayfinding (stencilled EXIT signs toward the nearest way out)
    const wspots = wallSpots(c);
    const goal = nearestExit(level, c.x0 + 16, c.z0 + 16);
    if (!addPortArrow(c, rng, ports, goal, { count: 1 }) && rng.chance(0.6)) addWayfinding(c, rng, wspots, goal, { name: 'arrow' });
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
