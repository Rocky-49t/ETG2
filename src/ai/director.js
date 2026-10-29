// Horror Director (host). Tracks a tension value per level and cycles
// through calm -> build -> peak -> relax phases. It decides when and where
// entities appear (out of sight, at a fair distance), fires environmental
// events (blackouts, flickers, distant sounds, knocks) and very occasionally
// sends the Lookalike. Never spams: everything has cooldowns.
import { TILE } from '../world/chunk.js';

const PHASES = ['calm', 'build', 'peak', 'relax'];

export class Director {
  constructor(game) {
    this.game = game;
    this.levels = new Map();
  }

  st(levelId) {
    let s = this.levels.get(levelId);
    if (!s) {
      s = { tension: 0, phase: 'calm', phaseT: 0, phaseLen: 50, spawnCd: 25, eventCd: 30, lookalikeCd: 160, quietT: 0, scripted: new Set() };
      this.levels.set(levelId, s);
    }
    return s;
  }

  update(dt, perLevel) {
    for (const [levelId, ctx] of perLevel) {
      const def = ctx.level.def;
      if (!def.entities || def.noDirector) continue;
      const s = this.st(levelId);
      const g = this.game;
      const diff = ctx.difficulty;
      const diffK = diff === 'easy' ? 0.7 : diff === 'hard' ? 1.35 : 1;
      // --- tension input: active threats near players, player noise
      const ents = g.entities.byLevel(levelId).filter(e => e.state !== 'dead');
      let threat = 0;
      for (const e of ents) for (const p of ctx.players) {
        const d = Math.hypot(e.x - p.x, e.z - p.z);
        if (d < 18) threat += (e.state === 'hunt' || e.state === 'chase' || e.state === 'attack') ? 0.5 : 0.15;
      }
      let noise = 0;
      for (const n of ctx.noises) noise += n.r > 20 ? 0.35 : n.r > 10 ? 0.05 : 0;
      s.tension = Math.max(0, Math.min(1, s.tension + (threat * 0.15 + noise * 0.4) * dt - dt * (s.phase === 'relax' ? 0.06 : 0.02)));

      // --- phases
      s.phaseT += dt;
      if (s.phaseT > s.phaseLen) {
        const i = PHASES.indexOf(s.phase);
        s.phase = PHASES[(i + 1) % PHASES.length];
        s.phaseT = 0;
        s.phaseLen = { calm: 45 + Math.random() * 40, build: 40 + Math.random() * 30, peak: 35 + Math.random() * 30, relax: 30 + Math.random() * 25 }[s.phase] / diffK;
      }
      // --- spawning the level's primary entity
      s.spawnCd -= dt;
      const ent = def.entities;
      const alive = ents.filter(e => e.type === ent.primary).length;
      const maxBy = { calm: 0, build: 1, peak: ent.max, relax: 0 }[s.phase];
      const want = Math.min(ent.max, Math.ceil(maxBy * diffK * (1 + 0.3 * Math.max(0, ctx.players.length - 1))));
      if (s.spawnCd <= 0 && alive < want && ent.primary) {
        const pos = this.findSpawn(ctx, ent.minDist ?? 26, ent.maxDist ?? 42, ent.spawnFilter);
        if (pos) {
          const count = ent.pack ? ent.pack[0] + Math.floor(Math.random() * (ent.pack[1] - ent.pack[0] + 1)) : 1;
          for (let k = 0; k < count; k++) g.entities.spawn(ent.primary, levelId, pos.x + (k % 2) * 1.2, pos.z + Math.floor(k / 2) * 1.2, { packId: pos.x });
          s.spawnCd = (ent.spawnCd ?? 40) / diffK;
        } else s.spawnCd = 5;
      }
      // --- environmental events
      s.eventCd -= dt;
      if (s.eventCd <= 0) {
        s.eventCd = (s.phase === 'peak' ? 18 : s.phase === 'build' ? 26 : 45) + Math.random() * 25;
        this.fireEvent(levelId, ctx, s);
      }
      // --- rare lookalike
      s.lookalikeCd -= dt;
      if (s.lookalikeCd <= 0 && ent.rare?.includes('lookalike') && !g.entities.count(levelId, 'lookalike')) {
        const lowSanity = ctx.players.some(p => (p.sanity ?? 100) < 55);
        if (Math.random() < (lowSanity ? 0.6 : 0.25)) {
          const target = ctx.players[Math.floor(Math.random() * ctx.players.length)];
          const pos = this.findSpawn(ctx, 18, 30, null, target, true);
          if (pos) {
            const mimic = ctx.players.length > 1 ? ctx.players.find(p => p.id !== target.id)?.id : target.id;
            g.entities.spawn('lookalike', levelId, pos.x, pos.z, { mimic });
          }
        }
        s.lookalikeCd = 150 + Math.random() * 150;
      }
    }
  }

  fireEvent(levelId, ctx, s) {
    const g = this.game;
    const p = ctx.players[Math.floor(Math.random() * ctx.players.length)];
    if (!p) return;
    const r = Math.random();
    const def = ctx.level.def;
    if (r < 0.22 && def.allowBlackout !== false) {
      g.hostEvent(levelId, { k: 'blackout', dur: 4 + Math.random() * 5 });
    } else if (r < 0.5) {
      g.hostEvent(levelId, { k: 'flicker', dur: 1.5 + Math.random() * 2 });
    } else {
      const sounds = def.eventSounds || ['knock', 'distantThud', 'footstepsFake', 'scrape', 'whisper'];
      const a = Math.random() * Math.PI * 2, d = 8 + Math.random() * 14;
      g.hostEvent(levelId, { k: 'sound', name: sounds[Math.floor(Math.random() * sounds.length)], x: p.x + Math.cos(a) * d, y: p.y + 1, z: p.z + Math.sin(a) * d });
    }
  }

  // A walkable spot within [minD, maxD] of a player but not visible to any player.
  findSpawn(ctx, minD, maxD, filter, target, wantVisible = false) {
    const { level, players } = ctx;
    if (!players.length) return null;
    for (let k = 0; k < 40; k++) {
      const p = target || players[Math.floor(Math.random() * players.length)];
      const a = Math.random() * Math.PI * 2;
      const d = minD + Math.random() * (maxD - minD);
      const x = p.x + Math.cos(a) * d, z = p.z + Math.sin(a) * d;
      const tx = Math.floor(x / TILE), tz = Math.floor(z / TILE);
      if (!level.walkable(tx, tz)) continue;
      const cx = (tx + 0.5) * TILE, cz = (tz + 0.5) * TILE;
      if (filter && !filter(level, cx, cz)) continue;
      if (players.some(q => Math.hypot(q.x - cx, q.z - cz) < minD * 0.8)) continue;
      const fy = level.floorAt(cx, cz);
      if (!isFinite(fy)) continue;
      const seen = players.some(q => level.lineOfSight(q.x, q.y + 1.5, q.z, cx, fy + 1.2, cz));
      if (wantVisible ? !seen : seen) continue;
      // must be reachable (cheap check: a path exists)
      const path = level.findPath(cx, cz, p.x, p.z, { maxNodes: 900 });
      if (!path) continue;
      return { x: cx, z: cz };
    }
    return null;
  }
}
