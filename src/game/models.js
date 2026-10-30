// Procedural models for items, weapons and interactive props. Built once per
// type and cloned (geometry/material shared). Used by world pickups and the
// first-person viewmodel.
import * as THREE from 'three';

let LIB = null;
const cache = new Map();
const colorMats = new Map();

export function initModels(lib) { LIB = lib; cache.clear(); }

function M(name) { return LIB.dyn(name); }
function C(hex, rough = 0.6, metal = 0, emissive = null, ei = 1) {
  const key = hex + '|' + rough + '|' + metal + '|' + emissive + '|' + ei;
  if (!colorMats.has(key)) {
    colorMats.set(key, new THREE.MeshStandardMaterial({ color: hex, roughness: rough, metalness: metal, emissive: emissive ?? 0x000000, emissiveIntensity: emissive ? ei : 1 }));
  }
  return colorMats.get(key);
}

function mesh(geo, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  m.castShadow = true;
  return m;
}
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const cyl = (rt, rb, h, s = 12) => new THREE.CylinderGeometry(rt, rb, h, s);

// ---------------------------------------------------------------- weapons
// Weapons are modelled pointing down -Z with the grip near the origin.
function pistol() {
  const g = new THREE.Group();
  const metal = M('darkMetal'), poly = M('plasticDark');
  g.add(mesh(box(0.032, 0.034, 0.19), metal, 0, 0.045, -0.06));           // slide
  for (let i = 0; i < 6; i++) g.add(mesh(box(0.034, 0.026, 0.004), poly, 0, 0.045, 0.015 - i * 0.008)); // serrations
  g.add(mesh(box(0.028, 0.026, 0.17), poly, 0, 0.016, -0.05));            // frame
  g.add(mesh(cyl(0.007, 0.007, 0.03, 8), M('black'), 0, 0.045, -0.16, Math.PI / 2)); // muzzle
  const grip = mesh(box(0.03, 0.105, 0.045), poly, 0, -0.035, 0.018, -0.25);
  g.add(grip);
  g.add(mesh(new THREE.TorusGeometry(0.018, 0.004, 6, 12, Math.PI), poly, 0, 0.0, -0.025, 0, Math.PI / 2, Math.PI));
  g.add(mesh(box(0.006, 0.01, 0.006), metal, 0, 0.066, -0.145));          // front sight
  g.add(mesh(box(0.02, 0.01, 0.006), metal, 0, 0.066, 0.025));            // rear sight
  g.userData.muzzle = new THREE.Vector3(0, 0.045, -0.18);
  return g;
}

function shotgun() {
  const g = new THREE.Group();
  const metal = M('darkMetal'), wood = C(0x5a3a1f, 0.55);
  g.add(mesh(cyl(0.012, 0.012, 0.62, 10), metal, 0, 0.04, -0.38, Math.PI / 2));   // barrel
  g.add(mesh(cyl(0.011, 0.011, 0.5, 10), metal, 0, 0.015, -0.32, Math.PI / 2));   // tube mag
  g.add(mesh(box(0.045, 0.05, 0.2), metal, 0, 0.028, -0.02));                     // receiver
  const pump = mesh(cyl(0.022, 0.022, 0.16, 10), wood, 0, 0.016, -0.3, Math.PI / 2);
  pump.name = 'pump';
  g.add(pump);
  for (let i = 0; i < 5; i++) pump.add(mesh(cyl(0.0225, 0.0225, 0.006, 10), C(0x3a2512, 0.7), 0, -0.05 + i * 0.025, 0));
  const grip = mesh(box(0.035, 0.09, 0.05), wood, 0, -0.03, 0.09, -0.5);
  g.add(grip);
  g.add(mesh(box(0.04, 0.06, 0.22), wood, 0, -0.01, 0.22, 0.12));                 // stock
  g.add(mesh(box(0.042, 0.075, 0.03), C(0x1a1a1a, 0.9), 0, -0.02, 0.335, 0.12));   // butt pad
  g.add(mesh(new THREE.TorusGeometry(0.018, 0.004, 6, 12, Math.PI), metal, 0, -0.005, 0.03, 0, Math.PI / 2, Math.PI));
  g.add(mesh(box(0.008, 0.012, 0.008), M('chrome'), 0, 0.058, -0.66));            // bead sight
  g.userData.muzzle = new THREE.Vector3(0, 0.04, -0.7);
  g.userData.pump = pump;
  return g;
}

function smg() {
  const g = new THREE.Group();
  const metal = M('darkMetal'), poly = M('plasticDark');
  g.add(mesh(box(0.042, 0.055, 0.26), metal, 0, 0.03, -0.08));                   // receiver
  g.add(mesh(cyl(0.017, 0.017, 0.14, 10), poly, 0, 0.032, -0.28, Math.PI / 2));   // shroud
  for (let i = 0; i < 4; i++) g.add(mesh(box(0.036, 0.006, 0.012), M('black'), 0, 0.05, -0.23 - i * 0.025));
  g.add(mesh(cyl(0.007, 0.007, 0.04, 8), M('black'), 0, 0.032, -0.37, Math.PI / 2));
  const mag = mesh(box(0.024, 0.15, 0.035), poly, 0, -0.06, -0.08, 0.12);
  mag.name = 'mag';
  g.add(mag);
  g.add(mesh(box(0.03, 0.1, 0.04), poly, 0, -0.04, 0.03, -0.3));                  // grip
  g.add(mesh(cyl(0.004, 0.004, 0.2, 6), metal, 0.016, 0.02, 0.15, Math.PI / 2));  // wire stock
  g.add(mesh(cyl(0.004, 0.004, 0.2, 6), metal, -0.016, 0.02, 0.15, Math.PI / 2));
  g.add(mesh(box(0.04, 0.05, 0.01), metal, 0, 0.0, 0.25));
  g.add(mesh(box(0.012, 0.025, 0.04), metal, 0, 0.07, -0.02));                    // sight
  g.userData.muzzle = new THREE.Vector3(0, 0.032, -0.39);
  g.userData.mag = mag;
  return g;
}

function crowbar() {
  const g = new THREE.Group();
  const red = C(0xa8301f, 0.45, 0.6), steel = M('chrome');
  const pts = [[0, -0.25, 0], [0, 0.32, 0], [0, 0.38, -0.02], [0, 0.42, -0.07], [0, 0.415, -0.12]];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = new THREE.Vector3(...pts[i]), b = new THREE.Vector3(...pts[i + 1]);
    const len = a.distanceTo(b);
    const m = mesh(cyl(0.011, 0.011, len, 8), i === 0 ? red : steel);
    m.position.copy(a).lerp(b, 0.5);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
    g.add(m);
  }
  g.add(mesh(box(0.02, 0.012, 0.05), steel, 0, -0.26, 0.015, 0.4));               // flat end
  return g;
}

function knife() {
  const g = new THREE.Group();
  const s = new THREE.Shape();
  s.moveTo(0, 0); s.lineTo(0.15, 0.004); s.quadraticCurveTo(0.17, 0.006, 0.18, 0.02); s.quadraticCurveTo(0.12, 0.03, 0, 0.03); s.lineTo(0, 0);
  const blade = new THREE.ExtrudeGeometry(s, { depth: 0.003, bevelEnabled: true, bevelThickness: 0.0015, bevelSize: 0.002, bevelSegments: 1 });
  g.add(mesh(blade, M('chrome'), -0.0015, -0.012, -0.004, 0, Math.PI / 2, 0));
  g.add(mesh(box(0.012, 0.05, 0.012), M('darkMetal'), 0, -0.005, 0.0));           // guard
  g.add(mesh(box(0.018, 0.028, 0.11), C(0x1c1c1c, 0.8), 0, 0.012, 0.06));         // handle
  return g;
}

// ---------------------------------------------------------------- tools & items
function flashlight() {
  const g = new THREE.Group();
  const body = C(0x2b2e33, 0.4, 0.7);
  g.add(mesh(cyl(0.017, 0.017, 0.16, 12), body, 0, 0, 0.02, Math.PI / 2));
  g.add(mesh(cyl(0.028, 0.019, 0.05, 14), body, 0, 0, -0.08, Math.PI / 2));
  const lens = mesh(cyl(0.026, 0.026, 0.004, 14), C(0xfff6d8, 0.1, 0, 0xfff1c0, 2.2), 0, 0, -0.106, Math.PI / 2);
  lens.name = 'lens';
  g.add(lens);
  g.add(mesh(box(0.008, 0.006, 0.02), C(0xaa2222, 0.5), 0, 0.019, 0.0));
  for (let i = 0; i < 5; i++) g.add(mesh(cyl(0.018, 0.018, 0.004, 12), M('black'), 0, 0, 0.06 + i * 0.012, Math.PI / 2));
  g.userData.lens = lens;
  return g;
}

function lighter() {
  const g = new THREE.Group();
  const chrome = M('chrome');
  g.add(mesh(box(0.038, 0.05, 0.014), C(0xb03424, 0.4, 0.5), 0, 0, 0));
  g.add(mesh(box(0.038, 0.016, 0.014), chrome, 0, 0.033, 0));
  g.add(mesh(cyl(0.004, 0.004, 0.012, 8), C(0x111111), 0.008, 0.045, 0));
  const lid = mesh(box(0.038, 0.03, 0.014), chrome, -0.035, 0.035, 0, 0, 0, 1.2);
  g.add(lid);
  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.008, 0.035, 8), new THREE.MeshBasicMaterial({ color: 0xffb040, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
  flame.position.set(0.004, 0.062, 0);
  flame.name = 'flame';
  g.add(flame);
  const core = new THREE.Mesh(new THREE.ConeGeometry(0.004, 0.018, 6), new THREE.MeshBasicMaterial({ color: 0x8fb4ff, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false }));
  core.position.set(0.004, 0.052, 0);
  g.add(core);
  g.userData.flame = flame;
  return g;
}

function glowstick() {
  const g = new THREE.Group();
  g.add(mesh(cyl(0.008, 0.008, 0.15, 8), C(0x30ff60, 0.3, 0, 0x30ff60, 2.5), 0, 0, 0));
  g.add(mesh(cyl(0.0085, 0.0085, 0.012, 8), C(0x222222), 0, 0.078, 0));
  return g;
}
function flare() {
  const g = new THREE.Group();
  g.add(mesh(cyl(0.014, 0.014, 0.2, 10), C(0xd8331a, 0.5), 0, 0, 0));
  g.add(mesh(cyl(0.0145, 0.0145, 0.04, 10), C(0xeeeeee, 0.6), 0, 0.05, 0));
  g.add(mesh(cyl(0.012, 0.012, 0.02, 10), C(0x222222), 0, 0.11, 0));
  return g;
}
function decoy() {
  const g = new THREE.Group();
  g.add(mesh(box(0.1, 0.06, 0.07), C(0x7b4fb0, 0.5), 0, 0, 0));
  g.add(mesh(box(0.102, 0.012, 0.072), C(0xd4b04a, 0.3, 0.8), 0, 0.03, 0));
  g.add(mesh(cyl(0.004, 0.004, 0.03, 6), C(0xd4b04a, 0.3, 0.8), 0.06, 0, 0, 0, 0, Math.PI / 2));
  g.add(mesh(box(0.006, 0.03, 0.006), C(0xd4b04a, 0.3, 0.8), 0.075, 0.012, 0));
  return g;
}
function bottle(color, label = 0xf3eed8) {
  const g = new THREE.Group();
  const pts = [[0, 0], [0.032, 0], [0.034, 0.01], [0.034, 0.14], [0.03, 0.17], [0.014, 0.2], [0.013, 0.225], [0, 0.225]].map(p => new THREE.Vector2(p[0], p[1]));
  const lathe = new THREE.LatheGeometry(pts, 14);
  g.add(mesh(lathe, new THREE.MeshStandardMaterial({ color, roughness: 0.08, metalness: 0, transparent: true, opacity: 0.75 })));
  g.add(mesh(cyl(0.0345, 0.0345, 0.06, 14, 1), C(label, 0.7), 0, 0.07, 0));
  g.add(mesh(cyl(0.014, 0.014, 0.016, 10), C(0xe8e8e8, 0.5), 0, 0.232, 0));
  return g;
}
function ammoBox(color, brass, r) {
  const g = new THREE.Group();
  g.add(mesh(box(0.1, 0.05, 0.065), C(color, 0.7), 0, 0.025, 0));
  g.add(mesh(box(0.06, 0.051, 0.066), C(0xd8d0b0, 0.7), 0, 0.025, 0));
  // a few loose rounds on top
  for (let i = 0; i < 3; i++) {
    g.add(mesh(cyl(r, r, 0.03, 8), C(brass, 0.3, 0.9), -0.025 + i * 0.022, 0.055, 0.012, Math.PI / 2, 0, 0.3));
    g.add(mesh(new THREE.ConeGeometry(r, 0.012, 8), C(0xb07a3a, 0.3, 0.9), -0.025 + i * 0.022, 0.055, -0.009, -Math.PI / 2, 0, 0));
  }
  return g;
}
function can(color) {
  const g = new THREE.Group();
  g.add(mesh(cyl(0.034, 0.034, 0.1, 16), C(0xb0b4b8, 0.3, 0.9), 0, 0.05, 0));
  g.add(mesh(cyl(0.0345, 0.0345, 0.07, 16), C(color, 0.6), 0, 0.05, 0));
  return g;
}

function rifle() {
  const g = new THREE.Group();
  const metal = M('darkMetal'), poly = C(0x2e3228, 0.65), tan = C(0x6b6448, 0.7);
  g.add(mesh(box(0.046, 0.062, 0.3), metal, 0, 0.032, -0.06));                    // receiver
  g.add(mesh(box(0.05, 0.05, 0.24), poly, 0, 0.03, -0.32));                       // handguard
  for (let i = 0; i < 6; i++) g.add(mesh(box(0.052, 0.008, 0.018), M('black'), 0, 0.058, -0.24 - i * 0.032)); // rail notches
  g.add(mesh(cyl(0.009, 0.009, 0.2, 8), metal, 0, 0.034, -0.52, Math.PI / 2));   // barrel
  g.add(mesh(cyl(0.013, 0.013, 0.05, 8), M('black'), 0, 0.034, -0.63, Math.PI / 2)); // flash hider
  g.add(mesh(box(0.008, 0.04, 0.012), metal, 0, 0.07, -0.42));                    // front sight post
  g.add(mesh(box(0.034, 0.03, 0.1), M('black'), 0, 0.08, -0.04));                 // optic body
  g.add(mesh(cyl(0.018, 0.018, 0.012, 12), C(0x3a6a8a, 0.1, 0.4, 0x0a2030, 0.6), 0, 0.08, -0.095, Math.PI / 2)); // lens
  const mag = mesh(box(0.028, 0.15, 0.06), tan, 0, -0.065, -0.11, 0.18);
  mag.name = 'mag';
  g.add(mag);
  g.add(mesh(box(0.032, 0.1, 0.045), poly, 0, -0.04, 0.04, -0.32));               // grip
  g.add(mesh(box(0.032, 0.012, 0.06), metal, 0, -0.01, -0.0));                     // trigger guard
  g.add(mesh(cyl(0.014, 0.014, 0.16, 8), metal, 0, 0.03, 0.17, Math.PI / 2));    // buffer tube
  g.add(mesh(box(0.042, 0.08, 0.13), poly, 0, 0.0, 0.26, 0.1));                   // stock
  g.add(mesh(box(0.044, 0.09, 0.02), C(0x151515, 0.9), 0, -0.005, 0.33, 0.1));    // butt pad
  g.userData.muzzle = new THREE.Vector3(0, 0.034, -0.66);
  g.userData.mag = mag;
  return g;
}
function pouch(color, label) {
  const g = new THREE.Group();
  g.add(mesh(box(0.1, 0.13, 0.03), C(0xc8c2b0, 0.35, 0.5), 0, 0.065, 0));
  g.add(mesh(box(0.102, 0.05, 0.032), C(color, 0.5), 0, 0.07, 0));
  g.add(mesh(box(0.104, 0.012, 0.034), C(0x8a857a, 0.4, 0.6), 0, 0.128, 0));
  for (let i = 0; i < 6; i++) g.add(mesh(box(0.012, 0.012, 0.012), C(color, 0.3, 0, color, 0.15), -0.03 + i * 0.012, 0.137, (i % 2) * 0.006));
  return g;
}
function board() {
  const g = new THREE.Group();
  g.add(mesh(box(0.11, 0.004, 0.08), C(0x1f6b38, 0.5), 0, 0.002, 0));
  g.add(mesh(box(0.028, 0.006, 0.028), C(0x111111, 0.4), -0.015, 0.006, 0));
  g.add(mesh(box(0.016, 0.01, 0.01), C(0xc0c4c8, 0.3, 0.9), 0.035, 0.008, 0.02));
  for (let i = 0; i < 6; i++) g.add(mesh(box(0.006, 0.006, 0.004), C(0x222222), 0.02 + (i % 3) * 0.01, 0.006, -0.025 + Math.floor(i / 3) * 0.01));
  g.add(mesh(cyl(0.004, 0.004, 0.006, 8), C(0xff3030, 0.2, 0, 0xff2020, 1.5), 0.045, 0.006, -0.03));
  return g;
}
function antennaM() {
  const g = new THREE.Group();
  g.add(mesh(box(0.04, 0.03, 0.04), C(0x222222, 0.6), 0, 0.015, 0));
  for (let i = 0; i < 3; i++) g.add(mesh(cyl(0.006 - i * 0.0015, 0.006 - i * 0.0015, 0.09, 8), M('chrome'), 0, 0.075 + i * 0.085, 0));
  g.add(mesh(new THREE.SphereGeometry(0.007, 8, 6), M('chrome'), 0, 0.33, 0));
  return g;
}
function transmitterM() {
  const g = new THREE.Group();
  g.add(mesh(box(0.07, 0.12, 0.035), C(0x3a4a3c, 0.6), 0, 0.06, 0));
  g.add(mesh(box(0.05, 0.035, 0.002), C(0x7dffa0, 0.2, 0, 0x30ff70, 1.2), 0, 0.085, 0.019));
  for (let i = 0; i < 3; i++) g.add(mesh(cyl(0.006, 0.006, 0.006, 8), C(0x222222), -0.018 + i * 0.018, 0.04, 0.019, Math.PI / 2));
  g.add(mesh(cyl(0.004, 0.004, 0.12, 6), M('chrome'), 0.025, 0.18, 0));
  return g;
}
function vestM(color) {
  const g = new THREE.Group();
  g.add(mesh(box(0.34, 0.04, 0.42), C(color, 0.85), 0, 0.02, 0));
  for (const x of [-0.08, 0.08]) g.add(mesh(box(0.12, 0.03, 0.1), C(color, 0.9), x, 0.05, 0.08));
  g.add(mesh(box(0.36, 0.045, 0.06), C(0x2a2a22, 0.8), 0, 0.022, -0.12));
  return g;
}

const BUILDERS = {
  pistol, shotgun, smg, rifle, crowbar, knife, flashlight, lighter, glowstick, flare, decoy,
  cleanWater: () => bottle(0x9fd2f0, 0x3b7fc4),
  dirtyWater: () => bottle(0x8a8452, 0xb8ae88),
  goanJuice: () => bottle(0xe2a23a, 0x6b3a14),
  paleDraught: () => bottle(0xf2efe6, 0xd8d2c4),
  vigorTonic: () => { const g = bottle(0x62e0b8, 0x1b6b55); g.scale.set(0.8, 0.8, 0.8); return g; },
  fireSalts: () => pouch(0xd9452b),
  blueberryFireSalts: () => pouch(0x4a6fe0),
  adrenaline: () => { const g = new THREE.Group(); g.add(mesh(cyl(0.012, 0.012, 0.12, 10), C(0xe04a6a, 0.4), 0, 0.012, 0, 0, 0, Math.PI / 2)); g.add(mesh(cyl(0.013, 0.013, 0.03, 10), C(0xeeeeee, 0.5), 0.055, 0.012, 0, 0, 0, Math.PI / 2)); g.add(mesh(cyl(0.006, 0.006, 0.02, 8), C(0xffcc33, 0.5), -0.068, 0.012, 0, 0, 0, Math.PI / 2)); return g; },
  purifier: () => { const g = new THREE.Group(); g.add(mesh(cyl(0.02, 0.02, 0.06, 12), C(0x6aa7c8, 0.4), 0, 0.03, 0)); g.add(mesh(cyl(0.021, 0.021, 0.015, 12), C(0xeeeeee, 0.5), 0, 0.066, 0)); return g; },
  gpsBoard: board,
  antenna: antennaM,
  transmitter: transmitterM,
  cloth: () => { const g = new THREE.Group(); g.add(mesh(box(0.14, 0.02, 0.1), C(0xa89476, 0.95), 0, 0.01, 0, 0, 0.3, 0)); g.add(mesh(box(0.1, 0.018, 0.08), C(0x8a7a5e, 0.95), 0.02, 0.028, 0.01, 0, -0.4, 0.1)); return g; },
  scrap: () => { const g = new THREE.Group(); g.add(mesh(box(0.14, 0.008, 0.08), C(0x8a8f94, 0.5, 0.8), 0, 0.006, 0, 0, 0.4, 0.08)); g.add(mesh(box(0.08, 0.008, 0.05), C(0x6a5040, 0.7, 0.6), 0.02, 0.016, 0.02, 0.2, -0.3, 0)); return g; },
  wire: () => { const g = new THREE.Group(); for (let i = 0; i < 4; i++) g.add(mesh(new THREE.TorusGeometry(0.04 - i * 0.004, 0.004, 6, 18), C(0xc8783a, 0.35, 0.9), 0, 0.006 + i * 0.006, 0, Math.PI / 2)); return g; },
  vest: () => vestM(0x4f5a3c),
  scrapVest: () => vestM(0x7a6a52),
  level5Key: () => { const g = new THREE.Group(); const m = C(0xd9d3a0, 0.3, 0.9); g.add(mesh(cyl(0.006, 0.006, 0.09, 8), m, 0, 0.006, 0, Math.PI / 2)); g.add(mesh(new THREE.TorusGeometry(0.018, 0.005, 6, 14), m, 0, 0.006, 0.055, Math.PI / 2)); g.add(mesh(box(0.012, 0.004, 0.02), m, 0.008, 0.006, -0.035)); return g; },
  snackBar: () => {
    const g = new THREE.Group();
    g.add(mesh(box(0.11, 0.02, 0.042), C(0xc9822f, 0.45), 0, 0.01, 0));
    for (const sx of [-1, 1]) g.add(mesh(box(0.012, 0.012, 0.044), C(0xb87428, 0.5), sx * 0.061, 0.01, 0));   // crimped ends
    g.add(mesh(box(0.05, 0.0205, 0.025), C(0xf3e8c8, 0.6), 0, 0.01, 0));                                   // label
    g.add(mesh(box(0.02, 0.021, 0.026), C(0x7b4b18, 0.5), 0.018, 0.01, 0));
    return g;
  },
  cannedBeans: () => can(0xb54a32),
  energyDrink: () => can(0x4dbb3f),
  bandage: () => { const g = new THREE.Group(); g.add(mesh(cyl(0.03, 0.03, 0.05, 14), C(0xece6d8, 0.95), 0, 0.025, 0)); g.add(mesh(cyl(0.012, 0.012, 0.052, 10), C(0xc8b8a0), 0, 0.025, 0)); return g; },
  medkit: () => { const g = new THREE.Group(); g.add(mesh(box(0.22, 0.08, 0.14), C(0xc22e22, 0.5), 0, 0.04, 0)); g.add(mesh(box(0.06, 0.082, 0.02), C(0xffffff, 0.5), 0, 0.04, 0)); g.add(mesh(box(0.02, 0.082, 0.06), C(0xffffff, 0.5), 0, 0.04, 0)); g.add(mesh(box(0.06, 0.01, 0.02), C(0x222222), 0, 0.085, 0)); return g; },
  painkillers: () => { const g = new THREE.Group(); g.add(mesh(cyl(0.022, 0.022, 0.07, 12), C(0xe39a2a, 0.3), 0, 0.035, 0)); g.add(mesh(cyl(0.024, 0.024, 0.018, 12), C(0xffffff, 0.5), 0, 0.078, 0)); return g; },
  battery: () => { const g = new THREE.Group(); g.add(mesh(cyl(0.012, 0.012, 0.05, 10), C(0xd6b13a, 0.4, 0.5), 0, 0.025, 0)); g.add(mesh(cyl(0.0122, 0.0122, 0.02, 10), C(0x111111, 0.4), 0, 0.01, 0)); g.add(mesh(cyl(0.004, 0.004, 0.005, 8), M('chrome'), 0, 0.052, 0)); return g; },
  ammo9: () => ammoBox(0x6b6b3a, 0xc9a640, 0.009),
  rifleAmmo: () => ammoBox(0x4a5030, 0xb8b060, 0.007),
  shells: () => { const g = new THREE.Group(); g.add(mesh(box(0.1, 0.06, 0.07), C(0x8a1f18, 0.7), 0, 0.03, 0)); g.add(mesh(box(0.101, 0.02, 0.071), C(0xe8e0c8, 0.7), 0, 0.03, 0)); return g; },
  ductTape: () => { const g = new THREE.Group(); g.add(mesh(new THREE.TorusGeometry(0.035, 0.016, 8, 18), C(0x8c9196, 0.6), 0, 0.016, 0, Math.PI / 2)); return g; },
  keycard: () => { const g = new THREE.Group(); g.add(mesh(box(0.085, 0.003, 0.054), C(0xe0a33a, 0.4), 0, 0.002, 0)); g.add(mesh(box(0.085, 0.0035, 0.01), C(0x111111), 0, 0.002, -0.015)); return g; },
  fuse: () => { const g = new THREE.Group(); g.add(mesh(cyl(0.02, 0.02, 0.09, 12), C(0xeeeeee, 0.5), 0, 0, 0, 0, 0, Math.PI / 2)); g.add(mesh(cyl(0.021, 0.021, 0.03, 12), C(0x5a8fd0, 0.5), 0, 0, 0, 0, 0, Math.PI / 2)); for (const s of [-1, 1]) g.add(mesh(cyl(0.012, 0.012, 0.02, 10), C(0xc9a640, 0.3, 0.9), s * 0.05, 0, 0, 0, 0, Math.PI / 2)); g.position.y = 0.02; return g; },
  drainKey: () => { const g = new THREE.Group(); const m = C(0x7fb8c9, 0.35, 0.8); g.add(mesh(cyl(0.008, 0.008, 0.16, 8), m, 0, 0.008, 0, Math.PI / 2)); g.add(mesh(cyl(0.008, 0.008, 0.1, 8), m, 0, 0.008, 0.08, 0, 0, Math.PI / 2)); return g; },
};

export function itemModel(id) {
  if (!cache.has(id)) {
    const b = BUILDERS[id];
    const g = b ? b() : (() => { const gg = new THREE.Group(); gg.add(mesh(box(0.1, 0.1, 0.1), C(0x888888), 0, 0.05, 0)); return gg; })();
    cache.set(id, g);
  }
  const src = cache.get(id);
  const c = src.clone(true);
  // re-link userData references to the cloned children
  c.traverse(o => {
    if (o.name === 'pump') c.userData.pump = o;
    if (o.name === 'mag') c.userData.mag = o;
    if (o.name === 'lens') c.userData.lens = o;
    if (o.name === 'flame') c.userData.flame = o;
  });
  if (src.userData.muzzle) c.userData.muzzle = src.userData.muzzle.clone();
  return c;
}

// How a pickup lies on the ground (rotation to make long items lie flat).
export const GROUND_POSE = {
  pistol: [0, 0, Math.PI / 2, 0.02], shotgun: [0, 0, Math.PI / 2, 0.025], smg: [0, 0, Math.PI / 2, 0.025],
  crowbar: [Math.PI / 2, 0, 0, 0.012], knife: [0, 0, Math.PI / 2, 0.01], flashlight: [0, 0, 0, 0.028],
  glowstick: [Math.PI / 2, 0, 0, 0.01], flare: [Math.PI / 2, 0, 0, 0.015], lighter: [0, 0, 0, 0.025],
  rifle: [0, 0, Math.PI / 2, 0.025], cleanWater: [Math.PI / 2, 0, 0, 0.034], dirtyWater: [Math.PI / 2, 0, 0, 0.034], goanJuice: [Math.PI / 2, 0, 0.6, 0.034],
  paleDraught: [Math.PI / 2, 0, 0, 0.034], fireSalts: [-Math.PI / 2, 0, 0, 0.015], blueberryFireSalts: [-Math.PI / 2, 0, 0, 0.015], antenna: [Math.PI / 2, 0, 0, 0.02],
  transmitter: [-Math.PI / 2, 0, 0, 0.018],
};

// ---------------------------------------------------------------- interactive props
export function lockerModel(variant = 'metal') {
  const g = new THREE.Group();
  const body = variant === 'wood' ? LIB.dyn('woodCrate') : LIB.dyn('paintedMetal');
  const w = 0.62, h = 1.95, d = 0.55, t = 0.025;
  g.add(mesh(box(w, t, d), body, 0, h - t / 2, 0));
  g.add(mesh(box(w, t, d), body, 0, t / 2, 0));
  g.add(mesh(box(t, h, d), body, -w / 2 + t / 2, h / 2, 0));
  g.add(mesh(box(t, h, d), body, w / 2 - t / 2, h / 2, 0));
  g.add(mesh(box(w, h, t), body, 0, h / 2, -d / 2 + t / 2));
  // door pivot on +x side, door faces +z
  const pivot = new THREE.Group();
  pivot.position.set(w / 2 - 0.01, 0, d / 2);
  const door = mesh(box(w - 0.02, h - 0.04, 0.02), body, -(w - 0.02) / 2, h / 2, 0);
  pivot.add(door);
  for (let i = 0; i < 5; i++) pivot.add(mesh(box(0.34, 0.012, 0.012), LIB.dyn('black'), -w / 2 + 0.01, 1.45 + i * 0.05, 0.012));
  pivot.add(mesh(box(0.02, 0.12, 0.03), LIB.dyn('chrome'), -w + 0.08, 1.0, 0.02));
  g.add(pivot);
  g.userData.door = pivot;
  return g;
}

export function containerModel(ctype) {
  const g = new THREE.Group();
  if (ctype === 'cardboard') {
    const m = LIB.dyn('cardboard');
    g.add(mesh(box(0.6, 0.42, 0.45), m, 0, 0.21, 0));
    const f1 = new THREE.Group(); f1.position.set(0, 0.42, -0.225); f1.add(mesh(box(0.6, 0.01, 0.22), m, 0, 0, 0.11)); g.add(f1);
    const f2 = new THREE.Group(); f2.position.set(0, 0.42, 0.225); f2.add(mesh(box(0.6, 0.01, 0.22), m, 0, 0, -0.11)); g.add(f2);
    g.userData.flaps = [f1, f2];
  } else if (ctype === 'cabinet') {
    const m = LIB.dyn('paintedMetal');
    g.add(mesh(box(0.47, 1.32, 0.6), m, 0, 0.66, 0));
    const drawers = [];
    for (let k = 0; k < 4; k++) {
      const dr = new THREE.Group();
      dr.position.set(0, 0.08 + k * 0.31 + 0.15, 0.3);
      dr.add(mesh(box(0.43, 0.29, 0.02), m, 0, 0, 0.01));
      dr.add(mesh(box(0.12, 0.025, 0.025), LIB.dyn('chrome'), 0, 0.06, 0.03));
      // drawer body (hidden inside the cabinet until pulled out)
      const inner = LIB.dyn('darkMetal');
      dr.add(mesh(box(0.4, 0.015, 0.5), inner, 0, -0.12, -0.25));
      dr.add(mesh(box(0.015, 0.22, 0.5), inner, -0.195, -0.02, -0.25));
      dr.add(mesh(box(0.015, 0.22, 0.5), inner, 0.195, -0.02, -0.25));
      dr.add(mesh(box(0.4, 0.22, 0.015), inner, 0, -0.02, -0.5));
      if (k === 2) for (let f = 0; f < 5; f++) dr.add(mesh(box(0.34, 0.2, 0.004), LIB.dyn('paper'), 0, -0.02, -0.08 - f * 0.08, -0.15 + f * 0.04));
      g.add(dr);
      drawers.push(dr);
    }
    g.userData.drawers = drawers;
  } else if (ctype === 'crate') {
    const m = LIB.dyn('woodCrate');
    g.add(mesh(box(0.8, 0.55, 0.55), m, 0, 0.275, 0));
    const lid = new THREE.Group(); lid.position.set(0, 0.55, -0.275); lid.add(mesh(box(0.82, 0.05, 0.57), m, 0, 0.025, 0.285)); g.add(lid);
    g.userData.lid = lid;
  } else if (ctype === 'toolbox') {
    const m = C(0xb8281c, 0.45, 0.6);
    g.add(mesh(box(0.5, 0.2, 0.22), m, 0, 0.1, 0));
    const lid = new THREE.Group(); lid.position.set(0, 0.2, -0.11); lid.add(mesh(box(0.5, 0.06, 0.22), m, 0, 0.03, 0.11)); lid.add(mesh(box(0.25, 0.03, 0.03), M('darkMetal'), 0, 0.075, 0.11)); g.add(lid);
    g.userData.lid = lid;
  } else if (ctype === 'backpack') {
    const m = C(0x77804f, 0.9);
    g.add(mesh(box(0.38, 0.45, 0.22), m, 0, 0.22, 0, -0.25));
    g.add(mesh(box(0.3, 0.18, 0.08), m, 0, 0.15, 0.13, -0.25));
    g.add(mesh(box(0.36, 0.08, 0.2), C(0x5a6238, 0.9), 0, 0.44, -0.03, -0.25));
  } else { // first aid wall cabinet etc.
    g.add(mesh(box(0.5, 0.5, 0.5), LIB.dyn('woodCrate'), 0, 0.25, 0));
  }
  return g;
}

export function noteModel() {
  const g = new THREE.Group();
  const paper = mesh(box(0.21, 0.002, 0.29), LIB.dyn('paper'), 0, 0.001, 0, 0, 0.2, 0);
  g.add(paper);
  return g;
}
