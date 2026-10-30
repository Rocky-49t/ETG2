// Two-tab multiplayer smoke test over the BroadcastChannel transport.
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
  const ctx = await browser.newContext({ viewport: { width: 1024, height: 600 } });
  const logs = [];
  const mk = async (name) => {
    const p = await ctx.newPage();
    p.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') logs.push(`[${name} ${m.type()}] ${m.text()}`); });
    p.on('pageerror', e => logs.push(`[${name} pageerror] ${e.message}\n${(e.stack || '').split('\n').slice(0, 5).join('\n')}`));
    await p.goto('http://localhost:8080/index.html');
    await p.waitForFunction(() => document.getElementById('menu').classList.contains('show'), null, { timeout: 120000 });
    return p;
  };
  const A = await mk('host');
  const B = await mk('client');
  await A.click('#btnHost');
  await A.selectOption('#netMode', 'local');
  await A.fill('#seedInput', 'MPTEST');
  await A.click('#btnStart');
  await A.waitForFunction(() => document.getElementById('roomCode').textContent !== '-----', null, { timeout: 10000 });
  const code = await A.textContent('#roomCode');
  console.log('room', code);
  await B.bringToFront(); await B.evaluate(() => document.getElementById('btnJoin').click());
  await B.selectOption('#netMode', 'local');
  await B.fill('#joinCodeInput', code);
  await B.click('#btnDoJoin');
  await A.waitForFunction(() => document.querySelectorAll('#lobbyPlayers li').length >= 2, null, { timeout: 10000 });
  await B.click('#btnReady');
  await A.waitForTimeout(500);
  console.log('lobby A:', await A.textContent('#lobbyPlayers'));
  console.log('lobby B:', await B.textContent('#lobbyPlayers'));
  await A.click('#btnStart');
  await A.waitForTimeout(1000);
  await A.waitForFunction(() => window.__app.game && window.__app.game.levelId, null, { timeout: 120000 });
  await B.waitForFunction(() => window.__app.game && window.__app.game.levelId, null, { timeout: 120000 });
  await A.evaluate(() => window.__app.game.chooseRole('soldier'));
  await B.evaluate(() => window.__app.game.chooseRole('medic'));
  await A.evaluate(() => { const g = window.__app.game; g.player.teleport(17, 0, 17, 0); });
  await B.evaluate(() => { const g = window.__app.game; g.player.teleport(17, 0, 13, Math.PI); g.lights.on = true; });
  await A.waitForTimeout(2500);
  console.log('A sees B class:', await A.evaluate(() => [...window.__app.game.remotes.values()].map(r => r.classId)));
  console.log('A remote spot intensity:', await A.evaluate(() => window.__app.game.lights.remote.map(l => Math.round(l.intensity))));
  // chat open + Esc
  await B.bringToFront();
  await B.evaluate(() => { const a = window.__app; a.ui.openChat(a.game); });
  await B.waitForTimeout(200);
  await B.keyboard.press('Escape');
  await B.waitForTimeout(200);
  console.log('B chat open after Esc:', await B.evaluate(() => window.__app.ui.open.has('chat')));
  // B fires the soldier... B is medic: give pistol and fire via fire()
  const holesBefore = await A.evaluate(() => window.__app.game.effects.holes.length);
  await B.evaluate(() => { const g = window.__app.game; g.player.pitch = -0.3; g.held.fire({ damage: 10, pellets: 1, spread: 0, adsSpread: 0, range: 50, recoil: 0.01, flash: 0.4, sound: 'pistol', noise: 10 }); });
  await A.waitForTimeout(800);
  console.log('A bullet holes', holesBefore, '->', await A.evaluate(() => window.__app.game.effects.holes.length));
  // B goes down (teammate alive) then gives up -> respawn
  await B.evaluate(() => { const g = window.__app.game; g.stats.damage(500, 'hush'); });
  console.log('B downed:', await B.evaluate(() => window.__app.game.downed));
  await B.evaluate(() => { const g = window.__app.game; g.die('gave up'); g.respawn(); });
  console.log('B after respawn dead/downed:', await B.evaluate(() => [window.__app.game.dead, window.__app.game.downed, Math.round(window.__app.game.stats.health)]));
  // bring B to A via console on A (host)
  await A.evaluate(() => { const a = window.__app; a.console.game = a.game; a.console.run('bring all'); });
  await B.waitForTimeout(1500);
  console.log('B pos after bring:', await B.evaluate(() => { const p = window.__app.game.player.pos; return [p.x.toFixed(1), p.z.toFixed(1)]; }));
  console.log('loot players:', await A.evaluate(() => window.__app.game.lootPlayers), await B.evaluate(() => window.__app.game.lootPlayers));
  console.log(logs.slice(0, 30).join('\n'));
  await browser.close();
})();
