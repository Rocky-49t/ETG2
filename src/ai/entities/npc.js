// Base NPCs: Ririqian soldiers and Did'h Wanderers. Humans, built from the
// player avatar (uniforms, gear and the weapon they carry), spawned by the host
// at their base's posts and never respawned once killed.
//
// Ririqians attack intruders on sight, shout, and pull the rest of the base in
// (big bases sound an alarm). Wanderers mind their own business unless one of
// them is hurt — then the whole camp turns on whoever did it.
import * as THREE from 'three';
import { canSee, hearNoise, goTo, wander, setState, faceToward, fleeFrom, stepToward, nearestPlayer } from '../brain.js';
import { Avatar, normalizeSkin } from '../../game/avatar.js';
import { itemModel } from '../../game/models.js';
import { TWO_HANDED } from '../../game/remote.js';
import { RNG } from '../../core/rng.js';

// how NPCs use each weapon (host-side numbers, not the player's)
export const NPC_ARMS = {
  rqRifle: { dmg: 10, rate: 0.15, burst: 3, gap: 1.0, range: 42, acc: 0.5, mag: 30, reload: 2.4, sound: 'rqRifle', pref: [8, 20] },
  rqSmg: { dmg: 6, rate: 0.09, burst: 5, gap: 0.9, range: 24, acc: 0.42, mag: 35, reload: 2.0, sound: 'smg', pref: [5, 12] },
  rqPistol: { dmg: 11, rate: 0.5, burst: 1, gap: 0.6, range: 30, acc: 0.55, mag: 8, reload: 1.6, sound: 'pistol', pref: [6, 14] },
  rqShotgun: { dmg: 22, rate: 1.0, burst: 1, gap: 0.9, range: 13, acc: 0.72, mag: 2, reload: 2.2, sound: 'shotgun', pref: [3, 7] },
  rqSniper: { dmg: 36, rate: 2.6, burst: 1, gap: 2.6, range: 90, acc: 0.78, mag: 4, reload: 3.0, sound: 'sniper', pref: [0, 999], aim: 1.1 },
  pistol: { dmg: 9, rate: 0.55, burst: 1, gap: 0.7, range: 26, acc: 0.5, mag: 12, reload: 1.5, sound: 'pistol', pref: [5, 12] },
  shotgun: { dmg: 18, rate: 1.0, burst: 1, gap: 1.0, range: 12, acc: 0.7, mag: 6, reload: 2.5, sound: 'shotgun', pref: [3, 7] },
  rqMachete: { melee: true, dmg: 20, rate: 0.9, reach: 1.8 },
  rqBaton: { melee: true, dmg: 13, rate: 0.7, reach: 1.7, stagger: true },
  knife: { melee: true, dmg: 12, rate: 0.6, reach: 1.6 },
  crowbar: { melee: true, dmg: 16, rate: 0.8, reach: 1.9 },
};

// Appearance from faction, role and a seed (clients rebuild it from the snapshot).
const SKINS = ['#e5b994', '#c98f66', '#a56c47', '#7a4b2f', '#d9c2a8', '#f2d3b8'];
export function npcSkin(f, role, seed) {
  const r = new RNG(seed >>> 0);
  if (f === 'r') {
    const officer = role === 'o';
    return normalizeSkin({
      skinTone: SKINS[r.int(0, SKINS.length - 1)], hair: r.pick(['short', 'short', 'none', 'curly']), hairColor: r.pick(['#1b1410', '#3d2817', '#2a2018']),
      headwear: officer ? 'officerCap' : r.pick(['beret', 'beret', 'none', 'cap']), headwearColor: officer ? '#2a2c26' : r.pick(['#1d1d20', '#7a1a14', '#3a3d30']),
      shirt: 'uniform', shirtColor: officer ? '#3a3d30' : r.pick(['#4f5a3c', '#55603e', '#4a5236']), pantsColor: r.pick(['#3f4a30', '#2b2d26', '#3a3d30']), shoesColor: '#111111',
      accessory: role === 'd' ? 'radio' : r.pick(['none', 'none', 'beltpack', 'radio']),
    });
  }
  return normalizeSkin({
    skinTone: SKINS[r.int(0, SKINS.length - 1)], hair: r.pick(['long', 'bun', 'curly', 'none']), hairColor: r.pick(['#3d2817', '#6b4423', '#a8743f', '#e8e2d0']),
    headwear: r.chance(0.7) ? 'hood' : 'none', headwearColor: r.pick(['#3a8a7a', '#6b5a3a', '#b8a678', '#2f5a4e']),
    shirt: 'robe', shirtColor: r.pick(['#b8a678', '#3a8a7a', '#8a7a5a', '#5a6a4a']), pantsColor: '#5a4a36', shoesColor: '#3a2a1a',
    accessory: r.pick(['satchel', 'scarf', 'satchel', 'bandana']),
  });
}
const ROLE_CODE = { guard: 'g', sniper: 's', officer: 'o', patrol: 'p', idle: 'i', radio: 'd', trader: 't', prayer: 'y' };

function makeType(type, faction) {
  return {
    type,
    name: faction === 'rq' ? 'Ririqian soldier' : 'Did\'h Wanderer',
    hp: faction === 'rq' ? 85 : 70,
    radius: 0.36,
    height: 1.8,
    blood: 'blood',
    resist: { bullet: 1, melee: 1, explosive: 1 },
    headMult: 2.4,
    hit: [{ part: 'head', y: 1.68, r: 0.15 }, { part: 'body', y: 1.25, r: 0.26 }, { part: 'body', y: 0.62, r: 0.22 }],
    persistent: true,
    corpseTime: 40,
    announceKill: false,
    human: true,

    init(e) {
      e.state = 'idle';
      const N = e.npc;
      e.mag = NPC_ARMS[N.weapon]?.mag || 0;
      e.burst = 0; e.fireT = 0; e.reloadT = 0; e.lostT = 0; e.strafe = 1; e.nades = N.nades || 0;
      if (N.gear?.[1]) e.armorK = 0.72; // a vest takes the edge off
    },

    netExtra(e) {
      const N = e.npc;
      return `${faction === 'rq' ? 'r' : 'w'}|${N.weapon || ''}|${(N.gear || []).join(',')}|${N.skin}|${ROLE_CODE[N.role] || 'i'}|${e.hostile ? 1 : 0}`;
    },

    think(e, dt, ctx) {
      const N = e.npc, game = ctx.game, { level } = ctx;
      const G = NPC_ARMS[N.weapon] || NPC_ARMS.knife;
      const hostile = faction === 'rq' || e.hostile;
      const players = ctx.players.filter(p => !p.dead && !p.downed);
      const target = () => players.find(p => p.id === e.target);
      const seen = p => canSee(e, p, level, { range: N.role === 'sniper' ? 75 : faction === 'rq' ? 34 : 24, fov: N.role === 'sniper' ? 1.6 : 2.5, eyeH: 1.6, lightAware: true });
      e.fireT = Math.max(0, e.fireT - dt);
      if (e.reloadT > 0) { e.reloadT -= dt; if (e.reloadT <= 0) e.mag = G.mag; }

      switch (e.state) {
        case 'idle': {
          if (N.role === 'patrol') wander(e, level, 1.1, dt, 6);
          else {
            const d = Math.hypot(N.home.x - e.x, N.home.z - e.z);
            if (d > 0.6 && N.role !== 'sniper') goTo(e, level, N.home.x, N.home.z, 1.2, dt);
            else { e.speedNow = 0; e.lookT = (e.lookT || 0) - dt; if (e.lookT <= 0) { e.lookT = 2 + Math.random() * 4; e.lookYaw = N.home.yaw + (Math.random() - 0.5) * 2.2; } e.yaw += Math.max(-dt, Math.min(dt, (e.lookYaw ?? e.yaw) - e.yaw)); }
          }
          if (hostile) {
            const v = players.find(seen);
            if (v) { game.hostNpcAlert(e, v); break; }
            const n = hearNoise(e, ctx.noises, level, faction === 'rq' ? 1 : 0.6);
            if (n) { e.lastSeen = { x: n.x, z: n.z, t: ctx.time }; setState(e, 'search'); }
          }
          break;
        }
        case 'combat': {
          const p = target();
          if (!p || p.hidden) { if (e.lastSeen) setState(e, 'search'); else setState(e, 'idle'); break; }
          const vis = seen(p) || Math.hypot(p.x - e.x, p.z - e.z) < 3;
          const d = Math.hypot(p.x - e.x, p.z - e.z);
          if (vis) { e.lastSeen = { x: p.x, z: p.z, t: ctx.time }; e.lostT = 0; } else e.lostT += dt;
          if (e.lostT > 5) { setState(e, 'search'); break; }
          if (G.melee) {
            goTo(e, level, p.x, p.z, faction === 'rq' ? 4.6 : 4.0, dt, { repath: 0.4, turn: 10 });
            if (d < G.reach && e.fireT <= 0) { setState(e, 'strike'); e.fireT = G.rate; }
            break;
          }
          if (!vis) {
            // lost sight: push to where they were — or lob a grenade there
            if (e.nades > 0 && d > 6 && d < 22 && Math.random() < dt * 0.25) { e.nades--; game.hostNpcGrenade(e, e.lastSeen); }
            if (N.role !== 'sniper') goTo(e, level, e.lastSeen.x, e.lastSeen.z, 3.4, dt, { repath: 0.6 });
            break;
          }
          faceToward(e, p.x, p.z, 8, dt);
          // keep a comfortable range, strafing a little
          if (N.role !== 'sniper') {
            if (d > G.pref[1]) goTo(e, level, p.x, p.z, 3.2, dt, { repath: 0.5 });
            else if (d < G.pref[0]) fleeFrom(e, level, p.x, p.z, 2.4, dt);
            else {
              e.strafeT = (e.strafeT || 0) - dt;
              if (e.strafeT <= 0) { e.strafeT = 1 + Math.random() * 1.5; e.strafe = Math.random() < 0.5 ? -1 : 1; }
              const sx = Math.cos(e.yaw) * e.strafe, sz = -Math.sin(e.yaw) * e.strafe;
              stepToward(e, level, e.x + sx, e.z + sz, 1.4, dt, 0);
              faceToward(e, p.x, p.z, 10, dt);
            }
          } else e.speedNow = 0;
          // shooting
          if (e.mag <= 0) { if (e.reloadT <= 0) { e.reloadT = G.reload; game.hostEvent(e.levelId, { k: 'sound', name: 'reload', x: e.x, y: e.y + 1.3, z: e.z, volume: 0.6 }); } break; }
          if (d > G.range || e.fireT > 0 || e.reloadT > 0) break;
          if (G.aim && !e.aiming) { e.aiming = G.aim; setState(e, 'aim'); break; }
          game.hostNpcShoot(e, p, G);
          e.mag--; e.burst++;
          if (e.burst >= G.burst) { e.burst = 0; e.fireT = G.gap * (0.8 + Math.random() * 0.5); } else e.fireT = G.rate;
          break;
        }
        case 'aim': {
          // a marksman settles before the shot (clients see the scope glint)
          e.speedNow = 0;
          const p = target();
          if (!p || p.hidden || !seen(p)) { e.aiming = 0; setState(e, 'combat'); break; }
          faceToward(e, p.x, p.z, 6, dt);
          e.aiming -= dt;
          if (e.aiming <= 0) { e.aiming = 0; game.hostNpcShoot(e, p, G); e.mag--; e.fireT = G.gap; setState(e, 'combat'); }
          break;
        }
        case 'strike': {
          e.speedNow = 0;
          const p = target();
          if (p) faceToward(e, p.x, p.z, 12, dt);
          if (e.stateT > 0.3 && !e.struck) {
            e.struck = true;
            if (p && !p.hidden && Math.hypot(p.x - e.x, p.z - e.z) < G.reach + 0.3) ctx.hurt(p.id, G.dmg * (ctx.difficulty === 'hard' ? 1.25 : ctx.difficulty === 'easy' ? 0.75 : 1), { from: e, scare: 6, type: faction === 'rq' ? 'rq' : 'didh', bleed: N.weapon === 'rqMachete' || N.weapon === 'knife' ? 0.4 : 0 });
          }
          if (e.stateT > 0.65) { e.struck = false; setState(e, 'combat'); }
          break;
        }
        case 'search': {
          if (!hostile) { setState(e, 'idle'); break; }
          const v = players.find(seen);
          if (v) { game.hostNpcAlert(e, v); break; }
          const L = e.lastSeen;
          if (!L) { setState(e, 'idle'); break; }
          const d = goTo(e, level, L.x, L.z, 2.6, dt, { repath: 0.8 });
          if (d < 1.2 || e.stateT > 18) {
            e.speedNow = 0; e.yaw += dt * 1.2;
            if (e.stateT > 24) { e.lastSeen = null; setState(e, 'idle'); }
          }
          break;
        }
      }
    },

    onDamage(e, dmg, dtype, from, game) {
      if (e.armorK && dtype !== 'explosive') dmg *= e.armorK;
      game?.hostNpcHurt(e, from);
      return dmg;
    },
    onDeath(e, game) { game.hostNpcKilled(e); },

    // ------------------------------------------------------------- client view
    build(lib, s) {
      const [f, w, g, seed, role] = String(s.a || 'r||||i').split('|');
      const av = new Avatar(npcSkin(f, role, +seed || 1));
      if (g) av.setGear(g.split(',').map(x => (x === '0' ? 0 : x)));
      if (w) av.setHeld(itemModel(w));
      const group = new THREE.Group();
      group.add(av.group);
      // a scope glint for marksmen
      const glint = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
      glint.scale.setScalar(0.35); glint.position.set(0, 1.62, 0.5); group.add(glint);
      return { group, rig: { av, w, two: TWO_HANDED.has(w), glint } };
    },

    animate(v, dt) {
      const R = v.rig, st = v.st;
      const dead = st.s === 'dead';
      R.av.animate(dt, { speed: st.v || 0, holding: !!R.w && !dead, twoHanded: R.two, pitch: st.s === 'combat' || st.s === 'aim' ? 0.05 : 0.2 });
      if (st.s === 'strike') { const k = Math.sin(Math.min(1, v.stateT / 0.35) * Math.PI); R.av.arms[1].sh.rotation.x = -2.6 + k * 2.2; }
      R.glint.material.opacity = st.s === 'aim' ? 0.6 + Math.sin(v.time * 18) * 0.4 : 0;
      if (dead) { R.av.group.rotation.x = -Math.min(1.5, v.stateT * 3); R.av.group.position.y = Math.min(0.15, v.stateT * 0.3); }
    },

    onState(v, s, prev, game) {
      if (s === 'combat' && (prev === 'idle' || prev === 'search') && faction === 'rq') game.sfx('rqShout', v.pos, { volume: 1, ref: 6, seed: v.id });
      if (s === 'dead') game.sfx('hurt', v.pos, { volume: 0.8, big: true });
    },
  };
}

export const ririqian = makeType('ririqian', 'rq');
export const didhNpc = makeType('didh', 'didh');
