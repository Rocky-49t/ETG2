// Light sources carried or created by the local player: flashlight (with
// battery drain, flicker and a focused beam), muzzle flashes, the lighter
// flame, and a small pool of lights for thrown glowsticks/flares.
// Lights are allocated once and never removed (avoids shader recompiles).
import * as THREE from 'three';
import { noise1 } from '../core/rng.js';
import { settings } from '../core/settings.js';

function cookieTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.18, 'rgba(255,250,235,0.95)');
  grd.addColorStop(0.3, 'rgba(210,205,190,0.7)');
  grd.addColorStop(0.36, 'rgba(255,248,230,0.8)');
  grd.addColorStop(0.55, 'rgba(160,155,140,0.45)');
  grd.addColorStop(0.75, 'rgba(110,105,95,0.25)');
  grd.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = '#000'; g.fillRect(0, 0, 256, 256);
  g.fillStyle = grd; g.fillRect(0, 0, 256, 256);
  // lens smudges
  for (let i = 0; i < 40; i++) {
    g.fillStyle = `rgba(0,0,0,${Math.random() * 0.06})`;
    g.beginPath(); g.arc(128 + (Math.random() - 0.5) * 140, 128 + (Math.random() - 0.5) * 140, Math.random() * 18, 0, Math.PI * 2); g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class PlayerLights {
  constructor(game) {
    this.game = game;
    const scene = game.engine.scene;
    this.on = false;
    this.focus = false;
    this.flicker = 1;
    this.spot = new THREE.SpotLight(0xfff1dc, 0, 32, 0.5, 0.55, 1.7);
    this.spot.castShadow = settings.preset.shadows;
    this.spot.shadow.mapSize.set(settings.preset.shadowMapSize, settings.preset.shadowMapSize);
    this.spot.shadow.bias = -0.0004;
    this.spot.shadow.normalBias = 0.03;
    this.spot.shadow.camera.near = 0.2;
    this.spot.shadow.camera.far = 30;
    if (this.spot.castShadow) this.spot.map = cookieTexture();
    scene.add(this.spot);
    scene.add(this.spot.target);
    // soft fill so the area right around you isn't pitch black when the beam is on
    this.fill = new THREE.PointLight(0xfff1dc, 0, 4.5, 2);
    scene.add(this.fill);
    this.muzzleLight = new THREE.PointLight(0xffc070, 0, 12, 2);
    scene.add(this.muzzleLight);
    this.muzzleT = 0;
    this.lighter = new THREE.PointLight(0xff9a3a, 0, 6, 2);
    scene.add(this.lighter);
    this.pool = [];
    for (let i = 0; i < 4; i++) {
      const l = new THREE.PointLight(0xffffff, 0, 8, 2);
      scene.add(l);
      this.pool.push(l);
    }
    this.lowWarned = false;
    this._p = new THREE.Vector3();
  }

  get item() {
    const inv = this.game.inventory;
    let best = null;
    for (const s of inv.slots) if (s && s.id === 'flashlight' && (!best || s.data.charge > best.data.charge)) best = s;
    return best;
  }

  get charge() { const it = this.item; return it ? it.data.charge : 0; }

  toggle(force) {
    const g = this.game;
    const it = this.item;
    const want = force ?? !this.on;
    if (want && !it) { g.subtitle('You don\'t have a flashlight.', 1.5); return; }
    if (want && it.data.charge <= 0) { g.subtitle('The flashlight is dead. Find a battery.', 2); g.sfx('click', null, {}); return; }
    this.on = want;
    g.sfx('click', null, { volume: 0.8 });
    g.emitNoise(2);
  }

  muzzle(pos) {
    this.muzzleLight.position.copy(pos);
    this.muzzleT = 0.06;
  }

  update(dt, held) {
    const g = this.game;
    const it = this.item;
    if (this.on && !it) this.on = false;
    if (this.on) {
      const drain = (this.focus ? 1.4 : 0.42) * dt;
      it.data.charge = Math.max(0, it.data.charge - drain);
      if (it.data.charge <= 0) { this.on = false; g.subtitle('The flashlight dies.', 2); g.sfx('click', null, {}); }
      if (it.data.charge < 15 && !this.lowWarned) { this.lowWarned = true; g.subtitle('The beam is turning yellow. Battery low.', 2.2); }
      if (it.data.charge > 20) this.lowWarned = false;
      if (Math.random() < dt * 0.5) g.inventory.changed();
    }
    const t = performance.now() * 0.001;
    // flicker: low battery, low sanity, or director blackout
    let f = 1;
    const ch = this.charge;
    if (ch < 15) f *= noise1(t * 9, 3) > 0.25 + ch / 40 ? 1 : 0.25;
    if (g.stats.sanity < 25) f *= noise1(t * 6, 7) > 0.15 ? 1 : 0.4;
    if (g.flashFlickerT > 0) f *= Math.random() > 0.5 ? 1 : 0.05;
    this.flicker = f;
    const warm = ch < 15 ? 0.75 : 1;
    const cam = g.engine.camera;
    // spot from the lens, aimed along view direction
    // origin: the lens when a flashlight is visible in hand, otherwise a point
    // just ahead of the viewmodel (a weapon-mounted light) so held items
    // don't catch the beam point-blank
    if (g.viewmodel.flashModel.visible || g.viewmodel.itemId === 'flashlight') g.viewmodel.flashWorldPos(this._p);
    else this._p.copy(cam.position).add(new THREE.Vector3(0.04, -0.06, -0.62).applyQuaternion(cam.quaternion));
    this.spot.position.copy(this._p);
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
    this.spot.target.position.copy(cam.position).addScaledVector(fwd, 10);
    const on = this.on && !g.hidden;
    this.spot.intensity = on ? (this.focus ? 140 : 48) * f * warm : 0;
    this.spot.angle = this.focus ? 0.24 : 0.52;
    this.spot.penumbra = this.focus ? 0.35 : 0.6;
    this.spot.distance = this.focus ? 40 : 30;
    this.spot.color.setRGB(1, 0.95 * warm + 0.02, 0.86 * warm * warm);
    this.fill.position.copy(cam.position).addScaledVector(fwd, 1.2);
    this.fill.intensity = on ? 0.5 * f : 0;

    this.muzzleT = Math.max(0, this.muzzleT - dt);
    this.muzzleLight.intensity = this.muzzleT > 0 ? 25 * (this.muzzleT / 0.06) : 0;

    const lit = held?.lighterLit;
    if (lit) {
      g.viewmodel.model?.updateWorldMatrix(true, false);
      const fp = new THREE.Vector3(0.004, 0.07, 0);
      if (g.viewmodel.model) fp.applyMatrix4(g.viewmodel.model.matrixWorld); else fp.copy(cam.position);
      this.lighter.position.copy(fp);
      this.lighter.intensity = (2.6 + noise1(t * 14, 1) * 1.2);
    } else this.lighter.intensity = 0;
  }

  // assign pool lights to the closest light-emitting thrown objects
  assignThrown(list, camPos) {
    const sorted = list.filter(o => o.light).sort((a, b) => a.pos.distanceToSquared(camPos) - b.pos.distanceToSquared(camPos));
    for (let i = 0; i < this.pool.length; i++) {
      const l = this.pool[i], o = sorted[i];
      if (!o) { l.intensity = 0; continue; }
      l.position.set(o.pos.x, o.pos.y + 0.15, o.pos.z);
      l.color.set(o.light.color);
      l.distance = o.light.range;
      l.intensity = o.light.intensity * (o.light.flicker ? 0.75 + Math.random() * 0.25 : 1) * (o.fade ?? 1);
    }
  }
}
