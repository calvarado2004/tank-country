import { describe, expect, it } from 'vitest';
import {
  solveArc, solveBallistic, solveHighArc, rayPoint, splashDamage, captureRate, lineOfSight,
} from '../../src/combat.js';

describe('ballistic solver', () => {
  it('sends a low shell toward a target on the same height', () => {
    const v = solveBallistic({ x: 0, y: 0, z: 0 }, { x: 30, y: 0, z: 0 }, 50, 20);
    expect(v.x).toBeGreaterThan(0);
    expect(v.z).toBeCloseTo(0, 6);
    expect(v.y).toBeGreaterThan(0);
    expect(v.length()).toBeCloseTo(50, 5);
  });

  it('lobs a higher shell on the high arc', () => {
    const low = solveBallistic({ x: 0, y: 0, z: 0 }, { x: 40, y: 0, z: 0 }, 60, 20);
    const high = solveHighArc({ x: 0, y: 0, z: 0 }, { x: 40, y: 0, z: 0 }, 60, 20);
    expect(high.y).toBeGreaterThan(low.y);
    expect(high.length()).toBeCloseTo(60, 5);
  });

  it('falls back to a 45 degree launch when the target is out of range', () => {
    const v = solveBallistic({ x: 0, y: 0, z: 0 }, { x: 100, y: 0, z: 0 }, 1, 100);
    expect(v.y).toBeCloseTo(Math.SQRT1_2, 5);
    expect(Math.hypot(v.x, v.z)).toBeCloseTo(Math.SQRT1_2, 5);
  });

  it('uses the high-arc fallback too', () => {
    const v = solveHighArc({ x: 0, y: 0, z: 0 }, { x: 100, y: 0, z: 0 }, 1, 100);
    expect(v.y).toBeCloseTo(Math.SQRT1_2, 5);
  });

  it('handles a target directly above the muzzle', () => {
    const v = solveArc({ x: 1, y: 0, z: 1 }, { x: 1, y: 0, z: 1 }, 20, 9.8, false);
    expect(v.x).toBeCloseTo(0, 6);
    expect(v.z).toBeCloseTo(20, 5);
  });

  it('aims downward when the target is below the muzzle', () => {
    const v = solveBallistic({ x: 0, y: 10, z: 0 }, { x: 20, y: 0, z: 0 }, 45, 20);
    expect(v.y).toBeLessThan(0);
    expect(v.x).toBeGreaterThan(0);
  });
});

describe('rayPoint', () => {
  it('projects a point onto the ray', () => {
    const { t, perp } = rayPoint(
      { x: 0, y: 0, z: 0 },
      { x: 0, y: 0, z: 1 },
      { x: 0, y: 0, z: 5 },
    );
    expect(t).toBeCloseTo(5, 6);
    expect(perp).toBeCloseTo(0, 6);
  });

  it('reports perpendicular distance for an offset point', () => {
    const { t, perp } = rayPoint(
      { x: 0, y: 0, z: 0 },
      { x: 0, y: 0, z: 1 },
      { x: 2, y: 1, z: 5 },
    );
    expect(t).toBeCloseTo(5, 6);
    expect(perp).toBeCloseTo(Math.sqrt(5), 6);
  });

  it('returns a negative t for points behind the origin', () => {
    const { t } = rayPoint(
      { x: 0, y: 0, z: 0 },
      { x: 0, y: 0, z: 1 },
      { x: 0, y: 0, z: -3 },
    );
    expect(t).toBeLessThan(0);
  });
});

describe('splashDamage', () => {
  it('falls off linearly to zero at the radius', () => {
    expect(splashDamage(20, 0, 10)).toBe(20);
    expect(splashDamage(20, 5, 10)).toBe(10);
    expect(splashDamage(20, 10, 10)).toBe(0);
  });

  it('does nothing outside the radius', () => {
    expect(splashDamage(20, 11, 10)).toBe(0);
  });

  it('guards against a zero radius', () => {
    expect(splashDamage(20, 0, 0)).toBe(0);
  });

  it('clamps distances below zero', () => {
    expect(splashDamage(20, -4, 10)).toBe(20);
  });
});

describe('lineOfSight', () => {
  const flat = () => 0;

  it('sees across flat ground', () => {
    expect(lineOfSight(flat, { x: 0, y: 1, z: 0 }, { x: 20, y: 1, z: 0 })).toBe(true);
  });

  it('is blocked by a ridge taller than the sight line', () => {
    const ridge = (x) => (Math.abs(x - 10) < 2 ? 6 : 0);
    expect(lineOfSight(ridge, { x: 0, y: 1, z: 0 }, { x: 20, y: 1, z: 0 })).toBe(false);
  });

  it('allows a high sight line over the same ridge', () => {
    const ridge = (x) => (Math.abs(x - 10) < 2 ? 6 : 0);
    expect(lineOfSight(ridge, { x: 0, y: 12, z: 0 }, { x: 20, y: 12, z: 0 })).toBe(true);
  });

  it('honours a custom clearance', () => {
    const rise = (x) => (Math.abs(x - 10) < 2 ? 1.3 : 0);
    expect(lineOfSight(rise, { x: 0, y: 1, z: 0 }, { x: 20, y: 1, z: 0 })).toBe(true);
    expect(lineOfSight(rise, { x: 0, y: 1, z: 0 }, { x: 20, y: 1, z: 0 }, { clearance: 0.2 })).toBe(false);
  });
});

describe('captureRate', () => {
  it('needs at least one friendly presence', () => {
    expect(captureRate()).toBe(0);
    expect(captureRate({ tankInZone: false, squadInZone: false })).toBe(0);
  });

  it('is fastest with tank and squad together', () => {
    expect(captureRate({ tankInZone: true, squadInZone: true })).toBe(1.35);
  });

  it('lets infantry hold a ring alone at a slower rate', () => {
    expect(captureRate({ squadInZone: true })).toBe(0.6);
  });

  it('uses the tank rate when only the tank is present', () => {
    expect(captureRate({ tankInZone: true })).toBe(1);
  });
});
