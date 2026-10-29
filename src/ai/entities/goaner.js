// THE GOANER — ruler of the Sky Bridge. A goat-headed, wasp-bodied chimera
// on six bone legs, the size of a bus. Faithful to the original: amber chitin
// body, bone chest, yellow goat head with ears, black eyes, translucent wings,
// a black stinger — now with curled horns and a glowing sac under its back
// plates that only opens in strong light.
//
// Phase I  (Presence): circles in the dark, swoops, stalks. Only takes real
//                      damage while lit (floodlights, flares, focused beams).
// Phase II (Rage):     charges across the arena and smashes floodlight towers.
// Phase III(Collapse): the arena crumbles; stinger slams leave it stuck and
//                      vulnerable; debris falls.
import * as THREE from 'three';
import { setState, faceToward } from '../brain.js';
import { joint, limb, ball, boxm } from './rig.js';

const PHASE_NAMES = ['', 'I — PRESENCE', 'II — RAGE', 'III — COLLAPSE'];

export default {
  type: 'goaner',
  name: 'The Goaner',
  hp: 2400,
  radius: 2.2,
  height: 3,
  persistent: true,
  despawnDist: 999,
  blood: 'ichor',
  resist: { bullet: 1, melee: 1, fire: 1.3 },
  headMult: 1.3,
  hit: v => {
    const y = v.rig.bodyY ?? 2;
    return [
      { part: 'body', y, r: 1.6 }, { part: 'body', y: y + 0.1, r: 1.2, z: -1.8 },
      { part: 'head', y: y + 0.6, r: 0.9, z: 2.3 }, { part: 'sac', y: y + 1.1, r: 0.75, z: -0.6 },
    ];
  },

  init(e, game) {
    e.flying = true;
    e.state = 'dormant';
    e.phase = 0;
    e.alt = 0;
    e.y = 0;
    e.arena = game.getLevel(e.levelId).def.arena;
    e.home = { x: e.arena.x + e.arena.r * 0.62, z: e.arena.z };
    e.x = e.home.x; e.z = e.home.z;
    e.yaw = -Math.PI / 2;
    e.cycle = 0;
    e.exposed = 0;
    e.marker = null;
    e.line = null;
    e.collapseT = 8;
    e.debrisT = 4;
  },

  think(e, dt, ctx) {
    const { players, game } = ctx;
    const A = e.arena;
    const def = ctx.level.def;
    const inArena = p => !p.dead && Math.hypot(p.x - A.x, p.z - A.z) < A.r + 0.5 && p.y > -5;
    const fighters = players.filter(inArena);
    // reset if everyone left/died
    if (e.state !== 'dormant' && e.state !== 'dying' && e.state !== 'dead') {
      if (!fighters.length) { e.emptyT = (e.emptyT || 0) + dt; if (e.emptyT > 6) { def.resetBoss(game, e); return; } }
      else e.emptyT = 0;
    }
    const diffK = ctx.difficulty === 'easy' ? 0.85 : ctx.difficulty === 'hard' ? 1.15 : 1;
    e.exposed = this.exposure(e, ctx);
    const pick = () => fighters[Math.floor(Math.random() * fighters.length)];
    const flyTo = (tx, tz, alt, speed) => {
      const dx = tx - e.x, dz = tz - e.z, d = Math.hypot(dx, dz);
      if (d > 0.05) { const s = Math.min(d, speed * dt); e.x += dx / d * s; e.z += dz / d * s; e.speedNow = s / dt; }
      else e.speedNow = 0;
      e.alt += (alt - e.alt) * Math.min(1, dt * 2.5);
      e.y = e.alt;
      faceToward(e, tx, tz, 3, dt);
      return d;
    };
    const clampArena = () => {
      const dx = e.x - A.x, dz = e.z - A.z, d = Math.hypot(dx, dz);
      const max = A.r + 6;
      if (d > max) { e.x = A.x + dx / d * max; e.z = A.z + dz / d * max; }
    };
    const hitAlong = (x0, z0, x1, z1, r, dmg, push) => {
      for (const p of fighters) {
        const vx = x1 - x0, vz = z1 - z0, L2 = vx * vx + vz * vz || 1;
        const t = Math.max(0, Math.min(1, ((p.x - x0) * vx + (p.z - z0) * vz) / L2));
        const qx = x0 + vx * t, qz = z0 + vz * t;
        if (Math.hypot(p.x - qx, p.z - qz) < r && !(e.hitSet?.has(p.id))) {
          e.hitSet = e.hitSet || new Set(); e.hitSet.add(p.id);
          const nx = (p.x - e.x), nz = (p.z - e.z), nl = Math.hypot(nx, nz) || 1;
          ctx.hurt(p.id, dmg, { from: e, scare: 10, type: 'goaner', push: { x: nx / nl * push, y: 2.5, z: nz / nl * push } });
        }
      }
    };

    // phase changes
    const f = e.hp / e.maxHp;
    if (e.phase >= 1 && e.phase < 2 && f < 0.66) { e.phase = 2; setState(e, 'roar'); game.hostEvent(e.levelId, { k: 'subtitle', text: 'THE GOANER IS ENRAGED.', dur: 3, cls: 'scare' }); game.hostEvent(e.levelId, { k: 'shake', a: 0.7 }); }
    if (e.phase >= 2 && e.phase < 3 && f < 0.33) { e.phase = 3; setState(e, 'roar'); game.hostEvent(e.levelId, { k: 'subtitle', text: 'The bridge screams. The arena begins to fall apart!', dur: 3.5, cls: 'scare' }); game.hostEvent(e.levelId, { k: 'shake', a: 1 }); }
    // phase 3 hazards
    if (e.phase === 3 && e.state !== 'dying' && e.state !== 'dead') {
      e.collapseT -= dt;
      if (e.collapseT <= 0) { e.collapseT = 13; def.collapseNext(game); }
      e.debrisT -= dt;
      if (e.debrisT <= 0 && fighters.length) {
        e.debrisT = 2.2 + Math.random() * 2;
        const p = pick();
        const x = p.x + (Math.random() - 0.5) * 6, z = p.z + (Math.random() - 0.5) * 6;
        game.hostEvent(e.levelId, { k: 'debris', x, z, t: 1.6 });
        setTimeout(() => {
          for (const q of ctx.players) if (!q.dead && Math.hypot(q.x - x, q.z - z) < 2.2) game.hostHurt(q.id, 22, { from: { x, z }, type: 'goaner', scare: 6 });
        }, 1600);
      }
    }

    e.line = null;
    switch (e.state) {
      case 'dormant':
        e.y = 0; e.alt = 0; e.speedNow = 0;
        if (fighters.some(p => Math.hypot(p.x - A.x, p.z - A.z) < A.r - 1.5)) {
          setState(e, 'intro'); e.phase = 1;
          game.hostEvent(e.levelId, { k: 'subtitle', text: 'The Goaner unfolds from the far edge of the platform.', dur: 3.5, cls: 'scare' });
          game.world.setFlag && game.hostBroadcast({ t: 'flag', l: e.levelId, k: 'bossAwake', v: true });
        }
        break;
      case 'intro':
        e.alt += (3 - e.alt) * dt; e.y = e.alt;
        if (fighters.length) { const p = fighters[0]; faceToward(e, p.x, p.z, 2, dt); }
        if (e.stateT > 3.2) setState(e, 'circle');
        break;
      case 'roar':
        e.speedNow = 0;
        if (e.stateT > 2.4) setState(e, 'circle');
        break;
      case 'circle': {
        e.cyc = (e.cyc || Math.random() * 6) + dt * (0.35 + e.phase * 0.08) * diffK;
        const r = A.r * 0.75;
        flyTo(A.x + Math.cos(e.cyc) * r, A.z + Math.sin(e.cyc) * r, 5 + Math.sin(e.cyc * 3) * 1.2, 9 * diffK);
        if (e.stateT > 3.5 + Math.random() * 3 / e.phase && fighters.length) {
          const roll = Math.random();
          e.target = pick().id;
          if (e.phase >= 3 && roll < 0.45) setState(e, 'slamRise');
          else if (e.phase >= 2 && roll < 0.35) setState(e, 'chargeLand');
          else if (e.phase >= 2 && roll < 0.55 && def.litTowers(game).length) { e.towerTarget = def.litTowers(game)[0]; setState(e, 'smashGo'); }
          else if (roll < 0.75) setState(e, 'swoopWind');
          else setState(e, 'stalkLand');
        }
        break;
      }
      case 'swoopWind': {
        const p = fighters.find(q => q.id === e.target) || fighters[0];
        if (!p) { setState(e, 'circle'); break; }
        e.speedNow = 0;
        faceToward(e, p.x, p.z, 4, dt);
        e.alt += (6 - e.alt) * dt; e.y = e.alt;
        e.swoop = { x0: e.x, z0: e.z, tx: p.x, tz: p.z };
        e.marker = { x: p.x, z: p.z, r: 2.4 };
        if (e.stateT > 1.25 / diffK) {
          const dx = p.x - e.x, dz = p.z - e.z, d = Math.hypot(dx, dz) || 1;
          e.swoop = { x0: e.x, z0: e.z, x1: p.x + dx / d * 10, z1: p.z + dz / d * 10, tx: p.x, tz: p.z };
          e.hitSet = new Set();
          setState(e, 'swoop');
        }
        break;
      }
      case 'swoop': {
        const S = e.swoop;
        const px = e.x, pz = e.z;
        const d = flyTo(S.x1, S.z1, Math.hypot(e.x - S.tx, e.z - S.tz) < 6 ? 1.2 : 4, 17 * diffK);
        hitAlong(px, pz, e.x, e.z, 2.3, 24, 7);
        e.marker = null;
        if (d < 1 || e.stateT > 3) setState(e, 'circle');
        break;
      }
      case 'stalkLand': {
        const p = fighters.find(q => q.id === e.target) || fighters[0];
        if (!p) { setState(e, 'circle'); break; }
        const tx = p.x + (e.x - p.x) * 0.3, tz = p.z + (e.z - p.z) * 0.3;
        if (flyTo(tx, tz, 0, 10) < 1.5 && e.alt < 0.3) setState(e, 'stalk');
        if (e.stateT > 4) setState(e, 'stalk');
        break;
      }
      case 'stalk': {
        const p = fighters.find(q => q.id === e.target) || fighters[0];
        if (!p) { setState(e, 'circle'); break; }
        const d = Math.hypot(p.x - e.x, p.z - e.z);
        if (d > 3.6) flyTo(p.x, p.z, 0, (e.phase >= 2 ? 4.2 : 3.1) * diffK);
        else { setState(e, 'rake'); e.hitSet = new Set(); }
        if (e.stateT > 5) setState(e, 'circle');
        break;
      }
      case 'rake': {
        e.speedNow = 0;
        const p = fighters.find(q => q.id === e.target);
        if (p && e.stateT < 0.5) faceToward(e, p.x, p.z, 4, dt);
        e.marker = { x: e.x + Math.sin(e.yaw) * 3, z: e.z + Math.cos(e.yaw) * 3, r: 3 };
        if (e.stateT > 0.7 && !e.struck) {
          e.struck = true;
          const fx = e.x + Math.sin(e.yaw) * 3, fz = e.z + Math.cos(e.yaw) * 3;
          for (const q of fighters) if (Math.hypot(q.x - fx, q.z - fz) < 3.2) ctx.hurt(q.id, 20, { from: e, scare: 8, bleed: 0.5, type: 'goaner', push: { x: Math.sin(e.yaw) * 5, y: 1.5, z: Math.cos(e.yaw) * 5 } });
        }
        if (e.stateT > 1.4) { e.struck = false; e.marker = null; setState(e, Math.random() < 0.5 ? 'stalk' : 'circle'); }
        break;
      }
      case 'chargeLand': {
        const p = fighters.find(q => q.id === e.target) || fighters[0];
        if (!p) { setState(e, 'circle'); break; }
        // land at the arena edge opposite the target
        const ax = A.x + (A.x - p.x) * 0.7, az = A.z + (A.z - p.z) * 0.7;
        if (flyTo(ax, az, 0, 12) < 1.5 && e.alt < 0.3) setState(e, 'chargeWind');
        if (e.stateT > 4) setState(e, 'chargeWind');
        break;
      }
      case 'chargeWind': {
        const p = fighters.find(q => q.id === e.target) || fighters[0];
        if (!p) { setState(e, 'circle'); break; }
        e.speedNow = 0;
        faceToward(e, p.x, p.z, 5, dt);
        const dx = Math.sin(e.yaw), dz = Math.cos(e.yaw);
        e.charge = { x1: e.x + dx * 34, z1: e.z + dz * 34 };
        e.line = { x0: e.x, z0: e.z, x1: e.charge.x1, z1: e.charge.z1 };
        if (e.stateT > 1.4 / diffK) { e.hitSet = new Set(); setState(e, 'charge'); }
        break;
      }
      case 'charge': {
        const px = e.x, pz = e.z;
        const d = flyTo(e.charge.x1, e.charge.z1, 0, 14 * diffK);
        hitAlong(px, pz, e.x, e.z, 2.4, 30, 11);
        def.towerHit(game, e.x, e.z, 3.0);
        const outside = Math.hypot(e.x - A.x, e.z - A.z) > A.r - 1.5;
        if (d < 1 || e.stateT > 3.2 || (outside && e.stateT > 0.8)) setState(e, 'circle');
        break;
      }
      case 'smashGo': {
        const T = e.towerTarget;
        if (!T || !def.towerLit(game, T)) { setState(e, 'circle'); break; }
        if (flyTo(T.x + (A.x - T.x) * 0.15, T.z + (A.z - T.z) * 0.15, 0, 9) < 2 && e.alt < 0.4) setState(e, 'smash');
        if (e.stateT > 5) setState(e, 'circle');
        break;
      }
      case 'smash':
        e.speedNow = 0;
        if (e.towerTarget) faceToward(e, e.towerTarget.x, e.towerTarget.z, 5, dt);
        e.marker = { x: e.x + Math.sin(e.yaw) * 2.5, z: e.z + Math.cos(e.yaw) * 2.5, r: 2.5 };
        if (e.stateT > 1.2 && !e.struck) { e.struck = true; def.towerHit(game, e.towerTarget.x, e.towerTarget.z, 4); game.hostEvent(e.levelId, { k: 'shake', a: 0.5 }); }
        if (e.stateT > 2) { e.struck = false; e.marker = null; setState(e, 'circle'); }
        break;
      case 'slamRise': {
        const p = fighters.find(q => q.id === e.target) || fighters[0];
        if (!p) { setState(e, 'circle'); break; }
        flyTo(p.x, p.z, 7, 10);
        e.marker = { x: e.x, z: e.z, r: 4.6 };
        if (e.stateT > 1.8 / diffK) { setState(e, 'slam'); e.slamAt = { x: e.x, z: e.z }; }
        break;
      }
      case 'slam': {
        e.alt = Math.max(0, e.alt - dt * 22); e.y = e.alt; e.speedNow = 0;
        if (e.alt <= 0 && !e.struck) {
          e.struck = true;
          e.marker = null;
          for (const q of fighters) {
            const d = Math.hypot(q.x - e.x, q.z - e.z);
            if (d < 4.6) ctx.hurt(q.id, 36, { from: e, scare: 15, type: 'goaner', push: { x: (q.x - e.x) / (d || 1) * 8, y: 3, z: (q.z - e.z) / (d || 1) * 8 } });
          }
          game.hostEvent(e.levelId, { k: 'shockwave', x: e.x, z: e.z });
          game.hostEvent(e.levelId, { k: 'shake', a: 1 });
          e.wave = { x: e.x, z: e.z, r: 4.6, hit: new Set() };
        }
        if (e.stateT > 0.6) { e.struck = false; setState(e, 'stuck'); }
        break;
      }
      case 'stuck':
        e.speedNow = 0;
        if (e.stateT > 3.6) setState(e, 'circle');
        break;
      case 'dying':
        e.alt = Math.max(-30, e.alt - dt * (e.stateT > 2 ? 9 : 0.5)); e.y = e.alt;
        e.x += Math.sin(e.yaw) * dt * 2;
        if (e.stateT > 5) { setState(e, 'dead'); def.bossDefeated(game); }
        break;
    }
    // expanding shockwave ring (jump over it)
    if (e.wave) {
      e.wave.r += dt * 9;
      for (const q of fighters) {
        const d = Math.hypot(q.x - e.wave.x, q.z - e.wave.z);
        const airborne = q.y > (ctx.level.floorAt(q.x, q.z) + 0.35);
        if (Math.abs(d - e.wave.r) < 0.7 && !airborne && !e.wave.hit.has(q.id)) { e.wave.hit.add(q.id); ctx.hurt(q.id, 14, { from: e, type: 'goaner', push: { x: 0, y: 3, z: 0 } }); }
      }
      if (e.wave.r > 12) e.wave = null;
    }
    clampArena();
  },

  // how exposed is it: 0 (dark) .. 1 (floodlit)
  exposure(e, ctx) {
    const game = ctx.game;
    const def = ctx.level.def;
    let x = def.floodExposure(game, e.x, e.y + 2, e.z);
    for (const z of game.lightZones(e.levelId)) if (z.type === 'flare' && Math.hypot(z.x - e.x, z.z - e.z) < 7) x = Math.max(x, 0.8);
    for (const p of ctx.players) {
      if (!p.light || !p.focus || !p.dir || p.dead) continue;
      const dx = e.x - p.x, dy = e.y + 2 - (p.y + 1.5), dz = e.z - p.z;
      const d = Math.hypot(dx, dy, dz);
      if (d < 22 && (dx * p.dir.x + dy * p.dir.y + dz * p.dir.z) / d > 0.97) x = Math.max(x, 0.5);
    }
    return x;
  },

  onDamage(e, dmg, dtype, from, game) {
    if (e.state === 'dormant' || e.state === 'intro' || e.state === 'dying' || e.state === 'dead') return 0;
    const stuck = e.state === 'stuck';
    let mult = stuck ? 1.8 : 0.12 + e.exposed * 0.88;
    return dmg * mult;
  },

  onDeath(e, game) {
    if (e.state === 'dying' || e.state === 'dead') return false;
    e.hp = 0;
    setState(e, 'dying');
    game.hostEvent(e.levelId, { k: 'subtitle', text: 'The Goaner bleats — a horrible, small sound — and falls.', dur: 4 });
    return false;
  },

  netExtra(e) {
    return {
      ph: e.phase, ex: +e.exposed.toFixed(2), mk: e.marker ? [+e.marker.x.toFixed(1), +e.marker.z.toFixed(1), e.marker.r] : null,
      ln: e.line ? [+e.line.x0.toFixed(1), +e.line.z0.toFixed(1), +e.line.x1.toFixed(1), +e.line.z1.toFixed(1)] : null,
      wv: e.wave ? [+e.wave.x.toFixed(1), +e.wave.z.toFixed(1), +e.wave.r.toFixed(2)] : null,
    };
  },

  // ------------------------------------------------------------- client view
  build(lib) {
    const chitin = lib.dyn('chitin');
    const bone = lib.dyn('bone');
    const yellow = new THREE.MeshStandardMaterial({ color: 0xd8b13a, roughness: 0.65 });
    const black = new THREE.MeshStandardMaterial({ color: 0x080808, roughness: 0.3, metalness: 0.2 });
    const wingMat = new THREE.MeshStandardMaterial({ color: 0xd8e4ec, roughness: 0.2, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false });
    const sacMat = new THREE.MeshStandardMaterial({ color: 0x501808, emissive: 0xff6a20, emissiveIntensity: 0, roughness: 0.4 });
    const g = new THREE.Group();
    const R = {};
    const S = 1.25; // overall scale
    const root = joint(g, 0, 0, 0); root.scale.setScalar(S); R.root = root;
    const body = joint(root, 0, 1.6, 0); R.body = body;
    // thorax
    const thorax = ball(chitin, 1.0, 1.25, 0.95, 1.35, 16); thorax.position.set(0, 0.2, 0.5); body.add(thorax);
    const chest = ball(bone, 0.85, 1.05, 0.7, 0.85, 14); chest.position.set(0, -0.15, 1.1); body.add(chest);
    for (let i = 0; i < 5; i++) {
      const rib = new THREE.Mesh(new THREE.TorusGeometry(0.62 - i * 0.03, 0.05, 5, 14, Math.PI), bone);
      rib.rotation.set(Math.PI / 2, 0, Math.PI); rib.position.set(0, -0.25, 0.55 + i * 0.25); body.add(rib);
    }
    // abdomen: segmented, striped
    R.abdomen = joint(body, 0, 0.25, -0.6);
    for (let i = 0; i < 6; i++) {
      const r = 1.05 - i * 0.12;
      const seg = ball(i % 2 ? black : chitin, r, 1.05, 0.9, 0.55, 14);
      seg.position.set(0, -i * 0.08, -0.35 - i * 0.55);
      R.abdomen.add(seg);
    }
    const sting = new THREE.Mesh(new THREE.ConeGeometry(0.22, 1.5, 10), black);
    sting.rotation.x = -Math.PI / 2; sting.position.set(0, -0.55, -3.9); R.abdomen.add(sting);
    R.sting = sting;
    // back plates + glowing sac
    R.sac = ball(sacMat, 0.55, 1.1, 0.6, 1.2, 12); R.sac.position.set(0, 0.95, -0.4); body.add(R.sac);
    R.plates = [];
    for (const s of [-1, 1]) {
      const pivot = joint(body, s * 0.1, 1.02, -0.4);
      const plate = ball(chitin, 0.6, 1.0, 0.25, 1.35, 12); plate.position.set(s * 0.45, 0, 0); pivot.add(plate);
      R.plates.push({ pivot, s });
    }
    // wings
    R.wings = [];
    for (const s of [-1, 1]) for (const k of [0, 1]) {
      const pivot = joint(body, s * 0.6, 0.95, 0.45 - k * 0.55);
      const shape = new THREE.Shape();
      shape.moveTo(0, 0); shape.bezierCurveTo(0.8, 0.5, 2.6, 0.6, 3.3 - k * 0.6, 0.1); shape.bezierCurveTo(2.6, -0.4, 1.0, -0.5, 0, 0);
      const wg = new THREE.ShapeGeometry(shape, 12);
      const w = new THREE.Mesh(wg, wingMat);
      w.rotation.x = -Math.PI / 2;
      if (s < 0) w.scale.x = -1;
      pivot.add(w);
      const vein = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.01, 3, 4), black);
      vein.rotation.z = Math.PI / 2; vein.position.x = s * 1.5; pivot.add(vein);
      R.wings.push({ pivot, s, k });
    }
    // neck + goat head
    R.neck = joint(body, 0, 0.35, 1.7);
    const neck = ball(yellow, 0.42, 0.9, 0.9, 1.3); neck.position.set(0, 0.2, 0.2); R.neck.add(neck);
    R.head = joint(R.neck, 0, 0.45, 0.6);
    const skull = ball(yellow, 0.62, 1.0, 0.85, 1.05, 14); R.head.add(skull);
    const snout = ball(yellow, 0.4, 0.85, 0.7, 1.3, 12); snout.position.set(0, -0.2, 0.62); R.head.add(snout);
    const nose = ball(black, 0.16, 1.4, 0.7, 0.8); nose.position.set(0, -0.12, 1.08); R.head.add(nose);
    R.jaw = joint(R.head, 0, -0.38, 0.3);
    const jaw = ball(yellow, 0.3, 0.8, 0.4, 1.4); jaw.position.set(0, 0, 0.35); R.jaw.add(jaw);
    const beard = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.6, 8), new THREE.MeshStandardMaterial({ color: 0xe8dcc0, roughness: 1 }));
    beard.rotation.x = Math.PI; beard.position.set(0, -0.3, 0.45); R.jaw.add(beard);
    R.eyes = [];
    for (const s of [-1, 1]) {
      const eye = ball(new THREE.MeshStandardMaterial({ color: 0x050505, emissive: 0x000000, roughness: 0.1 }), 0.14, 1.1, 0.8, 0.6); eye.position.set(s * 0.42, 0.12, 0.55); R.head.add(eye); R.eyes.push(eye);
      // long goat ears
      const ear = ball(yellow, 0.18, 0.5, 0.25, 1.4); ear.position.set(s * 0.68, 0.1, -0.15); ear.rotation.set(0.3, s * 0.9, s * 0.5); R.head.add(ear);
      // curled horns from torus arcs
      const horn = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.11, 8, 16, Math.PI * 1.4), bone);
      horn.position.set(s * 0.38, 0.55, -0.25); horn.rotation.set(0, s * 1.2, s > 0 ? 0.5 : Math.PI - 0.5);
      R.head.add(horn);
    }
    // six bone legs
    R.legs = [];
    for (const s of [-1, 1]) for (let i = 0; i < 3; i++) {
      const hip = joint(body, s * 0.85, -0.35, 1.2 - i * 0.75);
      hip.add(limb(bone, 1.25, 0.12, 0.09, 8));
      const knee = joint(hip, 0, -1.25, 0);
      knee.add(ball(bone, 0.13));
      knee.add(limb(bone, 1.35, 0.09, 0.05, 8));
      const claw = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.35, 6), yellow); claw.rotation.x = Math.PI; claw.position.y = -1.45; knee.add(claw);
      R.legs.push({ hip, knee, s, i });
    }
    // telegraph helpers (in world space; parented to the view group's parent later)
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xff3020, transparent: true, opacity: 0.5, depthWrite: false, side: THREE.DoubleSide });
    R.marker = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 48), ringMat);
    R.marker.rotation.x = -Math.PI / 2; R.marker.visible = false;
    R.markerFill = new THREE.Mesh(new THREE.CircleGeometry(1, 48), new THREE.MeshBasicMaterial({ color: 0xff3020, transparent: true, opacity: 0.12, depthWrite: false }));
    R.markerFill.rotation.x = -Math.PI / 2; R.markerFill.visible = false;
    R.line = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: 0xff4020, transparent: true, opacity: 0.3, depthWrite: false, side: THREE.DoubleSide }));
    R.line.visible = false;
    R.wave = new THREE.Mesh(new THREE.RingGeometry(0.9, 1, 64), new THREE.MeshBasicMaterial({ color: 0xffb060, transparent: true, opacity: 0.7, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
    R.wave.rotation.x = -Math.PI / 2; R.wave.visible = false;
    R.fx = new THREE.Group(); R.fx.add(R.marker, R.markerFill, R.line, R.wave);
    R.sacMat = sacMat;
    return { group: g, rig: R };
  },

  animate(v, dt, game) {
    const R = v.rig, st = v.st, t = v.time;
    if (!R.fx.parent) game.engine.scene.add(R.fx);
    const a = st.a || {};
    const flying = st.y > 0.6 || ['circle', 'swoop', 'swoopWind', 'slamRise', 'intro', 'chargeLand', 'stalkLand', 'smashGo'].includes(st.s) && st.y > 0.2;
    const sp = st.v || 0;
    v.walk = (v.walk || 0) + dt * (1.2 + sp * 0.8);
    R.bodyY = 2.0 * 1.25 + (flying ? 0 : 0);
    // body pose
    const dormant = st.s === 'dormant';
    R.body.position.y = dormant ? 0.9 : 1.6 + Math.sin(t * (flying ? 3 : 1.2)) * (flying ? 0.15 : 0.04);
    R.body.rotation.x = st.s === 'swoop' ? 0.35 : st.s === 'charge' ? 0.15 : st.s === 'slam' ? 0.5 : st.s === 'dying' ? Math.min(1.4, v.stateT * 0.4) : 0;
    R.body.rotation.z = flying ? Math.sin(t * 0.8) * 0.08 : 0;
    // abdomen sway, stinger curls during slam
    R.abdomen.rotation.x = (st.s === 'slamRise' ? 0.9 : st.s === 'stuck' ? 1.2 : 0.1) + Math.sin(t * 1.5) * 0.05;
    // wings buzz when flying, fold when grounded
    for (const W of R.wings) {
      const buzz = flying ? Math.sin(t * 70 + W.k * 1.5) * 0.6 : 0;
      W.pivot.rotation.z = W.s * (flying ? 0.2 + buzz : -0.15);
      W.pivot.rotation.y = W.s * (flying ? 0.1 : 1.15 + W.k * 0.15);
    }
    // legs: tuck when flying, walk when grounded
    R.legs.forEach(L => {
      const ph = Math.sin(v.walk * 2.2 + L.i * 2.1 + (L.s > 0 ? Math.PI : 0));
      if (flying) { L.hip.rotation.set(0.6 + L.i * 0.1, 0, L.s * 0.3); L.knee.rotation.x = -1.4; }
      else if (dormant) { L.hip.rotation.set(0.2, 0, L.s * 1.3); L.knee.rotation.x = -2.2; }
      else {
        const k = Math.min(1, sp / 3);
        L.hip.rotation.set(ph * 0.45 * k + (L.i - 1) * 0.25, 0, L.s * 0.65);
        L.knee.rotation.set(-0.9 - Math.max(0, ph) * 0.4 * k, 0, 0);
        if (st.s === 'rake' && L.i === 0) { const r = Math.sin(Math.min(1, v.stateT / 0.7) * Math.PI); L.hip.rotation.x = -1.4 * r; L.knee.rotation.x = -0.4; }
        if (st.s === 'smash' && L.i === 0) { const r = v.stateT < 1.2 ? v.stateT / 1.2 : Math.max(0, 1 - (v.stateT - 1.2) * 3); L.hip.rotation.x = -1.8 * r; }
        if (st.s === 'chargeWind' && L.i === 0) L.hip.rotation.x = Math.sin(t * 14) * 0.5 - 0.3;
      }
    });
    // head
    const roaring = st.s === 'roar' || st.s === 'intro' || st.s === 'swoopWind' || st.s === 'chargeWind';
    R.jaw.rotation.x = roaring ? 0.55 + Math.sin(t * 30) * 0.08 : st.s === 'dying' ? 0.7 : 0.08 + Math.sin(t * 2) * 0.03;
    R.neck.rotation.x = st.s === 'chargeWind' || st.s === 'charge' ? 0.5 : roaring ? -0.35 : 0;
    R.head.rotation.y = Math.sin(t * 0.6) * 0.15;
    // eyes glow red in rage
    const rage = (a.ph || 1) >= 2;
    for (const e of R.eyes) { e.material.emissive.set(rage ? 0xff1a00 : 0x200000); e.material.emissiveIntensity = rage ? 2.5 : 0.6; }
    // plates open + sac glows when exposed or stuck
    const open = Math.max(a.ex || 0, st.s === 'stuck' ? 1 : 0);
    R.openK = (R.openK || 0) + (open - (R.openK || 0)) * Math.min(1, dt * 5);
    for (const P of R.plates) P.pivot.rotation.z = P.s * R.openK * 1.1;
    R.sacMat.emissiveIntensity = R.openK * (2.5 + Math.sin(t * 6) * 0.8);
    // telegraphs
    const floorY = 0.04;
    if (a.mk) {
      R.marker.visible = R.markerFill.visible = true;
      R.marker.position.set(a.mk[0], floorY, a.mk[1]); R.markerFill.position.set(a.mk[0], floorY - 0.005, a.mk[1]);
      R.marker.scale.setScalar(a.mk[2]); R.markerFill.scale.setScalar(a.mk[2]);
      R.marker.material.opacity = 0.45 + Math.sin(t * 14) * 0.25;
    } else R.marker.visible = R.markerFill.visible = false;
    if (a.ln) {
      const [x0, z0, x1, z1] = a.ln;
      const len = Math.hypot(x1 - x0, z1 - z0);
      R.line.visible = true;
      R.line.position.set((x0 + x1) / 2, floorY, (z0 + z1) / 2);
      R.line.rotation.set(-Math.PI / 2, 0, -Math.atan2(z1 - z0, x1 - x0));
      R.line.scale.set(len, 4.4, 1);
      R.line.material.opacity = 0.2 + Math.sin(t * 16) * 0.12;
    } else R.line.visible = false;
    if (a.wv) { R.wave.visible = true; R.wave.position.set(a.wv[0], 0.15, a.wv[1]); R.wave.scale.setScalar(a.wv[2]); R.wave.material.opacity = Math.max(0, 0.8 - a.wv[2] / 15); }
    else R.wave.visible = false;
    if (st.s === 'dead') { v.group.visible = false; R.fx.visible = false; }
    // wing buzz loop follows the boss
    if (!v.buzz && st.s !== 'dormant' && st.s !== 'dead') v.buzz = game.loopSfx('wingBuzz', v.pos, { volume: 0.9, ref: 6 });
    if (v.buzz) {
      v.buzz.setPos(v.pos);
      v.buzz.setVolume(flying ? 1.0 : 0.15);
      v.buzz.set('pitch', st.s === 'swoopWind' || st.s === 'slamRise' ? 1.6 : st.s === 'swoop' ? 1.35 : 1);
      if (st.s === 'dead') { v.buzz.stop(); v.buzz = null; }
    }
  },

  onState(v, s, prev, game) {
    const p = v.pos;
    if (s === 'intro' || s === 'roar') game.sfx('goanerRoar', p, { volume: 1.3, ref: 12, dur: 2.6 });
    if (s === 'swoopWind' || s === 'chargeWind' || s === 'slamRise') { game.sfx('warn', null, { volume: 0.7 }); game.sfx('goanerRoar', p, { volume: 0.9, ref: 10, dur: 1.2 }); }
    if (s === 'charge' || s === 'stalk') game.sfx('stomp', p, { volume: 1, ref: 8 });
    if (s === 'smash') setTimeout(() => game.sfx('crumble', p, { volume: 1.2, ref: 10 }), 1150);
    if (s === 'stuck') { game.sfx('goanerBleat', p, { volume: 1.2, ref: 10 }); game.subtitle('Its stinger is stuck in the stone — HIT IT NOW!', 2.5, 'warn'); }
    if (s === 'dying') game.sfx('goanerBleat', p, { volume: 1.5, ref: 14 });
    if (s === 'rake') setTimeout(() => game.sfx('stomp', p, { volume: 0.8 }), 650);
  },

  ambient(v, dt, game) {
    if (v.st.s === 'stalk' || v.st.s === 'charge') {
      v.stepT = (v.stepT ?? 0) - dt * Math.max(1, v.st.v) / 2.2;
      if (v.stepT <= 0) { v.stepT = 1; game.sfx('stomp', v.pos, { volume: v.st.s === 'charge' ? 1 : 0.55, ref: 8 }); game.player.shake = Math.min(1, game.player.shake + 0.08); }
    }
    if ((v.st.a?.ex || 0) > 0.5 && Math.random() < dt * 8) game.effects.burst('ember', { x: v.st.x + (Math.random() - 0.5), y: v.st.y + 3.4, z: v.st.z + (Math.random() - 0.5) });
  },

  phaseName(ph) { return PHASE_NAMES[ph] || ''; },
};
