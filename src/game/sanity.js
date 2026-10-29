// Local sanity effects: post-processing distortion, heartbeat, whispers,
// phantom footsteps, and shadow-figure hallucinations that only the local
// player sees (and that vanish when stared at or approached).
import * as THREE from 'three';
import { damp } from '../core/rng.js';

export class SanityFX {
  constructor(game) {
    this.game = game;
    this.level = 0;          // 0 = sane, 1 = broken
    this.heartT = 0;
    this.whisperT = 20;
    this.phantomT = 40;
    this.figureT = 30;
    this.figure = null;
    this.figureMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.92, depthWrite: true, fog: false });
  }

  makeFigure() {
    const g = new THREE.Group();
    const m = this.figureMat;
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.22, 1.3, 8), m); body.position.y = 1.05; g.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.15, 10, 8), m); head.position.y = 1.85; head.scale.y = 1.2; g.add(head);
    for (const s of [-1, 1]) {
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.03, 0.9, 6), m); arm.position.set(s * 0.24, 1.1, 0); arm.rotation.z = s * 0.08; g.add(arm);
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.04, 0.8, 6), m); leg.position.set(s * 0.09, 0.4, 0); g.add(leg);
    }
    const eyes = new THREE.MeshBasicMaterial({ color: 0xffffff });
    for (const s of [-1, 1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.014, 6, 4), eyes); e.position.set(s * 0.05, 1.88, 0.13); g.add(e); }
    return g;
  }

  update(dt) {
    const g = this.game;
    const s = g.stats.sanity;
    const target = Math.max(0, Math.min(1, (70 - s) / 70));
    this.level = damp(this.level, target, 1.5, dt);
    const L = this.level;
    const u = g.engine.post.u;
    u.sanity.value = L * (g.settingsFlashing ? 1 : 0.7);

    if (g.dead || g.spectating) { this.removeFigure(); return; }
    // heartbeat under 35 sanity or low health
    const hb = Math.max(L > 0.55 ? L : 0, g.stats.health < 30 ? 0.8 : 0);
    if (hb > 0) {
      this.heartT -= dt;
      if (this.heartT <= 0) { this.heartT = 1.15 - hb * 0.45; g.sfx('heartbeat', null, { volume: 0.25 + hb * 0.45, reverb: 0 }); }
    }
    // whispers
    if (L > 0.3) {
      this.whisperT -= dt * L;
      if (this.whisperT <= 0) {
        this.whisperT = 12 + Math.random() * 18;
        const c = g.engine.camera.position;
        const a = Math.random() * Math.PI * 2;
        g.sfx('whisper', { x: c.x + Math.cos(a) * 2, y: c.y, z: c.z + Math.sin(a) * 2 }, { volume: 0.3 + L * 0.5, ref: 1.5 });
      }
    }
    // phantom footsteps / knocks behind the player
    if (L > 0.45) {
      this.phantomT -= dt * L;
      if (this.phantomT <= 0) {
        this.phantomT = 25 + Math.random() * 30;
        const c = g.engine.camera.position;
        const back = g.player.yaw;
        g.sfx(Math.random() < 0.6 ? 'footstepsFake' : 'hushClick', { x: c.x + Math.sin(back) * 6, y: c.y - 1, z: c.z + Math.cos(back) * 6 }, { volume: 0.6, surface: g.surfaceAt(c) });
      }
    }
    // shadow figures
    if (this.figure) this.updateFigure(dt);
    else if (L > 0.5) {
      this.figureT -= dt * L;
      if (this.figureT <= 0) { this.figureT = 30 + Math.random() * 40; this.spawnFigure(); }
    }
  }

  spawnFigure() {
    const g = this.game;
    const cam = g.engine.camera;
    // place it at the edge of view, 10-18 m away, on a walkable tile with LOS
    for (let k = 0; k < 20; k++) {
      const side = Math.random() < 0.5 ? -1 : 1;
      const a = g.player.yaw + side * (0.45 + Math.random() * 0.25);
      const d = 9 + Math.random() * 9;
      const x = cam.position.x - Math.sin(a) * d, z = cam.position.z - Math.cos(a) * d;
      const f = g.level.floorAt(x, z);
      if (!isFinite(f) || Math.abs(f - g.player.pos.y) > 1.5) continue;
      if (!g.level.lineOfSight(cam.position.x, cam.position.y, cam.position.z, x, f + 1.5, z)) continue;
      this.figure = this.makeFigure();
      this.figure.position.set(x, f, z);
      this.figure.lookAt(cam.position.x, f, cam.position.z);
      this.figure.userData.life = 6 + Math.random() * 6;
      g.engine.scene.add(this.figure);
      return;
    }
  }

  updateFigure(dt) {
    const g = this.game;
    const f = this.figure;
    const cam = g.engine.camera;
    f.userData.life -= dt;
    const to = new THREE.Vector3().subVectors(f.position, cam.position);
    to.y += 1.5;
    const d = to.length();
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
    const look = to.normalize().dot(fwd);
    // staring straight at it, getting close, or shining a light: it's gone
    if (look > 0.96 || d < 5 || f.userData.life <= 0 || (g.lights.on && look > 0.9)) {
      if (look > 0.96 && Math.random() < 0.4) g.sfx('whisper', null, { volume: 0.35 });
      this.removeFigure();
      g.stats.scare(1.5);
    }
  }

  removeFigure() {
    if (!this.figure) return;
    this.game.engine.scene.remove(this.figure);
    this.figure = null;
  }
}
