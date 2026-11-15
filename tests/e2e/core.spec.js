import { test, expect } from './fixtures.js';

// These modules are the gameplay core. Running them in Chromium proves that
// the exact code shipped to the browser behaves the same as the unit suite.
test('gameplay core modules execute in Chromium', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const combat = await import('/src/combat.js');
    const { advanceCapture } = await import('/src/capture.js');
    const core = await import('/src/territory-core.js');

    const low = combat.solveBallistic({ x: 0, y: 0, z: 0 }, { x: 30, y: 0, z: 0 }, 50, 20);
    const high = combat.solveHighArc({ x: 0, y: 0, z: 0 }, { x: 30, y: 0, z: 0 }, 50, 20);
    const fallback = combat.solveArc({ x: 0, y: 0, z: 0 }, { x: 100, y: 0, z: 0 }, 1, 100, true);
    const vertical = combat.solveArc({ x: 1, y: 0, z: 1 }, { x: 1, y: 0, z: 1 }, 20, 9.8, false);
    const ray = combat.rayPoint(
      { x: 0, y: 0, z: 0 },
      { x: 0, y: 0, z: 1 },
      { x: 2, y: 1, z: 5 },
    );

    const sources = [
      { faction: 'player', x: 0, z: 0, radius: 20, strength: 1 },
      { faction: 'enemy', x: 10, z: 0, radius: 20, strength: 1 },
    ];
    const influence = core.influenceAt(sources, 5, 0);
    const neutral = core.classifyCell(0, 0);
    const contested = core.classifyCell(
      core.CONTEST_MIN + 0.02,
      core.CONTEST_MIN + 0.01,
    );
    const grid = core.computeOwnership({ half: 10, n: 2, sources });
    const empty = core.computeOwnership({ half: 4, n: 2, sources: [] });

    return {
      low: { x: low.x, y: low.y, z: low.z, len: low.length() },
      highY: high.y,
      fallbackY: fallback.y,
      vertical: { x: vertical.x, z: vertical.z },
      ray,
      influence,
      neutral,
      contested,
      grid: {
        playerShare: grid.playerShare,
        enemyShare: grid.enemyShare,
        total: grid.total,
        cell: grid.cell,
      },
      empty: {
        playerShare: empty.playerShare,
        neutral: [...empty.owner].every((v) => v === core.NEUTRAL),
      },
      splash: [
        combat.splashDamage(20, 0, 10),
        combat.splashDamage(20, 5, 10),
        combat.splashDamage(20, 10, 10),
        combat.splashDamage(20, 0, 0),
      ],
      rates: [
        combat.captureRate(),
        combat.captureRate({ tankInZone: true }),
        combat.captureRate({ squadInZone: true }),
        combat.captureRate({ tankInZone: true, squadInZone: true }),
      ],
      capture: {
        defaults: advanceCapture(0.5, 1),
        presenceOnly: advanceCapture(0.5, 1, { inZone: true }),
        idle: advanceCapture(0.5, 1, { inZone: false }),
        tank: advanceCapture(0, 1, { inZone: true, tankInZone: true }),
        squad: advanceCapture(0, 1, { inZone: true, squadInZone: true }),
        both: advanceCapture(0, 1, { inZone: true, tankInZone: true, squadInZone: true }),
        contested: advanceCapture(0.5, 1, { inZone: true, enemiesNear: true }),
        capped: advanceCapture(0.99, 1, { inZone: true, tankInZone: true, squadInZone: true }),
        empty: advanceCapture(0.01, 1, { inZone: false }),
        custom: advanceCapture(0, 2, {
          inZone: true, tankInZone: true, duration: 4, decay: 0.5, contestDecay: 0.1,
        }),
      },
    };
  });

  expect(result.low.y).toBeGreaterThan(0);
  expect(result.low.len).toBeCloseTo(50, 3);
  expect(result.highY).toBeGreaterThan(result.low.y);
  expect(result.fallbackY).toBeCloseTo(Math.SQRT1_2, 4);
  expect(result.vertical.x).toBeCloseTo(0, 5);
  expect(result.vertical.z).toBeCloseTo(20, 3);
  expect(result.ray.t).toBeCloseTo(5, 4);
  expect(result.ray.perp).toBeCloseTo(Math.sqrt(5), 4);
  expect(result.influence.player).toBeGreaterThan(0);
  expect(result.influence.enemy).toBeGreaterThan(0);
  expect(result.neutral.owner).toBe(0);
  expect(result.contested.contested).toBe(true);
  expect(result.grid.playerShare).toBeGreaterThan(0);
  expect(result.grid.total).toBe(4);
  expect(result.grid.cell).toBe(10);
  expect(result.empty.neutral).toBe(true);
  expect(result.splash).toEqual([20, 10, 0, 0]);
  expect(result.rates).toEqual([0, 1, 0.6, 1.35]);
  expect(result.capture.defaults).toBeLessThan(0.5);
  expect(result.capture.presenceOnly).toBe(0.5);
  expect(result.capture.idle).toBeLessThan(0.5);
  expect(result.capture.tank).toBeGreaterThan(0);
  expect(result.capture.squad).toBeGreaterThan(0);
  expect(result.capture.both).toBeGreaterThan(result.capture.tank);
  expect(result.capture.contested).toBeLessThan(0.5);
  expect(result.capture.capped).toBe(1);
  expect(result.capture.empty).toBe(0);
  expect(result.capture.custom).toBe(0.5);
});
