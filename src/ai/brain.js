// Reusable AI helpers: perception (sight / hearing / light), path following,
// steering with collision, and attack timing. Entity types compose these in
// their think() functions.
import { angleDiff } from '../core/rng.js';
import { TILE } from '../world/chunk.js';

export const NOISE = {
  crouch: 0, walk: 6, sprint: 15, land: 10, jump: 5, swim: 7, splash: 12,
  door: 12, locker: 7, melee: 6, pistol: 42, smg: 40, shotgun: 50, rifle: 48, reload: 4,
  decoy: 32, scream: 25, glass: 14, throw: 3,
};

// ---------------------------------------------------------------- perception
export function canSee(e, p, level, opts = {}) {
  const range = opts.range ?? 20;
  const dx = p.x - e.x, dz = p.z - e.z;
  const d = Math.hypot(dx, dz);
  if (d > range) return false;
  if (opts.fov !== undefined && d > 1.5) {
    const a = Math.atan2(dx, dz);
    if (Math.abs(angleDiff(e.yaw, a)) > opts.fov / 2) return false;
  }
  // darkness halves sight range unless the player is lit
  if (opts.lightAware) {
    const lit = p.light || p.lighter || (p.ambientLight ?? 0.3) > 0.25;
    if (!lit && d > range * 0.45) return false;
  }
  if (p.hidden) return false;
  const eyeY = e.y + (opts.eyeH ?? 1.6);
  return level.lineOfSight(e.x, eyeY, e.z, p.x, p.y + (p.crouch ? 0.9 : 1.4), p.z);
}

// Loudest relevant noise heard by an entity this tick.
export function hearNoise(e, noises, level, mult = 1) {
  let best = null, bestScore = 0;
  for (const n of noises) {
    const d = Math.hypot(n.x - e.x, n.z - e.z);
    let r = n.r * mult;
    if (r <= 0) continue;
    if (d > r) continue;
    // walls muffle
    if (d > 4 && !level.tileLOS(e.x, e.z, n.x, n.z)) { r *= 0.55; if (d > r) continue; }
    const score = 1 - d / r;
    if (score > bestScore) { bestScore = score; best = n; }
  }
  return best ? { ...best, score: bestScore } : null;
}

export function nearestPlayer(e, players, filter = () => true) {
  let best = null, bd = Infinity;
  for (const p of players) {
    if (p.dead || !filter(p)) continue;
    const d = Math.hypot(p.x - e.x, p.z - e.z);
    if (d < bd) { bd = d; best = p; }
  }
  return best ? { p: best, d: bd } : null;
}

// Is player p shining a flashlight on point (x,y,z)? Returns 0..1 strength.
export function lightOn(p, x, y, z, level, maxD = 12, focusBonus = true) {
  if (!p.light || !p.dir) return 0;
  const ex = p.x, ey = p.y + (p.crouch ? 1.0 : 1.55), ez = p.z;
  const dx = x - ex, dy = y - ey, dz = z - ez;
  const d = Math.hypot(dx, dy, dz);
  if (d > maxD * (p.focus ? 1.4 : 1)) return 0;
  const dot = (dx * p.dir.x + dy * p.dir.y + dz * p.dir.z) / (d || 1);
  const cone = p.focus && focusBonus ? 0.985 : 0.965;
  if (dot < cone) return 0;
  if (!level.lineOfSight(ex, ey, ez, x, y, z)) return 0;
  return (p.focus ? 2.2 : 1) * (1 - d / (maxD * 1.4));
}

// ---------------------------------------------------------------- movement
export function faceToward(e, x, z, rate, dt) {
  const a = Math.atan2(x - e.x, z - e.z);
  const d = angleDiff(e.yaw, a);
  e.yaw += Math.max(-rate * dt, Math.min(rate * dt, d));
}

// Move with collision toward a point. Returns distance remaining.
export function stepToward(e, level, x, z, speed, dt, turnRate = 8) {
  const dx = x - e.x, dz = z - e.z;
  const d = Math.hypot(dx, dz);
  if (d < 0.05) return d;
  faceToward(e, x, z, turnRate, dt);
  const step = Math.min(d, speed * dt);
  const body = e.body;
  body.x = e.x; body.y = e.y; body.z = e.z;
  level.move(body, (dx / d) * step, (dz / d) * step);
  let moved = Math.hypot(body.x - e.x, body.z - e.z);
  if (step > 0.01 && moved < step * 0.3) {
    // blocked (a corner, a prop): slide sideways along whichever side gives way
    const px = -dz / d, pz = dx / d;
    let best = null;
    for (const sgn of [1, -1]) {
      const t = { ...body, x: e.x, z: e.z };
      level.move(t, (dx / d * 0.35 + px * sgn) * step, (dz / d * 0.35 + pz * sgn) * step);
      const m = Math.hypot(t.x - e.x, t.z - e.z);
      if (!best || m > best.m) best = { m, x: t.x, z: t.z, sgn };
    }
    // keep sliding the same way while stuck, so it doesn't dither in a corner
    if (e.slideSgn && best.sgn !== e.slideSgn) {
      const t = { ...body, x: e.x, z: e.z };
      level.move(t, (dx / d * 0.35 + px * e.slideSgn) * step, (dz / d * 0.35 + pz * e.slideSgn) * step);
      const m = Math.hypot(t.x - e.x, t.z - e.z);
      if (m > best.m * 0.6) best = { m, x: t.x, z: t.z, sgn: e.slideSgn };
    }
    if (best.m > moved) { body.x = best.x; body.z = best.z; moved = best.m; e.slideSgn = best.sgn; }
  } else e.slideSgn = 0;
  e.x = body.x; e.z = body.z;
  if (!e.flying) {
    const g = level.groundAt(body);
    if (!isFinite(e.y)) e.y = isFinite(g) ? g : 0;
    if (g > -1e5 && g < e.y + 0.7) e.y += (g - e.y) * Math.min(1, dt * 12);
    else if (g < e.y - 0.7) e.y = Math.max(g, e.y - 9 * dt); // fall
  }
  e.speedNow = moved / Math.max(dt, 1e-4);
  e.stuck = step > 0.01 && moved < step * 0.25 ? (e.stuck || 0) + dt : 0;
  return d - moved;
}

// Line of sight wide enough for the body: centre ray plus one at each shoulder,
// so a direct line never clips a wall corner the body can't fit past.
export function clearPath(e, level, x, z) {
  const dx = x - e.x, dz = z - e.z, d = Math.hypot(dx, dz);
  if (d < 0.05) return true;
  const r = (e.body?.r ?? 0.4) * 0.95, px = -dz / d * r, pz = dx / d * r, y = e.y + 0.6;
  return level.lineOfSight(e.x, y, e.z, x, y, z, { ignoreProps: false })
    && level.lineOfSight(e.x + px, y, e.z + pz, x + px, y, z + pz)
    && level.lineOfSight(e.x - px, y, e.z - pz, x - px, y, z - pz);
}

// Drop waypoints that can be skipped with a clear, body-wide line.
function smoothPath(e, level, path) {
  if (!path || path.length < 3) return path;
  const out = [];
  const from = { x: e.x, y: e.y, z: e.z, body: e.body };
  let i = 0;
  while (i < path.length) {
    let j = Math.min(path.length - 1, i + 6);
    while (j > i && !clearPath(from, level, path[j].x, path[j].z)) j--;
    out.push(path[j]);
    from.x = path[j].x; from.z = path[j].z;
    i = j + 1;
  }
  return out;
}

// Path-follow toward a goal, re-pathing periodically.
export function goTo(e, level, gx, gz, speed, dt, opts = {}) {
  e.pathT = (e.pathT || 0) - dt;
  const goalMoved = !e.goal || Math.hypot(e.goal.x - gx, e.goal.z - gz) > (opts.repathDist ?? 1.5);
  if (!e.path || e.pathT <= 0 || goalMoved || e.stuck > 0.6) {
    e.goal = { x: gx, z: gz };
    // direct line if clear (for the whole body) and close
    const direct = Math.hypot(gx - e.x, gz - e.z) < 18 && !opts.waterOnly && clearPath(e, level, gx, gz);
    e.path = direct ? [{ x: gx, z: gz }] : smoothPath(e, level, level.findPath(e.x, e.z, gx, gz, opts));
    e.pathT = opts.repath ?? 0.7;
    // stuck for a while even after re-pathing: aim at a nearby open spot for a moment
    if (e.stuck > 0.6) {
      e.stuckCount = (e.stuckCount || 0) + 1;
      if (e.stuckCount > 2) { const p = level.randomWalkableNear(e.x, e.z, 3); if (p) { e.path = [p, ...(e.path || [])]; e.pathT = 0.9; } e.stuckCount = 0; }
    } else e.stuckCount = 0;
    e.stuck = 0;
    if (!e.path || !e.path.length) { e.path = null; return Infinity; }
  }
  let wp = e.path[0];
  while (wp && Math.hypot(wp.x - e.x, wp.z - e.z) < (e.path.length > 1 ? 0.6 : 0.15)) { e.path.shift(); wp = e.path[0]; }
  // cut the corner early once the next waypoint is in clear view
  e.skipT = (e.skipT || 0) - dt;
  if (e.path.length > 1 && e.skipT <= 0) { e.skipT = 0.25; if (clearPath(e, level, e.path[1].x, e.path[1].z)) { e.path.shift(); wp = e.path[0]; } }
  if (!wp) return 0;
  stepToward(e, level, wp.x, wp.z, speed, dt, opts.turn ?? 8);
  return Math.hypot(gx - e.x, gz - e.z);
}

export function wander(e, level, speed, dt, radius = 12, rng = Math.random) {
  e.wanderT = (e.wanderT || 0) - dt;
  if (!e.wanderGoal || e.wanderT <= 0 || Math.hypot(e.wanderGoal.x - e.x, e.wanderGoal.z - e.z) < 0.8) {
    const p = level.randomWalkableNear(e.home ? e.home.x * 0.3 + e.x * 0.7 : e.x, e.home ? e.home.z * 0.3 + e.z * 0.7 : e.z, radius, rng);
    e.wanderGoal = p || { x: e.x, z: e.z };
    e.wanderT = 6 + rng() * 8;
  }
  return goTo(e, level, e.wanderGoal.x, e.wanderGoal.z, speed, dt, { repath: 2 });
}

// Move directly away from a point.
export function fleeFrom(e, level, x, z, speed, dt) {
  const dx = e.x - x, dz = e.z - z;
  const d = Math.hypot(dx, dz) || 1;
  const tx = e.x + (dx / d) * 4, tz = e.z + (dz / d) * 4;
  stepToward(e, level, tx, tz, speed, dt, 10);
}

export function setState(e, s) {
  if (e.state !== s) { e.state = s; e.stateT = 0; e.stateChanged = true; }
}

export function tileOf(x) { return Math.floor(x / TILE); }
