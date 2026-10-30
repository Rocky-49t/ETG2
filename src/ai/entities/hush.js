// THE HUSH — Level 0. Blind, tall and office-thin. Hunts purely by sound.
// Crouch-walking past it is the intended answer; sprinting and gunfire bring
// it running. Difficulty: easy.
import * as THREE from 'three';
import { attackPose } from './rig.js';
import { hearNoise, goTo, wander, setState, faceToward, stepToward } from '../brain.js';
import { limb, joint, ball, boxm, leg } from './rig.js';

export default {
  type: 'hush',
  name: 'The Hush',
  hp: 150,
  radius: 0.38,
  height: 2.5,
  resist: { bullet: 1, melee: 1, fire: 1.2, light: 0 },
  headMult: 2.2,
  hit: [{ part: 'body', y: 1.45, r: 0.32 }, { part: 'body', y: 0.8, r: 0.28 }, { part: 'head', y: 2.32, r: 0.2, z: 0.12 }],
  despawnDist: 80,

  init(e) { e.state = 'wander'; e.listenT = 0; },

  think(e, dt, ctx) {
    const { level, players, noises } = ctx;
    const mult = ctx.difficulty === 'easy' ? 0.75 : ctx.difficulty === 'hard' ? 1.3 : 1;
    const heard = hearNoise(e, noises, level, mult);
    if (heard && e.state !== 'attack' && e.state !== 'stagger') {
      e.lastNoise = { x: heard.x, z: heard.z, t: ctx.time };
      if (e.state === 'wander' || e.state === 'listen') setState(e, heard.score > 0.55 ? 'hunt' : 'investigate');
      else if (e.state === 'investigate' && heard.score > 0.35) setState(e, 'hunt');
    }
    // bumping into a player gives them away regardless of noise
    for (const p of players) {
      if (p.dead || p.hidden) continue;
      const d = Math.hypot(p.x - e.x, p.z - e.z);
      if (d < 1.05 && e.state !== 'attack' && e.state !== 'stagger' && e.attackCd <= 0) {
        e.target = p.id; setState(e, 'attack');
      }
    }
    const speed = { wander: 0.95, investigate: 2.2, hunt: 4.1 }[e.state] * (ctx.difficulty === 'easy' ? 0.85 : ctx.difficulty === 'hard' ? 1.1 : 1);
    switch (e.state) {
      case 'wander':
        wander(e, level, speed, dt, 14, ctx.rng);
        if (e.stateT > 6 + (e.id % 5)) setState(e, 'listen');
        break;
      case 'listen':
        e.speedNow = 0;
        e.yaw += Math.sin(e.stateT * 1.7) * dt * 0.8;
        if (e.stateT > 3.2) setState(e, 'wander');
        break;
      case 'investigate':
      case 'hunt': {
        const n = e.lastNoise;
        if (!n) { setState(e, 'listen'); break; }
        const rem = goTo(e, level, n.x, n.z, speed, dt, { repath: 0.5 });
        if (rem < 0.9 || rem === Infinity) setState(e, 'listen');
        // close to a noisy player: lunge
        for (const p of players) {
          if (p.dead || p.hidden) continue;
          if (Math.hypot(p.x - e.x, p.z - e.z) < 1.7 && ctx.time - n.t < 1.2 && e.attackCd <= 0) { e.target = p.id; setState(e, 'attack'); }
        }
        break;
      }
      case 'attack': {
        e.speedNow = 0;
        const p = players.find(q => q.id === e.target);
        if (p) faceToward(e, p.x, p.z, 10, dt);
        if (e.stateT > 0.45 && !e.struck) {
          e.struck = true;
          if (p && !p.hidden && Math.hypot(p.x - e.x, p.z - e.z) < 2.0) ctx.hurt(p.id, ctx.difficulty === 'hard' ? 38 : 30, { from: e, scare: 18, bleed: 0.6, type: 'hush' });
          e.attackCd = 1.6;
        }
        if (e.stateT > 1.3) { e.struck = false; setState(e, 'listen'); }
        break;
      }
      case 'stagger':
        e.speedNow = 0;
        if (e.stateT > 0.6) setState(e, 'hunt');
        break;
    }
  },

  onDamage(e, dmg, dtype, fromPid, game) {
    // getting shot tells it exactly where you are
    const p = game.playerTargetById?.(fromPid);
    if (p) e.lastNoise = { x: p.x, z: p.z, t: game.entities.time };
    if (dmg > 25 && e.state !== 'attack') setState(e, 'stagger');
    return dmg;
  },

  // ------------------------------------------------------------- client view
  build(lib) {
    const skin = lib.dyn('skinPale').clone();
    skin.color = new THREE.Color(0.62, 0.58, 0.56);
    skin.roughness = 0.45;
    const g = new THREE.Group();
    const R = {};
    const pelvis = joint(g, 0, 1.25, 0);
    R.pelvis = pelvis;
    pelvis.add(ball(skin, 0.15, 1.2, 0.7, 0.8));
    R.legs = [leg(pelvis, skin, -0.12, 0, 0, 0.66, 0.66, 0.065), leg(pelvis, skin, 0.12, 0, 0, 0.66, 0.66, 0.065)];
    for (const L of R.legs) { const f = boxm(skin, 0.09, 0.05, 0.22); f.position.set(0, -0.02, 0.06); L.foot.add(f); }
    const spine = joint(pelvis, 0, 0.08, 0);
    R.spine = spine;
    const torso = ball(skin, 0.2, 0.62, 2.0, 0.5);
    torso.position.y = 0.42;
    spine.add(torso);
    const chest = ball(skin, 0.2, 0.95, 0.75, 0.62);
    chest.position.set(0, 0.68, 0.0);
    spine.add(chest);
    for (let i = 0; i < 6; i++) {
      const rib = new THREE.Mesh(new THREE.TorusGeometry(0.12 - i * 0.004, 0.012, 4, 12, Math.PI), skin);
      rib.rotation.set(Math.PI / 2, 0, 0);
      rib.position.set(0, 0.48 + i * 0.055, 0.03);
      rib.scale.set(1.15, 1, 0.9);
      spine.add(rib);
    }
    const neck = joint(spine, 0, 0.82, 0.04);
    R.neck = neck;
    const neckM = limb(skin, 0.24, 0.04, 0.05);
    neckM.rotation.x = Math.PI;
    neck.add(neckM);
    const head = joint(neck, 0, 0.24, 0.03);
    R.head = head;
    const skull = ball(skin, 0.15, 1.0, 1.6, 1.15, 12);
    skull.position.y = 0.17;
    head.add(skull);
    // ears: wet paper membranes
    const earMat = new THREE.MeshStandardMaterial({ color: 0xd8a8a0, roughness: 0.4, side: THREE.DoubleSide, transparent: true, opacity: 0.85 });
    R.ears = [];
    for (const s of [-1, 1]) {
      const ear = new THREE.Mesh(new THREE.CircleGeometry(0.16, 10), earMat);
      ear.position.set(s * 0.17, 0.2, -0.0);
      ear.rotation.y = s * 0.75;
      ear.scale.set(0.9, 1.6, 1);
      head.add(ear);
      R.ears.push(ear);
    }
    const mouth = boxm(new THREE.MeshStandardMaterial({ color: 0x1a0505, roughness: 0.4 }), 0.012, 0.12, 0.02);
    mouth.position.set(0, 0.08, 0.165);
    head.add(mouth);
    R.arms = [];
    for (const s of [-1, 1]) {
      const sh = joint(spine, s * 0.2, 0.74, 0.02);
      sh.add(limb(skin, 0.72, 0.045, 0.035));
      const el = joint(sh, 0, -0.72, 0);
      el.add(limb(skin, 0.7, 0.035, 0.025));
      const hand = joint(el, 0, -0.7, 0);
      hand.add(ball(skin, 0.04, 1, 1.4, 0.6));
      for (let f = -2; f <= 1; f++) {
        const fing = limb(skin, 0.3, 0.01, 0.004, 5);
        fing.position.x = f * 0.018 + 0.01;
        fing.rotation.z = f * 0.1;
        fing.rotation.x = -0.15;
        hand.add(fing);
      }
      R.arms.push({ sh, el, hand, s });
    }
    return { group: g, rig: R };
  },

  animate(v, dt) {
    const R = v.rig, st = v.st;
    const sp = Math.min(1.5, (st.v || 0) / 2.5);
    v.walk = (v.walk || 0) + dt * (1.5 + (st.v || 0) * 1.6);
    const w = v.walk, t = v.time;
    const hunting = st.s === 'hunt';
    R.pelvis.position.y = 1.18 + Math.abs(Math.cos(w)) * 0.05 * sp - (hunting ? 0.12 : 0);
    R.spine.rotation.x = 0.45 + (hunting ? 0.35 : 0) + Math.sin(t * 0.7) * 0.03;
    R.legs.forEach((L, i) => {
      const ph = Math.sin(w + i * Math.PI) * 0.6 * sp;
      L.hip.rotation.x = ph - 0.25;
      L.knee.rotation.x = 0.5 + Math.max(0, Math.sin(w + i * Math.PI + 1.2)) * 0.7 * sp;
    });
    let headTurn = 0, headTilt = 0;
    if (st.s === 'listen') { headTurn = Math.sin(t * 1.3) * 0.8; headTilt = Math.sin(t * 0.9) * 0.4; }
    R.neck.rotation.x = -0.35 + (hunting ? -0.4 : 0);
    R.head.rotation.set(-0.2, headTurn, headTilt);
    const earPulse = st.s === 'listen' || st.s === 'investigate' ? 1 + Math.sin(t * 9) * 0.08 : 1;
    R.ears.forEach(e => e.scale.set(0.8 * earPulse, 1.4 * earPulse, 1));
    R.arms.forEach((A, i) => {
      const sw = Math.sin(w + i * Math.PI) * 0.35 * sp;
      A.sh.rotation.set(sw + 0.15, 0, A.s * 0.08);
      A.el.rotation.x = -0.25 - Math.sin(t * 1.1 + i) * 0.05;
      if (st.s === 'attack') {
        // rear back with both arms high, then rake down and forward
        const a = attackPose(v.stateT, 0.45);
        A.sh.rotation.x = -2.9 * a.w + -1.0 * a.s + 0.15 * (1 - a.w - a.s);
        A.sh.rotation.z = A.s * (0.25 * a.w - 0.2 * a.s);
        A.el.rotation.x = -1.3 * a.w - 0.05 * a.s;
      }
    });
    if (st.s === 'attack') {
      const a = attackPose(v.stateT, 0.45);
      R.pelvis.position.z = a.s * 0.45 - a.w * 0.1;
      R.neck.rotation.x += a.s * 0.5 - a.w * 0.4;
      R.head.rotation.x += a.s * 0.3;
    } else R.pelvis.position.z = 0;
    if (st.s === 'dead') { v.group.rotation.x = Math.min(1.45, v.stateT * 2.5); }
  },

  onState(v, s, prev, game) {
    if (s === 'hunt') game.sfx('hushShriek', v.pos, { volume: 0.9, ref: 5 });
    if (s === 'attack') { game.sfx('hushInhale', v.pos, { volume: 1 }); setTimeout(() => game.sfx('hushShriek', v.pos, { volume: 0.9, ref: 4 }), 380); }
    if (s === 'listen') game.sfx('hushClick', v.pos, { volume: 0.8, ref: 3 });
    if (s === 'dead') game.sfx('hushShriek', v.pos, { volume: 0.6 });
  },

  ambient(v, dt, game) {
    v.clickT = (v.clickT ?? 2) - dt;
    if (v.clickT <= 0) {
      v.clickT = 1.6 + Math.random() * 2.4;
      if (v.st.s !== 'dead') game.sfx('hushClick', v.pos, { volume: 0.55, ref: 3 });
    }
    // footsteps
    if ((v.st.v || 0) > 0.3) {
      v.stepT = (v.stepT ?? 0) - dt * (v.st.v / 1.4);
      if (v.stepT <= 0) { v.stepT = 1; game.sfx('step', v.pos, { surface: game.surfaceAt(v.pos), volume: v.st.v > 3 ? 0.9 : 0.4, ref: 2.5 }); }
    }
  },
};
