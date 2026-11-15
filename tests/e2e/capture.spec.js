import { test, expect } from './fixtures.js';
import { deploy, gameState } from './helpers.js';

async function clearOutpost(page, id, { keepInfantry = false } = {}) {
  await page.evaluate(({ id, keepInfantry }) => {
    const g = window.__tankCountry;
    const o = g.world.outposts.find((out) => out.id === id);
    for (const e of g.enemies) {
      if (Math.hypot(e.position.x - o.x, e.position.z - o.z) < 90) e.dead = true;
    }
    for (const a of g.artilleries) {
      if (Math.hypot(a.position.x - o.x, a.position.z - o.z) < 90) a.dead = true;
    }
    for (const squad of g.enemySquads) {
      if (squad.hasSoldierNear(o.x, o.z, 70) && !(keepInfantry && squad.hasSoldierNear(o.x, o.z, 12))) {
        squad.dead = true;
        squad.soldiers.forEach((s) => { s.alive = false; });
      }
    }
  }, { id, keepInfantry });
}

test('a tank alone can capture an outpost and expand territory', async ({ page }) => {
  await deploy(page);
  const before = await gameState(page);
  await clearOutpost(page, 'A');
  await page.evaluate(() => {
    const g = window.__tankCountry;
    const o = g.world.outposts.find((out) => out.id === 'A');
    g.playerSquad.order = 'hold';
    g.playerSquad.holdPoint.set(0, 0, 106);
    g.playerSquad.soldiers.forEach((s, i) => s.pos.set(2 + i, 0, 104));
    g.player.position.set(o.x, g.world.height(o.x, o.z), o.z);
    o.progress = 0.9;
  });
  await expect.poll(
    async () => (await gameState(page)).outposts.find((o) => o.id === 'A').owner,
    { timeout: 20_000 },
  ).toBe('player');
  const after = await gameState(page);
  const alpha = after.outposts.find((o) => o.id === 'A');
  expect(alpha.owner).toBe('player');
  expect(after.stats.captures).toBe(1);
  expect(after.territory.player).toBeGreaterThan(before.territory.player);
  await expect(page.locator('#capture-count')).toHaveText('1');

  const garrison = await page.evaluate(() => {
    const g = window.__tankCountry;
    const alphaOutpost = g.world.outposts.find((o) => o.id === 'A');
    return {
      exists: !!alphaOutpost.garrison,
      alive: alphaOutpost.garrison?.aliveCount,
      squads: g.playerSquads.length,
    };
  });
  expect(garrison.exists).toBe(true);
  expect(garrison.alive).toBe(3);
  expect(garrison.squads).toBeGreaterThanOrEqual(2);
});

test('infantry can hold a capture ring without the tank', async ({ page }) => {
  await deploy(page);
  await clearOutpost(page, 'B');
  const setup = await page.evaluate(() => {
    const g = window.__tankCountry;
    const o = g.world.outposts.find((out) => out.id === 'B');
    g.player.position.set(0, g.world.height(0, 106), 106);
    const squad = g.playerSquad;
    squad.order = 'hold';
    squad.holdPoint.set(o.x, 0, o.z);
    squad.soldiers.forEach((s, i) => {
      const angle = (i / squad.soldiers.length) * Math.PI * 2;
      s.pos.set(o.x + Math.cos(angle) * 2, 0, o.z + Math.sin(angle) * 2);
    });
    o.progress = 0.95;
    return {
      tankDistance: Math.hypot(g.player.position.x - o.x, g.player.position.z - o.z),
      squadNear: squad.hasSoldierNear(o.x, o.z, o.captureRadius),
    };
  });
  expect(setup.tankDistance).toBeGreaterThan(100);
  expect(setup.squadNear).toBe(true);
  await expect.poll(
    async () => (await gameState(page)).outposts.find((o) => o.id === 'B').owner,
    { timeout: 20_000 },
  ).toBe('player');
  const after = await gameState(page);
  expect(after.outposts.find((o) => o.id === 'B').owner).toBe('player');
});

test('enemy infantry in the ring keeps a capture contested', async ({ page }) => {
  await deploy(page);
  await clearOutpost(page, 'C', { keepInfantry: true });
  await page.evaluate(() => {
    const g = window.__tankCountry;
    const o = g.world.outposts.find((out) => out.id === 'C');
    g.player.position.set(o.x, g.world.height(o.x, o.z), o.z);
    o.progress = 0.4;
  });
  await page.waitForTimeout(1200);
  const after = await gameState(page);
  const charlie = after.outposts.find((o) => o.id === 'C');
  expect(charlie.owner).not.toBe('player');
  expect(charlie.contested).toBe(true);
  expect(charlie.progress).toBeLessThan(0.4);
});
