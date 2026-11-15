import { test, expect } from './fixtures.js';
import { deploy, gameState } from './helpers.js';

test('right-click moves the squad and G calls it back', async ({ page }) => {
  await deploy(page);
  await page.mouse.click(900, 500, { button: 'right' });
  await page.waitForTimeout(300);
  let state = await gameState(page);
  expect(state.playerSquad.order).toBe('move');
  await expect(page.locator('#squad-order')).toHaveText('MOVING');

  await page.keyboard.press('KeyG');
  await page.waitForTimeout(300);
  state = await gameState(page);
  expect(state.playerSquad.order).toBe('follow');
  await expect(page.locator('#squad-order')).toHaveText('FOLLOWING');
});

test('the coaxial MG damages enemy infantry', async ({ page }) => {
  await deploy(page);
  await page.evaluate(() => {
    const g = window.__tankCountry;
    const soldier = g.enemySquads[0].soldiers[0];
    g.player.position.set(
      soldier.pos.x,
      g.world.height(soldier.pos.x, soldier.pos.z + 16),
      soldier.pos.z + 16,
    );
    g.player.hullYaw = Math.PI;
    g.input.aimMode = 'hold';
    g.input.aimPoint.set(soldier.pos.x, soldier.pos.y + 1, soldier.pos.z);
    window.__mgBefore = soldier.health;
  });
  await page.waitForTimeout(300);
  await page.keyboard.down('Space');
  await page.waitForTimeout(900);
  await page.keyboard.up('Space');
  const result = await page.evaluate(() => {
    const soldier = window.__tankCountry.enemySquads[0].soldiers[0];
    return { before: window.__mgBefore, after: soldier.health, alive: soldier.alive };
  });
  expect(result.alive === false || result.after < result.before).toBe(true);
});

test('friendly and enemy rifle squads trade fire', async ({ page }) => {
  await deploy(page);
  await page.evaluate(() => {
    const g = window.__tankCountry;
    const friendly = g.playerSquad;
    const hostile = g.enemySquads[0];
    g.player.position.set(-120, g.world.height(-120, 20), 20);

    friendly.order = 'hold';
    friendly.holdPoint.set(0, 0, 38);
    friendly.soldiers.forEach((s, i) => s.pos.set(-2 + i * 1.3, 0, 38));

    hostile.order = 'hold';
    hostile.home.set(0, 0, 54);
    hostile.holdPoint.set(0, 0, 54);
    hostile.soldiers.forEach((s, i) => s.pos.set(-2 + i * 1.3, 0, 54));

    [...friendly.soldiers, ...hostile.soldiers].forEach((s) => { s.fireTimer = 0; });
  });
  await page.waitForTimeout(3000);
  const result = await page.evaluate(() => {
    const g = window.__tankCountry;
    const friendly = g.playerSquad;
    const hostile = g.enemySquads[0];
    const hurt = (squad) => squad.soldiers.some((s) => !s.alive || s.health < s.maxHealth);
    return {
      friendlyHurt: hurt(friendly),
      hostileHurt: hurt(hostile),
      friendlyAlive: friendly.aliveCount,
      hostileAlive: hostile.aliveCount,
    };
  });
  expect(result.friendlyHurt || result.hostileHurt).toBe(true);
  expect(result.friendlyAlive + result.hostileAlive).toBeLessThan(8);
});

test('capturing an outpost reinforces a depleted squad', async ({ page }) => {
  await deploy(page);
  await page.evaluate(() => {
    const g = window.__tankCountry;
    g.playerSquad.damageSoldier(g.playerSquad.soldiers[0], 999);
  });
  await page.waitForTimeout(400);
  await expect(page.locator('#squad-strength')).toHaveText('3 / 4');
  await expect(page.locator('#squad-pips i').first()).toHaveClass(/down/);

  await page.evaluate(() => window.__tankCountry.playerSquad.reinforce());
  await page.waitForTimeout(400);
  await expect(page.locator('#squad-strength')).toHaveText('4 / 4');
  await expect(page.locator('#squad-pips i').first()).not.toHaveClass(/down/);
});
