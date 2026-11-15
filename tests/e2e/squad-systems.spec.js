import { test, expect } from './fixtures.js';
import { deploy } from './helpers.js';

test('a wiped squad can be rebuilt and re-enters the HUD', async ({ page }) => {
  await deploy(page);
  const result = await page.evaluate(() => {
    const g = window.__tankCountry;
    const squad = g.playerSquad;
    squad.damageSoldier(squad.soldiers[0], 999);
    squad.placeSoldier(squad.soldiers[0]);
    squad.soldiers.forEach((soldier) => squad.damageSoldier(soldier, 999));
    squad.update(0.016);
    const wiped = { dead: squad.dead, alive: squad.aliveCount };
    squad.reinforce();
    return {
      wiped,
      rebuilt: { dead: squad.dead, alive: squad.aliveCount, health: squad.soldiers[0].health },
    };
  });
  expect(result.wiped).toEqual({ dead: true, alive: 0 });
  expect(result.rebuilt.dead).toBe(false);
  expect(result.rebuilt.alive).toBe(4);
  expect(result.rebuilt.health).toBeGreaterThan(0);
  await page.waitForTimeout(400);
  await expect(page.locator('#squad-strength')).toHaveText('4 / 4');
  await expect(page.locator('#squad-order')).toHaveText('FOLLOWING');
});

test('rifles and bazookas engage an enemy tank', async ({ page }) => {
  await deploy(page);
  const result = await page.evaluate(() => {
    const g = window.__tankCountry;
    const squad = g.playerSquad;
    const Vector3 = g.player.position.constructor;
    const tank = {
      dead: false,
      isPlayer: false,
      position: new Vector3(0, 0, 20),
      damage: 0,
      chip: 0,
      takeDamage(amount) { this.damage += amount; },
      takeChipDamage(amount) { this.chip += amount; },
    };
    g.enemies.push(tank);
    squad.order = 'hold';
    squad.position.set(0, 0, 0);
    squad.holdPoint.set(0, 0, 0);
    squad.soldiers.forEach((soldier, i) => {
      soldier.pos.set(-1.5 + i, 0, 0);
      soldier.fireTimer = 0;
    });
    squad.targetTimer = 0;
    squad.update(0.05);
    const snapshot = { damage: tank.damage, chip: tank.chip };
    g.enemies.splice(g.enemies.indexOf(tank), 1);
    return snapshot;
  });
  expect(result.damage).toBeGreaterThanOrEqual(22);
  expect(result.chip).toBeGreaterThan(0);
});

test('squad order arrival and direct fire paths stay consistent', async ({ page }) => {
  await deploy(page);
  const result = await page.evaluate(() => {
    const g = window.__tankCountry;
    const squad = g.playerSquad;
    const enemy = g.enemySquads[0];
    const Vector3 = g.player.position.constructor;

    squad.order = 'move';
    squad.moveTarget = new Vector3(squad.position.x, 0, squad.position.z);
    squad.updateGoal();
    const playerArrived = { order: squad.order, holdX: squad.holdPoint.x };

    enemy.order = 'move';
    enemy.moveTarget = new Vector3(enemy.position.x, 0, enemy.position.z);
    enemy.updateGoal();
    const enemyArrived = { order: enemy.order, holdX: enemy.holdPoint.x };

    const tank = {
      dead: false,
      isPlayer: false,
      position: new Vector3(0, 0, 10),
      damage: 0,
      chip: 0,
      takeDamage(amount) { this.damage += amount; },
      takeChipDamage(amount) { this.chip += amount; },
    };
    const point = new Vector3(0, 1, 10);
    const muzzle = new Vector3(0, 1, 0);
    const rifle = squad.soldiers.find((s) => !s.at);
    const at = squad.soldiers.find((s) => s.at);
    squad.fireRifle(rifle, { kind: 'tank', entity: tank }, point, muzzle);
    squad.fireAT(at, { kind: 'tank', entity: tank }, point, muzzle);

    g.enemies.push(tank);
    squad.order = 'hold';
    squad.position.set(0, 0, 0);
    squad.holdPoint.set(0, 0, 0);
    squad.target = { kind: 'tank', entity: tank };
    rifle.pos.set(0, 0, 0);
    rifle.fireTimer = 0;
    squad.updateSoldier(rifle, 0.016);
    at.pos.set(0, 0, 0);
    at.fireTimer = 0;
    squad.updateSoldier(at, 0.016);

    const originalLos = squad.hasLineOfSight;
    squad.hasLineOfSight = () => false;
    rifle.fireTimer = 0;
    squad.updateSoldier(rifle, 0.016);
    const blockedFireTimer = rifle.fireTimer;
    squad.hasLineOfSight = originalLos;
    squad.fireAT(at, { kind: 'tank', entity: { dead: false } }, point, muzzle);
    g.enemies.splice(g.enemies.indexOf(tank), 1);

    const blocked = squad.hasLineOfSight(
      new Vector3(0, -50, 0),
      new Vector3(20, -50, 0),
    );

    return {
      playerArrived,
      enemyArrived,
      blocked,
      blockedFireTimer,
      tankDamage: tank.damage,
      tankChip: tank.chip,
    };
  });

  expect(result.playerArrived.order).toBe('hold');
  expect(result.enemyArrived.order).toBe('hold');
  expect(result.blocked).toBe(false);
  expect(result.blockedFireTimer).toBeGreaterThan(0.3);
  expect(result.tankDamage).toBeGreaterThanOrEqual(44);
  expect(result.tankChip).toBeGreaterThan(0);
});

