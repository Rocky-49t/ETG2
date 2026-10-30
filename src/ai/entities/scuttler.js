// THE SCUTTLER — Level 1. A huge hissing spider with over a dozen bright red
// eyes. Fast and relentless once it has your scent, but light pins it: while
// any flashlight beam is held on it, it locks rigid and cannot move. Look
// away and it comes on again. Rare; most common around abandoned stations.
import * as THREE from 'three';
import { canSee, hearNoise, goTo, wander, setState, faceToward, lightOn, nearestPlayer } from '../brain.js';
import { joint, limb, ball, glowMat, attackPose } from './rig.js';

export default {
  type: 'scuttler',
  name: 'The Scuttler',
  hp: 140,
  radius: 0.6,
  height: 1.0,
  blood: 'ichor',
  resist: { bullet: 1, melee: 1.1 },
  headMult: 1.7,
  hit: [{ part: 'body', y: 0.62, r: 0.5, z: -0.45 }, { part: 'body', y: 0.6, r: 0.38, z: 0.1 }, { part: 'head', y: 0.62, r: 0.25, z: 0.5 }],
  despawnDist: 75,
  announceKill: true,

  init(e) { e.state = 'lurk'; },

  // is any player's beam on it? (0 = no)
  lit(e, ctx) {
    let best = 0;
    for (const p of ctx.players) {
      if (p.dead) continue;
      best = Math.max(best, lightOn(p, e.x, e.y + 0.6, e.z, ctx.level, 15, false));
    }
    return best;
  },

  think(e, dt, ctx) {
    const { level, players } = ctx;
    const near = nearestPlayer(e, players, p => !p.downed && !p.hidden);
    const lit = this.lit(e, ctx);
    if (lit > 0 && e.state !== 'lurk') { if (e.state !== 'frozen') setState(e, 'frozen'); }
    switch (e.state) {
      case 'lurk': {
        wander(e, level, 1.2, dt, 10);
        if (near && (near.d < 6 || canSee(e, near.p, level, { range: 20, fov: 3.4, eyeH: 0.6 }))) { e.target = near.p.id; setState(e, 'chase'); }
        const n = hearNoise(e, ctx.noises, level, 1.1);
        if (n) { e.lastNoise = n; e.target = n.pid; setState(e, 'chase'); }
        break;
      }
      case 'frozen':
        e.speedNow = 0;
        if (lit <= 0) setState(e, near ? 'chase' : 'lurk');
        break;
      case 'chase': {
        const p = players.find(q => q.id === e.target && !q.dead && !q.hidden) || near?.p;
        if (!p) { if (e.stateT > 4) setState(e, 'lurk'); if (e.lastNoise) goTo(e, level, e.lastNoise.x, e.lastNoise.z, 4, dt); break; }
        e.target = p.id;
        const d = Math.hypot(p.x - e.x, p.z - e.z);
        const diffK = ctx.difficulty === 'easy' ? 0.85 : ctx.difficulty === 'hard' ? 1.12 : 1;
        goTo(e, level, p.x, p.z, 6.4 * diffK, dt, { repath: 0.4, turn: 12 });
        if (d < 1.5 && e.attackCd <= 0) setState(e, 'attack');
        if (d > 40) setState(e, 'lurk');
        break;
      }
      case 'attack': {
        const p = players.find(q => q.id === e.target);
        e.speedNow = 0;
        if (p) faceToward(e, p.x, p.z, 12, dt);
        if (e.stateT > 0.32 && !e.struck) {
          e.struck = true;
          if (p && !p.hidden && Math.hypot(p.x - e.x, p.z - e.z) < 2.0) ctx.hurt(p.id, ctx.difficulty === 'hard' ? 26 : 20, { from: e, scare: 14, bleed: 0.5, type: 'spider' });
          e.attackCd = 1.1;
        }
        if (e.stateT > 0.8) { e.struck = false; setState(e, 'chase'); }
        break;
      }
    }
  },

  onDamage(e, dmg, dtype, from) {
    if (e.state === 'lurk') { e.target = from; setState(e, 'chase'); }
    return dmg;
  },

  // ------------------------------------------------------------- client view
  build() {
    const chitin = new THREE.MeshStandardMaterial({ color: 0x1b1210, roughness: 0.38, metalness: 0.2 });
    const rust = new THREE.MeshStandardMaterial({ color: 0x4a2414, roughness: 0.6 });
    const hairM = new THREE.MeshStandardMaterial({ color: 0x0e0908, roughness: 1 });
    const g = new THREE.Group();
    const R = {};
    const body = joint(g, 0, 0.62, 0);
    R.body = body;
    // abdomen with rust-red markings and bristles
    R.abdomen = joint(body, 0, 0.08, -0.38);
    const ab = ball(chitin, 0.55, 1.0, 0.82, 1.25, 16); ab.position.set(0, 0.1, -0.3); R.abdomen.add(ab);
    for (let i = 0; i < 4; i++) { const m = ball(rust, 0.12 - i * 0.015, 1.4, 0.3, 0.8); m.position.set(0, 0.52 - i * 0.04, -0.05 - i * 0.24); m.rotation.x = 0.3 + i * 0.12; R.abdomen.add(m); }
    for (let i = 0; i < 26; i++) { const a = i * 2.4, r = 0.45; const h = new THREE.Mesh(new THREE.ConeGeometry(0.012, 0.12, 3), hairM); h.position.set(Math.cos(a) * r * 0.9, 0.1 + Math.sin(i * 1.3) * 0.32, -0.3 + Math.sin(a) * r * 0.8); h.rotation.set(Math.sin(a), 0, Math.cos(a)); R.abdomen.add(h); }
    // cephalothorax + head
    const thorax = ball(chitin, 0.32, 1.1, 0.7, 1.15, 14); thorax.position.set(0, 0, 0.12); body.add(thorax);
    R.head = joint(body, 0, 0.02, 0.42);
    const head = ball(chitin, 0.2, 1.15, 0.8, 0.9, 12); R.head.add(head);
    // over a dozen glowing red eyes in clustered rows
    R.eyes = [];
    const eyeM = glowMat(0xff1a10, 3.2);
    const EYES = [[0, 0.1, 0.17, 0.045], [-0.07, 0.08, 0.16, 0.04], [0.07, 0.08, 0.16, 0.04], [-0.12, 0.05, 0.13, 0.03], [0.12, 0.05, 0.13, 0.03],
      [-0.04, 0.13, 0.15, 0.025], [0.04, 0.13, 0.15, 0.025], [-0.15, 0.1, 0.09, 0.022], [0.15, 0.1, 0.09, 0.022], [-0.09, 0.15, 0.1, 0.02],
      [0.09, 0.15, 0.1, 0.02], [-0.03, 0.03, 0.19, 0.022], [0.03, 0.03, 0.19, 0.022], [-0.17, 0.02, 0.06, 0.018], [0.17, 0.02, 0.06, 0.018], [0, 0.16, 0.12, 0.018]];
    for (const [x, y, z, r] of EYES) { const e = ball(eyeM, r, 1, 1, 0.7, 8); e.position.set(x, y, z); R.head.add(e); R.eyes.push(e); }
    // fangs and pedipalps
    R.fangs = [];
    for (const s of [-1, 1]) {
      const f = joint(R.head, s * 0.06, -0.08, 0.14);
      const fang = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.16, 5), rust); fang.position.y = -0.07; fang.rotation.x = Math.PI; f.add(fang);
      R.fangs.push(f);
      const palp = joint(R.head, s * 0.12, -0.05, 0.12); palp.rotation.set(0.9, 0, s * 0.3); palp.add(limb(chitin, 0.18, 0.025, 0.018, 5));
    }
    // eight legs: coxa at the thorax, long femur up, tibia down
    R.legs = [];
    for (let i = 0; i < 4; i++) for (const s of [-1, 1]) {
      const z = 0.3 - i * 0.18;
      const hip = joint(body, s * 0.22, 0.02, z);
      hip.rotation.y = s * (0.5 - i * 0.35) ;
      const femur = joint(hip, 0, 0, 0);
      femur.add(limb(chitin, 0.62, 0.05, 0.04, 6));
      const knee = joint(femur, 0, -0.62, 0);
      knee.add(limb(chitin, 0.78, 0.04, 0.012, 6));
      const tip = ball(hairM, 0.025); tip.position.y = -0.78; knee.add(tip);
      R.legs.push({ hip, femur, knee, s, i });
    }
    return { group: g, rig: R };
  },

  animate(v, dt) {
    const R = v.rig, st = v.st;
    const sp = st.v || 0;
    const frozen = st.s === 'frozen';
    v.walk = (v.walk || 0) + dt * (frozen ? 0 : 4 + sp * 3.2);
    const w = v.walk, t = v.time;
    const run = Math.min(1.3, sp / 4);
    R.body.position.y = 0.62 + (frozen ? -0.08 : Math.abs(Math.sin(w * 2)) * 0.03 * run);
    R.legs.forEach(L => {
      const ph = w + (L.i % 2 ? Math.PI : 0) + (L.s > 0 ? Math.PI : 0);
      // femur raised out to the side, tibia reaching down to the floor
      L.femur.rotation.z = L.s * (1.2 + (frozen ? -0.12 : Math.max(0, Math.sin(ph)) * 0.35 * run));
      L.femur.rotation.x = (frozen ? 0 : Math.cos(ph) * 0.45 * run) + (L.i - 1.5) * -0.25;
      L.knee.rotation.z = L.s * (-0.95 + (frozen ? 0.1 : 0));
      if (frozen) L.femur.rotation.x += Math.sin(t * 40 + L.i) * 0.015; // rigid tremble
    });
    R.abdomen.rotation.x = Math.sin(t * 1.6) * 0.06 + (frozen ? -0.2 : 0);
    R.head.rotation.y = frozen ? Math.sin(t * 30) * 0.03 : Math.sin(t * 2) * 0.15;
    const atk = st.s === 'attack' ? attackPose(v.stateT, 0.32) : { w: 0, s: 0 };
    R.fangs.forEach((f, i) => { f.rotation.x = -0.2 - atk.w * 0.9 + atk.s * 0.7 + Math.sin(t * 14 + i) * 0.05; });
    R.body.position.z = atk.s * 0.35 - atk.w * 0.15;
    R.body.rotation.x = -atk.w * 0.35 + atk.s * 0.25;
    const glow = frozen ? 0.6 + Math.sin(t * 25) * 0.4 : 1;
    for (const e of R.eyes) e.scale.setScalar(glow);
    if (st.s === 'dead') { v.group.rotation.z = Math.min(3, v.stateT * 4); R.body.position.y = Math.max(0.3, 0.62 - v.stateT); }
  },

  onState(v, s, prev, game) {
    if (s === 'chase' && prev !== 'frozen' && prev !== 'attack') { game.sfx('spiderShriek', v.pos, { volume: 1, ref: 5 }); game.stats.scare(8); }
    if (s === 'frozen' && prev !== 'frozen') { game.sfx('spiderHiss', v.pos, { volume: 1, ref: 4 }); if (!game.flags.spiderHint) { game.flags.spiderHint = true; game.subtitle('The light pins it in place. Keep the beam on it.', 3.5); } }
    if (s === 'attack') game.sfx('spiderBite', v.pos, { volume: 1, ref: 3 });
    if (s === 'dead') game.sfx('spiderShriek', v.pos, { volume: 0.7, ref: 4 });
  },

  ambient(v, dt, game) {
    const sp = v.st.v || 0;
    if (sp > 0.4) {
      v.stepT = (v.stepT ?? 0) - dt * (2 + sp);
      if (v.stepT <= 0) { v.stepT = 1; game.sfx('skitter', v.pos, { volume: Math.min(1, 0.4 + sp * 0.12), ref: 3 }); }
    }
    v.hissT = (v.hissT ?? 3) - dt;
    if (v.hissT <= 0) { v.hissT = 3 + Math.random() * 5; if (v.st.s !== 'dead') game.sfx('spiderHiss', v.pos, { volume: v.st.s === 'lurk' ? 0.5 : 0.8, ref: 3 }); }
  },
};
