// Level 2 office computers and wall phones.
//
// ComputerUI: a corrupted Windows-9x style desktop. Every machine is seeded
// from its object id, so the same desk always shows the same files. Apps: a
// broken clock, dial-up networking that never connects, a file explorer full
// of corrupted files and memos, a working calculator, a forum that fails to
// load (with a cached page), and a half-corrupted local copy of an entity
// wiki. Some machines carry the "Deedee virus".
//
// PhoneUI: a keypad. Only one number answers.
import { audio } from '../audio/audio.js';
import { RNG, hash4 } from '../core/rng.js';

export const DEEDEE_NUMBER = '1143141967';

const GLITCH = '█▓▒░#@%&?¿¤§¶ÆØ';
// Replace a fraction of characters with glitch symbols (spaces survive).
function corrupt(text, k, rng) {
  if (k <= 0) return text;
  let out = '';
  for (const ch of text) out += ch !== ' ' && ch !== '\n' && rng.next() < k ? GLITCH[rng.int(0, GLITCH.length - 1)] : ch;
  return out;
}
const esc = s => s.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

// ------------------------------------------------------------------ content
const MEMOS = [
  ['MEMO_0412.TXT', 'TO: All floor staff\nRE: Stairwell access\n\nThe stairwell door runs on the building circuit. If the power is out, the fuse is kept DOWNSTAIRS in the pump rooms. Do not prop the door. Do not go down alone.\n\n- Facilities'],
  ['CARPET.TXT', 'Someone keeps replacing the carpet on this floor. Same pattern. Same stains. I marked a tile with a pen on Monday and on Wednesday the mark was on a different floor.'],
  ['QUARTERLY.TXT', 'Q3 PROJECTIONS\n\nRevenue: n/a\nHeadcount: 41 → 19 → 6 → 2\nNotes: we stopped counting after the third floor flooded. There is no third floor.'],
  ['TODO.TXT', '- buy batteries\n- stop answering the phones\n- find the stairs\n- find the stairs\n- find the stairs'],
  ['INKY.TXT', 'The tall one doesn\'t like light. Shine it right at the head and it folds up like paper. Then RUN, it gets back up angry.'],
  ['SEWER.TXT', 'There are rooms off the tunnels, behind rusted doors. Somebody lived in one. They left a bed and a lot of tally marks.'],
  ['README.TXT', 'Welcome to your new workstation!\n\nYour login is your name. Your password is your name. If you have forgotten your name, please contact IT.'],
  ['LADDERS.TXT', 'The manholes in the corridors have ladders. Faster than the stairs, and the stairs are getting further apart every week.'],
  ['EXPEDITION.TXT', 'US SURVEY TEAM 3 — field log (typed up from paper)\nDay 2. Found working terminals on L2. No network. Calendar says 2013 on every one. The machine operators at Site Kestrel told us the Ririqians crossed in 2013. Coincidence?'],
  ['RIRIQIA.TXT', 'Flyer, found stapled to a cubicle wall:\n\n"THE BROTHERHOOD ENDURES. Supreme Leader Rucky Rucky has led the faithful remnant beyond the reach of Tufflandia. Report unbelievers."\n\nSomeone has drawn a moustache on the photograph.'],
  ['VENDING.TXT', 'The machines in the break rooms still work. Mostly snacks. Sometimes there\'s a pale bottle with no label in the bottom row. Drink it and the tall ones walk right past you. For a while.'],
];
const PHONE_FILE = (k, rng) => ['PHONE.TXT', corrupt('If the lights go out on your floor, call 114-314-1967.\nShe always picks up.\nShe will come to you, singing. Let her come. Do NOT touch her.\nShe only wants to see you up close.', k, rng)];
const CRYPTIC = [
  'she counts the rings\nshe counts the rings\nshe counts', 'THE CARPET REMEMBERS FEET', '1 1 4 3 1 4 1 9 6 7', 'level 4 has windows. the windows are not windows.',
  'every exit is a door someone else left open', 'do not trust anyone who arrives twice', 'THE SKY IN THE NEGATIVE ROOMS IS PAINTED',
];
const WIKI = [
  ['The Hush', 'Level 0. A pale, eyeless thing that hunts by sound. Walk, crouch, or hide — never sprint near it. It clicks before it lunges.'],
  ['Marrowhound', 'Level 1. Bone-plated quadruped, moves in short bursts. Loud. Can be fought off with a firearm or a well-timed melee strike.'],
  ['The Scuttler', 'Level 1. Large arachnid with more than a dozen red eyes. Very fast. Holding a flashlight beam on it pins it in place. Common near abandoned stations.'],
  ['Inkwalker', 'Level 2. Very tall, ink-black. Shining a light at its skull collapses it briefly. Opens doors. The pale draught from the vending machines hides you from it.'],
  ['Lookalike', 'Any level. Appears as a member of your team. Does not speak quite right. Will not follow you through doors.'],
  ['Undertow', 'Level 3. Lives in the pools. Stay out of deep water, or move fast through it.'],
  ['Platinum Snake', 'Level 4. Coiled, metallic, slow until it isn\'t. Each gunshot makes it faster. Blades do not anger it the same way.'],
  ['The Goaner', 'Level 5. ████████. The source of the name. Do not go to Level 5 unprepared.'],
  ['Deedee', 'Level 2. Comes when called. Sings. Approaches slowly and vanishes when close. Harmless if left alone. If harmed, she becomes ██████ and will not stop until ██████. Bullets barely mark her; blades do. DO NOT CALL HER FOR FUN.'],
];

// ------------------------------------------------------------------ computer
export class ComputerUI {
  constructor(ui) {
    this.ui = ui;
    this.el = document.createElement('div');
    this.el.id = 'computer';
    this.el.className = 'screen modal-screen';
    document.body.appendChild(this.el);
    this.timers = [];
    ui.onClose = ui.onClose || {};
    ui.onClose.computer = () => this.shutdown();
    this.el.addEventListener('keydown', e => e.stopPropagation());
  }

  open(game, o) {
    this.game = game;
    this.o = o;
    const seed = hash4(Math.round(o.x * 10), Math.round(o.z * 10), game.level?.levelSeed || 1, 77);
    this.rng = new RNG(seed);
    this.researcher = game.classId === 'researcher';
    this.infected = !!o.infected;
    this.z = 10;
    this.render();
    this.ui.openModal('computer');
    audio.play('click', {});
    this.every(() => this.glitch(), 2200 + this.rng.int(0, 2000));
    this.every(() => this.tickClock(), 1000);
    if (this.infected) this.after(() => { this.virus(); this.every(() => this.virus(), 5200); }, 2600);
  }

  every(fn, ms) { this.timers.push(setInterval(fn, ms)); }
  after(fn, ms) { this.timers.push(setTimeout(fn, ms)); }
  shutdown() {
    for (const t of this.timers) { clearInterval(t); clearTimeout(t); }
    this.timers = [];
    this.el.innerHTML = '';
    this.game?.standUp?.();
  }
  close() { this.ui.closeModal('computer'); }

  render() {
    const rng = this.rng;
    const k = 0.04 + rng.next() * 0.06;
    const icons = [
      ['explorer', '🖥', 'My Computer'], ['clock', '🕓', 'Clock'], ['dialup', '☎', 'Dial-Up Networking'], ['calc', '🧮', 'Calculator'],
      ['forum', '🌐', 'GoanNet Forum'], ['wiki', '📖', 'WIKI.HTM'], ['bin', '🗑', 'Recycle Bin'],
    ];
    this.el.innerHTML = `
      <div class="w95-desk${this.infected ? ' infected' : ''}">
        <div class="w95-icons">${icons.map(([id, ic, name]) => `<div class="w95-icon" data-app="${id}"><span>${ic}</span><label>${esc(corrupt(name, k, rng))}</label></div>`).join('')}</div>
        <div class="w95-windows"></div>
        <div class="w95-glitch"></div>
        <div class="w95-task"><button class="w95-start"><b>⊞</b> Start</button><div class="w95-tasks"></div><div class="w95-tray"><span class="w95-time">--:--</span></div></div>
        <div class="w95-menu hidden">
          <div class="w95-menu-side">Goan<b>98</b></div>
          <div class="w95-menu-items">
            ${icons.slice(0, 6).map(([id, ic, name]) => `<div data-app="${id}">${ic} ${esc(name)}</div>`).join('')}
            <hr><div data-act="shutdown">⏻ Shut Down... (stand up)</div>
          </div>
        </div>
      </div>`;
    this.win = this.el.querySelector('.w95-windows');
    this.menu = this.el.querySelector('.w95-menu');
    this.el.querySelectorAll('[data-app]').forEach(n => {
      n.ondblclick = () => this.launch(n.dataset.app);
      n.onclick = () => { if (n.closest('.w95-menu') || n.classList.contains('w95-icon') && this.lastClick === n && performance.now() - this.lastT < 450) this.launch(n.dataset.app); this.lastClick = n; this.lastT = performance.now(); this.menu.classList.add('hidden'); };
    });
    this.el.querySelector('.w95-start').onclick = e => { e.stopPropagation(); this.menu.classList.toggle('hidden'); audio.play('click', {}); };
    this.el.querySelector('[data-act=shutdown]').onclick = () => this.close();
    this.el.querySelector('.w95-desk').addEventListener('mousedown', e => { if (!e.target.closest('.w95-menu, .w95-start')) this.menu.classList.add('hidden'); });
    this.tickClock();
  }

  // ---- window manager
  window(id, title, html, { w = 420, h = 300, cls = '' } = {}) {
    const old = this.win.querySelector(`[data-win="${id}"]`);
    if (old) { old.style.zIndex = ++this.z; return old; }
    const n = this.win.children.length;
    const d = document.createElement('div');
    d.className = 'w95-win ' + cls;
    d.dataset.win = id;
    const R = this.el.getBoundingClientRect();
    d.style.cssText = `width:${w}px;height:${h}px;left:${Math.max(4, Math.min(R.width - w - 4, 90 + n * 26 + this.rng.int(0, 40)))}px;top:${Math.max(4, Math.min(R.height - h - 40, 40 + n * 22 + this.rng.int(0, 30)))}px;z-index:${++this.z}`;
    d.innerHTML = `<div class="w95-title"><span>${esc(title)}</span><button class="w95-x">✕</button></div><div class="w95-body">${html}</div>`;
    d.querySelector('.w95-x').onclick = () => { d.remove(); audio.play('click', {}); this.onWinClose?.(id); };
    d.addEventListener('mousedown', () => { d.style.zIndex = ++this.z; });
    // drag by the title bar
    const bar = d.querySelector('.w95-title');
    bar.addEventListener('pointerdown', e => {
      if (e.target.closest('button')) return;
      const sx = e.clientX - d.offsetLeft, sy = e.clientY - d.offsetTop;
      const move = ev => { d.style.left = (ev.clientX - sx) + 'px'; d.style.top = Math.max(0, ev.clientY - sy) + 'px'; };
      const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
      window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
    });
    this.win.appendChild(d);
    return d;
  }

  launch(app) {
    audio.play('click', {});
    this.menu.classList.add('hidden');
    // an infected machine sometimes hijacks whatever you open
    if (this.infected && this.rng.next() < 0.25) { this.virus(true); return; }
    this['app_' + app]?.();
  }

  // ---- apps
  app_clock() {
    const d = this.window('clock', 'Date/Time Properties', `<div class="w95-clock"><canvas width="160" height="160"></canvas><div class="w95-digi"></div><div class="w95-date"></div><div class="muted">Time zone: (GMT ??:??) ████████</div></div>`, { w: 300, h: 290 });
    this.clockEl = d;
    this.clockT = this.clockT ?? this.rng.next() * 43200;
    this.tickClock();
  }
  tickClock() {
    // the hands drift backwards, then jump
    const r = Math.random();
    this.clockT = (this.clockT ?? 0) + (r < 0.1 ? -this.rng.int(200, 4000) : r < 0.75 ? -1 : 37);
    const t = ((this.clockT % 86400) + 86400) % 86400;
    const tray = this.el.querySelector('.w95-time');
    if (tray) tray.textContent = Math.random() < 0.15 ? '??:??' : `${String(Math.floor(t / 3600) % 12 || 12).padStart(2, ' ')}:${String(Math.floor(t / 60) % 60).padStart(2, '0')} ${t < 43200 ? 'AM' : 'PM'}`;
    if (!this.clockEl?.isConnected) return;
    const c = this.clockEl.querySelector('canvas'), x = c.getContext('2d');
    x.clearRect(0, 0, 160, 160);
    x.fillStyle = '#fff'; x.beginPath(); x.arc(80, 80, 72, 0, 7); x.fill(); x.strokeStyle = '#222'; x.lineWidth = 3; x.stroke();
    for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; x.fillStyle = '#222'; x.fillRect(80 + Math.sin(a) * 62 - 2, 80 - Math.cos(a) * 62 - 2, 4, 4); }
    const hand = (a, len, w, col) => { x.strokeStyle = col; x.lineWidth = w; x.beginPath(); x.moveTo(80, 80); x.lineTo(80 + Math.sin(a) * len, 80 - Math.cos(a) * len); x.stroke(); };
    hand(t / 43200 * Math.PI * 2, 38, 5, '#111');
    hand(t / 3600 * Math.PI * 2, 56, 3, '#111');
    hand(t / 60 * Math.PI * 2 * (Math.random() < 0.2 ? -1 : 1), 62, 1, '#c00');
    const hh = Math.random() < 0.3 ? 20 + this.rng.int(4, 9) : Math.floor(t / 3600);
    this.clockEl.querySelector('.w95-digi').textContent = `${String(hh).padStart(2, '0')}:${String(Math.random() < 0.2 ? 60 + this.rng.int(0, 39) : Math.floor(t / 60) % 60).padStart(2, '0')}:${String(Math.floor(t) % 60).padStart(2, '0')}`;
    this.clockEl.querySelector('.w95-date').textContent = Math.random() < 0.5 ? 'Thursday, 0 ███████ 2013' : 'Thursday, 32 January 2013';
  }

  app_dialup() {
    const d = this.window('dialup', 'Connect To', `<div class="w95-form">
      <div class="w95-row"><label>User name:</label><input value="expedition" spellcheck="false"></div>
      <div class="w95-row"><label>Password:</label><input type="password" value="********"></div>
      <div class="w95-row"><label>Phone number:</label><input value="9,555-0144" spellcheck="false"></div>
      <div class="w95-status">Not connected.</div>
      <div class="w95-btns"><button class="w95-btn" data-go>Connect</button><button class="w95-btn" data-x>Cancel</button></div></div>`, { w: 340, h: 250 });
    const st = d.querySelector('.w95-status');
    d.querySelector('[data-x]').onclick = () => d.remove();
    d.querySelector('[data-go]').onclick = () => {
      const steps = ['Dialing...', 'Dialing... (attempt 2)', 'Verifying user name and password...', 'Registering your computer on the network...'];
      const ERR = ['Error 678: The remote computer did not respond.', 'Error 680: No dial tone.', 'Error 691: Access was denied because the user name does not exist on this floor.', 'Error 000: There is no one left to answer.'];
      let i = 0;
      audio.play('dtmf', { digit: 5 });
      const go = () => {
        if (!d.isConnected) return;
        if (i < (this.rng.next() < 0.5 ? 2 : 4)) { st.textContent = steps[i++]; if (i === 1) audio.play('modem', {}); this.after(go, 1300 + this.rng.int(0, 900)); return; }
        st.innerHTML = `<b>${esc(ERR[this.rng.int(0, ERR.length - 1)])}</b>`;
        audio.play('ui', { freq: 220 });
      };
      go();
    };
  }

  files() {
    if (this._files) return this._files;
    const rng = this.rng, k = 0.06 + rng.next() * 0.08;
    const pick = MEMOS.slice().sort(() => rng.next() - 0.5).slice(0, 4 + rng.int(0, 2));
    const docs = pick.map(([n, t]) => ({ name: n, text: corrupt(t, k, rng), raw: t, bad: false }));
    // some files are corrupted outright (a researcher can decrypt them)
    const n = rng.int(1, 3);
    for (let i = 0; i < n; i++) {
      const [nm, t] = MEMOS[rng.int(0, MEMOS.length - 1)];
      docs.push({ name: corrupt(nm, 0.4, rng), text: null, raw: t, bad: true });
    }
    // the phone clue: whole on infected machines, half-eaten elsewhere
    if (this.infected || rng.next() < 0.45) {
      const [nm, t] = PHONE_FILE(this.infected ? 0.02 : 0.35, rng);
      docs.push({ name: nm, text: t, raw: PHONE_FILE(0, rng)[1], bad: false, partial: !this.infected });
    }
    const odd = CRYPTIC[rng.int(0, CRYPTIC.length - 1)];
    docs.push({ name: '~$' + rng.int(1000, 9999) + '.TMP', text: odd, raw: odd, bad: false });
    return (this._files = docs);
  }
  app_explorer() {
    const docs = this.files();
    const d = this.window('explorer', 'Exploring - C:\\MY DOCUMENTS', `<div class="w95-explorer">
      <div class="w95-tree"><div>🖥 My Computer</div><div class="in">💾 3½ Floppy (A:)</div><div class="in">🗄 (C:)</div><div class="in2 on">📁 My Documents</div><div class="in2">📁 WINDOWS</div><div class="in2">📁 ${esc(corrupt('PERSONNEL', 0.5, this.rng))}</div><div class="in">💿 (D:)</div></div>
      <div class="w95-files">${docs.map((f, i) => `<div class="w95-file${f.bad ? ' bad' : ''}" data-i="${i}">${f.bad ? '⚠' : '📄'} ${esc(f.name)}</div>`).join('')}</div></div>
      <div class="w95-statusbar">${docs.length} object(s) · ${this.rng.int(1, 9)}.${this.rng.int(0, 9)}MB · free space: -${this.rng.int(10, 99)}KB</div>`, { w: 520, h: 330 });
    d.querySelectorAll('.w95-file').forEach(n => { n.ondblclick = n.onclick = () => this.openFile(docs[+n.dataset.i]); });
  }
  openFile(f) {
    audio.play('click', {});
    if (f.bad) {
      const d = this.window('err' + f.name, f.name, `<div class="w95-msg"><span class="w95-ico">⛔</span><div>${esc(f.name)}<br>This file is corrupted and cannot be opened.${this.researcher ? '<br><br><i>The byte pattern looks familiar — a simple rotation cipher layered over bad sectors. You could rebuild it.</i>' : ''}</div></div>
        <div class="w95-btns">${this.researcher ? '<button class="w95-btn" data-dec>Decrypt</button>' : ''}<button class="w95-btn" data-ok>OK</button></div>`, { w: 360, h: this.researcher ? 210 : 160 });
      d.querySelector('[data-ok]').onclick = () => d.remove();
      const dec = d.querySelector('[data-dec]');
      if (dec) dec.onclick = () => {
        dec.disabled = true; dec.textContent = 'Working...';
        this.after(() => { d.remove(); f.bad = false; f.text = f.raw; f.name = 'RECOVERED.TXT'; this.game.stats.scare(-4); this.openFile(f); }, 1600);
      };
      audio.play('ui', { freq: 220 });
      return;
    }
    const d = this.window('f' + f.name, f.name + ' - Notepad', `<textarea class="w95-note" readonly spellcheck="false"></textarea>`, { w: 440, h: 280 });
    let text = f.text;
    if (f.partial && this.researcher) text = f.raw + '\n\n[recovered by you from the damaged sectors]';
    d.querySelector('textarea').value = text;
  }

  app_calc() {
    const keys = ['C', '±', '%', '÷', '7', '8', '9', '×', '4', '5', '6', '−', '1', '2', '3', '+', '0', '.', '⌫', '='];
    const d = this.window('calc', 'Calculator', `<div class="w95-calc"><div class="w95-lcd">0.</div><div class="w95-keys">${keys.map(k => `<button class="w95-btn" data-k="${k}">${k}</button>`).join('')}</div></div>`, { w: 236, h: 300 });
    const lcd = d.querySelector('.w95-lcd');
    let cur = '0', acc = null, op = null, fresh = true;
    const show = v => { lcd.textContent = String(v).length > 14 ? Number(v).toExponential(8) : v; };
    const calc = (a, b, o) => o === '+' ? a + b : o === '−' ? a - b : o === '×' ? a * b : o === '÷' ? (b === 0 ? NaN : a / b) : b;
    const press = k => {
      if (/\d/.test(k)) { cur = fresh ? k : (cur === '0' ? k : cur + k); fresh = false; }
      else if (k === '.') { if (fresh) { cur = '0.'; fresh = false; } else if (!cur.includes('.')) cur += '.'; }
      else if (k === 'C') { cur = '0'; acc = null; op = null; fresh = true; }
      else if (k === '⌫') { cur = cur.length > 1 ? cur.slice(0, -1) : '0'; }
      else if (k === '±') cur = String(-parseFloat(cur));
      else if (k === '%') cur = String(parseFloat(cur) / 100);
      else if (k === '=') { if (op) { cur = String(+calc(acc, parseFloat(cur), op).toPrecision(12)); acc = null; op = null; } fresh = true; }
      else { if (op && !fresh) cur = String(+calc(acc, parseFloat(cur), op).toPrecision(12)); acc = parseFloat(cur); op = k; fresh = true; }
      if (cur === 'NaN') { show('Cannot divide by zero'); cur = '0'; fresh = true; return; }
      if (cur.replace('.', '') === DEEDEE_NUMBER) { show('SHE HEARS YOU'); audio.play('ui', { freq: 140 }); return; }
      show(cur);
    };
    d.querySelectorAll('[data-k]').forEach(b => { b.onclick = () => { press(b.dataset.k); audio.play('click', { volume: 0.4 }); }; });
    this.calcKeys = e => {
      if (!d.isConnected) return;
      const map = { '+': '+', '-': '−', '*': '×', '/': '÷', Enter: '=', '=': '=', Backspace: '⌫', Escape: null, Delete: 'C', '.': '.', ',': '.' };
      const k = /^\d$/.test(e.key) ? e.key : map[e.key];
      if (k) { e.preventDefault(); press(k); }
    };
    d.tabIndex = 0; d.focus();
    d.addEventListener('keydown', this.calcKeys);
  }

  app_forum() {
    const d = this.window('forum', 'GoanNet Navigator', `<div class="w95-browser"><div class="w95-url">Location: <span>http://forum.goan.net/board/level2/</span></div><div class="w95-page"><div class="w95-load">Connecting to host forum.goan.net...</div></div></div>`, { w: 560, h: 380 });
    const page = d.querySelector('.w95-page');
    const posts = ['Has anyone found the stairwell fuse?? (14)', 'DO NOT pick up the phones on this floor (3)', 'lost my team at the pools, L3, please (0)', 'vending machine bottle — worth it? (22)', 'the doors marked LEVEL 3 are real (7)', 'Ririqian flags on L1?? (5)', '[deleted] (██)', 'she sang outside my office for an hour (1)'];
    this.after(() => {
      if (!d.isConnected) return;
      page.innerHTML = `<div class="w95-load">Contacting forum.goan.net... ████████░░░░</div>`;
      this.after(() => {
        if (!d.isConnected) return;
        page.innerHTML = `<h3>The page cannot be displayed</h3><p>The server at <b>forum.goan.net</b> could not be found, or is no longer there.</p><hr>
          <p class="muted">Showing cached copy (last updated: ${corrupt('Thursday 0:00', 0.3, this.rng)}):</p>
          <div class="w95-cache"><b>GoanNet Boards › Level 2</b><ul>${posts.map(p => `<li>${esc(corrupt(p, 0.12, this.rng))}</li>`).join('')}</ul></div>`;
        audio.play('ui', { freq: 220 });
      }, 2600);
    }, 1400);
  }

  app_wiki() {
    const rng = this.rng;
    const d = this.window('wiki', 'WIKI.HTM - Local copy', `<div class="w95-browser"><div class="w95-url">Location: <span>file:///C:/WINDOWS/TEMP/WIKI.HTM</span></div><div class="w95-page w95-wiki"><h3>The Goanrooms Field Wiki</h3><p class="muted">Local copy · ${rng.int(30, 60)}% recovered</p>
      ${WIKI.map(([n, t]) => { const k = n === 'Deedee' ? 0.32 : rng.next() * 0.3; return `<div class="w95-entry"><b>${esc(corrupt(n, k * 0.4, rng))}</b><p>${esc(corrupt(t, this.researcher ? k * 0.35 : k, rng))}</p></div>`; }).join('')}
      </div></div>`, { w: 560, h: 420 });
    d.querySelector('.w95-page').scrollTop = 0;
  }

  app_bin() {
    const d = this.window('bin', 'Recycle Bin', `<div class="w95-files">${['RESIGNATION.DOC', 'IMG_0001.BMP', 'SHE_SINGS.WAV'].map(n => `<div class="w95-file">🗎 ${n}</div>`).join('')}</div><div class="w95-statusbar">3 object(s). The Recycle Bin cannot be emptied.</div>`, { w: 360, h: 200 });
    d.querySelectorAll('.w95-file').forEach(n => { n.onclick = () => { audio.play('ui', { freq: 220 }); this.window('binerr', 'Error', `<div class="w95-msg"><span class="w95-ico">⛔</span><div>Cannot open file: it is still being written.</div></div>`, { w: 300, h: 130 }); }; });
  }

  // ---- corruption & virus
  glitch() {
    const g = this.el.querySelector('.w95-glitch');
    if (!g) return;
    g.innerHTML = '';
    const n = 2 + Math.floor(Math.random() * 5);
    for (let i = 0; i < n; i++) {
      const b = document.createElement('div');
      b.style.cssText = `top:${Math.random() * 100}%;height:${2 + Math.random() * 18}px;left:${Math.random() * 30}%;width:${30 + Math.random() * 70}%;background:${['#0ff3', '#f0f4', '#fff2', '#0006'][i % 4]};transform:translateX(${(Math.random() - 0.5) * 40}px)`;
      g.appendChild(b);
    }
    this.el.querySelector('.w95-desk')?.classList.add('jolt');
    setTimeout(() => { g.innerHTML = ''; this.el.querySelector('.w95-desk')?.classList.remove('jolt'); }, 90 + Math.random() * 160);
  }
  virus(hijack = false) {
    if (!this.win) return;
    const count = this.win.querySelectorAll('.virus').length;
    if (count >= 7) return;
    const MSG = ['YOUR COMPUTER IS INFECTED', 'MAKE A CALL WITH THE NEAREST PHONE', 'CALL 1143141967', 'SHE WANTS TO HEAR YOUR VOICE', 'DEEDEE.EXE HAS PERFORMED AN ILLEGAL OPERATION', 'PICK UP THE PHONE', 'THE NEAREST PHONE. THE NEAREST PHONE.'];
    const m = MSG[hijack ? 1 : Math.floor(Math.random() * MSG.length)];
    const d = this.window('virus' + Math.random(), 'DEEDEE.EXE', `<div class="w95-virus"><div class="v-big">${esc(m)}</div><div class="v-num">☎ 114-314-1967</div></div>`, { w: 330, h: 150, cls: 'virus' });
    d.style.left = (Math.random() * 60 + 5) + '%'; d.style.top = (Math.random() * 55 + 5) + '%';
    audio.play('ui', { freq: 880 + Math.random() * 400 });
    this.el.querySelector('.w95-desk')?.classList.add('vflash');
    setTimeout(() => this.el.querySelector('.w95-desk')?.classList.remove('vflash'), 220);
    this.game?.stats.scare(1.5);
  }
}

// ------------------------------------------------------------------ phone
export class PhoneUI {
  constructor(ui) {
    this.ui = ui;
    this.el = document.createElement('div');
    this.el.id = 'phone';
    this.el.className = 'screen modal-screen';
    const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'];
    this.el.innerHTML = `<section class="phone-body">
      <div class="phone-lcd"><span class="phone-num"></span><span class="phone-st">DIAL TONE</span></div>
      <div class="phone-keys">${keys.map(k => `<button data-k="${k}">${k}</button>`).join('')}</div>
      <div class="phone-act"><button class="phone-call">CALL</button><button class="phone-clr">CLEAR</button><button class="phone-hang">HANG UP</button></div>
      <div class="phone-help">Type digits or click · Enter to call · Esc to hang up</div></section>`;
    document.body.appendChild(this.el);
    ui.onClose = ui.onClose || {};
    ui.onClose.phone = () => this.hangup();
    this.el.querySelectorAll('[data-k]').forEach(b => { b.onclick = () => this.press(b.dataset.k); });
    this.el.querySelector('.phone-call').onclick = () => this.call();
    this.el.querySelector('.phone-clr').onclick = () => { if (!this.busy) { this.num = ''; this.show(); } };
    this.el.querySelector('.phone-hang').onclick = () => ui.closeModal('phone');
    window.addEventListener('keydown', e => {
      if (!ui.open.has('phone')) return;
      if (/^[0-9*#]$/.test(e.key)) { this.press(e.key); e.preventDefault(); }
      else if (e.key === 'Backspace') { if (!this.busy) { this.num = this.num.slice(0, -1); this.show(); } e.preventDefault(); }
      else if (e.key === 'Enter') { this.call(); e.preventDefault(); }
    });
  }

  open(game, o) {
    this.game = game; this.o = o;
    this.num = ''; this.busy = false;
    this.status('DIAL TONE');
    this.show();
    this.ui.openModal('phone');
    this.tone = audio.loop('dialTone', { volume: 1 });
    audio.play('click', {});
  }
  show() { this.el.querySelector('.phone-num').textContent = this.num || '_'; }
  status(s) { this.el.querySelector('.phone-st').textContent = s; }
  press(k) {
    if (this.busy || this.num.length >= 14) return;
    if (this.tone) { this.tone.stop(0.05); this.tone = null; }
    this.num += k;
    audio.play('dtmf', { digit: k });
    this.show();
  }
  call() {
    if (this.busy || !this.num) return;
    this.busy = true;
    const n = this.num.replace(/[^0-9]/g, '');
    this.status('RINGING...');
    audio.play('ringback', {});
    const g = this.game;
    const T = setTimeout;
    if (n === DEEDEE_NUMBER) {
      T(() => { if (!this.busy) return; audio.play('ringback', {}); }, 3000);
      T(() => {
        if (!this.busy) return;
        this.status('CONNECTED');
        audio.play('radioStatic', { volume: 0.4 });
        g.subtitle('Someone picks up. Breathing. Then, very softly, humming.', 4);
        g.stats.scare(12);
        g.request({ t: 'call', l: g.levelId, n, x: g.player.pos.x, z: g.player.pos.z });
        T(() => this.ui.closeModal('phone'), 3200);
      }, 5600);
    } else {
      const msg = n.length < 7 ? 'The call cannot be completed as dialed.' : n === '911' ? 'All circuits are busy now.' : 'The number you have dialed is not in service.';
      T(() => {
        if (!this.busy) return;
        audio.play('phoneError', {});
        this.status('NOT IN SERVICE');
        g.subtitle(`A recording: "${msg}"`, 3);
        T(() => { if (this.busy) { this.busy = false; this.num = ''; this.show(); this.status('DIAL TONE'); this.tone = audio.loop('dialTone', { volume: 1 }); } }, 2400);
      }, 2200 + Math.random() * 1500);
    }
  }
  hangup() {
    this.busy = false;
    if (this.tone) { this.tone.stop(0.05); this.tone = null; }
    audio.play('click', {});
  }
}
