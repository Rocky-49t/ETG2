// Minimal event emitter used to decouple systems (UI, audio, network, game).
export class Emitter {
  constructor() { this._h = new Map(); }
  on(type, fn) {
    if (!this._h.has(type)) this._h.set(type, new Set());
    this._h.get(type).add(fn);
    return () => this.off(type, fn);
  }
  off(type, fn) { this._h.get(type)?.delete(fn); }
  emit(type, ...args) {
    const set = this._h.get(type);
    if (!set) return;
    for (const fn of [...set]) fn(...args);
  }
}

// Global bus for loosely-coupled notifications (subtitles, stingers, etc.)
export const bus = new Emitter();
