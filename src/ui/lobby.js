// Co-op lobby: hosting / joining rooms, player list with ready states,
// seed & difficulty settings, lobby chat, and starting the game together.
import { Session, makeRoomCode } from '../net/session.js';
import { settings } from '../core/settings.js';
import { normalizeSkin } from '../game/avatar.js';
import { escapeHtml } from '../game/remote.js';
import { audio } from '../audio/audio.js';

const $ = id => document.getElementById(id);

export function randomSeedWord() {
  const a = ['YELLOW', 'DAMP', 'HUMMING', 'ENDLESS', 'QUIET', 'ROTTEN', 'HOLLOW', 'BRASS', 'ALMOND', 'STATIC', 'DEEP', 'PALE'];
  const b = ['CARPET', 'HALLWAY', 'BRIDGE', 'POOL', 'OFFICE', 'TUNNEL', 'LIGHT', 'DOOR', 'ECHO', 'WALL', 'STAIR', 'DRAIN'];
  return a[Math.floor(Math.random() * a.length)] + '-' + b[Math.floor(Math.random() * b.length)] + '-' + Math.floor(Math.random() * 900 + 100);
}

export class Lobby {
  constructor(app) {
    this.app = app;
    this.session = null;
    this.players = new Map(); // id -> {name, skin, ready, host}
    this.active = false;
    this.started = false;
    $('btnCopyCode').onclick = () => { navigator.clipboard?.writeText($('roomCode').textContent).catch(() => {}); this.status('Code copied.'); };
    $('btnDoJoin').onclick = () => this.join();
    $('joinCodeInput').addEventListener('keydown', e => { if (e.key === 'Enter') this.join(); e.stopPropagation(); });
    $('btnRandSeed').onclick = () => { $('seedInput').value = randomSeedWord(); this.pushState(); };
    $('seedInput').onchange = () => this.pushState();
    $('difficultySel').onchange = () => this.pushState();
    $('friendlyFire').onchange = () => this.pushState();
    $('prologueToggle').onchange = () => this.pushState();
    $('btnReady').onclick = () => this.toggleReady();
    $('btnStart').onclick = () => this.start();
    $('btnLobbyLeave').onclick = () => this.leave();
    $('lobbyChatInput').addEventListener('keydown', e => {
      e.stopPropagation();
      if (e.key !== 'Enter') return;
      const text = e.target.value.trim(); e.target.value = '';
      if (!text) return;
      if (this.isHost) this.onChat(this.session.myId, text); else this.session.sendToHost({ t: 'lchat', text });
    });
    $('netMode').onchange = () => settings.set('netMode', $('netMode').value);
  }

  get isHost() { return this.session?.role === 'host'; }
  status(t) { $('lobbyStatus').textContent = t; }
  profile() { return { name: (settings.get('playerName') || 'Wanderer').slice(0, 18), skin: normalizeSkin(settings.get('skin')) }; }

  openHost() {
    this.reset();
    this.active = true;
    $('lobbyTitle').textContent = 'Host a Room';
    $('joinField').classList.add('hidden');
    document.querySelectorAll('.host-only').forEach(e => e.classList.remove('hidden'));
    $('seedInput').value = settings.get('lastSeed') || randomSeedWord();
    $('netMode').value = settings.get('netMode') || 'peer';
    $('netMode').disabled = false;
    $('roomCode').textContent = '-----';
    this.app.showScreen('lobby');
    this.status('Choose a connection, then create the room.');
    $('btnStart').textContent = 'Create Room';
    $('btnReady').classList.add('hidden');
  }

  openJoin() {
    this.reset();
    this.active = true;
    $('lobbyTitle').textContent = 'Join a Room';
    $('joinField').classList.remove('hidden');
    document.querySelectorAll('.host-only').forEach(e => e.classList.add('hidden'));
    $('netMode').value = settings.get('netMode') || 'peer';
    $('netMode').disabled = false;
    $('roomCode').textContent = '-----';
    $('btnReady').classList.add('hidden');
    this.app.showScreen('lobby');
    this.status('Enter the host\'s room code.');
    setTimeout(() => $('joinCodeInput').focus(), 50);
  }

  reset() {
    this.session?.close();
    this.session = null;
    this.players.clear();
    this.started = false;
    $('lobbyPlayers').innerHTML = '';
    $('lobbyChatLog').innerHTML = '';
    $('btnStart').textContent = 'Start Game';
  }

  async createRoom() {
    const s = new Session();
    const mode = $('netMode').value;
    this.status(mode === 'peer' ? 'Contacting the signalling server…' : 'Opening local channel…');
    try {
      const code = await s.host(mode, makeRoomCode());
      this.session = s;
      $('roomCode').textContent = code;
      $('netMode').disabled = true;
      this.players.set(s.myId, { ...this.profile(), ready: true, host: true });
      s.on('message', (from, m) => this.onMessage(from, m));
      s.on('peer-leave', id => this.onPeerLeave(id));
      $('btnStart').textContent = 'Start Game';
      $('btnReady').classList.add('hidden');
      this.status(`Room ready. Share the code ${code}.` + (mode === 'local' ? '\nLocal mode: open this page in another tab of this browser and join with the code.' : ''));
      this.render();
    } catch (err) {
      this.status('Could not create room: ' + err.message + '\nTip: use "Local tabs" mode to test without internet.');
      s.close();
    }
  }

  async join() {
    const code = $('joinCodeInput').value.trim().toUpperCase();
    if (code.length < 4) { this.status('Room codes are 5 characters.'); return; }
    audio.init();
    const s = new Session();
    this.status('Connecting…');
    try {
      await s.join(code, $('netMode').value);
      this.session = s;
      $('roomCode').textContent = code;
      $('joinField').classList.add('hidden');
      $('netMode').disabled = true;
      $('btnReady').classList.remove('hidden');
      s.on('message', (from, m) => this.onMessage(from, m));
      s.on('disconnected', () => this.onDisconnected());
      s.sendToHost({ t: 'hello', ...this.profile() });
      this.status('Connected. Waiting for the host…');
    } catch (err) {
      this.status('Could not join: ' + err.message);
      s.close();
    }
  }

  onDisconnected() {
    if (this.app.game) { this.app.ui.disconnected('Lost connection to the host.'); return; }
    this.status('Disconnected from host.');
    this.reset();
  }

  onPeerLeave(id) {
    if (this.app.game) { this.app.game.hostPeerLeft(id); this.players.delete(id); return; }
    const p = this.players.get(id);
    this.players.delete(id);
    if (p) this.chatLine(null, `${p.name} left.`);
    this.pushState();
  }

  onMessage(from, m) {
    // once a game is running, it handles everything except lobby chat
    if (this.app.game) { this.app.game.onNet(from, m); return; }
    if (this.isHost) {
      if (m.t === 'hello') {
        this.players.set(from, { name: String(m.name || 'Wanderer').slice(0, 18), skin: normalizeSkin(m.skin), ready: false });
        this.chatLine(null, `${m.name} joined.`);
        audio.play('ui', { freq: 880 });
        this.pushState();
      } else if (m.t === 'ready') {
        const p = this.players.get(from);
        if (p) { p.ready = !!m.v; this.pushState(); }
      } else if (m.t === 'lchat') this.onChat(from, m.text);
      else if (m.t === 'skin') { const p = this.players.get(from); if (p) { p.skin = normalizeSkin(m.skin); this.pushState(); } }
    } else {
      if (m.t === 'lobby') {
        this.players = new Map(m.players.map(p => [p.id, p]));
        $('seedInput').value = m.seed;
        this.status(`Seed: ${m.seed} · Difficulty: ${m.difficulty}${m.friendlyFire ? ' · friendly fire' : ''}${m.prologue ? ' · prologue' : ''}\nWaiting for the host to start.`);
        this.render();
      } else if (m.t === 'lchat') this.chatLine(m.name, m.text, m.color);
      else if (m.t === 'start') this.app.startCoop(this.session, m, false);
      else if (m.t === 'welcome') this.app.startCoop(this.session, m, true); // late join
      else if (m.t === 'hostLeft' || m.t === 'kicked') { this.status('The host closed the room.'); this.reset(); }
    }
  }

  onChat(from, text) {
    const p = this.players.get(from);
    const msg = { t: 'lchat', name: p?.name || '?', text: String(text).slice(0, 160), color: p?.skin?.shirtColor };
    this.chatLine(msg.name, msg.text, msg.color);
    this.session.broadcast(msg);
  }

  chatLine(name, text, color) {
    const log = $('lobbyChatLog');
    const d = document.createElement('div');
    d.className = 'msg' + (name ? '' : ' sys');
    d.innerHTML = name ? `<span class="who" style="color:${color || '#e3c65a'}">${escapeHtml(name)}</span>${escapeHtml(text)}` : escapeHtml(text);
    log.appendChild(d);
    log.scrollTop = log.scrollHeight;
  }

  toggleReady() {
    if (!this.session || this.isHost) return;
    const me = this.players.get(this.session.myId);
    const v = !(me?.ready);
    this.session.sendToHost({ t: 'ready', v });
    $('btnReady').textContent = v ? 'Not ready' : 'Ready';
  }

  pushState() {
    if (!this.isHost) return;
    const state = {
      t: 'lobby', players: [...this.players.entries()].map(([id, p]) => ({ id, ...p })),
      seed: $('seedInput').value || 'GOANROOMS', difficulty: $('difficultySel').value, friendlyFire: $('friendlyFire').checked, prologue: $('prologueToggle').checked,
    };
    this.session.broadcast(state);
    this.render();
  }

  render() {
    const ul = $('lobbyPlayers');
    ul.innerHTML = '';
    for (const [id, p] of this.players) {
      const li = document.createElement('li');
      li.innerHTML = `<span class="pcol" style="background:${p.skin?.shirtColor || '#888'}"></span>${escapeHtml(p.name)}${p.host ? ' <span class="tag">HOST</span>' : ''}${id === this.session?.myId ? ' <span class="tag">YOU</span>' : ''}<span class="ready ${p.ready ? 'on' : ''}">${p.ready ? 'READY' : 'not ready'}</span>`;
      ul.appendChild(li);
    }
  }

  start() {
    if (!this.session) { this.createRoom(); return; }
    if (!this.isHost) return;
    const notReady = [...this.players.values()].filter(p => !p.ready).length;
    if (notReady && !this._confirmStart) { this._confirmStart = true; this.status(`${notReady} player(s) not ready. Press Start again to begin anyway.`); return; }
    this._confirmStart = false;
    settings.set('lastSeed', $('seedInput').value);
    const m = {
      t: 'start', seed: $('seedInput').value || 'GOANROOMS', difficulty: $('difficultySel').value, friendlyFire: $('friendlyFire').checked, prologue: $('prologueToggle').checked,
      roster: [...this.players.entries()].map(([id, p]) => [id, { name: p.name, skin: p.skin }]),
    };
    this.session.broadcast(m);
    this.app.startCoop(this.session, m, false);
  }

  leave() {
    this.reset();
    this.active = false;
    this.app.showScreen('menu');
  }
}
