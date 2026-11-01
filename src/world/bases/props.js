// Props for bases: furniture, equipment and fortifications. Geometry is merged
// into chunk meshes like every other prop; colliders are AABBs in prop space.
import * as THREE from 'three';
import { registerProps } from '../props.js';

const box = (B, m, x, y, z, w, h, d, s = 1) => B.box(m, x, y + h / 2, z, w, h, d, s);

registerProps({
  bunkBed: {
    colliders: [[-0.48, 0, -1.0, 0.48, 1.7, 1.0]],
    build(p, B) {
      const f = p.frame || 'darkMetal';
      for (const sx of [-0.45, 0.45]) for (const sz of [-0.97, 0.97]) box(B, f, sx, 0, sz, 0.05, 1.75, 0.05, 0.3);
      for (const y of [0.32, 1.22]) {
        box(B, f, 0, y, 0, 0.95, 0.05, 1.95, 0.4);
        box(B, p.mat || 'mattress', 0, y + 0.05, 0, 0.86, 0.12, 1.85, 0.5);
        box(B, 'sheetWhite', 0, y + 0.17, -0.72, 0.5, 0.08, 0.3, 0.5);
        box(B, p.blanket || 'olive', 0.0, y + 0.17, 0.25, 0.88, 0.04, 1.2, 0.5);
      }
    },
  },
  cot: {
    colliders: [[-0.42, 0, -0.95, 0.42, 0.5, 0.95]],
    navBlock: false,
    build(p, B) {
      for (const sx of [-0.4, 0.4]) B.tube('darkMetal', sx, 0.38, -0.92, sx, 0.38, 0.92, 0.02, 5);
      for (const sz of [-0.85, 0.85]) { B.tube('darkMetal', -0.4, 0.38, sz, 0.4, 0.02, sz, 0.015, 4); B.tube('darkMetal', 0.4, 0.38, sz, -0.4, 0.02, sz, 0.015, 4); }
      box(B, p.mat || 'canvasTan', 0, 0.36, 0, 0.82, 0.04, 1.84, 0.5);
      box(B, p.blanket || 'olive', 0, 0.4, 0.3, 0.8, 0.05, 1.0, 0.5);
    },
  },
  bedroll: {
    colliders: null,
    build(p, B) { box(B, p.mat || 'teal', 0, 0, 0, 0.75, 0.06, 1.8, 0.5); B.cyl(p.mat2 || 'canvasTan', -0.0, 0.06, -0.78, 0.12, 0.6, 10, true); },
  },
  footLocker: {
    colliders: [[-0.4, 0, -0.22, 0.4, 0.45, 0.22]],
    build(p, B) { box(B, 'olive', 0, 0, 0, 0.8, 0.42, 0.44, 0.5); box(B, 'darkMetal', 0, 0.42, 0, 0.82, 0.03, 0.46, 0.4); box(B, 'chrome', 0, 0.3, 0.225, 0.08, 0.06, 0.01, 0.2); },
  },
  longTable: {
    colliders: p => [[-(p.len || 3) / 2, 0, -0.45, (p.len || 3) / 2, 0.78, 0.45]],
    build(p, B) {
      const len = p.len || 3;
      box(B, p.mat || 'laminate', 0, 0.72, 0, len, 0.05, 0.9, 1);
      for (const sx of [-len / 2 + 0.12, len / 2 - 0.12]) for (const sz of [-0.36, 0.36]) box(B, 'darkMetal', sx, 0, sz, 0.05, 0.72, 0.05, 0.3);
    },
  },
  gunRack: {
    colliders: [[-0.9, 0, -0.2, 0.9, 1.8, 0.2]],
    build(p, B) {
      box(B, 'rqBlack', 0, 0, -0.12, 1.8, 1.8, 0.08, 0.5);
      box(B, 'darkWood', 0, 0.2, 0.0, 1.76, 0.08, 0.3, 0.5);
      box(B, 'darkWood', 0, 1.2, 0.02, 1.76, 0.06, 0.12, 0.5);
      for (let k = 0; k < 6; k++) box(B, 'black', -0.75 + k * 0.3, 1.26, 0.06, 0.04, 0.08, 0.06, 0.3);
      if (p.red !== false) box(B, 'rqRed', 0, 1.55, -0.07, 1.8, 0.12, 0.02, 0.5);
    },
  },
  armorStand: {
    colliders: [[-0.25, 0, -0.25, 0.25, 1.8, 0.25]],
    build(p, B) {
      B.cyl('darkMetal', 0, 0, 0, 0.22, 0.04, 12, true);
      B.cyl('darkMetal', 0, 0.04, 0, 0.025, 1.1, 6, false);
      box(B, p.mat || 'rqBlack', 0, 1.1, 0, 0.42, 0.45, 0.24, 0.5);
      B.cyl(p.helm || 'olive', 0, 1.62, 0, 0.14, 0.14, 12, true, 0.1);
      B.cyl('darkMetal', 0, 1.5, 0, 0.03, 0.12, 6, false);
    },
  },
  ammoCrates: {
    colliders: [[-0.6, 0, -0.35, 0.6, 0.9, 0.35]],
    build(p, B) {
      box(B, 'olive', -0.28, 0, 0, 0.55, 0.32, 0.6, 0.5); box(B, 'olive', 0.3, 0, 0.02, 0.55, 0.32, 0.6, 0.5); box(B, 'olive', 0.0, 0.32, -0.02, 0.55, 0.32, 0.6, 0.5);
      box(B, p.band || 'rqRed', -0.28, 0.2, 0.301, 0.4, 0.05, 0.005, 0.2); box(B, p.band || 'rqRed', 0.0, 0.52, 0.281, 0.4, 0.05, 0.005, 0.2);
    },
  },
  radioDesk: {
    colliders: [[-0.8, 0, -0.38, 0.8, 1.3, 0.38]],
    build(p, B) {
      box(B, 'darkMetal', 0, 0.72, 0, 1.6, 0.05, 0.75, 0.5);
      for (const sx of [-0.75, 0.75]) box(B, 'darkMetal', sx, 0, 0, 0.05, 0.72, 0.7, 0.3);
      box(B, 'olive', -0.35, 0.77, -0.15, 0.6, 0.32, 0.38, 0.5);                 // radio set
      for (let k = 0; k < 4; k++) B.cyl('black', -0.55 + k * 0.12, 0.85, 0.045, 0.025, 0.02, 8, true);
      box(B, 'glowAmber', -0.2, 0.98, 0.041, 0.2, 0.06, 0.005, 0.2);               // dial window
      box(B, 'glowGreen', -0.45, 1.0, 0.041, 0.04, 0.02, 0.005, 0.2);
      box(B, 'black', 0.3, 0.77, 0.05, 0.08, 0.02, 0.08, 0.2); B.tube('black', 0.3, 0.79, 0.05, 0.36, 0.95, 0.02, 0.008, 4); // mic
      box(B, 'paper', 0.45, 0.775, -0.1, 0.4, 0.005, 0.3, 0.3);                     // map
      B.tube('darkMetal', 0.7, 0.77, -0.3, 0.7, 2.4, -0.3, 0.015, 5);               // antenna lead
    },
  },
  antennaMast: {
    colliders: [[-0.15, 0, -0.15, 0.15, 3, 0.15]],
    build(p, B) {
      const h = p.h || 3.4;
      for (const [x, z] of [[-0.1, -0.1], [0.1, -0.1], [0, 0.1]]) B.tube('darkMetal', x, 0, z, 0, h, 0, 0.012, 4);
      for (let y = 0.5; y < h; y += 0.5) B.tube('darkMetal', -0.1, y, -0.1, 0.1, y + 0.25, -0.1, 0.006, 3);
      for (const y of [h - 0.6, h - 0.2]) B.tube('darkMetal', -0.45, y, 0, 0.45, y, 0, 0.01, 4);
      box(B, 'glowRed', 0, h, 0, 0.06, 0.06, 0.06, 0.2);
    },
  },
  serverRack: {
    colliders: [[-0.32, 0, -0.42, 0.32, 2.0, 0.42]],
    build(p, B) {
      box(B, 'rqBlack', 0, 0, 0, 0.62, 2.0, 0.82, 0.5);
      for (let k = 0; k < 9; k++) { box(B, 'darkMetal', 0, 0.12 + k * 0.2, 0.411, 0.56, 0.14, 0.01, 0.2); box(B, k % 3 ? 'glowGreen' : 'glowAmber', -0.2 + (k % 4) * 0.05, 0.17 + k * 0.2, 0.417, 0.015, 0.015, 0.005, 0.1); }
    },
  },
  labTable: {
    colliders: [[-0.9, 0, -0.4, 0.9, 0.95, 0.4]],
    build(p, B, rng) {
      box(B, 'sheetWhite', 0, 0, 0, 1.8, 0.88, 0.8, 0.5);
      box(B, 'black', 0, 0.88, 0, 1.84, 0.04, 0.84, 0.5);
      const r = () => (rng ? rng.next() : 0.5);
      for (let k = 0; k < 5; k++) { const x = -0.7 + k * 0.33, h = 0.1 + r() * 0.15; B.cyl(r() < 0.4 ? 'labGreen' : 'glass', x, 0.92, (r() - 0.5) * 0.4, 0.035 + r() * 0.03, h, 10, true); }
      box(B, 'darkMetal', 0.55, 0.92, -0.25, 0.3, 0.3, 0.22, 0.4);                  // microscope base
      B.tube('darkMetal', 0.55, 1.22, -0.25, 0.55, 1.4, -0.15, 0.025, 6);
    },
  },
  specimenTank: {
    colliders: [[-0.45, 0, -0.45, 0.45, 2.2, 0.45]],
    build(p, B) {
      B.cyl('darkMetal', 0, 0, 0, 0.45, 0.25, 16, true);
      B.cyl('labGreen', 0, 0.25, 0, 0.38, 1.6, 16, false);
      B.cyl('darkMetal', 0, 1.85, 0, 0.45, 0.3, 16, true);
      for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2; B.tube('darkMetal', Math.cos(a) * 0.42, 0.25, Math.sin(a) * 0.42, Math.cos(a) * 0.42, 1.85, Math.sin(a) * 0.42, 0.025, 5); }
      if (p.thing) { B.cyl('black', 0, 0.6, 0, 0.12, 0.7, 8, true, 0.08); B.cyl('black', 0, 1.3, 0, 0.1, 0.18, 8, true); }
    },
  },
  hospitalBed: {
    colliders: [[-0.48, 0, -1.05, 0.48, 0.75, 1.05]],
    build(p, B) {
      box(B, 'chrome', 0, 0.45, 0, 0.92, 0.06, 2.0, 0.4);
      for (const sx of [-0.42, 0.42]) for (const sz of [-0.95, 0.95]) box(B, 'chrome', sx, 0, sz, 0.04, 0.45, 0.04, 0.3);
      box(B, 'sheetWhite', 0, 0.51, 0.05, 0.86, 0.14, 1.85, 0.5);
      box(B, 'sheetWhite', 0, 0.65, -0.75, 0.5, 0.1, 0.32, 0.5);
      box(B, 'chrome', 0, 0.45, -1.0, 0.9, 0.5, 0.04, 0.4);
    },
  },
  ivStand: {
    colliders: null,
    build(p, B) {
      B.cyl('chrome', 0, 0, 0, 0.2, 0.03, 8, true); B.cyl('chrome', 0, 0, 0, 0.012, 1.8, 6, false);
      B.tube('chrome', -0.15, 1.75, 0, 0.15, 1.75, 0, 0.01, 4);
      box(B, 'glass', 0.12, 1.5, 0, 0.1, 0.18, 0.04, 0.2);
    },
  },
  stove: {
    colliders: [[-0.45, 0, -0.35, 0.45, 0.95, 0.35]],
    build(p, B) {
      box(B, 'paintedMetal', 0, 0, 0, 0.9, 0.9, 0.7, 0.5);
      for (const [x, z] of [[-0.2, -0.15], [0.2, -0.15], [-0.2, 0.15], [0.2, 0.15]]) B.cyl('black', x, 0.9, z, 0.1, 0.02, 10, true);
      box(B, 'darkMetal', 0, 0.2, 0.352, 0.7, 0.45, 0.01, 0.3);
      B.cyl('darkMetal', 0.2, 0.92, -0.15, 0.13, 0.18, 10, true);                   // pot
    },
  },
  foodCrates: {
    colliders: [[-0.55, 0, -0.35, 0.55, 0.9, 0.35]],
    build(p, B) { box(B, 'woodCrate', -0.27, 0, 0, 0.52, 0.45, 0.6, 0.5); box(B, 'woodCrate', 0.28, 0, 0, 0.52, 0.45, 0.6, 0.5); box(B, 'cardboard', 0, 0.45, 0, 0.5, 0.4, 0.5, 0.5); },
  },
  sandbags: {
    colliders: p => [[-(p.len || 2) / 2, 0, -0.32, (p.len || 2) / 2, 0.95, 0.32]],
    build(p, B) {
      const len = p.len || 2;
      for (let row = 0; row < 3; row++) for (let x = -len / 2 + 0.3 + (row % 2) * 0.25; x < len / 2 - 0.2; x += 0.5) {
        const g = new THREE.SphereGeometry(0.28, 8, 6); g.scale(1, 0.55, 1.15);
        B.geometry('sandbag', g, new THREE.Matrix4().makeTranslation(x, 0.15 + row * 0.3, 0));
      }
    },
  },
  // a raised watch platform: stairs up one side, railings, sandbags and a lamp
  watchPost: {
    colliders: p => {
      const h = p.h || 1.4, out = [[-1.4, h - 0.2, -1.4, 1.4, h, 1.4]];
      for (let k = 0; k < 6; k++) out.push([1.4 + k * 0.3, 0, -0.5, 1.4 + (k + 1) * 0.3, (6 - k) * h / 6, 0.5]);
      out.push([-1.45, h, -1.45, 1.45, h + 1.0, -1.35], [-1.45, h, 1.35, 1.45, h + 1.0, 1.45], [-1.45, h, -1.45, -1.35, h + 1.0, 1.45], [1.35, h, -1.45, 1.45, h + 1.0, -0.55], [1.35, h, 0.55, 1.45, h + 1.0, 1.45]);
      return out;
    },
    build(p, B) {
      const h = p.h || 1.4, m = p.mat || 'darkWood';
      box(B, m, 0, h - 0.2, 0, 2.8, 0.2, 2.8, 1);
      for (const [x, z] of [[-1.3, -1.3], [1.3, -1.3], [-1.3, 1.3], [1.3, 1.3]]) box(B, m, x, 0, z, 0.15, h + 1.0, 0.15, 0.5);
      for (let k = 0; k < 6; k++) box(B, m, 1.55 + k * 0.3, 0, 0, 0.3, (6 - k) * h / 6, 1.0, 0.5);
      for (const z of [-1.4, 1.4]) { box(B, m, 0, h + 0.95, z, 2.8, 0.06, 0.06, 0.5); box(B, m, 0, h + 0.5, z, 2.8, 0.05, 0.05, 0.5); }
      for (const [x, z0, z1] of [[-1.4, -1.4, 1.4], [1.4, -1.4, -0.5], [1.4, 0.5, 1.4]]) { box(B, m, x, h + 0.95, (z0 + z1) / 2, 0.06, 0.06, z1 - z0, 0.5); box(B, m, x, h + 0.5, (z0 + z1) / 2, 0.05, 0.05, z1 - z0, 0.5); }
      for (let k = 0; k < 3; k++) { const g = new THREE.SphereGeometry(0.26, 8, 6); g.scale(1.1, 0.55, 1.0); B.geometry('sandbag', g, new THREE.Matrix4().makeTranslation(-0.8 + k * 0.6, h + 0.14, -1.15)); }
      B.tube('darkMetal', -1.3, h + 1.0, -1.3, -1.0, h + 1.5, -1.0, 0.02, 4);
    },
  },
  cellBars: {
    colliders: p => [[-(p.len || 2) / 2, 0, -0.05, (p.len || 2) / 2, 2.6, 0.05]],
    build(p, B) {
      const len = p.len || 2;
      for (let x = -len / 2 + 0.06; x <= len / 2; x += 0.14) B.cyl('darkMetal', x, 0, 0, 0.012, 2.6, 5, false);
      for (const y of [0.1, 1.2, 2.5]) box(B, 'darkMetal', 0, y, 0, len, 0.05, 0.06, 0.3);
    },
  },
  pingPong: {
    colliders: [[-1.4, 0, -0.78, 1.4, 0.78, 0.78]],
    build(p, B) {
      box(B, 'olive', 0, 0.7, 0, 2.74, 0.04, 1.52, 1);
      box(B, 'sheetWhite', 0, 0.741, 0, 0.02, 0.002, 1.52, 0.2);
      box(B, 'sheetWhite', 0, 0.74, 0, 0.02, 0.15, 1.6, 0.2);
      for (const sx of [-1.2, 1.2]) for (const sz of [-0.65, 0.65]) box(B, 'darkMetal', sx, 0, sz, 0.05, 0.7, 0.05, 0.3);
    },
  },
  tvSet: {
    colliders: [[-0.4, 0, -0.3, 0.4, 1.2, 0.3]],
    build(p, B) { box(B, 'darkWood', 0, 0, 0, 0.8, 0.55, 0.55, 0.5); box(B, 'plasticDark', 0, 0.55, -0.02, 0.62, 0.5, 0.5, 0.5); box(B, p.screen || 'screenBlue', 0, 0.62, 0.231, 0.5, 0.36, 0.005, 0.3); },
  },
  candles: {
    colliders: null,
    build(p, B, rng) {
      const r = () => (rng ? rng.next() : 0.5);
      for (let k = 0; k < 6; k++) { const a = k * 1.05, d = 0.15 + r() * 0.2; B.cyl('candle', Math.cos(a) * d, 0, Math.sin(a) * d, 0.025, 0.06 + r() * 0.12, 6, true); }
    },
  },
  rug: {
    colliders: null,
    build(p, B) { box(B, p.mat || 'teal', 0, 0, 0, p.w || 2, 0.01, p.d || 1.4, 0.5); box(B, p.mat2 || 'canvasTan', 0, 0.002, 0, (p.w || 2) * 0.8, 0.01, (p.d || 1.4) * 0.7, 0.5); },
  },
  stall: {
    // a wanderer's trade table under a canvas awning
    colliders: [[-1.0, 0, -0.35, 1.0, 0.8, 0.35]],
    build(p, B) {
      box(B, 'darkWood', 0, 0.7, 0, 2.0, 0.06, 0.7, 0.5);
      for (const sx of [-0.92, 0.92]) for (const sz of [-0.3, 0.3]) box(B, 'darkWood', sx, 0, sz, 0.06, 0.7, 0.06, 0.3);
      for (const sx of [-1.0, 1.0]) B.tube('darkWood', sx, 0, -0.35, sx, 2.1, -0.35, 0.03, 5);
      B.quad('teal', [-1.1, 2.1, -0.4], [1.1, 2.1, -0.4], [1.1, 1.8, 0.7], [-1.1, 1.8, 0.7], [0, 1, 0.3]);
      B.quad('teal', [-1.1, 1.8, 0.7], [1.1, 1.8, 0.7], [1.1, 2.1, -0.4], [-1.1, 2.1, -0.4], [0, -1, -0.3]);
      for (let k = 0; k < 4; k++) box(B, k % 2 ? 'cardboard' : 'canvasTan', -0.7 + k * 0.45, 0.76, 0, 0.3, 0.12, 0.3, 0.3);
    },
  },
  fuelDrums: {
    colliders: [[-0.7, 0, -0.35, 0.7, 0.95, 0.35]],
    build(p, B) { for (const x of [-0.35, 0.35]) { B.cyl(p.mat || 'rqRed', x, 0, 0, 0.3, 0.9, 12, true); for (const y of [0.25, 0.65]) B.cyl('darkMetal', x, y, 0, 0.305, 0.03, 12, false); } },
  },
  powerCables: {
    colliders: null,
    build(p, B) { const len = p.len || 3; for (let k = 0; k < 3; k++) B.tube('black', -len / 2, 0.03 + k * 0.01, -0.1 + k * 0.09, len / 2, 0.03, -0.12 + k * 0.1, 0.02, 4); },
  },
  waterTanks: {
    colliders: [[-1.0, 0, -0.55, 1.0, 2.2, 0.55]],
    build(p, B) { for (const x of [-0.5, 0.5]) { B.cyl('paintedMetal', x, 0, 0, 0.48, 2.1, 14, true); B.cyl('darkMetal', x, 2.1, 0, 0.1, 0.12, 8, true); } B.tube('darkMetal', -0.5, 0.3, 0.45, 0.5, 0.3, 0.45, 0.04, 6); },
  },
  mapBoard: {
    colliders: null,
    build(p, B) { box(B, 'darkWood', 0, 1.0, 0.02, 1.6, 1.0, 0.04, 0.5); box(B, 'paper', 0, 1.06, 0.045, 1.45, 0.86, 0.005, 0.5); for (let k = 0; k < 6; k++) box(B, k % 2 ? 'rqRed' : 'black', -0.5 + k * 0.2, 1.2 + Math.sin(k) * 0.2, 0.05, 0.03, 0.03, 0.01, 0.1); },
  },
  brokenFurniture: {
    colliders: null,
    navBlock: false,
    build(p, B, rng) {
      const r = () => (rng ? rng.next() : 0.5);
      for (let k = 0; k < 6; k++) { const a = r() * 6.28, d = r() * 0.8; box(B, r() < 0.5 ? 'darkWood' : 'darkMetal', Math.cos(a) * d, 0, Math.sin(a) * d, 0.1 + r() * 0.6, 0.04 + r() * 0.06, 0.05 + r() * 0.3, 0.3); }
    },
  },
});
