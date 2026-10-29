// Networking session. One host, N clients, star topology over WebRTC data
// channels (PeerJS for signalling) or BroadcastChannel for same-browser tabs.
// Solo play uses role 'solo' with no transport; game code treats the local
// player as the host so every system runs through the same paths.
import { Emitter } from '../core/events.js';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function makeRoomCode(n = 5) {
  let s = '';
  for (let i = 0; i < n; i++) s += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  return s;
}
const PREFIX = 'etg2-room-';

let peerJsPromise = null;
function loadPeerJS() {
  if (window.Peer) return Promise.resolve(window.Peer);
  if (!peerJsPromise) {
    peerJsPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = new URL('../../vendor/peerjs/peerjs.min.js', import.meta.url).href;
      s.onload = () => (window.Peer ? resolve(window.Peer) : reject(new Error('PeerJS failed to initialise')));
      s.onerror = () => reject(new Error('Could not load PeerJS'));
      document.head.appendChild(s);
    });
  }
  return peerJsPromise;
}

// ---------------------------------------------------------------------------
// Connection wrappers expose: id, send(obj), close(), and events message/close.

class PeerConn extends Emitter {
  constructor(dc) {
    super();
    this.dc = dc;
    this.id = dc.peer;
    dc.on('data', d => this.emit('message', d));
    dc.on('close', () => this.emit('close'));
    dc.on('error', () => this.emit('close'));
  }
  send(o) { try { if (this.dc.open) this.dc.send(o); } catch { /* ignore */ } }
  close() { try { this.dc.close(); } catch { /* ignore */ } }
}

class LocalConn extends Emitter {
  constructor(channel, myId, remoteId) {
    super();
    this.ch = channel; this.myId = myId; this.id = remoteId;
  }
  send(o) { this.ch.postMessage({ k: 'data', from: this.myId, to: this.id, d: o }); }
  close() { this.ch.postMessage({ k: 'bye', from: this.myId, to: this.id }); this.emit('close'); }
}

export class Session extends Emitter {
  constructor() {
    super();
    this.role = 'solo';
    this.myId = 'local';
    this.hostId = 'local';
    this.peers = new Map();   // host: id -> conn
    this.hostConn = null;     // client: conn to host
    this.code = '';
    this.mode = 'peer';
    this.peer = null;
    this.channel = null;
    this.stats = { sent: 0, recv: 0 };
  }

  get isHost() { return this.role !== 'client'; }
  get online() { return this.role !== 'solo'; }

  // -------------------------------------------------------------- hosting
  async host(mode = 'peer', code = makeRoomCode()) {
    this.mode = mode;
    this.code = code;
    if (mode === 'local') {
      this.myId = 'h-' + Math.random().toString(36).slice(2, 8);
      this.hostId = this.myId;
      this.channel = new BroadcastChannel(PREFIX + code);
      this.channel.onmessage = e => this._localHostMsg(e.data);
      this.role = 'host';
      return code;
    }
    const Peer = await loadPeerJS();
    return new Promise((resolve, reject) => {
      const peer = new Peer(PREFIX + code, { debug: 1 });
      this.peer = peer;
      let opened = false;
      peer.on('open', id => {
        opened = true;
        this.myId = id; this.hostId = id; this.role = 'host';
        resolve(code);
      });
      peer.on('connection', dc => {
        dc.on('open', () => this._addPeer(new PeerConn(dc)));
      });
      peer.on('disconnected', () => { try { peer.reconnect(); } catch { /* ignore */ } });
      peer.on('error', err => {
        if (!opened) {
          if (err.type === 'unavailable-id') reject(new Error('Room code already in use — try again.'));
          else reject(new Error('Could not reach the signalling server (' + (err.type || err.message) + ').'));
        } else this.emit('warn', String(err.type || err));
      });
    });
  }

  _addPeer(conn) {
    this.peers.set(conn.id, conn);
    conn.on('message', m => { this.stats.recv++; this.emit('message', conn.id, m); });
    conn.on('close', () => {
      if (!this.peers.has(conn.id)) return;
      this.peers.delete(conn.id);
      this.emit('peer-leave', conn.id);
    });
    this.emit('peer-join', conn.id);
  }

  _localHostMsg(m) {
    if (!m || (m.to && m.to !== this.myId)) return;
    if (m.k === 'hello') {
      if (this.peers.has(m.from)) return;
      const conn = new LocalConn(this.channel, this.myId, m.from);
      this.channel.postMessage({ k: 'welcome', from: this.myId, to: m.from });
      this._addPeer(conn);
    } else if (m.k === 'data') {
      const c = this.peers.get(m.from);
      if (c) c.emit('message', m.d);
    } else if (m.k === 'bye') {
      const c = this.peers.get(m.from);
      if (c) c.emit('close');
    }
  }

  // -------------------------------------------------------------- joining
  async join(code, mode = 'peer') {
    this.mode = mode;
    this.code = code.toUpperCase().trim();
    if (mode === 'local') {
      this.myId = 'c-' + Math.random().toString(36).slice(2, 8);
      this.channel = new BroadcastChannel(PREFIX + this.code);
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('No host found for that code in this browser.')), 3000);
        this.channel.onmessage = e => {
          const m = e.data;
          if (!m || m.to !== this.myId) return;
          if (m.k === 'welcome') {
            clearTimeout(timer);
            this.hostId = m.from;
            this.role = 'client';
            const conn = new LocalConn(this.channel, this.myId, m.from);
            this._setHost(conn);
            resolve();
          } else if (m.k === 'data' && this.hostConn) this.hostConn.emit('message', m.d);
          else if (m.k === 'bye' && this.hostConn) this.hostConn.emit('close');
        };
        this.channel.postMessage({ k: 'hello', from: this.myId });
      });
    }
    const Peer = await loadPeerJS();
    return new Promise((resolve, reject) => {
      const peer = new Peer({ debug: 1 });
      this.peer = peer;
      const timer = setTimeout(() => reject(new Error('Timed out connecting. Check the code, or the host may be behind a strict NAT.')), 15000);
      peer.on('open', id => {
        this.myId = id;
        const dc = peer.connect(PREFIX + this.code, { reliable: true, serialization: 'json' });
        dc.on('open', () => {
          clearTimeout(timer);
          this.role = 'client';
          this.hostId = dc.peer;
          this._setHost(new PeerConn(dc));
          resolve();
        });
        dc.on('error', () => { clearTimeout(timer); reject(new Error('Connection failed.')); });
      });
      peer.on('error', err => {
        clearTimeout(timer);
        if (err.type === 'peer-unavailable') reject(new Error('No room with that code.'));
        else reject(new Error('Network error: ' + (err.type || err.message)));
      });
    });
  }

  _setHost(conn) {
    this.hostConn = conn;
    conn.on('message', m => { this.stats.recv++; this.emit('message', this.hostId, m); });
    conn.on('close', () => { this.emit('disconnected'); });
  }

  // -------------------------------------------------------------- sending
  sendToHost(msg) {
    if (this.role === 'client' && this.hostConn) { this.stats.sent++; this.hostConn.send(msg); }
  }
  sendTo(id, msg) {
    const c = this.peers.get(id);
    if (c) { this.stats.sent++; c.send(msg); }
  }
  broadcast(msg, except) {
    for (const [id, c] of this.peers) if (id !== except) { this.stats.sent++; c.send(msg); }
  }
  kick(id) { const c = this.peers.get(id); if (c) { c.send({ t: 'kicked' }); setTimeout(() => c.close(), 200); } }

  close() {
    try {
      if (this.role === 'host') this.broadcast({ t: 'hostLeft' });
      for (const c of this.peers.values()) c.close();
      this.hostConn?.close();
      this.channel?.close();
      this.peer?.destroy();
    } catch { /* ignore */ }
    this.peers.clear();
    this.hostConn = null; this.channel = null; this.peer = null;
    this.role = 'solo'; this.myId = 'local'; this.hostId = 'local';
  }
}
