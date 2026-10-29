// Developer / cheat console, toggled with the backquote key (`).
// Solo: always available. Co-op: the host turns cheats on with `cheats on`
// and can grant or revoke them per player; commands that change shared state
// (spawning, killing, flags) are validated again by the host.
import { input } from '../core/input.js';
import { ITEMS } from '../game/items.js';
import { WEAPONS } from '../game/weapons.js';
import { ENTITY_TYPES } from '../ai/entities/index.js';
import { LEVELS, LEVEL_ORDER } from '../world/levels/index.js';
import { nearestExit } from '../world/levels/common.js';
import { TILE } from '../world/chunk.js';

const $ = id => document.getElementById(id);

const HELP = [
  ['help', 'list commands'],
  ['give <item> [qty]', 'add an item (see `items`)'],
  ['items', 'list item ids'],
  ['heal', 'restore health, hunger, thirst, stamina and sanity'],
  ['god', 'toggle invulnerability'],
  ['fly', 'toggle flying (Space up, C down)'],
  ['noclip', 'toggle flying through walls'],
  ['notarget', 'toggle being ignored by creatures'],
  ['speed <x>', 'movement speed multiplier (1 = normal)'],
  ['ammo', 'refill weapon magazines and flashlight battery'],
  ['sanity <0-100>', 'set sanity'],
  ['level <L0|L1|L2|L3|L5>', 'travel to a level (also `level next`)'],
  ['tp <x> <z> | exit | key | <player>', 'teleport'],
  ['pos', 'print your position'],
  ['spawn <entity> [n]', 'spawn creatures in front of you (see `entities`)'],
  ['entities', 'list entity types'],
  ['killall', 'kill every creature on this level'],
  ['flag <name> [0|1]', 'set a level flag (power, stairOpen, drainOpen, ...)'],
  ['clear', 'clear the console'],
  ['— host only (co-op) —', ''],
  ['cheats on|off', 'allow cheats in this co-op session'],
  ['players', 'list players and permissions'],
  ['grant <player|all>', 'let a player use cheats'],
  ['revoke <player|all>', 'take cheat access away'],
];

export class CheatConsole {
  constructor(ui) {
    this.ui = ui;
    this.game = null;
    this.el = $('console');
    this.log = $('consoleLog');
    this.inp = $('consoleInput');
    this.history = [];
    this.hIdx = 0;
    this.inp.addEventListener('keydown', e => {
      e.stopPropagation();
      if (e.code === 'Backquote' || e.key === 'Escape') { e.preventDefault(); this.close(); return; }
      if (e.key === 'Enter') {
        const line = this.inp.value.trim();
        this.inp.value = '';
        if (line) { this.history.push(line); this.hIdx = this.history.length; this.print('> ' + line, 'cmd'); this.run(line); }
        e.preventDefault();
      } else if (e.key === 'ArrowUp') {
        this.hIdx = Math.max(0, this.hIdx - 1); this.inp.value = this.history[this.hIdx] || ''; e.preventDefault();
      } else if (e.key === 'ArrowDown') {
        this.hIdx = Math.min(this.history.length, this.hIdx + 1); this.inp.value = this.history[this.hIdx] || ''; e.preventDefault();
      } else if (e.key === 'Tab') {
        e.preventDefault();
        this.complete();
      }
    });
  }

  get isOpen() { return this.ui.open.has('console'); }

  toggle(game) { if (this.isOpen) this.close(); else this.open(game); }

  open(game) {
    this.game = game;
    this.ui.open.add('console');
    this.el.classList.remove('hidden');
    input.unlock();
    if (!this.greeted) {
      this.greeted = true;
      this.print('Escape the Goanrooms II console. Type `help`.', 'sys');
    }
    if (!game.canCheat()) this.print(game.online ? 'Cheats are off. The host can enable them with `cheats on` and `grant <player>`.' : 'Cheats unavailable.', 'warn');
    setTimeout(() => this.inp.focus(), 0);
  }

  close() {
    this.ui.open.delete('console');
    this.el.classList.add('hidden');
    this.inp.blur();
    if (!this.ui.modalOpen && this.game && !this.game.dead && !this.game.won) input.lock();
  }

  print(text, cls = '') {
    const d = document.createElement('div');
    d.textContent = text;
    if (cls) d.className = cls;
    this.log.appendChild(d);
    while (this.log.children.length > 200) this.log.firstChild.remove();
    this.log.scrollTop = this.log.scrollHeight;
  }

  complete() {
    const parts = this.inp.value.split(/\s+/);
    const last = parts[parts.length - 1].toLowerCase();
    let pool;
    if (parts.length === 1) pool = HELP.map(h => h[0].split(' ')[0]).filter(c => /^[a-z]/.test(c));
    else if (parts[0] === 'give') pool = Object.keys(ITEMS);
    else if (parts[0] === 'spawn') pool = Object.keys(ENTITY_TYPES);
    else if (parts[0] === 'level') pool = [...LEVEL_ORDER, 'next'];
    else return;
    const hits = pool.filter(p => p.toLowerCase().startsWith(last));
    if (hits.length === 1) { parts[parts.length - 1] = hits[0]; this.inp.value = parts.join(' ') + ' '; }
    else if (hits.length > 1) this.print(hits.join('  '), 'sys');
  }

  // ------------------------------------------------------------------ commands
  run(line) {
    const g = this.game;
    if (!g) return;
    const [cmdRaw, ...args] = line.split(/\s+/);
    const cmd = cmdRaw.toLowerCase();
    const say = (t, c) => this.print(t, c);
    // commands that never need permission
    if (cmd === 'help') { for (const [c, d] of HELP) say(d ? `${c.padEnd(34)} ${d}` : c, 'sys'); return; }
    if (cmd === 'clear') { this.log.innerHTML = ''; return; }
    if (cmd === 'items') { say(Object.keys(ITEMS).join('  '), 'sys'); return; }
    if (cmd === 'entities') { say(Object.keys(ENTITY_TYPES).join('  '), 'sys'); return; }
    if (cmd === 'pos') { const p = g.player.pos; say(`${g.levelId}  x ${p.x.toFixed(1)}  y ${p.y.toFixed(1)}  z ${p.z.toFixed(1)}`, 'sys'); return; }
    // host permission management
    if (cmd === 'cheats' || cmd === 'players' || cmd === 'grant' || cmd === 'revoke') {
      if (!g.online) { say('Permission commands are for co-op. Cheats are always on in solo.', 'sys'); return; }
      if (!g.isHost) { say('Only the host can manage cheat permissions.', 'warn'); return; }
      return this.hostCommand(cmd, args);
    }
    if (!g.canCheat()) { say('You do not have cheat access in this session.', 'warn'); return; }
    const P = g.player;
    switch (cmd) {
      case 'give': {
        const id = this.resolve(args[0], Object.keys(ITEMS));
        if (!id) { say('Unknown item. Try `items`.', 'warn'); return; }
        const qty = Math.max(1, Math.min(99, parseInt(args[1] || '1', 10) || 1));
        const left = g.inventory.add({ id, qty });
        say(left ? `Gave ${qty - left} ${ITEMS[id].name} (inventory full).` : `Gave ${qty} ${ITEMS[id].name}.`, 'ok');
        break;
      }
      case 'heal':
        Object.assign(g.stats, { health: 100, hunger: 100, thirst: 100, stamina: 100, sanity: 100 });
        say('Fully restored.', 'ok');
        break;
      case 'god':
        g.cheatGod = !g.cheatGod;
        say(`God mode ${g.cheatGod ? 'ON' : 'OFF'}.`, 'ok');
        break;
      case 'fly':
        P.fly = !P.fly; if (P.fly) P.noclip = false;
        say(`Fly ${P.fly ? 'ON' : 'OFF'}.`, 'ok');
        break;
      case 'noclip':
        P.noclip = !P.noclip; if (P.noclip) P.fly = false;
        say(`Noclip ${P.noclip ? 'ON' : 'OFF'}.`, 'ok');
        break;
      case 'notarget':
        g.notarget = !g.notarget;
        say(`No-target ${g.notarget ? 'ON' : 'OFF'}.`, 'ok');
        break;
      case 'speed': {
        const v = parseFloat(args[0]);
        if (!(v > 0 && v <= 10)) { say('Usage: speed <0.1-10>', 'warn'); return; }
        P.speedMul = v; g.cheatSpeed = v;
        say(`Speed x${v}.`, 'ok');
        break;
      }
      case 'ammo':
        for (const s of g.inventory.slots) {
          if (!s?.data) continue;
          const w = WEAPONS[ITEMS[s.id]?.weapon];
          if (w?.mag) s.data.ammo = w.mag;
          if (s.data.dur !== undefined) s.data.dur = 100;
          if (s.data.charge !== undefined) s.data.charge = 100;
          if (s.data.fuel !== undefined) s.data.fuel = 100;
        }
        g.inventory.changed();
        say('Magazines, durability and batteries refilled.', 'ok');
        break;
      case 'sanity': {
        const v = Math.max(0, Math.min(100, parseFloat(args[0])));
        if (isNaN(v)) { say('Usage: sanity <0-100>', 'warn'); return; }
        g.stats.sanity = v; say(`Sanity ${v}.`, 'ok');
        break;
      }
      case 'level': {
        let id = (args[0] || '').toUpperCase();
        if (id === 'NEXT') id = g.def?.next || '';
        if (!LEVELS[id]) { say(`Levels: ${LEVEL_ORDER.join(' ')}`, 'warn'); return; }
        say(`Travelling to ${LEVELS[id].name} — ${LEVELS[id].title}.`, 'ok');
        this.close();
        g.request({ t: 'exitUsed', from: g.levelId, to: id });
        g.enterLevel(id);
        break;
      }
      case 'tp': return this.teleport(args);
      case 'spawn': {
        const type = this.resolve(args[0], Object.keys(ENTITY_TYPES));
        if (!type) { say('Unknown entity. Try `entities`.', 'warn'); return; }
        const n = Math.max(1, Math.min(8, parseInt(args[1] || '1', 10) || 1));
        const f = { x: -Math.sin(P.yaw), z: -Math.cos(P.yaw) };
        g.request({ t: 'cheat', c: 'spawn', type, n, l: g.levelId, x: P.pos.x + f.x * 5, z: P.pos.z + f.z * 5 });
        say(`Spawning ${n} ${type}.`, 'ok');
        break;
      }
      case 'killall':
        g.request({ t: 'cheat', c: 'killall', l: g.levelId });
        say('Killing every creature on this level.', 'ok');
        break;
      case 'flag': {
        if (!args[0]) { say('Usage: flag <name> [0|1]', 'warn'); return; }
        g.request({ t: 'cheat', c: 'flag', l: g.levelId, k: args[0], v: args[1] !== '0' });
        say(`Flag ${args[0]} = ${args[1] !== '0'}.`, 'ok');
        break;
      }
      default:
        say(`Unknown command "${cmd}". Type \`help\`.`, 'warn');
    }
  }

  resolve(name, pool) {
    if (!name) return null;
    const n = name.toLowerCase();
    return pool.find(p => p.toLowerCase() === n) || pool.find(p => p.toLowerCase().startsWith(n)) || null;
  }

  teleport(args) {
    const g = this.game, say = (t, c) => this.print(t, c);
    const P = g.player, L = g.level;
    const go = (x, z, y) => {
      let fy = y ?? L.floorAt(x, z);
      if (!isFinite(fy)) { const p = L.randomWalkableNear(x, z, 6); if (!p) { say('No floor there.', 'warn'); return; } x = p.x; z = p.z; fy = L.floorAt(x, z); }
      P.teleport(x, fy + 0.05, z);
      say(`Teleported to ${x.toFixed(1)}, ${z.toFixed(1)}.`, 'ok');
    };
    const a = (args[0] || '').toLowerCase();
    if (a === 'exit') {
      const e = nearestExit(L, P.pos.x, P.pos.z, 6);
      if (!e) { say('No exit known on this level.', 'warn'); return; }
      return go(e.x + TILE * 1.5, e.z + TILE * 1.5);
    }
    if (a === 'key') {
      const k = L.byType.key;
      if (!k) { say('This level has no key item.', 'warn'); return; }
      return go((k.tx + 0.5) * TILE, (k.tz + 0.5) * TILE);
    }
    if (args.length >= 2 && !isNaN(parseFloat(args[0]))) {
      const x = parseFloat(args[0]), z = parseFloat(args[args.length === 3 ? 2 : 1]);
      return go(x, z, args.length === 3 ? parseFloat(args[1]) : undefined);
    }
    if (a) {
      const pid = this.findPlayer(a);
      const r = pid && g.remotes.get(pid);
      const s = r?.buf[r.buf.length - 1]?.s;
      if (s && r.levelId === g.levelId) return go(s.x, s.z, s.y);
      say(pid ? 'That player is on another level.' : 'No such player.', 'warn');
      return;
    }
    say('Usage: tp <x> <z> | tp exit | tp key | tp <player>', 'warn');
  }

  allIds() { const g = this.game; return [...new Set([g.myId, ...g.roster.keys()])]; }

  findPlayer(q) {
    const g = this.game;
    const ids = this.allIds();
    const n = parseInt(q, 10);
    if (!isNaN(n) && ids[n - 1]) return ids[n - 1];
    const ql = q.toLowerCase();
    return ids.find(id => g.nameOf(id).toLowerCase() === ql) || ids.find(id => g.nameOf(id).toLowerCase().startsWith(ql)) || null;
  }

  hostCommand(cmd, args) {
    const g = this.game, say = (t, c) => this.print(t, c);
    const C = g.cheats;
    if (cmd === 'cheats') {
      const a = (args[0] || '').toLowerCase();
      if (a !== 'on' && a !== 'off') { say(`Cheats are ${C.on ? 'ON' : 'OFF'}. Usage: cheats on|off`, 'sys'); return; }
      C.on = a === 'on';
      g.hostSyncCheats(`The host turned cheats ${C.on ? 'ON' : 'OFF'}.`);
      say(`Cheats ${C.on ? 'ON' : 'OFF'} for this session.${C.on ? ' Use `grant <player>` to share them.' : ''}`, 'ok');
      return;
    }
    if (cmd === 'players') {
      this.allIds().forEach((id, i) => {
        const tag = id === g.myId ? 'host' : C.granted.has(id) ? 'granted' : '—';
        say(`${String(i + 1).padStart(2)}. ${g.nameOf(id).padEnd(22)} ${tag}`, 'sys');
      });
      return;
    }
    const target = (args[0] || '').toLowerCase();
    if (!target) { say(`Usage: ${cmd} <player|all>`, 'warn'); return; }
    const ids = target === 'all' ? this.allIds().filter(id => id !== g.myId) : [this.findPlayer(target)].filter(Boolean);
    if (!ids.length) { say('No such player. Try `players`.', 'warn'); return; }
    for (const id of ids) {
      if (id === g.myId) continue;
      if (cmd === 'grant') C.granted.add(id); else C.granted.delete(id);
    }
    if (cmd === 'grant' && !C.on) { C.on = true; say('Cheats turned ON for this session.', 'ok'); }
    const names = ids.filter(id => id !== g.myId).map(id => g.nameOf(id)).join(', ');
    g.hostSyncCheats(cmd === 'grant' ? `${names} can now use the cheat console.` : `${names} lost cheat access.`);
    say(`${cmd === 'grant' ? 'Granted' : 'Revoked'}: ${names || 'nobody'}.`, 'ok');
  }
}
