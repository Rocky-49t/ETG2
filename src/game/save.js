// Save games: capture, strict validation, local slots and file export/import.
//
// Every save that enters the game (from browser storage, from an imported
// file or from a co-op client) passes through sanitizeSave / sanitizeChar.
// They rebuild the data from scratch, keeping only known fields of the
// expected types and ranges. Nothing from a file is ever evaluated or put
// into HTML, so a hostile file can at worst produce a strange (but valid)
// game state.
//
// Co-op: the host's save holds the world and every player's character.
// Each client's character is tied to a random 128-bit token that only the
// host and that client know (the client keeps it in its own browser storage).
// When the host loads the save, a returning client presents its token to
// reclaim its character; nobody can claim someone else's by name.
import { ITEMS } from './items.js';
import { TOTAL_SLOTS, HOLSTERS, EXTRA } from './inventory.js';
import { CLASSES } from './classes.js';
import { NOTES } from './notes.js';
import { LEVELS } from '../world/levels/index.js';

export const SAVE_MAGIC = 'ETG2-SAVE';
export const SAVE_VERSION = 1;
export const MAX_SAVE_BYTES = 4 * 1024 * 1024;
export const SAVE_SLOTS = ['auto', 'auto-coop', '1', '2', '3', '4', '5'];
const GEAR = ['head', 'body', 'legs', 'feet', 'pack'];
const DIFFS = ['easy', 'normal', 'hard'];
const STORE = 'etg2.save.';
const TOKENS = 'etg2.coopTokens';
const own = (o, k) => o !== null && typeof o === 'object' && Object.prototype.hasOwnProperty.call(o, k);
const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);

// ---------------------------------------------------------------- primitives
const num = (v, lo, hi, d = 0) => { v = typeof v === 'number' ? v : NaN; return Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d; };
const int = (v, lo, hi, d = 0) => Math.round(num(v, lo, hi, d));
const str = (v, n, d = '') => (typeof v === 'string' ? v.slice(0, n) : d);
// printable text only (names, labels): strip control characters
const text = (v, n, d = '') => str(v, n * 2, d).replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/g, '').slice(0, n);
const known = (table, k) => (typeof k === 'string' && own(table, k) ? k : null);

// JSON.parse with a size cap that refuses prototype-polluting keys.
export function safeParse(textIn) {
  if (typeof textIn !== 'string' || textIn.length > MAX_SAVE_BYTES) return null;
  try {
    return JSON.parse(textIn, (k, v) => (k === '__proto__' || k === 'constructor' || k === 'prototype' ? undefined : v));
  } catch { return null; }
}

// Generic plain value (object-state fields, world flags): primitives, short
// arrays and shallow objects only, with bounded sizes and depth.
const KEY_RE = /^(?!(?:__proto__|constructor|prototype)$)[A-Za-z0-9_:.,#\- ]{1,64}$/;
function plain(v, depth = 0) {
  if (v === null || typeof v === 'boolean') return v;
  if (typeof v === 'number') return Number.isFinite(v) ? Math.max(-1e12, Math.min(1e12, v)) : 0;
  if (typeof v === 'string') return v.slice(0, 256);
  if (depth >= 3) return undefined;
  if (Array.isArray(v)) return v.slice(0, 256).map(x => plain(x, depth + 1)).map(x => (x === undefined ? null : x));
  if (isObj(v)) {
    const o = {};
    let n = 0;
    for (const k of Object.keys(v)) {
      if (n >= 32) break;
      if (!KEY_RE.test(k)) continue;
      const x = plain(v[k], depth + 1);
      if (x !== undefined) { o[k] = x; n++; }
    }
    return o;
  }
  return undefined;
}

// ---------------------------------------------------------------- items
export function sanitizeItem(it) {
  if (!isObj(it)) return null;
  const id = known(ITEMS, it.id);
  if (!id) return null;
  const def = ITEMS[id];
  const out = { id, qty: int(it.qty, 1, Math.max(1, def.stack || 1), 1) };
  const data = def.data ? { ...def.data } : {};
  if (isObj(it.data)) {
    let n = 0;
    for (const k of Object.keys(it.data)) {
      if (n++ >= 12 || !/^[a-zA-Z]{1,16}$/.test(k)) continue;
      const v = it.data[k];
      if (typeof v === 'number' && Number.isFinite(v)) data[k] = Math.max(-1e6, Math.min(1e6, v));
      else if (typeof v === 'boolean') data[k] = v;
      else if (typeof v === 'string') data[k] = v.slice(0, 64);
    }
  }
  if (typeof data.dur === 'number') data.dur = Math.max(0, Math.min(100, data.dur));
  if (typeof data.charge === 'number') data.charge = Math.max(0, Math.min(100, data.charge));
  if (typeof data.fuel === 'number') data.fuel = Math.max(0, Math.min(100, data.fuel));
  if (typeof data.ammo === 'number') data.ammo = Math.max(0, Math.min(200, Math.round(data.ammo)));
  if (Object.keys(data).length) out.data = data;
  return out;
}

export function sanitizeInventory(d) {
  const out = { slots: new Array(TOTAL_SLOTS).fill(null), selected: 0, holsters: 0, extra: 0 };
  if (!isObj(d)) return out;
  out.holsters = int(d.holsters, 0, HOLSTERS);
  out.extra = int(d.extra, 0, EXTRA);
  out.selected = int(d.selected, 0, TOTAL_SLOTS - 1);
  if (Array.isArray(d.slots)) for (let i = 0; i < TOTAL_SLOTS; i++) out.slots[i] = sanitizeItem(d.slots[i]);
  return out;
}

export function sanitizeGear(g) {
  const out = {};
  for (const k of GEAR) {
    const it = isObj(g) ? sanitizeItem(g[k]) : null;
    const def = it && ITEMS[it.id];
    out[k] = def && (k === 'pack' ? def.type === 'pack' : def.armor?.slot === k) ? it : null;
  }
  return out;
}

export function sanitizeStats(s) {
  s = isObj(s) ? s : {};
  const out = {
    health: num(s.health, 1, 100, 100), hunger: num(s.hunger, 0, 100, 100), thirst: num(s.thirst, 0, 100, 100),
    sanity: num(s.sanity, 0, 100, 100), stamina: num(s.stamina, 0, 100, 100),
    bleeding: num(s.bleeding, 0, 5), regen: num(s.regen, 0, 200), staminaBoost: num(s.staminaBoost, 0, 600), status: {},
  };
  if (isObj(s.status)) {
    let n = 0;
    for (const k of Object.keys(s.status)) {
      if (n >= 16 || !/^[a-zA-Z][a-zA-Z0-9]{0,15}$/.test(k)) continue;
      const v = num(s.status[k], 0, 3600);
      if (v > 0) { out.status[k] = v; n++; }
    }
  }
  return out;
}

const finite = (v, d = 0) => num(v, -1e6, 1e6, d);
function sanitizePos(p) {
  if (!isObj(p)) return null;
  if (![p.x, p.y, p.z].every(v => typeof v === 'number' && Number.isFinite(v))) return null;
  return { x: finite(p.x), y: num(p.y, -500, 500), z: finite(p.z) };
}

// One player's character.
export function sanitizeChar(c) {
  c = isObj(c) ? c : {};
  const level = known(LEVELS, c.level);
  const journal = Array.isArray(c.journal) ? [...new Set(c.journal.slice(0, 1000).filter(id => known(NOTES, id)))] : [];
  const s0 = isObj(c.stats0) ? c.stats0 : {};
  return {
    classId: known(CLASSES, c.classId),
    inv: sanitizeInventory(c.inv),
    gear: sanitizeGear(c.gear),
    stats: sanitizeStats(c.stats),
    journal,
    level,
    pos: level ? sanitizePos(c.pos) : null,
    yaw: num(c.yaw, -100, 100),
    stats0: { kills: int(s0.kills, 0, 1e6), deaths: int(s0.deaths, 0, 1e6), notes: int(s0.notes, 0, 1e5), levels: int(s0.levels, 0, 1e5), playMs: num(s0.playMs, 0, 1e11) },
  };
}

// ---------------------------------------------------------------- world
const OBJ_ID = /^(-?\d{1,6},-?\d{1,6}:[A-Za-z0-9_]{1,24}|[A-Za-z0-9_:\-]{1,40})$/;
const DYN_ID = /^d[0-9a-z]{1,16}$/;
const DROP_STATE = new Set(['occ', 'swing']);   // transient (who is hiding in a locker)

export function sanitizeWorld(w) {
  const out = { objs: {}, dyn: {}, flags: {} };
  if (!isObj(w)) return out;
  for (const l of Object.keys(LEVELS)) {
    const objs = isObj(w.objs) && Array.isArray(w.objs[l]) ? w.objs[l] : null;
    if (objs) {
      const list = [];
      for (const e of objs.slice(0, 20000)) {
        if (!Array.isArray(e) || typeof e[0] !== 'string' || !OBJ_ID.test(e[0]) || !isObj(e[1])) continue;
        const s = plain(e[1]) || {};
        for (const k of DROP_STATE) delete s[k];
        if (Array.isArray(e[1].loot)) s.loot = e[1].loot.slice(0, 64).map(x => sanitizeItem(isObj(x) ? { id: x.item, qty: x.qty, data: x.data } : null)).filter(Boolean).map(it => ({ item: it.id, qty: it.qty, data: it.data }));
        list.push([e[0], s]);
      }
      if (list.length) out.objs[l] = list;
    }
    const dyn = isObj(w.dyn) && Array.isArray(w.dyn[l]) ? w.dyn[l] : null;
    if (dyn) {
      const list = [];
      for (const d of dyn.slice(0, 3000)) {
        if (!isObj(d) || d.kind !== 'drop' || typeof d.id !== 'string' || !DYN_ID.test(d.id)) continue;
        const it = sanitizeItem({ id: d.item, qty: d.qty, data: d.data });
        const p = sanitizePos(d);
        if (!it || !p) continue;
        list.push({ id: d.id, kind: 'drop', item: it.id, qty: it.qty, data: it.data, x: p.x, y: p.y, z: p.z, ry: num(d.ry, -10, 10) });
      }
      if (list.length) out.dyn[l] = list;
    }
    const flags = isObj(w.flags) && Array.isArray(w.flags[l]) ? w.flags[l] : null;
    if (flags) {
      const list = [];
      for (const e of flags.slice(0, 20000)) {
        if (!Array.isArray(e) || typeof e[0] !== 'string' || !KEY_RE.test(e[0])) continue;
        const v = plain(e[1]);
        if (v !== undefined) list.push([e[0], v]);
      }
      if (list.length) out.flags[l] = list;
    }
  }
  return out;
}

// ---------------------------------------------------------------- whole save
const RUN_ID = /^[A-Za-z0-9]{8,32}$/;
const TOKEN = /^[0-9a-f]{32}$/;

export function sanitizeSave(o) {
  if (!isObj(o) || o.magic !== SAVE_MAGIC) return null;
  const v = int(o.v, 0, 1e6);
  if (v < 1 || v > SAVE_VERSION) return null;
  const host = sanitizeChar(o.host);
  if (!host.level) return null;
  const players = [];
  if (Array.isArray(o.players)) for (const p of o.players.slice(0, 16)) {
    if (!isObj(p) || typeof p.token !== 'string' || !TOKEN.test(p.token) || players.some(q => q.token === p.token)) continue;
    players.push({ token: p.token, name: text(p.name, 20, 'Wanderer'), char: sanitizeChar(p.char) });
  }
  return {
    magic: SAVE_MAGIC, v: SAVE_VERSION,
    id: typeof o.id === 'string' && RUN_ID.test(o.id) ? o.id : randomId(),
    name: text(o.name, 40, 'Untitled'),
    mode: o.mode === 'coop' ? 'coop' : 'solo',
    saved: num(o.saved, 0, 1e14, Date.now()),
    seed: int(o.seed, 0, 0xffffffff),
    seedLabel: text(o.seedLabel, 40, ''),
    difficulty: DIFFS.includes(o.difficulty) ? o.difficulty : 'normal',
    friendlyFire: o.friendlyFire === true,
    time: num(o.time, 0, 1e9),
    hostName: text(o.hostName, 20, 'Wanderer'),
    host, players,
    world: sanitizeWorld(o.world),
  };
}

// A short, human summary (rendered with textContent only).
export function describeSave(s) {
  const L = LEVELS[s.host.level];
  const mins = Math.round((s.host.stats0.playMs || 0) / 60000);
  const who = s.mode === 'coop' ? `co-op · ${1 + s.players.length} player${s.players.length ? 's' : ''}` : 'solo';
  return { title: s.name, level: L ? `${L.name} — ${L.title}` : s.host.level, line: `${who} · ${CLASSES[s.host.classId]?.name || 'no role'} · ${mins} min · seed ${s.seedLabel || s.seed}`, date: new Date(s.saved).toLocaleString() };
}

// ---------------------------------------------------------------- ids / tokens
export function randomHex(bytes = 16) {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return [...a].map(b => b.toString(16).padStart(2, '0')).join('');
}
export function randomId() {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const a = new Uint8Array(16);
  crypto.getRandomValues(a);
  return [...a].map(b => A[b % A.length]).join('');
}
export const isToken = t => typeof t === 'string' && TOKEN.test(t);
export const isRunId = t => typeof t === 'string' && RUN_ID.test(t);
// constant-time-ish comparison (tokens are fixed length)
export function tokenEq(a, b) {
  if (!isToken(a) || !isToken(b)) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

// Client side: my token for each co-op run (kept in this browser only).
export function getToken(runId) {
  if (!isRunId(runId)) return null;
  try { const m = safeParse(localStorage.getItem(TOKENS) || '{}'); return isObj(m) && isToken(m[runId]) ? m[runId] : null; } catch { return null; }
}
export function setToken(runId, token) {
  if (!isRunId(runId) || !isToken(token)) return;
  try {
    const m = safeParse(localStorage.getItem(TOKENS) || '{}');
    const out = {};
    if (isObj(m)) for (const k of Object.keys(m).filter(k => isRunId(k) && isToken(m[k])).slice(-40)) out[k] = m[k];
    delete out[runId];
    out[runId] = token;
    localStorage.setItem(TOKENS, JSON.stringify(out));
  } catch { /* storage unavailable */ }
}

// ---------------------------------------------------------------- integrity
// A checksum over the save body, so corrupted or hand-edited files can be
// flagged. (It is not a security boundary: every load is validated anyway.)
export async function checksum(body) {
  try {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(body));
    return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
  } catch { return ''; }
}

export async function encodeSave(save) {
  const body = JSON.stringify(save);
  return JSON.stringify({ format: SAVE_MAGIC, sum: await checksum(body), body });
}

// Parse a stored/exported envelope -> { save, edited } or { error }.
export async function decodeSave(raw) {
  if (typeof raw !== 'string' || !raw.length) return { error: 'The file is empty.' };
  if (raw.length > MAX_SAVE_BYTES) return { error: 'The file is too large to be a save.' };
  const env = safeParse(raw);
  if (!isObj(env) || env.format !== SAVE_MAGIC || typeof env.body !== 'string') return { error: 'This is not an Escape the Goanrooms II save file.' };
  const save = sanitizeSave(safeParse(env.body));
  if (!save) return { error: 'The save is damaged or from a newer version of the game.' };
  const sum = await checksum(env.body);
  return { save, edited: !!sum && env.sum !== sum };
}

// ---------------------------------------------------------------- local slots
export async function writeSlot(slot, save) {
  if (!SAVE_SLOTS.includes(slot)) return 'Unknown slot.';
  try { localStorage.setItem(STORE + slot, await encodeSave(save)); return null; } catch { return 'Browser storage is full or disabled. Export the save to a file instead.'; }
}
export async function readSlot(slot) {
  if (!SAVE_SLOTS.includes(slot)) return null;
  let raw = null;
  try { raw = localStorage.getItem(STORE + slot); } catch { return null; }
  if (!raw) return null;
  const r = await decodeSave(raw);
  return r.save ? r : null;
}
export function deleteSlot(slot) { if (SAVE_SLOTS.includes(slot)) try { localStorage.removeItem(STORE + slot); } catch { /* ignore */ } }
export async function listSlots() {
  const out = [];
  for (const slot of SAVE_SLOTS) out.push({ slot, entry: await readSlot(slot) });
  return out;
}

// ---------------------------------------------------------------- files
export async function exportFile(save) {
  const blob = new Blob([await encodeSave(save)], { type: 'application/json' });
  const a = document.createElement('a');
  const safe = save.name.replace(/[^A-Za-z0-9_-]+/g, '_').slice(0, 32) || 'save';
  a.href = URL.createObjectURL(blob);
  a.download = `goanrooms-${safe}-${new Date(save.saved).toISOString().slice(0, 10)}.etg2save`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

export function importFile() {
  return new Promise(resolve => {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = '.etg2save,.json,application/json';
    inp.onchange = async () => {
      const f = inp.files?.[0];
      if (!f) { resolve(null); return; }
      if (f.size > MAX_SAVE_BYTES) { resolve({ error: 'The file is too large to be a save.' }); return; }
      try { resolve(await decodeSave(await f.text())); } catch { resolve({ error: 'Could not read the file.' }); }
    };
    inp.click();
  });
}
