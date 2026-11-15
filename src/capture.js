import { clamp } from './utils.js';
import { captureRate } from './combat.js';

export const CAPTURE_DURATION = 7.2;
export const CAPTURE_DECAY = 0.012;
export const CAPTURE_CONTEST_DECAY = 0.03;

// One frame of outpost capture progress. The caller supplies the occupancy
// facts and gets a new progress value; no world objects are touched.
export function advanceCapture(progress, dt, {
  inZone = false,
  enemiesNear = false,
  tankInZone = false,
  squadInZone = false,
  duration = CAPTURE_DURATION,
  decay = CAPTURE_DECAY,
  contestDecay = CAPTURE_CONTEST_DECAY,
} = {}) {
  if (!inZone) return clamp(progress - dt * decay, 0, 1);
  if (enemiesNear) return clamp(progress - dt * contestDecay, 0, 1);
  return clamp(progress + (dt / duration) * captureRate({ tankInZone, squadInZone }), 0, 1);
}
