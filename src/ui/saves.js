// Save / load screen: local slots, export to file and import from file.
// Modes: 'save' (in game), 'load' (main menu), 'pick' (co-op lobby host).
// Everything shown comes from sanitized saves and is set with textContent.
import { listSlots, writeSlot, deleteSlot, exportFile, importFile, describeSave, SAVE_SLOTS } from '../game/save.js';

const $ = id => document.getElementById(id);
const SLOT_NAMES = { auto: 'Autosave', 'auto-coop': 'Co-op autosave', 1: 'Slot 1', 2: 'Slot 2', 3: 'Slot 3', 4: 'Slot 4', 5: 'Slot 5' };
const MANUAL = SAVE_SLOTS.filter(s => !s.startsWith('auto'));

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}
function button(label, cls, fn) {
  const b = el('button', 'small' + (cls ? ' ' + cls : ''), label);
  b.onclick = fn;
  return b;
}
// two-step confirmation for destructive actions
function confirmButton(label, cls, fn) {
  const b = button(label, cls, () => {
    if (b.dataset.armed) { fn(); return; }
    b.dataset.armed = '1';
    b.textContent = 'Sure?';
    setTimeout(() => { delete b.dataset.armed; b.textContent = label; }, 2500);
  });
  return b;
}

export class SaveMenu {
  constructor(app) {
    this.app = app;
    this.imported = null;
    $('btnSavesClose').onclick = () => this.close();
    const ui = app.ui;
    ui.onClose = ui.onClose || {};
    // closed with Esc while in game: don't leave a solo game paused with no menu
    ui.onClose.saves = () => { if (!this._closing && this.app.game) this.app.game.paused = false; };
  }

  status(t, warn) {
    const s = $('savesStatus');
    s.textContent = t || '';
    s.classList.toggle('warn', !!warn);
  }

  async open(mode) {
    this.mode = mode;
    this.imported = null;
    const ui = this.app.ui;
    if (this.app.game) { ui.closeModal('pause', false); ui.open.add('saves'); ui.screen('saves', true); }
    else { ui.screen('lobby', false); this.app.showScreen('saves'); }
    $('savesTitle').textContent = mode === 'save' ? 'Save Game' : mode === 'pick' ? 'Host a Saved Game' : 'Load Game';
    const why = mode === 'save' ? this.app.game?.saveBlocked() : null;
    this.status(why || (mode === 'pick' ? 'Choose the co-op (or solo) save to continue with your team.' : ''), !!why);
    this.renderTop(why);
    await this.renderList(why);
  }

  close() {
    const ui = this.app.ui;
    this._closing = true;
    if (this.app.game) { ui.closeModal('saves', false); ui.pause(this.app.game); }
    else if (this.mode === 'pick') { ui.screen('saves', false); this.app.showScreen('lobby'); }
    else this.app.showScreen('menu');
    this._closing = false;
  }

  renderTop(blocked) {
    const top = $('savesTop');
    top.textContent = '';
    if (this.mode === 'save') {
      const g = this.app.game;
      const inp = el('input');
      inp.id = 'saveName';
      inp.maxLength = 40;
      inp.placeholder = 'Save name';
      inp.value = g.saveName && g.saveName !== 'Autosave' ? g.saveName : `${g.def?.name || 'Save'} · ${new Date().toLocaleDateString()}`;
      inp.addEventListener('keydown', e => e.stopPropagation());
      top.append(inp);
      const ex = button('Export to file', '', async () => {
        const r = await g.buildSave(this.saveName());
        if (r.error) { this.status(r.error, true); return; }
        await exportFile(r.save);
        this.status('Exported. Keep the file somewhere safe — it can be imported on any computer.');
      });
      ex.disabled = !!blocked;
      top.append(ex);
    } else {
      top.append(button('Import from file…', '', async () => {
        const r = await importFile();
        if (!r) return;
        if (r.error) { this.status(r.error, true); return; }
        this.imported = r;
        this.status(r.edited ? 'Imported. Note: this file was modified outside the game; it has been checked and cleaned up.' : 'Imported.', r.edited);
        this.renderList();
      }));
    }
  }

  saveName() { return ($('saveName')?.value || '').trim().slice(0, 40); }

  async renderList(blocked) {
    const ul = $('savesList');
    ul.textContent = '';
    if (this.imported) ul.append(this.row('File', this.imported, true));
    const slots = await listSlots();
    for (const { slot, entry } of slots) {
      if (this.mode === 'save' && !MANUAL.includes(slot)) continue;
      if (!entry && slot.startsWith('auto')) continue;
      ul.append(this.row(slot, entry, false, blocked));
    }
  }

  row(slot, entry, isFile, blocked) {
    const li = el('li', 'save-row' + (entry ? '' : ' empty'));
    li.append(el('div', 'slot', isFile ? 'Imported' : SLOT_NAMES[slot] || slot));
    const info = el('div', 'info');
    if (entry) {
      const d = describeSave(entry.save);
      const t = el('div', 'title', d.title);
      if (entry.edited) t.append(el('span', 'tag warn', 'edited'));
      if (entry.save.mode === 'coop') t.append(el('span', 'tag', 'co-op'));
      info.append(t, el('div', 'lvl', d.level), el('div', 'muted small', `${d.line} · ${d.date}`));
    } else info.append(el('div', 'muted', 'Empty'));
    li.append(info);
    const acts = el('div', 'acts');
    const save = entry?.save;
    if (this.mode === 'save') {
      const go = async () => {
        this.status('Saving…');
        const err = await this.app.game.saveToSlot(slot, this.saveName());
        this.status(err || `Saved to ${SLOT_NAMES[slot]}.`, !!err);
        this.renderList();
      };
      const b = entry ? confirmButton('Overwrite', '', go) : button('Save here', 'primary', go);
      b.disabled = !!blocked;
      acts.append(b);
    } else if (save) {
      if (this.mode === 'pick') acts.append(button('Use', 'primary', () => this.app.lobby.useSave(save)));
      else if (save.mode === 'coop') {
        acts.append(button('Host', 'primary', () => this.app.lobby.openHost(save)));
        acts.append(button('Solo', '', () => this.app.loadSolo(save)));
      } else acts.append(button('Load', 'primary', () => this.app.loadSolo(save)));
      acts.append(button('Export', '', () => exportFile(save)));
      if (isFile) {
        acts.append(button('Keep', '', async () => {
          const used = new Set((await listSlots()).filter(s => s.entry).map(s => s.slot));
          const free = MANUAL.find(s => !used.has(s));
          if (!free) { this.status('No free slot — delete one first.', true); return; }
          const err = await writeSlot(free, save);
          this.status(err || `Kept in ${SLOT_NAMES[free]}.`, !!err);
          if (!err) { this.imported = null; this.renderList(); }
        }));
      } else acts.append(confirmButton('Delete', 'danger', () => { deleteSlot(slot); this.status(`${SLOT_NAMES[slot]} deleted.`); this.renderList(); }));
    }
    li.append(acts);
    return li;
  }
}
