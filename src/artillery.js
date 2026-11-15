import * as THREE from 'three';
import { TAU } from './utils.js';
import { lineOfSight } from './combat.js';

export const BATTERY_MAX_MISSIONS = 3;
export const BATTERY_COOLDOWN = 24;
export const BARRAGE_SHELLS = 3;
export const BARRAGE_SPREAD = 5;
export const BARRAGE_SPACING = 0.65;

// Lay out a battery mission as a small spread of impact points. Each point is
// offset from the designated target so a barrage covers a position rather
// than stacking every shell on one coordinate.
export function planBarrage(point, {
  shells = BARRAGE_SHELLS,
  spread = BARRAGE_SPREAD,
  spacing = BARRAGE_SPACING,
  rng = Math.random,
} = {}) {
  const plans = [];
  for (let i = 0; i < shells; i++) {
    const angle = rng() * TAU;
    const radius = Math.sqrt(rng()) * spread;
    plans.push({
      x: point.x + Math.cos(angle) * radius,
      z: point.z + Math.sin(angle) * radius,
      delay: i * spacing,
    });
  }
  return plans;
}

export function findSpotter(point, spotters, heightAt, {
  tankRange = 80,
  squadRange = 55,
  clearance = 0.6,
} = {}) {
  const to = new THREE.Vector3(point.x, heightAt(point.x, point.z) + 1.0, point.z);
  for (const spotter of spotters) {
    const range = spotter.kind === 'tank' ? tankRange : squadRange;
    if (Math.hypot(spotter.x - point.x, spotter.z - point.z) > range) continue;
    const from = new THREE.Vector3(spotter.x, spotter.y, spotter.z);
    if (lineOfSight(heightAt, from, to, { samples: 8, clearance })) return spotter;
  }
  return null;
}

export function validateFireMission({
  point,
  player,
  spotters = [],
  missions = 0,
  cooldown = 0,
  heightAt,
  minRange = 18,
  tankRange = 80,
  squadRange = 55,
} = {}) {
  if (!point) return { ok: false, reason: 'no-target' };
  if (missions <= 0) return { ok: false, reason: 'no-missions' };
  if (cooldown > 0) return { ok: false, reason: 'cooldown' };
  if (player && Math.hypot(point.x - player.x, point.z - player.z) < minRange) {
    return { ok: false, reason: 'danger-close' };
  }
  const spotter = findSpotter(point, spotters, heightAt, { tankRange, squadRange });
  if (!spotter) return { ok: false, reason: 'unspotted' };
  return { ok: true, spotter };
}
