// Interactive base objects: posters, flags and portraits (real images), the
// gate that has to be broken down, alarm beacons and the vault door.
import * as THREE from 'three';
import { registerObjectKind } from '../../game/objects.js';
import { hash4, RNG } from '../../core/rng.js';

// ------------------------------------------------------------------ text
// Ririqian signage is written in a script that only looks like Arabic: random
// letters in plausible word lengths.
const AR = 'ابتثجحخدذرزسشصضطظعغفقكلمنهوي';
export function arabicGibberish(seed, words = 2) {
  const rng = new RNG(seed >>> 0);
  const out = [];
  for (let w = 0; w < words; w++) { let s = ''; for (let k = rng.int(3, 7); k > 0; k--) s += AR[rng.int(0, AR.length - 1)]; out.push(s); }
  return out.join(' ');
}

// ------------------------------------------------------------------ images
const IMAGES = {
  ririqiaFlag: 'ririqia_flag', ririqiaPoster: 'ririqia_poster', rucky: 'rucky', ruckyPropaganda: 'rucky_propaganda',
  didystanFlag: 'didystan_flag', didh: 'didh', didhDark: 'didh_dark',
};
export const IMAGE_CAPTIONS = {
  ririqiaFlag: ['Flag of the Ririqian Brotherhood', 'Red for the blood of the faithful, black for the exile, and between them a motto nobody you have met can read.'],
  ririqiaPoster: ['Brotherhood propaganda', 'Supreme Leader Rucky Rucky marches before the flags. The slogans are in the Brotherhood\'s script. Someone has drawn a small question mark beside his crown.'],
  rucky: ['Supreme Leader Rucky Rucky', 'A portrait in a gilt frame. The paint around the crown has been touched up recently — or kissed.'],
  ruckyPropaganda: ['"The Leader Endures"', 'Rucky Rucky in his dress uniform, medals and all, staring out of the dark. The frame has a black ribbon tied around one corner.'],
  didystanFlag: ['Flag of Didystan', 'Teal and brown, split on the diagonal. Didystan sent people down here long before the Brotherhood did.'],
  didh: ['Did\'h', 'The Wanderers\' cat, in a green shirt with his own name on it. Every Wanderer camp has one of these. He looks pleased with himself.'],
  didhDark: ['Did\'h?', 'The eyes are wrong. The teeth are wrong. You look again and it is just a cat in a shirt.'],
};
const texCache = new Map();
const loader = new THREE.TextureLoader();
function imageTexture(key) {
  if (texCache.has(key)) return texCache.get(key);
  let tex;
  if (key.startsWith('didFigure:')) tex = new THREE.CanvasTexture(didystaniPortrait(+key.slice(10)));
  else tex = loader.load(`assets/images/${IMAGES[key] || key}.webp`);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  texCache.set(key, tex);
  return tex;
}
export function imageURL(key) {
  if (key.startsWith('didFigure:')) return didystaniPortrait(+key.slice(10)).toDataURL();
  return `assets/images/${IMAGES[key] || key}.webp`;
}

// Didystani officers: there are no photographs, so they are painted.
const DD_NAMES = ['General Vaszh Orunek', 'Commissar Ildane Tav', 'Field Marshal Okkur Brenn', 'Colonel Saeth Morrow', 'Admiral Teodh Kalyn', 'Director Ysolde Varr'];
export function didystaniName(seed) { return DD_NAMES[seed % DD_NAMES.length]; }
function didystaniPortrait(seed) {
  const rng = new RNG(seed >>> 0);
  const c = document.createElement('canvas'); c.width = 256; c.height = 320;
  const x = c.getContext('2d');
  // the flag's diagonal behind the sitter
  x.fillStyle = '#7a4b33'; x.fillRect(0, 0, 256, 320);
  x.fillStyle = '#44bf9f'; x.beginPath(); x.moveTo(0, 0); x.lineTo(256, 0); x.lineTo(256, 320); x.closePath(); x.fill();
  x.fillStyle = 'rgba(0,0,0,0.35)'; x.fillRect(0, 0, 256, 320);
  const skin = ['#e0b896', '#c8966c', '#a8744e', '#8a5a3a'][rng.int(0, 3)];
  const coat = ['#2f5a4e', '#3a3a40', '#4a3a2a'][rng.int(0, 2)];
  // shoulders and coat
  x.fillStyle = coat; x.beginPath(); x.moveTo(30, 320); x.quadraticCurveTo(40, 210, 128, 205); x.quadraticCurveTo(216, 210, 226, 320); x.fill();
  x.fillStyle = '#c9a640'; for (let k = 0; k < 4; k++) x.fillRect(150 + (k % 2) * 16, 240 + Math.floor(k / 2) * 18, 12, 10); // medals
  x.fillStyle = '#e8dcc0'; x.beginPath(); x.moveTo(108, 210); x.lineTo(128, 250); x.lineTo(148, 210); x.fill();             // collar
  // head
  x.fillStyle = skin; x.beginPath(); x.ellipse(128, 150, 44, 56, 0, 0, Math.PI * 2); x.fill();
  x.fillStyle = '#1a1410'; x.fillRect(102, 140, 16, 6); x.fillRect(138, 140, 16, 6);                                      // eyes
  if (rng.chance(0.6)) { x.fillStyle = '#2a2018'; x.fillRect(110, 172, 36, 8); }                                         // moustache
  x.fillStyle = coat; x.beginPath(); x.ellipse(128, 100, 52, 20, 0, Math.PI, 0); x.fill(); x.fillRect(76, 96, 104, 12);  // cap
  x.fillStyle = '#c9a640'; x.fillRect(118, 92, 20, 10);
  // frame and plaque
  x.strokeStyle = '#6a5228'; x.lineWidth = 14; x.strokeRect(7, 7, 242, 306);
  x.fillStyle = '#1a1410'; x.fillRect(48, 288, 160, 22);
  x.fillStyle = '#d8c890'; x.font = 'bold 11px Georgia, serif'; x.textAlign = 'center'; x.fillText(DD_NAMES[seed % DD_NAMES.length].toUpperCase(), 128, 303);
  // age: grime and scratches
  for (let k = 0; k < 40; k++) { x.fillStyle = `rgba(30,20,10,${rng.next() * 0.25})`; x.fillRect(rng.int(0, 256), rng.int(0, 320), rng.int(2, 30), rng.int(1, 4)); }
  return c;
}

// A picture on a wall (poster, portrait, flag). Looking closely shows it.
registerObjectKind('image', {
  build(o, game) {
    const g = new THREE.Group();
    const w = o.w || 0.8, h = o.hgt || 1.0;
    const mat = new THREE.MeshStandardMaterial({ map: imageTexture(o.img), roughness: o.flag ? 0.95 : 0.7, side: o.flag ? THREE.DoubleSide : THREE.FrontSide });
    let plane;
    if (o.flag) {
      // a hanging banner with a little sag and a rod across the top
      const geo = new THREE.PlaneGeometry(w, h, 8, 1);
      const p = geo.attributes.position;
      for (let i = 0; i < p.count; i++) p.setZ(i, Math.sin((p.getX(i) / w + 0.5) * Math.PI * 3) * 0.025);
      geo.computeVertexNormals();
      plane = new THREE.Mesh(geo, mat);
      const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, w + 0.2, 6), game.lib.dyn('darkMetal'));
      rod.rotation.z = Math.PI / 2; rod.position.set(0, (o.y0 ?? 1.6) + h / 2 + 0.03, 0.06); g.add(rod);
    } else {
      plane = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
      if (o.frame) {
        const fm = game.lib.dyn(o.frame === 'gold' ? 'glowAmber' : 'darkWood');
        const fr = new THREE.Mesh(new THREE.BoxGeometry(w + 0.1, h + 0.1, 0.03), o.frame === 'gold' ? new THREE.MeshStandardMaterial({ color: 0xb8902a, roughness: 0.35, metalness: 0.8 }) : fm);
        fr.position.set(0, o.y0 ?? 1.6, 0.012); g.add(fr);
      }
    }
    plane.position.set(0, o.y0 ?? 1.6, o.flag ? 0.06 : 0.03);
    if (o.tilt) plane.rotation.z = o.tilt;
    g.add(plane);
    g.userData.plane = plane;
    g.userData.game = game;
    return g;
  },
  prompt: o => (o.look === false ? null : 'Look at it'),
  radius: 0.6, centerY: 1.35,
  // Did'h's poster isn't always what it seems when your mind is going
  animate(mesh, o) {
    if (o.img !== 'didh') return;
    const g = mesh.userData.game, low = g && g.stats.sanity < 30 && Math.sin(performance.now() * 0.0007 + o.x) > 0.6;
    const want = low ? 'didhDark' : 'didh';
    if (mesh.userData.cur !== want) { mesh.userData.cur = want; mesh.userData.plane.material.map = imageTexture(want); mesh.userData.plane.material.needsUpdate = true; }
  },
});

// The gate: welded bars and planks. Break it down to get in (noisy).
registerObjectKind('gate', {
  build(o, game) {
    const g = new THREE.Group();
    const steel = game.lib.dyn('darkMetal'), wood = game.lib.dyn('darkWood'), red = game.lib.dyn('rqRed');
    const whole = new THREE.Group();
    for (let x = -0.9; x <= 0.91; x += 0.15) { const b = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 2.4, 6), steel); b.position.set(x, 1.2, 0); whole.add(b); }
    for (const y of [0.3, 1.2, 2.2]) { const b = new THREE.Mesh(new THREE.BoxGeometry(1.95, 0.08, 0.07), steel); b.position.set(0, y, 0); whole.add(b); }
    for (const [y, r] of [[0.7, 0.2], [1.6, -0.15]]) { const p = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.2, 0.04), wood); p.position.set(0, y, 0.06); p.rotation.z = r; whole.add(p); }
    if (o.faction === 'rq') { const s = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.3, 0.02), red); s.position.set(0, 1.9, 0.07); whole.add(s); }
    for (let k = 0; k < 7; k++) { const w = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.008, 4, 10), steel); w.position.set(-0.9 + k * 0.3, 2.45, 0); w.rotation.y = Math.PI / 2; whole.add(w); } // wire
    g.add(whole);
    const broken = new THREE.Group();
    for (let k = 0; k < 6; k++) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.6 + (k % 3) * 0.3, 0.06, 0.12), k % 2 ? wood : steel); p.position.set(-0.8 + k * 0.3, 0.04, (k % 3) * 0.3 - 0.3); p.rotation.y = k * 0.9; broken.add(p); }
    broken.visible = false; g.add(broken);
    g.userData.whole = whole; g.userData.broken = broken;
    return g;
  },
  prompt: (o, s) => (s?.open || o.broken0 ? null : `Break down the gate${s?.hp !== undefined ? ` (${Math.max(0, Math.round(s.hp / o.hp * 100))}%)` : ''}`),
  radius: 1.2, centerY: 1.0,
  animate(mesh, o, s, dt) {
    const open = !!s?.open || o.broken0;
    mesh.userData.whole.visible = !open;
    mesh.userData.broken.visible = open;
    if (!open && s?.hitT && performance.now() - s.hitT < 200) mesh.userData.whole.position.x = Math.sin(performance.now() * 0.08) * 0.02;
  },
});

// Alarm beacon: a red rotating light that spins while the base is alarmed.
registerObjectKind('alarm', {
  build(o, game) {
    const g = new THREE.Group();
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.06, 0.12), game.lib.dyn('darkMetal')); base.position.set(0, o.y0 ?? 2.4, 0.06); g.add(base);
    const domeM = new THREE.MeshStandardMaterial({ color: 0x661010, emissive: 0xff2010, emissiveIntensity: 0.2, transparent: true, opacity: 0.85, roughness: 0.2 });
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), domeM); dome.position.set(0, (o.y0 ?? 2.4) + 0.03, 0.06); g.add(dome);
    const beam = new THREE.Mesh(new THREE.ConeGeometry(0.5, 3, 12, 1, true), new THREE.MeshBasicMaterial({ color: 0xff2010, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    beam.geometry.translate(0, -1.5, 0); beam.rotation.z = Math.PI / 2;
    const pivot = new THREE.Group(); pivot.position.copy(dome.position); pivot.add(beam); beam.visible = false; g.add(pivot);
    g.userData.dome = domeM; g.userData.pivot = pivot; g.userData.beam = beam; g.userData.game = game;
    return g;
  },
  prompt: () => null,
  animate(mesh, o, s, dt) {
    const g = mesh.userData.game;
    const t = g?.world.flag(g.levelId, 'alarm:' + o.base);
    const on = !!t && g.time - t < 32;
    mesh.userData.beam.visible = on;
    mesh.userData.dome.emissiveIntensity = on ? 2.5 : 0.2;
    if (on) mesh.userData.pivot.rotation.y += dt * 7;
  },
});

// The base vault: a heavy round door. Needs a vault key.
registerObjectKind('baseVault', {
  build(o, game) {
    const g = new THREE.Group();
    const pivot = new THREE.Group(); pivot.position.set(-1.0, 0, 0); g.add(pivot);
    const steel = new THREE.MeshStandardMaterial({ color: o.faction === 'rq' ? 0x5a5e62 : 0x6a6e60, roughness: 0.35, metalness: 0.75 });
    const slab = new THREE.Mesh(new THREE.BoxGeometry(2.0, 2.4, 0.25), steel); slab.position.set(1.0, 1.2, 0); pivot.add(slab);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.75, 0.05, 8, 28), steel); ring.position.set(1.0, 1.2, 0.14); pivot.add(ring);
    const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.035, 8, 20), game.lib.dyn('chrome')); wheel.position.set(1.0, 1.2, 0.17); pivot.add(wheel);
    for (let k = 0; k < 3; k++) { const sp = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.035, 0.035), game.lib.dyn('chrome')); sp.position.copy(wheel.position); sp.rotation.z = k * Math.PI / 3; pivot.add(sp); }
    if (o.faction === 'rq') { const band = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.12, 0.02), game.lib.dyn('rqRed')); band.position.set(1.0, 2.1, 0.13); pivot.add(band); }
    g.userData.pivot = pivot; g.userData.wheel = wheel;
    return g;
  },
  prompt: (o, s, game) => (s?.open ? null : game.inventory.has('vaultKey') ? 'Unlock the vault' : 'Vault — locked'),
  radius: 1.2, centerY: 1.0,
  animate(mesh, o, s, dt) {
    const k = mesh.userData.k = (mesh.userData.k ?? 0) + ((s?.open ? 1 : 0) - (mesh.userData.k ?? 0)) * Math.min(1, dt * 1.2);
    mesh.userData.pivot.rotation.y = -k * 1.7;
    mesh.userData.wheel.rotation.z = k * 8;
  },
});

// The comms room's radio: listen in on Brotherhood traffic.
const CHATTER = [
  ['A clipped voice, then static', 'The voice repeats a string of numbers in the Brotherhood\'s language. One word keeps coming back: a name. Rucky.'],
  ['Two voices arguing', 'They talk over each other. You can\'t follow the words but you know the tone: frightened men pretending not to be.'],
  ['A recorded anthem', 'Brass and drums, warped by distance. It stops halfway through, as if someone kicked the machine.'],
  ['Open carrier', 'Nothing but the hiss of an open channel — and, very faintly, breathing.'],
  ['An English broadcast', '"...this is Site Kestrel to any expedition personnel. If you can hear this, the return coil is— " The rest is lost.'],
];
registerObjectKind('radioSet', {
  build: () => null,
  prompt: () => 'Listen to the radio',
  radius: 0.9, centerY: 0.8,
});
export function radioChatter(seed) { return CHATTER[(seed >>> 0) % CHATTER.length]; }

// A Wanderer who'll trade (once). The object sits at their post.
const OFFERS = [
  ['scrap', 2, 'battery', 1], ['fireSalts', 3, 'goanJuice', 2], ['goldBar', 1, 'medkit', 1], ['goldBar', 2, 'smallPack', 1], ['cloth', 2, 'bandage', 2],
  ['battery', 2, 'vigorTonic', 1], ['goldBar', 1, 'didhCharm', 2], ['rqPistol', 1, 'goanJuice', 3], ['ammo9', 12, 'cleanWater', 2], ['wire', 2, 'flare', 2],
  ['snackBar', 2, 'fireSalts', 3], ['rifleAmmo', 15, 'medkit', 1], ['goldBar', 3, 'largePack', 1], ['dirtyWater', 2, 'cleanWater', 1],
];
export function traderOffers(seed) {
  const r = new RNG(seed >>> 0);
  const pool = OFFERS.slice();
  const out = [];
  for (let k = 0; k < 3; k++) out.push(pool.splice(r.int(0, pool.length - 1), 1)[0]);
  return out;
}
registerObjectKind('trader', {
  build: () => null,
  prompt: (o, s, game) => {
    if (s?.traded) return null;
    const dead = (game.world.flag(game.levelId, 'bk:' + o.base) || []).includes(o.post);
    if (dead || game.world.flag(game.levelId, 'hostile:' + o.base)) return null;
    return 'Trade with the Wanderer';
  },
  radius: 0.8, centerY: 1.2,
});

export function baseHash(...a) { return hash4(...a); }
