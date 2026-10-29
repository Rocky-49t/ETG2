// Settings panel, wanderer customization (with a live 3D preview) and help.
import * as THREE from 'three';
import { settings, QUALITY_PRESETS } from '../core/settings.js';
import { Avatar, SKIN_OPTIONS, randomSkin, normalizeSkin } from '../game/avatar.js';
import { audio } from '../audio/audio.js';

const $ = id => document.getElementById(id);

export function buildSettings(container, onChange) {
  container.innerHTML = '';
  const row = (label, el, val) => {
    const r = document.createElement('div');
    r.className = 'srow';
    r.innerHTML = `<span>${label}</span>`;
    r.appendChild(el);
    const v = document.createElement('span'); v.className = 'val'; v.textContent = val ?? '';
    r.appendChild(v);
    container.appendChild(r);
    return v;
  };
  // quality
  const seg = document.createElement('div'); seg.className = 'seg';
  for (const [k, p] of Object.entries(QUALITY_PRESETS)) {
    const b = document.createElement('button');
    b.textContent = p.label;
    b.classList.toggle('on', settings.get('quality') === k);
    b.onclick = () => { settings.set('quality', k); seg.querySelectorAll('button').forEach(x => x.classList.remove('on')); b.classList.add('on'); onChange?.('quality'); };
    seg.appendChild(b);
  }
  row('Graphics', seg);
  const slider = (key, label, min, max, step, fmt) => {
    const s = document.createElement('input');
    s.type = 'range'; s.min = min; s.max = max; s.step = step; s.value = settings.get(key);
    const v = row(label, s, fmt(settings.get(key)));
    s.oninput = () => { settings.set(key, Number(s.value)); v.textContent = fmt(Number(s.value)); };
  };
  const pct = v => Math.round(v * 100) + '%';
  slider('masterVolume', 'Master volume', 0, 1, 0.01, pct);
  slider('sfxVolume', 'Effects volume', 0, 1, 0.01, pct);
  slider('musicVolume', 'Ambience volume', 0, 1, 0.01, pct);
  slider('sensitivity', 'Mouse sensitivity', 0.2, 3, 0.05, v => v.toFixed(2));
  slider('fov', 'Field of view', 60, 100, 1, v => v + '°');
  const toggle = (key, label) => {
    const c = document.createElement('input'); c.type = 'checkbox'; c.checked = !!settings.get(key);
    c.onchange = () => settings.set(key, c.checked);
    row(label, c);
  };
  toggle('invertY', 'Invert mouse Y');
  toggle('headBob', 'Head bob');
  toggle('flashing', 'Intense visual effects');
  toggle('showFps', 'Show FPS');
}

export class Customizer {
  constructor(onSave) {
    this.onSave = onSave;
    this.skin = normalizeSkin(settings.get('skin'));
    this.canvas = $('avatarPreview');
    this.renderer = null;
    this.rot = 0.4;
    this.dragging = false;
    this.canvas.addEventListener('pointerdown', e => { this.dragging = true; this.lx = e.clientX; this.canvas.setPointerCapture(e.pointerId); });
    this.canvas.addEventListener('pointermove', e => { if (this.dragging) { this.rot += (e.clientX - this.lx) * 0.01; this.lx = e.clientX; } });
    this.canvas.addEventListener('pointerup', () => { this.dragging = false; });
    $('btnRandomSkin').onclick = () => { this.skin = normalizeSkin(randomSkin()); this.rebuild(); this.buildFields(); };
  }

  open() {
    this.skin = normalizeSkin(settings.get('skin'));
    if (!this.renderer) {
      try {
        this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: true });
        this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(32, 320 / 420, 0.1, 20);
        this.camera.position.set(0, 1.25, 4.2);
        this.camera.lookAt(0, 1.0, 0);
        this.scene.add(new THREE.HemisphereLight(0xfff2cc, 0x30281a, 1.2));
        const key = new THREE.DirectionalLight(0xfff0d0, 2.2); key.position.set(2, 3, 3); this.scene.add(key);
        const rim = new THREE.DirectionalLight(0x9fb4ff, 1.2); rim.position.set(-2, 2, -3); this.scene.add(rim);
        const floor = new THREE.Mesh(new THREE.CircleGeometry(0.8, 32), new THREE.MeshStandardMaterial({ color: 0x3a3320, roughness: 1 }));
        floor.rotation.x = -Math.PI / 2;
        this.scene.add(floor);
      } catch { this.renderer = null; }
    }
    this.rebuild();
    this.buildFields();
    this.active = true;
    const loop = () => {
      if (!this.active) return;
      requestAnimationFrame(loop);
      if (!this.renderer) return;
      if (!this.dragging) this.rot += 0.004;
      this.avatar.group.rotation.y = this.rot;
      this.avatar.animate(1 / 60, { speed: 0 });
      this.renderer.render(this.scene, this.camera);
    };
    loop();
  }

  close() { this.active = false; settings.set('skin', this.skin); this.onSave?.(this.skin); }

  rebuild() {
    if (!this.scene) return;
    if (this.avatar) this.scene.remove(this.avatar.group);
    this.avatar = new Avatar(this.skin);
    this.scene.add(this.avatar.group);
  }

  buildFields() {
    const box = $('customFields');
    box.innerHTML = '';
    const labels = { skinTone: 'Skin', hair: 'Hair', hairColor: 'Hair colour', headwear: 'Headwear', headwearColor: 'Hat colour', shirt: 'Top', shirtColor: 'Top colour', pantsColor: 'Pants', shoesColor: 'Shoes', accessory: 'Accessory' };
    // name first
    const nameRow = document.createElement('div');
    nameRow.className = 'crow';
    nameRow.innerHTML = '<label>Name</label>';
    const nameIn = document.createElement('input');
    nameIn.maxLength = 18; nameIn.value = settings.get('playerName') || ''; nameIn.placeholder = 'Wanderer';
    nameIn.oninput = () => settings.set('playerName', nameIn.value.trim());
    nameRow.appendChild(nameIn);
    box.appendChild(nameRow);
    for (const [k, opts] of Object.entries(SKIN_OPTIONS)) {
      const r = document.createElement('div');
      r.className = 'crow';
      r.innerHTML = `<label>${labels[k] || k}</label>`;
      const wrap = document.createElement('div');
      const isColor = opts[0].startsWith('#');
      wrap.className = isColor ? 'swatches' : 'opts';
      for (const o of opts) {
        const el = document.createElement(isColor ? 'div' : 'button');
        if (isColor) { el.className = 'swatch'; el.style.background = o; }
        else { el.className = 'opt small'; el.textContent = o; }
        el.classList.toggle('on', this.skin[k] === o);
        el.onclick = () => { this.skin[k] = o; this.rebuild(); this.buildFields(); audio.play('ui', { freq: 700 }); };
        wrap.appendChild(el);
      }
      if (isColor) {
        const custom = document.createElement('input');
        custom.type = 'color';
        custom.value = this.skin[k];
        custom.oninput = () => { this.skin[k] = custom.value; this.rebuild(); };
        wrap.appendChild(custom);
      }
      r.appendChild(wrap);
      box.appendChild(r);
    }
  }
}
