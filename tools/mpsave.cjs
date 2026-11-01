// Co-op save test over the BroadcastChannel transport: host + client play,
// the host saves, both quit, the host hosts the save again, and the client
// rejoins and reclaims its character with its private token.
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
  const ctx = await browser.newContext({ viewport: { width: 1024, height: 600 } });
  const logs = [];
  const fails = [];
  const check = (name, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${extra}`); if (!ok) fails.push(name); };
  const mk = async (name) => {
    const p = await ctx.newPage();
    p.on('console', m => { if (m.type() === 'error') logs.push(`[${name} ${m.type()}] ${m.text()}`); });
    p.on('pageerror', e => logs.push(`[${name} pageerror] ${e.message}\n${(e.stack || '').split('\n').slice(0, 5).join('\n')}`));
    await p.goto('http://localhost:8080/index.html?quality=low');
    await p.waitForFunction(() => document.getElementById('menu').classList.contains('show'), null, { timeout: 120000 });
    return p;
  };
  const A = await mk('host');
  const B = await mk('client');
  const lobby = async (useSave) => {
    await A.bringToFront();
    await A.evaluate(() => document.getElementById('btnHost').click());
    await A.selectOption('#netMode', 'local');
    if (useSave) {
      await A.click('#btnLobbyLoad');
      await A.waitForSelector('#savesList .save-row');
      await A.evaluate(() => { const row = [...document.querySelectorAll('#savesList .save-row')].find(r => r.querySelector('.slot').textContent === 'Slot 2'); [...row.querySelectorAll('button')].find(b => b.textContent === 'Use').click(); });
      console.log('lobby save:', await A.textContent('#lobbySave'));
    } else {
      await A.fill('#seedInput', 'SAVETEST');
      await A.evaluate(() => { document.getElementById('prologueToggle').checked = false; });
    }
    await A.click('#btnStart');
    await A.waitForFunction(() => document.getElementById('roomCode').textContent !== '-----', null, { timeout: 10000 });
    const code = await A.textContent('#roomCode');
    await B.bringToFront();
    await B.evaluate(() => document.getElementById('btnJoin').click());
    await B.selectOption('#netMode', 'local');
    await B.fill('#joinCodeInput', code);
    await B.click('#btnDoJoin');
    await A.waitForFunction(() => document.querySelectorAll('#lobbyPlayers li').length >= 2, null, { timeout: 10000 });
    await B.click('#btnReady');
    await A.waitForTimeout(400);
    await A.click('#btnStart');
    await A.waitForFunction(() => window.__app.game && window.__app.game.levelId && !window.__app.game.transitioning, null, { timeout: 120000 });
    await B.waitForFunction(() => window.__app.game && window.__app.game.levelId && !window.__app.game.transitioning, null, { timeout: 120000 });
  };

  // ---- 1. play and save
  await lobby(false);
  await A.evaluate(() => window.__app.game.chooseRole('soldier'));
  await B.evaluate(() => window.__app.game.chooseRole('medic'));
  const items = '/src/game/items.js';
  await B.evaluate(async (items) => {
    const g = window.__app.game, I = await import(items);
    g.inventory.add(I.makeItem('sniper')); g.gear.feet = I.makeItem('combatBoots'); g.applyArmorMods(); g.stats.health = 71;
    g.player.teleport(21, 0, 19, 0.5);
  }, items);
  await A.evaluate(() => { const g = window.__app.game; g.world.setFlag(g.levelId, 'savetest', 7); });
  await A.waitForTimeout(800);
  const err = await A.evaluate(() => window.__app.game.saveToSlot('2', 'MP Test'));
  check('host saved', err === null, String(err));
  await A.waitForTimeout(300);
  const runId = await A.evaluate(() => window.__app.game.runId);
  const tok = await B.evaluate(async (run) => (await import('/src/game/save.js')).getToken(run), runId);
  check('client received token', !!tok && /^[0-9a-f]{32}$/.test(tok));
  const save = await A.evaluate(async () => (await (await import('/src/game/save.js')).readSlot('2')).save);
  check('save holds client char', save.players.length === 1 && save.players[0].char.classId === 'medic' && save.players[0].char.inv.slots.some(s => s && s.id === 'sniper'));

  // ---- 2. quit and host the save again
  await B.evaluate(() => window.__app.quitToMenu());
  await A.evaluate(() => window.__app.quitToMenu());
  await A.waitForTimeout(500);
  await lobby(true);
  await B.waitForFunction(() => window.__app.game && window.__app.game.classId === 'medic', null, { timeout: 15000 }).catch(() => {});
  await B.waitForTimeout(1500);
  const rb = await B.evaluate(() => { const g = window.__app.game; return { cls: g.classId, sniper: g.inventory.slots.some(s => s && s.id === 'sniper'), feet: g.gear.feet?.id, hp: Math.round(g.stats.health), x: +g.player.pos.x.toFixed(1), z: +g.player.pos.z.toFixed(1), flag: g.world.flag(g.levelId, 'savetest') }; });
  check('client reclaimed character', rb.cls === 'medic' && rb.sniper && rb.feet === 'combatBoots' && rb.hp === 71, JSON.stringify(rb));
  check('client back at saved spot', Math.abs(rb.x - 21) < 1.5 && Math.abs(rb.z - 19) < 1.5);
  check('world flags restored on client', rb.flag === 7);
  const ra = await A.evaluate(() => { const g = window.__app.game; return { cls: g.classId, claimed: g.savedPlayers.filter(p => p.claimed).length }; });
  check('host restored + slot claimed', ra.cls === 'soldier' && ra.claimed === 1, JSON.stringify(ra));

  // ---- 3. a second claim (e.g. a guessed token) is refused
  const before = await B.evaluate(() => window.__app.game.inventory.slots.filter(Boolean).length);
  await B.evaluate(() => { const g = window.__app.game; g.awaitingRestore = true; g.request({ t: 'claim', tok: 'a'.repeat(32) }); });
  await B.waitForTimeout(800);
  const after = await B.evaluate(() => window.__app.game.inventory.slots.filter(Boolean).length);
  check('repeat claim ignored', before === after);
  // ---- 4. a client can't push save data unasked
  await B.evaluate(() => window.__app.game.request({ t: 'saveData', sid: 'x', char: { classId: 'soldier' } }));
  await A.waitForTimeout(300);
  check('unsolicited saveData ignored', await A.evaluate(() => !window.__app.game._saveReq));

  console.log(logs.slice(0, 20).join('\n'));
  console.log(fails.length ? `${fails.length} FAILED` : 'ALL PASSED');
  await browser.close();
  process.exit(fails.length ? 1 : 0);
})();
