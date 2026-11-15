import { describe, expect, it } from 'vitest';
import {
  advanceCapture, CAPTURE_DURATION, CAPTURE_DECAY, CAPTURE_CONTEST_DECAY,
} from '../../src/capture.js';

describe('advanceCapture', () => {
  it('decays slowly when nobody is in the ring', () => {
    const next = advanceCapture(0.5, 1, { inZone: false });
    expect(next).toBeCloseTo(0.5 - CAPTURE_DECAY, 6);
  });

  it('never decays below zero', () => {
    expect(advanceCapture(0.001, 10, { inZone: false })).toBe(0);
  });

  it('advances with a tank alone', () => {
    const next = advanceCapture(0, 1, { inZone: true, tankInZone: true });
    expect(next).toBeCloseTo(1 / CAPTURE_DURATION, 6);
  });

  it('advances with infantry alone at 60 percent rate', () => {
    const next = advanceCapture(0, 1, { inZone: true, squadInZone: true });
    expect(next).toBeCloseTo(0.6 / CAPTURE_DURATION, 6);
  });

  it('advances fastest with tank and infantry together', () => {
    const next = advanceCapture(0, 1, {
      inZone: true, tankInZone: true, squadInZone: true,
    });
    expect(next).toBeCloseTo(1.35 / CAPTURE_DURATION, 6);
  });

  it('freezes progress when hostiles contest the ring', () => {
    const next = advanceCapture(0.5, 1, { inZone: true, enemiesNear: true, tankInZone: true });
    expect(next).toBeCloseTo(0.5 - CAPTURE_CONTEST_DECAY, 6);
  });

  it('never contests below zero', () => {
    expect(advanceCapture(0.005, 1, { inZone: true, enemiesNear: true })).toBe(0);
  });

  it('caps progress at one', () => {
    expect(advanceCapture(0.999, 1, {
      inZone: true, tankInZone: true, squadInZone: true,
    })).toBe(1);
  });

  it('honours custom duration and decay values', () => {
    const fast = advanceCapture(0, 2, {
      inZone: true, tankInZone: true, duration: 4, decay: 0.5,
    });
    expect(fast).toBeCloseTo(0.5, 6);
    const gone = advanceCapture(1, 1, { inZone: false, decay: 0.25 });
    expect(gone).toBeCloseTo(0.75, 6);
    const contested = advanceCapture(1, 2, {
      inZone: true, enemiesNear: true, contestDecay: 0.1,
    });
    expect(contested).toBeCloseTo(0.8, 6);
  });

  it('defaults to no presence when called with no options', () => {
    const next = advanceCapture(0.5, 1);
    expect(next).toBeCloseTo(0.5 - CAPTURE_DECAY, 6);
  });
});
