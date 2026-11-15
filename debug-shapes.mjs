import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true, executablePath: process.env.HOME + '/Library/Caches/ms-playwright/chromium-1223/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing' });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
page.on('pageerror', err => console.log('PAGEERROR', err.stack));
await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
await page.waitForTimeout(1000);
await page.click('#btn-deploy');
await page.waitForTimeout(3000);
// disable all shadows and force material recompile
await page.evaluate(() => {
  const g = window.__tankCountry;
  g.sun.castShadow = false;
  g.renderer.shadowMap.enabled = false;
  g.scene.traverse(o => {
    if (o.material) {
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      mats.forEach(m => { m.needsUpdate = true; });
    }
  });
});
await page.waitForTimeout(800);
await page.screenshot({ path: '/tmp/tank-noshadow2.png' });
// hide all scene children except terrain, road, tank, and lights
await page.evaluate(() => {
  const g = window.__tankCountry;
  g.scene.children.forEach(c => {
    if (c === g.world.terrain || c === g.player.model || c.isLight || c === g.camera) return;
    if (c.isMesh && c.material && (c.material.map && c.material.map.image && c.material.map.image.width === 512)) return;
    c.visible = false;
  });
  document.getElementById('hud').style.display = 'none';
  document.querySelectorAll('.screen-fx').forEach(e => e.style.display = 'none');
});
await page.waitForTimeout(500);
await page.screenshot({ path: '/tmp/tank-onlyterrain.png' });
await browser.close();
