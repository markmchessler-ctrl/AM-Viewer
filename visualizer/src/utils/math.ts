import * as THREE from 'three';

/**
 * Convert polar coordinates (azimuth, elevation, radius) to Cartesian (x, y, z).
 * Convention: +Y is up, +Z is forward (towards listener's face), +X is right.
 * Azimuth: 0° = front, positive = left, negative = right (ITU convention).
 */
export function polarToCartesian(
  azimuthDeg: number,
  elevationDeg: number,
  radius: number
): THREE.Vector3 {
  const az = THREE.MathUtils.degToRad(azimuthDeg);
  const el = THREE.MathUtils.degToRad(elevationDeg);

  const x = -radius * Math.cos(el) * Math.sin(az);
  const y = radius * Math.sin(el);
  const z = radius * Math.cos(el) * Math.cos(az);

  return new THREE.Vector3(x, y, z);
}

/**
 * Smoothly interpolate a value toward a target (exponential smoothing).
 */
export function smoothStep(current: number, target: number, smoothing: number): number {
  return current + (target - current) * smoothing;
}

/**
 * Clamp a value between min and max.
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Map a value from one range to another.
 */
export function mapRange(
  value: number,
  inMin: number,
  inMax: number,
  outMin: number,
  outMax: number
): number {
  return outMin + ((value - inMin) / (inMax - inMin)) * (outMax - outMin);
}

/**
 * Convert dB to linear gain.
 */
export function dbToLinear(db: number): number {
  return Math.pow(10, db / 20);
}

/**
 * Convert linear gain to dB.
 */
export function linearToDb(linear: number): number {
  return 20 * Math.log10(Math.max(linear, 1e-10));
}
