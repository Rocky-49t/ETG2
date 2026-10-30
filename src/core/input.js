// Keyboard / mouse input with pointer lock. Systems poll state each frame and
// consume edge-triggered presses via pressed(code).
import { settings } from './settings.js';

// Rebindable actions: [id, label, default codes]. Settings store overrides
// under 'binds' as {id: [code, code2]}.
export const ACTIONS = [
  ['forward', 'Move forward', ['KeyW']], ['back', 'Move back', ['KeyS']], ['left', 'Strafe left', ['KeyA']], ['right', 'Strafe right', ['KeyD']],
  ['sprint', 'Sprint', ['ShiftLeft']], ['crouch', 'Crouch / swim down', ['KeyC', 'ControlLeft']], ['jump', 'Jump / swim up', ['Space']],
  ['use', 'Use / attack', ['Mouse0']], ['aim', 'Aim / focus beam', ['Mouse2']], ['interact', 'Interact (hold to revive)', ['KeyE']],
  ['reload', 'Reload', ['KeyR']], ['flashlight', 'Flashlight', ['KeyF']], ['drop', 'Drop held item', ['KeyG']],
  ['inventory', 'Inventory & crafting', ['Tab', 'KeyI']], ['journal', 'Journal', ['KeyJ']], ['chat', 'Chat', ['KeyT', 'Enter']],
  ['respawn', 'Hold to give up (when downed)', ['KeyX']], ['console', 'Cheat console', ['Backquote']],
  ...[1, 2, 3, 4, 5, 6, 7, 8].map(n => ['hotbar' + n, 'Hotbar slot ' + n, ['Digit' + n]]),
];
const DEFAULT_BINDS = Object.fromEntries(ACTIONS.map(a => [a[0], a[2]]));

export function keyLabel(code) {
  if (!code) return '—';
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code === 'Mouse0') return 'LMB';
  if (code === 'Mouse1') return 'MMB';
  if (code === 'Mouse2') return 'RMB';
  if (code.startsWith('Mouse')) return 'Mouse ' + code.slice(5);
  const map = { ShiftLeft: 'L-Shift', ShiftRight: 'R-Shift', ControlLeft: 'L-Ctrl', ControlRight: 'R-Ctrl', AltLeft: 'L-Alt', AltRight: 'R-Alt', Space: 'Space', Backquote: '`', Enter: 'Enter', Tab: 'Tab', Escape: 'Esc', CapsLock: 'Caps' };
  return map[code] || code.replace('Arrow', '↑').replace('Numpad', 'Num ');
}

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
      if (e.code === 'Tab' || e.code === 'Space' || (e.code.startsWith('Arrow')) || (this.locked && /^(Key[A-Z]|Digit|F\d)/.test(e.code) && (e.ctrlKey || e.altKey))) e.preventDefault();
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

  // ---- rebindable actions
  binds() { return { ...DEFAULT_BINDS, ...(settings.get('binds') || {}) }; }
  codes(action) { return (this._b || (this._b = this.binds()))[action] || []; }
  refreshBinds() { this._b = this.binds(); }
  act(action) { return this.codes(action).some(c => this.isDown(c)); }
  actPressed(action) { return this.codes(action).some(c => this.pressed(c)); }
  matches(action, code) { return this.codes(action).includes(code); }
  label(action) { return keyLabel(this.codes(action)[0]); }
  setBind(action, slot, code) {
    const all = settings.get('binds') || {};
    const cur = [...this.codes(action)];
    cur[slot] = code;
    all[action] = cur.filter(Boolean);
    settings.set('binds', { ...all });
    this.refreshBinds();
  }
  resetBinds() { settings.set('binds', {}); this.refreshBinds(); }

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
