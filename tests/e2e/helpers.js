import { expect } from '@playwright/test';

export async function deploy(page) {
  await page.goto('/');
  await expect(page.locator('#intro')).toBeVisible();
  await page.click('#btn-deploy');
  await expect(page.locator('#hud')).toBeVisible();
  await page.waitForTimeout(2000);
}

export async function gameState(page) {
  return page.evaluate(() => {
    const g = window.__tankCountry;
    return {
      state: g.state,
      playerHealth: g.player.health,
      playerSquad: g.playerSquad ? {
        order: g.playerSquad.order,
        alive: g.playerSquad.aliveCount,
        total: g.playerSquad.soldiers.length,
        dead: g.playerSquad.dead,
        position: [g.playerSquad.position.x, g.playerSquad.position.z],
      } : null,
      enemySquads: g.enemySquads.map((s) => ({
        dead: s.dead,
        alive: s.aliveCount,
        position: [s.position.x, s.position.z],
      })),
      outposts: g.world.outposts.map((o) => ({
        id: o.id,
        owner: o.owner,
        progress: o.progress,
        contested: o.contested,
      })),
      territory: {
        player: g.world.territory.playerShare,
        enemy: g.world.territory.enemyShare,
        contested: g.world.territory.contestedShare,
      },
      battery: g.battery ? {
        missions: g.battery.missions,
        cooldown: g.battery.cooldown,
        status: g.battery.status,
        ready: g.battery.ready,
        gun: g.battery.gun,
        queue: g.battery.queue.length,
      } : null,
      stats: { ...g.stats },
    };
  });
}

export function round(value, digits = 2) {
  return Number(value.toFixed(digits));
}
