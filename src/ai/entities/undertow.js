// THE UNDERTOW — Level 3. A long pale-faced eel thing that lives in the pools.
// It hunts anyone in deep water, gurgling as it closes in (a fair warning),
// and lunges at people standing too close to the edge. Out of the water it
// is helpless. Hard if it gets you; easy to avoid if you listen.
import * as THREE from 'three';
import { goTo, setState, faceToward, stepToward, nearestPlayer } from '../brain.js';
import { ball, boxm } from './rig.js';

const SEG = 14;

function isWater(level, x, z) {
  const w = level.waterAt(x, z), f = level.floorAt(x, z);
  return w > f + 0.9;
}

export default {
  type: 'undertow',
  name: 'The Undertow',
  hp: 260,
  radius: 0.45,
  height: 0.8,
  resist: { bullet: 0.55, melee: 1.0 },
  headMult: 2.0,
  hit: v => {
    const sub = v.st.a?.sub ?? 1;
    return [{ part: 'head', y: v.rig.headY ?? -0.4, r: 0.35, z: 0.5 }, { part: 'body', y: (v.rig.headY ?? -0.4) - 0.1, r: 0.35, z: -0.3 }];
  },
  persistent: false,
  despawnDist: 90,
  flying: true,

  init(e, game) {
    e.state = 'patrol';
    e.flying = true;
    const level = game.getLevel(e.levelId);
    e.water = level.waterAt(e.x, e.z);
    e.y = Math.max(level.floorAt(e.x, e.z) + 0.6, e.water - 1.6);
    e.sub = 1;
  },

  think(e, dt, ctx) {
    const { level, players } = ctx;
    const surfaceY = e.water;
    const floorY = level.floorAt(e.x, e.z);
    const deep = surfaceY - 1.2;
    const near = nearestPlayer(e, players, p => !p.downed && !p.hidden);
    const swimmers = players.filter(p => !p.dead && p.inWater && Math.hypot(p.x - e.x, p.z - e.z) < 22);
    const edgeStanders = players.filter(p => !p.dead && !p.inWater && Math.hypot(p.x - e.x, p.z - e.z) < 3.4);
    const moveWater = (tx, tz, speed) => {
      // stay within water tiles
      const dx = tx - e.x, dz = tz - e.z, d = Math.hypot(dx, dz) || 1;
      const nx = e.x + dx / d * speed * dt, nz = e.z + dz / d * speed * dt;
      if (isWater(level, nx, nz)) { e.x = nx; e.z = nz; e.speedNow = speed; }
      else if (isWater(level, nx, e.z)) { e.x = nx; e.speedNow = speed * 0.7; }
      else if (isWater(level, e.x, nz)) { e.z = nz; e.speedNow = speed * 0.7; }
      else e.speedNow = 0;
      faceToward(e, tx, tz, 4, dt);
    };
    switch (e.state) {
      case 'patrol': {
        e.patrolT = (e.patrolT || 0) - dt;
        if (!e.pgoal || e.patrolT <= 0 || Math.hypot(e.pgoal.x - e.x, e.pgoal.z - e.z) < 1) {
          for (let k = 0; k < 10; k++) {
            const a = Math.random() * Math.PI * 2, r = 3 + Math.random() * 8;
            const x = e.x + Math.cos(a) * r, z = e.z + Math.sin(a) * r;
            if (isWater(level, x, z)) { e.pgoal = { x, z }; break; }
          }
          e.patrolT = 5 + Math.random() * 4;
        }
        if (e.pgoal) moveWater(e.pgoal.x, e.pgoal.z, 1.4);
        e.y += (Math.max(floorY + 0.6, deep - 0.4) - e.y) * dt;
        if (swimmers.length) { e.target = swimmers[0].id; setState(e, 'hunt'); }
        else if (edgeStanders.length && e.attackCd <= 0) { e.target = edgeStanders[0].id; setState(e, 'rise'); }
        break;
      }
      case 'hunt': {
        const t = players.find(p => p.id === e.target);
        if (!t || t.dead || !t.inWater) { setState(e, 'patrol'); break; }
        moveWater(t.x, t.z, ctx.difficulty === 'hard' ? 5.2 : ctx.difficulty === 'easy' ? 3.6 : 4.4);
        e.y += (Math.max(floorY + 0.5, t.y + 0.3) - e.y) * dt * 2;
        if (Math.hypot(t.x - e.x, t.z - e.z) < 1.6 && Math.abs(t.y - e.y) < 2) setState(e, 'grab');
        if (e.stateT > 15) setState(e, 'patrol');
        break;
      }
      case 'grab': {
        const t = players.find(p => p.id === e.target);
        if (!t || t.dead || !t.inWater) { setState(e, 'retreat'); break; }
        e.grabT = (e.grabT || 0) + dt;
        if (e.grabT > 0.5) { e.grabT = 0; ctx.hurt(t.id, 11, { from: e, scare: 6, type: 'tide', push: { x: (e.x - t.x) * 1.5, y: -2.5, z: (e.z - t.z) * 1.5 } }); }
        if (e.stateT > 2.2) setState(e, 'retreat');
        break;
      }
      case 'rise': {
        const t = players.find(p => p.id === e.target);
        e.speedNow = 0;
        if (t) faceToward(e, t.x, t.z, 6, dt);
        e.y += (surfaceY - 0.2 - e.y) * dt * 4;
        if (e.stateT > 0.9) setState(e, 'lunge');
        break;
      }
      case 'lunge': {
        const t = players.find(p => p.id === e.target);
        if (e.stateT > 0.15 && !e.struck) {
          e.struck = true;
          if (t && Math.hypot(t.x - e.x, t.z - e.z) < 3.0 && !t.hidden) ctx.hurt(t.id, 24, { from: e, scare: 18, type: 'tide', push: { x: (e.x - t.x) * 2, y: 1, z: (e.z - t.z) * 2 } });
          e.attackCd = 6;
        }
        if (e.stateT > 1.0) { e.struck = false; setState(e, 'retreat'); }
        break;
      }
      case 'retreat':
        e.y += (Math.max(floorY + 0.6, deep - 0.6) - e.y) * dt * 2;
        e.speedNow = 0;
        if (e.stateT > 2.5) setState(e, 'patrol');
        break;
    }
    e.sub = e.y < surfaceY - 0.6 ? 1 : 0;
  },

  onDamage(e, dmg, dtype) {
    // hard to hurt deep underwater, very vulnerable when surfaced
    const mult = e.state === 'rise' || e.state === 'lunge' ? 1.6 : e.sub ? 0.45 : 1;
    if (e.state === 'patrol') setState(e, 'retreat');
    return dmg * mult;
  },

  netExtra(e) { return { sub: e.sub }; },

  // ------------------------------------------------------------- client view
  build(lib) {
    const skin = new THREE.MeshStandardMaterial({ color: 0x1d2a2c, roughness: 0.25, metalness: 0.1 });
    const belly = new THREE.MeshStandardMaterial({ color: 0x8fa09a, roughness: 0.3 });
    const face = new THREE.MeshStandardMaterial({ color: 0xd8d2c4, roughness: 0.5 });
    const g = new THREE.Group();
    const R = { segs: [], trail: [] };
    for (let i = 0; i < SEG; i++) {
      const r = 0.34 * (1 - i / SEG * 0.8);
      const seg = new THREE.Group();
      const m = ball(skin, r, 1, 0.8, 1.3);
      seg.add(m);
      const b = ball(belly, r * 0.8, 1, 0.5, 1.2); b.position.y = -r * 0.35; seg.add(b);
      if (i % 2 === 0 && i < SEG - 2) { const fin = boxm(skin, 0.02, r * 0.9, r * 1.2); fin.position.y = r * 0.7; seg.add(fin); }
      g.add(seg);
      R.segs.push(seg);
    }
    // head: a pale, almost human mask with a jaw full of needles
    const head = R.segs[0];
    const mask = ball(face, 0.24, 1, 1.1, 0.7); mask.position.set(0, 0.05, 0.3); head.add(mask);
    for (const s of [-1, 1]) { const eye = ball(new THREE.MeshBasicMaterial({ color: 0x000000 }), 0.05, 1, 1.3, 0.5); eye.position.set(s * 0.09, 0.1, 0.45); head.add(eye); }
    R.jaw = new THREE.Group(); R.jaw.position.set(0, -0.1, 0.3); head.add(R.jaw);
    const jaw = ball(face, 0.18, 1, 0.5, 1); jaw.position.z = 0.1; R.jaw.add(jaw);
    for (let k = 0; k < 8; k++) { const t = new THREE.Mesh(new THREE.ConeGeometry(0.012, 0.08, 4), face); t.position.set(-0.12 + k * 0.035, 0.06, 0.2); R.jaw.add(t); }
    for (const s of [-1, 1]) {
      const arm = new THREE.Group(); arm.position.set(s * 0.3, -0.1, 0.0);
      const fore = boxm(skin, 0.05, 0.05, 0.5); fore.position.z = 0.25; arm.add(fore);
      const hand = boxm(face, 0.12, 0.02, 0.12); hand.position.z = 0.52; arm.add(hand);
      head.add(arm);
    }
    return { group: g, rig: R };
  },

  animate(v, dt, game) {
    const R = v.rig, st = v.st, t = v.time;
    // body segments follow the head's path (in world space via trail)
    v.group.position.set(0, 0, 0);
    v.group.rotation.set(0, 0, 0);
    const hx = st.x, hy = st.y, hz = st.z;
    R.trail.unshift([hx, hy, hz]);
    if (R.trail.length > SEG * 6) R.trail.length = SEG * 6;
    let px = hx, py = hy, pz = hz;
    for (let i = 0; i < SEG; i++) {
      let p;
      if (i === 0) p = [hx, hy, hz];
      else {
        // walk back along trail to spacing 0.42
        let acc = 0; p = R.trail[R.trail.length - 1];
        for (let k = 1; k < R.trail.length; k++) {
          const a = R.trail[k - 1], b = R.trail[k];
          acc += Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
          if (acc >= i * 0.42) { p = b; break; }
        }
        if (!p) p = [px, py, pz - 0.42];
      }
      const seg = R.segs[i];
      const wig = Math.sin(t * 5 - i * 0.6) * 0.12 * (i / SEG);
      seg.position.set(p[0] + Math.cos(st.r) * wig, p[1] + Math.sin(t * 3 - i * 0.5) * 0.05, p[2] - Math.sin(st.r) * wig);
      if (i === 0) seg.rotation.set(0, st.r, 0);
      else seg.lookAt(px, py, pz);
      if (i > 0) seg.rotateY(Math.PI);
      px = seg.position.x; py = seg.position.y; pz = seg.position.z;
    }
    R.headY = st.y - st.y; // hit spheres relative to entity y
    const attacking = st.s === 'lunge' || st.s === 'grab' || st.s === 'rise';
    R.jaw.rotation.x = attacking ? 0.6 + Math.sin(t * 22) * 0.2 : 0.1;
    if (st.s === 'lunge') R.segs[0].position.y += Math.sin(Math.min(1, v.stateT * 2) * Math.PI) * 1.2;
    // ripples/splashes when near the surface
    const level = game.level;
    if (level) {
      const w = level.waterAt(hx, hz);
      if (hy > w - 0.9 && Math.random() < dt * 6) game.effects.burst('splash', { x: hx, y: w, z: hz }, undefined, 0.2);
    }
  },

  onState(v, s, prev, game) {
    if (s === 'hunt') game.sfx('tideGurgle', v.pos, { volume: 1.1, ref: 6 });
    if (s === 'rise') { game.sfx('tideGroan', v.pos, { volume: 1, ref: 6 }); game.sfx('splash', v.pos, { volume: 1 }); }
    if (s === 'lunge') game.sfx('splash', v.pos, { volume: 1.2 });
    if (s === 'grab') game.stats.scare(10);
  },

  ambient(v, dt, game) {
    v.gT = (v.gT ?? 3) - dt;
    if (v.gT <= 0) { v.gT = v.st.s === 'hunt' ? 1.2 : 6 + Math.random() * 6; game.sfx('tideGurgle', v.pos, { volume: v.st.s === 'hunt' ? 1 : 0.4, ref: 4 }); }
  },
};
