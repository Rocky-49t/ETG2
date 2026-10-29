// Keyboard / mouse input with pointer lock. Systems poll state each frame and
// consume edge-triggered presses via pressed(code).
import { settings } from './settings.js';

class Input {
  constructor() {
    this.down = new Set();
    this.justPressed = new Set();
    this.justReleased = new Set();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.wheel = 0;
    this.buttons = 0;
    this.locked = false;
    this.enabled = true; // false while typing in UI
    this.canvas = null;
    this.onLockChange = null;
  }

  attach(canvas) {
    this.canvas = canvas;
    window.addEventListener('keydown', e => {
      if (this.isTyping(e)) return;
      if (e.code === 'Tab' || e.code === 'Space' || (e.code.startsWith('Arrow'))) e.preventDefault();
      if (!this.down.has(e.code)) this.justPressed.add(e.code);
      this.down.add(e.code);
    });
    window.addEventListener('keyup', e => {
      this.down.delete(e.code);
      this.justReleased.add(e.code);
    });
    window.addEventListener('blur', () => { this.down.clear(); this.buttons = 0; });
    window.addEventListener('mousemove', e => {
      if (!this.locked) return;
      this.mouseDX += e.movementX || 0;
      this.mouseDY += e.movementY || 0;
    });
    canvas.addEventListener('mousedown', e => {
      if (!this.locked) return;
      const code = 'Mouse' + e.button;
      if (!this.down.has(code)) this.justPressed.add(code);
      this.down.add(code);
    });
    window.addEventListener('mouseup', e => {
      const code = 'Mouse' + e.button;
      if (this.down.has(code)) this.justReleased.add(code);
      this.down.delete(code);
    });
    window.addEventListener('wheel', e => { if (this.locked) this.wheel += Math.sign(e.deltaY); }, { passive: true });
    window.addEventListener('contextmenu', e => { if (this.locked || e.target === canvas) e.preventDefault(); });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
      if (!this.locked) { this.down.clear(); }
      this.onLockChange?.(this.locked);
    });
  }

  isTyping(e) {
    const t = e.target;
    return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable) && t.type !== 'range' && t.type !== 'checkbox';
  }

  lock() {
    if (!this.canvas || this.locked) return;
    try {
      const p = this.canvas.requestPointerLock({ unadjustedMovement: false });
      if (p && p.catch) p.catch(() => { try { this.canvas.requestPointerLock(); } catch { /* ignore */ } });
    } catch { /* ignore */ }
  }
  unlock() { if (document.pointerLockElement) document.exitPointerLock(); }

  isDown(code) { return this.enabled && this.down.has(code); }
  pressed(code) { return this.enabled && this.justPressed.has(code); }
  released(code) { return this.justReleased.has(code); }

  consumeMouse() {
    const s = 0.0022 * settings.get('sensitivity');
    const dx = this.mouseDX * s, dy = this.mouseDY * s * (settings.get('invertY') ? -1 : 1);
    this.mouseDX = 0;
    this.mouseDY = 0;
    return [dx, dy];
  }

  endFrame() {
    this.justPressed.clear();
    this.justReleased.clear();
    this.wheel = 0;
  }
}

export const input = new Input();
