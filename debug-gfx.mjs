import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true, executablePath: process.env.HOME + '/Library/Caches/ms-playwright/chromium-1223/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing' });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
page.on('pageerror', err => console.log('PAGEERROR', err.stack));
await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
await page.waitForTimeout(1000);
await page.click('#btn-deploy');
await page.waitForTimeout(3000);
await page.evaluate(() => {
  const g = window.__tankCountry;
  g.sun.castShadow = false;
  g.world.roadMat.side = 2;
  g.world.trackMat.side = 2;
  g.world.terrain.material.map.repeat.set(18,18);
  g.world.terrain.material.map.needsUpdate = true;
  // brighten material to see
  g.world.terrain.material.roughness = 0.9;
  g.renderer.shadowMap.needsUpdate = true;
});
await page.waitForTimeout(600);
await page.screenshot({ path: '/tmp/tank-noshadow.png' });
await page.evaluate(() => {
  const g = window.__tankCountry;
  g.sun.castShadow = true;
  g.sun.shadow.bias = -0.0001;
  g.sun.shadow.normalBias = 0.02;
  g.renderer.shadowMap.needsUpdate = true;
});
await page.waitForTimeout(800);
await page.screenshot({ path: '/tmp/tank-shadow.png' });
await browser.close();
