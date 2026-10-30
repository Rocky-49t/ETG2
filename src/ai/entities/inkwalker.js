// THE INKWALKER — Level 2. A tall black skeleton that moves like a puppet with
// half its strings cut. It always knows roughly where you are, never tires,
// and pulls you out of hiding if it saw you go in. A flashlight held on its
// skull stuns it (focused beams work fast); stun has a cooldown.
// "Killing" it only makes it collapse into ink for a while. Difficulty: hard.
import * as THREE from 'three';
import { canSee, hearNoise, goTo, setState, faceToward, lightOn, nearestPlayer, wander } from '../brain.js';
import { joint, limb, ball, boxm, attackPose } from './rig.js';

export default {
  type: 'inkwalker',
  name: 'The Inkwalker',
  hp: 420,
  radius: 0.4,
  height: 2.6,
  blood: 'ichor',
  resist: { bullet: 0.35, melee: 0.6, fire: 0.8 },
  headMult: 1.5,
  hit: [{ part: 'body', y: 1.5, r: 0.3 }, { part: 'body', y: 0.8, r: 0.25 }, { part: 'head', y: 2.42, r: 0.2, z: 0.05 }],
  persistent: true,
  despawnDist: 120,
  announceKill: true,

  init(e) { e.state = 'stalk'; e.stunCd = 0; e.lightAcc = 0; e.seenHide = null; },

  think(e, dt, ctx) {
    const { level } = ctx;
    // the pale draught makes a drinker invisible to it: it neither hunts nor hears them
    const players = ctx.players.filter(p => !p.ward);
    const noises = players.length === ctx.players.length ? ctx.noises : ctx.noises.filter(n => players.some(p => p.id === n.pid));
    const diffK = ctx.difficulty === 'easy' ? 0.85 : ctx.difficulty === 'hard' ? 1.12 : 1;
    e.stunCd = Math.max(0, e.stunCd - dt);
    if (e.state === 'collapsed') {
      e.speedNow = 0;
      if (e.stateT > 50) {
        // reform somewhere out of sight
        const pos = ctx.game.director.findSpawn(ctx, 30, 45);
        if (pos) { e.x = pos.x; e.z = pos.z; e.y = level.floorAt(pos.x, pos.z); }
        e.hp = e.maxHp; setState(e, 'stalk');
      }
      return;
    }
    // flashlight on the skull
    if (e.state !== 'stunned' && e.stunCd <= 0) {
      let lit = 0;
      for (const p of ctx.players) if (!p.dead) lit = Math.max(lit, lightOn(p, e.x, e.y + 2.4, e.z, level, 14));
      e.lightAcc = lit > 0 ? e.lightAcc + dt * lit : Math.max(0, e.lightAcc - dt * 0.5);
      if (e.lightAcc > 0.9) { setState(e, 'stunned'); e.lightAcc = 0; e.stunCd = 9; }
    }
    if (e.state === 'stunned') {
      e.speedNow = 0;
      if (e.stateT > 4.2) setState(e, 'chase');
      return;
    }
    // target: nearest player; it always senses general direction
    const near = nearestPlayer(e, players, p => !p.downed);
    if (!near) { wander(e, level, 1.2, dt, 10, ctx.rng); return; }
    const p = near.p;
    const sees = !p.hidden && canSee(e, p, level, { range: 26, eyeH: 2.3 });
    if (sees) { e.lastSeen = { x: p.x, z: p.z, t: ctx.time, id: p.id }; if (e.state !== 'attack') setState(e, 'chase'); }
    // watched someone climb into a locker
    if (p.hidden && e.lastSeen?.id === p.id && ctx.time - e.lastSeen.t < 1.5) e.seenHide = { id: p.id, x: p.x, z: p.z };
    const heard = hearNoise(e, noises, level, 1.2);
    if (heard && !sees) e.lastSeen = { x: heard.x, z: heard.z, t: ctx.time };

    switch (e.state) {
      case 'stalk': {
        // drift toward the players' rough position, slowly
        const tx = e.lastSeen && ctx.time - e.lastSeen.t < 20 ? e.lastSeen.x : p.x + Math.sin(ctx.time * 0.1 + e.id) * 12;
        const tz = e.lastSeen && ctx.time - e.lastSeen.t < 20 ? e.lastSeen.z : p.z + Math.cos(ctx.time * 0.1 + e.id) * 12;
        goTo(e, level, tx, tz, 1.7 * diffK, dt, { repath: 1.5 });
        break;
      }
      case 'chase': {
        if (e.seenHide && players.find(q => q.id === e.seenHide.id)?.hidden) {
          // go rip them out of the locker
          const d = goTo(e, level, e.seenHide.x, e.seenHide.z, 4.0 * diffK, dt, { repath: 0.5 });
          if (d < 1.4) { ctx.hurt(e.seenHide.id, 30, { from: e, scare: 30, pull: true, type: 'ink' }); e.seenHide = null; setState(e, 'attack'); e.target = null; }
          break;
        }
        if (!e.lastSeen) { setState(e, 'stalk'); break; }
        const d = goTo(e, level, e.lastSeen.x, e.lastSeen.z, 4.35 * diffK, dt, { repath: 0.35 });
        if (sees && near.d < 1.7 && e.attackCd <= 0) { e.target = p.id; setState(e, 'attack'); }
        if (!sees && d < 1 && ctx.time - e.lastSeen.t > 3) setState(e, 'search');
        break;
      }
      case 'search':
        e.speedNow = 0;
        e.yaw += dt * 1.2;
        if (e.stateT > 3) setState(e, 'stalk');
        break;
      case 'attack': {
        const t = players.find(q => q.id === e.target);
        if (t) faceToward(e, t.x, t.z, 10, dt);
        if (e.stateT > 0.5 && !e.struck && t) {
          e.struck = true;
          if (Math.hypot(t.x - e.x, t.z - e.z) < 2.2 && !t.hidden) ctx.hurt(t.id, 28, { from: e, scare: 14, bleed: 0.4, type: 'ink' });
          e.attackCd = 1.3;
        }
        if (e.stateT > 1.0) { e.struck = false; setState(e, 'chase'); }
        break;
      }
    }
  },

  onDeath(e) { e.hp = 1; setState(e, 'collapsed'); return false; },
  onDamage(e, dmg) { if (e.state === 'collapsed') return 0; return dmg; },

  // ------------------------------------------------------------- client view
  build(lib) {
    const ink = new THREE.MeshStandardMaterial({ color: 0x060607, roughness: 0.42, metalness: 0.15 });
    const g = new THREE.Group();
    const R = {};
    const pelvis = joint(g, 0, 1.22, 0);
    R.pelvis = pelvis;
    pelvis.add(ball(ink, 0.1, 1.25, 0.75, 0.75));
    R.legs = [];
    for (const s of [-1, 1]) {
      const hip = joint(pelvis, s * 0.12, -0.02, 0);
      hip.add(limb(ink, 0.64, 0.05, 0.035));
      const knee = joint(hip, 0, -0.64, 0);
      knee.add(ball(ink, 0.055));
      knee.add(limb(ink, 0.6, 0.04, 0.028));
      const foot = boxm(ink, 0.06, 0.03, 0.2); foot.position.set(0, -0.6, 0.06); knee.add(foot);
      R.legs.push({ hip, knee, s });
    }
    const spine = joint(pelvis, 0, 0.06, 0);
    R.spine = spine;
    for (let i = 0; i < 7; i++) { const v = ball(ink, 0.035); v.position.set(0, 0.06 + i * 0.1, -0.03); spine.add(v); }
    for (let i = 0; i < 6; i++) {
      const rib = new THREE.Mesh(new THREE.TorusGeometry(0.14 - Math.abs(i - 2) * 0.012, 0.011, 4, 12, Math.PI * 1.3), ink);
      rib.rotation.set(Math.PI / 2, 0, -Math.PI * 0.15);
      rib.position.set(0, 0.36 + i * 0.065, 0.02);
      spine.add(rib);
    }
    const clav = boxm(ink, 0.46, 0.04, 0.05); clav.position.set(0, 0.78, 0); spine.add(clav);
    R.neck = joint(spine, 0, 0.8, 0);
    for (let i = 0; i < 3; i++) { const v = ball(ink, 0.03); v.position.set(0, 0.04 + i * 0.06, 0); R.neck.add(v); }
    R.head = joint(R.neck, 0, 0.2, 0);
    const skull = ball(ink, 0.13, 0.95, 1.1, 1.1, 12); skull.position.y = 0.12; R.head.add(skull);
    const cheek = ball(ink, 0.09, 1.3, 0.8, 1.0); cheek.position.set(0, 0.04, 0.05); R.head.add(cheek);
    const jaw = boxm(ink, 0.11, 0.035, 0.11); jaw.position.set(0, -0.03, 0.07); R.head.add(jaw);
    for (let k = 0; k < 6; k++) { const tooth = boxm(new THREE.MeshStandardMaterial({ color: 0x9a9384, roughness: 0.6 }), 0.012, 0.025, 0.01); tooth.position.set(-0.04 + k * 0.016, 0.0, 0.12); R.head.add(tooth); }
    R.jaw = jaw;
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0xd8e8ff });
    R.eyes = [];
    for (const s of [-1, 1]) {
      const sock = ball(new THREE.MeshBasicMaterial({ color: 0x000000 }), 0.035); sock.position.set(s * 0.05, 0.12, 0.115); R.head.add(sock);
      const eye = ball(eyeMat, 0.009); eye.position.set(s * 0.05, 0.12, 0.145); R.head.add(eye); R.eyes.push(eye);
    }
    R.arms = [];
    for (const s of [-1, 1]) {
      const sh = joint(spine, s * 0.25, 0.76, 0);
      sh.add(ball(ink, 0.06));
      sh.add(limb(ink, 0.62, 0.04, 0.03));
      const el = joint(sh, 0, -0.62, 0);
      el.add(ball(ink, 0.045));
      el.add(limb(ink, 0.58, 0.032, 0.022));
      const hand = joint(el, 0, -0.58, 0);
      hand.add(ball(ink, 0.04, 1, 1.4, 0.6));
      for (let f = -2; f <= 1; f++) { const fi = limb(ink, 0.26, 0.011, 0.005, 4); fi.position.x = f * 0.02 + 0.01; fi.rotation.z = f * 0.12; fi.rotation.x = -0.25; hand.add(fi); }
      R.arms.push({ sh, el, s });
    }
    return { group: g, rig: R };
  },

  animate(v, dt) {
    const R = v.rig, st = v.st, t = v.time;
    const sp = (st.v || 0);
    v.walk = (v.walk || 0) + dt * (1.6 + sp * 1.5);
    const w = v.walk;
    const run = Math.min(1.3, sp / 3.5);
    // jerky puppet twitches
    v.twT = (v.twT || 0) - dt;
    if (v.twT <= 0) { v.twT = 0.08 + Math.random() * 0.6; v.tw = [(Math.random() - 0.5) * 0.5, (Math.random() - 0.5) * 0.4, (Math.random() - 0.5) * 0.3]; }
    const tw = v.tw || [0, 0, 0];
    const stunned = st.s === 'stunned';
    const collapsed = st.s === 'collapsed';
    R.pelvis.position.y = collapsed ? Math.max(0.1, 1.22 - v.stateT * 2) : 1.22 + Math.abs(Math.sin(w)) * 0.06 * run;
    R.spine.rotation.set(0.32 + run * 0.2 + tw[0] * 0.3, tw[1] * 0.2, tw[2] * 0.3);
    R.legs.forEach((L, i) => {
      const ph = Math.sin(w + i * Math.PI);
      L.hip.rotation.x = ph * 0.7 * run - 0.1;
      L.knee.rotation.x = Math.max(0, Math.sin(w + i * Math.PI + 1.3)) * 1.0 * run + 0.1;
    });
    R.neck.rotation.set(-0.15 + tw[0], tw[1] * 2, tw[2]);
    R.head.rotation.set(0, Math.sin(t * 0.7) * 0.2, Math.sin(t * 13) * 0.04 * (stunned ? 3 : 1));
    R.jaw.rotation.x = st.s === 'chase' || st.s === 'attack' ? 0.3 + Math.sin(t * 20) * 0.15 : 0.05;
    R.arms.forEach((A, i) => {
      const sw = Math.sin(w + i * Math.PI) * 0.6 * run;
      A.sh.rotation.set(sw + tw[i] * 0.4, 0, A.s * 0.15);
      A.el.rotation.x = -0.55 - run * 0.4;
      if (st.s === 'attack') {
        // both claws drawn back over the shoulders, then a lunging double swipe
        const a = attackPose(v.stateT, 0.5);
        A.sh.rotation.x = -3.0 * a.w - 1.1 * a.s;
        A.sh.rotation.z = A.s * (0.5 * a.w - 0.35 * a.s);
        A.el.rotation.x = -1.6 * a.w - 0.1 * a.s;
      }
      if (stunned) { A.sh.rotation.set(-2.5, 0, A.s * -0.5); A.el.rotation.x = -1.8; }
    });
    if (st.s === 'attack') {
      const a = attackPose(v.stateT, 0.5);
      R.spine.rotation.x += a.s * 0.7 - a.w * 0.35;
      R.pelvis.position.z = a.s * 0.55;
      R.jaw.rotation.x = 0.2 + a.w * 0.6 + a.s * 0.3;
      R.head.rotation.x += -a.w * 0.4 + a.s * 0.2;
    } else R.pelvis.position.z = 0;
    for (const e of R.eyes) e.visible = !collapsed && !(stunned && Math.sin(t * 30) > 0);
    if (collapsed) v.group.scale.y = Math.max(0.15, 1 - v.stateT * 0.8);
    else v.group.scale.y = Math.min(1, (v.group.scale.y || 1) + dt * 0.5);
  },

  onState(v, s, prev, game) {
    if (s === 'chase' && prev !== 'attack' && prev !== 'stunned') { game.sfx('inkScreech', v.pos, { volume: 1, ref: 5 }); game.stats.scare(5); }
    if (s === 'stunned') { game.sfx('stunned', v.pos, { volume: 1 }); game.subtitle('The Inkwalker reels from the light!', 2); }
    if (s === 'attack') { game.sfx('inkAttack', v.pos, { volume: 1.3, ref: 6 }); game.stats.scare(6); }
    if (s === 'collapsed') { game.sfx('stunned', v.pos, {}); game.subtitle('The Inkwalker collapses into a puddle of ink. It won\'t stay down.', 3.5); }
  },

  ambient(v, dt, game) {
    if ((v.st.v || 0) > 0.3) {
      v.stepT = (v.stepT ?? 0) - dt * v.st.v / 1.3;
      if (v.stepT <= 0) { v.stepT = 1; game.sfx('inkStep', v.pos, { volume: v.st.v > 3 ? 1 : 0.6, ref: 3 }); }
    }
    v.moanT = (v.moanT ?? 6) - dt;
    if (v.moanT <= 0) { v.moanT = 7 + Math.random() * 8; if (v.st.s === 'stalk') game.sfx('inkMoan', v.pos, { volume: 0.7, ref: 4 }); }
    if (v.st.s !== 'collapsed' && Math.random() < dt * 1.5) game.effects.burst('ichor', { x: v.st.x + (Math.random() - 0.5) * 0.3, y: v.st.y + 1.2 + Math.random(), z: v.st.z + (Math.random() - 0.5) * 0.3, floor: v.st.y }, { x: 0, y: -1, z: 0 }, 0.05);
  },
};
