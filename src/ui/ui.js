// Screen manager and in-game modal UIs: loading, fade, title cards,
// inventory + containers (drag & drop), notes, journal, pause, death,
// spectate, victory and chat input.
import { HUD } from './hud.js';
import { ITEMS, iconInto } from '../game/items.js';
import { NOTES } from '../game/notes.js';
import { input } from '../core/input.js';
import { audio } from '../audio/audio.js';
import { HOTBAR } from '../game/inventory.js';
import { WEAPONS } from '../game/weapons.js';

const $ = id => document.getElementById(id);
const TIPS = [
  'Crouching makes no sound. Sprinting can be heard through walls.',
  'Almond water restores thirst and calms your nerves.',
  'Lockers hide you — unless something watched you climb in.',
  'Hounds made of bone will not cross fire.',
  'A focused flashlight beam on the skull stuns what walks in ink.',
  'Gurgling near the pools means: get out of the water.',
  'If a friend stands still at the end of a hall, look at it. Keep looking.',
  'Arrows on the walls were painted by people who went before you.',
  'Glowsticks are cheap light. Throw them ahead of you.',
  'The music box draws things that listen. Throw it far away.',
];

export class UI {
  constructor() {
    this.hud = new HUD();
    this.game = null;
    this.open = new Set();   // open modal names
    this.selSlot = -1;
    this.containerObj = null;
    this.onQuit = null;
    this.onSettings = null;
    this.onHelp = null;
    this.bindInventory();
    this.bindPause();
    this.bindChat();
    $('btnJournalDone').onclick = () => this.closeModal('journal');
    $('loadTip').textContent = TIPS[Math.floor(Math.random() * TIPS.length)];
  }

  get modalOpen() { return this.open.size > 0; }

  screen(id, on) { $(id).classList.toggle('show', on); }

  openModal(name) {
    this.open.add(name);
    this.screen(name, true);
    input.unlock();
    audio.play('ui', { freq: 520 });
  }
  closeModal(name, relock = true) {
    if (!this.open.has(name)) return;
    this.open.delete(name);
    this.screen(name, false);
    if (name === 'inventory') { this.containerObj = null; $('containerBox').classList.add('hidden'); }
    if (relock && !this.modalOpen && this.game && !this.game.dead) input.lock();
  }
  closeAll() { for (const n of [...this.open]) this.closeModal(n, false); }

  // ------------------------------------------------------------------ loading / transitions
  loading(on, title, sub) {
    this.screen('loading', on);
    if (title) $('loadTitle').textContent = title;
    if (sub) $('loadSub').textContent = sub;
    if (on) { $('loadFill').style.width = '0%'; $('loadTip').textContent = TIPS[Math.floor(Math.random() * TIPS.length)]; }
  }
  loadingProgress(p, text) { $('loadFill').style.width = Math.round(p * 100) + '%'; if (text) $('loadSub').textContent = text; }
  fade(on) { $('fade').classList.toggle('on', on); }
  titleCard(name, title, sub) {
    const el = $('titleCard');
    $('tcLevel').textContent = name.toUpperCase();
    $('tcName').textContent = title;
    $('tcSub').textContent = sub || '';
    el.classList.remove('hidden');
    el.style.animation = 'none'; void el.offsetWidth; el.style.animation = '';
    clearTimeout(this._tcT);
    this._tcT = setTimeout(() => el.classList.add('hidden'), 5600);
  }

  // ------------------------------------------------------------------ inventory
  bindInventory() {
    const grid = $('invGrid'), hot = $('invHotbar'), cont = $('containerGrid');
    this.invSlots = [];
    const mk = (parent, idx) => {
      const s = document.createElement('div');
      s.className = 'slot';
      s.innerHTML = `${idx < HOTBAR ? `<span class="key">${idx + 1}</span>` : ''}<div class="ic"></div><span class="qty"></span><div class="dur hidden"><div></div></div>`;
      s.draggable = true;
      s.dataset.idx = idx;
      s.addEventListener('click', e => this.slotClick(idx, e));
      s.addEventListener('contextmenu', e => { e.preventDefault(); this.useSlot(idx); });
      s.addEventListener('dragstart', e => { e.dataTransfer.setData('text/plain', 'inv:' + idx); });
      s.addEventListener('dragover', e => { e.preventDefault(); s.classList.add('drag-over'); });
      s.addEventListener('dragleave', () => s.classList.remove('drag-over'));
      s.addEventListener('drop', e => {
        e.preventDefault(); s.classList.remove('drag-over');
        const src = e.dataTransfer.getData('text/plain');
        if (src.startsWith('inv:')) { this.game.inventory.move(+src.slice(4), idx); this.selSlot = idx; this.renderInventory(); }
        else if (src.startsWith('cont:')) this.takeFromContainer(+src.slice(5));
      });
      parent.appendChild(s);
      this.invSlots[idx] = s;
    };
    for (let i = HOTBAR; i < HOTBAR + 20; i++) mk(grid, i);
    for (let i = 0; i < HOTBAR; i++) mk(hot, i);
    // dropping into the container panel
    cont.addEventListener('dragover', e => e.preventDefault());
    cont.addEventListener('drop', e => {
      e.preventDefault();
      const src = e.dataTransfer.getData('text/plain');
      if (src.startsWith('inv:')) this.putInContainer(+src.slice(4));
    });
    $('btnUseItem').onclick = () => this.useSlot(this.selSlot);
    $('btnDropItem').onclick = () => {
      const g = this.game;
      if (this.selSlot < 0 || !g) return;
      const it = g.inventory.takeFrom(this.selSlot, Infinity);
      if (this.containerObj) this.putItemInContainer(it);
      else g.dropItem(it);
      this.renderInventory();
    };
    $('btnSplitItem').onclick = () => { if (this.selSlot >= 0) { this.game.inventory.split(this.selSlot); this.renderInventory(); } };
    $('btnTakeAll').onclick = () => {
      const s = this.containerState();
      if (!s?.loot) return;
      for (let i = s.loot.length - 1; i >= 0; i--) if (this.game.inventory.canFit(s.loot[i].item, s.loot[i].qty)) this.takeFromContainer(i);
    };
  }

  toggleInventory(game) {
    if (this.open.has('inventory')) { this.closeModal('inventory'); return; }
    if (this.modalOpen) return;
    this.game = game;
    this.openModal('inventory');
    this.renderInventory();
  }

  openContainer(o, game) {
    this.game = game;
    this.containerObj = o;
    $('containerBox').classList.remove('hidden');
    $('containerTitle').textContent = o.ctype === 'cabinet' ? 'Filing cabinet' : o.ctype === 'crate' ? 'Crate' : o.ctype === 'toolbox' ? 'Toolbox' : 'Box';
    if (!this.open.has('inventory')) this.openModal('inventory');
    this.renderInventory();
  }

  containerState() { return this.containerObj && this.game ? this.game.world.get(this.game.levelId, this.containerObj.id) : null; }
  containerRefresh(id) { if (this.containerObj?.id === id && this.open.has('inventory')) this.renderInventory(); }

  takeFromContainer(i) {
    const s = this.containerState();
    const it = s?.loot?.[i];
    if (!it) return;
    if (!this.game.inventory.canFit(it.item, it.qty)) { this.game.subtitle('No room.', 1.2); return; }
    this.game.request({ t: 'int', l: this.game.levelId, id: this.containerObj.id, a: 'take', i });
  }
  putInContainer(idx) { const it = this.game.inventory.takeFrom(idx, Infinity); this.putItemInContainer(it); }
  putItemInContainer(it) {
    if (!it || !this.containerObj) return;
    this.game.request({ t: 'int', l: this.game.levelId, id: this.containerObj.id, a: 'put', item: it });
    this.renderInventory();
  }

  slotClick(idx, e) {
    const g = this.game;
    if (e.shiftKey) {
      // quick move: backpack <-> hotbar, or into an open container
      if (this.containerObj) { this.putInContainer(idx); return; }
      const inv = g.inventory;
      const target = idx < HOTBAR ? inv.slots.findIndex((s, i) => i >= HOTBAR && !s) : inv.slots.findIndex((s, i) => i < HOTBAR && !s);
      if (target >= 0) inv.move(idx, target);
      this.renderInventory();
      return;
    }
    if (this.selSlot >= 0 && this.selSlot !== idx && g.inventory.slots[this.selSlot] && e.altKey) { g.inventory.move(this.selSlot, idx); }
    this.selSlot = idx;
    if (idx < HOTBAR) g.inventory.select(idx);
    this.renderInventory();
  }

  useSlot(idx) {
    const g = this.game;
    const it = g?.inventory.slots[idx];
    if (!it) return;
    const def = ITEMS[it.id];
    if (def.type === 'consumable') {
      if (!g.held.canConsume(def)) { g.subtitle('You don\'t need that right now.', 1.2); return; }
      g.stats.applyEffects(def.effects);
      g.inventory.takeFrom(idx, 1);
      g.sfx(def.sound || 'pickup', null, {});
    } else if (def.type === 'battery') {
      const prev = g.inventory.selected;
      g.inventory.selected = idx; g.held.useBattery(); g.inventory.selected = prev;
    } else if (def.type === 'repair') {
      const prev = g.inventory.selected;
      g.inventory.selected = idx; g.held.useRepair(); g.inventory.selected = prev;
    } else {
      // equip: move into hotbar and select
      let target = idx;
      if (idx >= HOTBAR) { target = g.inventory.selected; g.inventory.move(idx, target); }
      g.inventory.select(target);
    }
    this.renderInventory();
  }

  renderInventory() {
    const g = this.game;
    if (!g) return;
    const inv = g.inventory;
    for (let i = 0; i < inv.slots.length; i++) {
      const el = this.invSlots[i];
      const s = inv.slots[i];
      el.classList.toggle('sel', i === this.selSlot);
      iconInto(el.querySelector('.ic'), s?.id, 48);
      el.querySelector('.qty').textContent = s && s.qty > 1 ? s.qty : '';
      const dur = el.querySelector('.dur');
      const v = s?.data?.dur ?? s?.data?.charge ?? s?.data?.fuel;
      dur.classList.toggle('hidden', v === undefined);
      if (v !== undefined) dur.firstChild.style.width = v + '%';
    }
    // detail
    const s = inv.slots[this.selSlot];
    const def = s ? ITEMS[s.id] : null;
    iconInto($('detailIcon'), s?.id, 64);
    $('detailName').textContent = def ? def.name + (s.qty > 1 ? ` ×${s.qty}` : '') : '—';
    let extra = '';
    if (def?.type === 'weapon') {
      const W = WEAPONS[def.weapon];
      extra = W.kind === 'gun' ? `\nLoaded: ${s.data.ammo}/${W.mag} · Reserve: ${inv.count(W.ammo)}` : `\nCondition: ${Math.round(s.data.dur)}%`;
    } else if (def?.type === 'flashlight') extra = `\nBattery: ${Math.round(s.data.charge)}%`;
    else if (def?.type === 'tool') extra = `\nFuel: ${Math.round(s.data.fuel)}%`;
    $('detailDesc').textContent = def ? def.desc + extra : 'Select an item.';
    $('btnUseItem').disabled = !def;
    $('btnUseItem').textContent = def && (def.type === 'consumable' || def.type === 'battery' || def.type === 'repair') ? 'Use' : 'Equip';
    $('btnDropItem').disabled = !def;
    $('btnDropItem').textContent = this.containerObj ? 'Store' : 'Drop';
    $('btnSplitItem').disabled = !def || s.qty < 2;
    // container
    if (this.containerObj) {
      const st = this.containerState();
      const loot = st?.loot ?? (st ? [] : this.containerObj.loot);
      const cg = $('containerGrid');
      cg.innerHTML = '';
      const n = Math.max(8, loot.length);
      for (let i = 0; i < n; i++) {
        const el = document.createElement('div');
        el.className = 'slot';
        el.innerHTML = '<div class="ic"></div><span class="qty"></span>';
        const it = loot[i];
        if (it) {
          iconInto(el.querySelector('.ic'), it.item, 48);
          el.querySelector('.qty').textContent = it.qty > 1 ? it.qty : '';
          el.title = ITEMS[it.item]?.name || it.item;
          el.draggable = true;
          el.addEventListener('dragstart', e => e.dataTransfer.setData('text/plain', 'cont:' + i));
          el.addEventListener('click', () => this.takeFromContainer(i));
        }
        cg.appendChild(el);
      }
      $('btnTakeAll').disabled = !loot.length;
    }
  }

  // ------------------------------------------------------------------ notes & journal
  showNote(n) {
    $('noteTitle').textContent = n.title;
    $('noteBody').textContent = n.body;
    this.openModal('note');
  }

  openJournal(game) {
    this.game = game;
    const list = $('journalList');
    list.innerHTML = '';
    const entries = game.journal;
    if (!entries.length) {
      list.innerHTML = '<li class="muted">Nothing yet. Read notes you find.</li>';
      $('journalEntry').textContent = '';
    }
    entries.forEach((id, i) => {
      const n = NOTES[id];
      const li = document.createElement('li');
      li.innerHTML = `<span class="lvl">${n.level}</span>${n.title}`;
      li.onclick = () => {
        list.querySelectorAll('li').forEach(x => x.classList.remove('on'));
        li.classList.add('on');
        $('journalEntry').innerHTML = `<div class="note-title">${n.title}</div><div class="note-body"></div>`;
        $('journalEntry').querySelector('.note-body').textContent = n.body;
      };
      list.appendChild(li);
      if (i === entries.length - 1) li.click();
    });
    this.closeModal('pause', false);
    this.openModal('journal');
  }

  // ------------------------------------------------------------------ pause
  bindPause() {
    $('btnResume').onclick = () => this.resume();
    $('btnPauseJournal').onclick = () => this.game && this.openJournal(this.game);
    $('btnPauseSettings').onclick = () => this.onSettings?.();
    $('btnPauseHelp').onclick = () => this.onHelp?.();
    $('btnQuit').onclick = () => this.onQuit?.();
  }
  pause(game) {
    this.game = game;
    if (!game.online) game.paused = true;
    $('pauseInfo').textContent = `${game.def?.name || ''} — ${game.def?.title || ''} · seed ${game.seedLabel || game.seed}${game.online ? ' · co-op continues while paused' : ''}`;
    this.openModal('pause');
  }
  resume() {
    this.closeModal('pause');
    if (this.game) this.game.paused = false;
  }

  // ------------------------------------------------------------------ chat
  bindChat() {
    const inp = $('chatInput');
    inp.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        const text = inp.value.trim();
        inp.value = '';
        if (text && this.game) this.game.request({ t: 'chat', text });
        this.closeChat();
        e.preventDefault();
      } else if (e.key === 'Escape') { this.closeChat(); e.preventDefault(); }
      e.stopPropagation();
    });
  }
  openChat(game) {
    this.game = game;
    if (!game.online) { game.subtitle('Chat is for co-op games.', 1.5); return; }
    this.open.add('chat');
    $('chat').classList.add('open');
    const inp = $('chatInput');
    inp.classList.remove('hidden');
    input.unlock();
    setTimeout(() => inp.focus(), 0);
  }
  closeChat() {
    this.open.delete('chat');
    $('chat').classList.remove('open');
    $('chatInput').classList.add('hidden');
    $('chatInput').blur();
    if (!this.modalOpen && this.game && !this.game.dead) input.lock();
  }

  hideOverlay(on) { $('hideOverlay').classList.toggle('hidden', !on); }

  // ------------------------------------------------------------------ death / spectate / victory
  showDeath(cause, solo, game) {
    this.game = game;
    const lines = {
      hush: 'It found you by the sound of your heart.', hound: 'The hounds picked you clean.', ink: 'The Inkwalker never stops. You did.',
      tide: 'The water was deeper than it looked.', goaner: 'The Goaner bleats in triumph.', thirst: 'You dried out like the carpet.',
      hunger: 'You starved in the endless rooms.', bleed: 'You bled out on the floor.', drown: 'You ran out of air.', fall: 'The fall was too far.',
      'bled out': 'Nobody reached you in time.', lookalike: 'It wore your face as it ended you.',
    };
    $('deathText').textContent = lines[cause] || 'The Goanrooms keep what they take.';
    $('btnRespawn').classList.toggle('hidden', !solo);
    $('btnSpectate').classList.toggle('hidden', solo);
    $('btnRespawn').onclick = () => game.respawn();
    $('btnSpectate').onclick = () => game.startSpectate();
    $('btnDeathQuit').onclick = () => this.onQuit?.();
    this.closeAll();
    this.screen('death', true);
    input.unlock();
  }
  hideDeath() { this.screen('death', false); if (!this.modalOpen) input.lock(); }
  spectate(on) { $('spectate').classList.toggle('hidden', !on); if (on) input.lock(); }
  spectateName(n) { $('specName').textContent = n; }

  showVictory(st) {
    this.closeAll();
    $('victoryStats').innerHTML = Object.entries(st).map(([k, v]) => `<div><b>${v}</b>${k}</div>`).join('');
    this.screen('victory', true);
    input.unlock();
    $('btnVictoryMenu').onclick = () => this.onQuit?.(true);
  }

  disconnected(msg) {
    this.closeAll();
    $('deathTitle').textContent = 'DISCONNECTED';
    $('deathText').textContent = msg;
    $('btnRespawn').classList.add('hidden');
    $('btnSpectate').classList.add('hidden');
    $('btnDeathQuit').onclick = () => { $('deathTitle').textContent = 'YOU WERE LOST'; this.onQuit?.(); };
    this.screen('death', true);
    input.unlock();
  }

  resetGameScreens() {
    for (const id of ['death', 'victory', 'pause', 'inventory', 'note', 'journal']) this.screen(id, false);
    this.open.clear();
    $('spectate').classList.add('hidden');
    $('hideOverlay').classList.add('hidden');
    $('titleCard').classList.add('hidden');
    $('chatLog').innerHTML = '';
    $('teamList').innerHTML = '';
    document.querySelectorAll('.nameplate').forEach(n => n.remove());
  }
}
