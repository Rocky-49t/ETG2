// Interactive world objects: pickups, containers, hiding lockers, notes,
// doors, exits, switches and dynamic objects (dropped / thrown items).
// Handles their visuals, animation, client-side physics for thrown items and
// interaction targeting. State lives in game.world (host-authoritative).
import * as THREE from 'three';
import { itemModel, lockerModel, containerModel, noteModel, GROUND_POSE } from './models.js';
import { ITEMS } from './items.js';
import { NOTES } from './notes.js';
import { CHUNK } from '../world/chunk.js';

const CTYPE_NAMES = { cardboard: 'box', cabinet: 'filing cabinet', crate: 'crate', toolbox: 'toolbox', locker: 'locker', backpack: 'old backpack' };

// Kind registry: build visuals, prompt text, and interaction request.
export const OBJECT_KINDS = {
  pickup: {
    build(o) {
      const g = new THREE.Group();
      const m = itemModel(o.item);
      const pose = GROUND_POSE[o.item];
      if (pose) { m.rotation.set(pose[0], pose[1], pose[2]); m.position.y = pose[3]; }
      g.add(m);
      // a touch larger than life on the floor so loot reads at a glance
      g.scale.setScalar(ITEMS[o.item]?.type === 'weapon' ? 1.2 : 1.6);
      return g;
    },
    hidden: (o, s) => !!s?.taken,
    prompt: (o) => `Take ${ITEMS[o.item]?.name || o.item}${o.qty > 1 ? ' ×' + o.qty : ''}`,
    radius: 0.55,
  },
  drop: {
    build(o) { return OBJECT_KINDS.pickup.build(o); },
    prompt: (o) => `Take ${ITEMS[o.item]?.name || o.item}${o.qty > 1 ? ' ×' + o.qty : ''}`,
    radius: 0.55,
  },
  container: {
    build(o) { return containerModel(o.ctype); },
    prompt: (o, s) => (s?.opened && !(s.loot?.length) ? `Empty ${CTYPE_NAMES[o.ctype] || 'container'}` : `Search ${CTYPE_NAMES[o.ctype] || 'container'}`),
    radius: 0.7,
    animate(mesh, o, s, dt) {
      const open = s?.opened ? 1 : 0;
      mesh.userData.open = (mesh.userData.open ?? 0) + (open - (mesh.userData.open ?? 0)) * Math.min(1, dt * 6);
      const k = mesh.userData.open;
      if (mesh.userData.flaps) { mesh.userData.flaps[0].rotation.x = -k * 2.0; mesh.userData.flaps[1].rotation.x = k * 2.0; }
      if (mesh.userData.drawers) mesh.userData.drawers[2].position.z = 0.3 + k * 0.35;
      if (mesh.userData.lid) mesh.userData.lid.rotation.x = -k * 1.6;
    },
  },
  locker: {
    build(o, game) { return lockerModel(game.level?.def.lockerStyle || 'metal'); },
    prompt: (o, s, game) => {
      if (game.hidden && game.hiddenIn === o.id) return 'Leave hiding spot';
      if (s?.occ && s.occ !== game.myId) return 'Occupied';
      return 'Hide';
    },
    radius: 0.75,
    animate(mesh, o, s, dt) {
      const want = s?.swing ? 1 : 0;
      mesh.userData.k = (mesh.userData.k ?? 0) + (want - (mesh.userData.k ?? 0)) * Math.min(1, dt * 9);
      if (mesh.userData.door) mesh.userData.door.rotation.y = mesh.userData.k * 1.7;
    },
  },
  note: {
    build() { return noteModel(); },
    prompt: (o) => `Read: ${NOTES[o.noteId]?.title || 'note'}`,
    radius: 0.4,
    glint: true,
  },
  exit: { build: () => null, prompt: () => null },
  door: {
    build(o, game) {
      const g = new THREE.Group();
      const pivot = new THREE.Group();
      pivot.position.set(-0.9, 0, 0);
      const mat = game.lib.dyn(o.mat || 'woodCrate');
      const panel = new THREE.Mesh(new THREE.BoxGeometry(1.8, 2.3, 0.06), mat);
      panel.position.set(0.9, 1.15, 0);
      panel.castShadow = true;
      pivot.add(panel);
      const knob = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), game.lib.dyn('chrome'));
      knob.position.set(1.6, 1.0, 0.06);
      pivot.add(knob);
      const knob2 = knob.clone(); knob2.position.z = -0.06; pivot.add(knob2);
      g.add(pivot);
      g.userData.pivot = pivot;
      return g;
    },
    prompt: (o, s, game) => {
      if (o.locked && !s?.unlocked) return game.inventory.has(o.key) ? `Unlock with ${ITEMS[o.key].name}` : `Locked — needs ${ITEMS[o.key]?.name || 'a key'}`;
      return s?.open ? 'Close door' : 'Open door';
    },
    radius: 1.1,
    animate(mesh, o, s, dt) {
      const want = s?.open ? 1 : 0;
      mesh.userData.k = (mesh.userData.k ?? 0) + (want - (mesh.userData.k ?? 0)) * Math.min(1, dt * 5);
      mesh.userData.pivot.rotation.y = -mesh.userData.k * 1.6;
    },
  },
};

// Secondary exit hatch (see levels/common.js addHatchExit).
OBJECT_KINDS.hatch = {
  build(o, game) {
    const g = new THREE.Group();
    const dark = game.lib.dyn('darkMetal');
    const hole = new THREE.Mesh(new THREE.PlaneGeometry(1.36, 1.36), new THREE.MeshBasicMaterial({ color: 0x000000 }));
    hole.rotation.x = -Math.PI / 2; hole.position.y = 0.006;
    g.add(hole);
    for (const [x, z, w, d] of [[0, -0.74, 1.6, 0.12], [0, 0.74, 1.6, 0.12], [-0.74, 0, 0.12, 1.36], [0.74, 0, 0.12, 1.36]]) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, 0.04, d), dark);
      b.position.set(x, 0.02, z); b.receiveShadow = true; g.add(b);
    }
    // ladder rungs disappearing into the dark
    for (let k = 0; k < 3; k++) { const r = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.03, 0.03), dark); r.position.set(0, -0.05 - k * 0.3, -0.6); g.add(r); }
    const pivot = new THREE.Group();
    pivot.position.set(-0.68, 0.05, 0);
    const lid = new THREE.Mesh(new THREE.BoxGeometry(1.36, 0.05, 1.36), game.lib.dyn(o.mat || 'paintedMetal'));
    lid.position.set(0.68, 0, 0); lid.castShadow = true; lid.receiveShadow = true;
    pivot.add(lid);
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.05, 0.36), game.lib.dyn('chrome'));
    handle.position.set(1.2, 0.045, 0); pivot.add(handle);
    for (const [x, z] of [[0.12, -0.56], [0.12, 0.56], [1.24, -0.56], [1.24, 0.56]]) {
      const rv = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.02, 6), dark);
      rv.position.set(x, 0.03, z); pivot.add(rv);
    }
    g.add(pivot);
    g.userData.pivot = pivot;
    return g;
  },
  prompt(o, s, game) {
    if (s?.open) return `Climb down the ${o.label}`;
    if (game.inventory.has('crowbar')) return `Pry open the ${o.label}`;
    return `Force the ${o.label} (loud)${s?.prog ? ` — ${Math.round(s.prog * 100)}%` : ''}`;
  },
  radius: 1.0,
  centerY: 0.1,
  animate(mesh, o, s, dt) {
    const want = s?.open ? 1.95 : (s?.prog || 0) * 0.18;
    mesh.userData.k = (mesh.userData.k ?? 0) + (want - (mesh.userData.k ?? 0)) * Math.min(1, dt * 4);
    mesh.userData.pivot.rotation.z = mesh.userData.k;
  },
};

// A door marked with another level's name: walking through takes you there.
const LEVEL_DOOR_COLORS = { L0: 0xc9b46a, L1: 0x6a4a32, L2: 0x8a8f96, L3: 0x9ec8d6, L4: 0xb8ad94, L5: 0x6c7278 };
OBJECT_KINDS.levelDoor = {
  build(o, game) {
    const g = new THREE.Group();
    const dark = game.lib.dyn('darkMetal');
    const add = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); g.add(m); return m; };
    for (const sx of [-0.62, 0.62]) add(new THREE.BoxGeometry(0.1, 2.3, 0.14), dark, sx, 1.15, 0);
    add(new THREE.BoxGeometry(1.34, 0.1, 0.14), dark, 0, 2.3, 0);
    const panel = add(new THREE.BoxGeometry(1.14, 2.22, 0.05), new THREE.MeshStandardMaterial({ color: LEVEL_DOOR_COLORS[o.to] ?? 0x8a7a60, roughness: 0.7, metalness: 0.15 }), 0, 1.12, 0.02);
    panel.castShadow = true;
    add(new THREE.SphereGeometry(0.04, 8, 6), game.lib.dyn('chrome'), 0.45, 1.05, 0.07);
    // sign above the frame
    const c = document.createElement('canvas'); c.width = 256; c.height = 96;
    const x = c.getContext('2d');
    x.fillStyle = '#16191b'; x.fillRect(0, 0, 256, 96);
    x.strokeStyle = '#c9a640'; x.lineWidth = 5; x.strokeRect(4, 4, 248, 88);
    x.fillStyle = '#efe6c4'; x.font = 'bold 44px Arial, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText(o.label || 'LEVEL ?', 128, 50);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    const sign = add(new THREE.PlaneGeometry(0.9, 0.34), new THREE.MeshStandardMaterial({ map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.35, roughness: 0.6 }), 0, 2.6, 0.08);
    sign.castShadow = false;
    // light leaking under the door
    const leak = add(new THREE.PlaneGeometry(1.0, 0.5), new THREE.MeshBasicMaterial({ color: 0xffe0a0, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false }), 0, 0.005, 0.3);
    leak.rotation.x = -Math.PI / 2;
    return g;
  },
  prompt: o => `Go through the door marked ${o.label}`,
  radius: 0.9, centerY: 1.0,
};

export function registerObjectKind(kind, def) { OBJECT_KINDS[kind] = def; }

const tmp = new THREE.Vector3();

export class WorldObjects {
  constructor(game) {
    this.game = game;
    this.root = new THREE.Group();
    this.root.name = 'objects';
    game.engine.scene.add(this.root);
    this.byChunk = new Map();   // chunkKey -> [{o, mesh}]
    this.all = new Map();       // id -> {o, mesh}
    this.thrown = [];           // client-simulated thrown objects
    this.time = 0;
  }

  clear() {
    for (const e of this.all.values()) if (e.mesh) this.root.remove(e.mesh);
    for (const t of this.thrown) { this.root.remove(t.mesh); t.loop?.stop(); }
    this.byChunk.clear(); this.all.clear(); this.thrown = [];
  }

  onChunkBuilt(key, m) {
    const list = [];
    for (const o of m.chunk.objects) {
      const e = this._make(o);
      list.push(e);
    }
    this.byChunk.set(key, list);
    for (const d of this.game.world.dynList(this.game.levelId)) {
      if (d.kind === 'drop' && !this.all.has(d.id) && Math.floor(d.x / CHUNK) === m.chunk.cx && Math.floor(d.z / CHUNK) === m.chunk.cz) this.addDyn(d);
    }
  }

  onChunkRemoved(key) {
    const list = this.byChunk.get(key);
    if (!list) return;
    for (const e of list) { if (e.mesh) this.root.remove(e.mesh); this.all.delete(e.o.id); }
    this.byChunk.delete(key);
  }

  _make(o) {
    const kind = OBJECT_KINDS[o.kind];
    let mesh = null;
    if (kind?.build) {
      mesh = kind.build(o, this.game);
      if (mesh) {
        mesh.position.set(o.x, o.y, o.z);
        mesh.rotation.y = o.ry || 0;
        mesh.traverse(c => { if (c.isMesh) { c.castShadow = true; c.receiveShadow = true; } });
        this.root.add(mesh);
      }
    }
    const e = { o, mesh, kind };
    this.all.set(o.id, e);
    this.refresh(o.id);
    return e;
  }

  addDyn(d) {
    if (this.all.has(d.id)) return;
    if (d.kind === 'thrown') { this.addThrown(d); return; }
    this._make(d);
  }

  removeDyn(id) {
    const e = this.all.get(id);
    if (e) { if (e.mesh) this.root.remove(e.mesh); this.all.delete(id); }
    const ti = this.thrown.findIndex(t => t.d.id === id);
    if (ti >= 0) { this.root.remove(this.thrown[ti].mesh); this.thrown[ti].loop?.stop(); this.thrown.splice(ti, 1); }
  }

  refresh(id) {
    const e = this.all.get(id);
    if (!e || !e.mesh) return;
    const s = this.game.world.get(this.game.levelId, id);
    // bonus loot only exists in sessions with enough players (see lootPlayers)
    e.mesh.visible = !(e.o.mp > this.game.lootPlayers) && !(e.kind?.hidden?.(e.o, s));
  }

  refreshAll() { for (const id of this.all.keys()) this.refresh(id); }

  // ------------------------------------------------------------- thrown items
  addThrown(d) {
    const model = itemModel(d.type === 'decoy' ? 'decoy' : d.type);
    const mesh = new THREE.Group();
    mesh.add(model);
    mesh.position.set(d.x, d.y, d.z);
    this.root.add(mesh);
    const t = {
      d, mesh, pos: new THREE.Vector3(d.x, d.y, d.z), vel: new THREE.Vector3(d.vx, d.vy, d.vz),
      age: Math.max(0, (this.game.hostTime() - d.t0)), rest: false, spin: new THREE.Vector3(Math.random() * 8, Math.random() * 8, 0),
    };
    if (d.type === 'glowstick') t.light = { color: 0x40ff70, intensity: 3.2, range: 8 };
    if (d.type === 'flare') { t.light = { color: 0xff3a1c, intensity: 9, range: 13, flicker: true }; t.loop = this.game.loopSfx('flareLoop', t.pos, { volume: 0.5, ref: 2 }); }
    if (d.type === 'decoy') t.loop = this.game.loopSfx('musicBox', t.pos, { volume: 1.0, ref: 4 });
    // fast-forward physics if we joined late
    const steps = Math.min(200, Math.floor(t.age / 0.02));
    for (let i = 0; i < steps; i++) this._physics(t, 0.02);
    this.thrown.push(t);
    this.all.set(d.id, { o: d, mesh: null, kind: null });
  }

  _physics(t, dt) {
    if (t.rest) return;
    const level = this.game.getLevel(t.d.l);
    const v = t.vel;
    const water = level.waterAt(t.pos.x, t.pos.z);
    const inWater = t.pos.y < water;
    v.y -= (inWater ? 2 : 9.8) * dt;
    if (inWater) v.multiplyScalar(1 - dt * 2.5);
    const step = v.length() * dt;
    if (step > 1e-4) {
      const hit = level.raycast(t.pos.x, t.pos.y, t.pos.z, v.x, v.y, v.z, step + 0.05);
      if (hit && hit.dist <= step + 0.05) {
        t.pos.set(hit.x + hit.nx * 0.04, hit.y + hit.ny * 0.04, hit.z + hit.nz * 0.04);
        const n = new THREE.Vector3(hit.nx, hit.ny, hit.nz);
        v.reflect(n).multiplyScalar(0.38);
        if (!t.bounced) { t.bounced = true; this.game.sfx('thud', t.pos, { volume: 0.6 }); }
        if (hit.ny > 0.7 && v.length() < 1.2) { t.rest = true; v.set(0, 0, 0); t.pos.y = hit.y + 0.03; }
      } else t.pos.addScaledVector(v, dt);
    }
    if (t.pos.y < -80) t.rest = true;
  }

  // ------------------------------------------------------------- per frame
  update(dt) {
    this.time += dt;
    const g = this.game;
    for (const e of this.all.values()) {
      if (!e.mesh || !e.kind?.animate) continue;
      e.kind.animate(e.mesh, e.o, g.world.get(g.levelId, e.o.id), dt);
    }
    for (const t of this.thrown) {
      this._physics(t, dt);
      t.age += dt;
      t.mesh.position.copy(t.pos);
      if (!t.rest) { t.mesh.rotation.x += t.spin.x * dt; t.mesh.rotation.y += t.spin.y * dt; }
      else if (t.mesh.rotation.x !== Math.PI / 2) { t.mesh.rotation.set(Math.PI / 2, t.mesh.rotation.y, 0); }
      t.loop?.setPos(t.pos);
      const life = t.d.life ?? 60;
      t.fade = Math.min(1, Math.max(0, (life - t.age) / 4));
      if (t.d.type === 'flare' && t.fade > 0) {
        if (Math.random() < dt * 30) g.effects.burst('ember', { x: t.pos.x, y: t.pos.y + 0.1, z: t.pos.z });
        if (Math.random() < dt * 6) g.effects.burst('smoke', { x: t.pos.x, y: t.pos.y + 0.2, z: t.pos.z });
      }
      if (t.fade <= 0 && t.loop) { t.loop.stop(); t.loop = null; }
      if (t.light && t.fade <= 0) t.light = null;
    }
    g.lights.assignThrown(this.thrown, g.engine.camera.position);
  }

  // Best interactable object under the crosshair.
  target(cam, maxD = 2.4) {
    const g = this.game;
    const o = cam.position;
    const d = tmp.set(0, 0, -1).applyQuaternion(cam.quaternion);
    let best = null, bestScore = Infinity;
    for (const e of this.all.values()) {
      const ob = e.o;
      if (!e.kind?.prompt) continue;
      if (e.mesh && !e.mesh.visible) continue;
      const r = e.kind.radius ?? 0.5;
      const cy = ob.y + (ob.kind === 'locker' || ob.kind === 'door' ? 1.0 : ob.kind === 'container' ? 0.3 : 0.15) + (e.kind.centerY ?? 0);
      const dx = ob.x - o.x, dy = cy - o.y, dz = ob.z - o.z;
      const dist = Math.hypot(dx, dy, dz);
      if (dist > maxD + r) continue;
      // distance from ray to object centre
      const t = dx * d.x + dy * d.y + dz * d.z;
      if (t < 0) continue;
      const px = o.x + d.x * t - ob.x, py = o.y + d.y * t - cy, pz = o.z + d.z * t - ob.z;
      const off = Math.hypot(px, py, pz);
      if (off > r + 0.15) continue;
      const score = off + t * 0.15;
      if (score < bestScore) {
        if (!g.level.lineOfSight(o.x, o.y, o.z, ob.x, cy, ob.z, { ignoreProps: true })) continue;
        bestScore = score; best = e;
      }
    }
    if (!best) return null;
    const s = g.world.get(g.levelId, best.o.id);
    const label = best.kind.prompt(best.o, s, g);
    if (!label) return null;
    return { e: best, o: best.o, label, state: s };
  }

  // Glints on notes and items so they're findable in the dark (only nearby).
  glints(dt) {
    const cam = this.game.engine.camera.position;
    for (const e of this.all.values()) {
      if (!e.mesh?.visible) continue;
      const k = e.kind?.glint ? 0.6 : (e.o.kind === 'pickup' || e.o.kind === 'drop') ? 0.25 : 0;
      if (!k) continue;
      const d2 = (e.o.x - cam.x) ** 2 + (e.o.z - cam.z) ** 2;
      if (d2 > 144) continue;
      if (Math.random() < dt * k) this.game.effects.burst('glint', { x: e.o.x + (Math.random() - 0.5) * 0.15, y: e.o.y + 0.05, z: e.o.z + (Math.random() - 0.5) * 0.15 });
    }
  }
}
