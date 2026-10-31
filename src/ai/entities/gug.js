// Level Gug's inhabitants.
//
// THE GUG WALKER — very tall, very thin, dark gray, with two pale eyes. It
// roams the whole level at a run and sees you from a long way off. It does
// not path-find: it picks a direction and runs until something stops it, then
// turns — deadly down a long hall, hopeless at corners.
//
// THE GUG CRAWLER — a hunched black figure that moonwalks: it glides
// backwards toward you, faster than anything else here. It is blind, but it
// hears everything — the softest steps, from far away — and it reacts at once.
import * as THREE from 'three';
import { hearNoise, setState, faceToward, nearestPlayer, stepToward, canSee } from '../brain.js';
import { joint, limb, ball, glowMat, attackPose } from './rig.js';

const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

// Run along e.dir until blocked, then turn: toward the goal if one is known
// (along whichever axis is open the longest), otherwise anywhere open.
function runStraight(e, level, speed, dt, goal) {
  if (!e.dir) e.dir = DIRS[Math.floor(Math.random() * 4)].slice();
  const step = speed * dt;
  const px = e.x, pz = e.z;
  stepToward(e, level, e.x + e.dir[0] * 2, e.z + e.dir[1] * 2, speed, dt, 14);
  const moved = Math.hypot(e.x - px, e.z - pz);
  e.runT = (e.runT || 0) + dt;
  const blocked = moved < step * 0.35;
  if (blocked || e.runT > (goal ? 14 : 9)) {
    e.runT = 0;
    let best = null;
    const opts = DIRS.map(d => d.slice());
    if (goal) { const dx = goal.x - e.x, dz = goal.z - e.z, d = Math.hypot(dx, dz) || 1; opts.push([dx / d, dz / d]); }
    for (const d of opts) {
      if (blocked && Math.abs(d[0] - e.dir[0]) < 0.01 && Math.abs(d[1] - e.dir[1]) < 0.01) continue;
      const r = level.raycast(e.x, e.y + 1, e.z, d[0], 0, d[1], 40, { ignoreProps: false });
      const free = r ? r.dist : 40;
      if (free < 1.5) continue;
      let score = Math.min(free, 25) + Math.random() * 6;
      if (goal) { const dx = goal.x - e.x, dz = goal.z - e.z, dl = Math.hypot(dx, dz) || 1; score += ((d[0] * dx + d[1] * dz) / dl) * 18; }
      if (!best || score > best.score) best = { d, score };
    }
    if (best) e.dir = best.d;
  }
  return moved;
}

export const gugwalker = {
  type: 'gugwalker',
  name: 'Gug Walker',
  hp: 150,
  radius: 0.38,
  height: 2.9,
  blood: 'ichor',
  resist: { bullet: 0.85, melee: 1 },
  headMult: 1.8,
  hit: [{ part: 'head', y: 2.62, r: 0.16 }, { part: 'body', y: 1.95, r: 0.22 }, { part: 'body', y: 1.2, r: 0.18 }],
  despawnDist: 150,
  announceKill: true,

  init(e) { e.state = 'roam'; },

  think(e, dt, ctx) {
    const { level, players } = ctx;
    const diffK = ctx.difficulty === 'easy' ? 0.85 : ctx.difficulty === 'hard' ? 1.12 : 1;
    const sees = p => !p.hidden && !p.dead && canSee(e, p, level, { range: 70, eyeH: 2.6 });
    switch (e.state) {
      case 'roam': {
        runStraight(e, level, 3.4, dt, null);
        const p = players.find(sees);
        if (p) { e.target = p.id; e.dir = null; setState(e, 'chase'); }
        break;
      }
      case 'chase': {
        const p = players.find(q => q.id === e.target && !q.dead && !q.hidden);
        if (!p) { setState(e, 'roam'); break; }
        const vis = sees(p);
        if (vis) { e.last = { x: p.x, z: p.z }; e.lostT = 0; const dx = p.x - e.x, dz = p.z - e.z, d = Math.hypot(dx, dz) || 1; e.dir = [dx / d, dz / d]; }
        else e.lostT = (e.lostT || 0) + dt;
        runStraight(e, level, 7.6 * diffK, dt, vis ? null : e.last);
        if (Math.hypot(p.x - e.x, p.z - e.z) < 1.6 && e.attackCd <= 0) setState(e, 'attack');
        if (e.lostT > 12) setState(e, 'roam');
        break;
      }
      case 'attack': {
        const p = players.find(q => q.id === e.target);
        e.speedNow = 0;
        if (p) faceToward(e, p.x, p.z, 14, dt);
        if (e.stateT > 0.35 && !e.struck) {
          e.struck = true;
          if (p && !p.hidden && Math.hypot(p.x - e.x, p.z - e.z) < 2.2) ctx.hurt(p.id, ctx.difficulty === 'hard' ? 38 : 30, { from: e, scare: 18, type: 'gug' });
          e.attackCd = 1.1;
        }
        if (e.stateT > 0.8) { e.struck = false; setState(e, 'chase'); }
        break;
      }
    }
  },

  build() {
    const skin = new THREE.MeshStandardMaterial({ color: 0x2a2b2e, roughness: 0.7 });
    const g = new THREE.Group();
    const R = {};
    R.hips = joint(g, 0, 1.45, 0);
    R.chest = joint(R.hips, 0, 0.1, 0);
    const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.09, 0.95, 8), skin); torso.position.y = 0.48; R.chest.add(torso);
    R.head = joint(R.chest, 0, 1.08, 0.04);
    const head = ball(skin, 0.13, 0.85, 1.35, 0.95, 12); head.position.y = 0.1; R.head.add(head);
    const eyeM = glowMat(0xf2f2e8, 2.4);
    for (const s of [-1, 1]) { const ey = ball(eyeM, 0.026, 1, 1.3, 0.6, 8); ey.position.set(s * 0.05, 0.14, 0.11); R.head.add(ey); }
    R.arms = [];
    for (const s of [-1, 1]) {
      const sh = joint(R.chest, s * 0.16, 0.95, 0);
      sh.add(limb(skin, 0.75, 0.035, 0.028));
      const el = joint(sh, 0, -0.75, 0); el.add(limb(skin, 0.75, 0.028, 0.02));
      const hand = joint(el, 0, -0.75, 0); for (let f = 0; f < 3; f++) { const fi = limb(skin, 0.22, 0.008, 0.004, 4); fi.position.x = (f - 1) * 0.015; hand.add(fi); }
      R.arms.push({ sh, el, s });
    }
    R.legs = [];
    for (const s of [-1, 1]) {
      const hip = joint(R.hips, s * 0.07, 0, 0); hip.add(limb(skin, 0.72, 0.045, 0.034));
      const kn = joint(hip, 0, -0.72, 0); kn.add(limb(skin, 0.72, 0.034, 0.025));
      R.legs.push({ hip, kn, s });
    }
    return { group: g, rig: R };
  },
  animate(v, dt) {
    const R = v.rig, st = v.st, sp = st.v || 0;
    v.walk = (v.walk || 0) + dt * (1.5 + sp * 1.3);
    const w = v.walk, run = Math.min(1.4, sp / 5);
    R.legs.forEach(L => { const ph = w + (L.s > 0 ? Math.PI : 0); L.hip.rotation.x = Math.sin(ph) * 0.7 * run; L.kn.rotation.x = Math.max(0, -Math.cos(ph)) * 1.1 * run; });
    R.hips.position.y = 1.45 + Math.abs(Math.sin(w)) * 0.06 * run;
    R.chest.rotation.x = 0.15 * run;
    const atk = st.s === 'attack' ? attackPose(v.stateT, 0.35) : { w: 0, s: 0 };
    R.arms.forEach(A => { const ph = w + (A.s > 0 ? 0 : Math.PI); A.sh.rotation.x = Math.sin(ph) * 0.6 * run - atk.w * 2.2 + atk.s * 2.4; A.sh.rotation.z = A.s * (0.08 + atk.w * 0.3); A.el.rotation.x = -0.2 - atk.w * 0.6; });
    R.head.rotation.z = Math.sin(v.time * 0.7) * 0.08;
    if (st.s === 'dead') v.group.rotation.x = -Math.min(1.5, v.stateT * 2);
  },
  onState(v, s, prev, game) {
    if (s === 'chase' && prev === 'roam') { game.sfx('gugScream', v.pos, { volume: 1, ref: 8, maxDist: 120 }); game.stats.scare(10); if (!game.flags.gugHint) { game.flags.gugHint = true; game.subtitle('It runs in straight lines. Break line of sight — take a corner.', 4); } }
    if (s === 'attack') game.sfx('hitFlesh', v.pos, { volume: 0.8 });
  },
  ambient(v, dt, game) {
    const sp = v.st.v || 0;
    if (sp > 0.5) { v.stepT = (v.stepT ?? 0) - dt * (1 + sp * 0.55); if (v.stepT <= 0) { v.stepT = 1; game.sfx('gugStep', v.pos, { volume: Math.min(1, 0.4 + sp * 0.08), ref: 5 }); } }
  },
};

export const gugcrawler = {
  type: 'gugcrawler',
  name: 'Gug Crawler',
  hp: 110,
  radius: 0.4,
  height: 1.3,
  blood: 'ichor',
  resist: { bullet: 0.9, melee: 1.1 },
  headMult: 1.6,
  hit: [{ part: 'body', y: 0.9, r: 0.32 }, { part: 'head', y: 1.2, r: 0.16, z: -0.25 }],
  despawnDist: 110,
  announceKill: true,

  init(e) { e.state = 'roam'; },

  think(e, dt, ctx) {
    const { level, players } = ctx;
    const diffK = ctx.difficulty === 'easy' ? 0.85 : ctx.difficulty === 'hard' ? 1.12 : 1;
    // blind: it hears noise from far away, and anyone moving close by (even crouched)
    const heard = hearNoise(e, ctx.noises, level, 2.6);
    const close = nearestPlayer(e, players, p => !p.hidden && !p.dead && (!p.crouch || Math.hypot(p.x - e.x, p.z - e.z) < 4));
    if (heard) { e.goal = { x: heard.x, z: heard.z }; e.target = heard.pid; if (e.state === 'roam') { e.dir = null; setState(e, 'hunt'); } }
    if (close && close.d < 8) { e.goal = { x: close.p.x, z: close.p.z }; e.target = close.p.id; if (e.state === 'roam') setState(e, 'hunt'); }
    switch (e.state) {
      case 'roam': runStraight(e, level, 2.2, dt, null); break;
      case 'hunt': {
        if (!e.goal) { setState(e, 'roam'); break; }
        const dx = e.goal.x - e.x, dz = e.goal.z - e.z, d = Math.hypot(dx, dz);
        if (d > 0.5 && level.tileLOS(e.x, e.z, e.goal.x, e.goal.z)) e.dir = [dx / d, dz / d];
        runStraight(e, level, 9.0 * diffK, dt, e.goal);
        const p = players.find(q => q.id === e.target && !q.dead && !q.hidden);
        if (p && Math.hypot(p.x - e.x, p.z - e.z) < 1.5 && e.attackCd <= 0) setState(e, 'attack');
        if (d < 1.2) { e.goal = null; if (e.stateT > 3) setState(e, 'roam'); }
        if (e.stateT > 20 && !heard) setState(e, 'roam');
        break;
      }
      case 'attack': {
        const p = players.find(q => q.id === e.target);
        e.speedNow = 0;
        if (e.stateT > 0.25 && !e.struck) {
          e.struck = true;
          if (p && !p.hidden && Math.hypot(p.x - e.x, p.z - e.z) < 2.0) ctx.hurt(p.id, ctx.difficulty === 'hard' ? 46 : 38, { from: e, scare: 22, type: 'gug' });
          e.attackCd = 1.3;
        }
        if (e.stateT > 0.7) { e.struck = false; setState(e, 'hunt'); }
        break;
      }
    }
    // it faces away from where it's going: the moonwalk
    if (e.dir && e.state !== 'attack') e.yaw = Math.atan2(-e.dir[0], -e.dir[1]);
  },

  build() {
    const black = new THREE.MeshStandardMaterial({ color: 0x0a0a0b, roughness: 0.9 });
    const g = new THREE.Group();
    const R = {};
    R.hips = joint(g, 0, 0.82, 0);
    R.chest = joint(R.hips, 0, 0.05, 0);
    R.chest.rotation.x = 0.95; // slumped over
    const torso = ball(black, 0.26, 0.95, 1.5, 0.8, 12); torso.position.y = 0.32; R.chest.add(torso);
    R.head = joint(R.chest, 0, 0.72, 0.06);
    const head = ball(black, 0.15, 1, 1.15, 1, 10); R.head.add(head);
    R.head.rotation.x = -0.6;
    R.arms = [];
    for (const s of [-1, 1]) { const sh = joint(R.chest, s * 0.22, 0.55, 0); sh.add(limb(black, 0.62, 0.05, 0.035)); const el = joint(sh, 0, -0.62, 0); el.add(limb(black, 0.55, 0.035, 0.02)); R.arms.push({ sh, el, s }); }
    R.legs = [];
    for (const s of [-1, 1]) { const hip = joint(R.hips, s * 0.12, 0, 0); hip.add(limb(black, 0.44, 0.07, 0.05)); const kn = joint(hip, 0, -0.44, 0); kn.add(limb(black, 0.42, 0.05, 0.035)); const foot = ball(black, 0.06, 1.3, 0.6, 2); foot.position.set(0, -0.42, 0.06); kn.add(foot); R.legs.push({ hip, kn, s }); }
    return { group: g, rig: R };
  },
  animate(v, dt) {
    const R = v.rig, st = v.st, sp = st.v || 0;
    v.walk = (v.walk || 0) + dt * (2 + sp * 1.6);
    const w = v.walk, k = Math.min(1.3, sp / 5);
    // the moonwalk: one foot slides back flat while the other lifts at the toe
    R.legs.forEach(L => { const ph = w + (L.s > 0 ? Math.PI : 0); L.hip.rotation.x = Math.sin(ph) * 0.5 * k; L.kn.rotation.x = (Math.sin(ph) > 0 ? Math.sin(ph) * 0.7 : 0) * k; });
    R.hips.position.y = 0.82 + Math.sin(w * 2) * 0.02 * k;
    R.chest.rotation.z = Math.sin(w) * 0.08 * k;
    const atk = st.s === 'attack' ? attackPose(v.stateT, 0.25) : { w: 0, s: 0 };
    R.arms.forEach(A => { A.sh.rotation.x = 0.4 + Math.sin(w + A.s) * 0.2 * k + atk.w * 1.6 - atk.s * 2.0; A.el.rotation.x = -0.4; });
    R.head.rotation.y = Math.sin(v.time * 9) * 0.06; // twitching
    if (st.s === 'dead') v.group.rotation.z = Math.min(1.5, v.stateT * 3);
  },
  onState(v, s, prev, game) {
    if (s === 'hunt' && prev === 'roam') { game.sfx('crawlerShriek', v.pos, { volume: 1, ref: 6 }); game.stats.scare(8); if (!game.flags.crawlHint) { game.flags.crawlHint = true; game.subtitle('It has no eyes. Stop moving. Don\'t make a sound.', 4); } }
  },
  ambient(v, dt, game) {
    const sp = v.st.v || 0;
    if (sp > 0.5) { v.stepT = (v.stepT ?? 0) - dt * (1.5 + sp * 0.5); if (v.stepT <= 0) { v.stepT = 1; game.sfx('crawlerSlide', v.pos, { volume: Math.min(1, 0.4 + sp * 0.07), ref: 4 }); } }
  },
};
