// Water surfaces: transparent PBR material with two scrolling normal-map
// layers, environment reflections and baked lighting. One material per level.
import * as THREE from 'three';
import { worldUniforms, patchBaked } from './materials.js';

export function makeEnvMap(renderer, top, horizon, bottom, glow = null) {
  const scene = new THREE.Scene();
  const geo = new THREE.SphereGeometry(10, 32, 16);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    uniforms: { top: { value: new THREE.Color(top) }, mid: { value: new THREE.Color(horizon) }, bot: { value: new THREE.Color(bottom) } },
    vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: 'uniform vec3 top, mid, bot; varying vec3 vP; void main(){ float h = normalize(vP).y; vec3 c = h > 0.0 ? mix(mid, top, pow(h, 0.6)) : mix(mid, bot, pow(-h, 0.5)); gl_FragColor = vec4(c, 1.0); }',
  });
  scene.add(new THREE.Mesh(geo, mat));
  if (glow) {
    for (const [x, y, z, c, s] of glow) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(s, s), new THREE.MeshBasicMaterial({ color: c, side: THREE.DoubleSide }));
      m.position.set(x, y, z); m.lookAt(0, 0, 0); scene.add(m);
    }
  }
  const pmrem = new THREE.PMREMGenerator(renderer);
  const rt = pmrem.fromScene(scene, 0.02);
  pmrem.dispose();
  geo.dispose(); mat.dispose();
  return rt.texture;
}

export function makeWaterMaterial(lib, opts = {}) {
  const tex = lib.textureSet('waterNormal');
  const nm = tex.normalMap;
  const mat = new THREE.MeshStandardMaterial({
    color: opts.color ?? 0x2a6670,
    roughness: opts.roughness ?? 0.04,
    metalness: 0.0,
    transparent: true,
    opacity: opts.opacity ?? 0.78,
    normalMap: nm,
    normalScale: new THREE.Vector2(opts.normalScale ?? 0.35, opts.normalScale ?? 0.35),
    envMap: opts.envMap || null,
    envMapIntensity: opts.envIntensity ?? 1.0,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  patchBaked(mat, { variation: 0 });
  const baked = mat.onBeforeCompile;
  const speed = opts.flow ?? 1;
  mat.onBeforeCompile = shader => {
    baked(shader);
    shader.uniforms.waterTime = worldUniforms.time;
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float waterTime;')
      .replace('#include <normal_fragment_maps>', `
        #ifdef USE_NORMALMAP_TANGENTSPACE
          vec2 wuv = vNormalMapUv;
          vec3 n1 = texture2D(normalMap, wuv + vec2(waterTime * 0.021, waterTime * 0.013) * ${speed.toFixed(2)}).xyz * 2.0 - 1.0;
          vec3 n2 = texture2D(normalMap, wuv * 1.73 - vec2(waterTime * 0.016, -waterTime * 0.023) * ${speed.toFixed(2)}).xyz * 2.0 - 1.0;
          vec3 mapN = normalize(vec3(n1.xy + n2.xy, n1.z * n2.z));
          mapN.xy *= normalScale;
          normal = normalize(tbn * mapN);
        #endif
      `)
      // darker when looking straight down, brighter reflections at grazing angles
      .replace('#include <opaque_fragment>', `
        float fres = pow(1.0 - clamp(dot(normalize(vViewPosition), -normal) * -1.0, 0.0, 1.0), 3.0);
        diffuseColor.a = clamp(diffuseColor.a + fres * 0.35, 0.0, 1.0);
        #include <opaque_fragment>
      `);
  };
  mat.customProgramCacheKey = () => 'water' + speed;
  return mat;
}
