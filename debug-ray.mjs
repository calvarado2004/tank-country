import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true, executablePath: process.env.HOME + '/Library/Caches/ms-playwright/chromium-1223/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing' });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
page.on('pageerror', err => console.log('PAGEERROR', err.stack));
await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
await page.waitForTimeout(1000);
await page.click('#btn-deploy');
await page.waitForTimeout(3000);
const data = await page.evaluate(async () => {
  const g = window.__tankCountry;
  const THREE = await import('/node_modules/.vite/deps/three.js?v=??').catch(() => null);
  // use constructor from existing objects to create Raycaster
  const R = g.raycaster.constructor;
  const ray = new R();
  const out = [];
  for (const [x, y] of [[720, 10], [720, 40], [300, 850], [500, 830], [720, 450], [1200, 300]]) {
    const ndc = { x: (x / 1440) * 2 - 1, y: -(y / 900) * 2 + 1 };
    ray.setFromCamera(ndc, g.camera);
    const hits = ray.intersectObjects(g.scene.children, true).slice(0, 5).map(h => ({dist: +h.distance.toFixed(1), type: h.object.type, name: h.object.name, parentName: h.object.parent?.name, mat: h.object.material?.type, color: h.object.material?.color?.getHexString?.()}));
    out.push({x, y, hits});
  }
  return {
    out,
    sun: { cast: g.sun.castShadow, intensity: g.sun.intensity, shadowMap: g.sun.shadow.mapSize.toArray(), pos: g.sun.position.toArray(), target: g.sun.target.position.toArray() },
    renderer: { shadowEnabled: g.renderer.shadowMap.enabled, type: g.renderer.shadowMap.type },
    groundMap: { map: !!g.world.terrain.material.map, repeat: g.world.terrain.material.map?.repeat.toArray(), colorSpace: g.world.terrain.material.map?.colorSpace },
    roadMat: { side: g.world.roadMat.side, visible: g.world.mainRoad, map: !!g.world.roadMat.map },
    groups: g.scene.children.map(c => ({type:c.type, name:c.name, children:c.children.length, visible:c.visible})).slice(0,30),
  };
});
console.log(JSON.stringify(data, null, 2));
await page.screenshot({ path: '/tmp/tank-ray.png' });
await browser.close();
