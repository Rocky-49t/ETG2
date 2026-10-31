// Level Gug. Gray concrete halls of tall cylinders scrawled with "gug",
// glossy gray tile underfoot and real holes in the ceiling that go up into
// the dark; a Level 0-like grid of dark walls and pillars under a field of
// square white lights; long straight halls; rooms with supplies (gray goo);
// rare dark districts; and tunnels underneath, reached by staircases.
// Tall thin Gug Walkers roam everywhere. Blind Gug Crawlers moonwalk toward
// any sound. The Ririqian Brotherhood holds more bases here than anywhere.
// Ways out: doors to Levels 0, 2, 4 and 5.
import * as THREE from 'three';
import { TILE, CS, T_SOLID, T_FLOOR, F_ROOM, F_DARK, F_RESERVED, F_LANDMARK } from '../chunk.js';
import { openPorts, ensureConnected, carveRect, fillRect, openTile, carveL, portTiles } from '../gen.js';
import { addProp, registerProps } from '../props.js';
import { addLight, addDecal, addObject, addPickup, addContainer, addNote, addLocker, wallSpots, wallPos, yawFor, freeTile, addWayfinding, addLevelDoor, sideExitAt, nearestExit, addPortArrow } from './common.js';
import { hash01, hash4 } from '../../core/rng.js';
import { registerObjectKind } from '../../game/objects.js';
import { makeEnvMap } from '../../gfx/water.js';
import { patchBaked } from '../../gfx/materials.js';

const TUN = -4.2;
const LOOT = [
  ['grayGoo', 14], ['cleanWater', 8], ['dirtyWater', 8], ['fireSalts', 8], ['snackBar', 6], ['battery', 12, [1, 2]], ['bandage', 10], ['medkit', 3], ['painkillers', 6],
  ['ammo9', 8, [6, 12]], ['rifleAmmo', 6, [8, 16]], ['shells', 4, [2, 5]], ['sniperAmmo', 2, [2, 4]], ['glowstick', 8, [1, 2]], ['flare', 6], ['grenade', 2], ['smallPack', 1.5], ['largePack', 0.6],
  ['helmet', 1], ['combatBoots', 1], ['scrap', 5], ['wire', 4], ['antenna', 2], ['gpsBoard', 2], [null, 12],
];
const ROOM_LOOT = [['grayGoo', 24, [1, 2]], ['cleanWater', 8], ['battery', 10, [1, 2]], ['bandage', 8], ['medkit', 4], ['ammo9', 6, [6, 12]], ['rifleAmmo', 5, [10, 20]], ['grenade', 3], ['smallPack', 2], ['flare', 5], [null, 8]];
const EXITS = ['L0', 'L2', 'L4', 'L5'];

registerProps({
  gugCylinder: {
    colliders: p => { const r = (p.r || 1.8) * 0.82; return [[-r, 0, -r, r, p.h || 7, r]]; },
    build(p, B) {
      const r = p.r || 1.8, h = p.h || 7;
      B.cyl(p.dark ? 'gugDark' : p.text ? 'gugCylText' : 'gugConcrete', 0, 0, 0, r, h, 28, false);
      B.cyl('gugConcrete', 0, 0, 0, r + 0.04, 0.12, 28, false);
    },
  },
  holeRing: {
    // a ceiling plate with a round hole, so the shaft above reads as circular
    colliders: null,
    build(p, B) {
      const s = (p.size || 4) / 2, r = s * 0.88;
      const shape = new THREE.Shape([new THREE.Vector2(-s, -s), new THREE.Vector2(s, -s), new THREE.Vector2(s, s), new THREE.Vector2(-s, s)]);
      const hole = new THREE.Path(); hole.absarc(0, 0, r, 0, Math.PI * 2, true); shape.holes.push(hole);
      const g = new THREE.ShapeGeometry(shape, 32); g.rotateX(Math.PI / 2);
      B.geometry('gugConcrete', g, new THREE.Matrix4().makeTranslation(0, -0.02, 0));
      // the shaft's round wall, fading up into the dark
      const sh = new THREE.CylinderGeometry(r, r, 3, 32, 1, true); sh.scale(-1, 1, 1); sh.translate(0, 1.5, 0);
      B.geometry('gugConcrete', sh, null);
      const sh2 = new THREE.CylinderGeometry(r, r, 9, 32, 1, true); sh2.scale(-1, 1, 1); sh2.translate(0, 7.5, 0);
      B.geometry('black', sh2, null);
    },
  },
});

// A door with no frame, flush with a cylinder or wall. Most don't open.
registerObjectKind('gugDoor', {
  build(o, game) {
    const g = new THREE.Group();
    const m = new THREE.Mesh(new THREE.BoxGeometry(1.0, 2.1, 0.05), new THREE.MeshStandardMaterial({ color: 0x3e4044, roughness: 0.6 }));
    m.position.set(0, 1.05, 0.025); g.add(m);
    const k = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), game.lib.dyn('chrome')); k.position.set(0.38, 1.0, 0.07); g.add(k);
    return g;
  },
  prompt: (o, s) => (s?.done ? 'The door is shut' : 'Try the door'),
  radius: 0.7, centerY: 0.9,
});

function zoneFor(level, cx, cz) {
  const s = level.levelSeed;
  if (Math.abs(cx) + Math.abs(cz) <= 1) return 'cyl';
  // tunnel lines under the level every few chunks
  if (((cz % 9) + 9) % 9 === 4 && hash01(Math.floor(cx / 4), cz, s, 61) < 0.4) return 'tunnel';
  if (((cx % 9) + 9) % 9 === 4 && hash01(cx, Math.floor(cz / 4), s, 62) < 0.4) return 'tunnel';
  if (hash01(Math.floor(cx / 3), Math.floor(cz / 3), s, 63) < 0.12) return 'dark';
  const h = hash01(cx, cz, s, 64) * 0.55 + hash01(Math.floor(cx / 2), Math.floor(cz / 2), s, 65) * 0.45;
  return h < 0.42 ? 'cyl' : h < 0.54 ? 'grid' : h < 0.66 ? 'halls' : 'rooms';
}

export default {
  id: 'LG',
  name: 'Level Gug',
  title: 'Gug',
  next: 'L5',
  objective: 'Find a door out — to Levels 0, 2, 4 or 5. Avoid the thin ones.',
  objectiveText() { return 'Find a door out (Levels 0, 2, 4 or 5 — follow the chalk signs). Walkers run in straight lines; Crawlers hear everything.'; },
  subtitle: 'gug gug gug gug gug',
  palette: {
    floor: [{ mat: 'gugTile', scale: 2 }, { mat: 'gugFloor', scale: 3, stairMat: 'gugConcrete' }, { mat: 'concrete', scale: 3 }],
    wall: [{ mat: 'gugConcrete', scaleU: 3, scaleV: 3, vBase: 'abs' }, { mat: 'gugDark', scaleU: 2.4, scaleV: 3 }],
    ceil: [{ mat: 'gugConcrete', scale: 3 }],
    ledge: { mat: 'gugConcrete', scale: 3 },
    soffit: { mat: 'gugConcrete', scaleU: 3, scaleV: 3 },
  },
  materials: ['gugConcrete', 'gugTile', 'gugDark', 'gugFloor', 'concrete', 'lightPanel', 'darkMetal', 'chrome', 'paintedMetal', 'cardboard', 'woodCrate', 'black', 'glowWhite', 'glowRed', 'paper', 'laminate', 'plastic', 'fabric', 'bone', 'rustMetal'],
  ambient: [0.11, 0.113, 0.118],
  bakeGain: 0.2,
  dynGain: 1.4,
  exposure: 1.05,
  fog: { color: 0x101114, density: 0.035 },
  background: 0x08090a,
  grade: { lift: [0.0, 0.0, 0.01], gamma: [1.0, 1.0, 1.0], gain: [0.98, 1.0, 1.02], saturation: 0.45, tint: [0.98, 1.0, 1.02], vignette: 0.5, grain: 0.05, bloomStrength: 0.45, bloomThreshold: 0.82 },
  hemi: { sky: 0x8a8e94, ground: 0x24262a, intensity: 0.32 },
  dust: { color: 0xe0e4ea, opacity: 0.22 },
  portConfig: { min: 1, max: 3, wMin: 1, wMax: 3 },
  ambience: 'gug',
  surface: 'tile',
  lockerStyle: 'metal',
  exitStyle: 'chalk',
  containerMats: { cabinet: 'gugDark', crate: 'darkMetal' },
  notes: ['gen_a', 'rq_portal', 'rq_orders'],
  decalTexts: ['GUG', 'gug gug gug', 'THEY CAN\'T TURN', 'SHHH'],
  entities: {
    primary: 'gugwalker', max: 3, spawnCd: 38, minDist: 30, maxDist: 55, rare: ['lookalike'],
    // dark districts are quieter
    spawnFilter: (level, x, z) => zoneFor(level, Math.floor(x / 32), Math.floor(z / 32)) !== 'dark' || hash01(x | 0, z | 0, 77) < 0.25,
    secondary: [{ type: 'gugcrawler', max: 1, spawnCd: 70, chance: 0.5, boost: ctx => ctx.players.some(p => zoneFor(ctx.level, Math.floor(p.x / 32), Math.floor(p.z / 32)) === 'grid') }],
  },
  eventSounds: ['distantThud', 'knock', 'gugStep', 'whisper'],
  sideExit: { p: 0.07, minR: 2 },
  // the Brotherhood's strongholds: most common here (about one per 3 minutes)
  bases: {
    faction: 'rq', cell: 4, chance: 0.92, minR: 3, sizes: [['outpost', 2.5], ['small', 3], ['medium', 3], ['large', 2], ['city', 0.7]], ceil: 4, yardCeil: 7, light: 'panel', lightColor: [0.92, 0.95, 1.0],
    boost: (level, cx, cz) => (zoneFor(level, cx, cz) === 'dark' ? 1.25 : 1),
    avoid: (level, cx, cz) => zoneFor(level, cx, cz) === 'tunnel',
  },

  landmarks() { return [{ type: 'spawn', tx: 8, tz: 8 }]; },

  setupScene(game) {
    // "gug" scrawled all round the cylinders
    const cv = document.createElement('canvas'); cv.width = 512; cv.height = 512;
    const x = cv.getContext('2d');
    x.fillStyle = '#8e9296'; x.fillRect(0, 0, 512, 512);
    for (let k = 0; k < 3000; k++) { x.fillStyle = `rgba(${Math.random() < 0.5 ? '0,0,0' : '255,255,255'},${Math.random() * 0.05})`; x.fillRect(Math.random() * 512, Math.random() * 512, 2 + Math.random() * 6, 2 + Math.random() * 6); }
    x.fillStyle = '#121212';
    for (let k = 0; k < 7; k++) {
      x.save(); x.translate(40 + k * 70, 240 + Math.sin(k * 2.1) * 150); x.rotate((Math.random() - 0.5) * 0.3);
      x.font = `${Math.random() < 0.4 ? 'bold ' : ''}${44 + Math.random() * 30}px "Comic Sans MS", "Marker Felt", cursive`;
      x.fillText(Math.random() < 0.5 ? 'gug' : 'GUG', 0, 0); x.restore();
    }
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(-3, 0.6);
    game.lib.register('gugCylText', patchBaked(new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95 }), { variation: 0.12 }));
    // the floor tiles catch a soft reflection
    const env = makeEnvMap(game.engine.renderer, 0xd8dce0, 0x7a7e82, 0x202224);
    const tile = game.lib.get('gugTile');
    tile.envMap = env; tile.envMapIntensity = 0.55; tile.roughness = 0.35; tile.needsUpdate = true;
  },

  generate(c, ctx) {
    const { rng, level, ports, landmarks } = ctx;
    const zone = zoneFor(level, c.cx, c.cz);
    c.meta.zone = zone;
    const dark = zone === 'dark';
    if (zone === 'tunnel') return this.genTunnel(c, ctx);
    const CE = zone === 'cyl' || dark ? 7 : zone === 'grid' ? 3.6 : 4;
    const T = (extra = {}) => ({ floor: 0, ceil: CE, fmat: 0, cmat: 0, ...extra });
    if (zone === 'cyl' || dark) {
      carveRect(c, 0, 0, CS - 1, CS - 1, T({ flags: F_ROOM | (dark ? F_DARK : 0) }));
      for (let k = rng.int(0, 2); k > 0; k--) { const x = rng.int(1, 12), z = rng.int(1, 12); fillRect(c, x, z, x + rng.int(0, 2), z, 0); }
    } else if (zone === 'grid') {
      // a Level 0-ish maze of thin dark partitions
      carveRect(c, 0, 0, CS - 1, CS - 1, T({ flags: F_ROOM }));
      for (let k = rng.int(4, 8); k > 0; k--) {
        const x = rng.int(1, 13), z = rng.int(1, 13), len = rng.int(2, 6);
        if (rng.chance(0.5)) fillRect(c, x, z, Math.min(CS - 2, x + len), z, 1); else fillRect(c, x, z, x, Math.min(CS - 2, z + len), 1);
      }
    } else if (zone === 'halls') {
      // long straight halls on fixed lines, so they continue chunk to chunk
      fillRect(c, 0, 0, CS - 1, CS - 1, 0);
      carveRect(c, 0, 6, CS - 1, 8, T());
      carveRect(c, 6, 0, 8, CS - 1, T());
      for (let k = rng.int(1, 3); k > 0; k--) { const x = rng.int(1, 10), z = rng.chance(0.5) ? rng.int(1, 3) : rng.int(10, 12); carveRect(c, x, z, x + rng.int(2, 3), z + 2, T({ flags: F_ROOM, ceil: 3.2 })); carveL(c, x + 1, z + 1, 7, 7, T(), rng, 1); }
    } else {
      // rooms with doors off a corridor cross
      fillRect(c, 0, 0, CS - 1, CS - 1, 0);
      const zc = rng.int(5, 9), xc = rng.int(5, 9);
      carveRect(c, 0, zc, CS - 1, zc + 1, T());
      carveRect(c, xc, 0, xc + 1, CS - 1, T());
      c.meta.rooms = [];
      for (const [x0, z0, x1, z1] of [[1, 1, xc - 2, zc - 2], [xc + 3, 1, CS - 2, zc - 2], [1, zc + 3, xc - 2, CS - 2], [xc + 3, zc + 3, CS - 2, CS - 2]]) {
        if (x1 - x0 < 2 || z1 - z0 < 2) continue;
        carveRect(c, x0, z0, x1, z1, T({ flags: F_ROOM, ceil: 3.2 }));
        const door = x1 + 1 === xc ? [x1 + 1, (z0 + z1) >> 1, 1, 0] : x0 - 1 === xc + 2 ? [x0 - 1, (z0 + z1) >> 1, -1, 0] : z1 + 1 === zc ? [(x0 + x1) >> 1, z1 + 1, 0, 1] : [(x0 + x1) >> 1, z0 - 1, 0, -1];
        openTile(c, door[0], door[1], T({ flags: F_RESERVED }));
        c.meta.rooms.push({ x0, z0, x1, z1, door });
      }
    }
    for (const lm of landmarks) if (lm.type === 'spawn') carveRect(c, lm.lx - 1, lm.lz - 1, lm.lx + 1, lm.lz + 1, T({ flags: F_RESERVED }));
    openPorts(c, ports, () => T(), 1);
    for (const [px, pz] of portTiles(ports)) carveL(c, px, pz, 8, 8, T(), rng, 1);
    ensureConnected(c, ports, () => T());
    this.dress(c, ctx, zone, CE);
  },

  // Underground: 3-wide concrete tunnels joining up with neighbouring tunnel
  // chunks; staircases climb to the level wherever the neighbour isn't one.
  genTunnel(c, ctx) {
    const { rng, ports, level } = ctx;
    fillRect(c, 0, 0, CS - 1, CS - 1, 0);
    const walk = { floor: TUN, ceil: TUN + 3.2, fmat: 1, cmat: 0, flags: F_DARK };
    const tz = n => zoneFor(level, c.cx + n[0], c.cz + n[1]) === 'tunnel';
    const n = tz([0, -1]), s = tz([0, 1]), w = tz([-1, 0]), e = tz([1, 0]);
    carveRect(c, 5, 5, 10, 10, { ...walk, flags: F_ROOM | F_DARK });
    if (w) carveRect(c, 0, 6, 5, 8, walk); if (e) carveRect(c, 10, 6, CS - 1, 8, walk);
    if (n) carveRect(c, 6, 0, 8, 5, walk); if (s) carveRect(c, 6, 10, 8, CS - 1, walk);
    for (const side of ['n', 's', 'w', 'e']) {
      if ({ n, s, w, e }[side]) continue;
      const list = ports[side];
      if (!list.length) continue;
      const top = { floor: 0, ceil: 4, fmat: 0, cmat: 0 };
      const T2 = (along, depth) => side === 'n' ? [along, depth] : side === 's' ? [along, CS - 1 - depth] : side === 'w' ? [depth, along] : [CS - 1 - depth, along];
      const idx = list.flatMap(p => Array.from({ length: p.w }, (_, j) => p.i + j));
      const A = 7, lo = Math.min(A, ...idx), hi = Math.max(A, ...idx);
      for (const i of idx) { const [x, z] = T2(i, 0); openTile(c, x, z, top); }
      for (let a = lo; a <= hi; a++) { const [x, z] = T2(a, 1); openTile(c, x, z, top); }
      const dir = side === 'n' ? 3 : side === 's' ? 1 : side === 'w' ? 2 : 0;
      for (let d = 2; d <= 3; d++) for (const a of [A, A + 1]) {
        const [x, z] = T2(a, d), i = z * CS + x;
        openTile(c, x, z, { floor: d === 2 ? TUN / 2 : TUN, ceil: 4, fmat: 1, cmat: 0, flags: F_RESERVED });
        c.ramp[i] = dir; c.rampH[i] = -TUN / 2;
      }
      for (let d = 4; d <= 5; d++) for (const a of [A, A + 1]) { const [x, z] = T2(a, d); if (c.type[z * CS + x] !== T_FLOOR) openTile(c, x, z, walk); }
      const [lx, lz] = T2(A, 2);
      addLight(c, { kind: 'cage', x: c.tx(lx), y: 2.2, z: c.tz(lz), nx: 0, nz: 0, color: [0.9, 0.95, 1], intensity: 3, range: 8 });
    }
    // sparse caged lamps; supplies and the dead
    for (let lz = 1; lz < CS; lz += 4) for (let lx = 1; lx < CS; lx += 4) { const i = lz * CS + lx; if (c.type[i] === T_FLOOR && c.floor[i] === TUN && rng.chance(0.5)) addLight(c, { kind: 'cage', x: c.tx(lx), y: TUN + 2.9, z: c.tz(lz), nx: 0, nz: 0, color: [1, 0.85, 0.6], intensity: 3, range: 9, flicker: rng.chance(0.3) ? 0.5 : 0, broken: rng.chance(0.25) }); }
    if (rng.chance(0.5)) addContainer(c, rng, 'crate', LOOT, c.tx(9) + 0.5, TUN, c.tz(9) + 0.5, 0, [1, 2]);
    if (rng.chance(0.25)) this.corpse(c, rng, c.tx(6), TUN, c.tz(6));
    c.meta.tunnel = true;
  },

  corpse(c, rng, x, y, z) {
    addProp(c, 'remains', x, y, z, rng.float(0, 6));
    addDecal(c, { name: 'blood2', x, y: y + 0.005, z, nx: 0, ny: 1, nz: 0, size: 1.6, rot: rng.float(0, 6) });
    addContainer(c, rng, 'backpack', LOOT, x + 0.7, y, z + 0.4, rng.float(0, 6), [1, 3]);
    if (rng.chance(0.4)) addNote(c, rng.pick(['rq_portal', 'gen_a', 'rq_doubt']), x - 0.5, y + 0.005, z + 0.3, rng.float(0, 6));
  },

  dress(c, ctx, zone, CE) {
    const { rng, level, ports } = ctx;
    const dark = zone === 'dark';
    // cylinders: big scrawled columns in the halls, smaller dark ones in the grid
    if (zone === 'cyl' || dark || zone === 'grid') {
      const step = zone === 'grid' ? 4 : 5;
      for (let lz = 2; lz < CS - 1; lz += step) for (let lx = 2; lx < CS - 1; lx += step) {
        const jx = lx + rng.int(-1, 1), jz = lz + rng.int(-1, 1);
        if (jx < 1 || jz < 1 || jx > CS - 2 || jz > CS - 2 || rng.chance(0.25)) continue;
        let ok = true;
        for (let dz = -1; dz <= 1 && ok; dz++) for (let dx = -1; dx <= 1 && ok; dx++) { const i = (jz + dz) * CS + jx + dx; if (c.type[i] !== T_FLOOR || (c.flags[i] & (F_RESERVED | F_LANDMARK))) ok = false; }
        if (!ok) continue;
        const r = zone === 'grid' ? rng.float(0.9, 1.2) : rng.float(1.5, 2.2), x = c.tx(jx), z = c.tz(jz);
        addProp(c, 'gugCylinder', x, 0, z, 0, { r, h: CE, text: rng.chance(zone === 'grid' ? 0.25 : 0.75), dark });
        for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) c.flags[(jz + dz) * CS + jx + dx] |= F_RESERVED;
        // a frameless door at the foot of some cylinders
        if (zone !== 'grid' && rng.chance(0.45)) { const a = rng.int(0, 3) * Math.PI / 2; addObject(c, { kind: 'gugDoor', x: x + Math.sin(a) * (r + 0.03), y: 0, z: z + Math.cos(a) * (r + 0.03), ry: a }); }
      }
      // holes in the ceiling: shafts going up into nothing
      if (zone !== 'grid') for (let k = rng.int(1, 2); k > 0; k--) {
        const lx = rng.int(2, 12), lz = rng.int(2, 12);
        let ok = true;
        for (let dz = 0; dz < 2 && ok; dz++) for (let dx = 0; dx < 2 && ok; dx++) { const i = (lz + dz) * CS + lx + dx; if (c.type[i] !== T_FLOOR || (c.flags[i] & F_RESERVED)) ok = false; }
        if (!ok) continue;
        for (let dz = 0; dz < 2; dz++) for (let dx = 0; dx < 2; dx++) { const i = (lz + dz) * CS + lx + dx; c.ceil[i] = CE + 14; c.flags[i] |= F_RESERVED; }
        addProp(c, 'holeRing', c.x0 + (lx + 1) * TILE, CE, c.z0 + (lz + 1) * TILE, 0, { size: 4 });
      }
    }
    // lights: a grid of square panels (dense in the grid zone, sparse in the dark)
    const lstep = zone === 'grid' ? 2 : 3;
    for (let lz = 1; lz < CS; lz += lstep) for (let lx = 1; lx < CS; lx += lstep) {
      const i = lz * CS + lx;
      if (c.type[i] !== T_FLOOR || c.ceil[i] > CE + 0.5) continue;
      if (dark && !rng.chance(0.06)) { c.flags[i] |= F_DARK; continue; }
      const r = rng.next();
      addLight(c, { kind: 'panel', x: c.tx(lx), y: c.ceil[i] - 0.01, z: c.tz(lz), w: zone === 'grid' ? 0.7 : 1.2, d: zone === 'grid' ? 0.7 : 1.2, color: [0.95, 0.97, 1.0], intensity: zone === 'grid' ? 2.6 : 4.2, range: zone === 'grid' ? 6 : 11, flicker: dark || r < 0.06 ? rng.float(0.3, 0.9) : 0, broken: r > 0.96 });
    }
    if (dark) for (let i = 0; i < CS * CS; i++) if (c.type[i] === T_FLOOR) c.flags[i] |= F_DARK;
    // rooms with supplies
    for (const r of c.meta.rooms || []) {
      const cx = c.x0 + (r.x0 + r.x1 + 1) / 2 * TILE, cz = c.z0 + (r.z0 + r.z1 + 1) / 2 * TILE;
      const spots = wallSpots(c, (lx, lz, i) => lx >= r.x0 && lx <= r.x1 && lz >= r.z0 && lz <= r.z1 && freeTile(c, i));
      const take = () => (spots.length ? spots.splice(rng.int(0, spots.length - 1), 1)[0] : null);
      const s1 = take(); if (s1) { const p = wallPos(c, s1, 0.3); addProp(c, 'shelf', p.x, 0, p.z, yawFor(s1.nx, s1.nz)); addPickup(c, rng, ROOM_LOOT, p.x + s1.nx * 0.6, 0, p.z + s1.nz * 0.6); }
      const s2 = take(); if (s2) { const p = wallPos(c, s2, 0.4); addContainer(c, rng, rng.pick(['cabinet', 'crate', 'cardboard']), ROOM_LOOT, p.x, 0, p.z, yawFor(s2.nx, s2.nz), [1, 2]); }
      if (rng.chance(0.4)) addPickup(c, rng, ROOM_LOOT, cx, 0, cz);
      if (rng.chance(0.3)) { const s3 = take(); if (s3) { const p = wallPos(c, s3, 0.36); addLocker(c, p.x, 0, p.z, yawFor(s3.nx, s3.nz)); } }
      addLight(c, { kind: 'panel', x: cx, y: 3.19, z: cz, w: 1.2, d: 0.6, color: [0.95, 0.97, 1], intensity: 3.6, range: 8, flicker: rng.chance(0.2) ? 0.5 : 0 });
      // frameless door to the room
      const [dx, dz, nx, nz] = r.door;
      if (rng.chance(0.6)) { const x = c.tx(dx), z = c.tz(dz), along = nx ? 'z' : 'x'; const o = addObject(c, { kind: 'door', x, y: 0, z, ry: along === 'z' ? Math.PI / 2 : 0, mat: 'gugDark' }); o.collider = c.addCollider(along === 'x' ? x - 1 : x - 0.05, 0, along === 'z' ? z - 1 : z - 0.05, along === 'x' ? x + 1 : x + 0.05, 2.4, along === 'z' ? z + 1 : z + 0.05, false); o.collider.door = true; }
    }
    // scrawls
    const ws = wallSpots(c, (lx, lz, i) => c.floor[i] === 0);
    for (let k = rng.int(1, 3); k > 0 && ws.length; k--) { const s = rng.pick(ws), p = wallPos(c, s); addDecal(c, { name: rng.pick(['text0', 'text1', 'text2', 'text3']), x: p.x, y: rng.float(1.0, 2.2), z: p.z, nx: s.nx, ny: 0, nz: s.nz, size: rng.float(0.9, 1.6) }); }
    // the dead, and loose supplies
    if (rng.chance(dark ? 0.25 : 0.12)) { for (let t = 0; t < 10; t++) { const lx = rng.int(2, 13), lz = rng.int(2, 13), i = lz * CS + lx; if (freeTile(c, i) && c.floor[i] === 0) { this.corpse(c, rng, c.tx(lx), 0, c.tz(lz)); break; } } }
    for (let k = rng.int(0, 1); k > 0; k--) { const lx = rng.int(0, CS - 1), lz = rng.int(0, CS - 1), i = lz * CS + lx; if (freeTile(c, i)) addPickup(c, rng, LOOT, c.tx(lx), 0, c.tz(lz)); }
    // ways out: doors at side exits, chalk arrows toward the nearest
    if (sideExitAt(level, c.cx, c.cz)) {
      const to = EXITS[Math.floor(hash01(c.cx, c.cz, level.levelSeed, 1701) * EXITS.length)];
      addLevelDoor(c, level, rng, to, { p: 1, minR: 0, salt: 1702, label: 'LEVEL ' + to.slice(1), near: sideExitAt(level, c.cx, c.cz) });
      // a second door nearby, to somewhere else
      if (hash01(c.cx, c.cz, level.levelSeed, 1703) < 0.35) addLevelDoor(c, level, rng, EXITS[(EXITS.indexOf(to) + 1) % EXITS.length], { p: 1, minR: 0, salt: 1704 });
    }
    const goal = nearestExit(level, c.x0 + 16, c.z0 + 16);
    if (goal && !addPortArrow(c, rng, ports, goal, { count: 1 }) && rng.chance(0.5)) addWayfinding(c, rng, ws, goal, { name: 'arrow' });
  },

  interact(game, o, s) {
    if (o.kind !== 'gugDoor') return;
    if (s?.done) { game.subtitle('It won\'t open again.', 1.5); return; }
    game.request({ t: 'int', l: 'LG', id: o.id, a: 'try' });
  },
  hostInteract(game, pid, o, s, m) {
    if (o.kind !== 'gugDoor' || m.a !== 'try' || s.done) return;
    game.hostBroadcast({ t: 'os', l: 'LG', id: o.id, s: { done: true } });
    const r = hash4(o.x * 10 | 0, o.z * 10 | 0, 31) % 10;
    if (r < 3) {
      // something was left behind it
      const item = ['grayGoo', 'battery', 'medkit', 'grenade', 'ammo9', 'smallPack'][r * 2 % 6];
      game.hostSend(pid, { t: 'give', item: { id: item, qty: item === 'ammo9' ? 12 : 1 } });
      game.hostEvent('LG', { k: 'subtitle', text: 'The door opens onto a cupboard barely deep enough for what\'s inside. You take it. The door swings shut.', dur: 3 });
    } else if (r < 5) {
      game.hostEvent('LG', { k: 'subtitle', text: 'The door opens onto solid concrete. Someone has scratched "gug" into it, over and over.', dur: 3 });
    } else {
      game.hostEvent('LG', { k: 'subtitle', text: 'The handle turns all the way round. Nothing happens. On the other side, something knocks back.', dur: 3 });
      game.hostEvent('LG', { k: 'sound', name: 'knock', x: o.x, y: 1, z: o.z, volume: 1 });
    }
  },
};
