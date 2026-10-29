// Slot inventory: 6 hotbar slots followed by a 5x4 backpack grid.
import { ITEMS, makeItem } from './items.js';
import { Emitter } from '../core/events.js';

export const HOTBAR = 6;
export const BACKPACK = 20;

export class Inventory extends Emitter {
  constructor() {
    super();
    this.slots = new Array(HOTBAR + BACKPACK).fill(null);
    this.selected = 0;
  }

  changed() { this.emit('change'); }

  get held() { return this.slots[this.selected]; }

  // Add an item stack; returns the quantity that did not fit.
  add(item) {
    if (!item) return 0;
    const def = ITEMS[item.id];
    if (!def) return 0;
    let left = item.qty || 1;
    const max = def.stack || 1;
    // merge with existing stacks (hotbar first, then backpack)
    if (max > 1) {
      for (let i = 0; i < this.slots.length && left > 0; i++) {
        const s = this.slots[i];
        if (s && s.id === item.id && s.qty < max) {
          const n = Math.min(left, max - s.qty);
          s.qty += n; left -= n;
        }
      }
    }
    // empty slots: tools & weapons prefer hotbar, consumables backpack-first? keep hotbar-first for accessibility
    const order = [...Array(this.slots.length).keys()];
    while (left > 0) {
      const i = order.find(k => !this.slots[k]);
      if (i === undefined) break;
      const n = Math.min(left, max);
      this.slots[i] = { id: item.id, qty: n, data: item.data ? { ...item.data } : (def.data ? { ...def.data } : undefined) };
      left -= n;
    }
    this.changed();
    return left;
  }

  canFit(id, qty = 1) {
    const def = ITEMS[id];
    if (!def) return false;
    let room = 0;
    for (const s of this.slots) {
      if (!s) room += def.stack || 1;
      else if (s.id === id) room += (def.stack || 1) - s.qty;
      if (room >= qty) return true;
    }
    return room >= qty;
  }

  count(id) { return this.slots.reduce((n, s) => n + (s && s.id === id ? s.qty : 0), 0); }
  has(id) { return this.count(id) > 0; }
  find(id, pred) { return this.slots.findIndex(s => s && s.id === id && (!pred || pred(s))); }

  // Remove qty of an item id anywhere; returns removed count.
  consume(id, qty = 1) {
    let left = qty;
    for (let i = this.slots.length - 1; i >= 0 && left > 0; i--) {
      const s = this.slots[i];
      if (s && s.id === id) {
        const n = Math.min(left, s.qty);
        s.qty -= n; left -= n;
        if (s.qty <= 0) this.slots[i] = null;
      }
    }
    if (left !== qty) this.changed();
    return qty - left;
  }

  takeFrom(index, qty = Infinity) {
    const s = this.slots[index];
    if (!s) return null;
    const n = Math.min(qty, s.qty);
    const out = { id: s.id, qty: n, data: s.data ? { ...s.data } : undefined };
    s.qty -= n;
    if (s.qty <= 0) this.slots[index] = null;
    this.changed();
    return out;
  }

  move(from, to) {
    if (from === to) return;
    const a = this.slots[from], b = this.slots[to];
    if (a && b && a.id === b.id && (ITEMS[a.id].stack || 1) > 1) {
      const max = ITEMS[a.id].stack;
      const n = Math.min(a.qty, max - b.qty);
      b.qty += n; a.qty -= n;
      if (a.qty <= 0) this.slots[from] = null;
    } else {
      this.slots[from] = b; this.slots[to] = a;
    }
    this.changed();
  }

  split(index) {
    const s = this.slots[index];
    if (!s || s.qty < 2) return;
    const empty = this.slots.findIndex((x, i) => !x && i >= HOTBAR) ;
    const target = empty >= 0 ? empty : this.slots.findIndex(x => !x);
    if (target < 0) return;
    const half = Math.floor(s.qty / 2);
    s.qty -= half;
    this.slots[target] = { id: s.id, qty: half, data: s.data ? { ...s.data } : undefined };
    this.changed();
  }

  select(i) {
    this.selected = ((i % HOTBAR) + HOTBAR) % HOTBAR;
    this.emit('select', this.selected);
    this.changed();
  }

  serialize() { return { slots: this.slots.map(s => (s ? { ...s, data: s.data ? { ...s.data } : undefined } : null)), selected: this.selected }; }
  load(d) {
    if (!d) return;
    this.slots = d.slots.map(s => (s ? { ...s } : null));
    while (this.slots.length < HOTBAR + BACKPACK) this.slots.push(null);
    this.selected = d.selected || 0;
    this.changed();
  }

  static starter() {
    const inv = new Inventory();
    inv.add(makeItem('flashlight'));
    inv.add(makeItem('almondWater', 1));
    inv.add(makeItem('snackBar', 1));
    inv.add(makeItem('bandage', 1));
    inv.add(makeItem('glowstick', 2));
    return inv;
  }
}
