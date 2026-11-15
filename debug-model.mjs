import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true, executablePath: process.env.HOME + '/Library/Caches/ms-playwright/chromium-1223/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing' });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
page.on('pageerror', err => console.log('PAGEERROR', err.stack));
await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
await page.waitForTimeout(1000);
await page.click('#btn-deploy');
await page.waitForTimeout(2000);
const data = await page.evaluate(() => {
  const g = window.__tankCountry;
  const p = g.player;
  const meshes = [];
  p.model.updateMatrixWorld(true);
  p.model.traverse(o => {
    if (o.isMesh) {
      const v = o.position.clone(); o.getWorldPosition(v);
      meshes.push({
        type: o.geometry.type,
        visible: o.visible,
        mat: o.material.type,
        matVisible: o.material.visible,
        opacity: o.material.opacity,
        worldPos: v.toArray(),
        posFinite: Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z),
        matrixFinite: o.matrixWorld.elements.every(Number.isFinite),
        scale: o.scale.toArray(),
        geoBoundingSphere: o.geometry.boundingSphere ? o.geometry.boundingSphere.radius : null,
      });
    }
  });
  const body = p.model.userData.body;
  return {
    meshes: meshes.slice(0, 20),
    meshCount: meshes.length,
    bodyRot: body ? [body.rotation.x, body.rotation.y, body.rotation.z] : null,
    bodyPos: body ? body.position.toArray() : null,
    rootRot: [p.model.rotation.x, p.model.rotation.y, p.model.rotation.z],
    turretRot: [p.model.userData.turret.rotation.x, p.model.userData.turret.rotation.y, p.model.userData.turret.rotation.z],
    barrelRot: [p.model.userData.barrelPivot.rotation.x, p.model.userData.barrelPivot.rotation.y, p.model.userData.barrelPivot.rotation.z],
    barrelPos: p.model.userData.barrelPivot.position.toArray(),
    aimPoint: g.input.aimPoint.toArray(),
    turretLocalYaw: p.turretLocalYaw,
    barrelPitch: p.barrelPitch,
    bodyWorldMatrix: body ? Array.from(body.matrixWorld.elements) : null,
  };
});
console.log(JSON.stringify(data, null, 2));
await browser.close();
