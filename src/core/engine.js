// Renderer / scene / camera ownership, quality presets and the frame loop.
import * as THREE from 'three';
import { PostFX } from '../gfx/postfx.js';
import { settings } from './settings.js';

export class Engine {
  constructor(container) {
    this.container = container;
    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', stencil: false });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.info.autoReset = false; // reset once per frame so stats cover all passes
    this.stats = { calls: 0, tris: 0 };
    container.appendChild(this.renderer.domElement);
    this.canvas = this.renderer.domElement;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x000000);
    this.camera = new THREE.PerspectiveCamera(settings.get('fov'), 1, 0.05, 400);
    this.camera.rotation.order = 'YXZ';
    this.scene.add(this.camera);

    this.post = new PostFX(this.renderer, this.scene, this.camera);
    this.preset = settings.preset;
    this.updaters = new Set();
    this.clock = new THREE.Clock();
    this.fps = 60;
    this._fpsAcc = 0;
    this._fpsFrames = 0;
    this.running = false;
    this.maxAnisotropy = this.renderer.capabilities.getMaxAnisotropy();

    window.addEventListener('resize', () => this.resize());
    settings.on('change:quality', () => this.applyQuality());
    settings.on('change:fov', v => { this.camera.fov = v; this.camera.updateProjectionMatrix(); });
    this.applyQuality();
  }

  applyQuality() {
    this.preset = settings.preset;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.renderer.setPixelRatio(Math.max(0.5, Math.min(dpr, this.preset.pixelRatio * Math.min(dpr, 1.25))));
    this.renderer.shadowMap.enabled = this.preset.shadows;
    this.resize(true);
    this.post.build(this.preset, this.width, this.height);
    this.onQualityChange?.(this.preset);
  }

  resize(skipPost) {
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.renderer.setSize(this.width, this.height);
    this.camera.aspect = this.width / this.height;
    this.camera.updateProjectionMatrix();
    if (!skipPost) this.post.setSize(this.width, this.height);
  }

  start(update) {
    this.update = update;
    if (this.running) return;
    this.running = true;
    this.clock.start();
    const loop = () => {
      if (!this.running) return;
      requestAnimationFrame(loop);
      const dt = Math.min(this.clock.getDelta(), 0.1);
      this._fpsAcc += dt;
      this._fpsFrames++;
      if (this._fpsAcc > 0.5) {
        this.fps = this._fpsFrames / this._fpsAcc;
        this._fpsAcc = 0;
        this._fpsFrames = 0;
      }
      this.update?.(dt);
      this.renderer.info.reset();
      this.post.render(dt);
      this.stats.calls = this.renderer.info.render.calls;
      this.stats.tris = this.renderer.info.render.triangles;
    };
    requestAnimationFrame(loop);
  }
}
