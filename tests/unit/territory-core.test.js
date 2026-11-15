import { describe, expect, it } from 'vitest';
import {
  NEUTRAL, PLAYER, ENEMY, OWNER_MIN, CONTEST_MIN, CONTEST_MARGIN,
  influenceAt, classifyCell, computeOwnership,
} from '../../src/territory-core.js';

describe('influenceAt', () => {
  it('adds player and enemy influence separately', () => {
    const sources = [
      { faction: 'player', x: 0, z: 0, radius: 10, strength: 1 },
      { faction: 'enemy', x: 10, z: 0, radius: 10, strength: 2 },
    ];
    const score = influenceAt(sources, 0, 0);
    expect(score.player).toBeCloseTo(1, 6);
    expect(score.enemy).toBeCloseTo(0, 6);
  });

  it('ignores sources outside their radius', () => {
    const sources = [{ faction: 'player', x: 100, z: 0, radius: 10, strength: 1 }];
    expect(influenceAt(sources, 0, 0)).toEqual({ player: 0, enemy: 0 });
  });

  it('falls off with the square of the normalised distance', () => {
    const sources = [{ faction: 'enemy', x: 0, z: 0, radius: 10, strength: 2 }];
    const score = influenceAt(sources, 5, 0);
    expect(score.enemy).toBeCloseTo(0.5, 6);
  });

  it('treats any non-player faction as enemy', () => {
    const sources = [{ faction: 'crimson', x: 0, z: 0, radius: 10, strength: 1 }];
    expect(influenceAt(sources, 0, 0).enemy).toBeCloseTo(1, 6);
  });
});

describe('classifyCell', () => {
  it('leaves weak or empty cells neutral', () => {
    expect(classifyCell(0, 0)).toEqual({ owner: NEUTRAL, contested: false });
    expect(classifyCell(OWNER_MIN, OWNER_MIN)).toEqual({ owner: NEUTRAL, contested: false });
  });

  it('awards the cell to the stronger faction', () => {
    expect(classifyCell(0.5, 0.1)).toEqual({ owner: PLAYER, contested: false });
    expect(classifyCell(0.1, 0.5)).toEqual({ owner: ENEMY, contested: false });
  });

  it('breaks exact ties toward the player', () => {
    expect(classifyCell(0.4, 0.4).owner).toBe(PLAYER);
  });

  it('marks a close, strong meeting as contested', () => {
    const base = CONTEST_MIN + 0.01;
    expect(classifyCell(base + CONTEST_MARGIN * 0.5, base)).toEqual({
      owner: PLAYER,
      contested: true,
    });
  });

  it('does not contest a lopsided border', () => {
    expect(classifyCell(0.9, 0.1).contested).toBe(false);
  });

  it('does not contest when only one side clears the contest floor', () => {
    expect(classifyCell(CONTEST_MIN + 0.2, CONTEST_MIN - 0.01).contested).toBe(false);
  });
});

describe('computeOwnership', () => {
  it('splits a two-by-two grid between opposite corners', () => {
    const result = computeOwnership({
      half: 10,
      n: 2,
      sources: [
        { faction: 'player', x: -5, z: -5, radius: 10, strength: 1 },
        { faction: 'enemy', x: 5, z: 5, radius: 10, strength: 1 },
      ],
    });
    expect(result.total).toBe(4);
    expect(result.cell).toBe(10);
    expect(result.players).toBe(1);
    expect(result.enemies).toBe(1);
    expect(result.contestedCount).toBe(0);
    expect(result.playerShare).toBe(0.25);
    expect(result.enemyShare).toBe(0.25);
    expect(result.contestedShare).toBe(0);
    expect([...result.owner]).toEqual([PLAYER, NEUTRAL, NEUTRAL, ENEMY]);
  });

  it('marks the whole grid contested when both sides are equal', () => {
    const result = computeOwnership({
      half: 10,
      n: 2,
      sources: [
        { faction: 'player', x: 0, z: 0, radius: 40, strength: 1 },
        { faction: 'enemy', x: 0, z: 0, radius: 40, strength: 1 },
      ],
    });
    expect(result.contestedCount).toBe(4);
    expect(result.contestedShare).toBe(1);
    expect(result.playerShare).toBe(0);
    expect(result.enemyShare).toBe(0);
    expect([...result.contested]).toEqual([1, 1, 1, 1]);
  });

  it('returns an all-neutral grid with no sources', () => {
    const result = computeOwnership({ half: 6, n: 3, sources: [] });
    expect(result.players).toBe(0);
    expect(result.enemies).toBe(0);
    expect(result.playerShare).toBe(0);
    expect([...result.owner].every((v) => v === NEUTRAL)).toBe(true);
  });

  it('counts only owned, non-contested cells in the shares', () => {
    const result = computeOwnership({
      half: 2,
      n: 2,
      sources: [
        { faction: 'player', x: -1, z: -1, radius: 2, strength: 1 },
        { faction: 'player', x: 1, z: -1, radius: 2, strength: 1 },
        { faction: 'enemy', x: -1, z: 1, radius: 2, strength: 1 },
      ],
    });
    expect(result.players + result.enemies + result.contestedCount).toBeLessThanOrEqual(4);
    expect(result.playerShare).toBeGreaterThan(0);
    expect(result.enemyShare).toBeGreaterThan(0);
  });
});
