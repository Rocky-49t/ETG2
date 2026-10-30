// The Goaning Machine: a sealed transfer chamber with seats, a conical
// binding emitter (S-201), concentrate tanks (V-101/102/103), pipework and a
// control console. Static shell = prop (baked into chunk geometry); the
// sliding door and the emitter core are interactive objects so their state
// (open / charging / transferring / broken) replicates through world state.
// Local frame: origin at the chamber floor centre, door on +z.
import * as THREE from 'three';
import { registerProps, addProp } from './props.js';
import { addObject, addLight, addDecal } from './levels/common.js';
import { registerObjectKind } from '../game/objects.js';

export const MACHINE = { hx: 2.5, hz: 2.0, h: 2.8, door: 0.85, t: 0.12 };
const M = MACHINE;

// colliders in local space (shell walls with a door gap, tanks, console)
function shellColliders(p) {
  const t = M.t, out = [
    [-M.hx - t, 0, -M.hz - t, M.hx + t, M.h, -M.hz],           // back
    [-M.hx - t, 0, -M.hz, -M.hx, M.h, M.hz + t],               // left
    [M.hx, 0, -M.hz, M.hx + t, M.h, M.hz + t],                 // right
    [-M.hx, 0, M.hz, -M.door, M.h, M.hz + t],                  // front-left
    [M.door, 0, M.hz, M.hx, M.h, M.hz + t],                    // front-right
    [-M.hx - t, M.h, -M.hz - t, M.hx + t, M.h + 0.18, M.hz + t], // roof
  ];
  if (!p.compact) {
    out.push([-M.hx - 1.45, 0, -1.6, -M.hx - 0.2, 2.9, -0.4]);   // V-101
    out.push([-M.hx - 1.2, 0, 0.1, -M.hx - 0.3, 1.9, 1.0]);      // V-102
    out.push([M.hx + 0.25, 0, 1.0, M.hx + 1.05, 1.25, 1.6]);     // console
  }
  return out;
}

registerProps({
  goaningMachine: {
    colliders: shellColliders,
    build(p, B) {
      const t = M.t, dmg = !!p.damaged;
      const wall = 'labPanel', steel = 'chrome', dark = 'darkMetal';
      const box = (m, x, y, z, sx, sy, sz, uv = 1) => B.box(m, x, y + sy / 2, z, sx, sy, sz, uv);
      // floor plate + grating
      box('darkMetal', 0, 0, 0, M.hx * 2 + t * 2, 0.06, M.hz * 2 + t * 2, 1);
      box('grate', 0, 0.06, 0, M.hx * 2 - 0.1, 0.01, M.hz * 2 - 0.1, 2);
      // walls (outer + inner skin share the panel texture)
      box(wall, 0, 0, -M.hz - t / 2, M.hx * 2 + t * 2, M.h, t, 2.5);
      box(wall, -M.hx - t / 2, 0, 0, t, M.h, M.hz * 2 + t * 2, 2.5);
      box(wall, M.hx + t / 2, 0, 0, t, M.h, M.hz * 2 + t * 2, 2.5);
      const fw = M.hx - M.door;
      box(wall, -M.door - fw / 2, 0, M.hz + t / 2, fw, M.h, t, 1.5);
      box(wall, M.door + fw / 2, 0, M.hz + t / 2, fw, 1.0, t, 1.5);       // under the window
      box(wall, M.door + fw / 2, 2.25, M.hz + t / 2, fw, M.h - 2.25, t, 1.5);
      if (!dmg) box('glass', M.door + fw / 2, 1.0, M.hz + t / 2, fw, 1.25, 0.02, 1);
      box(wall, 0, 2.35, M.hz + t / 2, M.door * 2, M.h - 2.35, t, 1);    // lintel
      // steel frame edges
      for (const [x, z] of [[-M.hx - t, -M.hz - t], [M.hx + t, -M.hz - t], [-M.hx - t, M.hz + t], [M.hx + t, M.hz + t], [-M.door, M.hz + t], [M.door, M.hz + t]]) box(steel, x, 0, z, 0.08, M.h + 0.1, 0.08, 0.5);
      // roof with a vent block
      if (dmg) {
        box(wall, -1.2, M.h, 0, M.hx * 2 - 2.2, 0.16, M.hz * 2 + t * 2, 2);
        B.setTransform(p.x + 1.6, p.y + M.h + 0.25, p.z + 0.2, p.ry + 0.0);
        const m = B.M.clone(); m.multiply(new THREE.Matrix4().makeRotationZ(-0.35)); B.setMatrix(m);
        B.box(wall, 0, 0, 0, 2.4, 0.14, M.hz * 2 + 0.2, 2);
        B.setTransform(p.x, p.y, p.z, p.ry);
      } else box(wall, 0, M.h, 0, M.hx * 2 + t * 2, 0.16, M.hz * 2 + t * 2, 2);
      box(dark, -1.2, M.h + 0.16, -0.8, 1.1, 0.35, 0.9, 0.5);
      for (let i = 0; i < 5; i++) box('black', -1.2, M.h + 0.18 + i * 0.06, -0.34, 1.0, 0.02, 0.02, 0.2);
      // interior: a strip light and handrails
      box('glowWhite', 0, M.h - 0.04, -M.hz + 0.25, 3.4, 0.03, 0.08, 0.5);
      for (const sx of [-1, 1]) box(steel, sx * (M.hx - 0.08), 1.05, 0, 0.04, 0.04, M.hz * 2 - 0.6, 0.5);
      // emitter mounting plate in the roof
      B.cyl(dark, 0, M.h - 0.12, -0.5, 0.75, 0.12, 20, true);
      if (p.compact) return;
      // ---- outside: concentrate tanks with dished heads, legs and bands
      const tank = (x, z, r, h, base) => {
        for (const a of [0.4, 2.5, 4.6]) box(dark, x + Math.cos(a) * r * 0.75, 0, z + Math.sin(a) * r * 0.75, 0.06, base, 0.06, 0.3);
        B.cyl(steel, x, base, z, r, h, 18, false, r, 2);
        B.cyl(steel, x, base + h, z, r * 0.92, r * 0.35, 18, true, r * 0.3);
        B.cyl(steel, x, base - r * 0.3, z, r * 0.3, r * 0.3, 18, true, r * 0.92);
        for (const y of [0.25, 0.75]) B.cyl(dark, x, base + h * y, z, r + 0.015, 0.05, 18, false);
        B.cyl('hazard', x, base + h * 0.5, z, r + 0.008, 0.12, 18, false);
      };
      tank(-M.hx - 0.82, -1.0, 0.55, 1.9, 0.35);
      tank(-M.hx - 0.75, 0.55, 0.38, 1.15, 0.3);
      tank(-M.hx - 0.65, 1.55, 0.26, 0.75, 0.25);
      // pipes: tanks up and over the roof into the chamber, with flanges and blue valves
      const pipe = (ax, ay, az, bx, by, bz, r = 0.05) => {
        B.tube(steel, ax, ay, az, bx, by, bz, r, 10);
        B.cyl(dark, ax, ay - 0.03, az, r * 1.6, 0.06, 10, true);
      };
      pipe(-M.hx - 0.82, 2.6, -1.0, -M.hx - 0.82, 3.25, -1.0);
      pipe(-M.hx - 0.82, 3.25, -1.0, -0.4, 3.25, -1.0);
      pipe(-0.4, 3.25, -1.0, -0.4, M.h + 0.16, -1.0);
      pipe(-M.hx - 0.75, 1.65, 0.55, -M.hx - 0.75, 3.05, 0.55, 0.035);
      pipe(-M.hx - 0.75, 3.05, 0.55, 0.6, 3.05, 0.55, 0.035);
      pipe(-M.hx - 0.82, 0.55, -1.0, -M.hx - 0.75, 0.45, 0.55, 0.03);
      for (const [x, y, z] of [[-M.hx - 0.82, 3.25, -1.0], [-M.hx - 0.75, 3.05, 0.55], [-1.6, 3.25, -1.0]]) {
        B.cyl('plasticDark', x, y - 0.06, z, 0.075, 0.12, 10, true);
        B.box('paintedMetal', x, y + 0.12, z, 0.2, 0.03, 0.03, 0.3);
      }
      // control console by the door
      box(dark, M.hx + 0.65, 0, 1.3, 0.8, 0.95, 0.6, 0.5);
      B.setTransform(p.x + M.hx + 0.65, p.y + 1.05, p.z + 1.3, p.ry);
      const mm = B.M.clone(); mm.multiply(new THREE.Matrix4().makeRotationX(-0.6)); B.setMatrix(mm);
      B.box(dark, 0, 0, 0, 0.8, 0.35, 0.08, 0.5);
      B.box(dmg ? 'monitorOff' : 'glowGreen', -0.12, 0.02, 0.045, 0.32, 0.2, 0.01, 0.4);
      for (let i = 0; i < 6; i++) B.box(i % 3 ? 'glowAmber' : 'glowRed', 0.16 + (i % 3) * 0.07, -0.06 + Math.floor(i / 3) * 0.08, 0.045, 0.04, 0.04, 0.01, 0.2);
      B.setTransform(p.x, p.y, p.z, p.ry);
      // cable trays along the right wall
      box('black', M.hx + t + 0.06, 0.05, 0, 0.1, 0.08, M.hz * 2, 0.5);
    },
  },
});

// ---------------------------------------------------------------- door
registerObjectKind('machineDoor', {
  build(o, game) {
    const g = new THREE.Group();
    const slide = new THREE.Group();
    const frame = game.lib.dyn('chrome');
    const glass = new THREE.Mesh(new THREE.BoxGeometry(M.door * 2 - 0.1, 2.25, 0.03), new THREE.MeshStandardMaterial({ color: 0x9ec4d0, roughness: 0.05, metalness: 0.2, transparent: true, opacity: o.damaged ? 0.18 : 0.32, depthWrite: false }));
    glass.position.y = 1.18;
    slide.add(glass);
    for (const [x, y, w, h] of [[0, 2.3, M.door * 2, 0.07], [0, 0.04, M.door * 2, 0.07], [-M.door + 0.03, 1.17, 0.06, 2.3], [M.door - 0.03, 1.17, 0.06, 2.3]]) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.07), frame);
      b.position.set(x, y, 0);
      slide.add(b);
    }
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.4, 0.08), game.lib.dyn('darkMetal'));
    handle.position.set(-M.door + 0.18, 1.05, 0.05);
    slide.add(handle);
    if (o.damaged) { const crack = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.9), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.18, depthWrite: false })); crack.position.set(0.2, 1.4, 0.02); crack.rotation.z = 0.6; slide.add(crack); }
    g.add(slide);
    g.userData.slide = slide;
    return g;
  },
  prompt(o, s) {
    const open = s?.open ?? o.startOpen;
    return o.damaged && !open ? 'The door is jammed — it is cycling open' : null;
  },
  radius: 1.0, centerY: 1.0,
  animate(mesh, o, s, dt) {
    const want = (s?.open ?? o.startOpen) ? 1 : 0;
    const k = mesh.userData.k = (mesh.userData.k ?? want) + (want - (mesh.userData.k ?? want)) * Math.min(1, dt * (o.damaged ? 1.4 : 2.6));
    mesh.userData.slide.position.x = k * (M.door * 2 + 0.05);
    if (o.damaged && want && k < 0.95) mesh.userData.slide.position.y = Math.sin(performance.now() * 0.05) * 0.008;
  },
});

// ---------------------------------------------------------------- emitter core
function labelTexture(lines, opts = {}) {
  const c = document.createElement('canvas');
  c.width = opts.w || 256; c.height = opts.h || 128;
  const g = c.getContext('2d');
  g.fillStyle = opts.bg || '#f2f2ee'; g.fillRect(0, 0, c.width, c.height);
  g.strokeStyle = '#222'; g.lineWidth = 4; g.strokeRect(2, 2, c.width - 4, c.height - 4);
  g.fillStyle = opts.fg || '#111'; g.textAlign = opts.align || 'center';
  let y = opts.top || 42;
  for (const [txt, size, bold] of lines) {
    g.font = `${bold ? 'bold ' : ''}${size}px Arial, sans-serif`;
    g.fillText(txt, opts.align === 'left' ? 14 : c.width / 2, y);
    y += size * 1.15;
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function plane(tex, w, h) {
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8 }));
}

const BEAM_MAT = () => new THREE.MeshBasicMaterial({ color: 0x5aa8ff, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false });

registerObjectKind('machineCore', {
  build(o, game) {
    const g = new THREE.Group();
    const steel = game.lib.dyn('chrome'), dark = game.lib.dyn('darkMetal');
    // conical emitter S-201 hanging from the roof
    const pts = [[0.05, 0], [0.62, 0.08], [0.66, 0.16], [0.42, 0.55], [0.2, 0.78], [0.18, 0.95]].map(([r, y]) => new THREE.Vector2(r, y));
    const cone = new THREE.Mesh(new THREE.LatheGeometry(pts, 24), steel);
    cone.position.set(0, M.h - 1.1, -0.5);
    g.add(cone);
    const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.72, 0.72, 0.1, 24), dark);
    collar.position.set(0, M.h - 1.1, -0.5);
    g.add(collar);
    const emitters = [], beams = [];
    const glow = new THREE.MeshBasicMaterial({ color: 0x8cc8ff });
    for (let i = 0; i < 6; i++) {
      const a = i / 6 * Math.PI * 2;
      const e = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), glow.clone());
      e.position.set(Math.cos(a) * 0.5, M.h - 1.16, -0.5 + Math.sin(a) * 0.5);
      g.add(e); emitters.push(e);
      const len = M.h - 1.2;
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, len, 6, 1, true), BEAM_MAT());
      b.position.set(Math.cos(a) * 0.5, len / 2 + 0.05, -0.5 + Math.sin(a) * 0.5);
      g.add(b); beams.push(b);
    }
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.035, 8, 36), glow.clone());
    ring.rotation.x = Math.PI / 2; ring.position.set(0, 0.09, -0.5);
    g.add(ring);
    const disc = new THREE.Mesh(new THREE.CircleGeometry(0.62, 32), new THREE.MeshBasicMaterial({ color: 0x3a7aff, transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false }));
    disc.rotation.x = -Math.PI / 2; disc.position.set(0, 0.08, -0.5);
    g.add(disc);
    // labels on the tanks and the protocol placard
    if (!o.compact) {
      const lab = (txt, w, h, x, y, z, ry = 0) => { const p = plane(labelTexture(txt), w, h); p.position.set(x, y, z); p.rotation.y = ry; g.add(p); };
      lab([['V-101', 40, true], ['GOAN CONCENTRATE', 18], ['RESERVOIR', 18]], 0.5, 0.25, -M.hx - 0.82, 1.6, -0.43, 0);
      lab([['V-102', 40, true], ['PHASE 1 MODULATOR', 17]], 0.36, 0.18, -M.hx - 0.75, 1.05, 0.95, 0);
      lab([['S-201', 44, true]], 0.32, 0.16, 0, M.h - 0.35, -0.12, 0);
      const placard = plane(labelTexture([['GOANING PROTOCOL', 26, true], ['PURPOSE: TO INITIATE BINDING ZONE', 15], ['ATTAINING SIMULTANEOUS COHERENCE', 15], ['AND INDUCING CONTROLLED', 15], ['TRANS-REALITY JUMP (GOANROOM', 15], ['ACCESS) AT MASS.', 15]], { w: 320, h: 200, align: 'left', top: 34 }), 1.0, 0.62);
      placard.position.set(M.hx + M.t + 0.01, 1.7, -0.6); placard.rotation.y = Math.PI / 2;
      g.add(placard);
    }
    if (o.damaged) {
      // scorched, half-detached emitter
      cone.rotation.z = 0.18; cone.position.x += 0.12;
      const scorch = new THREE.Mesh(new THREE.CircleGeometry(1.1, 20), new THREE.MeshBasicMaterial({ color: 0x050403, transparent: true, opacity: 0.55, depthWrite: false }));
      scorch.rotation.x = -Math.PI / 2; scorch.position.set(0.1, 0.075, -0.4); g.add(scorch);
    }
    g.userData = { emitters, beams, ring, disc, cone };
    return g;
  },
  prompt: () => null,
  animate(mesh, o, s, dt) {
    const U = mesh.userData;
    const mode = s?.mode || (o.damaged ? 'broken' : 'idle');
    const t = performance.now() * 0.001;
    let lvl = 0.35 + Math.sin(t * 2) * 0.08, beamOn = 0.35, color = 0x8cc8ff;
    if (mode === 'charge') { U.ch = Math.min(1, (U.ch || 0) + dt / 6); lvl = 0.5 + U.ch * 0.8 + Math.sin(t * 18) * 0.1 * U.ch; beamOn = 0.4 + U.ch * 0.6; }
    else if (mode === 'transfer') { lvl = 1.6 + Math.sin(t * 40) * 0.5; beamOn = 1; color = Math.sin(t * 25) > 0 ? 0xcfe6ff : 0x5aa8ff; }
    else if (mode === 'broken') { const sp = Math.random() < 0.04 ? 1 : 0; lvl = sp * 1.2; beamOn = sp ? 0.5 : 0; color = 0xffb080; }
    else U.ch = 0;
    for (const e of U.emitters) { e.material.color.set(color).multiplyScalar(Math.max(0.05, lvl)); }
    U.ring.material.color.set(color).multiplyScalar(Math.max(0.05, lvl * 0.9));
    U.disc.material.opacity = Math.min(0.9, 0.12 + lvl * 0.25);
    U.beams.forEach((b, i) => { b.visible = beamOn > 0.05; b.material.opacity = beamOn * (0.45 + 0.25 * Math.sin(t * 9 + i)); b.scale.x = b.scale.z = 1 + (mode === 'transfer' ? 1.6 : 0); });
    if (mode === 'transfer') U.cone.rotation.y += dt * 6; else if (mode === 'charge') U.cone.rotation.y += dt * (U.ch || 0) * 3;
  },
});

// Place a full machine (shell, seats, door, core, lights) centred at (x, z).
// Returns the seat positions in world space.
export function placeGoaningMachine(c, x, z, opts = {}) {
  addProp(c, 'goaningMachine', x, 0, z, 0, { damaged: !!opts.damaged, compact: !!opts.compact });
  const seats = [];
  for (const [sx, sz] of [[-1, -0.95], [-1, 0.75], [1, -0.95], [1, 0.75]]) {
    const cx = x + sx * (M.hx - 0.55), cz = z + sz;
    addProp(c, 'chair', cx, 0.07, cz, sx < 0 ? -Math.PI / 2 : Math.PI / 2, { mat: 'plasticDark' });
    seats.push({ x: cx + sx * -0.55, z: cz, yaw: sx < 0 ? -Math.PI / 2 : Math.PI / 2 });
  }
  const door = addObject(c, { kind: 'machineDoor', x, y: 0.07, z: z + M.hz + M.t / 2, ry: 0, startOpen: !!opts.startOpen, damaged: !!opts.damaged });
  door.collider = c.addCollider(x - M.door, 0, z + M.hz, x + M.door, 2.35, z + M.hz + M.t, false);
  if (opts.startOpen) door.collider.disabled = true;
  addObject(c, { kind: 'machineCore', x, y: 0, z, ry: 0, damaged: !!opts.damaged, compact: !!opts.compact });
  addLight(c, { x, y: M.h - 0.06, z: z - M.hz + 0.3, kind: 'none', color: opts.damaged ? [1, 0.75, 0.55] : [0.75, 0.85, 1], intensity: opts.damaged ? 2.5 : 4, range: 6, flicker: opts.damaged ? 0.7 : 0 });
  addLight(c, { x, y: 1.2, z: z - 0.5, kind: 'none', color: [0.35, 0.6, 1], intensity: opts.damaged ? 0 : 3, range: 4.5 });
  if (opts.damaged) {
    for (let k = 0; k < 4; k++) addDecal(c, { name: 'stain', x: x + (k - 1.5) * 1.1, y: 0.075, z: z - 0.4 + (k % 2) * 0.6, nx: 0, ny: 1, nz: 0, size: 1.3, rot: k });
  }
  return { seats, door, chamber: { x0: x - M.hx, x1: x + M.hx, z0: z - M.hz, z1: z + M.hz } };
}

export function inChamber(m, p) { return p.x > m.x0 && p.x < m.x1 && p.z > m.z0 && p.z < m.z1; }
