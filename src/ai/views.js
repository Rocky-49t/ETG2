// Client-side entity rendering: builds meshes per entity type, interpolates
// snapshot states, runs procedural animation, plays state-change sounds and
// provides hit-testing for weapons.
import * as THREE from 'three';
import { ENTITY_TYPES } from './entities/index.js';
import { angleDiff } from '../core/rng.js';

export class EntityViews {
  constructor(game) {
    this.game = game;
    this.root = new THREE.Group();
    this.root.name = 'entities';
    game.engine.scene.add(this.root);
    this.views = new Map();
    this.delay = 0.11;
  }

  clear() {
    for (const v of this.views.values()) this.root.remove(v.group);
    this.views.clear();
  }

  // list: snapshot entries; t: local receive time
  apply(list, t) {
    const seen = new Set();
    for (const s of list) {
      seen.add(s.i);
      let v = this.views.get(s.i);
      if (!v) {
        const def = ENTITY_TYPES[s.t];
        if (!def) continue;
        const { group, rig } = def.build(this.game.lib, s);
        group.traverse(o => { if (o.isMesh) { o.castShadow = true; } });
        this.root.add(group);
        v = { id: s.i, type: s.t, def, group, rig, buf: [], st: { ...s }, pos: new THREE.Vector3(s.x, s.y, s.z), time: 0, stateT: 0, prevState: null };
        group.position.set(s.x, s.y, s.z);
        group.rotation.y = s.r;
        this.views.set(s.i, v);
      }
      v.buf.push({ t, s });
      if (v.buf.length > 6) v.buf.shift();
      v.missing = 0;
    }
    for (const [id, v] of this.views) {
      if (!seen.has(id)) {
        v.missing = (v.missing || 0) + 1;
        if (v.missing > 3) { this.root.remove(v.group); this.views.delete(id); }
      }
    }
  }

  update(dt, now, isHost) {
    const rt = isHost ? now : now - this.delay;
    for (const v of this.views.values()) {
      // find the two samples around render time
      const b = v.buf;
      let a = b[0], c = b[b.length - 1];
      for (let i = 0; i < b.length - 1; i++) {
        if (b[i].t <= rt && b[i + 1].t >= rt) { a = b[i]; c = b[i + 1]; break; }
      }
      if (!a) continue;
      const span = c.t - a.t;
      const k = span > 0 ? Math.min(1, Math.max(0, (rt - a.t) / span)) : 1;
      const s0 = a.s, s1 = c.s;
      const st = v.st;
      st.x = s0.x + (s1.x - s0.x) * k;
      st.y = s0.y + (s1.y - s0.y) * k;
      st.z = s0.z + (s1.z - s0.z) * k;
      st.r = s0.r + angleDiff(s0.r, s1.r) * k;
      const latest = k > 0.5 ? s1 : s0;
      st.v = latest.v; st.h = latest.h; st.a = latest.a;
      if (st.s !== latest.s) {
        const prev = st.s;
        st.s = latest.s;
        v.stateT = 0;
        v.def.onState?.(v, st.s, prev, this.game);
      }
      v.stateT += dt;
      v.time += dt;
      v.group.position.set(st.x, st.y, st.z);
      v.group.rotation.y = st.r;
      v.pos.set(st.x, st.y + 1, st.z);
      v.def.animate(v, dt, this.game);
      v.def.ambient?.(v, dt, this.game);
    }
  }

  // Ray vs entity hit spheres. Returns nearest {view, part, dist, point}.
  hitTest(o, d, maxD) {
    let best = null;
    const tmp = new THREE.Vector3();
    for (const v of this.views.values()) {
      if (v.st.s === 'dead' || v.st.s === 'gone') continue;
      const hits = typeof v.def.hit === 'function' ? v.def.hit(v) : v.def.hit;
      if (!hits) continue;
      const cos = Math.cos(v.st.r), sin = Math.sin(v.st.r);
      for (const h of hits) {
        const lz = h.z || 0, lx = h.x || 0;
        tmp.set(v.st.x + lx * cos + lz * sin, v.st.y + h.y, v.st.z - lx * sin + lz * cos);
        // ray-sphere
        const ox = o.x - tmp.x, oy = o.y - tmp.y, oz = o.z - tmp.z;
        const bb = ox * d.x + oy * d.y + oz * d.z;
        const cc = ox * ox + oy * oy + oz * oz - h.r * h.r;
        const disc = bb * bb - cc;
        if (disc < 0) continue;
        const t = -bb - Math.sqrt(disc);
        if (t < 0 || t > maxD) continue;
        if (!best || t < best.dist) best = { view: v, part: h.part, dist: t, point: new THREE.Vector3(o.x + d.x * t, o.y + d.y * t, o.z + d.z * t) };
      }
    }
    return best;
  }

  nearest(pos, maxD = Infinity, filter) {
    let best = null, bd = maxD;
    for (const v of this.views.values()) {
      if (filter && !filter(v)) continue;
      const d = Math.hypot(v.st.x - pos.x, v.st.z - pos.z);
      if (d < bd) { bd = d; best = v; }
    }
    return best ? { view: best, dist: bd } : null;
  }
}
