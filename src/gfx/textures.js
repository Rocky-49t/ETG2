// Texture factory: generates recipe textures on a pool of module workers
// (falling back to the main thread) and wraps them as DataTextures.
import * as THREE from 'three';
import { Surface, pack } from './texgen.js';
import { RECIPES } from './recipes.js';

let pool = null;
let nextId = 1;
const pending = new Map();

function makePool() {
  const n = Math.max(1, Math.min(6, (navigator.hardwareConcurrency || 4) - 1));
  const workers = [];
  try {
    for (let i = 0; i < n; i++) {
      const w = new Worker(new URL('./texworker.js', import.meta.url), { type: 'module' });
      w.onmessage = e => {
        const p = pending.get(e.data.id);
        if (!p) return;
        pending.delete(e.data.id);
        w.busy--;
        if (e.data.error) p.reject(new Error(e.data.error)); else p.resolve(e.data.out);
      };
      w.onerror = () => { w.broken = true; };
      w.busy = 0;
      workers.push(w);
    }
  } catch {
    return [];
  }
  return workers;
}

function generateSync(recipe, size) {
  const s = new Surface(size);
  const opts = RECIPES[recipe](s) || {};
  return pack(s, opts);
}

export function generatePacked(recipe, size) {
  if (!pool) pool = makePool();
  const live = pool.filter(w => !w.broken);
  if (!live.length) return Promise.resolve(generateSync(recipe, size));
  const w = live.reduce((a, b) => (a.busy <= b.busy ? a : b));
  w.busy++;
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    w.postMessage({ id, recipe, size });
  }).catch(() => generateSync(recipe, size));
}

function dataTex(arr, size, srgb, anisotropy) {
  const t = new THREE.DataTexture(arr, size, size, THREE.RGBAFormat, THREE.UnsignedByteType);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = anisotropy;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.flipY = false;
  t.needsUpdate = true;
  return t;
}

export function toTextureSet(p, anisotropy = 4) {
  const set = {};
  set.map = dataTex(p.color, p.size, true, anisotropy);
  if (p.normal) set.normalMap = dataTex(p.normal, p.size, false, anisotropy);
  set.roughnessMap = dataTex(p.rough, p.size, false, anisotropy);
  if (p.metal) set.metalnessMap = set.roughnessMap;
  if (p.emissive) set.emissiveMap = dataTex(p.emissive, p.size, true, anisotropy);
  return set;
}

export function generateSyncSet(recipe, size, anisotropy) {
  return toTextureSet(generateSync(recipe, size), anisotropy);
}
