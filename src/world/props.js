// Prop library. Each prop kind defines collision boxes (local space, before
// yaw) and a build function that emits geometry through a GeoBuilder.
// Generators call addProp() which records the prop and its colliders.

export const PROP_DEFS = {};

export function registerProps(defs) { Object.assign(PROP_DEFS, defs); }

// Rotate a local AABB by yaw (snapped to 90°) and translate.
function placeBox(b, x, y, z, ry) {
  const q = ((Math.round(ry / (Math.PI / 2)) % 4) + 4) % 4;
  let [x0, y0, z0, x1, y1, z1] = b;
  let rx0, rz0, rx1, rz1;
  if (q === 0) { rx0 = x0; rz0 = z0; rx1 = x1; rz1 = z1; }
  else if (q === 1) { rx0 = z0; rz0 = -x1; rx1 = z1; rz1 = -x0; }
  else if (q === 2) { rx0 = -x1; rz0 = -z1; rx1 = -x0; rz1 = -z0; }
  else { rx0 = -z1; rz0 = x0; rx1 = -z0; rz1 = x1; }
  return [x + rx0, y + y0, z + rz0, x + rx1, y + y1, z + rz1];
}

export function addProp(c, kind, x, y, z, ry = 0, extra = {}) {
  const def = PROP_DEFS[kind];
  if (!def) { console.warn('unknown prop', kind); return null; }
  const p = { kind, x, y, z, ry, ...extra };
  c.props.push(p);
  const boxes = typeof def.colliders === 'function' ? def.colliders(p) : def.colliders;
  if (boxes) for (const b of boxes) {
    const w = placeBox(b, x, y, z, ry);
    const col = c.addCollider(w[0], w[1], w[2], w[3], w[4], w[5], def.navBlock !== false);
    if (def.thin) col.thin = true;
  }
  return p;
}

// helpers
const box = (B, m, x, y, z, sx, sy, sz, uv = 1) => B.box(m, x, y + sy / 2, z, sx, sy, sz, uv);

registerProps({
  // ---------------------------------------------------------------- generic
  crate: {
    colliders: p => { const s = p.s || 1; return [[-s / 2, 0, -s / 2, s / 2, s, s / 2]]; },
    build(p, B) {
      const s = p.s || 1;
      box(B, 'woodCrate', 0, 0, 0, s, s, s, s);
      // edge battens
      const t = 0.06 * s;
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(B, 'woodCrate', sx * (s / 2 - t / 2 + 0.005), 0, sz * (s / 2 - t / 2 + 0.005), t + 0.01, s, t + 0.01, 0.5);
      if (p.stack) box(B, 'woodCrate', 0.05, s, -0.04, s * 0.8, s * 0.8, s * 0.8, s);
    },
  },
  boxes: {
    colliders: [[-0.45, 0, -0.35, 0.45, 0.85, 0.35]],
    build(p, B) {
      box(B, 'cardboard', -0.15, 0, 0, 0.55, 0.42, 0.6, 0.6);
      box(B, 'cardboard', 0.25, 0, 0.05, 0.42, 0.36, 0.42, 0.5);
      B.setTransform(p.x, p.y + 0.42, p.z, p.ry + 0.3);
      box(B, 'cardboard', -0.1, 0, 0, 0.48, 0.4, 0.45, 0.5);
    },
  },
  barrel: {
    colliders: [[-0.35, 0, -0.35, 0.35, 1.0, 0.35]],
    build(p, B) {
      B.cyl(p.mat || 'rustMetal', 0, 0, 0, 0.33, 1.0, 14, true, 0.33, 1);
      for (const y of [0.18, 0.82]) B.cyl('darkMetal', 0, y, 0, 0.345, 0.04, 14, false);
    },
  },
  pillar: {
    colliders: p => { const w = p.w || 0.8; return [[-w / 2, 0, -w / 2, w / 2, p.h || 3, w / 2]]; },
    build(p, B) {
      const w = p.w || 0.8, h = p.h || 3;
      box(B, p.mat || 'pillarPaint', 0, 0, 0, w, h, w, 1.5);
      if (p.trim) box(B, p.trim, 0, 0, 0, w + 0.04, 0.12, w + 0.04, 0.5);
    },
  },
  pipeRun: {
    // pipes along local X at ceiling height, length p.len
    colliders: null,
    build(p, B) {
      const len = p.len || 2, n = p.n || 2;
      for (let k = 0; k < n; k++) {
        const r = 0.05 + (k % 3) * 0.03;
        const zz = k * 0.22, yy = -0.15 - (k % 2) * 0.12;
        B.tube(p.mat || 'rustMetal', -len / 2, yy, zz, len / 2, yy, zz, r, 8, 1);
        // brackets
        for (let x = -len / 2 + 0.4; x < len / 2; x += 1.4) box(B, 'darkMetal', x, yy - r - 0.02, zz, 0.05, r * 2 + 0.2, 0.06, 0.3);
      }
    },
  },
  pipeV: {
    colliders: [[-0.15, 0, -0.15, 0.15, 6, 0.15]],
    build(p, B) {
      const h = p.h || 3;
      B.cyl(p.mat || 'rustMetal', 0, 0, 0, 0.1, h, 10, false);
      for (let y = 0.5; y < h; y += 1.2) B.cyl('darkMetal', 0, y, 0, 0.12, 0.06, 10, false);
    },
  },
  shelf: {
    colliders: [[-0.9, 0, -0.25, 0.9, 2.0, 0.25]],
    build(p, B, rng) {
      for (const sx of [-0.88, 0.88]) for (const sz of [-0.22, 0.22]) box(B, 'darkMetal', sx, 0, sz, 0.04, 2.0, 0.04, 0.5);
      for (const y of [0.1, 0.6, 1.1, 1.6, 1.98]) {
        box(B, 'paintedMetal', 0, y, 0, 1.8, 0.03, 0.5, 1);
        if (y < 1.9 && rng) {
          let x = -0.8;
          while (x < 0.7) {
            const w = 0.2 + rng.next() * 0.35;
            if (rng.next() < 0.7) {
              const h = 0.15 + rng.next() * 0.3;
              box(B, rng.next() < 0.5 ? 'cardboard' : 'woodCrate', x + w / 2, y + 0.03, (rng.next() - 0.5) * 0.15, w * 0.9, h, 0.35, 0.5);
            }
            x += w + 0.05;
          }
        }
      }
    },
  },
  table: {
    colliders: [[-0.8, 0, -0.45, 0.8, 0.78, 0.45]],
    navBlock: true,
    build(p, B) {
      box(B, p.top || 'laminate', 0, 0.74, 0, 1.6, 0.04, 0.9, 1);
      for (const sx of [-0.74, 0.74]) for (const sz of [-0.38, 0.38]) box(B, 'darkMetal', sx, 0, sz, 0.05, 0.74, 0.05, 0.5);
    },
  },
  desk: {
    colliders: [[-0.75, 0, -0.38, 0.75, 0.78, 0.38]],
    build(p, B, rng) {
      box(B, 'laminate', 0, 0.73, 0, 1.5, 0.05, 0.76, 1);
      box(B, 'laminate', -0.72, 0, 0, 0.04, 0.73, 0.74, 1);
      box(B, 'laminate', 0.5, 0, 0, 0.46, 0.73, 0.72, 1); // drawers
      for (const y of [0.15, 0.4, 0.6]) box(B, 'darkMetal', 0.5, y, 0.365, 0.12, 0.02, 0.01, 0.2);
      box(B, 'laminate', 0, 0.25, -0.36, 1.4, 0.48, 0.02, 1);
      if (p.monitor) {
        box(B, 'plasticDark', -0.15, 0.78, -0.12, 0.2, 0.02, 0.16, 0.3);
        box(B, 'plasticDark', -0.15, 0.8, -0.12, 0.04, 0.2, 0.04, 0.3);
        box(B, 'plastic', -0.15, 0.95, -0.12, 0.52, 0.36, 0.06, 0.5);
        box(B, 'monitorOff', -0.15, 0.98, -0.088, 0.46, 0.3, 0.005, 0.5);
        box(B, 'plastic', -0.1, 0.78, 0.12, 0.44, 0.02, 0.14, 0.3);
      }
      if (p.papers && rng) for (let k = 0; k < 4; k++) {
        B.setTransform(p.x, p.y, p.z, p.ry);
        box(B, 'paper', 0.2 + (rng.next() - 0.5) * 0.6, 0.755 + k * 0.004, 0.1 + (rng.next() - 0.5) * 0.3, 0.21, 0.003, 0.29, 0.3);
      }
    },
  },
  officeChair: {
    colliders: [[-0.28, 0, -0.28, 0.28, 0.5, 0.28]],
    navBlock: false,
    build(p, B) {
      for (let k = 0; k < 5; k++) {
        const a = (k / 5) * Math.PI * 2;
        B.tube('plasticDark', 0, 0.06, 0, Math.cos(a) * 0.3, 0.04, Math.sin(a) * 0.3, 0.02, 5);
      }
      B.cyl('chrome', 0, 0.06, 0, 0.025, 0.38, 8, false);
      box(B, 'fabric', 0, 0.44, 0, 0.48, 0.08, 0.46, 0.5);
      box(B, 'fabric', 0, 0.55, 0.22, 0.44, 0.5, 0.06, 0.5);
      box(B, 'plasticDark', 0, 0.44, 0.2, 0.06, 0.15, 0.04, 0.3);
    },
  },
  chair: {
    colliders: [[-0.24, 0, -0.24, 0.24, 0.48, 0.24]],
    navBlock: false,
    build(p, B) {
      for (const sx of [-0.2, 0.2]) for (const sz of [-0.2, 0.2]) box(B, 'darkMetal', sx, 0, sz, 0.03, 0.45, 0.03, 0.3);
      box(B, p.mat || 'plastic', 0, 0.45, 0, 0.46, 0.04, 0.46, 0.5);
      box(B, p.mat || 'plastic', 0, 0.48, 0.21, 0.44, 0.45, 0.03, 0.5);
      for (const sx of [-0.2, 0.2]) box(B, 'darkMetal', sx, 0.45, 0.21, 0.03, 0.45, 0.03, 0.3);
    },
  },
  fallenChair: {
    colliders: [[-0.35, 0, -0.35, 0.35, 0.5, 0.35]],
    navBlock: false,
    build(p, B) {
      B.setTransform(p.x, p.y + 0.24, p.z, p.ry);
      const m = B.M.clone();
      const r = new (m.constructor)().makeRotationX(Math.PI / 2);
      B.setMatrix(m.multiply(r));
      for (const sx of [-0.2, 0.2]) for (const sz of [-0.2, 0.2]) box(B, 'darkMetal', sx, -0.22, sz, 0.03, 0.45, 0.03, 0.3);
      box(B, 'plastic', 0, 0.23, 0, 0.46, 0.04, 0.46, 0.5);
    },
  },
  cabinet: {
    colliders: [[-0.24, 0, -0.32, 0.24, 1.32, 0.32]],
    build(p, B) {
      box(B, p.mat || 'paintedMetal', 0, 0, 0, 0.47, 1.32, 0.62, 1);
      for (let k = 0; k < 4; k++) {
        box(B, 'darkMetal', 0, 0.08 + k * 0.32, 0.312, 0.43, 0.005, 0.005, 0.2);
        box(B, 'chrome', 0, 0.22 + k * 0.32, 0.32, 0.12, 0.025, 0.02, 0.2);
      }
    },
  },
  locker: {
    // decorative locker bank segment (interactive lockers are objects)
    colliders: [[-0.3, 0, -0.25, 0.3, 1.9, 0.25]],
    build(p, B) {
      box(B, 'paintedMetal', 0, 0, 0, 0.58, 1.9, 0.48, 1);
      for (let k = 0; k < 4; k++) box(B, 'darkMetal', -0.15, 1.45 + k * 0.05, 0.242, 0.18, 0.012, 0.005, 0.2);
      box(B, 'darkMetal', 0.2, 1.0, 0.245, 0.03, 0.12, 0.02, 0.2);
    },
  },
  sofa: {
    colliders: [[-1.0, 0, -0.45, 1.0, 0.8, 0.45]],
    build(p, B) {
      const m = p.mat || 'fabric';
      box(B, m, 0, 0.12, 0, 2.0, 0.32, 0.9, 1);
      box(B, m, 0, 0.12, 0.33, 2.0, 0.7, 0.24, 1);
      for (const sx of [-0.92, 0.92]) box(B, m, sx, 0.12, 0, 0.18, 0.5, 0.9, 1);
      for (const sx of [-0.45, 0.45]) box(B, m, sx, 0.44, -0.05, 0.86, 0.12, 0.7, 1);
      for (const sx of [-0.9, 0.9]) for (const sz of [-0.38, 0.38]) box(B, 'darkMetal', sx, 0, sz, 0.05, 0.12, 0.05, 0.2);
    },
  },
  plant: {
    colliders: [[-0.22, 0, -0.22, 0.22, 0.9, 0.22]],
    navBlock: false,
    build(p, B, rng) {
      B.cyl('plasticDark', 0, 0, 0, 0.17, 0.4, 10, true, 0.22);
      for (let k = 0; k < 7; k++) {
        const a = (k / 7) * Math.PI * 2 + (rng ? rng.next() : 0);
        const len = 0.3 + (rng ? rng.next() * 0.4 : 0.2);
        B.tube('trim', 0, 0.38, 0, Math.cos(a) * 0.25, 0.4 + len, Math.sin(a) * 0.25, 0.012, 4);
        box(B, 'cardboard', Math.cos(a) * 0.27, 0.4 + len, Math.sin(a) * 0.27, 0.1, 0.02, 0.06, 0.3);
      }
    },
  },
  waterCooler: {
    colliders: [[-0.2, 0, -0.2, 0.2, 1.4, 0.2]],
    build(p, B) {
      box(B, 'plastic', 0, 0, 0, 0.32, 1.0, 0.32, 0.5);
      box(B, 'plasticDark', 0, 0.75, 0.165, 0.18, 0.12, 0.02, 0.3);
      B.cyl('glass', 0, 1.0, 0, 0.14, 0.4, 12, true);
    },
  },
  paperPile: {
    colliders: null,
    build(p, B, rng) {
      for (let k = 0; k < 9; k++) {
        const r = rng ? rng.next() : k / 9;
        B.setTransform(p.x + (r - 0.5) * 0.9, p.y, p.z + ((rng ? rng.next() : 0.5) - 0.5) * 0.9, r * 6);
        box(B, 'paper', 0, 0.002 + k * 0.002, 0, 0.21, 0.002, 0.29, 0.3);
      }
    },
  },
  vent: {
    // wall vent: flush with a wall, local -z is the wall
    colliders: null,
    build(p, B) {
      box(B, 'darkMetal', 0, -0.25, 0, 0.6, 0.5, 0.04, 0.5);
      for (let k = 0; k < 6; k++) box(B, 'black', 0, -0.2 + k * 0.07 - 0.25 + 0.06, 0.015, 0.52, 0.03, 0.02, 0.5);
    },
  },
  machine: {
    colliders: p => [[-(p.w || 1.6) / 2, 0, -0.6, (p.w || 1.6) / 2, 1.6, 0.6]],
    build(p, B, rng) {
      const w = p.w || 1.6;
      box(B, 'paintedMetal', 0, 0, 0, w, 1.3, 1.2, 1);
      box(B, 'darkMetal', 0, 1.3, 0, w * 0.9, 0.3, 1.0, 1);
      box(B, 'hazard', 0, 0, 0.605, w, 0.12, 0.01, 0.5);
      // gauges and panel
      box(B, 'darkMetal', -w * 0.25, 0.7, 0.61, w * 0.35, 0.45, 0.02, 0.3);
      for (let k = 0; k < 3; k++) {
        B.setTransform(p.x, p.y, p.z, p.ry);
        const gx = -w * 0.25 - 0.1 + k * 0.1;
        box(B, k === 1 ? 'glowAmber' : 'glowGreen', gx, 1.0, 0.625, 0.04, 0.04, 0.01, 0.1);
      }
      B.setTransform(p.x, p.y, p.z, p.ry);
      B.tube('rustMetal', w * 0.3, 1.3, 0.2, w * 0.3, 2.6, 0.2, 0.09, 8);
      B.tube('rustMetal', -w * 0.4, 1.0, -0.4, -w * 0.4, 2.6, -0.4, 0.06, 8);
      // wheel valve
      B.cyl('glowRed', w * 0.3, 0.6, 0.62, 0.02, 0.02, 6, true);
    },
  },
  tank: {
    colliders: [[-0.8, 0, -0.8, 0.8, 2.4, 0.8]],
    build(p, B) {
      B.cyl('rustMetal', 0, 0.2, 0, 0.75, 2.0, 18, true, 0.75, 1.5);
      for (const [sx, sz] of [[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5]]) box(B, 'darkMetal', sx, 0, sz, 0.1, 0.25, 0.1, 0.3);
      for (const y of [0.6, 1.4, 2.0]) B.cyl('darkMetal', 0, y, 0, 0.77, 0.05, 18, false);
      B.tube('rustMetal', 0, 2.2, 0, 0, 2.9, 0, 0.12, 8);
    },
  },
  pallet: {
    colliders: [[-0.6, 0, -0.5, 0.6, 0.15, 0.5]],
    navBlock: false,
    build(p, B) {
      for (const sz of [-0.42, 0, 0.42]) box(B, 'woodCrate', 0, 0, sz, 1.2, 0.1, 0.1, 1);
      for (let k = 0; k < 6; k++) box(B, 'woodCrate', 0, 0.1, -0.45 + k * 0.18, 1.2, 0.025, 0.12, 1);
    },
  },
  bench: {
    colliders: [[-0.9, 0, -0.22, 0.9, 0.45, 0.22]],
    navBlock: false,
    build(p, B) {
      box(B, p.mat || 'laminate', 0, 0.4, 0, 1.8, 0.05, 0.42, 1);
      for (const sx of [-0.8, 0.8]) box(B, 'darkMetal', sx, 0, 0, 0.05, 0.4, 0.38, 0.3);
    },
  },
  debris: {
    colliders: null,
    build(p, B, rng) {
      for (let k = 0; k < 6; k++) {
        const r1 = rng ? rng.next() : 0.5, r2 = rng ? rng.next() : 0.5;
        B.setTransform(p.x + (r1 - 0.5) * 1.2, p.y, p.z + (r2 - 0.5) * 1.2, r1 * 7);
        const s = 0.08 + r2 * 0.2;
        box(B, p.mat || 'concrete', 0, 0, 0, s * 1.3, s * 0.6, s, 0.5);
      }
    },
  },
  ceilingHole: {
    // missing ceiling tile with dark void above
    colliders: null,
    build(p, B) {
      box(B, 'black', 0, -0.02, 0, 0.5, 0.02, 0.5, 1);
    },
  },
  cubicleWall: {
    // partition along local X, length p.len, thin
    colliders: p => [[-(p.len || 2) / 2, 0, -0.04, (p.len || 2) / 2, 1.5, 0.04]],
    thin: false,
    build(p, B) {
      const len = p.len || 2;
      box(B, 'fabric', 0, 0, 0, len, 1.45, 0.06, 1);
      box(B, 'darkMetal', 0, 1.45, 0, len, 0.04, 0.08, 1);
      box(B, 'darkMetal', -len / 2, 0, 0, 0.04, 1.49, 0.08, 1);
      box(B, 'darkMetal', len / 2, 0, 0, 0.04, 1.49, 0.08, 1);
    },
  },
  railing: {
    // along local X, length p.len
    colliders: p => [[-(p.len || 2) / 2, 0, -0.06, (p.len || 2) / 2, 1.1, 0.06]],
    navBlock: false,
    build(p, B) {
      const len = p.len || 2;
      const m = p.mat || 'rustMetal';
      B.tube(m, -len / 2, 1.05, 0, len / 2, 1.05, 0, 0.035, 6);
      B.tube(m, -len / 2, 0.55, 0, len / 2, 0.55, 0, 0.025, 6);
      for (let x = -len / 2; x <= len / 2 + 0.01; x += Math.max(0.5, len / Math.max(1, Math.round(len / 1.2)))) B.tube(m, x, 0, 0, x, 1.05, 0, 0.03, 6);
    },
  },
  ladderWall: {
    colliders: null,
    build(p, B) {
      const h = p.h || 2.5;
      for (const sx of [-0.22, 0.22]) B.tube('chrome', sx, p.bottom || 0, 0, sx, h, 0, 0.025, 6);
      for (let y = (p.bottom || 0) + 0.25; y < h; y += 0.3) B.tube('chrome', -0.22, y, 0, 0.22, y, 0, 0.018, 5);
    },
  },
  cone: {
    colliders: [[-0.18, 0, -0.18, 0.18, 0.6, 0.18]],
    navBlock: false,
    build(p, B) {
      box(B, 'plasticDark', 0, 0, 0, 0.38, 0.03, 0.38, 0.3);
      B.cyl('glowAmber', 0, 0.03, 0, 0.15, 0.55, 10, false, 0.025);
    },
  },
  bucket: {
    colliders: null,
    build(p, B) { B.cyl('plastic', 0, 0, 0, 0.14, 0.3, 10, true, 0.17); },
  },
  mattress: {
    colliders: null,
    build(p, B) { box(B, 'fabric', 0, 0, 0, 1.9, 0.18, 0.9, 1); },
  },
  wallShelfSign: {
    // a small framed sign/picture on a wall (local -z is the wall)
    colliders: null,
    build(p, B) {
      box(B, 'trim', 0, -0.3, 0.02, 0.62, 0.48, 0.03, 0.4);
      box(B, p.mat || 'paper', 0, -0.27, 0.04, 0.52, 0.38, 0.005, 0.5);
    },
  },
  hangingWires: {
    colliders: null,
    build(p, B, rng) {
      for (let k = 0; k < 3; k++) {
        const ox = ((rng ? rng.next() : 0.5) - 0.5) * 0.6, oz = ((rng ? rng.next() : 0.5) - 0.5) * 0.6;
        B.tube('rubber', ox, 0, oz, ox * 1.4 + 0.1, -0.6 - k * 0.2, oz * 1.4, 0.01, 4);
      }
    },
  },
});

// ---------------------------------------------------------------------------
// Light fixture visuals (static ones are merged into the chunk geometry).
export const LIGHT_VISUALS = {
  panel(l, B, mat = 'lightPanel') {
    const w = l.w || 1.2, d = l.d || 0.6;
    B.box('ceilingTile', l.x, l.y + 0.012, l.z, w + 0.06, 0.025, d + 0.06, 1, 8 | 1 | 2 | 16 | 32);
    B.quad(mat, [l.x - w / 2, l.y - 0.002, l.z - d / 2], [l.x + w / 2, l.y - 0.002, l.z - d / 2], [l.x + w / 2, l.y - 0.002, l.z + d / 2], [l.x - w / 2, l.y - 0.002, l.z + d / 2], [0, -1, 0]);
  },
  tube(l, B, mat = 'glowWhite') {
    const w = l.w || 1.2;
    B.box('darkMetal', l.x, l.y + 0.03, l.z, w + 0.1, 0.05, 0.14, 0.5);
    B.box(mat, l.x, l.y - 0.02, l.z, w, 0.035, 0.035, 0.2);
  },
  cage(l, B, mat = 'bulbWarm') {
    // wall-mounted caged lamp; l.nx,l.nz is direction away from the wall
    const nx = l.nx || 0, nz = l.nz || 0;
    B.box('darkMetal', l.x - nx * 0.06, l.y, l.z - nz * 0.06, 0.18 + Math.abs(nz) * 0.0, 0.18, 0.18, 0.3);
    B.cyl(mat, l.x, l.y - 0.07, l.z, 0.06, 0.14, 8, true);
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2;
      B.tube('darkMetal', l.x + Math.cos(a) * 0.08, l.y - 0.1, l.z + Math.sin(a) * 0.08, l.x + Math.cos(a) * 0.08, l.y + 0.09, l.z + Math.sin(a) * 0.08, 0.006, 3);
    }
  },
  bulb(l, B, mat = 'bulbWarm') {
    const cord = l.cord || 0.6;
    B.tube('rubber', l.x, l.y + cord, l.z, l.x, l.y + 0.08, l.z, 0.008, 4);
    B.cyl('darkMetal', l.x, l.y + 0.04, l.z, 0.03, 0.06, 8, true);
    B.cyl(mat, l.x, l.y - 0.06, l.z, 0.045, 0.1, 8, true, 0.03);
    if (l.shade) B.cyl('darkMetal', l.x, l.y - 0.02, l.z, 0.24, 0.1, 14, false, 0.05);
  },
  flood(l, B, mat = 'glowWhite') {
    B.box('darkMetal', l.x, l.y, l.z, 0.5, 0.35, 0.3, 0.3);
    B.box(mat, l.x, l.y, l.z + 0.16, 0.42, 0.27, 0.02, 0.3);
  },
  none() {},
};
