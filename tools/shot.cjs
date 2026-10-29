// Usage: node tools/shot.cjs "<url query>" out.png [waitMs]
const { chromium } = require('playwright');
(async () => {
  const q = process.argv[2] || '';
  const out = process.argv[3] || 'shot.png';
  const wait = Number(process.argv[4] || 1500);
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const logs = [];
  page.on('console', m => logs.push(`[${m.type()}] ${m.text()}`));
  page.on('pageerror', e => logs.push(`[pageerror] ${e.message}\n${e.stack}`));
  const url = q.startsWith('http') ? q : `http://localhost:8080/tools/view.html?${q}`;
  await page.goto(url);
  try { await page.waitForFunction(() => window.__ready === true, null, { timeout: 120000 }); } catch (e) { logs.push('TIMEOUT waiting for ready'); }
  await page.waitForTimeout(wait);
  await page.screenshot({ path: out });
  const info = await page.evaluate(() => document.getElementById('info')?.textContent || '');
  console.log(info);
  console.log(logs.slice(0, 40).join('\n'));
  await browser.close();
})();
