// Material library. Static world geometry uses "baked" materials: a
// MeshStandardMaterial patched to add a per-vertex baked irradiance term
// (pre-computed light pools + ambient occlusion) on top of dynamic lights.
import * as THREE from 'three';
import { generatePacked, toTextureSet, generateSyncSet } from './textures.js';
import { settings } from '../core/settings.js';

// Global uniforms shared by all baked materials.
export const worldUniforms = {
  bakedScale: { value: 1.0 },  // dimmed during blackouts / low sanity
  bakedTint: { value: new THREE.Color(1, 1, 1) },
  time: { value: 0 },
  // light probe for movable props (containers, items, lockers): the baked
  // light level around the player, so they match the lit room they sit in
  dynProbe: { value: new THREE.Color(0, 0, 0) },
};

const NOISE_GLSL = /* glsl */`
float etgHash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float etgNoise(vec3 x) {
  vec3 i = floor(x), f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(etgHash(i), etgHash(i + vec3(1,0,0)), f.x), mix(etgHash(i + vec3(0,1,0)), etgHash(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(etgHash(i + vec3(0,0,1)), etgHash(i + vec3(1,0,1)), f.x), mix(etgHash(i + vec3(0,1,1)), etgHash(i + vec3(1,1,1)), f.x), f.y), f.z);
}
`;

// Patches a MeshStandardMaterial with: baked per-vertex irradiance, and a
// world-space low-frequency albedo variation that hides texture tiling.
export function patchBaked(mat, opts = {}) {
  const variation = opts.variation ?? 0.22;
  const stains = opts.stains;
  mat.onBeforeCompile = shader => {
    shader.uniforms.bakedScale = worldUniforms.bakedScale;
    shader.uniforms.bakedTint = worldUniforms.bakedTint;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 baked;\nvarying vec3 vBaked;\nvarying vec3 vWPos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvBaked = baked;\nvWPos = (modelMatrix * vec4(position, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vBaked;\nvarying vec3 vWPos;\nuniform float bakedScale;\nuniform vec3 bakedTint;\n' + NOISE_GLSL)
      .replace('#include <map_fragment>', `#include <map_fragment>
        {
          float nv = etgNoise(vWPos * 0.21) * 0.65 + etgNoise(vWPos * 0.83) * 0.35;
          diffuseColor.rgb *= 1.0 + (nv - 0.5) * ${variation.toFixed(3)} * 2.0;
          ${stains ? `
          // world-space damp stains: irregular, placed by noise rather than by texture repeat
          float sn = etgNoise(vWPos * 0.31 + vec3(17.0, 3.0, 5.0)) * 0.62 + etgNoise(vWPos * 1.07) * 0.28 + etgNoise(vWPos * 3.9) * 0.10;
          float st = smoothstep(0.655, 0.70, sn);
          float rim = smoothstep(0.64, 0.655, sn) * (1.0 - smoothstep(0.655, 0.68, sn));
          diffuseColor.rgb *= 1.0 - st * vec3(${stains.body}) - rim * vec3(${stains.rim});` : ''}
        }`)
      .replace('#include <lights_fragment_maps>', '#include <lights_fragment_maps>\nirradiance += vBaked * bakedTint * (bakedScale * 3.14159);');
    if (opts.emissiveBaked) {
      shader.fragmentShader = shader.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance *= bakedScale;');
    }
  };
  mat.customProgramCacheKey = () => 'baked' + (opts.emissiveBaked ? 'E' : '') + variation + (stains ? stains.body + stains.rim : '');
  return mat;
}

// Definitions: recipe + material params + uv scale (metres per texture repeat).
export const MATERIAL_DEFS = {
  wallpaper: { recipe: 'wallpaper', params: { roughness: 1 }, stains: { body: '0.12, 0.15, 0.15', rim: '0.12, 0.14, 0.1' } },
  labPanel: { recipe: 'labPanel', params: { roughness: 1 } },
  labFloor: { recipe: 'labFloor', params: { roughness: 1 } },
  labCeil: { recipe: 'labCeil', params: { roughness: 1 } },
  carpet: { recipe: 'carpet', params: { roughness: 1 }, stains: { body: '0.32, 0.33, 0.28', rim: '0.12, 0.12, 0.1' } },
  ceilingTile: { recipe: 'ceilingTile', params: { roughness: 1, metalness: 1 }, stains: { body: '0.17, 0.23, 0.34', rim: '0.1, 0.13, 0.17' } },
  lightPanel: { recipe: 'lightPanel', params: { emissive: 0xfff4dc, emissiveIntensity: 1.9, roughness: 1, metalness: 1 }, emissiveBaked: true },
  trim: { recipe: 'trim', params: { roughness: 1 } },
  concrete: { recipe: 'concrete', params: { roughness: 1 }, stains: { body: '0.14, 0.14, 0.12', rim: '0.08, 0.08, 0.07' } },
  pillarPaint: { recipe: 'pillarPaint', params: { roughness: 1 } },
  woodCrate: { recipe: 'woodCrate', params: { roughness: 1, metalness: 1 } },
  cardboard: { recipe: 'cardboard', params: { roughness: 1 } },
  paintedMetal: { recipe: 'paintedMetal', params: { roughness: 1, metalness: 1 } },
  paper: { recipe: 'paper', params: { roughness: 1 } },
  brick: { recipe: 'brick', params: { roughness: 1 } },
  rustMetal: { recipe: 'rustMetal', params: { roughness: 1, metalness: 1 } },
  grate: { recipe: 'grate', params: { roughness: 1, metalness: 1 } },
  industrialFloor: { recipe: 'industrialFloor', params: { roughness: 1 }, stains: { body: '0.2, 0.2, 0.18', rim: '0.1, 0.1, 0.09' } },
  hazard: { recipe: 'hazard', params: { roughness: 1 } },
  officeCarpet: { recipe: 'officeCarpet', params: { roughness: 1 }, stains: { body: '0.22, 0.2, 0.16', rim: '0.1, 0.09, 0.07' } },
  drywall: { recipe: 'drywall', params: { roughness: 1 } },
  fabric: { recipe: 'fabric', params: { roughness: 1 } },
  laminate: { recipe: 'laminate', params: { roughness: 1 } },
  sewerBrick: { recipe: 'sewerBrick', params: { roughness: 1 } },
  sewerFloor: { recipe: 'sewerFloor', params: { roughness: 1 } },
  poolTile: { recipe: 'poolTile', params: { roughness: 1 } },
  poolTileBlue: { recipe: 'poolTileBlue', params: { roughness: 1 } },
  bridgeConcrete: { recipe: 'bridgeConcrete', params: { roughness: 1 } },
  stone: { recipe: 'stone', params: { roughness: 1 } },
  bone: { recipe: 'bone', params: { roughness: 1 } },
  chitin: { recipe: 'chitin', params: { roughness: 1 } },
  skinPale: { recipe: 'skinPale', params: { roughness: 1 } },
  // untextured helpers
  black: { params: { color: 0x050505, roughness: 0.9 } },
  darkMetal: { params: { color: 0x2a2c2e, roughness: 0.5, metalness: 0.8 } },
  chrome: { params: { color: 0xc8ccd0, roughness: 0.18, metalness: 1 } },
  plastic: { params: { color: 0x9a968a, roughness: 0.55 } },
  plasticDark: { params: { color: 0x262626, roughness: 0.5 } },
  rubber: { params: { color: 0x151515, roughness: 0.95 } },
  glowWhite: { params: { color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 2.0 }, emissiveBaked: true },
  glowRed: { params: { color: 0x330000, emissive: 0xff2010, emissiveIntensity: 2.5 }, emissiveBaked: true },
  glowGreen: { params: { color: 0x003300, emissive: 0x30ff60, emissiveIntensity: 2.5 }, emissiveBaked: true },
  glowAmber: { params: { color: 0x331a00, emissive: 0xffa030, emissiveIntensity: 2.5 }, emissiveBaked: true },
  bulbWarm: { params: { color: 0xffe0a0, emissive: 0xffb050, emissiveIntensity: 3 }, emissiveBaked: true },
  monitorOff: { params: { color: 0x0a0d10, roughness: 0.15, metalness: 0.2 } },
  glass: { params: { color: 0x88aaaa, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.25, depthWrite: false } },
};

export class MaterialLib {
  constructor(engine) {
    this.engine = engine;
    this.textures = new Map();
    this.baked = new Map();
    this.dynamic = new Map();
    this.custom = new Map();
  }

  get texSize() { return settings.preset.textureSize; }

  get anisotropy() { return Math.min(settings.preset.anisotropy, this.engine.maxAnisotropy || 4); }

  textureSet(recipe) {
    const key = recipe + '@' + this.texSize;
    if (this.textures.has(key)) return this.textures.get(key);
    const set = generateSyncSet(recipe, this.texSize, this.anisotropy);
    this.textures.set(key, set);
    return set;
  }

  // Generate textures for the given material names in parallel on workers.
  async warm(names, onProgress) {
    const recipes = [...new Set(names.map(n => MATERIAL_DEFS[n]?.recipe).filter(Boolean))]
      .filter(r => !this.textures.has(r + '@' + this.texSize));
    let done = 0;
    await Promise.all(recipes.map(r => generatePacked(r, this.texSize).then(p => {
      this.textures.set(r + '@' + this.texSize, toTextureSet(p, this.anisotropy));
      done++;
      onProgress?.(done / recipes.length, r);
    })));
    for (const n of names) this.get(n);
  }

  _make(name, baked) {
    const def = MATERIAL_DEFS[name];
    if (!def) throw new Error('Unknown material ' + name);
    const params = { ...def.params };
    if (def.recipe) {
      const t = this.textureSet(def.recipe);
      params.map = t.map;
      if (t.normalMap) { params.normalMap = t.normalMap; params.normalScale = new THREE.Vector2(1, 1); }
      params.roughnessMap = t.roughnessMap;
      if (t.metalnessMap) { params.metalnessMap = t.metalnessMap; params.metalness = 1; }
      else params.metalness = 0;
      if (t.emissiveMap) params.emissiveMap = t.emissiveMap;
    }
    const mat = new THREE.MeshStandardMaterial(params);
    mat.name = name;
    if (baked) patchBaked(mat, { emissiveBaked: def.emissiveBaked, variation: def.variation, stains: def.stains });
    else {
      mat.onBeforeCompile = shader => {
        shader.uniforms.dynProbe = worldUniforms.dynProbe;
        shader.fragmentShader = shader.fragmentShader
          .replace('#include <common>', '#include <common>\nuniform vec3 dynProbe;')
          .replace('#include <lights_fragment_maps>', '#include <lights_fragment_maps>\nirradiance += dynProbe * 3.14159;');
      };
      mat.customProgramCacheKey = () => 'dynProbe';
    }
    return mat;
  }

  // Material for static, baked chunk geometry.
  get(name) {
    if (!this.baked.has(name)) this.baked.set(name, this._make(name, true));
    return this.baked.get(name);
  }

  // Material for moving / standalone objects (no baked attribute).
  dyn(name) {
    if (!this.dynamic.has(name)) this.dynamic.set(name, this._make(name, false));
    return this.dynamic.get(name);
  }

  // Register an arbitrary material (e.g. water) under a key.
  register(name, mat) { this.custom.set(name, mat); this.baked.set(name, mat); }

  // Throw away texture caches (quality change).
  clear() {
    for (const m of this.baked.values()) m.dispose();
    for (const m of this.dynamic.values()) m.dispose();
    for (const t of this.textures.values()) Object.values(t).forEach(x => x?.dispose?.());
    this.baked.clear(); this.dynamic.clear(); this.textures.clear();
  }
}

// ---------------------------------------------------------------------------
// Decal atlas: 5x5 cells drawn with canvas 2D. Used for exit signs, arrows,
// graffiti, stains, handprints and blood. Cells referenced by name. The EXIT
// sign cells (arrow / arrowL / exitU / exitD) are drawn in a per-level style.
const GRID = 5;
export const DECALS = ['arrow', 'arrow2', 'hand', 'stain', 'blood', 'blood2', 'text0', 'text1', 'text2', 'text3', 'scratch', 'drip', 'tally', 'eye', 'arrowL', 'footprints', 'exitU', 'exitD', 'num0', 'num1', 'num2', 'num3', 'lvl0', 'lvl1', 'lvl2'];
export const DECAL_TEXTS = ['IT HEARS YOU', "DON'T RUN", 'NOT REAL', 'KEEP THE LIGHT ON', 'COUNT THE DOORS', 'BEHIND YOU?', 'WE WERE 6', 'DOWN IS OUT', 'LISTEN', 'NO ECHO HERE'];

export function buildDecalAtlas(seedTexts = DECAL_TEXTS, style = 'spray', labels = {}) {
  const S = 256 * GRID, C = S / GRID;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const g = cv.getContext('2d');
  g.clearRect(0, 0, S, S);
  const cell = (idx, fn) => {
    const x = (idx % GRID) * C, y = Math.floor(idx / GRID) * C;
    g.save();
    g.translate(x, y);
    g.beginPath(); g.rect(0, 0, C, C); g.clip();
    fn(g, C);
    g.restore();
  };
  const rough = (g, pts, w, col) => {
    g.strokeStyle = col; g.lineWidth = w; g.lineCap = 'round'; g.lineJoin = 'round';
    for (let pass = 0; pass < 3; pass++) {
      g.globalAlpha = 0.5 + pass * 0.15;
      g.beginPath();
      pts.forEach((p, i) => {
        const jx = (Math.random() - 0.5) * w * 0.4, jy = (Math.random() - 0.5) * w * 0.4;
        i ? g.lineTo(p[0] + jx, p[1] + jy) : g.moveTo(p[0] + jx, p[1] + jy);
      });
      g.stroke();
    }
    g.globalAlpha = 1;
  };
  const paint = 'rgba(40,10,8,0.9)';
  // 0 / 14 / 16 / 17: EXIT signs (right, left, ahead, behind) in the level's style
  const exitSign = (idx, dir) => cell(idx, (g, C) => drawExitSign(g, C, dir, style, rough, paint));
  exitSign(0, 'r'); exitSign(14, 'l'); exitSign(16, 'u'); exitSign(17, 'd');
  // 1 arrow chalk
  cell(1, (g, C) => rough(g, [[C * 0.15, C * 0.55], [C * 0.8, C * 0.45], [C * 0.65, C * 0.32], [C * 0.8, C * 0.45], [C * 0.68, C * 0.62]], C * 0.035, 'rgba(235,235,225,0.85)'));
  // 2 hand print
  cell(2, (g, C) => {
    g.fillStyle = 'rgba(70,8,5,0.85)';
    g.beginPath(); g.ellipse(C * 0.5, C * 0.62, C * 0.16, C * 0.19, 0, 0, Math.PI * 2); g.fill();
    const fingers = [[-0.13, -0.2, -0.35], [-0.05, -0.27, -0.1], [0.04, -0.28, 0.05], [0.12, -0.22, 0.25], [0.2, 0.0, 0.9]];
    for (const [dx, dy, a] of fingers) {
      g.save(); g.translate(C * (0.5 + dx), C * (0.5 + dy)); g.rotate(a);
      g.beginPath(); g.ellipse(0, 0, C * 0.035, C * 0.11, 0, 0, Math.PI * 2); g.fill(); g.restore();
    }
  });
  // 3 damp stain (irregular blotch with darker tide line)
  cell(3, (g, C) => {
    const pts = [];
    const n = 22;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const r = C * (0.28 + Math.random() * 0.14);
      pts.push([C / 2 + Math.cos(a) * r, C / 2 + Math.sin(a) * r * 0.85]);
    }
    const path = () => { g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]))); g.closePath(); };
    g.filter = 'blur(6px)';
    path(); g.fillStyle = 'rgba(70,50,18,0.32)'; g.fill();
    g.filter = 'blur(2px)';
    path(); g.lineWidth = 5; g.strokeStyle = 'rgba(60,40,12,0.35)'; g.stroke();
    g.filter = 'none';
    for (let i = 0; i < 6; i++) { g.fillStyle = 'rgba(55,38,12,0.18)'; g.beginPath(); g.arc(C / 2 + (Math.random() - 0.5) * C * 0.4, C / 2 + (Math.random() - 0.5) * C * 0.35, C * (0.04 + Math.random() * 0.08), 0, Math.PI * 2); g.fill(); }
  });
  // 4,5 blood
  for (const idx of [4, 5]) cell(idx, (g, C) => {
    g.fillStyle = 'rgba(80,4,4,0.9)';
    for (let i = 0; i < 26; i++) {
      const a = Math.random() * Math.PI * 2, d = Math.random() ** 2 * C * 0.4;
      const r = (1 - d / (C * 0.4)) * C * 0.09 + 2;
      g.beginPath(); g.arc(C / 2 + Math.cos(a) * d, C / 2 + Math.sin(a) * d, r, 0, Math.PI * 2); g.fill();
    }
    g.beginPath(); g.arc(C / 2, C / 2, C * 0.14, 0, Math.PI * 2); g.fill();
  });
  // 6..9 graffiti text
  for (let k = 0; k < 4; k++) cell(6 + k, (g, C) => {
    const txt = seedTexts[k % seedTexts.length];
    g.fillStyle = k % 2 ? 'rgba(30,20,15,0.85)' : 'rgba(110,10,8,0.85)';
    g.font = `bold ${Math.floor(C * 0.16)}px "Courier New", monospace`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    const words = txt.split(' ');
    const lines = [];
    let line = '';
    for (const w of words) { if ((line + ' ' + w).trim().length > 9) { lines.push(line.trim()); line = w; } else line += ' ' + w; }
    lines.push(line.trim());
    lines.forEach((l, i) => {
      g.save();
      g.translate(C / 2, C / 2 + (i - (lines.length - 1) / 2) * C * 0.2);
      g.rotate((Math.random() - 0.5) * 0.12);
      g.fillText(l, 0, 0);
      g.restore();
    });
  });
  // 10 scratches
  cell(10, (g, C) => {
    for (let i = 0; i < 4; i++) rough(g, [[C * (0.25 + i * 0.12), C * 0.15], [C * (0.3 + i * 0.12), C * 0.85]], 4, 'rgba(20,15,10,0.8)');
  });
  // 11 drip
  cell(11, (g, C) => {
    g.fillStyle = 'rgba(40,30,15,0.5)';
    for (let i = 0; i < 7; i++) {
      const x = C * (0.15 + Math.random() * 0.7), len = C * (0.3 + Math.random() * 0.6);
      g.fillRect(x, 0, 4 + Math.random() * 5, len);
      g.beginPath(); g.arc(x + 4, len, 5, 0, Math.PI * 2); g.fill();
    }
  });
  // 12 tally marks
  cell(12, (g, C) => {
    for (let gI = 0; gI < 3; gI++) {
      for (let i = 0; i < 4; i++) rough(g, [[C * (0.12 + gI * 0.28 + i * 0.045), C * 0.3], [C * (0.12 + gI * 0.28 + i * 0.045), C * 0.7]], 4, 'rgba(25,20,15,0.85)');
      rough(g, [[C * (0.08 + gI * 0.28), C * 0.62], [C * (0.3 + gI * 0.28), C * 0.4]], 4, 'rgba(25,20,15,0.85)');
    }
  });
  // 13 eye
  cell(13, (g, C) => {
    g.strokeStyle = 'rgba(20,10,10,0.85)'; g.lineWidth = 6;
    g.beginPath(); g.moveTo(C * 0.1, C * 0.5); g.quadraticCurveTo(C * 0.5, C * 0.15, C * 0.9, C * 0.5); g.quadraticCurveTo(C * 0.5, C * 0.85, C * 0.1, C * 0.5); g.stroke();
    g.fillStyle = 'rgba(20,10,10,0.9)'; g.beginPath(); g.arc(C / 2, C / 2, C * 0.12, 0, Math.PI * 2); g.fill();
  });
  // 15 footprints (bare, wet)
  cell(15, (g, C) => {
    g.fillStyle = 'rgba(30,25,15,0.45)';
    for (let i = 0; i < 4; i++) {
      const x = C * (0.35 + (i % 2) * 0.28), y = C * (0.85 - i * 0.22);
      g.beginPath(); g.ellipse(x, y, C * 0.05, C * 0.09, 0, 0, Math.PI * 2); g.fill();
    }
  });
  // 18-21: small door / room number plates (labels.num0..3), 22-24: level door signs
  const plate = (idx, text, opts = {}) => cell(idx, (g, C) => {
    g.fillStyle = opts.bg || '#d8d2bc'; g.fillRect(C * 0.12, C * 0.3, C * 0.76, C * 0.4);
    g.strokeStyle = opts.border || '#3a3428'; g.lineWidth = C * 0.025; g.strokeRect(C * 0.14, C * 0.32, C * 0.72, C * 0.36);
    g.fillStyle = opts.fg || '#2a2418'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = `bold ${Math.round(C * (opts.size || 0.2))}px Arial, sans-serif`;
    g.fillText(text, C / 2, C / 2);
  });
  for (let k = 0; k < 4; k++) plate(18 + k, labels['num' + k] || String(200 + k * 7));
  for (let k = 0; k < 3; k++) plate(22 + k, labels['lvl' + k] || 'LEVEL ' + k, { bg: '#1c2326', fg: '#e8e2c0', border: '#c9a640', size: 0.15 });
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export function decalUV(name) {
  const idx = Math.max(0, DECALS.indexOf(name));
  const x = (idx % GRID) / GRID, y = 1 - (Math.floor(idx / GRID) + 1) / GRID;
  return [x, y, x + 1 / GRID, y + 1 / GRID];
}

// One EXIT sign: dir r/l/u/d, style per level.
function drawExitSign(g, C, dir, style, rough, paint) {
  const arrowPts = (cx, cy, len, head) => {
    const v = { r: [1, 0], l: [-1, 0], u: [0, -1], d: [0, 1] }[dir];
    const ax = cx - v[0] * len / 2, ay = cy - v[1] * len / 2, bx = cx + v[0] * len / 2, by = cy + v[1] * len / 2;
    const px = -v[1], py = v[0];
    return [[ax, ay], [bx, by], [bx - v[0] * head + px * head, by - v[1] * head + py * head], [bx, by], [bx - v[0] * head - px * head, by - v[1] * head - py * head]];
  };
  const solidArrow = (cx, cy, len, w, col) => {
    const P = arrowPts(cx, cy, len, w * 1.6);
    g.strokeStyle = col; g.lineWidth = w; g.lineCap = 'butt'; g.lineJoin = 'miter';
    g.beginPath(); g.moveTo(P[0][0], P[0][1]); g.lineTo(P[1][0], P[1][1]); g.stroke();
    g.beginPath(); g.moveTo(P[2][0], P[2][1]); g.lineTo(P[1][0], P[1][1]); g.lineTo(P[4][0], P[4][1]); g.stroke();
  };
  const text = (t, x, y, size, col, font = 'Impact, Arial Black, sans-serif') => { g.fillStyle = col; g.font = `bold ${Math.round(C * size)}px ${font}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(t, x, y); };
  const horiz = dir === 'r' || dir === 'l';
  if (style === 'stencil') {
    // L1: yellow stencil on a black hazard plate
    g.fillStyle = '#1a1814'; g.fillRect(C * 0.06, C * 0.2, C * 0.88, C * 0.6);
    g.fillStyle = '#d9a52a';
    for (let i = 0; i < 9; i++) { g.save(); g.beginPath(); g.rect(C * 0.06, C * 0.2, C * 0.88, C * 0.06); g.clip(); g.fillRect(C * (0.04 + i * 0.11), C * 0.2, C * 0.05, C * 0.06); g.restore(); }
    text('EXIT', horiz ? C * (dir === 'r' ? 0.36 : 0.64) : C * 0.32, C * 0.53, 0.2, '#e8b830', 'Courier New, monospace');
    solidArrow(horiz ? C * (dir === 'r' ? 0.74 : 0.26) : C * 0.72, C * 0.53, horiz ? C * 0.26 : C * 0.3, C * 0.07, '#e8b830');
  } else if (style === 'emergency') {
    // L2: green illuminated emergency sign with a running figure
    g.fillStyle = '#e8efe8'; g.fillRect(C * 0.08, C * 0.26, C * 0.84, C * 0.48);
    g.fillStyle = '#1f9a52'; g.fillRect(C * 0.11, C * 0.29, C * 0.78, C * 0.42);
    text('EXIT', C * 0.5, C * 0.39, 0.13, '#f4fff4', 'Arial, sans-serif');
    solidArrow(horiz ? C * (dir === 'r' ? 0.62 : 0.38) : C * 0.62, C * 0.58, horiz ? C * 0.28 : C * 0.16, C * 0.05, '#f4fff4');
    g.fillStyle = '#f4fff4'; g.beginPath(); g.arc(horiz ? C * (dir === 'r' ? 0.25 : 0.75) : C * 0.3, C * 0.52, C * 0.025, 0, 7); g.fill();
    g.fillRect(horiz ? C * (dir === 'r' ? 0.235 : 0.735) : C * 0.285, C * 0.55, C * 0.03, C * 0.08);
  } else if (style === 'mosaic') {
    // L3: blue tile mosaic set into the white tiles
    const t = C * 0.07;
    const on = (x, y) => { g.fillStyle = '#2a68b8'; g.fillRect(x + 1, y + 1, t - 2, t - 2); };
    const v = { r: [1, 0], l: [-1, 0], u: [0, -1], d: [0, 1] }[dir];
    for (let k = -4; k <= 4; k++) on(C / 2 + v[0] * k * t - t / 2, C * 0.62 + v[1] * k * t - t / 2);
    for (let k = 1; k <= 3; k++) for (const sgn of [-1, 1]) on(C / 2 + v[0] * (4 - k) * t + -v[1] * sgn * k * t - t / 2, C * 0.62 + v[1] * (4 - k) * t + v[0] * sgn * k * t - t / 2);
    text('EXIT', C * 0.5, C * 0.24, 0.13, '#2a68b8', 'Arial Black, sans-serif');
  } else if (style === 'plaque') {
    // L4: brass plaque with engraved letters
    g.fillStyle = '#9a7a3a'; g.fillRect(C * 0.12, C * 0.3, C * 0.76, C * 0.4);
    g.strokeStyle = '#d8b868'; g.lineWidth = C * 0.02; g.strokeRect(C * 0.15, C * 0.33, C * 0.7, C * 0.34);
    text('EXIT', horiz ? C * (dir === 'r' ? 0.38 : 0.62) : C * 0.36, C * 0.5, 0.13, '#3a2a10', 'Georgia, serif');
    solidArrow(horiz ? C * (dir === 'r' ? 0.7 : 0.3) : C * 0.68, C * 0.5, horiz ? C * 0.2 : C * 0.22, C * 0.04, '#3a2a10');
  } else if (style === 'chalk') {
    rough(g, arrowPts(C * 0.5, C * 0.6, C * 0.5, C * 0.16), C * 0.04, 'rgba(235,235,225,0.85)');
    text('EXIT', C * 0.5, C * 0.24, 0.16, 'rgba(235,235,225,0.85)', 'Arial, sans-serif');
  } else {
    // L0: red spray paint
    rough(g, arrowPts(C * 0.5, horiz ? C * 0.6 : C * 0.62, horiz ? C * 0.76 : C * 0.46, C * 0.2), C * 0.085, paint);
    text('EXIT', horiz ? C * 0.47 : C * 0.5, horiz ? C * 0.3 : C * 0.2, 0.2, paint);
  }
}
