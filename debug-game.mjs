import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true, executablePath: process.env.HOME + '/Library/Caches/ms-playwright/chromium-1223/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing' });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
page.on('pageerror', err => console.log('PAGEERROR', err.stack));
await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
await page.waitForTimeout(1200);
await page.click('#btn-deploy');
await page.waitForTimeout(3000);
const data = await page.evaluate(() => {
  const g = window.__tankCountry;
  const p = g.player;
  const pos = p.model.position.clone();
  const wp = pos.clone(); p.model.getWorldPosition(wp);
  const ndc = wp.clone().project(g.camera);
  const centerNdc = p.position.clone().add({x:0,y:2,z:0}).project(g.camera);
  const cam = { pos: g.camera.position.toArray(), target: g.cameraTarget.toArray(), view: g.viewSize, near: g.camera.near, far: g.camera.far, left: g.camera.left, right: g.camera.right, top: g.camera.top, bottom: g.camera.bottom };
  const terrain = g.world.terrain;
  return {
    state: g.state,
    player: {pos: p.position.toArray(), modelPos: pos.toArray(), worldPos: wp.toArray(), visible: p.model.visible, parent: !!p.model.parent, children: p.model.children.length, scale: p.model.scale.toArray(), ndc: ndc.toArray(), health: p.health},
    camera: cam,
    terrain: {pos: terrain.position.toArray(), visible: terrain.visible, geomVerts: terrain.geometry.attributes.position.count, matType: terrain.material.type, map: !!terrain.material.map, vertexColors: terrain.material.vertexColors},
    renderer: g.renderer.info.render,
    sceneChildren: g.scene.children.length,
    aim: g.input.aimPoint.toArray(),
    cameraWorldDir: g.camera.getWorldDirection(new g.player.position.constructor()).toArray(),
    centerNdc: centerNdc.toArray(),
    heightAtPlayer: g.world.height(p.position.x, p.position.z),
    inputCameraYaw: g.input.cameraYaw,
  };
});
console.log(JSON.stringify(data, null, 2));
// get screenshot center crop
await page.screenshot({ path: '/tmp/tank-debug.png' });
await browser.close();
