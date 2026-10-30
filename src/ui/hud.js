// In-game HUD: vitals, hotbar, held item info, prompts, subtitles, damage
// indicators, boss bar, chat log, team list and objective.
import { ITEMS, iconInto } from '../game/items.js';
import { WEAPONS } from '../game/weapons.js';
import { settings } from '../core/settings.js';
import { escapeHtml } from '../game/remote.js';

const $ = id => document.getElementById(id);

export class HUD {
  constructor() {
    this.el = $('hud');
    this.hp = $('hpFill'); this.hpLag = $('hpLag'); this.st = $('stFill'); this.o2 = $('o2Fill'); this.o2Row = $('o2Row');
    this.bat = $('batFill'); this.lightInfo = $('lightInfo');
    this.gauges = { thirst: $('gThirst'), hunger: $('gHunger'), sanity: $('gSanity') };
    this.hotbar = $('hotbar');
    this.heldName = $('heldName'); this.heldAmmo = $('heldAmmo');
    this.promptEl = $('prompt');
    this.subs = $('subtitles');
    this.cross = $('crosshair');
    this.hitEl = $('hitmarker');
    this.ring = $('progressRing'); this.arc = $('progressArc'); this.ringLabel = $('progressLabel');
    this.chatLog = $('chatLog'); this.chatEl = $('chat'); this.chatInput = $('chatInput');
    this.team = $('teamList');
    this.dmgDirs = $('damageDirs');
    this.fps = $('fpsMeter');
    this.toastEl = $('toast');
    this.obj = $('objective'); this.objLevel = $('hudLevel'); this.objText = $('hudObjective');
    this.bossBar = $('bossBar'); this.bossFill = $('bossFill'); this.bossLag = $('bossFillLag'); this.bossName = $('bossName'); this.bossPhase = $('bossPhase');
    this.slots = [];
    for (let i = 0; i < 8; i++) {
      const s = document.createElement('div');
      s.className = 'slot' + (i >= 6 ? ' holster off' : '');
      s.innerHTML = `<span class="key">${i + 1}</span><div class="ic"></div><span class="qty"></span><div class="dur hidden"><div></div></div>`;
      this.hotbar.appendChild(s);
      this.slots.push(s);
    }
    this.lastHp = 100;
    this.objT = 0;
    this.teamT = 0;
    this.lastPromptHtml = '';
    this.subList = [];
  }

  show(on) { this.el.classList.toggle('hidden', !on); this.chatEl.classList.toggle('hidden', !on); }

  setObjective(def, game) {
    this.objLevel.textContent = `${def.name} — ${def.title}`;
    this.objText.textContent = def.objectiveText ? def.objectiveText(game) : def.objective;
    this.obj.classList.remove('faded');
    this.objT = 14;
  }
  refreshObjective(game) {
    const def = game.def;
    if (!def) return;
    const txt = def.objectiveText ? def.objectiveText(game) : def.objective;
    if (txt !== this.objText.textContent) { this.objText.textContent = txt; this.obj.classList.remove('faded'); this.objT = 10; }
  }

  inventoryChanged(game) {
    const inv = game.inventory;
    const hs = inv.hotbarSlots;
    for (let p = 0; p < this.slots.length; p++) {
      const el = this.slots[p];
      if (p >= 6) el.classList.toggle('off', p >= hs.length);
      if (p >= hs.length) continue;
      const i = hs[p];
      const s = inv.slots[i];
      el.classList.toggle('sel', i === inv.selected);
      const key = s ? s.id + ':' + s.qty + ':' + Math.round(s.data?.dur ?? s.data?.charge ?? s.data?.fuel ?? -1) : '';
      if (el.dataset.key === key) continue;
      el.dataset.key = key;
      iconInto(el.querySelector('.ic'), s?.id, 44);
      el.querySelector('.qty').textContent = s && s.qty > 1 ? s.qty : '';
      const dur = el.querySelector('.dur');
      const v = s?.data?.dur ?? s?.data?.charge ?? s?.data?.fuel;
      dur.classList.toggle('hidden', v === undefined);
      if (v !== undefined) { dur.firstChild.style.width = v + '%'; dur.firstChild.style.background = v < 25 ? '#d9473b' : v < 50 ? '#e3c65a' : '#9bd46b'; }
    }
    this.updateHeld(game);
  }

  updateHeld(game) {
    const it = game.inventory.held;
    if (!it) { this.heldName.textContent = ''; this.heldAmmo.innerHTML = ''; return; }
    const def = ITEMS[it.id];
    this.heldName.textContent = def.name;
    if (def.type === 'weapon') {
      const W = WEAPONS[def.weapon];
      if (W.kind === 'gun') this.heldAmmo.innerHTML = `${it.data.ammo}<small> / ${game.inventory.count(W.ammo)}</small>`;
      else this.heldAmmo.innerHTML = `<small>${Math.round(it.data.dur)}%</small>`;
    } else if (it.qty > 1) this.heldAmmo.innerHTML = `<small>×${it.qty}</small>`;
    else if (def.type === 'tool') this.heldAmmo.innerHTML = `<small>fuel ${Math.round(it.data.fuel)}%</small>`;
    else if (def.type === 'transmitter') this.heldAmmo.innerHTML = `<small>${it.data.on ? 'ON' : 'off'} · ${Math.round(it.data.charge)}%</small>`;
    else this.heldAmmo.innerHTML = '';
  }

  armorChanged(game) {
    const a = game.armor;
    $('armorRow').classList.toggle('hidden', !a);
    if (a) $('armorFill').style.width = Math.max(0, a.data.dur) + '%';
  }

  // timed status effects (Pale Draught, Vigor Tonic...)
  updateStatus(game) {
    const st = game.stats.status;
    const keys = Object.keys(st);
    const sig = keys.map(k => k + Math.ceil(st[k])).join();
    if (sig === this._stSig) return;
    this._stSig = sig;
    const el = $('statusFx');
    const META = { inkward: ['Inkward', '#e8e4dc', 'Inkwalkers ignore you'], vigor: ['Vigor', '#62e0b8', 'Stamina drains 3× slower'] };
    el.innerHTML = keys.map(k => {
      const m = META[k] || [k, '#fff', ''];
      const t = Math.ceil(st[k]), mm = Math.floor(t / 60), ss = String(t % 60).padStart(2, '0');
      return `<div class="status-chip" title="${m[2]}"><span class="dot" style="background:${m[1]}"></span>${m[0]} <b>${mm}:${ss}</b></div>`;
    }).join('');
  }

  prompt(html, sub) {
    const full = html ? html + (sub ? `<span class="sub">${sub}</span>` : '') : '';
    if (full !== this.lastPromptHtml) { this.promptEl.innerHTML = full; this.lastPromptHtml = full; }
    this.cross.classList.toggle('interact', !!html);
  }

  progress(f, label) {
    if (f < 0) { this.ring.classList.add('hidden'); return; }
    this.ring.classList.remove('hidden');
    this.arc.style.strokeDashoffset = String(100.5 * (1 - Math.min(1, f)));
    this.ringLabel.textContent = label || '';
  }

  subtitle(text, dur = 2.5, cls = '') {
    // de-duplicate identical recent lines
    if (this.subList.some(s => s.text === text && s.t > 0.3)) return;
    const el = document.createElement('div');
    el.className = 'sub ' + cls;
    el.textContent = text;
    this.subs.appendChild(el);
    this.subList.push({ el, t: dur, text });
    while (this.subList.length > 3) { const s = this.subList.shift(); s.el.remove(); }
  }

  toast(text, dur = 2) {
    this.toastEl.textContent = text;
    this.toastEl.classList.add('show');
    clearTimeout(this._toastT);
    this._toastT = setTimeout(() => this.toastEl.classList.remove('show'), dur * 1000);
  }

  pickupToast(name, qty) { this.subtitle(`+ ${name}${qty > 1 ? ' ×' + qty : ''}`, 1.6); }

  hitmarker(kill) {
    this.hitEl.classList.remove('show', 'kill');
    void this.hitEl.offsetWidth;
    this.hitEl.classList.add('show');
    if (kill) this.hitEl.classList.add('kill');
    clearTimeout(this._hitT);
    this._hitT = setTimeout(() => this.hitEl.classList.remove('show'), 90);
  }

  damageFlash(a) {
    const u = this._post?.u;
    if (u) u.damage.value = Math.min(1, u.damage.value + a);
  }

  damageDir(angle) {
    const el = document.createElement('div');
    el.className = 'dmg-dir';
    el.style.transform = `rotate(${-angle}rad)`;
    this.dmgDirs.appendChild(el);
    setTimeout(() => el.remove(), 1200);
  }

  chat(name, text, color) {
    const el = document.createElement('div');
    el.className = 'msg' + (name ? '' : ' sys');
    el.innerHTML = name ? `<span class="who" style="color:${color || '#e3c65a'}">${escapeHtml(name)}</span>${escapeHtml(text)}` : escapeHtml(text);
    this.chatLog.appendChild(el);
    while (this.chatLog.children.length > 40) this.chatLog.firstChild.remove();
    setTimeout(() => el.classList.add('old'), 9000);
  }

  setBoss(b) {
    if (!b) { this.bossBar.classList.add('hidden'); return; }
    this.bossBar.classList.remove('hidden');
    this.bossName.textContent = b.name || 'THE GOANER';
    const f = Math.max(0, b.hp);
    this.bossFill.style.transform = `scaleX(${f})`;
    this.bossLag.style.transform = `scaleX(${f})`;
    this.bossPhase.textContent = b.phase || '';
  }

  update(game, dt) {
    const s = game.stats;
    this._post = game.engine.post;
    this.updateStatus(game);
    game.updateTransmitterHud?.(dt);
    // vitals
    this.hp.style.transform = `scaleX(${s.health / 100})`;
    this.hpLag.style.transform = `scaleX(${s.health / 100})`;
    this.hp.parentElement.classList.toggle('low', s.health < 25);
    this.st.style.transform = `scaleX(${s.stamina / 100})`;
    this.st.style.opacity = s.exhausted ? '0.35' : '0.85';
    const under = game.player.underwater || s.oxygen < 99;
    this.o2Row.classList.toggle('hidden', !under);
    if (under) this.o2.style.transform = `scaleX(${s.oxygen / 100})`;
    const g = (el, v) => {
      el.querySelector('.fg').style.strokeDashoffset = String(94.2 * (1 - v / 100));
      el.classList.toggle('low', v < 20);
    };
    g(this.gauges.thirst, s.thirst); g(this.gauges.hunger, s.hunger); g(this.gauges.sanity, s.sanity);
    // flashlight battery
    const fl = game.lights?.item;
    this.lightInfo.classList.toggle('hidden', !fl);
    if (fl) { this.bat.style.transform = `scaleX(${fl.data.charge / 100})`; this.bat.parentElement.classList.toggle('low', fl.data.charge < 15); this.lightInfo.style.opacity = game.lights.on ? '1' : '0.45'; }
    this.cross.classList.toggle('aim', !!game.held?.ads);
    // subtitles
    for (let i = this.subList.length - 1; i >= 0; i--) {
      const sb = this.subList[i];
      sb.t -= dt;
      if (sb.t < 0.6) sb.el.style.opacity = String(Math.max(0, sb.t / 0.6));
      if (sb.t <= 0) { sb.el.remove(); this.subList.splice(i, 1); }
    }
    // objective fades after a while
    if (this.objT > 0) { this.objT -= dt; if (this.objT <= 0) this.obj.classList.add('faded'); }
    if (Math.random() < dt * 2) this.refreshObjective(game);
    // held info refresh (ammo changes)
    if (Math.random() < dt * 8) this.updateHeld(game);
    // boss
    this.setBoss(game.boss && game.boss.active ? game.boss : null);
    // team list
    this.teamT -= dt;
    if (this.teamT <= 0) { this.teamT = 0.5; this.updateTeam(game); }
    // fps
    if (settings.get('showFps')) {
      this.fps.classList.remove('hidden');
      const info = game.engine.renderer.info;
      this.fps.textContent = `${game.engine.fps.toFixed(0)} fps · ${game.engine.stats.calls} calls · ${(game.engine.stats.tris / 1000).toFixed(0)}k tris · ${game.renderer.meshes.size} chunks`;
    } else this.fps.classList.add('hidden');
  }

  updateTeam(game) {
    if (!game.online) { this.team.innerHTML = ''; return; }
    let html = '';
    for (const r of game.remotes.values()) {
      const s = r.buf[r.buf.length - 1]?.s;
      if (!s) continue;
      const other = s.lvl !== game.levelId;
      const cls = 'tm' + (s.dn ? ' down' : '') + (other ? ' other' : '');
      const status = s.dd ? '✝' : s.dn ? 'DOWN' : other ? (s.lvl || '').replace('L', 'Lvl ') : '';
      html += `<div class="${cls}"><span style="color:${r.skin?.shirtColor}">●</span>${escapeHtml(r.name)} <small>${status}</small><div class="hb"><div style="width:${Math.max(0, s.hp ?? 100)}%"></div></div></div>`;
    }
    this.team.innerHTML = html;
  }
}
