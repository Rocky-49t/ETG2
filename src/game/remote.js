// Remote players: interpolated avatars with nameplates, held items, a fake
// volumetric flashlight beam (plus a small pool of real spotlights for the
// nearest beams), and downed/revive state.
import * as THREE from 'three';
import { Avatar } from './avatar.js';
import { itemModel } from './models.js';
import { angleDiff } from '../core/rng.js';
import { CLASSES } from './classes.js';
import { input } from '../core/input.js';

const TWO_HANDED = new Set(['shotgun', 'smg', 'rifle']);

function beamMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { color: { value: new THREE.Color(0xfff1d0) }, strength: { value: 0.18 } },
    vertexShader: `varying float vY; varying vec3 vN; varying vec3 vV;
      void main(){ vY = -position.y / 12.0; vec4 mv = modelViewMatrix * vec4(position,1.0); vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }`,
    fragmentShader: `uniform vec3 color; uniform float strength; varying float vY; varying vec3 vN; varying vec3 vV;
      void main(){ float edge = pow(abs(dot(vN, vV)), 1.5); float a = strength * (1.0 - clamp(vY,0.0,1.0)) * edge; gl_FragColor = vec4(color * a, a); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
}

export class RemotePlayer {
  constructor(game, id, info) {
    this.game = game;
    this.id = id;
    this.name = info.name || 'Wanderer';
    this.skin = info.skin;
    this.avatar = new Avatar(info.skin);
    this.group = this.avatar.group;
    this.buf = [];
    this.st = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0 };
    this.levelId = info.lvl || null;
    this.heldId = null;
    const geo = new THREE.ConeGeometry(2.6, 12, 16, 1, true);
    geo.translate(0, -6, 0);
    geo.rotateX(-Math.PI / 2);
    this.beam = new THREE.Mesh(geo, beamMaterial());
    this.beam.visible = false;
    this.beam.renderOrder = 4;
    game.engine.scene.add(this.group);
    game.engine.scene.add(this.beam);
    this.plate = document.createElement('div');
    this.plate.className = 'nameplate';
    document.body.appendChild(this.plate);
    this.updatePlate();
  }

  updatePlate() {
    const C = CLASSES[this.classId];
    this.plate.innerHTML = `<span style="color:${this.skin?.shirtColor || '#fff'}">●</span> ${escapeHtml(this.name)}` + (C ? `<span class="np-class" style="color:${C.color}">${C.icon} ${C.name}</span>` : '') + (this.st.downed ? `<span class="np-down">DOWNED — hold ${input.label('interact')} to revive</span>` : '');
  }

  setInfo(info) {
    if (info.name && info.name !== this.name) { this.name = info.name; this.updatePlate(); }
    if (info.skin && JSON.stringify(info.skin) !== JSON.stringify(this.skin)) {
      this.skin = info.skin;
      this.game.engine.scene.remove(this.group);
      this.avatar = new Avatar(info.skin);
      this.group = this.avatar.group;
      this.game.engine.scene.add(this.group);
      this.heldId = null;
    }
  }

  push(s, t) {
    this.buf.push({ t, s });
    if (this.buf.length > 8) this.buf.shift();
    const wasDown = this.st.downed;
    this.levelId = s.lvl;
    this.st.downed = s.dn; this.st.dead = s.dd; this.st.hidden = s.hd;
    if (wasDown !== s.dn || s.cl !== this.classId) { this.classId = s.cl; this.updatePlate(); }
  }

  update(dt, now) {
    const g = this.game;
    const same = this.levelId === g.levelId && !this.st.dead && !this.st.hidden;
    this.group.visible = same;
    if (!same) { this.beam.visible = false; this.plate.style.display = 'none'; return; }
    const rt = now - 0.1;
    const b = this.buf;
    if (!b.length) return;
    let a = b[0], c = b[b.length - 1];
    for (let i = 0; i < b.length - 1; i++) if (b[i].t <= rt && b[i + 1].t >= rt) { a = b[i]; c = b[i + 1]; break; }
    const span = c.t - a.t;
    const k = span > 0 ? Math.min(1, Math.max(0, (rt - a.t) / span)) : 1;
    const s0 = a.s, s1 = c.s, st = this.st;
    st.x = s0.x + (s1.x - s0.x) * k; st.y = s0.y + (s1.y - s0.y) * k; st.z = s0.z + (s1.z - s0.z) * k;
    st.yaw = s0.yw + angleDiff(s0.yw, s1.yw) * k; st.pitch = s0.pt + (s1.pt - s0.pt) * k;
    const L = k > 0.5 ? s1 : s0;
    const speed = span > 0 ? Math.hypot(s1.x - s0.x, s1.z - s0.z) / span : 0;
    this.group.position.set(st.x, st.y, st.z);
    this.group.rotation.y = st.yaw + Math.PI;
    if (L.hi !== this.heldId) {
      this.heldId = L.hi;
      this.avatar.setHeld(L.hi ? itemModel(L.hi) : null);
    }
    this.crouch = !!L.cr;
    this.avatar.animate(dt, { speed, crouch: L.cr, swim: L.sw, downed: L.dn, holding: !!L.hi, twoHanded: TWO_HANDED.has(L.hi), pitch: st.pitch, using: L.us || null, swingT: L.sw2 });
    // footsteps
    if (speed > 0.5 && !L.sw && !L.dn) {
      this.stepT = (this.stepT ?? 0) - dt * speed / 1.7;
      if (this.stepT <= 0) { this.stepT = 1; g.sfx('step', { x: st.x, y: st.y, z: st.z }, { surface: g.surfaceAt(st), volume: L.cr ? 0.25 : speed > 4.5 ? 0.9 : 0.55, ref: 2 }); }
    }
    // beam
    this.lightOn = !!L.fl;
    this.focus = !!L.fo;
    this.beam.visible = this.lightOn;
    if (this.lightOn) {
      const ey = st.y + (L.cr ? 1.0 : 1.5);
      this.beam.position.set(st.x, ey, st.z);
      this.beam.rotation.set(st.pitch, st.yaw, 0, 'YXZ');
      this.beam.material.uniforms.strength.value = this.focus ? 0.28 : 0.13;
      this.beam.scale.set(this.focus ? 0.5 : 1, this.focus ? 0.5 : 1, 1);
    }
    // nameplate
    const p = new THREE.Vector3(st.x, st.y + (L.dn ? 0.8 : 2.15), st.z).project(g.engine.camera);
    const vis = p.z < 1 && Math.abs(p.x) < 1.1 && Math.abs(p.y) < 1.1;
    const dist = Math.hypot(st.x - g.engine.camera.position.x, st.z - g.engine.camera.position.z);
    if (vis && dist < 30 && !g.hidden) {
      this.plate.style.display = 'block';
      this.plate.style.left = ((p.x + 1) / 2 * window.innerWidth) + 'px';
      this.plate.style.top = ((1 - p.y) / 2 * window.innerHeight) + 'px';
      this.plate.style.opacity = String(Math.max(0.2, 1 - dist / 30));
    } else this.plate.style.display = 'none';
  }

  dispose() {
    this.game.engine.scene.remove(this.group);
    this.game.engine.scene.remove(this.beam);
    this.plate.remove();
  }
}

function escapeHtml(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
export { escapeHtml };
