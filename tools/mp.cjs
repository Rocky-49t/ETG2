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
  await B.click('#btnJoin');
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
  // put the client next to the host, facing them
  await A.evaluate(() => { const g = window.__app.game; g.player.teleport(17, 0, 17, 0); });
  await B.evaluate(() => { const g = window.__app.game; g.player.teleport(17, 0, 13, Math.PI); });
  await A.waitForTimeout(6000);
  const sa = await A.evaluate(() => { const g = window.__app.game; return { remotes: [...g.remotes.values()].map(r => [r.name, r.levelId, r.st.x?.toFixed(1), r.st.z?.toFixed(1)]), pstate: g.pstate.size, ents: g.entities.list.size }; });
  const sb = await B.evaluate(() => { const g = window.__app.game; return { remotes: [...g.remotes.values()].map(r => [r.name, r.levelId, r.st.x?.toFixed(1), r.st.z?.toFixed(1)]), host: g.isHost, views: g.views.views.size }; });
  console.log('A', JSON.stringify(sa));
  console.log('B', JSON.stringify(sb));
  // client spawns a hush near both (via host) and picks up an item
  await A.evaluate(() => { const g = window.__app.game; g.entities.spawn('hush', g.levelId, 20, 15); });
  await B.evaluate(() => { const g = window.__app.game; g.request({ t: 'chat', text: 'hello from B' }); });
  await A.waitForTimeout(4000);
  console.log('A views', await A.evaluate(() => window.__app.game.views.views.size), 'B views', await B.evaluate(() => window.__app.game.views.views.size));
  console.log('A chat', await A.textContent('#chatLog'));
  await A.screenshot({ path: 'tools/out/mpA.png' });
  await B.screenshot({ path: 'tools/out/mpB.png' });
  console.log(logs.slice(0, 30).join('\n'));
  await browser.close();
})();
