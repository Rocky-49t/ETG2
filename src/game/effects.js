// Particle effects, tracers and transient decals. A single Points system with
// a ring buffer handles all short-lived particles; ambient dust is separate.
import * as THREE from 'three';
import { settings } from '../core/settings.js';

const MAX_P = 1500;

function softDotTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.35, 'rgba(255,255,255,0.55)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  return t;
}

function flashTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  g.translate(64, 64);
  for (let i = 0; i < 7; i++) {
    g.rotate(Math.PI * 2 / 7 + Math.random() * 0.3);
    const grd = g.createLinearGradient(0, 0, 60, 0);
    grd.addColorStop(0, 'rgba(255,240,200,1)'); grd.addColorStop(1, 'rgba(255,160,40,0)');
    g.fillStyle = grd;
    g.beginPath(); g.moveTo(0, -6); g.lineTo(55 + Math.random() * 8, 0); g.lineTo(0, 6); g.fill();
  }
  const grd = g.createRadialGradient(0, 0, 0, 0, 0, 30);
  grd.addColorStop(0, 'rgba(255,255,240,1)'); grd.addColorStop(1, 'rgba(255,200,80,0)');
  g.fillStyle = grd; g.beginPath(); g.arc(0, 0, 30, 0, Math.PI * 2); g.fill();
  return new THREE.CanvasTexture(c);
}

export class Effects {
  constructor(scene) {
    this.scene = scene;
    this.tex = softDotTexture();
    this.flashTex = flashTexture();
    // --- transient particles
    const geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(MAX_P * 3);
    this.col = new Float32Array(MAX_P * 4);
    this.size = new Float32Array(MAX_P);
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('size', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    this.mat = new THREE.ShaderMaterial({
      uniforms: { map: { value: this.tex }, scale: { value: 600 } },
      vertexShader: `
        attribute float size; attribute vec4 color; varying vec4 vColor;
        uniform float scale;
        void main() {
          vColor = color;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = size * scale / max(0.1, -mv.z);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        uniform sampler2D map; varying vec4 vColor;
        void main() { vec4 t = texture2D(map, gl_PointCoord); gl_FragColor = vec4(vColor.rgb, vColor.a * t.a); }`,
      transparent: true, depthWrite: false, blending: THREE.NormalBlending,
    });
    this.points = new THREE.Points(geo, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
    scene.add(this.points);
    // additive layer for sparks/embers/glow
    this.addMat = this.mat.clone();
    this.addMat.blending = THREE.AdditiveBlending;
    this.addMat.uniforms = { map: { value: this.tex }, scale: { value: 600 } };
    const geo2 = geo.clone();
    this.apos = new Float32Array(MAX_P * 3); this.acol = new Float32Array(MAX_P * 4); this.asize = new Float32Array(MAX_P);
    geo2.setAttribute('position', new THREE.BufferAttribute(this.apos, 3).setUsage(THREE.DynamicDrawUsage));
    geo2.setAttribute('color', new THREE.BufferAttribute(this.acol, 4).setUsage(THREE.DynamicDrawUsage));
    geo2.setAttribute('size', new THREE.BufferAttribute(this.asize, 1).setUsage(THREE.DynamicDrawUsage));
    this.apoints = new THREE.Points(geo2, this.addMat);
    this.apoints.frustumCulled = false;
    this.apoints.renderOrder = 6;
    scene.add(this.apoints);
    this.parts = [];   // normal blended
    this.aparts = [];  // additive

    // --- ambient dust motes around the camera
    const DUST = 260;
    const dg = new THREE.BufferGeometry();
    this.dustPos = new Float32Array(DUST * 3);
    this.dustVel = new Float32Array(DUST * 3);
    for (let i = 0; i < DUST; i++) {
      this.dustPos[i * 3] = (Math.random() - 0.5) * 14;
      this.dustPos[i * 3 + 1] = Math.random() * 3;
      this.dustPos[i * 3 + 2] = (Math.random() - 0.5) * 14;
      this.dustVel[i * 3] = (Math.random() - 0.5) * 0.05;
      this.dustVel[i * 3 + 1] = (Math.random() - 0.5) * 0.02;
      this.dustVel[i * 3 + 2] = (Math.random() - 0.5) * 0.05;
    }
    dg.setAttribute('position', new THREE.BufferAttribute(this.dustPos, 3).setUsage(THREE.DynamicDrawUsage));
    this.dustMat = new THREE.PointsMaterial({ map: this.tex, size: 0.025, transparent: true, opacity: 0.35, depthWrite: false, color: 0xfff4d6, sizeAttenuation: true, blending: THREE.AdditiveBlending });
    this.dust = new THREE.Points(dg, this.dustMat);
    this.dust.frustumCulled = false;
    scene.add(this.dust);
    this.dustCenter = new THREE.Vector3();

    // --- tracers
    this.tracers = [];
    this.tracerMat = new THREE.LineBasicMaterial({ color: 0xffe2a0, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false });

    // --- bullet holes (ring buffer of small quads)
    this.holes = [];
    this.holeMat = new THREE.MeshBasicMaterial({ map: this.tex, color: 0x000000, transparent: true, opacity: 0.85, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 });
    this.holeGeo = new THREE.PlaneGeometry(0.07, 0.07);

    // --- sprite flashes (muzzle, explosions)
    this.flashes = [];
    this.flashMat = new THREE.SpriteMaterial({ map: this.flashTex, color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
  }

  setDustColor(hex, opacity = 0.35) { this.dustMat.color.set(hex); this.dustMat.opacity = opacity; }

  spawn(o, additive = false) {
    const list = additive ? this.aparts : this.parts;
    if (list.length >= MAX_P) list.shift();
    list.push({
      x: o.x, y: o.y, z: o.z, vx: o.vx || 0, vy: o.vy || 0, vz: o.vz || 0,
      life: o.life || 1, max: o.life || 1, size: o.size || 0.05, grow: o.grow || 0,
      r: o.r ?? 1, g: o.g ?? 1, b: o.b ?? 1, a: o.a ?? 1, grav: o.grav ?? 0, drag: o.drag ?? 0, floor: o.floor ?? -1e9,
    });
  }

  burst(kind, p, n = { x: 0, y: 1, z: 0 }, count = 1) {
    const q = settings.preset.particles;
    const k = Math.max(1, Math.round(count * q));
    const R = Math.random;
    if (kind === 'impact') {
      for (let i = 0; i < 8 * k; i++) this.spawn({ x: p.x, y: p.y, z: p.z, vx: n.x * 1.5 + (R() - 0.5) * 2, vy: n.y * 1.5 + R() * 1.5, vz: n.z * 1.5 + (R() - 0.5) * 2, life: 0.5 + R() * 0.4, size: 0.04 + R() * 0.04, r: 0.6, g: 0.55, b: 0.45, a: 0.7, grav: 6, drag: 1.5 });
      for (let i = 0; i < 3 * k; i++) this.spawn({ x: p.x, y: p.y, z: p.z, vx: n.x * 0.4 + (R() - 0.5) * 0.3, vy: n.y * 0.4 + 0.2, vz: n.z * 0.4 + (R() - 0.5) * 0.3, life: 1.2, size: 0.15, grow: 0.3, r: 0.55, g: 0.52, b: 0.46, a: 0.25, drag: 2 });
      for (let i = 0; i < 4 * k; i++) this.spawn({ x: p.x, y: p.y, z: p.z, vx: n.x * 3 + (R() - 0.5) * 4, vy: n.y * 3 + R() * 2, vz: n.z * 3 + (R() - 0.5) * 4, life: 0.15 + R() * 0.15, size: 0.03, r: 1, g: 0.8, b: 0.4, a: 1, grav: 9 }, true);
    } else if (kind === 'blood' || kind === 'ichor' || kind === 'bone') {
      const c = kind === 'blood' ? [0.35, 0.02, 0.02] : kind === 'ichor' ? [0.04, 0.04, 0.05] : [0.85, 0.82, 0.72];
      for (let i = 0; i < 12 * k; i++) this.spawn({ x: p.x, y: p.y, z: p.z, vx: n.x * 2 + (R() - 0.5) * 3, vy: n.y * 2 + R() * 2, vz: n.z * 2 + (R() - 0.5) * 3, life: 0.6 + R() * 0.5, size: 0.03 + R() * 0.05, r: c[0], g: c[1], b: c[2], a: 0.95, grav: 9.8, drag: 0.5, floor: p.floor ?? -1e9 });
    } else if (kind === 'splash') {
      for (let i = 0; i < 24 * k; i++) this.spawn({ x: p.x + (R() - 0.5) * 0.4, y: p.y, z: p.z + (R() - 0.5) * 0.4, vx: (R() - 0.5) * 2.5, vy: 1.5 + R() * 3, vz: (R() - 0.5) * 2.5, life: 0.7 + R() * 0.4, size: 0.04 + R() * 0.05, r: 0.8, g: 0.92, b: 1, a: 0.7, grav: 9.8, floor: p.y - 0.05 });
      for (let i = 0; i < 4 * k; i++) this.spawn({ x: p.x, y: p.y + 0.05, z: p.z, vx: (R() - 0.5) * 0.5, vy: 0.1, vz: (R() - 0.5) * 0.5, life: 1.0, size: 0.3, grow: 0.8, r: 0.9, g: 0.95, b: 1, a: 0.25 });
    } else if (kind === 'steam') {
      for (let i = 0; i < 2 * k; i++) this.spawn({ x: p.x + (R() - 0.5) * 0.2, y: p.y, z: p.z + (R() - 0.5) * 0.2, vx: n.x * 1.2 + (R() - 0.5) * 0.4, vy: n.y * 1.2 + 0.4 + R() * 0.4, vz: n.z * 1.2 + (R() - 0.5) * 0.4, life: 1.6 + R(), size: 0.25, grow: 1.2, r: 0.85, g: 0.85, b: 0.85, a: 0.12, drag: 0.6 });
    } else if (kind === 'ember') {
      this.spawn({ x: p.x + (R() - 0.5) * 0.1, y: p.y, z: p.z + (R() - 0.5) * 0.1, vx: (R() - 0.5) * 0.6, vy: 0.6 + R() * 1.2, vz: (R() - 0.5) * 0.6, life: 0.6 + R() * 0.8, size: 0.025, r: 1, g: 0.45 + R() * 0.3, b: 0.15, a: 1, drag: 0.5 }, true);
    } else if (kind === 'smoke') {
      this.spawn({ x: p.x, y: p.y, z: p.z, vx: (R() - 0.5) * 0.2, vy: 0.4, vz: (R() - 0.5) * 0.2, life: 2.5, size: 0.2, grow: 0.8, r: 0.3, g: 0.28, b: 0.27, a: 0.18, drag: 0.4 });
    } else if (kind === 'muzzleSmoke') {
      for (let i = 0; i < 3; i++) this.spawn({ x: p.x, y: p.y, z: p.z, vx: n.x * 0.6 + (R() - 0.5) * 0.2, vy: n.y * 0.6 + 0.2, vz: n.z * 0.6 + (R() - 0.5) * 0.2, life: 0.9, size: 0.06, grow: 0.25, r: 0.7, g: 0.7, b: 0.7, a: 0.2, drag: 2 });
    } else if (kind === 'dustFall') {
      for (let i = 0; i < 14 * k; i++) this.spawn({ x: p.x + (R() - 0.5) * 2, y: p.y, z: p.z + (R() - 0.5) * 2, vx: (R() - 0.5) * 0.2, vy: -R() * 0.5, vz: (R() - 0.5) * 0.2, life: 2 + R(), size: 0.05 + R() * 0.06, r: 0.6, g: 0.55, b: 0.45, a: 0.4, grav: 1.5, floor: p.floor ?? -1e9 });
    } else if (kind === 'debris') {
      for (let i = 0; i < 20 * k; i++) this.spawn({ x: p.x + (R() - 0.5), y: p.y, z: p.z + (R() - 0.5), vx: (R() - 0.5) * 6, vy: 2 + R() * 5, vz: (R() - 0.5) * 6, life: 1.2 + R(), size: 0.08 + R() * 0.12, r: 0.45, g: 0.43, b: 0.4, a: 1, grav: 12, floor: p.floor ?? -1e9 });
      for (let i = 0; i < 8 * k; i++) this.spawn({ x: p.x, y: p.y + 0.3, z: p.z, vx: (R() - 0.5) * 1.5, vy: 0.5 + R(), vz: (R() - 0.5) * 1.5, life: 2.5, size: 0.6, grow: 1.5, r: 0.5, g: 0.48, b: 0.45, a: 0.3, drag: 1 });
    } else if (kind === 'shock') {
      for (let i = 0; i < 40 * k; i++) {
        const a = (i / (40 * k)) * Math.PI * 2;
        this.spawn({ x: p.x + Math.cos(a) * 0.5, y: p.y + 0.1, z: p.z + Math.sin(a) * 0.5, vx: Math.cos(a) * 9, vy: 0.3, vz: Math.sin(a) * 9, life: 0.7, size: 0.25, grow: 0.5, r: 1, g: 0.75, b: 0.35, a: 0.5, drag: 1.5 }, true);
      }
    } else if (kind === 'spark') {
      for (let i = 0; i < 10 * k; i++) this.spawn({ x: p.x, y: p.y, z: p.z, vx: (R() - 0.5) * 3, vy: R() * 2.5, vz: (R() - 0.5) * 3, life: 0.3 + R() * 0.5, size: 0.02 + R() * 0.02, r: 1, g: 0.75 + R() * 0.2, b: 0.4, a: 1, grav: 9.8, floor: p.floor ?? -1e9 }, true);
    } else if (kind === 'glint') {
      this.spawn({ x: p.x, y: p.y, z: p.z, life: 0.5, size: 0.06, r: 1, g: 0.95, b: 0.8, a: 0.9 }, true);
    }
  }

  tracer(a, b) {
    const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(a.x, a.y, a.z), new THREE.Vector3(b.x, b.y, b.z)]);
    const line = new THREE.Line(g, this.tracerMat.clone());
    line.frustumCulled = false;
    this.scene.add(line);
    this.tracers.push({ line, life: 0.06 });
  }

  bulletHole(p, n) {
    const m = new THREE.Mesh(this.holeGeo, this.holeMat);
    m.position.set(p.x + n.x * 0.01, p.y + n.y * 0.01, p.z + n.z * 0.01);
    m.lookAt(p.x + n.x, p.y + n.y, p.z + n.z);
    m.rotateZ(Math.random() * 6);
    const s = 0.7 + Math.random() * 0.6;
    m.scale.set(s, s, s);
    this.scene.add(m);
    this.holes.push(m);
    if (this.holes.length > 80) { const old = this.holes.shift(); this.scene.remove(old); }
  }

  flash(p, size = 0.5, life = 0.05, color = 0xffffff) {
    const s = new THREE.Sprite(this.flashMat.clone());
    s.material.color.set(color);
    s.material.rotation = Math.random() * Math.PI;
    s.position.set(p.x, p.y, p.z);
    s.scale.set(size, size, size);
    s.renderOrder = 7;
    this.scene.add(s);
    this.flashes.push({ s, life, max: life });
  }

  clearTransient() {
    for (const h of this.holes) this.scene.remove(h);
    this.holes = [];
    for (const t of this.tracers) this.scene.remove(t.line);
    this.tracers = [];
    this.parts = []; this.aparts = [];
  }

  update(dt, camPos) {
    const step = (list, pos, col, size, attrs) => {
      let n = 0;
      for (let i = list.length - 1; i >= 0; i--) {
        const p = list[i];
        p.life -= dt;
        if (p.life <= 0) { list[i] = list[list.length - 1]; list.pop(); continue; }
        p.vy -= p.grav * dt;
        const dr = Math.max(0, 1 - p.drag * dt);
        p.vx *= dr; p.vy *= dr; p.vz *= dr;
        p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
        if (p.y < p.floor) { p.y = p.floor; p.vy *= -0.2; p.vx *= 0.5; p.vz *= 0.5; }
        p.size += p.grow * dt;
      }
      for (const p of list) {
        if (n >= MAX_P) break;
        const t = p.life / p.max;
        pos[n * 3] = p.x; pos[n * 3 + 1] = p.y; pos[n * 3 + 2] = p.z;
        col[n * 4] = p.r; col[n * 4 + 1] = p.g; col[n * 4 + 2] = p.b; col[n * 4 + 3] = p.a * Math.min(1, t * 2.5);
        size[n] = p.size;
        n++;
      }
      attrs.geometry.setDrawRange(0, n);
      attrs.geometry.attributes.position.needsUpdate = true;
      attrs.geometry.attributes.color.needsUpdate = true;
      attrs.geometry.attributes.size.needsUpdate = true;
    };
    step(this.parts, this.pos, this.col, this.size, this.points);
    step(this.aparts, this.apos, this.acol, this.asize, this.apoints);

    // dust follows the camera in a wrapped box
    const d = this.dustPos, v = this.dustVel;
    const cx = camPos.x, cy = camPos.y, cz = camPos.z;
    const t = performance.now() * 0.0003;
    for (let i = 0; i < d.length; i += 3) {
      d[i] += (v[i] + Math.sin(t + i) * 0.01) * dt; d[i + 1] += v[i + 1] * dt; d[i + 2] += (v[i + 2] + Math.cos(t + i) * 0.01) * dt;
      if (d[i] - cx > 7) d[i] -= 14; else if (d[i] - cx < -7) d[i] += 14;
      if (d[i + 2] - cz > 7) d[i + 2] -= 14; else if (d[i + 2] - cz < -7) d[i + 2] += 14;
      if (d[i + 1] - cy > 2.5) d[i + 1] -= 4; else if (d[i + 1] - cy < -1.6) d[i + 1] += 4;
    }
    this.dust.geometry.attributes.position.needsUpdate = true;

    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const tr = this.tracers[i];
      tr.life -= dt;
      tr.line.material.opacity = Math.max(0, tr.life / 0.06) * 0.8;
      if (tr.life <= 0) { this.scene.remove(tr.line); tr.line.geometry.dispose(); tr.line.material.dispose(); this.tracers.splice(i, 1); }
    }
    for (let i = this.flashes.length - 1; i >= 0; i--) {
      const f = this.flashes[i];
      f.life -= dt;
      f.s.material.opacity = Math.max(0, f.life / f.max);
      if (f.life <= 0) { this.scene.remove(f.s); f.s.material.dispose(); this.flashes.splice(i, 1); }
    }
  }

  // Keep point size consistent with resolution.
  setViewport(h) { this.mat.uniforms.scale.value = h * 0.9; this.addMat.uniforms.scale.value = h * 0.9; }
}
