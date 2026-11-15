import * as THREE from 'three';
import { clamp } from './utils.js';

// Shared combat math. Keeping this module free of scene or DOM state lets the
// unit suite exercise the exact formulas the game runs.

export function solveArc(from, to, speed, gravity, high = false) {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const x = Math.hypot(dx, dz);
  const y = to.y - from.y;
  const v2 = speed * speed;
  const root = v2 * v2 - gravity * (gravity * x * x + 2 * y * v2);
  let angle;
  if (root <= 0) {
    angle = Math.PI / 4;
  } else {
    const sign = high ? 1 : -1;
    const tan = (v2 + sign * Math.sqrt(root)) / (gravity * Math.max(x, 0.01));
    angle = Math.atan(tan);
  }
  const horizontal = Math.cos(angle) * speed;
  const vertical = Math.sin(angle) * speed;
  const dir = x > 0.001 ? new THREE.Vector3(dx / x, 0, dz / x) : new THREE.Vector3(0, 0, 1);
  return dir.multiplyScalar(horizontal).setY(vertical);
}

export function solveBallistic(from, to, speed, gravity) {
  return solveArc(from, to, speed, gravity, false);
}

export function solveHighArc(from, to, speed, gravity) {
  return solveArc(from, to, speed, gravity, true);
}

// Position of a point projected onto a ray, used by the coaxial MG and any
// other hitscan weapon that needs a cylinder test.
export function rayPoint(origin, dir, point) {
  const rx = point.x - origin.x;
  const ry = point.y - origin.y;
  const rz = point.z - origin.z;
  const t = rx * dir.x + ry * dir.y + rz * dir.z;
  const px = rx - dir.x * t;
  const py = ry - dir.y * t;
  const pz = rz - dir.z * t;
  return { t, perp: Math.hypot(px, py, pz) };
}

export function splashDamage(base, distance, radius) {
  if (radius <= 0 || distance >= radius) return 0;
  return base * (1 - clamp(distance / radius, 0, 1));
}

// Sample the terrain between two points. Used for spotting and for squad
// fire, so hills actually block what a unit can see.
export function lineOfSight(heightAt, from, to, { samples = 8, clearance = 0.45 } = {}) {
  for (let i = 1; i < samples; i++) {
    const t = i / samples;
    const x = from.x + (to.x - from.x) * t;
    const z = from.z + (to.z - from.z) * t;
    const y = from.y + (to.y - from.y) * t;
    if (heightAt(x, z) > y + clearance) return false;
  }
  return true;
}

export function captureRate({ tankInZone = false, squadInZone = false } = {}) {
  if (!tankInZone && !squadInZone) return 0;
  if (tankInZone && squadInZone) return 1.35;
  return tankInZone ? 1 : 0.6;
}
