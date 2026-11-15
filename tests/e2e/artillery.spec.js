import { test, expect } from './fixtures.js';
import { deploy, gameState } from './helpers.js';

test('Battery One arms a mission, refuses danger-close fire and cancels', async ({ page }) => {
  await deploy(page);
  await expect(page.locator('#battery-status')).toHaveText('READY');
  await expect(page.locator('#battery-missions')).toHaveText('3 missions');

  await page.keyboard.press('KeyF');
  await expect(page.locator('#barrage-panel')).toBeVisible();
  expect(await page.evaluate(() => window.__tankCountry.input.barrageMode)).toBe(true);

  await page.evaluate(() => {
    const g = window.__tankCountry;
    g.input.aimPoint.set(g.player.position.x + 5, g.player.position.y, g.player.position.z);
    g.callBarrage();
  });
  await page.waitForTimeout(300);
  await expect(page.locator('#alert-text')).toContainText('too close');
  const state = await gameState(page);
  expect(state.battery.missions).toBe(3);
  await expect(page.locator('#barrage-panel')).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(page.locator('#barrage-panel')).toBeHidden();
  expect(await page.evaluate(() => window.__tankCountry.input.barrageMode)).toBe(false);
});

test('a designated fire mission spends a shell and the battery fires three rounds', async ({ page }) => {
  await deploy(page);
  const target = await page.evaluate(() => {
    const g = window.__tankCountry;
    const squad = g.enemySquads[0];
    const tx = 0;
    const tz = 40;
    squad.order = 'hold';
    squad.home.set(tx, 0, tz);
    squad.holdPoint.set(tx, 0, tz);
    squad.position.set(tx, g.world.height(tx, tz), tz);
    squad.soldiers.forEach((s, i) => {
      s.pos.set(tx - 2 + i * 1.3, 0, tz);
      s.fireTimer = 999;
    });
    g.player.position.set(tx, g.world.height(tx, tz + 22), tz + 22);
    g.player.hullYaw = Math.PI;
    g.targetViewSize = 53;
    g.viewSize = 53;
    g.input.aimMode = 'hold';
    g.input.aimPoint.set(tx, g.world.height(tx, tz), tz);
    return { tx, tz, health: squad.soldiers.map((s) => s.health) };
  });
  await page.waitForTimeout(1000);

  const screen = await page.evaluate(({ tx, tz }) => {
    const g = window.__tankCountry;
    g.camera.updateMatrixWorld();
    const point = new g.player.position.constructor(tx, g.world.height(tx, tz) + 1, tz);
    point.project(g.camera);
    return {
      x: (point.x * 0.5 + 0.5) * window.innerWidth,
      y: (-point.y * 0.5 + 0.5) * window.innerHeight,
    };
  }, target);

  await page.keyboard.press('KeyF');
  await expect(page.locator('#barrage-panel')).toBeVisible();
  await page.mouse.click(screen.x, screen.y);

  await expect.poll(async () => (await gameState(page)).stats.barrages, { timeout: 5000 }).toBe(1);
  const after = await gameState(page);
  expect(after.battery.missions).toBe(2);
  expect(after.battery.queue).toBeGreaterThan(0);
  await expect(page.locator('#battery-status')).toHaveText('RELOADING');
  await expect(page.locator('#barrage-panel')).toBeHidden();

  await expect.poll(async () => (await gameState(page)).battery.gun, { timeout: 25_000 }).toBe(3);
  const fired = await gameState(page);
  expect(fired.battery.queue).toBe(0);
  expect(fired.battery.cooldown).toBeLessThan(24);

  await expect.poll(async () => page.evaluate((health) => {
    const squad = window.__tankCountry.enemySquads[0];
    return squad.dead || squad.soldiers.some((s, i) => !s.alive || s.health < health[i]);
  }, target.health), { timeout: 20_000 }).toBe(true);
});

test('battery rules and status branches execute in the browser', async ({ page }) => {
  await deploy(page);
  const result = await page.evaluate(async () => {
    const g = window.__tankCountry;
    const battery = g.battery;
    const core = await import('/src/artillery.js');

    const plans = core.planBarrage({ x: 0, z: 0 }, {
      shells: 2, spread: 1, spacing: 0.5, rng: () => 0.5,
    });
    const base = {
      point: { x: 40, z: 0 },
      player: { x: 0, z: 0 },
      spotters: [{ kind: 'tank', x: 0, z: 0, y: 1.4 }],
      missions: 3,
      cooldown: 0,
      heightAt: () => 0,
    };
    const rules = {
      emptyCall: core.validateFireMission().reason,
      ok: core.validateFireMission(base).ok,
      noTarget: core.validateFireMission({ ...base, point: null }).reason,
      noMissions: core.validateFireMission({ ...base, missions: 0 }).reason,
      cooldown: core.validateFireMission({ ...base, cooldown: 3 }).reason,
      danger: core.validateFireMission({ ...base, point: { x: 5, z: 0 } }).reason,
      unspotted: core.validateFireMission({ ...base, spotters: [] }).reason,
      blocked: core.findSpotter({ x: 40, z: 0 }, base.spotters, (x) => (Math.abs(x - 20) < 2 ? 10 : 0)),
    };

    battery.missions = 0;
    const dry = battery.status;
    battery.missions = 3;
    battery.cooldown = 5;
    const reloading = battery.status;
    battery.cooldown = 0;
    const danger = battery.validate({ x: g.player.position.x + 4, z: g.player.position.z });
    const far = battery.validate({ x: 150, z: 150 });
    const spotters = battery.spotters().length;
    const fallen = g.playerSquad.soldiers[0];
    fallen.alive = false;
    const spottersAfterLoss = battery.spotters().length;
    fallen.alive = true;
    battery.missions = 0;
    battery.resupply();
    const resupplied = battery.missions;
    battery.missions = 3;

    return {
      plans: plans.map((p) => ({ delay: p.delay })),
      rules,
      dry,
      reloading,
      danger: danger.reason,
      far: far.reason,
      spotters,
      spottersAfterLoss,
      resupplied,
    };
  });

  expect(result.plans).toEqual([{ delay: 0 }, { delay: 0.5 }]);
  expect(result.rules).toEqual({
    emptyCall: 'no-target',
    ok: true,
    noTarget: 'no-target',
    noMissions: 'no-missions',
    cooldown: 'cooldown',
    danger: 'danger-close',
    unspotted: 'unspotted',
    blocked: null,
  });
  expect(result.dry).toBe('DRY');
  expect(result.reloading).toBe('RELOADING');
  expect(result.danger).toBe('danger-close');
  expect(result.far).toBe('unspotted');
  expect(result.spotters).toBeGreaterThan(0);
  expect(result.spottersAfterLoss).toBe(result.spotters - 1);
  expect(result.resupplied).toBe(1);
});
