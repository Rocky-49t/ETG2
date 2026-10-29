// THE LOOKALIKE — rare, any level. Wears a wanderer's shape (a teammate's, or
// yours when alone). It only moves while nobody is looking. Sustained
// flashlight makes it come apart. If it reaches you, it takes a piece of you.
import * as THREE from 'three';
import { stepToward, goTo, setState, lightOn } from '../brain.js';
import { Avatar } from '../../game/avatar.js';

function observedBy(e, p, level) {
  if (p.dead || !p.dir) return false;
  const ey = p.y + 1.55;
  const dx = e.x - p.x, dy = e.y + 1.2 - ey, dz = e.z - p.z;
  const d = Math.hypot(dx, dy, dz);
  if (d > 45) return false;
  const dot = (dx * p.dir.x + dy * p.dir.y + dz * p.dir.z) / d;
  if (dot < 0.72) return false;
  return level.lineOfSight(p.x, ey, p.z, e.x, e.y + 1.3, e.z);
}

export default {
  type: 'lookalike',
  name: 'The Lookalike',
  hp: 80,
  radius: 0.3,
  height: 1.8,
  resist: { bullet: 0.5, melee: 0.5 },
  hit: [{ part: 'body', y: 1.1, r: 0.3 }, { part: 'head', y: 1.65, r: 0.15 }],
  despawnDist: 60,

  init(e) { e.state = 'still'; e.life = 75 + Math.random() * 30; e.burn = 0; },

  think(e, dt, ctx) {
    const { level, players } = ctx;
    e.life -= dt;
    let watched = false;
    let target = null, td = Infinity;
    for (const p of players) {
      if (p.dead) continue;
      if (observedBy(e, p, level)) watched = true;
      const d = Math.hypot(p.x - e.x, p.z - e.z);
      if (d < td) { td = d; target = p; }
      const l = lightOn(p, e.x, e.y + 1.2, e.z, level, 14);
      if (l > 0) e.burn += dt * l;
    }
    if (e.burn > 1.6 || e.life <= 0) { setState(e, 'gone'); if (e.stateT > 0.8 || e.life <= 0) ctx.remove(e.id); return; }
    if (e.state === 'gone') return;
    if (e.state === 'attack') {
      if (e.stateT > 0.5 && !e.struck) {
        e.struck = true;
        const p = players.find(q => q.id === e.target);
        if (p && Math.hypot(p.x - e.x, p.z - e.z) < 2.2) ctx.hurt(p.id, 28, { from: e, scare: 35, type: 'lookalike' });
      }
      if (e.stateT > 0.9) ctx.remove(e.id);
      return;
    }
    if (!target) return;
    if (watched) {
      setState(e, 'still');
      e.speedNow = 0;
      // keep facing the target while frozen; it never looks away
      e.yaw = Math.atan2(target.x - e.x, target.z - e.z);
    } else {
      setState(e, 'move');
      goTo(e, level, target.x, target.z, 6.5, dt, { repath: 0.4, turn: 30 });
      if (td < 1.3) { e.target = target.id; setState(e, 'attack'); }
    }
  },

  netExtra(e) { return { k: e.mimic }; },

  build() {
    return { group: new THREE.Group(), rig: {} };
  },

  animate(v, dt, game) {
    const mimic = v.st.a?.k;
    if (!v.rig.avatar || v.rig.mimic !== mimic) {
      const skin = game.skinOf(mimic);
      if (v.rig.avatar) v.group.remove(v.rig.avatar.group);
      const av = new Avatar(skin);
      // darken: it's a copy, not quite right
      av.group.traverse(o => {
        if (o.isMesh) {
          o.material = o.material.clone();
          o.material.color?.multiplyScalar(0.55);
          o.material.roughness = 1;
        }
      });
      v.group.add(av.group);
      v.rig.avatar = av;
      v.rig.mimic = mimic;
      v.group.rotation.order = 'YXZ';
    }
    const av = v.rig.avatar;
    av.animate(dt, { speed: 0, crouch: false });
    // twitch the head when moving / when looked at
    if (v.st.s === 'still') av.head.rotation.z = Math.sin(v.time * 23) * 0.04 * (Math.random() < 0.1 ? 4 : 1);
    if (v.st.s === 'attack') { av.head.rotation.x = -0.5; av.arms.forEach(a => { a.sh.rotation.x = -1.7; }); }
    if (v.st.s === 'gone') v.group.scale.setScalar(Math.max(0.01, 1 - v.stateT * 1.3));
  },

  onState(v, s, prev, game) {
    if (s === 'attack') game.sfx('stinger', v.pos, { intensity: 1.2, volume: 1.2 });
    if (s === 'gone') game.sfx('whisper', v.pos, { volume: 0.8 });
    if (s === 'move' && prev === 'still') game.sfx('whisper', v.pos, { volume: 0.25 });
  },
  ambient() {},
};
