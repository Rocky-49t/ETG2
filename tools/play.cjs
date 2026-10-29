// Usage: node tools/play.cjs "<query>" out.png [seconds] [script.js]
// Loads index.html with a query, waits, optionally runs a script in page, screenshots.
const { chromium } = require('playwright');
const fs = require('fs');
(async () => {
  const q = process.argv[2] || 'solo=1';
  const out = process.argv[3] || 'tools/out/play.png';
  const secs = Number(process.argv[4] || 6);
  const script = process.argv[5] ? fs.readFileSync(process.argv[5], 'utf8') : null;
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const logs = [];
  page.on('console', m => { if (m.type() !== 'debug') logs.push(`[${m.type()}] ${m.text()}`); });
  page.on('pageerror', e => logs.push(`[pageerror] ${e.message}\n${(e.stack || '').split('\n').slice(0, 6).join('\n')}`));
  await page.goto(`http://localhost:8080/index.html?${q}`);
  await page.waitForTimeout(secs * 1000);
  if (script) { try { const r = await page.evaluate(script); if (r !== undefined) console.log('script:', JSON.stringify(r)); } catch (e) { logs.push('[script error] ' + e.message); } await page.waitForTimeout(1500); }
  await page.screenshot({ path: out });
  console.log(logs.slice(0, 60).join('\n'));
  await browser.close();
})();
