import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true, executablePath: process.env.HOME + '/Library/Caches/ms-playwright/chromium-1223/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing' });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
page.on('pageerror', err => console.log('PAGEERROR', err.stack));
await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
await page.waitForTimeout(1000);
await page.click('#btn-deploy');
await page.waitForTimeout(3000);
const info = await page.evaluate(() => {
  const pts = [[700, 20], [720, 30], [800, 50], [400, 850], [350, 800], [500, 880], [600, 870]];
  return pts.map(([x, y]) => {
    const el = document.elementFromPoint(x, y);
    let chain = [];
    let e = el;
    while (e && chain.length < 6) { chain.push({ tag: e.tagName, id: e.id, cls: e.className, rect: e.getBoundingClientRect ? (() => { const r = e.getBoundingClientRect(); return [r.x, r.y, r.width, r.height]; })() : null, style: getComputedStyle(e).background.slice(0, 80), filter: getComputedStyle(e).filter, boxShadow: getComputedStyle(e).boxShadow }); e = e.parentElement; }
    return { x, y, chain };
  });
});
console.log(JSON.stringify(info, null, 2));
// hide direct hud children one by one
const children = await page.evaluate(() => [...document.querySelectorAll('#hud > *')].map(e => ({ tag: e.tagName, id: e.id, cls: e.className })));
console.log(children);
for (let i = 0; i < children.length; i++) {
  await page.evaluate((i) => {
    const els = [...document.querySelectorAll('#hud > *')];
    els.forEach((e, j) => { e.style.display = j === i ? 'none' : ''; });
  }, i);
  await page.waitForTimeout(150);
  await page.screenshot({ path: `/tmp/hud-hide-${i}.png` });
}
await browser.close();
