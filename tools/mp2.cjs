// Co-op: downing/revive + late join over the local transport.
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
  const ctx = await browser.newContext({ viewport: { width: 800, height: 450 } });
  const logs = [];
  const mk = async (name) => {
    const p = await ctx.newPage();
    p.on('pageerror', e => logs.push(`[${name} pageerror] ${e.message}\n${(e.stack || '').split('\n').slice(0, 4).join('\n')}`));
    p.on('console', m => { if (m.type() === 'error') logs.push(`[${name} error] ${m.text()}`); });
    await p.goto('http://localhost:8080/index.html');
    await p.waitForFunction(() => document.getElementById('menu').classList.contains('show'), null, { timeout: 120000 });
    return p;
  };
  const A = await mk('host'), B = await mk('client');
  await A.click('#btnHost'); await A.selectOption('#netMode', 'local'); await A.click('#btnStart');
  await A.waitForFunction(() => document.getElementById('roomCode').textContent !== '-----');
  const code = await A.textContent('#roomCode');
  await B.click('#btnJoin'); await B.selectOption('#netMode', 'local'); await B.fill('#joinCodeInput', code); await B.click('#btnDoJoin');
  await A.waitForFunction(() => document.querySelectorAll('#lobbyPlayers li').length >= 2);
  await A.click('#btnStart'); await A.waitForTimeout(300); await A.click('#btnStart');
  await A.waitForFunction(() => window.__app.game && window.__app.game.levelId, null, { timeout: 120000 });
  await B.waitForFunction(() => window.__app.game && window.__app.game.levelId, null, { timeout: 120000 });
  await A.waitForTimeout(3000);
  const bid = await B.evaluate(() => window.__app.game.myId);
  // host hurts the client to zero
  await A.evaluate((bid) => window.__app.game.hostHurt(bid, 250, { type: 'test' }), bid);
  await A.waitForTimeout(1500);
  console.log('B downed?', await B.evaluate(() => ({ downed: window.__app.game.downed, dead: window.__app.game.dead })));
  console.log('A sees B downed?', await A.evaluate((bid) => window.__app.game.remotes.get(bid)?.st.downed, bid));
  await A.evaluate((bid) => window.__app.game.request({ t: 'revive', target: bid }), bid);
  await A.waitForTimeout(1500);
  console.log('B after revive', await B.evaluate(() => ({ downed: window.__app.game.downed, hp: window.__app.game.stats.health })));
  // late joiner
  const C = await mk('late');
  await C.evaluate((code) => { document.getElementById('btnJoin').click(); document.getElementById('netMode').value = 'local'; document.getElementById('joinCodeInput').value = code; document.getElementById('btnDoJoin').click(); }, code);
  await C.waitForFunction(() => window.__app.game && window.__app.game.levelId, null, { timeout: 120000 });
  await C.waitForTimeout(4000);
  console.log('C', await C.evaluate(() => ({ lvl: window.__app.game.levelId, remotes: window.__app.game.remotes.size, pos: [window.__app.game.player.pos.x.toFixed(1), window.__app.game.player.pos.z.toFixed(1)] })));
  console.log('A remotes', await A.evaluate(() => window.__app.game.remotes.size), 'B remotes', await B.evaluate(() => window.__app.game.remotes.size));
  // host moves to Level 1 while clients stay: players in different levels
  await A.evaluate(() => window.__app.game.enterLevel('L1'));
  await A.waitForTimeout(6000);
  console.log('levels', await A.evaluate(() => window.__app.game.levelId), await B.evaluate(() => window.__app.game.levelId), 'B sees A in', await B.evaluate(() => [...window.__app.game.remotes.values()].map(r => r.levelId)));
  console.log(logs.slice(0, 20).join('\n'));
  await browser.close();
})();
