// Replicated world state: per-level object states (pickups taken, containers
// emptied, doors opened, lockers occupied), dynamic objects (drops, thrown
// items) and level flags (door unlocked, boss phase...). The host mutates it
// and broadcasts deltas; clients mirror it.
import { Emitter } from '../core/events.js';

export class WorldState extends Emitter {
  constructor() {
    super();
    this.objs = new Map();   // levelId -> Map(id -> state)
    this.dyn = new Map();    // levelId -> Map(id -> obj)
    this.flags = new Map();  // levelId -> Map(key -> value)
  }

  _m(map, l) { let m = map.get(l); if (!m) { m = new Map(); map.set(l, m); } return m; }

  get(l, id) { return this.objs.get(l)?.get(id); }
  set(l, id, s) {
    if (s === null || s === undefined) this._m(this.objs, l).delete(id);
    else this._m(this.objs, l).set(id, s);
    this.emit('obj', l, id, s);
  }
  patch(l, id, p) { const s = { ...(this.get(l, id) || {}), ...p }; this.set(l, id, s); return s; }

  addDyn(l, d) { d.l = l; this._m(this.dyn, l).set(d.id, d); this.emit('dyn+', l, d); }
  removeDyn(l, id) { if (this._m(this.dyn, l).delete(id)) this.emit('dyn-', l, id); }
  getDyn(l, id) { return this.dyn.get(l)?.get(id); }
  dynList(l) { return [...(this.dyn.get(l)?.values() || [])]; }

  flag(l, k) { return this.flags.get(l)?.get(k); }
  setFlag(l, k, v) { this._m(this.flags, l).set(k, v); this.emit('flag', l, k, v); }

  serialize() {
    const o = { objs: {}, dyn: {}, flags: {} };
    for (const [l, m] of this.objs) o.objs[l] = [...m.entries()];
    for (const [l, m] of this.dyn) o.dyn[l] = [...m.values()];
    for (const [l, m] of this.flags) o.flags[l] = [...m.entries()];
    return o;
  }
  load(o) {
    this.objs.clear(); this.dyn.clear(); this.flags.clear();
    for (const [l, arr] of Object.entries(o.objs || {})) this.objs.set(l, new Map(arr));
    for (const [l, arr] of Object.entries(o.dyn || {})) this.dyn.set(l, new Map(arr.map(d => [d.id, d])));
    for (const [l, arr] of Object.entries(o.flags || {})) this.flags.set(l, new Map(arr));
    this.emit('reset');
  }
}
