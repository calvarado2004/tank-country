import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true, executablePath: process.env.HOME + '/Library/Caches/ms-playwright/chromium-1223/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing' });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const errors = [];
page.on('console', msg => { if (msg.type() === 'error') errors.push('CONSOLE: ' + msg.text()); });
page.on('pageerror', err => errors.push('PAGEERROR: ' + err.stack));
await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
await page.waitForTimeout(1200);
await page.screenshot({ path: '/tmp/tank-intro2.png' });
await page.click('#btn-deploy');
await page.waitForTimeout(2600);
await page.screenshot({ path: '/tmp/tank-play1.png' });
// drive forward
await page.keyboard.down('KeyW');
await page.waitForTimeout(2500);
await page.keyboard.up('KeyW');
await page.waitForTimeout(300);
// move mouse to a point ahead (screen upper-center) and click
await page.mouse.move(760, 430);
await page.waitForTimeout(300);
await page.mouse.down();
await page.waitForTimeout(200);
await page.mouse.up();
await page.waitForTimeout(900);
await page.screenshot({ path: '/tmp/tank-play2.png' });
// look around / fire more
await page.mouse.move(660, 400);
await page.mouse.down(); await page.waitForTimeout(100); await page.mouse.up();
await page.waitForTimeout(600);
await page.keyboard.down('KeyD');
await page.waitForTimeout(1400);
await page.keyboard.up('KeyD');
await page.waitForTimeout(300);
await page.screenshot({ path: '/tmp/tank-play3.png' });
console.log('ERRORS', JSON.stringify(errors, null, 2));
console.log('state', await page.evaluate(() => ({state: window.__tankCountry.state, player: window.__tankCountry.player.position.toArray(), health: window.__tankCountry.player.health, enemies: window.__tankCountry.enemies.length, fpsHint: window.__tankCountry.elapsed})));
await browser.close();
