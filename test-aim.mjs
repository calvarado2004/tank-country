import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true, executablePath: process.env.HOME + '/Library/Caches/ms-playwright/chromium-1223/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing' });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const errors = [];
page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
page.on('pageerror', err => errors.push(err.stack));

const failures = [];
const check = (label, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures.push(label);
};
const read = () => page.evaluate(() => {
  const g = window.__tankCountry;
  const tw = g.player.model.localToWorld(new g.player.position.constructor(0, 2.35, 0.3));
  return {
    aimMode: g.input.aimMode,
    turret: g.player.turretLocalYaw,
    aimAhead: -(g.input.aimPoint.z - tw.z),
    crosshair: (() => {
      const r = document.querySelector('#crosshair').getBoundingClientRect();
      return [Math.round(r.x + r.width / 2), Math.round(r.y + r.height / 2)];
    })(),
    markers: [...document.querySelectorAll('.world-marker')].map(el => ({
      top: Math.round(parseFloat(el.style.top)),
      labelTop: Math.round(el.getBoundingClientRect().top),
    })),
  };
});

await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
await page.waitForTimeout(1200);
// clicking Deploy leaves the pointer at the button, behind the tank
await page.click('#btn-deploy');
await page.waitForTimeout(1600);

const deploy = await read();
check('cannon starts forward after deploy', Math.abs(deploy.turret) < 0.2, `turret=${deploy.turret.toFixed(3)}`);
check('aim point is ahead of the hull', deploy.aimAhead > 10, `${deploy.aimAhead.toFixed(1)}m ahead`);
check('crosshair sits in front, not at the deploy button', deploy.crosshair[1] < 400, `y=${deploy.crosshair[1]}`);
check('edge markers stay below the top bar', deploy.markers.every(m => m.labelTop >= 80), JSON.stringify(deploy.markers));
const tops = deploy.markers.map(m => m.top);
check('edge markers do not overlap', new Set(tops).size === tops.length, tops.join(','));

await page.mouse.move(980, 320);
await page.waitForTimeout(900);
const moved = await read();
check('pointer takes over aim', moved.aimMode === 'pointer', moved.aimMode);
check('crosshair follows the pointer', Math.abs(moved.crosshair[0] - 980) < 2 && Math.abs(moved.crosshair[1] - 320) < 2, moved.crosshair.join(','));

const beforePause = moved.turret;
await page.click('#btn-pause');
await page.waitForTimeout(300);
await page.click('#btn-resume');
await page.waitForTimeout(700);
const resumed = await read();
check('pause/resume holds the aim', resumed.aimMode === 'hold' && Math.abs(resumed.turret - beforePause) < 0.05, `${beforePause.toFixed(3)} -> ${resumed.turret.toFixed(3)}`);

await page.keyboard.press('KeyH');
await page.waitForTimeout(400);
await page.click('#btn-help-ok');
await page.waitForTimeout(600);
const helpClosed = await read();
check('closing the field manual holds the aim', helpClosed.aimMode === 'hold' && Math.abs(helpClosed.turret - resumed.turret) < 0.05, `${resumed.turret.toFixed(3)} -> ${helpClosed.turret.toFixed(3)}`);

check('no console errors', errors.length === 0, errors.join(' | '));

await browser.close();
if (failures.length) {
  console.error(`FAILED: ${failures.join(', ')}`);
  process.exitCode = 1;
} else {
  console.log('ALL CHECKS PASSED');
}
