// RuckyOS 7 — Brotherhood Edition. The computers in Ririqian bases: a
// working (if paranoid) desktop in red, white and black glass.
//
// Apps: Explorer (documents, pictures, locked and encrypted folders), Notepad,
// Calculator, Paint, Minesweeper, Brotherhood Shell (a terminal that can talk
// to the base's systems), Base Monitor (live garrison and alarm status, admin
// controls), Mail (password), Radio Intercepts and Media Player (the anthem).
// Passwords are per base: the user password is on a sticky note somewhere in
// the computer room, the admin password is kept by the commander.
import { audio } from '../audio/audio.js';
import { RNG, hash4 } from '../core/rng.js';
import { imageURL, arabicGibberish, basePasswords } from '../world/bases/objects.js';

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const DOCS = [
  ['Morning address 271.txt', 'Brothers! The rooms are endless, but so is our will.\n\nI am with you always — in the portraits, in the flag, in the morning silence before the generators start.\n\n(Identical to address 12. And 140. And 203.)'],
  ['Generator schedule.txt', 'GEN 1  0600-1400\nGEN 2  1400-2200\nGEN 3  OUT OF FUEL\n\nDo not run GEN 3. It is not out of fuel. It makes a sound at night.'],
  ['Watch rota.txt', 'Watch post A: Haddik (REASSIGNED)\nWatch post B: Temmer\nWatch post C: [blank]\n\nIf you see the thin ones on Gug, do not fire. Lie still. They only chase what runs.'],
  ['Requisition 44.txt', 'Requested: 2,000 rifle rounds, 300 fire salts, 1 generator belt.\nReceived: 1 portrait of the Supreme Leader (framed).\n\nGlory to Ririqia Below.'],
  ['Prisoner inventory.txt', 'Item: American radio (broken)\nItem: map of "Level 0" with arrows\nItem: photograph of a woman and a dog\nItem: one (1) granola bar, eaten by Sgt. Ozmar'],
];
const MAILS = [
  ['Command', 'RE: The Leader', 'It has been nine months. Officers will continue to read the addresses. Officers will not speculate. The Leader is elsewhere.'],
  ['Lt. Varekh', 'what we saw on Gug', 'There is a room on Gug where the air bends. The Leader\'s honour guard took him there and he stepped into it. We are told it was a door to the Tufferverse. We are told he will return with an army. We are told a great many things.'],
  ['Quartermaster', 'Resupply', 'No resupply for eleven weeks. I have started counting the fire salts twice to make the number look bigger. It does not work.'],
  ['Sgt. Temmer', '(no subject)', 'Is anyone else hearing the anthem on the radio at 0300? We do not broadcast at 0300.'],
  ['Command', 'Americans', 'The Americans arrive through their machine. They are lost and they are not looking for us. Shoot them anyway. Recover their radios: the machine may be able to bring something BACK.'],
];
const INTERCEPTS = [
  ['14.07 — Site Kestrel (English)', '"...Kestrel to Expedition 2. If you can hear this, the return coil is damaged on your side. Do not wait at the machine. Repeat, do not wait at the machine."'],
  ['02.11 — Tufflandian band', 'A woman\'s voice, calm, reading numbers. Then: "The Remnant is not to be engaged. Observation only."'],
  ['09.12 — Unknown', 'An anthem, played backwards, on a channel the Brotherhood doesn\'t use.'],
  ['30.12 — Outpost 9', '"Outpost 9 to Command. The gate is still closed. Everyone is gone. The gate is still closed."'],
];

export class RuckyOS {
  constructor(ui) {
    this.ui = ui;
    this.el = document.createElement('div');
    this.el.id = 'ruckyos';
    this.el.className = 'screen modal-screen';
    document.body.appendChild(this.el);
    this.timers = [];
    ui.onClose = ui.onClose || {};
    ui.onClose.ruckyos = () => this.shutdown();
    this.el.addEventListener('keydown', e => e.stopPropagation());
  }

  open(game, o, base) {
    this.game = game; this.o = o; this.base = base;
    this.pw = basePasswords(base?.seed ?? 1);
    this.unlocked = { user: false, admin: false };
    this.z = 10;
    this.render();
    this.ui.openModal('ruckyos');
    this.every(() => this.tick(), 1000);
    audio.play('ui', { freq: 520 });
  }
  every(fn, ms) { this.timers.push(setInterval(fn, ms)); }
  after(fn, ms) { this.timers.push(setTimeout(fn, ms)); }
  shutdown() { for (const t of this.timers) { clearInterval(t); clearTimeout(t); } this.timers = []; this.el.innerHTML = ''; this.anthemStop?.(); this.game?.standUp?.(); }

  render() {
    const apps = [['explorer', '🗂', 'Explorer'], ['notepad', '📝', 'Notepad'], ['calc', '🧮', 'Calculator'], ['paint', '🎨', 'Paint'], ['mines', '💣', 'Minesweeper'], ['shell', '⌨', 'Brotherhood Shell'], ['monitor', '🛡', 'Base Monitor'], ['mail', '✉', 'Mail'], ['radio', '📻', 'Intercepts'], ['media', '🎵', 'Media Player']];
    this.el.innerHTML = `<div class="ros-desk">
      <div class="ros-wall"><div class="ros-star">★</div><div class="ros-brand">RuckyOS<span>7</span></div><div class="ros-sub">${esc(arabicGibberish(this.base?.seed ?? 3, 3))}</div></div>
      <div class="ros-icons">${apps.map(([id, ic, n]) => `<div class="ros-icon" data-app="${id}"><span>${ic}</span><label>${n}</label></div>`).join('')}</div>
      <div class="ros-wins"></div>
      <div class="ros-bar"><button class="ros-orb">★</button><div class="ros-tasks"></div><div class="ros-tray"><span>🔊</span><span>📶</span><span class="ros-clock"></span></div></div>
      <div class="ros-start hidden"><div class="ros-user"><div class="ros-av">★</div><div><b>Operator</b><br><small>${esc(this.base ? this.base.id.split(':')[0] : '')} · guest session</small></div></div>
        <div class="ros-list">${apps.map(([id, ic, n]) => `<div data-app="${id}">${ic} ${n}</div>`).join('')}</div>
        <div class="ros-side"><div data-act="lock">🔒 Log in…</div><div data-act="off">⏻ Shut down</div></div></div>
    </div>`;
    this.wins = this.el.querySelector('.ros-wins');
    this.start = this.el.querySelector('.ros-start');
    this.el.querySelectorAll('[data-app]').forEach(n => { n.onclick = () => { if (n.closest('.ros-start') || this.last === n && performance.now() - this.lastT < 450) this.launch(n.dataset.app); this.last = n; this.lastT = performance.now(); this.start.classList.add('hidden'); }; n.ondblclick = () => this.launch(n.dataset.app); });
    this.el.querySelector('.ros-orb').onclick = e => { e.stopPropagation(); this.start.classList.toggle('hidden'); audio.play('click', {}); };
    this.el.querySelector('[data-act=off]').onclick = () => this.ui.closeModal('ruckyos');
    this.el.querySelector('[data-act=lock]').onclick = () => { this.start.classList.add('hidden'); this.login('user'); };
    this.el.querySelector('.ros-desk').addEventListener('mousedown', e => { if (!e.target.closest('.ros-start, .ros-orb')) this.start.classList.add('hidden'); });
    this.tick();
  }

  tick() {
    const c = this.el.querySelector('.ros-clock');
    if (c) { const d = new Date(); c.textContent = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; }
    this.monitorRefresh?.();
  }

  // ---- windows
  window(id, title, html, { w = 460, h = 320, icon = '★' } = {}) {
    const old = this.wins.querySelector(`[data-win="${id}"]`);
    if (old) { old.style.zIndex = ++this.z; return old; }
    const n = this.wins.children.length;
    const d = document.createElement('div');
    d.className = 'ros-win'; d.dataset.win = id;
    const R = this.el.getBoundingClientRect();
    d.style.cssText = `width:${w}px;height:${h}px;left:${Math.max(6, Math.min(R.width - w - 6, 110 + n * 28))}px;top:${Math.max(6, Math.min(R.height - h - 50, 30 + n * 24))}px;z-index:${++this.z}`;
    d.innerHTML = `<div class="ros-title"><span>${icon} ${esc(title)}</span><div><button data-min>–</button><button data-x class="x">✕</button></div></div><div class="ros-body">${html}</div>`;
    d.querySelector('[data-x]').onclick = () => { d.remove(); audio.play('click', {}); if (id === 'media') this.anthemStop?.(); this.taskbar(); };
    d.querySelector('[data-min]').onclick = () => { d.classList.add('min'); this.taskbar(); };
    d.addEventListener('mousedown', () => { d.style.zIndex = ++this.z; });
    const bar = d.querySelector('.ros-title');
    bar.addEventListener('pointerdown', e => {
      if (e.target.closest('button')) return;
      const sx = e.clientX - d.offsetLeft, sy = e.clientY - d.offsetTop;
      const mv = ev => { d.style.left = (ev.clientX - sx) + 'px'; d.style.top = Math.max(0, ev.clientY - sy) + 'px'; };
      const up = () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); };
      window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up);
    });
    this.wins.appendChild(d);
    this.taskbar();
    return d;
  }
  taskbar() {
    const t = this.el.querySelector('.ros-tasks');
    if (!t) return;
    t.innerHTML = '';
    for (const w of this.wins.children) {
      const b = document.createElement('button');
      b.className = 'ros-task' + (w.classList.contains('min') ? ' min' : '');
      b.textContent = w.querySelector('.ros-title span').textContent;
      b.onclick = () => { w.classList.toggle('min', !w.classList.contains('min') ? false : false); w.classList.remove('min'); w.style.zIndex = ++this.z; this.taskbar(); };
      t.appendChild(b);
    }
  }
  launch(app) { audio.play('click', {}); this['app_' + app]?.(); }

  // ---- password prompt (researchers can lift the user hash)
  login(level, then) {
    if (this.unlocked[level]) { then?.(); return; }
    const d = this.window('login-' + level, level === 'admin' ? 'Administrator authentication' : 'Log in', `<div class="ros-login"><div class="ros-av big">★</div>
      <div><b>${level === 'admin' ? 'Commander' : 'Operator'}</b><div class="muted">${level === 'admin' ? 'This action requires the commander\'s password.' : 'Enter the operator password.'}</div>
      <input type="password" class="ros-in" autocomplete="off" spellcheck="false"><div class="ros-err"></div>
      <div class="ros-btns">${level === 'user' && this.game.classId === 'researcher' ? '<button data-hack>Recover hash</button>' : ''}<button data-ok class="pri">OK</button></div></div></div>`, { w: 400, h: 200, icon: '🔒' });
    const inp = d.querySelector('input'); inp.focus();
    const ok = () => {
      if (inp.value.trim().toUpperCase() === this.pw[level]) {
        this.unlocked[level] = true; if (level === 'admin') this.unlocked.user = true;
        audio.play('ui', { freq: 880 }); d.remove(); this.taskbar(); then?.();
      } else { d.querySelector('.ros-err').textContent = 'The password is incorrect.'; audio.play('ui', { freq: 200 }); inp.select(); }
    };
    d.querySelector('[data-ok]').onclick = ok;
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') ok(); });
    const hk = d.querySelector('[data-hack]');
    if (hk) hk.onclick = () => { hk.disabled = true; hk.textContent = 'Working…'; this.after(() => { inp.value = this.pw.user; d.querySelector('.ros-err').textContent = 'Weak hash. Password recovered.'; }, 1500); };
  }

  // ---- apps
  app_explorer() {
    const pics = ['rucky', 'ruckyPropaganda', 'ririqiaPoster', 'ririqiaFlag'];
    const tree = { Documents: DOCS.map(([n, t]) => ({ n, t })), Pictures: pics.map(p => ({ n: p + '.jpg', img: p })), Orders: 'user', Personnel: 'enc', 'TUFFERVERSE.vault': 'enc' };
    const d = this.window('explorer', 'Explorer', `<div class="ros-ex"><div class="ros-tree">${Object.keys(tree).map(k => `<div data-f="${esc(k)}">${tree[k] === 'enc' ? '🔐' : tree[k] === 'user' ? '🔒' : '📁'} ${esc(k)}</div>`).join('')}</div><div class="ros-files"></div></div><div class="ros-status">Guest session · ${esc(arabicGibberish(hash4(this.base?.seed ?? 1, 9), 2))}</div>`, { w: 560, h: 340, icon: '🗂' });
    const files = d.querySelector('.ros-files');
    const show = k => {
      const v = tree[k];
      d.querySelectorAll('.ros-tree div').forEach(n => n.classList.toggle('on', n.dataset.f === k));
      if (v === 'enc') { files.innerHTML = `<div class="ros-locked">🔐 <b>${esc(k)}</b><br>Encrypted with AES-RQ-4096.<br><small>The key is not stored on this machine.</small><br><button data-try>Attempt decryption</button></div>`; files.querySelector('[data-try]').onclick = e => { e.target.disabled = true; e.target.textContent = 'Trying keys…'; this.after(() => { files.querySelector('.ros-locked').insertAdjacentHTML('beforeend', '<br><span class="ros-err">Key rejected (0 of 2^4096 tried keys accepted). Nothing can be recovered.</span>'); }, 1800); }; return; }
      if (v === 'user' && !this.unlocked.user) { files.innerHTML = '<div class="ros-locked">🔒 This folder requires the operator password.<br><button data-l>Log in…</button></div>'; files.querySelector('[data-l]').onclick = () => this.login('user', () => show(k)); return; }
      const list = v === 'user' ? MAILS.slice(0, 2).map(([f, s, b]) => ({ n: s + '.txt', t: `From: ${f}\n\n${b}` })).concat([{ n: 'Standing orders.txt', t: '1. Outsiders are shot on sight.\n2. Sound the alarm at the first sighting.\n3. The vault key stays with the commander.\n4. The commander\'s password is changed monthly. (It has not been changed in nine months.)' }]) : v;
      files.innerHTML = list.map((f, i) => `<div class="ros-file" data-i="${i}">${f.img ? '🖼' : '📄'} ${esc(f.n)}</div>`).join('');
      files.querySelectorAll('.ros-file').forEach(n => { n.ondblclick = n.onclick = () => { const f = list[+n.dataset.i]; f.img ? this.viewImage(f.n, f.img) : this.app_notepad(f.n, f.t); }; });
    };
    d.querySelectorAll('.ros-tree div').forEach(n => { n.onclick = () => show(n.dataset.f); });
    show('Documents');
  }
  viewImage(name, img) {
    this.window('img-' + name, name + ' — Photo Viewer', `<div class="ros-img"><img src="${imageURL(img)}" alt=""></div>`, { w: 420, h: 440, icon: '🖼' });
  }
  app_notepad(name = 'Untitled.txt', text = '') {
    const d = this.window('np-' + name, name + ' — Notepad', `<textarea class="ros-note" spellcheck="false"></textarea>`, { w: 460, h: 300, icon: '📝' });
    const ta = d.querySelector('textarea'); if (!ta.value) ta.value = text; ta.focus();
  }
  app_calc() {
    const keys = ['MC', 'MR', '←', 'C', '7', '8', '9', '÷', '4', '5', '6', '×', '1', '2', '3', '−', '0', '.', '±', '+', '√', '%', '1/x', '='];
    const d = this.window('calc', 'Calculator', `<div class="ros-calc"><div class="ros-lcd">0</div><div class="ros-keys">${keys.map(k => `<button data-k="${k}"${k === '=' ? ' class="pri"' : ''}>${k}</button>`).join('')}</div></div>`, { w: 250, h: 330, icon: '🧮' });
    const lcd = d.querySelector('.ros-lcd');
    let cur = '0', acc = null, op = null, fresh = true, mem = 0;
    const calc = (a, b, o) => o === '+' ? a + b : o === '−' ? a - b : o === '×' ? a * b : o === '÷' ? (b === 0 ? NaN : a / b) : b;
    const out = v => { const s = String(+(+v).toPrecision(12)); lcd.textContent = s === 'NaN' ? 'Cannot divide by zero' : s; };
    const press = k => {
      if (/^\d$/.test(k)) { cur = fresh || cur === '0' ? k : cur + k; fresh = false; }
      else if (k === '.') { if (fresh) { cur = '0.'; fresh = false; } else if (!cur.includes('.')) cur += '.'; }
      else if (k === 'C') { cur = '0'; acc = op = null; fresh = true; }
      else if (k === '←') cur = cur.length > 1 ? cur.slice(0, -1) : '0';
      else if (k === '±') cur = String(-parseFloat(cur));
      else if (k === '√') { cur = String(Math.sqrt(parseFloat(cur))); fresh = true; }
      else if (k === '%') cur = String(parseFloat(cur) / 100);
      else if (k === '1/x') { cur = String(1 / parseFloat(cur)); fresh = true; }
      else if (k === 'MC') mem = 0; else if (k === 'MR') { cur = String(mem); fresh = true; }
      else if (k === '=') { if (op) { cur = String(calc(acc, parseFloat(cur), op)); acc = op = null; } fresh = true; mem = parseFloat(cur) || mem; }
      else { if (op && !fresh) cur = String(calc(acc, parseFloat(cur), op)); acc = parseFloat(cur); op = k; fresh = true; }
      if (cur === '2013') { lcd.textContent = 'GLORY'; return; }
      out(cur);
    };
    d.querySelectorAll('[data-k]').forEach(b => { b.onclick = () => press(b.dataset.k); });
    d.tabIndex = 0; d.focus();
    d.addEventListener('keydown', e => { const m = { '+': '+', '-': '−', '*': '×', '/': '÷', Enter: '=', '=': '=', Backspace: '←', Delete: 'C', '.': '.', Escape: null }; const k = /^\d$/.test(e.key) ? e.key : m[e.key]; if (k) { e.preventDefault(); press(k); } });
  }
  app_paint() {
    const cols = ['#000000', '#ffffff', '#a81e18', '#e8c040', '#3a7a3a', '#2a4a8a', '#7a4a2a', '#888888'];
    const d = this.window('paint', 'Paint', `<div class="ros-paint"><div class="ros-tools">${cols.map(c => `<button class="sw" data-c="${c}" style="background:${c}"></button>`).join('')}<label>Size <input type="range" min="1" max="24" value="4"></label><button data-clear>Clear</button><button data-save>Save…</button></div><canvas width="520" height="300"></canvas></div>`, { w: 560, h: 390, icon: '🎨' });
    const cv = d.querySelector('canvas'), x = cv.getContext('2d');
    x.fillStyle = '#fff'; x.fillRect(0, 0, cv.width, cv.height);
    let col = '#a81e18', size = 4, drawing = false, lx = 0, ly = 0;
    d.querySelectorAll('.sw').forEach(b => { b.onclick = () => { col = b.dataset.c; d.querySelectorAll('.sw').forEach(q => q.classList.toggle('on', q === b)); }; });
    d.querySelector('input').oninput = e => { size = +e.target.value; };
    d.querySelector('[data-clear]').onclick = () => { x.fillStyle = '#fff'; x.fillRect(0, 0, cv.width, cv.height); };
    d.querySelector('[data-save]').onclick = () => { const a = document.createElement('a'); a.href = cv.toDataURL('image/png'); a.download = 'ruckyos-painting.png'; a.click(); };
    const pos = e => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) * cv.width / r.width, (e.clientY - r.top) * cv.height / r.height]; };
    cv.addEventListener('pointerdown', e => { drawing = true; [lx, ly] = pos(e); cv.setPointerCapture(e.pointerId); x.fillStyle = col; x.beginPath(); x.arc(lx, ly, size / 2, 0, 7); x.fill(); });
    cv.addEventListener('pointermove', e => { if (!drawing) return; const [nx, ny] = pos(e); x.strokeStyle = col; x.lineWidth = size; x.lineCap = 'round'; x.beginPath(); x.moveTo(lx, ly); x.lineTo(nx, ny); x.stroke(); lx = nx; ly = ny; });
    cv.addEventListener('pointerup', () => { drawing = false; });
  }
  app_mines() {
    const N = 9, M = 10;
    const d = this.window('mines', 'Minesweeper', `<div class="ros-mines"><div class="ros-mhead"><span class="mc">${M}</span><button data-new>★</button><span class="mt">0</span></div><div class="ros-grid" style="grid-template-columns:repeat(${N},24px)"></div></div>`, { w: 270, h: 330, icon: '💣' });
    const grid = d.querySelector('.ros-grid');
    let cells, over, opened, flags, t0, timer;
    const reset = () => {
      cells = Array.from({ length: N * N }, () => ({ m: false, o: false, f: false, n: 0 }));
      let placed = 0; while (placed < M) { const i = Math.floor(Math.random() * N * N); if (!cells[i].m) { cells[i].m = true; placed++; } }
      cells.forEach((c, i) => { const x = i % N, y = (i / N) | 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const X = x + dx, Y = y + dy; if (X >= 0 && Y >= 0 && X < N && Y < N && cells[Y * N + X].m) c.n++; } });
      over = false; opened = 0; flags = 0; t0 = 0; clearInterval(timer);
      d.querySelector('[data-new]').textContent = '★';
      draw();
    };
    const open = i => {
      const c = cells[i]; if (c.o || c.f) return;
      c.o = true; opened++;
      if (c.m) { over = true; cells.forEach(q => { if (q.m) q.o = true; }); d.querySelector('[data-new]').textContent = '✖'; clearInterval(timer); audio.play('ui', { freq: 150 }); return; }
      if (!c.n) { const x = i % N, y = (i / N) | 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const X = x + dx, Y = y + dy; if (X >= 0 && Y >= 0 && X < N && Y < N) open(Y * N + X); } }
      if (opened === N * N - M) { over = true; d.querySelector('[data-new]').textContent = '☺'; clearInterval(timer); audio.play('ui', { freq: 1000 }); }
    };
    const draw = () => {
      grid.innerHTML = '';
      d.querySelector('.mc').textContent = M - flags;
      cells.forEach((c, i) => {
        const b = document.createElement('button');
        b.className = 'mc' + (c.o ? ' o' : '');
        b.textContent = c.o ? (c.m ? '✹' : c.n || '') : c.f ? '⚑' : '';
        if (c.o && c.n) b.dataset.n = c.n;
        b.onclick = () => { if (over) return; if (!t0) { t0 = performance.now(); timer = setInterval(() => { d.querySelector('.mt').textContent = Math.floor((performance.now() - t0) / 1000); }, 500); this.timers.push(timer); } open(i); draw(); };
        b.oncontextmenu = e => { e.preventDefault(); if (over || c.o) return; c.f = !c.f; flags += c.f ? 1 : -1; draw(); };
        grid.appendChild(b);
      });
    };
    d.querySelector('[data-new]').onclick = reset;
    reset();
  }
  app_shell() {
    const d = this.window('shell', 'Brotherhood Shell', `<div class="ros-term"><div class="ros-out"></div><div class="ros-prompt"><span>rq:\\&gt;</span><input spellcheck="false" autocomplete="off"></div></div>`, { w: 560, h: 320, icon: '⌨' });
    const out = d.querySelector('.ros-out'), inp = d.querySelector('input');
    const say = (t, c = '') => { const p = document.createElement('div'); p.className = c; p.textContent = t; out.appendChild(p); out.scrollTop = out.scrollHeight; };
    say('RuckyOS Brotherhood Shell [Version 7.0.2013]'); say('Type HELP for a list of commands.');
    const hist = []; let hi = 0;
    const run = line => {
      say('rq:\\> ' + line, 'cmd');
      const [c, ...a] = line.trim().split(/\s+/); const cmd = (c || '').toLowerCase();
      if (!cmd) return;
      if (cmd === 'help') say('DIR  TYPE <file>  WHOAMI  DATE  PING <host>  STATUS  LOGIN [ADMIN]  ALARM ON|OFF  VAULT OPEN  DECRYPT <file>  CLS  EXIT');
      else if (cmd === 'dir') DOCS.forEach(([n]) => say('  ' + n));
      else if (cmd === 'type') { const f = DOCS.find(([n]) => n.toLowerCase().startsWith(a.join(' ').toLowerCase())); f ? f[1].split('\n').forEach(l => say(l)) : say('File not found.', 'err'); }
      else if (cmd === 'whoami') say(this.unlocked.admin ? 'commander (administrator)' : this.unlocked.user ? 'operator' : 'guest');
      else if (cmd === 'date') say('Thursday — day 271 of the Leader\'s absence');
      else if (cmd === 'ping') { const h = a[0] || 'command'; say(`Pinging ${h}...`); this.after(() => say(/kestrel|tuff/i.test(h) ? 'Destination host unreachable (different universe).' : /gug|command/i.test(h) ? 'Request timed out.' : 'Unknown host.', 'err'), 900); }
      else if (cmd === 'status') this.statusLines().forEach(l => say(l));
      else if (cmd === 'login') this.login(a[0]?.toLowerCase() === 'admin' ? 'admin' : 'user', () => say('Authenticated.'));
      else if (cmd === 'alarm') { if (!this.unlocked.admin) { say('Access denied. LOGIN ADMIN first.', 'err'); return; } this.baseCmd(a[0]?.toLowerCase() === 'on' ? 'alarmOn' : 'alarmOff'); say(a[0]?.toLowerCase() === 'on' ? 'Alarm raised. (Was that wise?)' : 'Alarm silenced.'); }
      else if (cmd === 'vault') { if (!this.unlocked.admin) { say('Access denied. LOGIN ADMIN first.', 'err'); return; } if (!this.vaultObj()) { say('No vault is connected to this terminal.', 'err'); return; } this.baseCmd('vault'); say('Vault bolts retracting...'); }
      else if (cmd === 'decrypt') { say('Attempting decryption...'); this.after(() => say(/tuffer/i.test(a.join(' ')) ? 'AES-RQ-4096: key rejected. The file cannot be recovered.' : 'Nothing to decrypt.', 'err'), 1200); }
      else if (cmd === 'cls') out.innerHTML = '';
      else if (cmd === 'exit') d.remove();
      else say(`'${c}' is not recognized as a Brotherhood command.`, 'err');
    };
    inp.addEventListener('keydown', e => {
      if (e.key === 'Enter') { const v = inp.value; hist.push(v); hi = hist.length; inp.value = ''; run(v); }
      else if (e.key === 'ArrowUp') { hi = Math.max(0, hi - 1); inp.value = hist[hi] || ''; }
      else if (e.key === 'ArrowDown') { hi = Math.min(hist.length, hi + 1); inp.value = hist[hi] || ''; }
    });
    inp.focus();
  }
  // live base status (garrison, alarm) from the world state
  statusLines() {
    const g = this.game, b = this.base;
    if (!b) return ['No base link.'];
    const killed = g.world.flag(g.levelId, 'bk:' + b.id) || [];
    const total = b._posts ?? 0;
    const alarm = g.world.flag(g.levelId, 'alarm:' + b.id);
    return [`BASE ${b.id.split(':').slice(1).join(' / ')}  (${b.size})`, `Garrison: ${Math.max(0, total - killed.length)} / ${total} on duty`, `Alarm: ${alarm && g.time - alarm < 32 ? 'SOUNDING' : 'quiet'}`, `Seized: ${g.world.flag(g.levelId, 'seized:' + b.id) ? 'YES' : 'no'}`, 'Power: 2 of 3 generators', 'Stores: fire salts LOW · water LOW · rounds OK'];
  }
  app_monitor() {
    const d = this.window('monitor', 'Base Monitor', `<div class="ros-mon"><pre class="ros-stat"></pre><div class="ros-btns"><button data-alarm>Sound alarm</button><button data-off>Silence alarm</button><button data-vault>Open vault</button></div><div class="ros-err"></div></div>`, { w: 420, h: 280, icon: '🛡' });
    const upd = () => { if (!d.isConnected) { this.monitorRefresh = null; return; } d.querySelector('.ros-stat').textContent = this.statusLines().join('\n'); };
    this.monitorRefresh = upd; upd();
    const need = fn => () => this.login('admin', fn);
    d.querySelector('[data-alarm]').onclick = need(() => this.baseCmd('alarmOn'));
    d.querySelector('[data-off]').onclick = need(() => this.baseCmd('alarmOff'));
    d.querySelector('[data-vault]').onclick = need(() => { if (this.vaultObj()) this.baseCmd('vault'); else d.querySelector('.ros-err').textContent = 'No vault on this network.'; });
  }
  app_mail() {
    if (!this.unlocked.user) { this.login('user', () => this.app_mail()); return; }
    const d = this.window('mail', 'Mail — Inbox', `<div class="ros-mail"><div class="ros-mlist">${MAILS.map(([f, s], i) => `<div data-i="${i}"><b>${esc(f)}</b><br>${esc(s)}</div>`).join('')}</div><div class="ros-mbody">Select a message.</div></div>`, { w: 580, h: 320, icon: '✉' });
    d.querySelectorAll('.ros-mlist div').forEach(n => { n.onclick = () => { const [f, s, b] = MAILS[+n.dataset.i]; d.querySelector('.ros-mbody').innerHTML = `<b>${esc(s)}</b><div class="muted">From: ${esc(f)}</div><p>${esc(b)}</p>`; d.querySelectorAll('.ros-mlist div').forEach(q => q.classList.toggle('on', q === n)); }; });
  }
  app_radio() {
    this.window('radio', 'Radio Intercepts', `<div class="ros-mail one">${INTERCEPTS.map(([t, b]) => `<div class="ros-ic"><b>${esc(t)}</b><p>${esc(b)}</p></div>`).join('')}</div>`, { w: 480, h: 300, icon: '📻' });
  }
  app_media() {
    const d = this.window('media', 'Media Player', `<div class="ros-media"><div class="ros-viz"></div><div class="muted">${esc(arabicGibberish(77, 2))} — National Anthem of Ririqia</div><div class="ros-btns"><button data-play class="pri">▶ Play</button><button data-stop>■ Stop</button></div></div>`, { w: 380, h: 240, icon: '🎵' });
    const viz = d.querySelector('.ros-viz');
    for (let k = 0; k < 24; k++) viz.appendChild(document.createElement('i'));
    d.querySelector('[data-play]').onclick = () => this.anthem(viz);
    d.querySelector('[data-stop]').onclick = () => this.anthemStop?.();
  }
  // a brassy march on the synth
  anthem(viz) {
    this.anthemStop?.();
    const A = audio;
    if (!A.ready) return;
    const ctx = A.ctx, out = ctx.createGain(); out.gain.value = 0.18; out.connect(A.sfxBus || ctx.destination);
    const MEL = [0, 0, 4, 7, 7, 4, 0, 2, 4, 5, 4, 2, 0, null, 7, 7, 9, 11, 12, 11, 9, 7, 5, 4, 2, 0, null, null];
    let i = 0, stopped = false;
    const tick = () => {
      if (stopped) return;
      const n = MEL[i % MEL.length], t = ctx.currentTime;
      if (n !== null) for (const [mult, type, v] of [[1, 'sawtooth', 0.5], [2, 'square', 0.15], [0.5, 'triangle', 0.4]]) {
        const o = ctx.createOscillator(), g = ctx.createGain(); o.type = type; o.frequency.value = 262 * Math.pow(2, n / 12) * mult;
        g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(v, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.32);
        o.connect(g).connect(out); o.start(t); o.stop(t + 0.35);
      }
      if (i % 2 === 0) { const nz = ctx.createBufferSource(); nz.buffer = A.noise?.white; const g = ctx.createGain(); g.gain.setValueAtTime(0.2, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.08); nz.connect(g).connect(out); nz.start(t); nz.stop(t + 0.1); }
      viz?.querySelectorAll('i').forEach(b => { b.style.height = (n === null ? 4 : 10 + Math.random() * 50) + 'px'; });
      i++;
      setTimeout(tick, 300);
    };
    tick();
    this.anthemStop = () => { stopped = true; try { out.disconnect(); } catch { /* ignore */ } this.anthemStop = null; };
  }

  vaultObj() {
    const g = this.game;
    for (const e of g.objects.all.values()) if (e.o.kind === 'baseVault' && e.o.base === this.base?.id) return e.o;
    return null;
  }
  baseCmd(cmd) {
    const g = this.game;
    g.request({ t: 'baseCmd', l: g.levelId, base: this.base.id, cmd, pw: this.pw.admin, vault: this.vaultObj()?.id });
    audio.play('ui', { freq: cmd === 'alarmOn' ? 300 : 900 });
  }
}
