// DEEDEE — Level 2. Whatever answers 1143141967. A tall, pale, smiling thing
// that never stops looking at you and never stops singing. It walks toward the
// caller at a funeral pace and, when it is close enough to touch, comes apart
// into smoke. Harmless — unless you hurt it. Then its eyes go red, the song
// stops, and it does not stop until someone is dead. Very hard to kill; it
// shrugs off bullets but blades bite deep.
import * as THREE from 'three';
import { goTo, setState, faceToward, nearestPlayer, canSee } from '../brain.js';
import { joint, limb, ball, boxm, glowMat, attackPose } from './rig.js';

export default {
  type: 'deedee',
  name: 'Deedee',
  hp: 420,
  radius: 0.4,
  height: 2.3,
  blood: 'ichor',
  resist: { bullet: 0.35, melee: 1.6 },
  headMult: 1.3,
  hit: [{ part: 'body', y: 1.25, r: 0.32 }, { part: 'body', y: 0.6, r: 0.28 }, { part: 'head', y: 2.05, r: 0.2 }],
  despawnDist: 90,
  announceKill: true,
  noDoors: false,

  init(e) { e.state = 'approach'; e.anger = 0; },

  think(e, dt, ctx) {
    const { level, players } = ctx;
    const caller = players.find(p => p.id === e.caller && !p.dead) || nearestPlayer(e, players)?.p;
    switch (e.state) {
      case 'approach': {
        if (!caller) { if (e.stateT > 20) setState(e, 'vanish'); e.speedNow = 0; break; }
        const d = Math.hypot(caller.x - e.x, caller.z - e.z);
        faceToward(e, caller.x, caller.z, 3, dt);
        if (d < 0.5 + (e.id % 5) / 10 + 0.3) { setState(e, 'vanish'); e.speedNow = 0; break; }
        goTo(e, level, caller.x, caller.z, 0.85, dt, { repath: 1.2, turn: 2.5 });
        // it stops to stare now and then
        if (Math.sin(e.stateT * 0.7 + e.id) > 0.85) e.speedNow = 0;
        if (e.stateT > 240) setState(e, 'vanish');
        break;
      }
      case 'vanish':
        e.speedNow = 0;
        if (e.stateT > 1.4) ctx.remove(e.id);
        break;
      case 'enraged': {
        const p = players.find(q => q.id === e.target && !q.dead && !q.hidden) || nearestPlayer(e, players, q => !q.hidden)?.p;
        if (!p) { e.speedNow = 0; if (e.stateT > 30) setState(e, 'vanish'); break; }
        e.target = p.id;
        const d = Math.hypot(p.x - e.x, p.z - e.z);
        const diffK = ctx.difficulty === 'easy' ? 0.85 : ctx.difficulty === 'hard' ? 1.12 : 1;
        goTo(e, level, p.x, p.z, 5.4 * diffK, dt, { repath: 0.35, turn: 9 });
        if (d < 1.7 && e.attackCd <= 0) setState(e, 'attack');
        if (d > 60 && !canSee(e, p, level, { range: 60 })) setState(e, 'vanish');
        break;
      }
      case 'attack': {
        const p = players.find(q => q.id === e.target);
        e.speedNow = 0;
        if (p) faceToward(e, p.x, p.z, 10, dt);
        if (e.stateT > 0.45 && !e.struck) {
          e.struck = true;
          if (p && !p.hidden && Math.hypot(p.x - e.x, p.z - e.z) < 2.2) ctx.hurt(p.id, ctx.difficulty === 'hard' ? 60 : ctx.difficulty === 'easy' ? 34 : 45, { from: e, scare: 30, bleed: 0.6, type: 'pale' });
          e.attackCd = 1.0;
        }
        if (e.stateT > 1.0) { e.struck = false; setState(e, 'enraged'); }
        break;
      }
    }
  },

  onDamage(e, dmg, dtype, from) {
    if (e.state === 'vanish') return 0;
    if (e.state === 'approach') { setState(e, 'enraged'); }
    if (from) e.target = from;
    return dmg;
  },

  // ------------------------------------------------------------- client view
  build() {
    const skin = new THREE.MeshStandardMaterial({ color: 0xece8e0, roughness: 0.5, emissive: 0x9a968c, emissiveIntensity: 0.24 });
    const dress = new THREE.MeshStandardMaterial({ color: 0xd8d4cc, roughness: 0.9, side: THREE.DoubleSide, emissive: 0x6a675f, emissiveIntensity: 0.25 });
    const black = new THREE.MeshBasicMaterial({ color: 0x000000 });
    const g = new THREE.Group();
    const R = {};
    R.hips = joint(g, 0, 1.0, 0);
    // a long plain shift that hangs to the shins
    const shift = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.34, 1.05, 12, 1, true), dress);
    shift.position.y = 0.32; R.hips.add(shift);
    R.chest = joint(R.hips, 0, 0.55, 0);
    const torso = ball(skin, 0.19, 1, 1.7, 0.75, 12); torso.position.y = 0.1; R.chest.add(torso);
    const neck = limb(skin, 0.3, 0.045, 0.05, 8); neck.rotation.x = Math.PI; neck.position.y = 0.38; R.chest.add(neck);
    R.head = joint(R.chest, 0, 0.66, 0);
    // a long smooth head, slightly too big
    const skull = ball(skin, 0.17, 0.92, 1.28, 1.0, 16); skull.position.y = 0.08; R.head.add(skull);
    // huge black eyes with pinprick pupils
    R.eyes = [];
    R.pupils = [];
    const pupilM = glowMat(0xffffff, 1.4);
    for (const s of [-1, 1]) {
      const eye = ball(black, 0.05, 1.1, 1.25, 0.5, 12); eye.position.set(s * 0.065, 0.12, 0.145); R.head.add(eye); R.eyes.push(eye);
      const pu = ball(pupilM, 0.012, 1, 1, 1, 6); pu.position.set(s * 0.065, 0.12, 0.17); R.head.add(pu); R.pupils.push(pu);
    }
    // a thin, too-wide smile
    R.mouth = boxm(black, 0.17, 0.012, 0.02); R.mouth.position.set(0, -0.03, 0.155); R.head.add(R.mouth);
    for (const s of [-1, 1]) { const corner = boxm(black, 0.03, 0.01, 0.02); corner.position.set(s * 0.095, -0.015, 0.145); corner.rotation.z = s * 0.5; R.head.add(corner); }
    R.jaw = boxm(new THREE.MeshBasicMaterial({ color: 0x120404 }), 0.11, 1, 0.02); R.jaw.position.set(0, -0.05, 0.15); R.head.add(R.jaw);
    // long thin arms with long fingers
    R.arms = [];
    for (const s of [-1, 1]) {
      const sh = joint(R.chest, s * 0.25, 0.3, 0);
      sh.add(limb(skin, 0.5, 0.04, 0.035));
      const el = joint(sh, 0, -0.5, 0);
      el.add(limb(skin, 0.48, 0.035, 0.028));
      const hand = joint(el, 0, -0.48, 0);
      for (let f = 0; f < 4; f++) { const fi = limb(skin, 0.16, 0.008, 0.005, 4); fi.position.set((f - 1.5) * 0.015, 0, 0); fi.rotation.x = 0.1; hand.add(fi); }
      R.arms.push({ sh, el, s });
    }
    // legs, mostly hidden
    R.legs = [];
    for (const s of [-1, 1]) {
      const hip = joint(R.hips, s * 0.09, 0, 0);
      hip.add(limb(skin, 0.5, 0.05, 0.04));
      const knee = joint(hip, 0, -0.5, 0);
      knee.add(limb(skin, 0.48, 0.04, 0.03));
      R.legs.push({ hip, knee, s });
    }
    return { group: g, rig: R };
  },

  animate(v, dt, game) {
    const R = v.rig, st = v.st, t = v.time;
    const sp = st.v || 0;
    v.walk = (v.walk || 0) + dt * sp * 2.6;
    const w = v.walk;
    const rage = st.s === 'enraged' || st.s === 'attack';
    R.legs.forEach(L => { const ph = w + (L.s > 0 ? Math.PI : 0); L.hip.rotation.x = Math.sin(ph) * (rage ? 0.7 : 0.25); L.knee.rotation.x = Math.max(0, -Math.cos(ph)) * (rage ? 0.9 : 0.3); });
    R.hips.position.y = 1.0 + Math.abs(Math.sin(w)) * 0.02;
    // stiff, slightly swaying posture; the head never leaves you
    R.chest.rotation.z = Math.sin(t * 0.6) * 0.04;
    R.chest.rotation.x = rage ? 0.35 : -0.03;
    const me = game.player.pos;
    const dx = me.x - st.x, dz = me.z - st.z;
    let yaw = Math.atan2(dx, dz) - st.r;
    while (yaw > Math.PI) yaw -= Math.PI * 2; while (yaw < -Math.PI) yaw += Math.PI * 2;
    const lim = rage ? 0.6 : 1.9; // it can turn its head much further than it should
    const hy = Math.max(-lim, Math.min(lim, yaw));
    v.hy = (v.hy ?? hy) + (hy - (v.hy ?? hy)) * Math.min(1, dt * (rage ? 8 : 2.5));
    R.head.rotation.y = v.hy;
    const dist = Math.hypot(dx, dz);
    R.head.rotation.x = Math.atan2(st.y + 2.05 - (me.y + 1.55), Math.max(0.5, dist)) * 0.8;
    R.head.rotation.z = rage ? 0 : 0.18 + Math.sin(t * 0.4) * 0.05; // the tilt
    const atk = st.s === 'attack' ? attackPose(v.stateT, 0.45) : { w: 0, s: 0 };
    R.arms.forEach(A => {
      if (rage) {
        A.sh.rotation.x = -1.2 - atk.w * 1.2 + atk.s * 1.6 + Math.sin(w + (A.s > 0 ? Math.PI : 0)) * 0.3;
        A.sh.rotation.z = A.s * 0.25; A.el.rotation.x = -0.4 - atk.w * 0.6;
      } else {
        A.sh.rotation.x = Math.sin(t * 0.5 + A.s) * 0.04; A.sh.rotation.z = A.s * 0.2; A.el.rotation.x = -0.05; A.el.rotation.z = -A.s * 0.12;
      }
    });
    const open = rage ? 0.07 + atk.w * 0.06 : (0.012 + Math.max(0, Math.sin(t * 3.2)) * 0.02);
    R.jaw.scale.y = open; R.jaw.position.y = -0.04 - open / 2;
    if (rage && !v.red) { v.red = true; const m = glowMat(0xff1008, 4); for (const p of R.pupils) { p.material = m; p.scale.setScalar(2.2); } }
    for (const e of R.eyes) e.scale.y = rage ? 0.9 : 1.25;
    if (st.s === 'vanish') {
      const k = Math.min(1, v.stateT / 1.2);
      v.group.scale.set(1 - k * 0.3, 1 + k * 0.15, 1 - k * 0.3);
      v.group.traverse(o => { if (o.material && 'opacity' in o.material) { o.material.transparent = true; o.material.opacity = 1 - k; } });
    }
    if (st.s === 'dead') { v.group.rotation.x = Math.min(1.5, v.stateT * 2); }
  },

  onState(v, s, prev, game) {
    if (s === 'vanish') {
      for (let i = 0; i < 14; i++) game.effects.burst('smoke', { x: v.st.x + (Math.random() - 0.5) * 0.6, y: v.st.y + 0.3 + Math.random() * 1.9, z: v.st.z + (Math.random() - 0.5) * 0.6 });
      game.sfx('paleVanish', v.pos, { volume: 1, ref: 3 });
      if (v.song) { v.song.stop(0.8); v.song = null; }
      if (Math.hypot(game.player.pos.x - v.st.x, game.player.pos.z - v.st.z) < 3) { game.stats.scare(10); game.subtitle('It leans close — and there is only smoke, and the smell of a struck match.', 3.5); }
    }
    if (s === 'enraged' && prev === 'approach') {
      if (v.song) { v.song.stop(0.05); v.song = null; }
      game.sfx('paleScream', v.pos, { volume: 1.2, ref: 6 });
      game.stats.scare(25);
      game.subtitle('The song stops.', 2.5);
    }
    if (s === 'attack') game.sfx('paleScream', v.pos, { volume: 0.7, ref: 4, short: true });
    if (s === 'dead') { if (v.song) { v.song.stop(0.2); v.song = null; } game.sfx('paleVanish', v.pos, { volume: 1, ref: 4 }); }
  },

  ambient(v, dt, game) {
    if (v.st.s === 'approach') {
      if (!v.song) v.song = game.loopSfx('paleSong', v.pos, { volume: 1, ref: 4, rolloff: 0.9 });
      v.song?.setPos(v.pos);
      // being stared at wears on you
      const d = Math.hypot(game.player.pos.x - v.st.x, game.player.pos.z - v.st.z);
      if (d < 14) game.stats.scare(dt * (14 - d) * 0.06);
    } else if (v.st.s === 'enraged') {
      v.stepT = (v.stepT ?? 0) - dt * 3.2;
      if (v.stepT <= 0) { v.stepT = 1; game.sfx('inkStep', v.pos, { volume: 0.7, ref: 3 }); }
    }
  },

  dispose(v) { if (v.song) { v.song.stop(0.2); v.song = null; } },
};
