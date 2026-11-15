import { test, expect } from './fixtures.js';
import { deploy } from './helpers.js';

const read = (page) => page.evaluate(() => {
  const g = window.__tankCountry;
  const w = new g.player.position.constructor(0, 2.35, 0.3);
  g.player.model.updateMatrixWorld(true);
  const turret = g.player.model.localToWorld(w);
  const r = document.querySelector('#crosshair').getBoundingClientRect();
  return {
    aimMode: g.input.aimMode,
    turret: g.player.turretLocalYaw,
    aimAhead: -(g.input.aimPoint.z - turret.z),
    crosshair: [Math.round(r.x + r.width / 2), Math.round(r.y + r.height / 2)],
    markers: [...document.querySelectorAll('.world-marker')].map((el) => ({
      top: Math.round(parseFloat(el.style.top)),
      labelTop: Math.round(el.getBoundingClientRect().top),
    })),
  };
});

test('deploy keeps the cannon forward and the aim ahead of the hull', async ({ page }) => {
  await deploy(page);
  const state = await read(page);
  expect(Math.abs(state.turret)).toBeLessThan(0.2);
  expect(state.aimAhead).toBeGreaterThan(10);
  // The crosshair must sit above the deploy button at the bottom of the screen.
  expect(state.crosshair[1]).toBeLessThan(700);
  expect(state.markers.every((m) => m.labelTop >= 80)).toBe(true);
  const tops = state.markers.map((m) => m.top);
  expect(new Set(tops).size).toBe(tops.length);
});

test('pointer aim takes over and the crosshair follows', async ({ page }) => {
  await deploy(page);
  await page.mouse.move(980, 320);
  await page.waitForTimeout(700);
  const state = await read(page);
  expect(state.aimMode).toBe('pointer');
  expect(Math.abs(state.crosshair[0] - 980)).toBeLessThanOrEqual(2);
  expect(Math.abs(state.crosshair[1] - 320)).toBeLessThanOrEqual(2);
});

test('pause, resume and the field manual hold the turret', async ({ page }) => {
  await deploy(page);
  await page.mouse.move(980, 320);
  await page.waitForTimeout(500);
  const before = (await read(page)).turret;
  await page.click('#btn-pause');
  await page.waitForTimeout(250);
  await page.click('#btn-resume');
  await page.waitForTimeout(600);
  const resumed = await read(page);
  expect(resumed.aimMode).toBe('hold');
  expect(Math.abs(resumed.turret - before)).toBeLessThan(0.05);

  await page.keyboard.press('KeyH');
  await expect(page.locator('#help')).toBeVisible();
  await page.click('#btn-help-ok');
  await page.waitForTimeout(500);
  const closed = await read(page);
  expect(closed.aimMode).toBe('hold');
  expect(Math.abs(closed.turret - resumed.turret)).toBeLessThan(0.05);
});
