// Level 5 — The Sky Bridge. A colossal bridge suspended over an endless void
// of fog, with impossible pillars rising out of nowhere. At its end: the
// arena platform and THE GOANER. Floodlight towers expose its weak point.
// Defeating it opens the final gate.
import * as THREE from 'three';
import { TILE, CS, T_SOLID, T_FLOOR, T_VOID, F_ROOM, F_RESERVED, F_LANDMARK, OPEN_SKY } from '../chunk.js';
import { addProp, registerProps } from '../props.js';
import { addLight, addDecal, addObject, addPickup, addContainer, addNote } from './common.js';
import { hash01, hash4, RNG } from '../../core/rng.js';
import { registerObjectKind } from '../../game/objects.js';
import { CHUNK } from '../chunk.js';

const ARENA = { x: 221, z: 17, r: 26 };
const BRIDGE_Z0 = 5, BRIDGE_Z1 = 10;           // tile rows of the main bridge
const BRIDGE_X0 = -40;
const GATE_X0 = 84, GATE_X1 = 92;              // gatehouse / checkpoint tiles
const FAR_X0 = 124, FAR_X1 = 130;              // landing beyond the arena (exit gate)
const TOWER_R = 21;
const TOWERS = Array.from({ length: 6 }, (_, i) => {
  const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
  return { i, x: ARENA.x + Math.cos(a) * TOWER_R, z: ARENA.z + Math.sin(a) * TOWER_R, a };
});
const SECTORS = 8;
const COLLAPSE_ORDER = [1, 6, 3, 5, 2, 7]; // never 0 (exit side) or 4 (bridge side)
const LANTERN = [1, 0.78, 0.5];

const LOOT = [['almondWater', 16], ['waterBottle', 10], ['cannedBeans', 10], ['bandage', 14], ['medkit', 6], ['battery', 14, [1, 2]], ['flare', 14, [1, 2]], ['ammo9', 12, [8, 15]], ['shells', 8, [3, 6]], ['painkillers', 8], [null, 8]];
const ARMORY = [['shotgun', 10], ['smg', 10], ['pistol', 6], ['shells', 18, [4, 8]], ['ammo9', 18, [12, 24]], ['flare', 16, [2, 3]], ['medkit', 10]];

registerProps({
  lanternPost: {
    colliders: [[-0.12, 0, -0.12, 0.12, 3.2, 0.12]],
    build(p, B) {
      B.cyl('darkMetal', 0, 0, 0, 0.07, 3.0, 8, false, 0.05);
      B.box('darkMetal', 0, 0.06, 0, 0.3, 0.12, 0.3, 0.3);
      B.tube('darkMetal', 0, 2.9, 0, (p.out || 0) * 0.45, 3.05, 0, 0.03, 5);
    },
  },
  brokenPillar: {
    colliders: [[-0.9, 0, -0.9, 0.9, 6, 0.9]],
    build(p, B, rng) {
      const h = p.h || 4;
      B.cyl('stone', 0, 0, 0, 0.85, h, 12, true, 0.78, 1.5);
      B.box('stone', 0, 0.2, 0, 2.0, 0.4, 2.0, 1);
      for (let k = 0; k < 3; k++) B.box('stone', (rng?.next() ?? 0.5) * 1.6 - 0.8, h + 0.1, (rng?.next() ?? 0.5) * 1.6 - 0.8, 0.5, 0.3, 0.4, 0.5);
    },
  },
  gateArch: {
    colliders: p => [[-(p.w / 2) - 0.6, 0, -0.6, -(p.w / 2) + 0.6, 9, 0.6], [(p.w / 2) - 0.6, 0, -0.6, (p.w / 2) + 0.6, 9, 0.6]],
    build(p, B) {
      const w = p.w || 12;
      for (const s of [-1, 1]) { B.box('stone', s * w / 2, 4.5, 0, 1.2, 9, 1.2, 1.5); B.box('stone', s * w / 2, 0.3, 0, 1.6, 0.6, 1.6, 1); }
      B.box('stone', 0, 9.3, 0, w + 2.2, 1.2, 1.6, 1.5);
      B.box('stone', 0, 10.3, 0, w * 0.6, 0.8, 1.2, 1.5);
    },
  },
  bridgeTruss: {
    colliders: null,
    build(p, B) {
      // under-slab steel beams along the bridge
      B.box('rustMetal', 0, -1.6, -5.2, 2.05, 0.5, 0.3, 1);
      B.box('rustMetal', 0, -1.6, 5.2, 2.05, 0.5, 0.3, 1);
      B.tube('rustMetal', -1, -1.4, -5.2, 1, -2.6, 0, 0.06, 5);
      B.tube('rustMetal', -1, -1.4, 5.2, 1, -2.6, 0, 0.06, 5);
    },
  },
  floodBase: {
    colliders: [[-0.7, 0, -0.7, 0.7, 1.2, 0.7]],
    build(p, B) { B.box('stone', 0, 0.6, 0, 1.4, 1.2, 1.4, 1); B.box('hazard', 0, 1.22, 0, 1.42, 0.04, 1.42, 0.5); },
  },
});

registerObjectKind('floodSwitch', {
  build(o, game) {
    const g = new THREE.Group();
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.5, 0.2), game.lib.dyn('paintedMetal'));
    box.position.set(0, 1.0, 0); g.add(box);
    const lever = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.25, 0.05), game.lib.dyn('chrome'));
    lever.position.set(0, 1.05, 0.13); g.add(lever);
    const led = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.02), new THREE.MeshBasicMaterial({ color: 0xff2010 }));
    led.position.set(0.12, 1.18, 0.11); g.add(led);
    g.userData.lever = lever; g.userData.led = led;
    return g;
  },
  prompt(o, s, game) {
    if (s?.broken) return 'Floodlight destroyed';
    if (s?.on) return null;
    if (s?.cool && game.hostTime() < s.cool) return 'Floodlight overheated — cooling down';
    return 'Power floodlight';
  },
  radius: 0.7, centerY: 0.9,
  animate(mesh, o, s) {
    mesh.userData.lever.rotation.x = s?.on ? -0.8 : 0.6;
    mesh.userData.led.material.color.set(s?.broken ? 0x222222 : s?.on ? 0x30ff60 : 0xff2010);
  },
});

registerObjectKind('exitGate', {
  build(o, game) {
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: 0x0a0a0a, emissive: 0xffe6a0, emissiveIntensity: 0, roughness: 0.4 });
    const door = new THREE.Mesh(new THREE.BoxGeometry(3.2, 5.2, 0.2), mat);
    door.position.y = 2.6; g.add(door);
    g.userData.mat = mat;
    return g;
  },
  prompt(o, s, game) { return game.world.flag('L5', 'bossDead') ? 'Step through the gate' : 'A sealed gate. It hums with something alive.'; },
  radius: 1.8, centerY: 1.6,
  animate(mesh, o, s, dt) {
    const open = mesh.userData.open = (mesh.userData.open ?? 0) + ((s?.open ? 1 : 0) - (mesh.userData.open ?? 0)) * Math.min(1, dt * 0.7);
    mesh.userData.mat.emissiveIntensity = open * 3;
  },
});

function sectorOf(x, z) {
  const d = Math.hypot(x - ARENA.x, z - ARENA.z);
  if (d < 15 || d > ARENA.r + 0.5) return -1;
  let a = Math.atan2(z - ARENA.z, x - ARENA.x);
  if (a < 0) a += Math.PI * 2;
  return Math.floor(((a + Math.PI / SECTORS) % (Math.PI * 2)) / (Math.PI * 2 / SECTORS));
}

function branches(seed) {
  const rng = new RNG(hash4(seed, 555));
  const out = [];
  for (const bx of [22, 46, 68]) {
    const x = bx + rng.int(-3, 3);
    const dir = rng.chance(0.5) ? 1 : -1;
    const len = rng.int(9, 16);
    out.push({ x, dir, len });
  }
  return out;
}

function tileKind(tx, tz, br) {
  // returns null (void) or {fmat, zone}
  const cx = (tx + 0.5) * TILE, cz = (tz + 0.5) * TILE;
  if (Math.hypot(cx - ARENA.x, cz - ARENA.z) <= ARENA.r) return { fmat: 1, zone: 'arena' };
  if (tz >= BRIDGE_Z0 && tz <= BRIDGE_Z1 && tx >= BRIDGE_X0 && tx <= 100) return { fmat: 0, zone: 'bridge' };
  if (tx >= GATE_X0 && tx <= GATE_X1 && tz >= BRIDGE_Z0 - 2 && tz <= BRIDGE_Z1 + 2) return { fmat: 0, zone: 'gate' };
  if (tx >= FAR_X0 - 2 && tx <= FAR_X1 && tz >= 6 && tz <= 9) return { fmat: 1, zone: 'far' };
  for (const b of br) {
    const zs = b.dir > 0 ? BRIDGE_Z1 + 1 : BRIDGE_Z0 - b.len;
    const ze = b.dir > 0 ? BRIDGE_Z1 + b.len : BRIDGE_Z0 - 1;
    if (tx >= b.x && tx <= b.x + 1 && tz >= zs && tz <= ze) return { fmat: 0, zone: 'branch' };
    const pz = b.dir > 0 ? ze + 1 : zs - 5;
    if (tx >= b.x - 2 && tx <= b.x + 3 && tz >= pz && tz <= pz + 4) return { fmat: 1, zone: 'platform', b };
  }
  return null;
}

export default {
  id: 'L5',
  name: 'Level 5',
  title: 'The Sky Bridge',
  next: null,
  arena: ARENA,
  objective: 'Cross the bridge. Something waits at the end of it.',
  objectiveText(game) {
    if (game.world.flag('L5', 'bossDead')) return 'The Goaner is dead. Step through the gate beyond the arena.';
    if (game.world.flag('L5', 'bossAwake')) return 'Power the floodlights. Hit the Goaner while it is LIT — or while its stinger is stuck.';
    if (game.player.pos.x > GATE_X0 * TILE) return 'The arena lies ahead. Floodlight switches stand at the base of each tower.';
    return 'Cross the bridge. Stay in the middle — the wind pushes.';
  },
  subtitle: 'There is no bottom. There is only the bridge.',
  palette: {
    floor: [{ mat: 'bridgeConcrete', scale: 4 }, { mat: 'stone', scale: 3 }],
    wall: [{ mat: 'stone', scaleU: 3, scaleV: 3 }],
    ceil: [{ mat: 'stone', scale: 3 }],
    ledge: { mat: 'stone', scale: 2 },
    soffit: { mat: 'stone', scaleU: 3, scaleV: 3 },
  },
  materials: ['bridgeConcrete', 'stone', 'rustMetal', 'darkMetal', 'chrome', 'hazard', 'paintedMetal', 'woodCrate', 'paper', 'bulbWarm', 'glowWhite', 'glowRed', 'black', 'chitin', 'bone', 'cardboard'],
  ambient: [0.05, 0.056, 0.068],
  bakeGain: 0.09,
  exposure: 1.05,
  fog: { color: 0x5d6672, density: 0.0085 },
  background: 0x5d6672,
  far: 900,
  renderRadius: 3,
  voidLedge: 1.3,
  killY: -45,
  noDirector: false,
  allowBlackout: false,
  grade: { lift: [0.01, 0.015, 0.03], gamma: [1.0, 1.0, 1.02], gain: [0.98, 1.0, 1.06], saturation: 0.7, tint: [0.96, 0.99, 1.05], vignette: 0.5, grain: 0.045, bloomStrength: 0.7, bloomThreshold: 0.8 },
  hemi: { sky: 0x8a98aa, ground: 0x1c2026, intensity: 0.42 },
  dust: { color: 0xd0d8e8, opacity: 0.22 },
  portConfig: { min: 1, max: 1 },
  ambience: 'bridge',
  surface: 'concrete',
  notes: ['l5_a', 'l5_b', 'l5_c', 'l5_d'],
  decalTexts: ['NO BOTTOM', 'LIGHT IT UP', 'STAY CENTER', 'IT OWNS THIS'],
  entities: { primary: null, max: 0, rare: ['lookalike'] },
  eventSounds: ['metalGroan', 'distantThud', 'goanerBleat', 'whisper'],

  landmarks() { return [{ type: 'spawn', tx: 8, tz: 8 }]; },

  generate(c, ctx) {
    const { rng, level } = ctx;
    const br = branches(level.levelSeed);
    for (let lz = 0; lz < CS; lz++) for (let lx = 0; lx < CS; lx++) {
      const i = lz * CS + lx;
      const tx = c.cx * CS + lx, tz = c.cz * CS + lz;
      const k = tileKind(tx, tz, br);
      if (!k) { c.type[i] = T_VOID; c.ceil[i] = OPEN_SKY; continue; }
      c.type[i] = T_FLOOR; c.floor[i] = 0; c.ceil[i] = OPEN_SKY; c.fmat[i] = k.fmat; c.cmat[i] = 0;
      if (k.zone === 'arena') c.flags[i] |= F_ROOM;
    }
    // railings along void edges of bridges (not the arena)
    const at = (lx, lz) => (lx < 0 || lz < 0 || lx >= CS || lz >= CS) ? (tileKind(c.cx * CS + lx, c.cz * CS + lz, br) ? T_FLOOR : T_VOID) : c.type[lz * CS + lx];
    for (let lz = 0; lz < CS; lz++) for (let lx = 0; lx < CS; lx++) {
      const i = lz * CS + lx;
      if (c.type[i] !== T_FLOOR) continue;
      const tx = c.cx * CS + lx, tz = c.cz * CS + lz;
      const kind = tileKind(tx, tz, br);
      if (kind.zone === 'arena') continue;
      const x = c.tx(lx), z = c.tz(lz);
      const gap = hash01(tx, tz, level.levelSeed, 7) < 0.12;
      for (const [dx, dz] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
        if (at(lx + dx, lz + dz) !== T_VOID) continue;
        if (!gap) addProp(c, 'railing', x + dx * 0.95, 0, z + dz * 0.95, dz !== 0 ? 0 : Math.PI / 2, { len: 2.0, mat: 'rustMetal' });
        if ((tx % 6 === 0 && dz !== 0) || (tz % 6 === 0 && dx !== 0)) {
          addProp(c, 'lanternPost', x + dx * 0.75, 0, z + dz * 0.75, 0);
          if (rng.chance(0.85)) addLight(c, { kind: 'lantern', x: x + dx * 0.75, y: 3.18, z: z + dz * 0.75, color: LANTERN, intensity: 9, range: 12, flicker: rng.chance(0.12) ? 0.5 : 0 });
        }
      }
      // under-bridge trusses on the main span
      if (kind.zone === 'bridge' && tz === 8) addProp(c, 'bridgeTruss', x, 0, (BRIDGE_Z0 + BRIDGE_Z1 + 1) / 2 * TILE, 0);
    }
    // scatter debris, cracks and the occasional loot
    for (let k = rng.int(0, 3); k > 0; k--) {
      const lx = rng.int(0, CS - 1), lz = rng.int(0, CS - 1), i = lz * CS + lx;
      if (c.type[i] !== T_FLOOR) continue;
      addDecal(c, { name: rng.pick(['stain', 'scratch', 'blood2']), x: c.tx(lx), y: 0.005, z: c.tz(lz), nx: 0, ny: 1, nz: 0, size: rng.float(1, 2.2), rot: rng.float(0, 6.28) });
    }
    for (let lz = 0; lz < CS; lz++) for (let lx = 0; lx < CS; lx++) {
      const i = lz * CS + lx;
      if (c.type[i] !== T_FLOOR) continue;
      const tx = c.cx * CS + lx, tz = c.cz * CS + lz;
      const kind = tileKind(tx, tz, br);
      if (kind.zone === 'platform' && tx === kind.b.x && (tz === (kind.b.dir > 0 ? BRIDGE_Z1 + kind.b.len + 3 : BRIDGE_Z0 - kind.b.len - 3))) {
        const x = c.tx(lx), z = c.tz(lz);
        addProp(c, 'brokenPillar', x + 2.5, 0, z, 0, { h: rng.float(2, 5) });
        addContainer(c, rng, 'crate', LOOT, x - 1.5, 0, z + 0.8, rng.float(0, 1), [2, 3]);
        addNote(c, rng.pick(['l5_a', 'l5_b']), x, 0.005, z - 1, rng.float(0, 6));
        addLight(c, { kind: 'bulb', cord: 0.1, x: x + 1.2, y: 2.2, z: z - 1.4, color: LANTERN, intensity: 4, range: 9, flicker: 0.3 });
        addProp(c, 'lanternPost', x + 1.2, 0, z - 1.4, 0);
      }
      if (kind.zone === 'bridge' && rng.chance(0.004)) addPickup(c, rng, LOOT, c.tx(lx), 0, c.tz(lz));
    }
    // gatehouse / checkpoint
    if (c.x0 <= GATE_X0 * TILE + 8 && c.x0 + CHUNK > GATE_X0 * TILE + 8 && c.z0 <= 17 && c.z0 + CHUNK > 17) {
      const gx = (GATE_X0 + 4) * TILE, gz = 17;
      addProp(c, 'gateArch', gx, 0, gz, Math.PI / 2, { w: 14 });
      addContainer(c, rng, 'crate', ARMORY, gx + 3, 0, gz - 6.5, 0, [3, 4]);
      addContainer(c, rng, 'crate', [['flare', 20, [2, 3]], ['medkit', 8], ['battery', 10, [2, 3]], ['almondWater', 10]], gx - 3, 0, gz + 6.5, Math.PI, [3, 3]);
      addNote(c, 'l5_d', gx + 1, 0.005, gz - 5.5, 0.4);
      addLight(c, { kind: 'bulb', cord: 0.2, shade: true, x: gx, y: 7.6, z: gz, color: LANTERN, intensity: 9, range: 16, flicker: 0.15 });
    }
    // arena furniture: pillars, tower bases + switches, entrance supply
    for (const T of TOWERS) {
      if (Math.floor(T.x / CHUNK) !== c.cx || Math.floor(T.z / CHUNK) !== c.cz) continue;
      addProp(c, 'floodBase', T.x, 0, T.z, 0);
      const ix = T.x + (ARENA.x - T.x) / TOWER_R * 1.1, iz = T.z + (ARENA.z - T.z) / TOWER_R * 1.1;
      addObject(c, { kind: 'floodSwitch', x: ix, y: 0, z: iz, ry: Math.atan2(ARENA.x - T.x, ARENA.z - T.z), tower: T.i });
    }
    const pillars = [[ARENA.x - 7, ARENA.z - 6], [ARENA.x + 6, ARENA.z - 8], [ARENA.x + 7, ARENA.z + 6], [ARENA.x - 6, ARENA.z + 8]];
    pillars.forEach(([px, pz], k) => { if (Math.floor(px / CHUNK) === c.cx && Math.floor(pz / CHUNK) === c.cz) addProp(c, 'brokenPillar', px, 0, pz, k, { h: 2.5 + k * 0.8 }); });
    const ent = { x: ARENA.x - ARENA.r + 3, z: ARENA.z };
    if (Math.floor(ent.x / CHUNK) === c.cx && Math.floor(ent.z / CHUNK) === c.cz) {
      addNote(c, 'l5_c', ent.x + 0.5, 0.005, ent.z - 3, 0.2);
      addContainer(c, rng, 'crate', [['flare', 20, [3, 4]], ['shells', 10, [4, 6]], ['ammo9', 10, [12, 18]]], ent.x, 0, ent.z + 4.5, 0, [2, 3]);
    }
    // the exit gate on the far landing
    const gxw = (FAR_X0 + 3) * TILE, gzw = 17;
    if (Math.floor(gxw / CHUNK) === c.cx && Math.floor(gzw / CHUNK) === c.cz) {
      addProp(c, 'gateArch', gxw, 0, gzw, Math.PI / 2, { w: 5 });
      const gate = addObject(c, { kind: 'exitGate', x: gxw, y: 0, z: gzw, ry: Math.PI / 2 });
      gate.collider = c.addCollider(gxw - 0.3, 0, gzw - 2, gxw + 0.3, 6, gzw + 2, false);
      addObject(c, { kind: 'exit', x: gxw + 1.5, y: 10, z: gzw, r: 1.6, to: 'victory', requires: 'bossDead' });
    }
  },

  // under-slab geometry and support pillars dropping into the void
  buildExtra(level, c, B, rng) {
    let any = false;
    for (let lz = 0; lz < CS; lz++) for (let lx = 0; lx < CS; lx++) {
      const i = lz * CS + lx;
      if (c.type[i] !== T_FLOOR) continue;
      any = true;
      const x0 = c.x0 + lx * TILE, z0 = c.z0 + lz * TILE, y = -1.3;
      B.quad('stone', [x0, y, z0], [x0 + TILE, y, z0], [x0 + TILE, y, z0 + TILE], [x0, y, z0 + TILE], [0, -1, 0], [[0, 0], [1, 0], [1, 1], [0, 1]]);
    }
    if (!any) return;
    // a support pier every 24 m along the main bridge
    for (let lx = 0; lx < CS; lx++) {
      const tx = c.cx * CS + lx;
      if (tx % 12 !== 0 || tx < BRIDGE_X0 || tx > 96) continue;
      for (const tz of [BRIDGE_Z0 + 1, BRIDGE_Z1 - 1]) {
        if (Math.floor(tz / CS) !== c.cz) continue;
        const x = (tx + 0.5) * TILE, z = (tz + 0.5) * TILE;
        B.anchor = [0.04, 0.045, 0.055]; B.anchorY = -200;
        B.box('stone', x, -1.3 - 90, z, 2.6, 180, 2.6, 4);
        B.box('stone', x, -4, z, 3.4, 2, 3.4, 2);
        B.anchor = null;
      }
    }
    // arena underside: an inverted spire
    if (Math.floor(ARENA.x / CHUNK) === c.cx && Math.floor(ARENA.z / CHUNK) === c.cz) {
      B.anchor = [0.035, 0.04, 0.05]; B.anchorY = -300;
      const g = new THREE.ConeGeometry(ARENA.r * 0.85, 140, 16, 1, true);
      g.rotateX(Math.PI);
      g.translate(ARENA.x, -1.3 - 70, ARENA.z);
      B.geometry('stone', g, null);
      B.anchor = null;
    }
  },

  // ------------------------------------------------------------------ scene
  setupScene(game) {
    const scene = game.engine.scene;
    const group = new THREE.Group();
    group.name = 'L5 scene';
    // sky dome
    const sky = new THREE.Mesh(new THREE.SphereGeometry(850, 32, 16), new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { top: { value: new THREE.Color(0x1c2230) }, mid: { value: new THREE.Color(0x5d6672) }, bot: { value: new THREE.Color(0x2a2f36) } },
      vertexShader: 'varying vec3 vP; void main(){ vP = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position = p.xyww; }',
      fragmentShader: 'uniform vec3 top, mid, bot; varying vec3 vP; void main(){ float h = normalize(vP).y; vec3 c = h > 0.0 ? mix(mid, top, pow(h, 0.5)) : mix(mid, bot, pow(-h, 0.7)); gl_FragColor = vec4(c, 1.0); }',
    }));
    sky.renderOrder = -10;
    sky.frustumCulled = false;
    group.add(sky);
    group.userData.sky = sky;
    // distant colossal pillars (instanced)
    const rng = new RNG(hash4(game.seed, 909));
    const stone = game.lib.dyn('stone');
    const N = 46;
    const pillarGeo = new THREE.CylinderGeometry(1, 1.15, 1, 12, 1);
    pillarGeo.translate(0, 0.5, 0);
    const inst = new THREE.InstancedMesh(pillarGeo, stone, N);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
    for (let i = 0; i < N; i++) {
      const a = rng.float(0, Math.PI * 2), d = rng.float(110, 620);
      const r = rng.float(5, 22);
      const top = rng.float(-40, 120);
      p.set(ARENA.x * 0.5 + Math.cos(a) * d, -500, 17 + Math.sin(a) * d);
      s.set(r, top + 500, r);
      q.setFromAxisAngle(new THREE.Vector3(Math.random() - 0.5, 0, Math.random() - 0.5).normalize(), rng.float(0, 0.08));
      m.compose(p, q, s);
      inst.setMatrixAt(i, m);
    }
    inst.frustumCulled = false;
    group.add(inst);
    // far-off broken bridges and floating fragments
    for (let i = 0; i < 9; i++) {
      const len = rng.float(80, 260);
      const b = new THREE.Mesh(new THREE.BoxGeometry(len, 3, rng.float(8, 14)), stone);
      const a = rng.float(0, Math.PI * 2), d = rng.float(160, 480);
      b.position.set(ARENA.x * 0.5 + Math.cos(a) * d, rng.float(-60, 70), 17 + Math.sin(a) * d);
      b.rotation.y = rng.float(0, Math.PI);
      b.rotation.z = rng.float(-0.05, 0.05);
      group.add(b);
    }
    for (let i = 0; i < 14; i++) {
      // floating rock islands: jittered dodecahedra, flattened on top
      const geo = new THREE.DodecahedronGeometry(1, 1);
      const pa = geo.attributes.position;
      for (let k = 0; k < pa.count; k++) {
        const y = pa.getY(k);
        const j = 0.75 + Math.random() * 0.5;
        pa.setXYZ(k, pa.getX(k) * j, y > 0.3 ? 0.3 + (y - 0.3) * 0.2 : y * (1.6 + Math.random() * 0.8), pa.getZ(k) * j);
      }
      geo.computeVertexNormals();
      const f = new THREE.Mesh(geo, stone);
      const sc = rng.float(5, 16);
      f.scale.set(sc, sc * rng.float(0.8, 1.4), sc);
      const a = rng.float(0, Math.PI * 2), d = rng.float(90, 420);
      f.position.set(ARENA.x * 0.5 + Math.cos(a) * d, rng.float(-20, 60), 17 + Math.sin(a) * d);
      group.add(f);
    }
    // pale moon light
    const moon = new THREE.DirectionalLight(0xc8d4ff, 0.5);
    moon.position.set(-200, 300, 120);
    group.add(moon);
    // floodlight towers (dynamic: they can be destroyed)
    const towerMat = game.lib.dyn('rustMetal');
    group.userData.towers = TOWERS.map(T => {
      const tg = new THREE.Group();
      tg.position.set(T.x, 1.2, T.z);
      const H = 9;
      for (const [ox, oz] of [[-0.35, -0.35], [0.35, -0.35], [-0.35, 0.35], [0.35, 0.35]]) {
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, H, 5), towerMat); leg.position.set(ox, H / 2, oz); tg.add(leg);
      }
      for (let y = 1; y < H; y += 1.5) { const brace = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.05, 0.8), towerMat); brace.position.y = y; tg.add(brace); }
      const head = new THREE.Group(); head.position.y = H + 0.3;
      const housing = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.9, 0.6), game.lib.dyn('darkMetal')); head.add(housing);
      const lensMat = new THREE.MeshStandardMaterial({ color: 0x222222, emissive: 0xfff2d0, emissiveIntensity: 0 });
      const lens = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.7, 0.05), lensMat); lens.position.z = 0.31; head.add(lens);
      head.lookAt(new THREE.Vector3(ARENA.x + (ARENA.x - T.x) * 0.2, 1.2, ARENA.z + (ARENA.z - T.z) * 0.2).sub(tg.position).add(head.position));
      tg.add(head);
      const spot = new THREE.SpotLight(0xfff0d0, 0, 70, 0.4, 0.45, 2);
      spot.position.set(T.x, H + 1.5, T.z);
      spot.target.position.set(ARENA.x + (ARENA.x - T.x) * 0.25, 0, ARENA.z + (ARENA.z - T.z) * 0.25);
      group.add(spot, spot.target);
      // volumetric beam
      const bl = spot.position.distanceTo(spot.target.position);
      const beamGeo = new THREE.ConeGeometry(Math.tan(0.4) * bl, bl, 20, 1, true);
      beamGeo.translate(0, -bl / 2, 0);
      beamGeo.rotateX(-Math.PI / 2);
      const beam = new THREE.Mesh(beamGeo, new THREE.ShaderMaterial({
        uniforms: { color: { value: new THREE.Color(0xfff0d0) }, len: { value: bl } },
        vertexShader: 'varying float vD; varying vec3 vN; varying vec3 vV; void main(){ vD = -position.z; vec4 mv = modelViewMatrix * vec4(position,1.0); vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }',
        fragmentShader: 'uniform vec3 color; uniform float len; varying float vD; varying vec3 vN; varying vec3 vV; void main(){ float edge = pow(abs(dot(vN, vV)), 2.0); float a = 0.11 * (1.0 - clamp(vD / len, 0.0, 1.0)) * edge; gl_FragColor = vec4(color * a, a); }',
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      }));
      beam.position.copy(spot.position);
      beam.lookAt(spot.target.position);
      beam.visible = false;
      group.add(beam);
      group.add(tg);
      return { T, tg, lensMat, spot, beam, tilt: 0 };
    });
    scene.add(group);
    game.levelGroup = group;
    game.engine.camera.far = 1000;
    game.engine.camera.updateProjectionMatrix();
  },

  teardownScene(game) {
    if (game.levelGroup) { game.engine.scene.remove(game.levelGroup); game.levelGroup = null; }
    for (const r of game.l5rocks || []) game.engine.scene.remove(r.mesh, r.ring);
    game.l5rocks = [];
  },

  // ------------------------------------------------------------------ boss support (host)
  switchState(game, i) {
    const lvl = game.getLevel('L5');
    const T = TOWERS[i];
    const c = lvl.chunk(Math.floor(T.x / CHUNK), Math.floor(T.z / CHUNK));
    const o = c.objects.find(o => o.kind === 'floodSwitch' && o.tower === i);
    return { o, s: o ? game.world.get('L5', o.id) : null };
  },
  litTowers(game) { return TOWERS.filter(T => this.towerLit(game, T)); },
  towerLit(game, T) { const { s } = this.switchState(game, T.i); return !!(s?.on && !s.broken); },
  towerHit(game, x, z, r) {
    for (const T of TOWERS) {
      if (Math.hypot(T.x - x, T.z - z) > r + 1) continue;
      const { o, s } = this.switchState(game, T.i);
      if (!o || s?.broken) continue;
      game.hostBroadcast({ t: 'os', l: 'L5', id: o.id, s: { on: false, broken: true } });
      game.hostEvent('L5', { k: 'towerFall', i: T.i });
    }
  },
  floodExposure(game, x, y, z) {
    let best = 0;
    for (const T of TOWERS) {
      if (!this.towerLit(game, T)) continue;
      const sx = T.x, sy = 10.5, sz = T.z;
      const tx = ARENA.x + (ARENA.x - T.x) * 0.25 - sx, ty = -sy, tz = ARENA.z + (ARENA.z - T.z) * 0.25 - sz;
      const tl = Math.hypot(tx, ty, tz);
      const vx = x - sx, vy = y - sy, vz = z - sz;
      const vl = Math.hypot(vx, vy, vz);
      const cos = (tx * vx + ty * vy + tz * vz) / (tl * vl);
      if (cos > Math.cos(0.42) && vl < 60) best = 1;
    }
    return best;
  },
  collapseNext(game) {
    const done = game.world.flag('L5', 'collapsed') || [];
    const next = COLLAPSE_ORDER.find(s => !done.includes(s));
    if (next === undefined) return;
    game.hostEvent('L5', { k: 'crackWarn', sector: next });
    setTimeout(() => {
      const cur = game.world.flag('L5', 'collapsed') || [];
      if (cur.includes(next)) return;
      const list = [...cur, next];
      game.hostBroadcast({ t: 'flag', l: 'L5', k: 'collapsed', v: list });
      game.hostEvent('L5', { k: 'collapse', sector: next });
      // towers standing on that sector fall
      for (const T of TOWERS) if (sectorOf(T.x, T.z) === next) this.towerHit(game, T.x, T.z, 0.5);
    }, 3000);
  },
  resetBoss(game, e) {
    e.hp = e.maxHp; e.phase = 0; e.state = 'dormant'; e.stateT = 0; e.stateChanged = true;
    e.x = e.home.x; e.z = e.home.z; e.y = 0; e.alt = 0; e.marker = null; e.line = null; e.wave = null; e.emptyT = 0;
    e.collapseT = 8;
    if ((game.world.flag('L5', 'collapsed') || []).length) { game.hostBroadcast({ t: 'flag', l: 'L5', k: 'collapsed', v: [] }); game.hostEvent('L5', { k: 'restore' }); }
    game.hostBroadcast({ t: 'flag', l: 'L5', k: 'bossAwake', v: false });
    for (const T of TOWERS) { const { o } = this.switchState(game, T.i); if (o) game.hostBroadcast({ t: 'os', l: 'L5', id: o.id, s: { on: false, broken: false } }); game.hostEvent('L5', { k: 'towerFix', i: T.i }); }
  },
  bossDefeated(game) {
    game.hostBroadcast({ t: 'flag', l: 'L5', k: 'bossDead', v: true });
    const lvl = game.getLevel('L5');
    const gxw = (FAR_X0 + 3) * TILE;
    const c = lvl.chunk(Math.floor(gxw / CHUNK), Math.floor(17 / CHUNK));
    const gate = c.objects.find(o => o.kind === 'exitGate');
    if (gate) game.hostBroadcast({ t: 'os', l: 'L5', id: gate.id, s: { open: true } });
    game.hostEvent('L5', { k: 'subtitle', text: 'Beyond the arena, the sealed gate begins to glow.', dur: 4 });
  },
  bossSnap(game, lvl) {
    if (lvl !== 'L5') return undefined;
    const e = [...game.entities.list.values()].find(x => x.type === 'goaner');
    if (!e || e.state === 'dormant' || e.state === 'dead') return { active: false };
    return { active: true, name: 'THE GOANER', hp: e.hp / e.maxHp, phase: e.def.phaseName(e.phase) };
  },

  hostUpdate(game, ctx) {
    // spawn the boss once
    if (!game.world.flag('L5', 'bossDead') && ![...game.entities.list.values()].some(e => e.type === 'goaner')) {
      const players = game.online ? Math.max(ctx.players.length, game.remotes.size + 1) : 1;
      game.entities.spawn('goaner', 'L5', ARENA.x + ARENA.r * 0.62, ARENA.z, { hpMul: (1 + 0.65 * (players - 1)) * (ctx.difficulty === 'easy' ? 0.75 : ctx.difficulty === 'hard' ? 1.25 : 1) });
    }
    // floodlight overheat timers
    for (const T of TOWERS) {
      const { o, s } = this.switchState(game, T.i);
      if (!o || !s?.on) continue;
      if (game.time > (s.until || Infinity)) game.hostBroadcast({ t: 'os', l: 'L5', id: o.id, s: { on: false, cool: game.time + 12 } });
    }
    if (game.isHost && game.levelId === 'L5') game.boss = this.bossSnap(game, 'L5');
  },

  hostInteract(game, pid, o, s, m) {
    if (o.kind === 'floodSwitch' && !s.on && !s.broken && !(s.cool && game.time < s.cool)) {
      game.hostBroadcast({ t: 'os', l: 'L5', id: o.id, s: { on: true, until: game.time + 40 } });
      game.hostEvent('L5', { k: 'sound', name: 'metalDoor', x: o.x, y: 2, z: o.z, volume: 0.5 });
    }
  },

  interact(game, o, s) {
    if (o.kind === 'floodSwitch') {
      if (s?.broken || s?.on) return;
      game.request({ t: 'int', l: 'L5', id: o.id, a: 'power' });
      game.sfx('unlock', o, {});
    } else if (o.kind === 'exitGate') {
      if (game.world.flag('L5', 'bossDead')) game.useExit('victory');
      else game.subtitle('The gate will not open while its keeper lives.', 2);
    }
  },

  // ------------------------------------------------------------------ client
  applyRuntime(game, level, c) {
    const done = game.world.flag('L5', 'collapsed') || [];
    if (!c.meta.origType) c.meta.origType = c.type.slice();
    let changed = false;
    for (let lz = 0; lz < CS; lz++) for (let lx = 0; lx < CS; lx++) {
      const i = lz * CS + lx;
      const sec = sectorOf(c.tx(lx), c.tz(lz));
      const want = sec >= 0 && done.includes(sec) ? T_VOID : c.meta.origType[i];
      if (c.type[i] !== want) { c.type[i] = want; changed = true; }
    }
    return changed;
  },

  clientEvent(game, m) {
    const scene = game.engine.scene;
    if (m.k === 'collapse' || m.k === 'restore') {
      const lvl = game.getLevel('L5');
      for (const c of lvl.chunks.values()) if (this.applyRuntime(game, lvl, c)) game.renderer.rebuild(c.cx, c.cz);
      if (m.k === 'collapse') {
        game.sfx('crumble', { x: ARENA.x, y: 0, z: ARENA.z }, { volume: 1.4, ref: 20 });
        const a = (m.sector / SECTORS) * Math.PI * 2;
        for (let k = 0; k < 6; k++) game.effects.burst('debris', { x: ARENA.x + Math.cos(a) * (18 + k), y: 0, z: ARENA.z + Math.sin(a) * (18 + k), floor: -60 });
        game.player.shake = Math.min(1, game.player.shake + 0.6);
      }
    } else if (m.k === 'crackWarn') {
      const a = (m.sector / SECTORS) * Math.PI * 2;
      for (let k = 0; k < 8; k++) game.effects.burst('dustFall', { x: ARENA.x + Math.cos(a) * 20, y: 0.3, z: ARENA.z + Math.sin(a) * 20, floor: 0 });
      game.sfx('metalGroan', { x: ARENA.x + Math.cos(a) * 20, y: 0, z: ARENA.z + Math.sin(a) * 20 }, { volume: 1, ref: 10 });
      game.subtitle('The edge of the platform is cracking!', 2, 'warn');
    } else if (m.k === 'debris') {
      const ring = new THREE.Mesh(new THREE.RingGeometry(1.8, 2.1, 32), new THREE.MeshBasicMaterial({ color: 0xff3020, transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false }));
      ring.rotation.x = -Math.PI / 2; ring.position.set(m.x, 0.05, m.z);
      const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.9, 0), game.lib.dyn('stone'));
      rock.position.set(m.x, 28, m.z);
      scene.add(ring, rock);
      game.l5rocks = game.l5rocks || [];
      game.l5rocks.push({ mesh: rock, ring, t: 0, dur: m.t, x: m.x, z: m.z });
    } else if (m.k === 'shockwave') {
      game.effects.burst('shock', { x: m.x, y: 0, z: m.z });
      game.effects.burst('debris', { x: m.x, y: 0, z: m.z, floor: 0 });
      game.sfx('stomp', { x: m.x, y: 0, z: m.z }, { volume: 1.5, ref: 12 });
    } else if (m.k === 'towerFall') {
      const tw = game.levelGroup?.userData.towers?.[m.i];
      if (tw) { tw.falling = true; game.sfx('crumble', tw.T, { volume: 1.2, ref: 12 }); for (let k = 0; k < 20; k++) game.effects.burst('impact', { x: tw.T.x, y: 10, z: tw.T.z }, { x: 0, y: -1, z: 0 }); }
    } else if (m.k === 'towerFix') {
      const tw = game.levelGroup?.userData.towers?.[m.i];
      if (tw) { tw.falling = false; tw.tilt = 0; tw.tg.rotation.set(0, 0, 0); }
    }
  },

  clientUpdate(game, dt) {
    const g = game.levelGroup;
    if (!g) return;
    g.userData.sky.position.copy(game.engine.camera.position);
    // floodlights follow switch states
    for (const tw of g.userData.towers) {
      const { s } = this.switchState(game, tw.T.i);
      const on = !!(s?.on && !s.broken);
      tw.spot.intensity += ((on ? 900 : 0) - tw.spot.intensity) * Math.min(1, dt * 6);
      tw.lensMat.emissiveIntensity = on ? 4 : 0;
      tw.beam.visible = on;
      if (tw.falling && tw.tilt < 1.2) { tw.tilt += dt * 1.4; tw.tg.rotation.set(tw.tilt * Math.cos(tw.T.a), 0, -tw.tilt * Math.sin(tw.T.a)); }
    }
    // falling debris
    for (let i = (game.l5rocks || []).length - 1; i >= 0; i--) {
      const r = game.l5rocks[i];
      r.t += dt;
      const k = Math.min(1, r.t / r.dur);
      r.mesh.position.y = 28 * (1 - k * k);
      r.mesh.rotation.x += dt * 3; r.mesh.rotation.z += dt * 2;
      r.ring.material.opacity = 0.35 + Math.sin(r.t * 16) * 0.25;
      if (k >= 1) {
        game.effects.burst('debris', { x: r.x, y: 0.2, z: r.z, floor: 0 });
        game.sfx('crumble', { x: r.x, y: 0, z: r.z }, { volume: 1, ref: 8 });
        game.engine.scene.remove(r.mesh, r.ring);
        game.l5rocks.splice(i, 1);
      }
    }
  },

  localUpdate(game, dt) {
    const P = game.player;
    // checkpoint at the gatehouse
    if (!game.flags.l5checkpoint && P.pos.x > (GATE_X0 + 3) * TILE) {
      game.flags.l5checkpoint = true;
      game.checkpoint = { levelId: 'L5', x: (GATE_X0 + 6) * TILE, y: 0, z: 17 };
      game.subtitle('Checkpoint. The gatehouse will remember you.', 3);
      game.sfx('revive', null, { volume: 0.6 });
    }
    // wind gusts on the open bridge (not the arena)
    const t = game.time;
    const gust = Math.max(0, Math.sin(t * 0.21) * Math.sin(t * 0.083 + 1.3)) ** 2;
    const inArena = Math.hypot(P.pos.x - ARENA.x, P.pos.z - ARENA.z) < ARENA.r;
    if (!inArena && P.grounded && gust > 0.3) {
      P.vel.z += Math.sin(t * 0.05) * gust * dt * 2.4;
      if (!game.windWarned && gust > 0.6) { game.windWarned = true; game.subtitle('A gust drags at you. Stay in the middle.', 2.5, 'warn'); }
    }
  },
};
