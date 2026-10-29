// Host-side entity simulation. Entities live in a level; they think only
// while a player is in that level. Snapshots are produced per level for
// clients (and for the host's own renderer).
import { ENTITY_TYPES } from './entities/index.js';
import { setState } from './brain.js';

let nextId = 1;

export class EntityManager {
  constructor(game) {
    this.game = game;
    this.list = new Map();
    this.time = 0;
  }

  spawn(type, levelId, x, z, opts = {}) {
    const def = ENTITY_TYPES[type];
    if (!def) { console.warn('unknown entity', type); return null; }
    const level = this.game.getLevel(levelId);
    const y = opts.y ?? Math.max(level.floorAt(x, z), -50);
    const e = {
      id: nextId++, type, levelId, def,
      x, y: y === -Infinity ? 0 : y, z, yaw: opts.yaw ?? Math.random() * Math.PI * 2,
      hp: def.hp * (opts.hpMul ?? 1), maxHp: def.hp * (opts.hpMul ?? 1),
      state: 'idle', stateT: 0, stateChanged: true, anim: 0,
      home: { x, z }, body: { x, y: 0, z, r: def.radius ?? 0.4, h: def.height ?? 1.8, step: def.step ?? 0.5 },
      attackCd: 0, spawnT: this.time, speedNow: 0, flags: 0, ...opts,
    };
    def.init?.(e, this.game);
    this.list.set(e.id, e);
    return e;
  }

  remove(id) { this.list.delete(id); }

  count(levelId, type) {
    let n = 0;
    for (const e of this.list.values()) if (e.levelId === levelId && (!type || e.type === type) && e.state !== 'dead') n++;
    return n;
  }

  byLevel(levelId) { return [...this.list.values()].filter(e => e.levelId === levelId); }

  update(dt, perLevel) {
    this.time += dt;
    for (const e of [...this.list.values()]) {
      const ctx = perLevel.get(e.levelId);
      if (!ctx) {
        // nobody here: despawn ordinary entities after a while
        e.idleAlone = (e.idleAlone || 0) + dt;
        if (e.idleAlone > 20 && !e.def.persistent) this.list.delete(e.id);
        continue;
      }
      e.idleAlone = 0;
      e.stateT += dt;
      e.attackCd = Math.max(0, e.attackCd - dt);
      if (e.state === 'dead') {
        if (e.stateT > (e.def.corpseTime ?? 8)) this.list.delete(e.id);
        continue;
      }
      e.def.think(e, dt, ctx);
      e.anim += dt;
      // despawn if very far from every player (keeps the world lively elsewhere)
      if (!e.def.persistent && ctx.players.length) {
        let near = Infinity;
        for (const p of ctx.players) near = Math.min(near, Math.hypot(p.x - e.x, p.z - e.z));
        if (near > (e.def.despawnDist ?? 70)) { e.farT = (e.farT || 0) + dt; if (e.farT > 6) this.list.delete(e.id); }
        else e.farT = 0;
      }
    }
  }

  // Apply damage (host authority). Returns {killed, dealt}.
  damage(id, amount, dtype, fromPid, part) {
    const e = this.list.get(id);
    if (!e || e.state === 'dead') return null;
    let dmg = amount * (e.def.resist?.[dtype] ?? 1);
    if (part === 'head') dmg *= e.def.headMult ?? 1.8;
    if (e.def.onDamage) dmg = e.def.onDamage(e, dmg, dtype, fromPid, this.game) ?? dmg;
    if (dmg <= 0) return { killed: false, dealt: 0 };
    e.hp -= dmg;
    e.lastHitBy = fromPid;
    e.hurtT = this.time;
    if (e.hp <= 0) {
      e.hp = 0;
      if (e.def.onDeath?.(e, this.game) === false) return { killed: false, dealt: dmg };
      setState(e, 'dead');
      return { killed: true, dealt: dmg };
    }
    return { killed: false, dealt: dmg };
  }

  snapshot(levelId) {
    const out = [];
    for (const e of this.list.values()) {
      if (e.levelId !== levelId) continue;
      out.push({
        i: e.id, t: e.type,
        x: +e.x.toFixed(2), y: +e.y.toFixed(2), z: +e.z.toFixed(2), r: +e.yaw.toFixed(2),
        s: e.state, h: Math.round((e.hp / e.maxHp) * 100), v: +(e.speedNow || 0).toFixed(1),
        a: e.def.netExtra ? e.def.netExtra(e) : undefined,
      });
      e.stateChanged = false;
    }
    return out;
  }
}
