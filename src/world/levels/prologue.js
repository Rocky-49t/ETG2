// Prologue — Site Kestrel. A US Goaning Program lab on Earth. The team picks
// their kits from the equipment bay, listens to the briefing and boards the
// Goaning Machine. Once everyone is seated the door seals, the binding array
// charges and the jump begins... and something in the array gives way.
// Host-driven timeline; clients play dialogue and effects from events.
import * as THREE from 'three';
import { TILE, CS, T_FLOOR, F_ROOM, F_RESERVED, F_LANDMARK } from '../chunk.js';
import { carveRect } from '../gen.js';
import { addProp, registerProps } from '../props.js';
import { addLight, addDecal, addObject } from './common.js';
import { placeGoaningMachine, inChamber } from '../machine.js';
import { registerObjectKind } from '../../game/objects.js';
import { CLASSES, CLASS_ORDER } from '../../game/classes.js';
import { Avatar } from '../../game/avatar.js';
import { itemModel } from '../../game/models.js';
import { input } from '../../core/input.js';

const MX = 16, MZ = 9;                       // machine centre
const RACK_Z = [13, 16, 19, 22, 25];
const SCIENTISTS = [
  { id: 'halvorsen', name: 'Dr. Halvorsen', x: 20.6, z: 16.2, yaw: Math.PI * 0.9, skin: { shirt: 'labcoat', shirtColor: '#8ea3b8', pantsColor: '#2b2f38', hair: 'bun', hairColor: '#a8743f', skinTone: '#e5b994', accessory: 'glasses' } },
  { id: 'oyelaran', name: 'Dr. Oyelaran', x: 20.4, z: 11.4, yaw: -Math.PI * 0.6, skin: { shirt: 'labcoat', shirtColor: '#5b7a5a', pantsColor: '#3a3a3a', hair: 'short', hairColor: '#1b1410', skinTone: '#6b4a32', accessory: 'none' } },
  { id: 'pruitt', name: 'Tech Pruitt', x: 26.6, z: 14.4, yaw: -Math.PI / 2, skin: { shirt: 'labcoat', shirtColor: '#c9a640', pantsColor: '#30343a', hair: 'curly', hairColor: '#6b4423', skinTone: '#c99a74', accessory: 'none', headwear: 'none' } },
  { id: 'okafor', name: 'Sgt. Okafor', x: 22.5, z: 27.6, yaw: Math.PI, skin: { shirt: 'jacket', shirtColor: '#4f5a3c', pantsColor: '#3c4230', hair: 'short', hairColor: '#1b1410', skinTone: '#4e3424', headwear: 'cap', headwearColor: '#3c4230', accessory: 'none' } },
];

// briefing lines: [time, speaker, text]
const BRIEF = [
  [1.2, 'halvorsen', 'Morning, team. Welcome to Site Kestrel — the Goaning Program.'],
  [6.5, 'halvorsen', 'Equipment bay is on your left. Each locker is one role — take the kit you trained with.'],
  [12.5, 'oyelaran', 'Machine\'s warm. Coordinates are locked on Level 0, courtesy of our Tufflandian liaison.'],
  [19, 'halvorsen', 'This is a scouting run. Find signs of the Ririqian Remnants, mark their bases, and come home.'],
  [25.5, 'halvorsen', 'And if you find anything on Rucky Rucky — anything at all — that is priority one.'],
  [32, 'oyelaran', 'Seats are inside the chamber. The door seals itself once the whole team is aboard.'],
];
// boarding sequence: [time since seal, action]
const SEAL = [
  [0, 'line', 'oyelaran', 'Everyone\'s in. Sealing the chamber — keep your hands inside.'],
  [1.6, 'door'],
  [2.4, 'charge'],
  [2.6, 'line', 'machine', 'BINDING ZONE INITIALIZING. HOLD STILL.'],
  [4.8, 'line', 'oyelaran', 'Coherence at forty percent... seventy...'],
  [7.0, 'line', 'halvorsen', 'Good luck out there. See you in seventy-two hours.'],
  [8.6, 'transfer'],
  [8.7, 'line', 'oyelaran', 'Ninety— wait, the array is drifting! Hold on to something!'],
  [12.6, 'jump'],
];

registerProps({
  labDesk: {
    colliders: [[-0.9, 0, -0.4, 0.9, 0.8, 0.4]],
    build(p, B) {
      B.box('paintedMetal', 0, 0.76, 0, 1.8, 0.05, 0.8, 1);
      for (const sx of [-0.85, 0.85]) B.box('darkMetal', sx, 0.38, 0, 0.05, 0.76, 0.75, 0.5);
      for (let k = 0; k < (p.screens ?? 2); k++) {
        const x = -0.45 + k * 0.9;
        B.box('darkMetal', x, 0.86, -0.22, 0.06, 0.2, 0.06, 0.3);
        B.box('plasticDark', x, 1.12, -0.24, 0.62, 0.38, 0.04, 0.4);
        B.box(k % 2 ? 'glowGreen' : 'glowWhite', x, 1.12, -0.217, 0.56, 0.32, 0.005, 0.4);
      }
      B.box('plasticDark', 0, 0.8, 0.12, 0.5, 0.02, 0.16, 0.3);
    },
  },
  serverRack: {
    colliders: [[-0.35, 0, -0.45, 0.35, 2.1, 0.45]],
    build(p, B) {
      B.box('darkMetal', 0, 1.05, 0, 0.7, 2.1, 0.9, 1);
      for (let i = 0; i < 10; i++) {
        B.box('black', 0, 0.2 + i * 0.18, 0.452, 0.6, 0.14, 0.01, 0.3);
        B.box(i % 3 ? 'glowGreen' : 'glowAmber', -0.22 + (i % 4) * 0.05, 0.2 + i * 0.18, 0.46, 0.02, 0.02, 0.01, 0.1);
      }
    },
  },
});

// Equipment bay locker: one per role
registerObjectKind('roleRack', {
  build(o, game) {
    const C = CLASSES[o.cls];
    const g = new THREE.Group();
    const steel = game.lib.dyn('paintedMetal'), dark = game.lib.dyn('darkMetal');
    const add = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); g.add(m); return m; };
    add(new THREE.BoxGeometry(1.2, 2.1, 0.06), steel, 0, 1.05, -0.32);
    for (const sx of [-0.6, 0.6]) add(new THREE.BoxGeometry(0.06, 2.1, 0.7), steel, sx, 1.05, 0);
    add(new THREE.BoxGeometry(1.26, 0.06, 0.7), steel, 0, 2.1, 0);
    for (const y of [0.1, 0.95]) add(new THREE.BoxGeometry(1.14, 0.04, 0.62), dark, 0, y, 0);
    // colour band + label
    const band = add(new THREE.BoxGeometry(1.24, 0.12, 0.72), new THREE.MeshStandardMaterial({ color: C.color, roughness: 0.5, emissive: C.color, emissiveIntensity: 0.25 }), 0, 1.98, 0);
    band.castShadow = false;
    const c = document.createElement('canvas'); c.width = 256; c.height = 128;
    const x = c.getContext('2d');
    x.fillStyle = '#16181a'; x.fillRect(0, 0, 256, 128);
    x.fillStyle = C.color; x.fillRect(0, 0, 256, 10);
    x.fillStyle = '#fff'; x.textAlign = 'center';
    x.font = 'bold 54px sans-serif'; x.fillText(C.icon, 46, 84);
    x.font = 'bold 30px sans-serif'; x.fillText(C.name.toUpperCase(), 150, 66);
    x.font = '16px sans-serif'; x.fillStyle = '#aaa'; x.fillText(C.role, 150, 96);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    const sign = add(new THREE.PlaneGeometry(0.9, 0.45), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.25 }), 0, 1.6, 0.31);
    sign.castShadow = false;
    // a couple of the kit's items on the shelves
    C.kit.slice(0, 3).forEach(([id], k) => { const m = itemModel(id); m.position.set(-0.35 + k * 0.35, k === 0 ? 0.99 : 0.14, 0.05); m.rotation.y = 0.4; g.add(m); });
    return g;
  },
  prompt(o, s, game) { return game.classId === o.cls ? `${CLASSES[o.cls].name} kit (equipped)` : `Take the ${CLASSES[o.cls].name} kit`; },
  radius: 0.8, centerY: 0.9,
});

export default {
  id: 'P0',
  name: 'Prologue',
  title: 'Site Kestrel',
  next: 'L0',
  subtitle: 'United States Goaning Program · Expedition Team 3',
  objective: 'Take a kit from the equipment bay, then board the Goaning Machine.',
  objectiveText(game) {
    if (!game.classId) return 'Take a kit from the equipment bay (left wall).';
    return 'Board the Goaning Machine and take a seat. It seals when the whole team is aboard.';
  },
  noDirector: true,
  spawnYaw: 0.25,
  palette: {
    floor: [{ mat: 'labFloor', scale: 4 }, { mat: 'hazard', scale: 2 }],
    wall: [{ mat: 'labPanel', scaleU: 2, scaleV: 3, trim: 'darkMetal', trimH: 0.12 }],
    ceil: [{ mat: 'labCeil', scale: 2 }],
    ledge: { mat: 'concrete', scale: 2 },
    soffit: { mat: 'labPanel', scaleU: 2, scaleV: 3 },
  },
  materials: ['labPanel', 'labFloor', 'labCeil', 'hazard', 'concrete', 'darkMetal', 'chrome', 'grate', 'glass', 'glowWhite', 'glowGreen', 'glowAmber', 'glowRed', 'plasticDark', 'plastic', 'paintedMetal', 'monitorOff', 'black', 'laminate', 'woodCrate', 'cardboard', 'lightPanel', 'rustMetal'],
  ambient: [0.11, 0.115, 0.12],
  bakeGain: 0.09,
  dynGain: 0.7,
  exposure: 1.0,
  fog: { color: 0x1a1d20, density: 0.008 },
  background: 0x0b0c0d,
  grade: { lift: [0.0, 0.0, 0.01], gamma: [1, 1, 1], gain: [1.0, 1.0, 1.02], saturation: 0.92, tint: [0.98, 1.0, 1.03], vignette: 0.35, grain: 0.03, bloomStrength: 0.3, bloomThreshold: 0.9 },
  hemi: { sky: 0xdfe6ee, ground: 0x2a2c30, intensity: 0.35 },
  portConfig: { min: 0, max: 0 },
  ambience: 'lab',
  ambientLit: 0.4,
  probeTint: [0.95, 0.97, 1.0],
  entities: null,

  landmarks() { return [{ type: 'spawn', tx: 8, tz: 13 }]; },

  generate(c) {
    if (c.cx !== 0 || c.cz !== 0) return;      // everything else is solid rock
    const T = { floor: 0, ceil: 5, fmat: 0, cmat: 0, flags: F_ROOM };
    carveRect(c, 1, 1, 14, 14, T);
    // hazard border around the machine
    for (let lz = 2; lz <= 6; lz++) for (let lx = 4; lx <= 11; lx++) if (lz === 2 || lz === 6 || lx === 4 || lx === 11) c.fmat[lz * CS + lx] = 1;
    for (let lz = 2; lz <= 6; lz++) for (let lx = 4; lx <= 11; lx++) c.flags[lz * CS + lx] |= F_RESERVED | F_LANDMARK;
    const m = placeGoaningMachine(c, MX, MZ, { startOpen: true });
    c.meta.machine = m;
    // equipment bay: one locker per role along the west wall
    CLASS_ORDER.forEach((cls, k) => {
      addObject(c, { kind: 'roleRack', cls, x: 2.75, y: 0, z: RACK_Z[k], ry: Math.PI / 2 });
      c.addCollider(2.05, 0, RACK_Z[k] - 0.66, 3.1, 2.1, RACK_Z[k] + 0.66, false);
      addLight(c, { x: 4.2, y: 4.95, z: RACK_Z[k], kind: 'panel', w: 1.2, d: 0.5, color: [0.92, 0.96, 1], intensity: 3.5, range: 6 });
    });
    addDecal(c, { name: 'text0', x: 2.02, y: 3.0, z: 19, nx: 1, ny: 0, nz: 0, size: 2.4 });
    // control desks, server racks, crates
    addProp(c, 'labDesk', 27.8, 0, 11.5, -Math.PI / 2, { screens: 2 });
    addProp(c, 'labDesk', 27.8, 0, 14.5, -Math.PI / 2, { screens: 2 });
    addProp(c, 'labDesk', 20.8, 0, 14.2, Math.PI, { screens: 1 });
    for (let k = 0; k < 4; k++) addProp(c, 'serverRack', 29.4, 0, 18 + k * 1.0, -Math.PI / 2);
    addProp(c, 'serverRack', 7.5, 0, 3.0, 0);
    addProp(c, 'serverRack', 8.3, 0, 3.0, 0);
    for (const [x, z, s] of [[26, 26, 0.9], [27.1, 26.3, 0.7], [26.5, 27.6, 0.8], [5.5, 28, 1], [6.6, 28.4, 0.6]]) addProp(c, 'crate', x, 0, z, 0.2, { s });
    addProp(c, 'chair', 26.9, 0, 11.6, -Math.PI / 2, { mat: 'plasticDark' });
    addProp(c, 'chair', 26.9, 0, 14.6, -Math.PI / 2, { mat: 'plasticDark' });
    // ceiling lights on a grid
    for (let lz = 2; lz <= 13; lz += 3) for (let lx = 2; lx <= 13; lx += 3) {
      if (lx >= 4 && lx <= 11 && lz <= 6) continue;
      addLight(c, { x: c.tx(lx), y: 4.98, z: c.tz(lz), kind: 'panel', w: 1.4, d: 0.6, color: [0.94, 0.97, 1], intensity: 5, range: 10 });
    }
    addLight(c, { x: MX, y: 4.9, z: MZ + 3.6, kind: 'panel', w: 1.4, d: 0.6, color: [0.85, 0.92, 1], intensity: 4, range: 9 });
    // hazard decals on the floor by the door, cable runs
    for (let k = 0; k < 6; k++) addDecal(c, { name: 'footprints', x: 16 + (k - 2.5) * 0.4, y: 0.004, z: 14 + k * 1.6, nx: 0, ny: 1, nz: 0, size: 0.8, rot: Math.PI });
  },

  // ---------------------------------------------------------------- client scene
  setupScene(game) {
    const npcs = [];
    for (const S of SCIENTISTS) {
      const av = new Avatar(S.skin);
      av.group.position.set(S.x, 0, S.z);
      av.group.rotation.y = S.yaw;
      game.engine.scene.add(av.group);
      npcs.push({ ...S, av, look: S.yaw, talkT: 0 });
    }
    // briefing screen on the north wall
    const c = document.createElement('canvas'); c.width = 512; c.height = 256;
    const x = c.getContext('2d');
    x.fillStyle = '#04121a'; x.fillRect(0, 0, 512, 256);
    x.strokeStyle = '#2fa8d8'; x.lineWidth = 4; x.strokeRect(6, 6, 500, 244);
    x.fillStyle = '#7fd6ff'; x.font = 'bold 30px monospace'; x.fillText('OPERATION LANTERN', 24, 50);
    x.font = '18px monospace'; x.fillStyle = '#bfe8ff';
    ['TARGET ......... GOANROOMS / LEVEL 0', 'TEAM ........... EXPEDITION 3 (SCOUT)', 'OBJECTIVE ...... LOCATE RIRIQIAN BASES', 'PRIORITY ....... SUPREME LEADER R. RUCKY', 'RETURN WINDOW .. 72 HOURS', 'MACHINE ........ GM-2 "KESTREL"'].forEach((l, i) => x.fillText(l, 24, 92 + i * 26));
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 2.1), new THREE.MeshBasicMaterial({ map: tex }));
    screen.position.set(24.5, 3.2, 2.05);
    game.engine.scene.add(screen);
    game.pro = { npcs, screen, t: 0, hum: null, warp: 0, phase: 'brief', shake: 0 };
  },
  teardownScene(game) {
    const P = game.pro;
    if (!P) return;
    for (const n of P.npcs) game.engine.scene.remove(n.av.group);
    game.engine.scene.remove(P.screen);
    P.hum?.stop(0.4);
    game.pro = null;
  },

  clientUpdate(game, dt) {
    const P = game.pro;
    if (!P) return;
    P.t += dt;
    const me = game.player.pos;
    for (const n of P.npcs) {
      // turn to face the nearest player while talking or when they come close
      const d = Math.hypot(me.x - n.x, me.z - n.z);
      const want = d < 7 || n.talkT > 0 ? Math.atan2(me.x - n.x, me.z - n.z) + Math.PI : n.yaw;
      let dy = want - n.look; while (dy > Math.PI) dy -= Math.PI * 2; while (dy < -Math.PI) dy += Math.PI * 2;
      n.look += dy * Math.min(1, dt * 3);
      n.av.group.rotation.y = n.look;
      n.talkT = Math.max(0, n.talkT - dt);
      n.av.animate(dt, { speed: 0, holding: n.id === 'okafor', pitch: 0, using: null });
      if (n.talkT > 0) { const A = n.av.arms[0]; A.sh.rotation.x = -0.5 + Math.sin(P.t * 5) * 0.25; A.elbow.rotation.x = -1.0; n.av.head.rotation.x = Math.sin(P.t * 9) * 0.05; }
    }
    // board without a kit -> pick one now
    const m = game.level.chunk(0, 0).meta.machine;
    if (m && !game.classId && inChamber(m.chamber, me) && !game.ui.modalOpen && !P.asked) { P.asked = true; game.promptRole(); }
    if (m && !inChamber(m.chamber, me)) P.asked = false;
    // transfer effects
    const u = game.engine.post.u;
    if (P.phase === 'charge') { P.shake = Math.min(0.25, P.shake + dt * 0.04); }
    else if (P.phase === 'transfer') { P.warp = Math.min(1, P.warp + dt / 3.6); P.shake = Math.min(1, P.shake + dt * 0.3); if (Math.random() < dt * 3) u.flash.value = Math.max(u.flash.value, 0.25 + Math.random() * 0.3); }
    u.warp.value = P.warp;
    if (P.shake > 0) game.player.shake = Math.max(game.player.shake, P.shake);
    if (P.hum) P.hum.set('level', P.phase === 'transfer' ? 1 : P.phase === 'charge' ? 0.4 + Math.min(0.5, P.t * 0) : 0.15);
    game.hud.refreshObjective(game);
  },

  clientEvent(game, m) {
    const P = game.pro;
    if (!P) return;
    if (m.k === 'pLine') {
      const who = m.who === 'machine' ? null : P.npcs.find(n => n.id === m.who);
      const name = m.who === 'machine' ? 'GM-2' : who?.name || '';
      game.subtitle(`${name}: ${m.text}`, m.dur || 5, m.who === 'machine' ? 'warn' : '');
      if (who) { who.talkT = Math.min(4.5, m.text.length * 0.06); game.sfx('talk', { x: who.x, y: 1.6, z: who.z }, { volume: 0.7, dur: who.talkT, pitch: who.id === 'halvorsen' ? 1.25 : who.id === 'pruitt' ? 1.1 : 0.85 }); }
      else game.sfx('beepAlert', null, { volume: 0.5 });
    } else if (m.k === 'pPhase') {
      P.phase = m.phase;
      if (m.phase === 'charge') { P.t = 0; P.hum = game.loopSfx('machineHum', { x: MX, y: 1.5, z: MZ }, { volume: 1, ref: 4 }); }
      if (m.phase === 'transfer') { game.sfx('transferWhine', null, { volume: 1 }); game.stats.scare(-5); }
      if (m.phase === 'jump') {
        game.engine.post.u.flash.value = 1;
        game.sfx('transition', null, { reverb: 0.8 });
        P.hum?.stop(0.2); P.hum = null;
        game.arrivalPending = true;
        setTimeout(() => game.enterLevel('L0', { arrival: true }), 250);
      }
    }
  },

  interact(game, o) {
    if (o.kind === 'roleRack') {
      if (game.classId === o.cls) { game.subtitle('You already carry this kit.', 1.4); return; }
      game.chooseRole(o.cls);
      game.sfx('rummage', o, { volume: 0.8 });
    }
  },

  // ---------------------------------------------------------------- host timeline
  hostUpdate(game, ctx, dt) {
    const S = game.proHost || (game.proHost = { t: 0, line: 0, phase: 'brief', pt: 0, seq: 0, nudge: 45 });
    if (S.phase === 'done') return;
    S.t += dt;
    const ev = e => game.hostEvent('P0', e);
    const say = (who, text, dur) => ev({ k: 'pLine', who, text, dur });
    while (S.line < BRIEF.length && S.t >= BRIEF[S.line][0]) { const [, who, text] = BRIEF[S.line++]; say(who, text); }
    const m = game.getLevel('P0').chunk(0, 0).meta.machine;
    const players = ctx.players;
    if (S.phase === 'brief') {
      if (S.t > S.nudge) { S.nudge = S.t + 28; say('oyelaran', 'Whenever you are ready — grab a kit and take a seat inside the machine.'); }
      const allIn = players.length && players.every(p => inChamber(m.chamber, p));
      const allKitted = players.every(p => (p.id === game.myId ? game.classId : game.pstate.get(p.id)?.cl));
      if (allIn && allKitted && S.t > 2) { S.phase = 'seal'; S.pt = 0; S.seq = 0; }
      return;
    }
    S.pt += dt;
    while (S.seq < SEAL.length && S.pt >= SEAL[S.seq][0]) {
      const step = SEAL[S.seq++];
      if (step[1] === 'line') say(step[2], step[3], 4.5);
      else if (step[1] === 'door') { game.hostBroadcast({ t: 'os', l: 'P0', id: m.door.id, s: { open: false } }); }
      else if (step[1] === 'charge') { game.hostBroadcast({ t: 'os', l: 'P0', id: coreId(game), s: { mode: 'charge' } }); ev({ k: 'pPhase', phase: 'charge' }); }
      else if (step[1] === 'transfer') { game.hostBroadcast({ t: 'os', l: 'P0', id: coreId(game), s: { mode: 'transfer' } }); ev({ k: 'pPhase', phase: 'transfer' }); }
      else if (step[1] === 'jump') { S.phase = 'done'; ev({ k: 'pPhase', phase: 'jump' }); }
    }
  },

  // host-only: skip straight to the jump (solo skip / host skip)
  skip(game) {
    const S = game.proHost || (game.proHost = { t: 0, line: 0, phase: 'brief', pt: 0, seq: 0, nudge: 45 });
    S.phase = 'done';
    game.hostEvent('P0', { k: 'pPhase', phase: 'jump' });
  },
};

function coreId(game) {
  return game.getLevel('P0').chunk(0, 0).objects.find(o => o.kind === 'machineCore').id;
}
