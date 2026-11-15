import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true, executablePath: process.env.HOME + '/Library/Caches/ms-playwright/chromium-1223/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing' });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
page.on('pageerror', err => console.log('PAGEERROR', err.stack));
await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
await page.waitForTimeout(1200);
await page.click('#btn-deploy');
await page.waitForTimeout(3000);
await page.evaluate(() => {
  const g = window.__tankCountry;
  g.scene.traverse(o => { if (o.isMesh && !o.parent) {} });
  g.scene.children.forEach(c => {
    if (c !== g.player.model && !c.isLight && c !== g.camera) c.visible = false;
  });
  // make player model unmissable
  g.player.model.traverse(o => {
    if (o.isMesh) {
      o.material = new o.material.constructor({ color: 0xff2200, roughness: 0.4, emissive: 0x441100 });
    }
  });
  g.player.model.position.y += 3;
  document.getElementById('hud').style.display = 'none';
  document.body.style.background = '#222';
});
await page.waitForTimeout(500);
await page.screenshot({ path: '/tmp/tank-isolate.png' });
console.log(await page.evaluate(() => {
  const g = window.__tankCountry;
  const box = new (g.camera.position.constructor)();
  const p = g.player.model.position.clone();
  p.project(g.camera);
  return {cam:g.camera.position.toArray(), target:g.cameraTarget.toArray(), pndc:p.toArray(), modelPos:g.player.model.position.toArray(), view:g.viewSize, calls:g.renderer.info.render.calls};
}));
await browser.close();
