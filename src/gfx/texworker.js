// Texture generation worker: runs a recipe and returns packed RGBA arrays.
import { Surface, pack } from './texgen.js';
import { RECIPES } from './recipes.js';

self.onmessage = e => {
  const { id, recipe, size } = e.data;
  try {
    const s = new Surface(size);
    const opts = RECIPES[recipe](s) || {};
    const out = pack(s, opts);
    const transfer = [out.color.buffer, out.rough.buffer];
    if (out.normal) transfer.push(out.normal.buffer);
    if (out.emissive) transfer.push(out.emissive.buffer);
    self.postMessage({ id, out }, transfer);
  } catch (err) {
    self.postMessage({ id, error: String(err && err.stack || err) });
  }
};
