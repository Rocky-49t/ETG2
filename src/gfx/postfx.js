// Post-processing chain: scene render -> (GTAO) -> (bloom) -> tone map -> grade.
// The grade pass carries all of the "feel": vignette, grain, chromatic
// aberration, sanity warping, underwater tint, damage flash and fades.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    time: { value: 0 },
    resolution: { value: new THREE.Vector2(1, 1) },
    sanity: { value: 0 },
    damage: { value: 0 },
    underwater: { value: 0 },
    vignette: { value: 0.45 },
    grain: { value: 0.045 },
    aberration: { value: 0.0015 },
    fade: { value: 0 },
    flash: { value: 0 },
    lift: { value: new THREE.Vector3(0, 0, 0) },
    gamma: { value: new THREE.Vector3(1, 1, 1) },
    gain: { value: new THREE.Vector3(1, 1, 1) },
    saturation: { value: 1 },
    tint: { value: new THREE.Vector3(1, 1, 1) },
    downed: { value: 0 },
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform float time, sanity, damage, underwater, vignette, grain, aberration, fade, flash, saturation, downed;
    uniform vec2 resolution;
    uniform vec3 lift, gamma, gain, tint;
    varying vec2 vUv;

    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

    void main() {
      vec2 uv = vUv;
      vec2 cc = uv - 0.5;
      // Warping: underwater ripples and sanity "breathing" of the walls.
      float w = underwater * 0.0055 + sanity * sanity * 0.006;
      uv += vec2(sin(uv.y * 23.0 + time * 2.1), cos(uv.x * 17.0 + time * 1.6)) * w;
      float breathe = sanity * sanity * 0.018 * sin(time * 0.9);
      uv = 0.5 + (uv - 0.5) * (1.0 - breathe);

      float ab = aberration + sanity * 0.007 + damage * 0.012 + downed * 0.006;
      vec2 off = cc * ab;
      vec3 col;
      col.r = texture2D(tDiffuse, uv + off).r;
      col.g = texture2D(tDiffuse, uv).g;
      col.b = texture2D(tDiffuse, uv - off).b;

      // Ghost double image at very low sanity
      if (sanity > 0.55) {
        vec2 g = vec2(sin(time * 0.7), cos(time * 0.53)) * 0.012 * (sanity - 0.55);
        col = mix(col, texture2D(tDiffuse, uv + g).rgb, 0.25 * (sanity - 0.55) * 2.0);
      }

      // Lift / gamma / gain grade
      col = col * gain + lift * (1.0 - col);
      col = pow(max(col, 0.0), 1.0 / gamma);
      float l = dot(col, vec3(0.299, 0.587, 0.114));
      col = mix(vec3(l), col, saturation * (1.0 - sanity * 0.45) * (1.0 - downed * 0.7));
      col *= tint;

      // Underwater tint and depth falloff
      col = mix(col, col * vec3(0.32, 0.78, 0.86) + vec3(0.0, 0.025, 0.04), underwater * 0.85);

      float d = length(cc * vec2(resolution.x / resolution.y, 1.0));
      float vig = smoothstep(0.95 - sanity * 0.25 - downed * 0.3, 0.2, d);
      col *= mix(1.0, vig, clamp(vignette + sanity * 0.35 + downed * 0.4, 0.0, 1.0));

      // Damage: red bloom from the edges
      col = mix(col, vec3(0.45, 0.02, 0.01), damage * smoothstep(0.25, 0.85, d) * 0.75);
      col = mix(col, vec3(0.25, 0.0, 0.0), downed * smoothstep(0.1, 0.8, d) * 0.6);

      // Grain + faint scanline wobble when sanity is low
      float n = hash(vUv * resolution + fract(time * 13.37) * 100.0);
      col += (n - 0.5) * (grain + sanity * 0.05);
      col *= 1.0 - sanity * 0.06 * (0.5 + 0.5 * sin(vUv.y * resolution.y * 0.9 + time * 14.0));

      col = mix(col, vec3(1.0, 0.97, 0.9), flash);
      col *= 1.0 - fade;
      gl_FragColor = vec4(col, 1.0);
    }
  `,
};

export class PostFX {
  constructor(renderer, scene, camera) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this.grade = null;
    this.composer = null;
    this.bloom = null;
    this.gtao = null;
  }

  build(preset, width, height) {
    if (this.composer) {
      this.composer.passes.forEach(p => p.dispose?.());
      this.composer.dispose?.();
    }
    const r = this.renderer;
    const composer = new EffectComposer(r);
    composer.setPixelRatio(r.getPixelRatio());
    composer.setSize(width, height);
    composer.addPass(new RenderPass(this.scene, this.camera));

    this.gtao = null;
    if (preset.ao) {
      const gtao = new GTAOPass(this.scene, this.camera, width, height);
      gtao.output = GTAOPass.OUTPUT.Default;
      gtao.blendIntensity = 0.85;
      gtao.updateGtaoMaterial({ radius: 0.6, distanceExponent: 1.5, thickness: 1.2, scale: 1.0, samples: 12 });
      gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 12 });
      composer.addPass(gtao);
      this.gtao = gtao;
    }

    this.bloom = null;
    if (preset.bloom) {
      const bloom = new UnrealBloomPass(new THREE.Vector2(width / 2, height / 2), 0.55, 0.55, 0.82);
      composer.addPass(bloom);
      this.bloom = bloom;
    }
    composer.addPass(new OutputPass());
    const prevUniforms = this.grade?.uniforms;
    const grade = new ShaderPass(GradeShader);
    if (prevUniforms) {
      for (const k of Object.keys(prevUniforms)) {
        if (k === 'tDiffuse') continue;
        const v = prevUniforms[k].value;
        grade.uniforms[k].value = v && v.clone ? v.clone() : v;
      }
    }
    composer.addPass(grade);
    this.grade = grade;
    this.composer = composer;
    this.setSize(width, height);
  }

  setSize(w, h) {
    if (!this.composer) return;
    this.composer.setPixelRatio(this.renderer.getPixelRatio());
    this.composer.setSize(w, h);
    const pr = this.renderer.getPixelRatio();
    this.grade.uniforms.resolution.value.set(w * pr, h * pr);
  }

  // Level-specific colour grade.
  setGrade(g = {}) {
    const u = this.grade.uniforms;
    u.lift.value.set(...(g.lift || [0, 0, 0]));
    u.gamma.value.set(...(g.gamma || [1, 1, 1]));
    u.gain.value.set(...(g.gain || [1, 1, 1]));
    u.tint.value.set(...(g.tint || [1, 1, 1]));
    u.saturation.value = g.saturation ?? 1;
    u.vignette.value = g.vignette ?? 0.45;
    u.grain.value = g.grain ?? 0.045;
    if (this.bloom) {
      this.bloom.strength = g.bloomStrength ?? 0.55;
      this.bloom.threshold = g.bloomThreshold ?? 0.82;
      this.bloom.radius = g.bloomRadius ?? 0.55;
    }
  }

  get u() { return this.grade.uniforms; }

  render(dt) {
    this.grade.uniforms.time.value += dt;
    this.composer.render(dt);
  }
}
