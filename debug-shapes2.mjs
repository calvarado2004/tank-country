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
  document.getElementById('hud').style.display = 'none';
  document.querySelectorAll('.screen-fx').forEach(e => e.style.display = 'none');
  g.sun.castShadow = false;
  g.renderer.shadowMap.enabled = false;
  g.scene.traverse(o => { if (o.material) { (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => m.needsUpdate = true); } });
});
await page.waitForTimeout(500);
await page.screenshot({ path: '/tmp/tank-nohud.png' });
// hide world groups one by one, screenshot at each step
const groupInfo = await page.evaluate(() => {
  const g = window.__tankCountry;
  return g.scene.children.map((c, i) => ({ i, type: c.type, name: c.name, kids: c.children.length, visible: c.visible, hasMap: c.isMesh ? !!c.material?.map : null }));
});
console.log(groupInfo.filter(x => x.type !== 'Sprite' && x.type !== 'PointLight' && x.type !== 'DirectionalLight' && x.type !== 'HemisphereLight').slice(0, 40));
// hide world groups except terrain & tank & roads
await page.evaluate(() => {
  const g = window.__tankCountry;
  g.scene.children.forEach(c => {
    if (c === g.world.terrain || c === g.player.model || c.isLight || c === g.camera) return;
    if (c.isMesh) {
      const img = c.material?.map?.image;
      if (img && img.width === 512) return; // roads
    }
    c.visible = false;
  });
});
await page.waitForTimeout(500);
await page.screenshot({ path: '/tmp/tank-nohud2.png' });
await browser.close();
