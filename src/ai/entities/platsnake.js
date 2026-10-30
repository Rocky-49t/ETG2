// PLATINUM SNAKE — Level 4. A long segmented body of polished metal that
// drifts along the gray carpet minding its own business. It strikes only at
// things that come close. Every gunshot that hits it makes it faster, up to a
// limit; blades hurt it without winding it up.
import * as THREE from 'three';
import { goTo, wander, setState, faceToward, nearestPlayer } from '../brain.js';
import { attackPose } from './rig.js';

const SEGS = 13, GAP = 0.36, MAX_FURY = 2.2;

export default {
  type: 'platsnake',
  name: 'Platinum Snake',
  hp: 170,
  radius: 0.45,
  height: 0.7,
  blood: 'ichor',
  resist: { bullet: 0.9, melee: 1.3 },
  headMult: 1.6,
  hit: v => {
    // head plus the first few body segments (follow the trail)
    const out = [{ part: 'head', y: 0.32, r: 0.28, z: 0.25 }];
    for (let i = 1; i < 6; i++) out.push({ part: 'body', y: 0.25, r: 0.3, z: -i * GAP * 1.1 });
    return out;
  },
  despawnDist: 70,
  announceKill: true,
  netExtra: e => +e.fury.toFixed(2),

  init(e) { e.state = 'patrol'; e.fury = 1; e.lostT = 0; },

  think(e, dt, ctx) {
    const { level, players } = ctx;
    const near = nearestPlayer(e, players, p => !p.hidden && !p.downed);
    const diffK = ctx.difficulty === 'easy' ? 0.85 : ctx.difficulty === 'hard' ? 1.12 : 1;
    switch (e.state) {
      case 'patrol':
        e.fury = Math.max(1, e.fury - dt * 0.01);
        wander(e, level, 1.0, dt, 9);
        // it only cares about what comes close
        if (near && near.d < (ctx.difficulty === 'hard' ? 7.5 : 6.2) && Math.abs(near.p.y - e.y) < 2) { e.target = near.p.id; setState(e, 'strike'); }
        break;
      case 'strike': {
        const p = players.find(q => q.id === e.target && !q.dead && !q.hidden) || near?.p;
        if (!p) { setState(e, 'patrol'); break; }
        e.target = p.id;
        const d = Math.hypot(p.x - e.x, p.z - e.z);
        goTo(e, level, p.x, p.z, 3.3 * e.fury * diffK, dt, { repath: 0.35, turn: 6 + e.fury * 2 });
        if (d < 1.55 && e.attackCd <= 0) setState(e, 'coil');
        // loses interest once you're well away
        e.lostT = d > 15 ? e.lostT + dt : 0;
        if (e.lostT > 3) { e.lostT = 0; setState(e, 'patrol'); }
        break;
      }
      case 'coil': {
        const p = players.find(q => q.id === e.target);
        e.speedNow = 0;
        if (p) faceToward(e, p.x, p.z, 10, dt);
        if (e.stateT > 0.4 && !e.struck) {
          e.struck = true;
          if (p && !p.hidden && Math.hypot(p.x - e.x, p.z - e.z) < 2.1) ctx.hurt(p.id, ctx.difficulty === 'hard' ? 28 : 22, { from: e, scare: 14, slow: 1.2, type: 'snake' });
          e.attackCd = 1.2 / Math.sqrt(e.fury);
        }
        if (e.stateT > 0.95) { e.struck = false; setState(e, 'strike'); }
        break;
      }
    }
  },

  onDamage(e, dmg, dtype, from) {
    // gunfire winds it up; blades don't
    if (dtype !== 'melee') e.fury = Math.min(MAX_FURY, e.fury + 0.3);
    if (from) e.target = from;
    if (e.state === 'patrol') setState(e, 'strike');
    return dmg;
  },

  onDeath(e, game) {
    for (let k = 0; k < 2; k++) game.hostDropItem?.(e.levelId, 'scrap', 1 + k, e.x + (Math.random() - 0.5), e.z + (Math.random() - 0.5));
  },

  // ------------------------------------------------------------- client view
  build() {
    const metal = new THREE.MeshStandardMaterial({ color: 0xb9c0c8, roughness: 0.2, metalness: 0.7, emissive: 0x23272c, emissiveIntensity: 0.4 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x6f757c, roughness: 0.35, metalness: 0.7 });
    const eyeM = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x58b8ff).multiplyScalar(2.6) });
    const g = new THREE.Group();
    const R = { segs: [] };
    // the head: a flattened wedge with a jaw
    const head = new THREE.Group();
    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.3, 14, 10), metal); skull.scale.set(1.0, 0.5, 1.35); head.add(skull);
    const snout = new THREE.Mesh(new THREE.SphereGeometry(0.18, 10, 8), metal); snout.scale.set(1.1, 0.5, 1.2); snout.position.set(0, -0.02, 0.32); head.add(snout);
    R.jaw = new THREE.Group(); R.jaw.position.set(0, -0.06, 0.05); head.add(R.jaw);
    const jaw = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), dark); jaw.scale.set(1, 0.3, 1.5); jaw.position.z = 0.18; R.jaw.add(jaw);
    R.eyes = [];
    for (const s of [-1, 1]) { const eye = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), eyeM); eye.position.set(s * 0.17, 0.08, 0.28); head.add(eye); R.eyes.push(eye); }
    // ridge plates
    for (let i = 0; i < 3; i++) { const r = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.16), dark); r.position.set(0, 0.15, -0.1 + i * 0.14); head.add(r); }
    g.add(head); R.head = head;
    for (let i = 0; i < SEGS; i++) {
      const t = 1 - i / SEGS;
      const seg = new THREE.Group();
      const body = new THREE.Mesh(new THREE.SphereGeometry(0.27, 12, 8), metal); body.scale.set(0.95 * (0.45 + t * 0.55), 0.62 * (0.5 + t * 0.5), 1.25); seg.add(body);
      const band = new THREE.Mesh(new THREE.TorusGeometry(0.2 * (0.45 + t * 0.55), 0.025, 5, 14), dark); band.scale.y = 0.62; seg.add(band);
      g.add(seg);
      R.segs.push(seg);
    }
    R.trail = [];
    R.eyeM = eyeM;
    return { group: g, rig: R };
  },

  animate(v, dt) {
    const R = v.rig, st = v.st, t = v.time;
    // the group itself is moved to the entity position each frame; segments are
    // laid out in world space along the path the head has travelled
    const g = v.group;
    const tr = R.trail;
    const hx = st.x, hz = st.z;
    if (!tr.length || Math.hypot(tr[0].x - hx, tr[0].z - hz) > 0.06) tr.unshift({ x: hx, z: hz });
    if (tr.length > 200) tr.length = 200;
    const sp = st.v || 0, fury = st.a || 1;
    const coil = st.s === 'coil' ? attackPose(v.stateT, 0.4) : { w: 0, s: 0 };
    const cos = Math.cos(st.r), sin = Math.sin(st.r);
    const toLocal = (x, z) => { const dx = x - hx, dz = z - hz; return [dx * cos - dz * sin, dx * sin + dz * cos]; };
    // head: rears up when coiling
    R.head.position.set(Math.sin(t * 6) * 0.04 * Math.min(1, sp), 0.3 + coil.w * 0.45 - coil.s * 0.25, coil.s * 0.5);
    R.head.rotation.x = -coil.w * 0.5 + coil.s * 0.5;
    R.jaw.rotation.x = coil.w * 0.7 + Math.max(0, Math.sin(t * 2)) * 0.05;
    // body follows the trail; slithers side to side while moving
    let acc = 0, k = 0;
    for (let i = 0; i < R.segs.length; i++) {
      const want = (i + 1) * GAP;
      while (k < tr.length - 1) {
        const d = Math.hypot(tr[k + 1].x - tr[k].x, tr[k + 1].z - tr[k].z);
        if (acc + d >= want) break;
        acc += d; k++;
      }
      let px, pz;
      if (k < tr.length - 1) {
        const d = Math.hypot(tr[k + 1].x - tr[k].x, tr[k + 1].z - tr[k].z) || 1;
        const f = (want - acc) / d;
        px = tr[k].x + (tr[k + 1].x - tr[k].x) * f; pz = tr[k].z + (tr[k + 1].z - tr[k].z) * f;
      } else {
        // not enough trail yet: lay out straight behind
        px = hx - Math.sin(st.r) * want; pz = hz - Math.cos(st.r) * want;
      }
      let [lx, lz] = toLocal(px, pz);
      // a coil gathers the body into a tight loop
      if (coil.w > 0 || coil.s > 0) { const a = i * 0.7 + t * 2, rr = 0.55 + i * 0.03, m = Math.max(coil.w, coil.s) * 0.8; lx = lx * (1 - m) + Math.cos(a) * rr * m; lz = lz * (1 - m) + (Math.sin(a) * rr - 0.6) * m; }
      lx += Math.sin(t * 7 * Math.min(1.5, 0.4 + sp * 0.4) - i * 0.8) * 0.09 * Math.min(1, sp);
      const seg = R.segs[i];
      seg.position.set(lx, 0.2 + Math.sin(i * 0.9 + t * 3) * 0.015, lz);
      const prev = i === 0 ? R.head.position : R.segs[i - 1].position;
      seg.rotation.y = Math.atan2(prev.x - lx, prev.z - lz);
    }
    // fury shows in the eyes
    R.eyeM.color.setRGB(0.35 * 2.6 * fury, 0.72 * 2.6 / fury, 2.6);
    if (st.s === 'dead') { g.rotation.z = Math.min(1.6, v.stateT * 2); }
  },

  onState(v, s, prev, game) {
    if (s === 'strike' && prev === 'patrol') { game.sfx('snakeHiss', v.pos, { volume: 1, ref: 5 }); game.stats.scare(8); if (!game.flags.snakeHint) { game.flags.snakeHint = true; game.subtitle('A platinum body scrapes across the carpet toward you. Back away — and think before you shoot it.', 4); } }
    if (s === 'coil') game.sfx('snakeStrike', v.pos, { volume: 1, ref: 4 });
    if (s === 'dead') game.sfx('metalGroan', v.pos, { volume: 0.8, ref: 4 });
  },

  ambient(v, dt, game) {
    const sp = v.st.v || 0;
    if (sp > 0.3) {
      v.scrT = (v.scrT ?? 0) - dt * (0.8 + sp * 0.5);
      if (v.scrT <= 0) { v.scrT = 1; game.sfx('snakeScrape', v.pos, { volume: Math.min(1, 0.35 + sp * 0.12), ref: 3 }); }
    }
  },
};
