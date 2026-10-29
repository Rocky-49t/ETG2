// Streams chunk meshes in and out around the camera for the level the local
// player is in. Builds are time-sliced so walking never hitches.
import * as THREE from 'three';
import { CHUNK } from './chunk.js';
import { buildChunkMesh } from './mesher.js';

export class WorldRenderer {
  constructor(scene, lib) {
    this.scene = scene;
    this.lib = lib;
    this.root = new THREE.Group();
    this.root.name = 'world';
    scene.add(this.root);
    this.meshes = new Map();
    this.level = null;
    this.radius = 2;
    this.dirty = true;
    this.onChunkBuilt = null;
    this.onChunkRemoved = null;
  }

  setLevel(level) {
    this.clear();
    this.level = level;
    this.dirty = true;
  }

  clear() {
    for (const [key, m] of this.meshes) this._dispose(key, m);
    this.meshes.clear();
  }

  _dispose(key, m) {
    this.root.remove(m.group);
    m.group.traverse(o => { if (o.geometry) o.geometry.dispose(); });
    for (const fx of m.fixtures) fx.mat.dispose();
    this.onChunkRemoved?.(key, m);
  }

  // Build every chunk around a point immediately (used behind loading screens).
  buildAll(x, z) {
    const want = this._wanted(x, z);
    for (const [cx, cz] of want) this._build(cx, cz);
    this.dirty = true;
  }

  _wanted(x, z) {
    const ccx = Math.floor(x / CHUNK), ccz = Math.floor(z / CHUNK);
    const R = this.radius;
    const out = [];
    for (let dz = -R; dz <= R; dz++) for (let dx = -R; dx <= R; dx++) {
      const cx = ccx + dx, cz = ccz + dz;
      const mx = (cx + 0.5) * CHUNK - x, mz = (cz + 0.5) * CHUNK - z;
      const d = Math.hypot(mx, mz);
      if (d > (R + 0.75) * CHUNK) continue;
      out.push([cx, cz, d]);
    }
    out.sort((a, b) => a[2] - b[2]);
    return out;
  }

  _build(cx, cz) {
    const key = cx + ',' + cz;
    if (this.meshes.has(key)) return;
    const c = this.level.chunk(cx, cz);
    const m = buildChunkMesh(this.level, c, this.lib);
    m.chunk = c;
    this.meshes.set(key, m);
    this.root.add(m.group);
    this.dirty = true;
    this.onChunkBuilt?.(key, m);
  }

  // Rebuild one chunk's mesh after its tile data changed at runtime.
  rebuild(cx, cz) {
    const key = cx + ',' + cz;
    const m = this.meshes.get(key);
    if (!m) return;
    this._dispose(key, m);
    this.meshes.delete(key);
    this._build(cx, cz);
  }

  update(x, z, budgetMs = 6) {
    if (!this.level) return;
    const want = this._wanted(x, z);
    const t0 = performance.now();
    let built = 0;
    for (const [cx, cz] of want) {
      if (this.meshes.has(cx + ',' + cz)) continue;
      if (built > 0 && performance.now() - t0 > budgetMs) break;
      this._build(cx, cz);
      built++;
    }
    // drop far chunks
    const ccx = Math.floor(x / CHUNK), ccz = Math.floor(z / CHUNK);
    for (const [key, m] of this.meshes) {
      const c = m.chunk;
      if (Math.abs(c.cx - ccx) > this.radius + 1 || Math.abs(c.cz - ccz) > this.radius + 1) {
        this._dispose(key, m);
        this.meshes.delete(key);
        this.dirty = true;
      }
    }
    if (this.level) this.level.tick++;
  }

  // All lights and fixtures in rendered chunks.
  collectLights() {
    const lights = [], fixtures = [];
    for (const m of this.meshes.values()) {
      for (const l of m.chunk.lights) lights.push(l);
      for (const f of m.fixtures) fixtures.push(f);
    }
    this.dirty = false;
    return { lights, fixtures };
  }
}
