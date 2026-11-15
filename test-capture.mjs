import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true, executablePath: process.env.HOME + '/Library/Caches/ms-playwright/chromium-1223/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing' });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const errors = [];
page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
page.on('pageerror', err => errors.push(err.stack));
await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
await page.waitForTimeout(1200);
await page.click('#btn-deploy');
await page.waitForTimeout(1500);

const failures = [];
const check = (label, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures.push(label);
};

const initial = await page.evaluate(() => {
  const g = window.__tankCountry;
  return {
    aimMode: g.input.aimMode,
    turret: g.player.turretLocalYaw,
    owners: g.world.outposts.map(o => o.owner),
  };
});
check('cannon starts forward', Math.abs(initial.turret) < 0.2, `turretLocalYaw=${initial.turret.toFixed(3)}`);
check('aim is hull-forward seeded', initial.aimMode === 'forward', initial.aimMode);
check('all outposts start hostile', initial.owners.every(o => o !== 'player'), initial.owners.join(','));

// Clear defenders and capture each outpost by standing in its ring.
for (const id of ['A', 'B', 'C']) {
  const captured = await page.evaluate(async (id) => {
    const g = window.__tankCountry;
    g.enemies.forEach(e => { e.dead = true; });
    g.artilleries.forEach(a => { a.dead = true; });
    g.bombers.forEach(b => { b.dead = true; });
    const o = g.world.outposts.find(x => x.id === id);
    g.player.position.set(o.x, g.world.height(o.x, o.z), o.z);
    o.progress = 0.98;
    await new Promise(r => setTimeout(r, 700));
    return { owner: o.owner, captures: g.stats.captures };
  }, id);
  check(`outpost ${id} captured`, captured.owner === 'player', JSON.stringify(captured));
}

const end = await page.evaluate(async () => {
  const g = window.__tankCountry;
  await new Promise(r => setTimeout(r, 4200));
  return {
    state: g.state,
    victory: g.victory,
    endVisible: !document.querySelector('#end-screen').classList.contains('hidden'),
    title: document.querySelector('#end-title').textContent,
  };
});
check('victory state reached', end.state === 'ended' && end.victory === true, JSON.stringify(end));
check('end screen shown', end.endVisible, end.title);
check('no console errors', errors.length === 0, errors.join(' | '));

await page.screenshot({ path: '/tmp/tank-victory.png' });
await browser.close();
if (failures.length) {
  console.error(`FAILED: ${failures.join(', ')}`);
  process.exitCode = 1;
} else {
  console.log('ALL CHECKS PASSED');
}
