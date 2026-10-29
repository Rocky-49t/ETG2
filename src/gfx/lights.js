// Dynamic light pool. NOTE: lights are never hidden/removed (that would
// change the light count and force shader recompiles); unused ones sit at 0.
// Static fixtures are baked into vertex lighting; the
// nearest/most relevant fixtures additionally get a real PointLight from a
// fixed-size pool so nearby surfaces receive specular + normal-mapped light.
// Flickering and broken fixtures are dynamic-only, which gives them punch.
import * as THREE from 'three';
import { noise1 } from '../core/rng.js';
import { worldUniforms } from './materials.js';

export function flickerValue(l, t, now) {
  const s = l.seed || 0;
  if (l.offUntil && now !== undefined && now >= l.offFrom && now < l.offUntil) return Math.random() < 0.04 ? 0.6 : 0;
  if (l.broken) {
    if (noise1(t * 0.9, s) < 0.8) return 0.0;
    return noise1(t * 28, s + 1) > 0.45 ? 1 : 0.05;
  }
  if (l.flicker > 0) {
    const n = noise1(t * 3.5, s);
    if (n < l.flicker * 0.55) return noise1(t * 45, s + 2) > 0.5 ? 0.12 : 0.75;
    return 0.92 + 0.08 * noise1(t * 20, s + 3);
  }
  return 1;
}

export class LightManager {
  constructor(scene, count) {
    this.scene = scene;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.pool = [];
    this.candidates = [];
    this.fixtures = [];
    this.assigned = new Map(); // light -> pool slot
    this.time = 0;
    this.blackout = 0; // 0..1
    this.intensityScale = 1;
    this.levelGain = 1; // per-level multiplier for dynamic fixture lights
    this.setCount(count);
    this._frame = 0;
  }

  setCount(n) {
    for (const p of this.pool) this.group.remove(p.light);
    this.pool = [];
    for (let i = 0; i < n; i++) {
      const light = new THREE.PointLight(0xffffff, 0, 10, 2);
      light.castShadow = false;
      this.group.add(light);
      this.pool.push({ light, src: null, fade: 0 });
    }
    this.assigned.clear();
  }

  setSources(lights, fixtures) {
    this.candidates = lights;
    this.fixtures = fixtures;
  }

  update(dt, camera, level) {
    this.time += dt;
    const t = this.time;
    const cam = camera.position;
    const globalK = (1 - this.blackout * 0.97) * this.intensityScale;
    worldUniforms.bakedScale.value = 1 - this.blackout * 0.88;

    // compute flicker for all candidate lights near camera
    this._frame++;
    if (this._frame % 3 === 0 || !this._scored) {
      this._scored = true;
      const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
      const scored = [];
      for (const l of this.candidates) {
        const dx = l.x - cam.x, dy = l.y - cam.y, dz = l.z - cam.z;
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 > 30 * 30) continue;
        let s = (l.intensity * (l.flicker > 0 || l.broken ? 1.6 : 1)) / (d2 + 6);
        const d = Math.sqrt(d2);
        const facing = (dx * fwd.x + dy * fwd.y + dz * fwd.z) / (d + 1e-4);
        if (facing < -0.2 && d > (l.range || 8) * 0.6) s *= 0.25;
        if (level && d > 3) {
          if (l._losT === undefined || t - l._losT > 0.4) {
            l._losT = t + Math.random() * 0.1;
            l._los = level.tileLOS(cam.x, cam.z, l.x, l.z);
          }
          if (!l._los) s *= 0.12;
        }
        scored.push([s, l]);
      }
      scored.sort((a, b) => b[0] - a[0]);
      const want = new Set(scored.slice(0, this.pool.length).map(e => e[1]));
      // release
      for (const slot of this.pool) {
        if (slot.src && !want.has(slot.src)) { slot.releasing = true; }
      }
      // assign
      for (const l of want) {
        if (this.assigned.has(l)) { this.assigned.get(l).releasing = false; continue; }
        const slot = this.pool.find(p => !p.src) || this.pool.find(p => p.releasing && p.fade < 0.05);
        if (!slot) continue;
        if (slot.src) this.assigned.delete(slot.src);
        slot.src = l; slot.fade = 0; slot.releasing = false;
        this.assigned.set(l, slot);
        slot.light.color.setRGB(l.color[0], l.color[1], l.color[2]);
        slot.light.position.set(l.x, l.y - 0.3, l.z);
        slot.light.distance = (l.range || 9) * 1.15;
      }
    }

    for (const slot of this.pool) {
      const l = slot.src;
      if (!l) { slot.light.intensity = 0; continue; }
      slot.fade = Math.min(1, Math.max(0, slot.fade + (slot.releasing ? -dt * 4 : dt * 3)));
      if (slot.releasing && slot.fade <= 0) {
        this.assigned.delete(l); slot.src = null; slot.light.intensity = 0; continue;
      }
      const fv = flickerValue(l, t, this.gameTime);
      l._fv = fv;
      slot.light.intensity = l.intensity * (l.dynGain ?? 1) * this.levelGain * fv * slot.fade * globalK;
    }

    // fixture emissives
    for (const fx of this.fixtures) {
      const fv = flickerValue(fx.light, t, this.gameTime);
      fx.mat.emissiveIntensity = fx.mat.userData.baseIntensity * fv * globalK;
    }
  }

  // Strongest flickering fixture near a point (for buzzing audio).
  nearestFlicker(pos, maxD = 10) {
    let best = null, bd = maxD;
    for (const fx of this.fixtures) {
      const l = fx.light;
      const d = Math.hypot(l.x - pos.x, l.y - pos.y, l.z - pos.z);
      if (d < bd) { bd = d; best = l; }
    }
    return best ? { light: best, dist: bd, value: flickerValue(best, this.time) } : null;
  }

  // Approximate light level at a point (0..~1) from dynamic sources; used for
  // sanity drain and entity vision. Baked level supplied separately.
  lightLevelAt(x, y, z) {
    let sum = 0;
    for (const slot of this.pool) {
      if (!slot.src || slot.light.intensity <= 0) continue;
      const p = slot.light.position;
      const d2 = (p.x - x) ** 2 + (p.y - y) ** 2 + (p.z - z) ** 2;
      sum += slot.light.intensity / (d2 + 1);
    }
    return sum;
  }
}
