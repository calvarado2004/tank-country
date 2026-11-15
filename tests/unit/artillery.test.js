import { describe, expect, it } from 'vitest';
import {
  planBarrage, findSpotter, validateFireMission,
  BARRAGE_SHELLS, BARRAGE_SPREAD, BARRAGE_SPACING,
} from '../../src/artillery.js';

const flat = () => 0;

describe('planBarrage', () => {
  it('lays out three shells with staggered delays inside the spread', () => {
    let i = 0;
    const seq = [0, 0, 0.25, 0.25, 0.5, 0.5];
    const plans = planBarrage({ x: 10, z: -5 }, { rng: () => seq[i++ % seq.length] });
    expect(plans).toHaveLength(BARRAGE_SHELLS);
    expect(plans[0]).toMatchObject({ x: 10, z: -5, delay: 0 });
    expect(plans[1].delay).toBeCloseTo(BARRAGE_SPACING, 6);
    expect(plans[2].delay).toBeCloseTo(BARRAGE_SPACING * 2, 6);
    for (const plan of plans) {
      expect(Math.hypot(plan.x - 10, plan.z + 5)).toBeLessThanOrEqual(BARRAGE_SPREAD + 1e-9);
    }
  });

  it('supports a custom shell count, spread and spacing', () => {
    const plans = planBarrage({ x: 0, z: 0 }, {
      shells: 5, spread: 2, spacing: 0.2, rng: () => 0.5,
    });
    expect(plans).toHaveLength(5);
    expect(plans[4].delay).toBeCloseTo(0.8, 6);
    expect(Math.hypot(plans[0].x, plans[0].z)).toBeLessThanOrEqual(2);
  });

  it('handles an empty mission', () => {
    expect(planBarrage({ x: 0, z: 0 }, { shells: 0 })).toEqual([]);
  });
});

describe('findSpotter', () => {
  const tank = { kind: 'tank', x: 0, z: 0, y: 1.4 };
  const infantry = { kind: 'infantry', x: 0, z: 0, y: 1.1 };

  it('accepts a tank inside its range with a clear line', () => {
    expect(findSpotter({ x: 40, z: 0 }, [tank], flat)).toBe(tank);
  });

  it('rejects a tank outside its range', () => {
    expect(findSpotter({ x: 90, z: 0 }, [tank], flat)).toBeNull();
  });

  it('uses the shorter infantry range', () => {
    expect(findSpotter({ x: 50, z: 0 }, [infantry], flat)).toBe(infantry);
    expect(findSpotter({ x: 60, z: 0 }, [infantry], flat)).toBeNull();
  });

  it('rejects a spotter behind a ridge', () => {
    const ridge = (x) => (Math.abs(x - 20) < 3 ? 10 : 0);
    expect(findSpotter({ x: 40, z: 0 }, [tank], ridge)).toBeNull();
  });

  it('keeps looking when the first spotter is blocked', () => {
    const blocked = { kind: 'infantry', x: 0, z: 0, y: 1.1 };
    const clear = { kind: 'tank', x: 35, z: 0, y: 1.4 };
    const ridge = (x) => (Math.abs(x - 10) < 2 ? 8 : 0);
    expect(findSpotter({ x: 40, z: 0 }, [blocked, clear], ridge)).toBe(clear);
  });

  it('honours custom ranges', () => {
    expect(findSpotter({ x: 100, z: 0 }, [tank], flat, { tankRange: 120 })).toBe(tank);
  });
});

describe('validateFireMission', () => {
  const spotters = [{ kind: 'tank', x: 0, z: 0, y: 1.4 }];
  const base = {
    point: { x: 40, z: 0 },
    player: { x: 0, z: 0 },
    spotters,
    missions: 3,
    cooldown: 0,
    heightAt: flat,
  };

  it('rejects a missing target', () => {
    expect(validateFireMission({ ...base, point: null }).reason).toBe('no-target');
  });

  it('rejects an empty battery', () => {
    expect(validateFireMission({ ...base, missions: 0 }).reason).toBe('no-missions');
  });

  it('rejects a battery on cooldown', () => {
    expect(validateFireMission({ ...base, cooldown: 4 }).reason).toBe('cooldown');
  });

  it('rejects a danger-close target', () => {
    expect(validateFireMission({ ...base, point: { x: 8, z: 0 } }).reason).toBe('danger-close');
  });

  it('rejects an unspotted target', () => {
    expect(validateFireMission({ ...base, spotters: [] }).reason).toBe('unspotted');
  });

  it('accepts a spotted target', () => {
    const result = validateFireMission(base);
    expect(result.ok).toBe(true);
    expect(result.spotter).toBe(spotters[0]);
  });

  it('works without a player position', () => {
    expect(validateFireMission({ ...base, player: null }).ok).toBe(true);
  });

  it('honours a custom minimum range', () => {
    expect(validateFireMission({ ...base, point: { x: 25, z: 0 }, minRange: 30 }).reason).toBe('danger-close');
  });
});
