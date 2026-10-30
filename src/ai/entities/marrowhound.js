// MARROWHOUNDS — Level 1. Bone dogs that hunt in packs of 2-3. They stalk,
// circle, then dart in to bite and retreat. Fire (lighters, flares, furnaces)
// is a wall they will not cross; a focused flashlight beam makes them flinch.
// Difficulty: medium.
import * as THREE from 'three';
import { canSee, hearNoise, goTo, wander, setState, faceToward, stepToward, fleeFrom, lightOn, nearestPlayer } from '../brain.js';
import { joint, limb, ball, boxm, attackPose } from './rig.js';

function fearFrom(e, ctx) {
  // returns the strongest fire source near the hound {x,z,r} or null
  const zones = ctx.game.fireZones(e.levelId).concat(ctx.level.def.staticFires?.(ctx.level, e.x, e.z) || []);
  for (const p of ctx.players) if (p.lighter && !p.dead) zones.push({ x: p.x, z: p.z, r: 4.2 });
  let best = null;
  for (const z of zones) {
    const d = Math.hypot(z.x - e.x, z.z - e.z);
    if (d < z.r && (!best || d < best.d)) best = { ...z, d };
  }
  return best;
}

function insideFire(x, z, e, ctx) {
  const zones = ctx.game.fireZones(e.levelId);
  for (const p of ctx.players) if (p.lighter && !p.dead) zones.push({ x: p.x, z: p.z, r: 4.2 });
  return zones.some(f => Math.hypot(f.x - x, f.z - z) < f.r * 0.92);
}

export default {
  type: 'marrowhound',
  name: 'Marrowhound',
  hp: 60,
  radius: 0.35,
  height: 1.0,
  blood: 'bone',
  resist: { bullet: 1, melee: 1.2, fire: 2 },
  headMult: 1.6,
  hit: [{ part: 'body', y: 0.65, r: 0.33 }, { part: 'body', y: 0.62, r: 0.28, z: -0.4 }, { part: 'head', y: 0.72, r: 0.2, z: 0.62 }],
  despawnDist: 70,

  init(e) { e.state = 'roam'; e.circleDir = Math.random() < 0.5 ? -1 : 1; },

  think(e, dt, ctx) {
    const { level, players } = ctx;
    const diffK = ctx.difficulty === 'easy' ? 0.85 : ctx.difficulty === 'hard' ? 1.12 : 1;
    // perception: sight, sprint noise, proximity
    let tgt = null;
    const near = nearestPlayer(e, players, p => !p.downed && !p.hidden);
    if (near) {
      const p = near.p;
      if (near.d < 5 || canSee(e, p, level, { range: 17, fov: 2.6, eyeH: 0.8, lightAware: true })) tgt = p;
    }
    const heard = hearNoise(e, ctx.noises, level, 0.9);
    if (!tgt && heard && e.state === 'roam') { e.lastNoise = heard; setState(e, 'investigate'); }
    if (tgt) { e.target = tgt.id; e.lastSeen = { x: tgt.x, z: tgt.z, t: ctx.time }; if (e.state === 'roam' || e.state === 'investigate') { setState(e, 'stalk'); } }
    // pack alert: hounds share targets
    if (tgt) for (const o of ctx.game.entities.byLevel(e.levelId)) if (o.type === 'marrowhound' && o !== e && Math.hypot(o.x - e.x, o.z - e.z) < 14 && (o.state === 'roam' || o.state === 'investigate')) { o.target = tgt.id; o.lastSeen = e.lastSeen; setState(o, 'stalk'); }

    const fear = fearFrom(e, ctx);
    if (fear && e.state !== 'flee') { setState(e, 'flee'); e.fleeFrom = fear; }
    // bright focused beam: flinch back
    if (e.state === 'stalk' || e.state === 'charge') {
      for (const p of players) {
        if (lightOn(p, e.x, e.y + 0.7, e.z, level, 9) > 1.2) { setState(e, 'flinch'); e.fleeFrom = { x: p.x, z: p.z }; break; }
      }
    }
    const target = players.find(p => p.id === e.target);
    switch (e.state) {
      case 'roam':
        wander(e, level, 1.6, dt, 16, ctx.rng);
        break;
      case 'investigate':
        if (goTo(e, level, e.lastNoise.x, e.lastNoise.z, 3.2, dt) < 1 || e.stateT > 10) setState(e, 'roam');
        break;
      case 'stalk': {
        if (!target || target.downed || target.dead) { setState(e, 'roam'); break; }
        const d = Math.hypot(target.x - e.x, target.z - e.z);
        // circle at 6-8 m, then charge
        if (d > 9) goTo(e, level, target.x, target.z, 3.8 * diffK, dt, { repath: 0.5 });
        else {
          const a = Math.atan2(e.x - target.x, e.z - target.z) + e.circleDir * 0.6;
          const cx = target.x + Math.sin(a) * 6.5, cz = target.z + Math.cos(a) * 6.5;
          if (!insideFire(cx, cz, e, ctx)) stepToward(e, level, cx, cz, 2.8 * diffK, dt);
          faceToward(e, target.x, target.z, 6, dt);
          if (e.stuck > 0.5) e.circleDir *= -1;
        }
        if (e.stateT > 2.2 + (e.id % 3) * 0.7 && e.attackCd <= 0) setState(e, 'charge');
        if (ctx.time - (e.lastSeen?.t ?? 0) > 8) setState(e, 'roam');
        break;
      }
      case 'charge': {
        if (!target || target.dead || target.downed) { setState(e, 'roam'); break; }
        if (insideFire(target.x, target.z, e, ctx)) { setState(e, 'stalk'); break; }
        goTo(e, level, target.x, target.z, 6.3 * diffK, dt, { repath: 0.3, turn: 12 });
        const d = Math.hypot(target.x - e.x, target.z - e.z);
        if (d < 1.4) setState(e, 'bite');
        if (e.stateT > 4) setState(e, 'stalk');
        break;
      }
      case 'bite':
        if (target) faceToward(e, target.x, target.z, 12, dt);
        if (e.stateT > 0.18 && !e.bit) {
          e.bit = true;
          if (target && Math.hypot(target.x - e.x, target.z - e.z) < 2.0 && !target.hidden) ctx.hurt(target.id, 12, { from: e, scare: 6, bleed: 0.35, type: 'hound' });
          e.attackCd = 1.8;
        }
        if (e.stateT > 0.45) { e.bit = false; setState(e, 'retreat'); e.fleeFrom = target ? { x: target.x, z: target.z } : { x: e.x, z: e.z }; }
        break;
      case 'retreat':
        fleeFrom(e, level, e.fleeFrom.x, e.fleeFrom.z, 4.5, dt);
        if (e.stateT > 1.1) setState(e, 'stalk');
        break;
      case 'flinch':
        fleeFrom(e, level, e.fleeFrom.x, e.fleeFrom.z, 4, dt);
        if (e.stateT > 1.4) setState(e, 'stalk');
        break;
      case 'flee':
        if (e.fleeFrom) fleeFrom(e, level, e.fleeFrom.x, e.fleeFrom.z, 5, dt);
        if (!fearFrom(e, ctx) && e.stateT > 0.8) setState(e, target ? 'stalk' : 'roam');
        break;
    }
  },

  onDamage(e, dmg, dtype, from, game) {
    if (e.state === 'roam' || e.state === 'stalk') { e.target = from; setState(e, 'charge'); }
    return dmg;
  },

  // ------------------------------------------------------------- client view
  build(lib) {
    const bone = lib.dyn('bone');
    const dark = new THREE.MeshStandardMaterial({ color: 0x1a120c, roughness: 0.8 });
    const g = new THREE.Group();
    const R = {};
    const body = joint(g, 0, 0.66, 0);
    R.body = body;
    // spine of vertebrae
    for (let i = 0; i < 9; i++) {
      const v = boxm(bone, 0.07, 0.07, 0.09);
      v.position.set(0, 0.08 + Math.sin(i / 8 * Math.PI) * 0.06, -0.48 + i * 0.11);
      v.rotation.x = 0.2;
      body.add(v);
    }
    // ribcage
    for (let i = 0; i < 6; i++) {
      const rib = new THREE.Mesh(new THREE.TorusGeometry(0.17 - Math.abs(i - 2) * 0.012, 0.012, 4, 10, Math.PI * 1.25), bone);
      rib.rotation.set(0, Math.PI / 2, Math.PI / 2 + 0.95);
      rib.position.set(0, -0.02, -0.18 + i * 0.075);
      body.add(rib);
    }
    const pelvis = ball(bone, 0.1, 1.3, 0.7, 0.9); pelvis.position.set(0, 0.04, -0.5); body.add(pelvis);
    // tail
    R.tail = joint(body, 0, 0.09, -0.56);
    for (let i = 0; i < 5; i++) { const t = boxm(bone, 0.035 - i * 0.004, 0.035 - i * 0.004, 0.07); t.position.set(0, -i * 0.025, -0.06 - i * 0.07); R.tail.add(t); }
    // neck + skull with jaw
    R.neck = joint(body, 0, 0.12, 0.36);
    for (let i = 0; i < 3; i++) { const v = boxm(bone, 0.06, 0.06, 0.07); v.position.set(0, i * 0.03, 0.05 + i * 0.07); R.neck.add(v); }
    R.head = joint(R.neck, 0, 0.08, 0.26);
    const skull = ball(bone, 0.11, 1.0, 0.85, 1.25); skull.position.set(0, 0.02, 0.02); R.head.add(skull);
    const snout = boxm(bone, 0.1, 0.07, 0.2); snout.position.set(0, -0.01, 0.17); R.head.add(snout);
    for (const s of [-1, 1]) {
      const eye = ball(dark, 0.03); eye.position.set(s * 0.055, 0.04, 0.08); R.head.add(eye);
      const glow = ball(new THREE.MeshBasicMaterial({ color: 0xff7a2a }), 0.008); glow.position.set(s * 0.055, 0.04, 0.105); R.head.add(glow);
      for (let k = 0; k < 4; k++) { const tooth = new THREE.Mesh(new THREE.ConeGeometry(0.008, 0.04, 4), bone); tooth.position.set(s * 0.035, -0.06, 0.12 + k * 0.035); tooth.rotation.x = Math.PI; R.head.add(tooth); }
    }
    R.jaw = joint(R.head, 0, -0.05, 0.02);
    const jaw = boxm(bone, 0.09, 0.03, 0.24); jaw.position.set(0, -0.02, 0.13); R.jaw.add(jaw);
    // legs
    R.legs = [];
    for (const [x, z, front] of [[-0.12, 0.25, 1], [0.12, 0.25, 1], [-0.12, -0.46, 0], [0.12, -0.46, 0]]) {
      const hip = joint(body, x, 0, z);
      hip.add(limb(bone, 0.32, 0.03, 0.022, 6));
      const knee = joint(hip, 0, -0.32, 0);
      knee.add(limb(bone, 0.3, 0.02, 0.014, 6));
      const paw = boxm(bone, 0.05, 0.03, 0.08); paw.position.set(0, -0.31, 0.03); knee.add(paw);
      R.legs.push({ hip, knee, front, side: x > 0 ? 1 : -1 });
    }
    return { group: g, rig: R };
  },

  animate(v, dt) {
    const R = v.rig, st = v.st;
    const sp = st.v || 0;
    const run = Math.min(1.4, sp / 4);
    v.walk = (v.walk || 0) + dt * (3 + sp * 2.3);
    const w = v.walk, t = v.time;
    const stalk = st.s === 'stalk';
    R.body.position.y = 0.66 - (stalk ? 0.12 : 0) + Math.abs(Math.sin(w)) * 0.04 * run;
    R.body.rotation.x = Math.sin(w * 2) * 0.05 * run + (stalk ? 0.08 : 0);
    R.legs.forEach((L, i) => {
      const gallop = run > 0.9;
      const ph = gallop ? (L.front ? 0 : Math.PI) + (L.side > 0 ? 0.3 : 0) : (i === 0 || i === 3 ? 0 : Math.PI);
      const s = Math.sin(w + ph);
      L.hip.rotation.x = s * 0.7 * Math.min(1, run + 0.15) + (stalk ? -0.3 : 0) * (L.front ? 1 : -0.5);
      L.knee.rotation.x = (L.front ? -1 : 1) * Math.max(0, Math.sin(w + ph + 1)) * 0.8 * run + (stalk ? 0.5 : 0);
    });
    R.neck.rotation.x = stalk ? 0.4 : -0.1 + Math.sin(t * 1.5) * 0.04;
    R.head.rotation.x = stalk ? -0.3 : 0;
    const biting = st.s === 'bite' || st.s === 'charge';
    R.jaw.rotation.x = biting ? 0.35 + Math.sin(t * 25) * 0.25 : stalk ? 0.15 + Math.sin(t * 8) * 0.05 : 0.05;
    if (st.s === 'bite') {
      const a = attackPose(v.stateT, 0.2);
      R.body.position.z = a.s * 0.4 - a.w * 0.15;
      R.neck.rotation.x = -0.1 + a.w * 0.5 - a.s * 0.6;
      R.head.rotation.x = a.s * -0.3;
      R.jaw.rotation.x = 0.1 + a.w * 0.8 * (1 - a.s);
    } else R.body.position.z = 0;
    R.tail.rotation.x = -0.3 + Math.sin(t * 3) * 0.1;
    R.tail.rotation.y = Math.sin(t * (stalk ? 10 : 2)) * 0.3;
    if (st.s === 'dead') { v.group.rotation.z = Math.min(1.5, v.stateT * 3); R.body.position.y = Math.max(0.25, 0.66 - v.stateT); }
    if (st.s === 'flee' || st.s === 'flinch') R.head.rotation.y = Math.sin(t * 12) * 0.3;
  },

  onState(v, s, prev, game) {
    if (s === 'stalk' && prev !== 'retreat' && prev !== 'flinch') game.sfx('growl', v.pos, { volume: 0.9, ref: 3, dur: 1.6 });
    if (s === 'charge') game.sfx('bark', v.pos, { volume: 1, ref: 4 });
    if (s === 'bite') { game.sfx('bark', v.pos, { volume: 0.8, ref: 3 }); setTimeout(() => game.sfx('boneCrunch', v.pos, { volume: 1, ref: 3 }), 220); }
    if (s === 'flee' || s === 'flinch') game.sfx('growl', v.pos, { volume: 0.6, dur: 0.6 });
    if (s === 'dead') game.sfx('boneRattle', v.pos, { volume: 1 });
  },

  ambient(v, dt, game) {
    if ((v.st.v || 0) > 0.4) {
      v.stepT = (v.stepT ?? 0) - dt * v.st.v / 1.1;
      if (v.stepT <= 0) { v.stepT = 1; game.sfx('boneRattle', v.pos, { volume: v.st.v > 4 ? 0.5 : 0.22, ref: 2 }); }
    }
    v.growlT = (v.growlT ?? 4) - dt;
    if (v.growlT <= 0 && v.st.s !== 'dead') { v.growlT = 3 + Math.random() * 5; if (v.st.s === 'stalk') game.sfx('growl', v.pos, { volume: 0.7, dur: 1.2 }); }
  },
};
