// Procedural player avatar with customization and procedural animation.
// Expanded from the original game's head/body/leg colours: skin tone, hair,
// headwear, shirt colour + style, pants, shoes and an accessory.
import * as THREE from 'three';
import { damp } from '../core/rng.js';

export const SKIN_OPTIONS = {
  skinTone: ['#f2d3b8', '#e5b994', '#c98f66', '#a56c47', '#7a4b2f', '#4f2f1e', '#d9c2a8', '#b9e0c0'],
  hair: ['none', 'short', 'long', 'mohawk', 'bun', 'curly'],
  hairColor: ['#1b1410', '#3d2817', '#6b4423', '#a8743f', '#d9b56c', '#e8e2d0', '#8a2b1d', '#3f5fb0'],
  headwear: ['none', 'cap', 'beanie', 'hardhat', 'hood', 'headlamp'],
  headwearColor: ['#2a2f3a', '#a8301f', '#e2b833', '#2f6b3a', '#d9d4c4', '#1b1b1b', '#e07a2a', '#6b3fa0'],
  shirt: ['tee', 'hoodie', 'vest', 'striped', 'jacket', 'labcoat'],
  shirtColor: ['#4fc3f7', '#ff8a65', '#81c784', '#ba68c8', '#ffd54f', '#f06292', '#4b5563', '#e7e2d3', '#1f2937', '#8d6e63'],
  pantsColor: ['#2b3446', '#1b1b1b', '#5b4636', '#3e5a3a', '#7d7d78', '#1e3a8a', '#6b2c2c', '#c8bfa4'],
  shoesColor: ['#151515', '#f2f2f2', '#6b3a1f', '#a8301f', '#2a4b8d', '#e2b833'],
  accessory: ['none', 'backpack', 'scarf', 'glasses', 'gasmask', 'satchel', 'goggles', 'bandana', 'radio', 'beltpack'],
};

export const DEFAULT_SKIN = {
  skinTone: '#e5b994', hair: 'short', hairColor: '#3d2817', headwear: 'none', headwearColor: '#2a2f3a',
  shirt: 'hoodie', shirtColor: '#4fc3f7', pantsColor: '#2b3446', shoesColor: '#151515', accessory: 'backpack',
};

export function randomSkin() {
  const s = {};
  for (const [k, arr] of Object.entries(SKIN_OPTIONS)) s[k] = arr[Math.floor(Math.random() * arr.length)];
  return s;
}

export function normalizeSkin(s) {
  const out = { ...DEFAULT_SKIN };
  if (s) for (const k of Object.keys(DEFAULT_SKIN)) if (s[k] !== undefined && typeof s[k] === 'string' && s[k].length < 24) out[k] = s[k];
  return out;
}

const matCache = new Map();
function mat(color, rough = 0.75, metal = 0, extra = {}) {
  const key = color + rough + metal + JSON.stringify(extra);
  if (!matCache.has(key)) matCache.set(key, new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, ...extra }));
  return matCache.get(key);
}
function stripeTex(c1, c2) {
  const key = 'stripe' + c1 + c2;
  if (matCache.has(key)) return matCache.get(key);
  const cv = document.createElement('canvas'); cv.width = 8; cv.height = 64;
  const g = cv.getContext('2d');
  for (let y = 0; y < 64; y += 16) { g.fillStyle = c1; g.fillRect(0, y, 8, 8); g.fillStyle = c2; g.fillRect(0, y + 8, 8, 8); }
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.magFilter = THREE.NearestFilter;
  const m = new THREE.MeshStandardMaterial({ map: t, roughness: 0.8 });
  matCache.set(key, m);
  return m;
}

function rbox(w, h, d, r = 0.02) {
  // slightly rounded box via scaled sphere-ish geometry is costly; use bevel-ish box
  const g = new THREE.BoxGeometry(w, h, d, 2, 2, 2);
  const p = g.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const ax = Math.abs(v.x) / (w / 2), ay = Math.abs(v.y) / (h / 2), az = Math.abs(v.z) / (d / 2);
    const k = (ax > 0.99 ? 1 : 0) + (ay > 0.99 ? 1 : 0) + (az > 0.99 ? 1 : 0);
    if (k >= 2) v.multiplyScalar(1 - r);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}

function part(geo, material, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z);
  if (rx || ry || rz) m.rotation.set(rx, ry, rz);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

export class Avatar {
  constructor(skin = DEFAULT_SKIN) {
    this.group = new THREE.Group();
    this.skin = normalizeSkin(skin);
    this.walkT = 0;
    this.speed = 0;
    this.state = { crouch: 0, swim: 0, downed: 0, aim: 0, holding: false };
    this.build();
  }

  build() {
    const s = this.skin;
    this.group.clear();
    const skinM = mat(s.skinTone, 0.65);
    const shirtM = s.shirt === 'striped' ? stripeTex(s.shirtColor, '#e9e4d6') : mat(s.shirtColor, 0.85);
    const pantsM = mat(s.pantsColor, 0.9);
    const shoeM = mat(s.shoesColor, 0.6);
    const hairM = mat(s.hairColor, 0.9);
    const hwM = mat(s.headwearColor, 0.6);
    // what the shoulders and sleeves are made of (coats and jackets go over the top)
    const outerM = s.shirt === 'labcoat' ? mat('#ecebe4', 0.8) : s.shirt === 'jacket' ? mat('#3a3a32', 0.8) : shirtM;

    const root = new THREE.Group();
    this.group.add(root);
    this.root = root;
    const hips = new THREE.Group(); hips.position.y = 0.92; root.add(hips); this.hips = hips;
    hips.add(part(rbox(0.32, 0.16, 0.2), pantsM, 0, 0, 0));
    const spine = new THREE.Group(); spine.position.y = 0.08; hips.add(spine); this.spine = spine;
    const torso = part(rbox(0.36, 0.46, 0.22, 0.05), shirtM, 0, 0.24, 0);
    spine.add(torso);
    if (s.shirt === 'vest') {
      spine.add(part(rbox(0.375, 0.4, 0.235), mat('#f2a22a', 0.6), 0, 0.25, 0));
      spine.add(part(new THREE.BoxGeometry(0.38, 0.03, 0.24), mat('#e8e8d8', 0.3, 0, { emissive: '#555544' }), 0, 0.17, 0));
      spine.add(part(new THREE.BoxGeometry(0.38, 0.03, 0.24), mat('#e8e8d8', 0.3, 0, { emissive: '#555544' }), 0, 0.33, 0));
    }
    if (s.shirt === 'hoodie') {
      spine.add(part(rbox(0.2, 0.08, 0.06), shirtM, 0, 0.14, 0.12));          // pocket
      spine.add(part(rbox(0.3, 0.1, 0.12), shirtM, 0, 0.5, -0.1));            // hood back
    }
    if (s.shirt === 'jacket') {
      spine.add(part(rbox(0.38, 0.48, 0.235), mat('#3a3a32', 0.8), 0, 0.24, 0));
      spine.add(part(new THREE.BoxGeometry(0.1, 0.44, 0.01), shirtM, 0, 0.24, 0.118));
    }
    if (s.shirt === 'labcoat') {
      spine.add(part(rbox(0.38, 0.5, 0.235), mat('#ecebe4', 0.8), 0, 0.23, 0));
      hips.add(part(rbox(0.36, 0.34, 0.235), mat('#ecebe4', 0.8), 0, -0.16, 0));
    }
    // neck & head
    // shoulder yoke so the neck and arms meet the torso instead of floating
    spine.add(part(rbox(0.4, 0.08, 0.2, 0.35), outerM, 0, 0.455, 0));
    const neck = new THREE.Group(); neck.position.y = 0.5; spine.add(neck); this.neck = neck;
    neck.add(part(new THREE.CylinderGeometry(0.052, 0.066, 0.15, 10), skinM, 0, 0.02, -0.005));
    const head = new THREE.Group(); head.position.y = 0.09; neck.add(head); this.head = head;
    head.add(part(rbox(0.22, 0.25, 0.23, 0.12), skinM, 0, 0.12, 0));
    // face
    const eyeM = mat('#151515', 0.3);
    head.add(part(new THREE.SphereGeometry(0.018, 6, 6), eyeM, -0.05, 0.14, 0.113));
    head.add(part(new THREE.SphereGeometry(0.018, 6, 6), eyeM, 0.05, 0.14, 0.113));
    head.add(part(new THREE.BoxGeometry(0.06, 0.012, 0.01), mat('#5a2a20', 0.6), 0, 0.06, 0.115));
    head.add(part(new THREE.BoxGeometry(0.03, 0.04, 0.03), skinM, 0, 0.1, 0.12));
    // hair: a scalp cap that wraps the back and sides, plus a style on top
    if (s.hair !== 'none' && s.headwear !== 'hood') {
      const cap = () => {
        head.add(part(rbox(0.236, 0.07, 0.246, 0.3), hairM, 0, 0.237, -0.002));
        head.add(part(rbox(0.232, 0.15, 0.04, 0.2), hairM, 0, 0.175, -0.104));
        for (const sx of [-1, 1]) head.add(part(rbox(0.022, 0.09, 0.15, 0.3), hairM, sx * 0.111, 0.19, -0.035));
      };
      if (s.hair === 'short') { cap(); head.add(part(rbox(0.2, 0.035, 0.035, 0.3), hairM, 0.01, 0.23, 0.106, 0.15, 0, -0.08)); }
      if (s.hair === 'curly') {
        cap();
        const curl = new THREE.SphereGeometry(0.042, 7, 5);
        for (let i = 0; i < 16; i++) {
          const a = (i / 16) * Math.PI * 2, ring = i % 2 ? 0.085 : 0.06;
          head.add(part(curl, hairM, Math.cos(a) * ring, 0.262 + (i % 3) * 0.008, Math.sin(a) * ring * 1.05 - 0.01));
        }
        for (let i = 0; i < 6; i++) head.add(part(curl, hairM, -0.09 + i * 0.036, 0.15 + (i % 2) * 0.03, -0.115));
      }
      if (s.hair === 'long') {
        cap();
        head.add(part(rbox(0.25, 0.32, 0.06, 0.2), hairM, 0, 0.08, -0.105));
        for (const sx of [-1, 1]) head.add(part(rbox(0.035, 0.26, 0.11, 0.3), hairM, sx * 0.118, 0.08, -0.04));
        head.add(part(rbox(0.21, 0.04, 0.04, 0.3), hairM, -0.02, 0.225, 0.105, 0.2, 0, 0.12));
      }
      if (s.hair === 'mohawk') {
        // shaved sides with a crest of tapered spikes
        head.add(part(rbox(0.226, 0.03, 0.236, 0.3), mat(s.hairColor, 0.95, 0, { transparent: true, opacity: 0.45 }), 0, 0.236, 0));
        const spike = new THREE.ConeGeometry(0.03, 0.11, 6);
        for (let i = 0; i < 6; i++) {
          const z = 0.1 - i * 0.042, h = 1 - Math.abs(i - 2) * 0.15;
          const sp = part(spike, hairM, 0, 0.27 + h * 0.03, z);
          sp.scale.set(1, h, 1.4); sp.rotation.x = -0.35 - i * 0.08;
          head.add(sp);
        }
      }
      if (s.hair === 'bun') {
        cap();
        head.add(part(new THREE.SphereGeometry(0.065, 10, 8), hairM, 0, 0.26, -0.13));
        head.add(part(new THREE.TorusGeometry(0.045, 0.01, 6, 12), mat('#2a2a2a', 0.6), 0, 0.245, -0.11, 0.9, 0, 0));
      }
    }
    // headwear
    if (s.headwear === 'cap') { head.add(part(rbox(0.24, 0.08, 0.25, 0.3), hwM, 0, 0.255, 0)); head.add(part(new THREE.BoxGeometry(0.2, 0.015, 0.12), hwM, 0, 0.225, 0.16)); }
    if (s.headwear === 'beanie') head.add(part(rbox(0.245, 0.14, 0.255, 0.35), hwM, 0, 0.25, 0));
    if (s.headwear === 'hardhat') { head.add(part(new THREE.SphereGeometry(0.15, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), hwM, 0, 0.22, 0)); head.add(part(new THREE.CylinderGeometry(0.17, 0.17, 0.015, 14), hwM, 0, 0.225, 0.01)); }
    if (s.headwear === 'hood') { head.add(part(rbox(0.26, 0.29, 0.26, 0.2), hwM, 0, 0.14, -0.015)); head.add(part(new THREE.BoxGeometry(0.17, 0.2, 0.02), mat('#111', 0.9), 0, 0.12, 0.122)); }
    if (s.headwear === 'headlamp') {
      head.add(part(new THREE.CylinderGeometry(0.122, 0.122, 0.03, 14), mat('#222', 0.7), 0, 0.2, 0));
      const lamp = part(new THREE.BoxGeometry(0.06, 0.04, 0.03), mat('#333', 0.4), 0, 0.2, 0.125);
      head.add(lamp);
      head.add(part(new THREE.CircleGeometry(0.015, 10), mat('#fff6d0', 0.2, 0, { emissive: '#fff1c0', emissiveIntensity: 2 }), 0, 0.2, 0.141));
    }
    // accessories
    if (s.accessory === 'glasses') {
      // round wire frames: rims, bridge, lenses and arms that run back to the ears
      const frame = mat('#1a1a1a', 0.3, 0.6);
      const rim = new THREE.TorusGeometry(0.032, 0.0055, 6, 16);
      for (const sx of [-1, 1]) {
        head.add(part(rim, frame, sx * 0.05, 0.142, 0.121));
        head.add(part(new THREE.CircleGeometry(0.03, 14), mat('#a8c4d0', 0.05, 0.2, { transparent: true, opacity: 0.25 }), sx * 0.05, 0.142, 0.122));
        head.add(part(new THREE.BoxGeometry(0.006, 0.006, 0.12), frame, sx * 0.112, 0.146, 0.065));
        head.add(part(new THREE.BoxGeometry(0.03, 0.006, 0.006), frame, sx * 0.097, 0.146, 0.121));
      }
      head.add(part(new THREE.BoxGeometry(0.03, 0.006, 0.006), frame, 0, 0.15, 0.124));
    }
    if (s.accessory === 'gasmask') {
      const rub = mat('#2b2f2a', 0.7);
      head.add(part(rbox(0.17, 0.15, 0.08, 0.3), rub, 0, 0.1, 0.12));
      for (const sx of [-1, 1]) {
        head.add(part(new THREE.CylinderGeometry(0.03, 0.03, 0.012, 14), mat('#9fb4b8', 0.1, 0.3, { transparent: true, opacity: 0.55 }), sx * 0.045, 0.145, 0.163, Math.PI / 2, 0, 0));
        head.add(part(new THREE.CylinderGeometry(0.034, 0.038, 0.06, 12), mat('#4a4c48', 0.5, 0.3), sx * 0.07, 0.05, 0.16, Math.PI / 2, 0, sx * 0.6));
        head.add(part(new THREE.BoxGeometry(0.01, 0.012, 0.24), rub, sx * 0.112, 0.15, 0.0));
      }
      head.add(part(new THREE.CylinderGeometry(0.026, 0.03, 0.04, 10), mat('#333', 0.5), 0, 0.055, 0.17, Math.PI / 2, 0, 0));
    }
    if (s.accessory === 'goggles') {
      const strap = mat('#2a2a2a', 0.8);
      head.add(part(new THREE.CylinderGeometry(0.121, 0.121, 0.025, 16), strap, 0, 0.215, 0));
      for (const sx of [-1, 1]) head.add(part(new THREE.CylinderGeometry(0.034, 0.03, 0.03, 12), mat('#c9a24a', 0.35, 0.5), sx * 0.048, 0.225, 0.11, Math.PI / 2 - 0.5, 0, 0));
    }
    if (s.accessory === 'bandana') {
      head.add(part(rbox(0.235, 0.09, 0.08, 0.3), mat(s.headwearColor, 0.9), 0, 0.06, 0.09));
      head.add(part(new THREE.ConeGeometry(0.06, 0.1, 4), mat(s.headwearColor, 0.9), 0, 0.0, 0.12, Math.PI, Math.PI / 4, 0));
    }
    if (s.accessory === 'scarf') {
      const sm = mat(s.headwearColor, 0.95);
      spine.add(part(new THREE.TorusGeometry(0.09, 0.04, 8, 16), sm, 0, 0.5, 0, Math.PI / 2, 0, 0));
      spine.add(part(rbox(0.07, 0.26, 0.03, 0.3), sm, 0.07, 0.34, 0.125, 0, 0, 0.1));
      spine.add(part(rbox(0.06, 0.2, 0.03, 0.3), sm, 0.12, 0.37, 0.12, 0, 0, -0.15));
    }
    if (s.accessory === 'backpack') {
      const bm = mat('#5b4a32', 0.85), sm = mat('#3a2f20', 0.85);
      spine.add(part(rbox(0.3, 0.38, 0.15, 0.15), bm, 0, 0.26, -0.18));
      spine.add(part(rbox(0.22, 0.1, 0.06), mat('#4a3b28', 0.85), 0, 0.15, -0.27));
      spine.add(part(new THREE.CylinderGeometry(0.06, 0.06, 0.32, 10), mat('#5a6a4a', 0.9), 0, 0.5, -0.19, 0, 0, Math.PI / 2)); // bedroll
      for (const sx of [-1, 1]) spine.add(part(rbox(0.045, 0.42, 0.02, 0.3), sm, sx * 0.1, 0.27, 0.115));
    }
    if (s.accessory === 'satchel') { spine.add(part(rbox(0.06, 0.62, 0.03), mat('#6b4a2a', 0.8), 0, 0.25, 0.12, 0, 0, 0.55)); hips.add(part(rbox(0.24, 0.2, 0.08), mat('#6b4a2a', 0.8), 0.18, 0, 0.1)); hips.add(part(rbox(0.24, 0.07, 0.085), mat('#5a3d22', 0.8), 0.18, 0.07, 0.1)); }
    if (s.accessory === 'radio') {
      spine.add(part(rbox(0.07, 0.11, 0.04, 0.2), mat('#2b2e2a', 0.6), 0.13, 0.4, 0.125));
      spine.add(part(new THREE.CylinderGeometry(0.006, 0.006, 0.16, 5), mat('#111', 0.4), 0.15, 0.52, 0.125));
      spine.add(part(new THREE.BoxGeometry(0.012, 0.012, 0.005), mat('#30ff60', 0.3, 0, { emissive: '#30ff60', emissiveIntensity: 1.5 }), 0.11, 0.43, 0.147));
    }
    if (s.accessory === 'beltpack') {
      hips.add(part(rbox(0.36, 0.05, 0.23, 0.3), mat('#2a2620', 0.7), 0, 0.04, 0));
      for (const sx of [-1, 0, 1]) hips.add(part(rbox(0.08, 0.1, 0.05, 0.25), mat('#4a4636', 0.85), sx * 0.11, 0.0, sx ? 0.11 : -0.13));
    }

    // arms
    const armGeo = rbox(0.115, 0.31, 0.115, 0.3), foreGeo = rbox(0.1, 0.28, 0.1, 0.3);
    const sleeveM = s.shirt === 'vest' || s.shirt === 'tee' ? skinM : outerM;
    this.arms = [];
    for (const side of [-1, 1]) {
      const sh = new THREE.Group(); sh.position.set(side * 0.235, 0.44, 0); spine.add(sh);
      sh.add(part(new THREE.SphereGeometry(0.068, 10, 8), outerM, 0, -0.01, 0)); // shoulder cap
      const upper = part(armGeo, outerM, 0, -0.14, 0);
      sh.add(upper);
      const elbow = new THREE.Group(); elbow.position.y = -0.29; sh.add(elbow);
      elbow.add(part(foreGeo, sleeveM, 0, -0.13, 0));
      const hand = new THREE.Group(); hand.position.y = -0.28; elbow.add(hand);
      hand.add(part(rbox(0.085, 0.1, 0.06, 0.3), skinM, 0, -0.04, 0));
      this.arms.push({ sh, elbow, hand, side });
    }
    // legs
    const thighGeo = rbox(0.13, 0.42, 0.14, 0.2), shinGeo = rbox(0.12, 0.42, 0.12, 0.2);
    this.legs = [];
    for (const side of [-1, 1]) {
      const hip = new THREE.Group(); hip.position.set(side * 0.09, -0.06, 0); hips.add(hip);
      hip.add(part(thighGeo, pantsM, 0, -0.2, 0));
      const knee = new THREE.Group(); knee.position.y = -0.41; hip.add(knee);
      knee.add(part(shinGeo, pantsM, 0, -0.2, 0));
      const foot = part(rbox(0.13, 0.08, 0.24, 0.3), shoeM, 0, -0.42, 0.04);
      knee.add(foot);
      this.legs.push({ hip, knee, side });
    }
    this.held = null;
    this.heldSlot = new THREE.Group();
    this.heldSlot.position.set(0, -0.08, 0.02);
    this.arms[1].hand.add(this.heldSlot);
  }

  setSkin(skin) { this.skin = normalizeSkin(skin); this.build(); }

  setHeld(model) {
    if (this.held) this.heldSlot.remove(this.held);
    this.held = model || null;
    if (model) {
      // item models point their barrel / front down -Z with +Y up; map that onto
      // the hand so -Z runs along the fingers and +Y faces the back of the hand
      model.rotation.set(-Math.PI / 2, 0, Math.PI);
      this.heldSlot.add(model);
    }
  }

  // state: {speed, crouch, swim, downed, aim(0..1), pitch}
  animate(dt, st) {
    const S = this.state;
    S.crouch = damp(S.crouch, st.crouch ? 1 : 0, 8, dt);
    S.swim = damp(S.swim, st.swim ? 1 : 0, 5, dt);
    S.downed = damp(S.downed, st.downed ? 1 : 0, 5, dt);
    S.aim = damp(S.aim, st.holding ? 1 : 0, 8, dt);
    this.speed = damp(this.speed, st.speed || 0, 10, dt);
    const sp = Math.min(this.speed / 5.5, 1.2);
    this.walkT += dt * (2 + this.speed * 1.9) * (S.swim > 0.5 ? 0.5 : 1);
    const w = this.walkT;
    const swing = Math.sin(w) * 0.75 * sp;
    const t = performance.now() * 0.001;

    // base pose
    this.root.position.y = 0;
    this.root.rotation.set(0, 0, 0);
    this.hips.position.y = 0.92 - S.crouch * 0.32 + Math.abs(Math.cos(w)) * 0.035 * sp;
    this.spine.rotation.x = S.crouch * 0.35 + sp * 0.08;
    this.neck.rotation.x = -(st.pitch || 0) * 0.6 - S.crouch * 0.25;

    for (const L of this.legs) {
      const ph = L.side > 0 ? swing : -swing;
      L.hip.rotation.x = ph - S.crouch * 0.9;
      L.knee.rotation.x = Math.max(0, -Math.sin(w + (L.side > 0 ? 0 : Math.PI)) * 0.9 * sp) + S.crouch * 1.5;
    }
    for (const A of this.arms) {
      const ph = A.side > 0 ? -swing : swing;
      A.sh.rotation.set(ph * 0.7, 0, A.side * (0.08 + Math.sin(t * 1.3) * 0.015));
      A.elbow.rotation.x = -0.25 - sp * 0.3;
    }
    // holding an item: right arm forward
    if (S.aim > 0.01) {
      const R = this.arms[1];
      const pitch = st.pitch || 0;
      R.sh.rotation.x = R.sh.rotation.x * (1 - S.aim) + (-1.35 - pitch) * S.aim;
      R.sh.rotation.z = R.sh.rotation.z * (1 - S.aim) + 0.12 * S.aim;
      R.elbow.rotation.x = R.elbow.rotation.x * (1 - S.aim) + -0.25 * S.aim;
      if (st.twoHanded) {
        const Lh = this.arms[0];
        Lh.sh.rotation.x = Lh.sh.rotation.x * (1 - S.aim) + (-1.2 - pitch) * S.aim;
        Lh.sh.rotation.z = Lh.sh.rotation.z * (1 - S.aim) + -0.55 * S.aim;
        Lh.elbow.rotation.x = -0.6 * S.aim;
      }
    }
    // eating / drinking / patching up: right hand to the mouth (or to the arm)
    S.use = damp(S.use || 0, st.using ? 1 : 0, 9, dt);
    if (S.use > 0.01) {
      const R = this.arms[1], k = S.use;
      const sip = st.using === 'drink' ? 0.25 + Math.sin(t * 2.2) * 0.08 : Math.sin(t * 7) * 0.12;
      if (st.using === 'bandage') {
        R.sh.rotation.x = R.sh.rotation.x * (1 - k) + -0.9 * k; R.sh.rotation.z = R.sh.rotation.z * (1 - k) + -0.6 * k;
        R.elbow.rotation.x = R.elbow.rotation.x * (1 - k) + (-1.2 + Math.sin(t * 9) * 0.15) * k;
        const Lh = this.arms[0];
        Lh.sh.rotation.x = Lh.sh.rotation.x * (1 - k) + -0.7 * k; Lh.elbow.rotation.x = -1.0 * k;
      } else {
        R.sh.rotation.x = R.sh.rotation.x * (1 - k) + (-1.0 - sip) * k;
        R.sh.rotation.z = R.sh.rotation.z * (1 - k) + -0.45 * k;
        R.elbow.rotation.x = R.elbow.rotation.x * (1 - k) + -2.15 * k;
        this.neck.rotation.x += (st.using === 'drink' ? -0.35 : 0.1) * k;
      }
    }
    // swimming: horizontal body with breaststroke
    if (S.swim > 0.01) {
      this.root.rotation.x = S.swim * 1.1;
      this.root.position.y = S.swim * 0.6;
      for (const A of this.arms) {
        A.sh.rotation.x = A.sh.rotation.x * (1 - S.swim) + (-2.6 + Math.sin(w * 2) * 0.6) * S.swim;
        A.sh.rotation.z = A.sh.rotation.z * (1 - S.swim) + A.side * (0.4 + Math.cos(w * 2) * 0.4) * S.swim;
      }
      for (const L of this.legs) L.hip.rotation.x = L.hip.rotation.x * (1 - S.swim) + Math.sin(w * 2 + L.side) * 0.4 * S.swim;
    }
    // downed: lying on side, one arm reaching
    if (S.downed > 0.01) {
      this.root.rotation.z = S.downed * 1.45;
      this.root.position.y = S.downed * 0.18;
      this.root.position.x = 0;
      this.arms[1].sh.rotation.x = -2.4 * S.downed + Math.sin(t * 2) * 0.1;
      this.legs[0].knee.rotation.x = 0.8 * S.downed;
    }
  }
}
