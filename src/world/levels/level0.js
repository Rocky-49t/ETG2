// Level 0 — The Lobby. Endless mono-yellow office space: partitions, room
// clusters, long halls and tall pillar halls under humming fluorescent light.
// Exit: a pit where "the carpet forgets to hold".
import { TILE, CS, T_SOLID, T_FLOOR, F_ROOM, F_DARK, F_RESERVED, F_LANDMARK } from '../chunk.js';
import { openPorts, ensureConnected, carveRect, fillRect, openTile } from '../gen.js';
import { placeLandmark } from '../level.js';
import { addProp } from '../props.js';
import { addLight, addDecal, addObject, addPickup, addContainer, addNote, addLocker, wallSpots, wallPos, yawFor, freeTile, addWayfinding, addVignette, sideExitAt, nearestExit, addPortArrow } from './common.js';
import { hash01, makeNoise2D, RNG } from '../../core/rng.js';
import { placeGoaningMachine } from '../machine.js';
import { registerProps } from '../props.js';
import { registerObjectKind } from '../../game/objects.js';
import { clearArea, addLevelDoor } from './common.js';
import * as THREE from 'three';

const PIT_R = 2.6;

registerProps({
  // carpet lip around the round pit: walkable corners of the square tile hole
  pitCollar: {
    navBlock: false,
    colliders() {
      const out = [];
      const h = 3, step = 0.5;
      for (let z = -h; z < h; z += step) for (let x = -h; x < h; x += step) {
        const cx = x + step / 2, cz = z + step / 2;
        if (Math.hypot(cx, cz) > PIT_R + 0.12) out.push([x, -0.6, z, x + step, 0, z + step]);
      }
      return out;
    },
    build(p, B) {
      const sh = new THREE.Shape();
      sh.moveTo(-3, -3); sh.lineTo(3, -3); sh.lineTo(3, 3); sh.lineTo(-3, 3); sh.lineTo(-3, -3);
      const hole = new THREE.Path(); hole.absarc(0, 0, PIT_R, 0, Math.PI * 2, true);
      sh.holes.push(hole);
      const geo = new THREE.ShapeGeometry(sh, 40);
      geo.rotateX(-Math.PI / 2);
      const uv = geo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / 2.5, uv.getY(i) / 2.5);
      B.geometry('carpet', geo, new THREE.Matrix4().makeTranslation(0, 0.004, 0));
      // frayed carpet edge
      B.geometry('black', new THREE.RingGeometry(PIT_R - 0.02, PIT_R + 0.06, 48).rotateX(-Math.PI / 2), new THREE.Matrix4().makeTranslation(0, 0.006, 0));
    },
  },
  // tall, thin partition walls for the atrium halls
  thinWall: {
    colliders: p => [[-p.len / 2, 0, -0.1, p.len / 2, p.h, 0.1]],
    build(p, B) {
      B.box('wallpaper', 0, p.h / 2, 0, p.len, p.h, 0.2, 2);
      B.box('trim', 0, 0.06, 0, p.len + 0.02, 0.12, 0.22, 0.5);
      B.box('trim', 0, p.h - 0.04, 0, p.len + 0.02, 0.08, 0.22, 0.5);
    },
  },
  storageShelf: {
    colliders: p => [[-p.len / 2, 0, -0.42, p.len / 2, 2.4, 0.42]],
    build(p, B, rng) {
      const r = () => (rng ? rng.next() : 0.5);
      for (const sx of [-p.len / 2 + 0.04, p.len / 2 - 0.04]) for (const sz of [-0.38, 0.38]) B.box('paintedMetal', sx, 1.2, sz, 0.06, 2.4, 0.06, 0.4);
      for (const y of [0.15, 0.95, 1.75]) {
        B.box('paintedMetal', 0, y, 0, p.len, 0.04, 0.84, 1);
        for (let x = -p.len / 2 + 0.4; x < p.len / 2 - 0.3; x += 0.55 + r() * 0.3) {
          if (r() < 0.25) continue;
          const w = 0.35 + r() * 0.2, h = 0.25 + r() * 0.35;
          B.box('cardboard', x, y + 0.02 + h / 2, (r() - 0.5) * 0.2, w, h, 0.5 + r() * 0.2, 0.5);
        }
      }
    },
  },
});

// The pit shaft: a round wall dropping into darkness, fading to black.
registerObjectKind('pitShaft', {
  build() {
    const g = new THREE.Group();
    const geo = new THREE.CylinderGeometry(PIT_R, PIT_R, 9, 40, 12, true);
    geo.translate(0, -4.5, 0);
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide, fog: true,
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog]),
      vertexShader: `varying float vY; varying vec2 vUv;
        #include <fog_pars_vertex>
        void main(){ vY = position.y; vUv = uv; vec4 mvPosition = modelViewMatrix * vec4(position,1.0); gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
        }`,
      fragmentShader: `varying float vY; varying vec2 vUv;
        #include <fog_pars_fragment>
        float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
        void main(){
          float k = smoothstep(-4.5, -0.05, vY);
          float n = h(floor(vec2(vUv.x * 160.0, vY * 9.0)));
          float seam = step(0.96, fract(vUv.x * 24.0));
          vec3 col = mix(vec3(0.07, 0.055, 0.025), vec3(0.17, 0.14, 0.07), n * 0.3 + 0.5) * (1.0 - seam * 0.4) * k * k * k;
          gl_FragColor = vec4(col, 1.0);
          #include <fog_fragment>
        }`,
    });
    g.add(new THREE.Mesh(geo, mat));
    const bottom = new THREE.Mesh(new THREE.CircleGeometry(PIT_R, 32), new THREE.MeshBasicMaterial({ color: 0x000000 }));
    bottom.rotation.x = -Math.PI / 2; bottom.position.y = -8.9;
    g.add(bottom);
    return g;
  },
  prompt: () => null,
});

const darkNoise = makeNoise2D(404);

const LOOT = [
  ['cleanWater', 12], ['dirtyWater', 18], ['snackBar', 22], ['cloth', 7], ['wire', 3], ['battery', 18, [1, 2]], ['bandage', 14],
  ['glowstick', 10, [1, 3]], ['cannedBeans', 8], ['flashlight', 3], ['lighter', 3], ['knife', 2], ['painkillers', 5], [null, 25],
];
const BOX_LOOT = [
  ['cleanWater', 12], ['dirtyWater', 12], ['snackBar', 20], ['cloth', 8], ['wire', 4], ['antenna', 1.5], ['gpsBoard', 1], ['purifier', 3, [1, 2]], ['battery', 18, [1, 3]], ['bandage', 12], ['glowstick', 12, [1, 3]],
  ['decoy', 4], ['flashlight', 4], ['lighter', 4], ['crowbar', 2], ['ammo9', 3, [4, 8]], [null, 20],
];

const PARTS_LOOT = [['antenna', 26], ['gpsBoard', 18], ['wire', 18], ['battery', 18, [1, 2]], ['ductTape', 10], ['scrap', 10]];

const T = (ceil = 3) => ({ floor: 0, ceil, fmat: 0, cmat: 0 });

function zoneFor(cx, cz, seed) {
  if (cx === 0 && cz === 0) return 'partition';
  const h = hash01(Math.floor(cx / 2), Math.floor(cz / 2), seed, 3) * 0.6 + hash01(cx, cz, seed, 4) * 0.4;
  if (h < 0.34) return 'partition';
  if (h < 0.54) return 'rooms';
  if (h < 0.71) return 'halls';
  if (h < 0.83) return 'pillars';
  // rarer areas, decided per chunk so they appear as islands of variety
  const r = hash01(cx, cz, seed, 5);
  if (h < 0.92) return r < 0.6 ? 'atrium' : 'partition';
  return r < 0.55 ? 'storage' : 'rooms';
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
  const leaves = [], doorways = [];
  const split = (x0, z0, x1, z1, depth) => {
    const w = x1 - x0 + 1, h = z1 - z0 + 1;
    if (depth > 3 || (w < 8 && h < 8) || (depth > 1 && rng.chance(0.2))) { leaves.push([x0, z0, x1, z1]); return; }
    const vertical = w > h ? true : h > w ? false : rng.chance(0.5);
    if (vertical && w >= 8) {
      const s = rng.int(x0 + 3, x1 - 4);
      split(x0, z0, s, z1, depth + 1); split(s + 1, z0, x1, z1, depth + 1);
      const dz = rng.int(z0 + 1, z1 - 1);
      const wide = rng.chance(0.4);
      carveRect(c, s, dz, s + 1, dz + (wide ? 1 : 0), { ...T(ceil), flags: F_RESERVED });
      if (!wide) doorways.push({ lx: s, lz: dz, along: 'z' });
    } else if (!vertical && h >= 8) {
      const s = rng.int(z0 + 3, z1 - 4);
      split(x0, z0, x1, s, depth + 1); split(x0, s + 1, x1, z1, depth + 1);
      const dx = rng.int(x0 + 1, x1 - 1);
      const wide = rng.chance(0.4);
      carveRect(c, dx, s, dx + (wide ? 1 : 0), s + 1, { ...T(ceil), flags: F_RESERVED });
      if (!wide) doorways.push({ lx: dx, lz: s, along: 'x' });
    } else leaves.push([x0, z0, x1, z1]);
  };
  split(0, 0, CS - 1, CS - 1, 0);
  for (const [x0, z0, x1, z1] of leaves) {
    const rc = rng.chance(0.3) ? ceil - 0.3 : ceil;
    carveRect(c, x0, z0, x1 - 1, z1 - 1, { ...T(rc), flags: F_ROOM });
  }
  c.meta.doorways = doorways;
}

// Rooms with wooden doors (added after the layout is final)
function addRoomDoors(c, rng) {
  for (const d of c.meta.doorways || []) {
    if (!rng.chance(0.55)) continue;
    const i = d.lz * CS + d.lx;
    if (c.type[i] !== T_FLOOR || (c.flags[i] & F_LANDMARK)) continue;
    // the doorway must still be a 1-tile gap in a wall
    const a = d.along === 'z' ? [d.lz * CS + d.lx - CS, d.lz * CS + d.lx + CS] : [i - 1, i + 1];
    if (a.some(k => k < 0 || k >= CS * CS || c.type[k] !== T_SOLID)) continue;
    const x = c.tx(d.lx), z = c.tz(d.lz);
    const ry = d.along === 'z' ? Math.PI / 2 : 0;
    const o = addObject(c, { kind: 'door', x, y: 0, z, ry, mat: 'woodCrate' });
    o.collider = c.addCollider(d.along === 'x' ? x - 1 : x - 0.05, 0, d.along === 'z' ? z - 1 : z - 0.05, d.along === 'x' ? x + 1 : x + 0.05, 2.4, d.along === 'z' ? z + 1 : z + 0.05, false);
    o.collider.door = true;
    c.flags[i] |= F_RESERVED;
  }
}

// Atrium: a tall hall cut up by thin, very tall partition walls, under a dense
// grid of lights.
function genAtrium(c, rng) {
  const H = 6.6;
  carveRect(c, 0, 0, CS - 1, CS - 1, T(H));
  c.meta.atrium = true;
  for (let k = rng.int(5, 8); k > 0; k--) {
    const horiz = rng.chance(0.5);
    const len = rng.int(3, 7);
    const lx = rng.int(2, CS - 3 - (horiz ? len : 0)), lz = rng.int(2, CS - 3 - (horiz ? 0 : len));
    const x = horiz ? c.x0 + (lx + len / 2) * TILE : c.tx(lx), z = horiz ? c.tz(lz) : c.z0 + (lz + len / 2) * TILE;
    addProp(c, 'thinWall', x, 0, z, horiz ? 0 : Math.PI / 2, { len: len * TILE, h: 6.1 });
  }
}

// Storeroom: long shelving rows, few lights, plenty of boxes to search.
function genStorage(c, rng) {
  carveRect(c, 0, 0, CS - 1, CS - 1, T(4.0));
  c.meta.storage = true;
  const horiz = rng.chance(0.5);
  for (let row = 2; row < CS - 2; row += 3) {
    let start = 1;
    while (start < CS - 3) {
      const len = rng.int(3, 6);
      if (start + len > CS - 2) break;
      const a = c.x0 + (start + len / 2) * TILE, b = c.tz(row);
      addProp(c, 'storageShelf', horiz ? a : b - c.z0 + c.x0, 0, horiz ? b : a - c.x0 + c.z0, horiz ? 0 : Math.PI / 2, { len: len * TILE - 0.3 });
      start += len + rng.int(1, 2);
    }
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

// A dim room with a round hole in the floor: "where the carpet forgets to hold".
function pitRoom(c, rng, lx, lz) {
  const ex = Math.max(3, Math.min(CS - 4, lx)), ez = Math.max(3, Math.min(CS - 4, lz));
  // nothing (pillars, furniture, lights) may stand where the room goes
  clearArea(c, c.x0 + (ex - 3) * TILE, c.z0 + (ez - 3) * TILE, c.x0 + (ex + 4) * TILE, c.z0 + (ez + 4) * TILE);
  fillRect(c, ex - 3, ez - 3, ex + 3, ez + 3, 0);
  carveRect(c, ex - 2, ez - 2, ex + 2, ez + 2, { floor: 0, ceil: 3.0, fmat: 0, cmat: 0, flags: F_RESERVED | F_ROOM });
  // doorway + corridor out toward the chunk centre
  const side = rng.int(0, 3);
  const dx = [1, 0, -1, 0][side], dz = [0, 1, 0, -1][side];
  for (let k = 3; k < 10; k++) {
    const tx = ex + dx * k, tz = ez + dz * k;
    if (tx < 0 || tz < 0 || tx >= CS || tz >= CS) break;
    openTile(c, tx, tz, { ...T(2.8), flags: F_RESERVED });
  }
  // the pit: a 3x3 tile hole, rounded by a carpet collar and a circular shaft
  for (let z = ez - 1; z <= ez + 1; z++) for (let x = ex - 1; x <= ex + 1; x++) {
    openTile(c, x, z, { floor: -9, ceil: 3.0, fmat: 1, cmat: 0, flags: F_LANDMARK | F_DARK | F_RESERVED });
  }
  const px = c.tx(ex), pz = c.tz(ez);
  addProp(c, 'pitCollar', px, 0, pz, 0);
  addObject(c, { kind: 'pitShaft', x: px, y: 0, z: pz, ry: 0 });
  addObject(c, { kind: 'exit', x: px, y: -3, z: pz, r: 2.4, to: 'L1', label: 'the pit' });
  addLight(c, { x: px + 2.6, y: 2.6, z: pz + 2.6, kind: 'bulb', cord: 0.4, color: [1, 0.75, 0.45], intensity: 3, range: 7, flicker: 0.6 });
  for (let k = 0; k < 7; k++) {
    const a = rng.float(0, Math.PI * 2), d = rng.float(3.2, 4.2);
    addDecal(c, { name: rng.pick(['stain', 'blood2', 'footprints']), x: px + Math.cos(a) * d, y: 0.005, z: pz + Math.sin(a) * d, nx: 0, ny: 1, nz: 0, size: rng.float(0.8, 1.4), rot: rng.float(0, 6.28) });
  }
  c.meta.exitRoom = { x: px, z: pz };
}

const ARRIVAL = [
  [0.6, 'GM-2: Trans-reality jump complete. Location: Goanrooms — Level 0.', 'warn'],
  [3.4, 'GM-2: WARNING. Quantum binding array damaged. Return jump unavailable.', 'warn'],
  [7.0, 'Radio: ...Kestrel to Expedition Three... do you... *static* ...the array... —'],
  [10.2, 'The radio dies. The machine will not take you home. Not from here.'],
  [12.8, 'You are stuck in the Goanrooms. Find a way deeper — and maybe a way back.'],
];

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
  materials: ['carpet', 'wallpaper', 'ceilingTile', 'lightPanel', 'trim', 'concrete', 'pillarPaint', 'cardboard', 'woodCrate', 'paintedMetal', 'laminate', 'plastic', 'darkMetal', 'black', 'paper', 'fabric', 'glowWhite', 'bulbWarm', 'chrome', 'plasticDark', 'labPanel', 'grate', 'glass', 'hazard', 'glowGreen', 'glowAmber', 'glowRed', 'monitorOff'],
  ambient: [0.05, 0.043, 0.02],
  bakeGain: 0.085,
  dynGain: 0.6,
  exposure: 1.0,
  fog: { color: 0x1c1808, density: 0.045 },
  background: 0x0c0a04,
  grade: { lift: [0.02, 0.015, 0.0], gamma: [1.0, 1.0, 0.95], gain: [1.06, 1.0, 0.82], saturation: 0.9, tint: [1, 0.98, 0.9], vignette: 0.5, grain: 0.05, bloomStrength: 0.32, bloomThreshold: 0.9 },
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

  // arriving from the prologue: seats inside the damaged machine
  arrivalSpawn(level, idx) {
    const m = level.chunk(0, 0).meta.machine;
    if (!m) return null;
    const s = m.seats[idx % m.seats.length];
    const extra = Math.floor(idx / m.seats.length);
    return { x: s.x + (extra ? (s.x < m.chamber.x0 + 2.5 ? 0.7 : -0.7) * extra : 0), y: 0.08, z: s.z, yaw: s.yaw };
  },

  onEnter(game) {
    if (!game.classId) setTimeout(() => { if (!game.classId && game.levelId === 'L0') game.promptRole(); }, 1500);
    if (game.arrivalPending) { game.arrivalPending = false; game.l0arrival = { t: 0, line: 0, short: !!game.skippedPrologue }; }
  },

  clientUpdate(game, dt) {
    const A = game.l0arrival;
    const m = game.level.chunk(0, 0).meta.machine;
    // the wrecked emitter keeps sparking and smoking
    if (m && Math.random() < dt * 2.5) {
      const cx = (m.chamber.x0 + m.chamber.x1) / 2, cz = (m.chamber.z0 + m.chamber.z1) / 2 - 0.5;
      const d = Math.hypot(cx - game.player.pos.x, cz - game.player.pos.z);
      if (d < 30) {
        game.effects.burst(Math.random() < 0.6 ? 'spark' : 'smoke', { x: cx + (Math.random() - 0.5) * 0.8, y: 1.65, z: cz + (Math.random() - 0.5) * 0.8, floor: 0.07 }, { x: 0, y: -1, z: 0 }, 0.6);
        if (Math.random() < 0.35) game.sfx('spark', { x: cx, y: 1.7, z: cz }, { volume: 0.5, ref: 2 });
      }
    }
    if (!A) return;
    A.t += dt;
    const u = game.engine.post.u;
    u.warp.value = Math.max(0, 0.85 - A.t * 0.45);
    const lines = A.short ? ARRIVAL.slice(1) : ARRIVAL;
    while (A.line < lines.length && A.t >= lines[A.line][0] * (A.short ? 0.6 : 1)) {
      const [, text, cls] = lines[A.line++];
      game.subtitle(text, 4.5, cls || '');
      game.sfx(cls === 'warn' ? 'beepAlert' : 'radioStatic', null, { volume: 0.6 });
    }
    if (A.t > 15) { game.l0arrival = null; u.warp.value = 0; game.hud.setObjective(game.def, game); }
  },

  hostUpdate(game, ctx, dt) {
    // the jammed door grinds open a few seconds after the team arrives
    const m = ctx.level.chunk(0, 0).meta.machine;
    if (!m) return;
    const S = game.l0door || (game.l0door = { t: 0 });
    if (S.done) return;
    S.t += dt;
    if (game.world.get('L0', m.door.id)?.open) { S.done = true; return; }
    if (S.t > 5.5) { S.done = true; game.hostBroadcast({ t: 'os', l: 'L0', id: m.door.id, s: { open: true } }); game.hostEvent('L0', { k: 'sound', name: 'metalGroan', x: m.door.x, y: 1, z: m.door.z, volume: 1 }); }
  },

  landmarks(level) {
    const exit = placeLandmark(level, 'L0exit', 55, 95);
    return [{ type: 'spawn', tx: 8, tz: 8 }, { type: 'exit', ...exit }];
  },

  generate(c, ctx) {
    const { rng, level, ports, landmarks } = ctx;
    const zone = zoneFor(c.cx, c.cz, ctx.seed);
    c.meta.zone = zone;
    const ceil = zone === 'pillars' ? 4.2 : zone === 'atrium' ? 6.6 : zone === 'storage' ? 4.0 : (hash01(c.cx, c.cz, ctx.seed, 9) < 0.25 ? 2.7 : 3.0);
    if (zone === 'partition') genPartition(c, rng, ceil);
    else if (zone === 'rooms') genRooms(c, rng, ceil);
    else if (zone === 'halls') genHalls(c, rng, ceil);
    else if (zone === 'atrium') genAtrium(c, rng);
    else if (zone === 'storage') genStorage(c, rng);
    else genPillars(c, rng);

    const tmpl = () => T(ceil);
    openPorts(c, ports, tmpl, 2);

    // landmarks
    for (const lm of landmarks) {
      if (lm.type === 'spawn') {
        // arrival room: the damaged Goaning Machine stands against the north side
        carveRect(c, lm.lx - 3, lm.lz - 3, lm.lx + 3, lm.lz + 3, { ...T(Math.max(ceil, 3.7)), flags: F_RESERVED | F_ROOM });
        for (let z = lm.lz - 3; z <= lm.lz - 1; z++) for (let x = lm.lx - 2; x <= lm.lx + 2; x++) c.flags[z * CS + x] |= F_LANDMARK;
        c.meta.machine = placeGoaningMachine(c, c.tx(lm.lx), c.tz(lm.lz) - 4, { damaged: true, startOpen: false });
      } else if (lm.type === 'exit') {
        pitRoom(c, rng, lm.lx, lm.lz);
      }
    }

    const side = sideExitAt(level, c.cx, c.cz);
    if (side) pitRoom(c, rng, side.lx, side.lz);
    ensureConnected(c, ports, tmpl);
    if (zone === 'rooms') addRoomDoors(c, rng);
    // rare back door... the Lobby has nowhere to go back to, but sometimes a
    // door marked LEVEL 1 skips the pit entirely
    addLevelDoor(c, level, rng, 'L1', { p: 0.025, minR: 3, salt: 977 });

    // ---- lights
    const goal = nearestExit(level, c.x0 + 16, c.z0 + 16);
    const nearExit = Math.hypot(c.x0 + 16 - goal.x, c.z0 + 16 - goal.z) < 40;
    for (let lz = 0; lz < CS; lz++) for (let lx = 0; lx < CS; lx++) {
      const i = lz * CS + lx;
      if (c.type[i] !== T_FLOOR || (c.flags[i] & F_LANDMARK)) continue;
      const tx = c.cx * CS + lx, tz = c.cz * CS + lz;
      const pillars = zone === 'pillars', atrium = zone === 'atrium', storage = zone === 'storage';
      if (atrium ? (tx % 2 !== 0 || tz % 2 !== 0) : storage ? (tx % 4 !== 1 || tz % 3 !== 2) : pillars ? (tx % 3 !== 1 || tz % 3 !== 1) : (tx % 2 !== 0 || tz % 3 !== 0)) continue;
      if (c.props.some(p => p.kind === 'thinWall' && Math.abs(p.x - c.tx(lx)) < (p.ry ? 0.3 : p.len / 2) && Math.abs(p.z - c.tz(lz)) < (p.ry ? p.len / 2 : 0.3))) continue;
      const dark = darkNoise(tx / 14, tz / 14, 4096) > (pillars ? 0.62 : 0.72);
      if (dark && !(Math.abs(tx - 8) < 4 && Math.abs(tz - 8) < 4)) { c.flags[i] |= F_DARK; if (!rng.chance(0.15)) continue; }
      const r = rng.next();
      const broken = r < (nearExit ? 0.15 : 0.05) || dark;
      const flicker = !broken && r < (nearExit ? 0.35 : 0.12) ? rng.float(0.3, 0.9) : 0;
      addLight(c, {
        x: c.tx(lx), y: c.ceil[i] - 0.01, z: c.tz(lz), kind: 'panel', w: 1.2, d: 0.6,
        color: [1, 0.93, 0.72], intensity: atrium ? 6 : pillars ? 7 : storage ? 4 : 5, range: atrium ? 11 : pillars ? 11 : 8.5, flicker: storage && !broken ? Math.max(flicker, 0.2) : flicker, broken,
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
    if (!addPortArrow(c, rng, ports, goal, { count: 1, style: 'spray' })) addWayfinding(c, rng, allSpots, goal, { name: 'arrow', style: 'spray' });
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
    // storerooms hold supplies — and the odd piece of radio gear
    if (zone === 'storage') {
      for (let k = 0; k < 3; k++) {
        const lx = rng.int(1, CS - 2), lz = rng.int(1, CS - 2), i = lz * CS + lx;
        if (!freeTile(c, i)) continue;
        if (k === 0) addContainer(c, rng, 'toolbox', PARTS_LOOT, c.tx(lx), 0, c.tz(lz), rng.float(0, 6), [2, 3]);
        else addContainer(c, rng, 'cardboard', BOX_LOOT, c.tx(lx), 0, c.tz(lz), rng.float(0, 6), [1, 3]);
      }
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
