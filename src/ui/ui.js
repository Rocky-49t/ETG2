// Screen manager and in-game modal UIs: loading, fade, title cards,
// inventory + containers (drag & drop), notes, journal, pause, death,
// spectate, victory and chat input.
import { HUD } from './hud.js';
import { ITEMS, iconInto } from '../game/items.js';
import { NOTES } from '../game/notes.js';
import { input } from '../core/input.js';
import { audio } from '../audio/audio.js';
import { HOTBAR, HOLSTER0, HOLSTERS } from '../game/inventory.js';
import { WEAPONS } from '../game/weapons.js';
import { RECIPES, canCraft, craft } from '../game/crafting.js';
import { CLASSES, CLASS_ORDER } from '../game/classes.js';
import { ComputerUI, PhoneUI } from './computer.js';

const $ = id => document.getElementById(id);
const TIPS = [
  'Crouching makes no sound. Sprinting can be heard through walls.',
  'Water restores thirst and calms your nerves. Clean water works best; purify dirty water when you can.',
  'A GPS board, an antenna and a battery make a Location Transmitter. Open the inventory to craft.',
  'Lockers hide you — unless something watched you climb in.',
  'Hounds made of bone will not cross fire.',
  'A focused flashlight beam on the skull stuns what walks in ink.',
  'Gurgling near the pools means: get out of the water.',
  'If a friend stands still at the end of a hall, look at it. Keep looking.',
  'Arrows on the walls were painted by people who went before you.',
  'Glowsticks are cheap light. Throw them ahead of you.',
  'The music box draws things that listen. Throw it far away.',
  'Swimming into a pool edge? Hold jump to haul yourself out.',
  'Hold the flashlight on a Scuttler and it cannot move.',
  'Platinum snakes speed up every time a bullet hits them. Knives don\'t wind them up.',
  'Office vending machines sometimes stock a pale bottle. Inkwalkers ignore whoever drinks it.',
  'Some office computers are infected. They all want you to make a call.',
  'Toll locks on Level 4 hum their order, or list it on a plaque. Leaving the level re-seals them.',
  'Each role carries different gear. Scouts start with Location Transmitters.',
  'Dead? You wake up again on the same level — just farther from your team.',
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
    this.computer = new ComputerUI(this);
    this.phone = new PhoneUI(this);
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
    this.onClose?.[name]?.();
    if (relock && !this.modalOpen && this.game && !this.game.dead) input.lock();
  }
  closeAll() { for (const n of [...this.open]) this.closeModal(n, false); }

  // ------------------------------------------------------------------ loading / transitions
  loading(on, title, sub) {
    this.screen('loading', on);
    document.body.classList.toggle('is-loading', on);
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
      const key = idx < HOTBAR ? idx + 1 : idx >= HOLSTER0 ? HOTBAR + 1 + idx - HOLSTER0 : null;
      s.innerHTML = `${key ? `<span class="key">${key}</span>` : ''}<div class="ic"></div><span class="qty"></span><div class="dur hidden"><div></div></div>`;
      if (idx >= HOLSTER0) s.classList.add('holster', 'off');
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
        if (src.startsWith('inv:')) { if (this.game.inventory.move(+src.slice(4), idx)) this.selSlot = idx; else this.denyHolster(); this.renderInventory(); }
        else if (src.startsWith('cont:')) this.takeFromContainer(+src.slice(5));
      });
      parent.appendChild(s);
      this.invSlots[idx] = s;
    };
    for (let i = HOTBAR; i < HOTBAR + 20; i++) mk(grid, i);
    for (let i = 0; i < HOTBAR; i++) mk(hot, i);
    for (let i = HOLSTER0; i < HOLSTER0 + HOLSTERS; i++) mk(hot, i);
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
    $('containerTitle').textContent = { cabinet: 'Filing cabinet', crate: 'Crate', toolbox: 'Toolbox', backpack: 'Old backpack' }[o.ctype] || 'Box';
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

  denyHolster() { this.game?.subtitle('Holster slots only take guns.', 1.4); }

  slotClick(idx, e) {
    const g = this.game;
    const inv = g.inventory;
    if (e.shiftKey) {
      // quick move: into an open container, or hotbar <-> backpack
      if (this.containerObj) { this.putInContainer(idx); return; }
      const it = inv.slots[idx];
      if (!it) return;
      const target = inv.isHot(idx) ? inv.slots.findIndex((s, i) => i >= HOTBAR && i < HOLSTER0 && !s) : inv.freeHotSlot(it.id);
      if (target >= 0) inv.move(idx, target);
      this.selSlot = target >= 0 ? target : idx;
      this.renderInventory();
      return;
    }
    // click-to-move: with an item picked, clicking an empty slot moves it there
    // (clicking another item just selects that one instead)
    const picked = this.selSlot >= 0 && inv.slots[this.selSlot] && this.selSlot !== idx;
    if (picked && (!inv.slots[idx] || e.altKey)) {
      if (inv.move(this.selSlot, idx)) this.selSlot = idx;
      else this.denyHolster();
      if (inv.isHot(this.selSlot)) inv.selectSlot(this.selSlot);
      this.renderInventory();
      return;
    }
    this.selSlot = idx;
    if (inv.isHot(idx)) inv.selectSlot(idx);
    this.renderInventory();
  }

  useSlot(idx) {
    const g = this.game;
    const it = g?.inventory.slots[idx];
    if (!it) return;
    const def = ITEMS[it.id];
    const inv = g.inventory;
    const withSel = fn => { const prev = inv.selected; inv.selected = idx; fn(); inv.selected = prev; };
    if (def.type === 'consumable') {
      if (def.effects.revive && !g.downed) { g.subtitle('Save it for when you\'re down.', 1.4); return; }
      if (!g.held.canConsume(def)) { g.subtitle('You don\'t need that right now.', 1.2); return; }
      g.consumeNow(def, idx);
    } else if (def.type === 'battery') withSel(() => g.held.useBattery());
    else if (def.type === 'repair') withSel(() => g.held.useRepair());
    else if (def.type === 'armor') g.wearArmor(idx);
    else if (def.type === 'transmitter') g.toggleTransmitter(it);
    else if (def.type === 'part' || def.type === 'ammo' || def.type === 'key') g.subtitle(def.type === 'part' ? 'A crafting part — see the recipes on the right.' : def.type === 'ammo' ? 'Ammo loads when you reload.' : 'Use it at the right door.', 1.8);
    else {
      // equip: move into the hotbar and select
      let target = idx;
      if (!inv.isHot(idx)) {
        target = inv.freeHotSlot(it.id);
        if (target < 0) target = inv.canPlace(inv.selected, it.id) ? inv.selected : 0;
        inv.move(idx, target);
      }
      inv.selectSlot(target);
      this.selSlot = target;
    }
    this.renderInventory();
  }

  renderInventory() {
    const g = this.game;
    if (!g) return;
    const inv = g.inventory;
    for (let i = 0; i < inv.slots.length; i++) {
      const el = this.invSlots[i];
      if (!el) continue;
      const s = inv.slots[i];
      if (i >= HOLSTER0) el.classList.toggle('off', !inv.canPlace(i));
      el.classList.toggle('sel', i === this.selSlot);
      el.classList.toggle('picked', i === this.selSlot && !!s);
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
    else if (def?.type === 'transmitter') extra = `\nBattery: ${Math.round(s.data.charge)}% · ${s.data.on ? 'ON' : 'off'}`;
    else if (def?.type === 'armor') extra = `\nCondition: ${Math.round(s.data.dur)}%`;
    $('detailDesc').textContent = def ? def.desc + extra : 'Select an item.';
    $('btnUseItem').disabled = !def;
    $('btnUseItem').textContent = !def ? 'Use' : def.type === 'armor' ? 'Wear' : def.type === 'transmitter' ? (s.data.on ? 'Switch off' : 'Switch on') : (def.type === 'consumable' || def.type === 'battery' || def.type === 'repair') ? 'Use' : 'Equip';
    this.renderWorn();
    this.renderCrafting();
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

  renderWorn() {
    const g = this.game, box = $('wornBox');
    const a = g.armor;
    box.classList.toggle('hidden', !a);
    if (!a) return;
    box.innerHTML = `<div class="ic"></div><div><b>Wearing: ${ITEMS[a.id].name}</b><div class="muted">${Math.round(ITEMS[a.id].armor.absorb * 100)}% damage absorbed · ${Math.round(a.data.dur)}% left</div></div><div class="bar"><div style="width:${a.data.dur}%"></div></div><button class="small" id="btnTakeOff">Take off</button>`;
    iconInto(box.querySelector('.ic'), a.id, 36);
    box.querySelector('#btnTakeOff').onclick = () => { g.removeArmor(); this.renderInventory(); };
  }

  renderCrafting() {
    const g = this.game, list = $('craftList');
    const inv = g.inventory;
    const sig = RECIPES.map(r => r.in.map(([id]) => inv.count(id)).join(',')).join('|');
    if (sig === this._craftSig && list.children.length) return;
    this._craftSig = sig;
    list.innerHTML = '';
    const sorted = [...RECIPES].sort((a, b) => canCraft(inv, b) - canCraft(inv, a));
    for (const r of sorted) {
      const ok = canCraft(inv, r);
      const el = document.createElement('div');
      el.className = 'recipe' + (ok ? ' ok' : '');
      el.title = r.note;
      el.innerHTML = `<div class="out"></div><div><div class="name">${ITEMS[r.out[0]].name}${r.out[1] > 1 ? ' ×' + r.out[1] : ''}</div><div class="needs"></div></div><button class="small"${ok ? '' : ' disabled'}>Craft</button>`;
      iconInto(el.querySelector('.out'), r.out[0], 34);
      const needs = el.querySelector('.needs');
      for (const [id, n] of r.in) {
        const have = inv.count(id);
        const nd = document.createElement('span');
        nd.className = 'need' + (have >= n ? '' : ' miss');
        nd.title = ITEMS[id].name;
        nd.innerHTML = `<span class="ic"></span>${Math.min(have, n)}/${n} ${ITEMS[id].name}`;
        iconInto(nd.querySelector('.ic'), id, 18);
        needs.appendChild(nd);
      }
      el.querySelector('button').onclick = () => { if (craft(g, r)) { this._craftSig = null; this.renderInventory(); } };
      list.appendChild(el);
    }
  }

  // ------------------------------------------------------------------ role select
  openRolePicker(game, onPick) {
    this.game = game;
    const box = $('roleCards');
    box.innerHTML = '';
    for (const id of CLASS_ORDER) {
      const C = CLASSES[id];
      const b = document.createElement('button');
      b.className = 'role-card';
      b.style.setProperty('--rc', C.color);
      b.innerHTML = `<span class="rc-ic">${C.icon}</span><span class="rc-name">${C.name}</span><span class="rc-role">${C.role}</span><span class="muted">${C.blurb}</span><ul>${C.perks.map(p => `<li>${p}</li>`).join('')}</ul><div class="rc-kit"></div>`;
      const kit = b.querySelector('.rc-kit');
      for (const [item, qty] of C.kit) { const sp = document.createElement('span'); sp.title = `${ITEMS[item].name}${qty > 1 ? ' ×' + qty : ''}`; iconInto(sp, item, 26); kit.appendChild(sp); }
      b.onclick = () => { this.closeModal('roleSelect'); onPick(id); };
      box.appendChild(b);
    }
    this.openModal('roleSelect');
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
    $('btnSkipPrologue').onclick = () => { const g = this.game; this.resume(); g?.skipPrologue(); };
  }
  pause(game) {
    this.game = game;
    if (!game.online) game.paused = true;
    $('pauseInfo').textContent = `${game.def?.name || ''} — ${game.def?.title || ''} · seed ${game.seedLabel || game.seed}${game.online ? ' · co-op continues while paused' : ''}`;
    $('btnSkipPrologue').classList.toggle('hidden', !(game.levelId === 'P0' && game.isHost));
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
      'bled out': 'Nobody reached you in time.', lookalike: 'It wore your face as it ended you.', 'gave up': 'You let go. The rooms let you start over.',
      spider: 'Too many red eyes. Too many legs.', snake: 'Platinum coils, tightening.', pale: 'It stopped singing when it reached you.', armor: 'Even armor gives out.',
    };
    $('deathText').textContent = lines[cause] || 'The Goanrooms keep what they take.';
    $('btnRespawn').classList.remove('hidden');
    $('btnRespawn').textContent = game.online ? 'Respawn at level entrance' : 'Respawn';
    $('btnRespawn').onclick = () => game.respawn();
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
