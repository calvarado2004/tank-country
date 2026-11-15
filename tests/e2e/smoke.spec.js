import { test, expect } from './fixtures.js';
import { deploy, gameState } from './helpers.js';

test('deploys the tank, squad and HUD without console errors', async ({ page }) => {
  await deploy(page);
  const state = await gameState(page);
  expect(state.state).toBe('playing');
  expect(state.playerSquad.total).toBe(4);
  expect(state.playerSquad.alive).toBe(4);
  expect(state.enemySquads).toHaveLength(3);
  await expect(page.locator('#squad-order')).toHaveText('FOLLOWING');
  await expect(page.locator('#squad-strength')).toHaveText('4 / 4');
  await expect(page.locator('#territory-value')).not.toHaveText('0');
  await expect(page.locator('#game-canvas')).toBeVisible();
});

test('pauses and resumes without losing the HUD', async ({ page }) => {
  await deploy(page);
  await page.click('#btn-pause');
  await expect(page.locator('#pause')).toBeVisible();
  expect((await gameState(page)).state).toBe('paused');
  await page.click('#btn-resume');
  await expect(page.locator('#pause')).toBeHidden();
  expect((await gameState(page)).state).toBe('playing');
});
