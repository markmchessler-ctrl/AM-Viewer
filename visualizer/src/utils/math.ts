import * as THREE from 'three';

/**
 * Convert polar coordinates (azimuth, elevation, distance) to Cartesian (x, y, z).
 * Convention: +X = right, +Y = up, +Z = toward listener (forward).
 * Azimuth: 0° = front, positive = left, negative = right (ITU convention).
 * Elevation: 0° = horizon, positive = up.
 */
export function polarToCartesian(
  azimuthDeg: number,
  elevationDeg: number,
  distance: number
): THREE.Vector3 {
  const azRad = THREE.MathUtils.degToRad(azimuthDeg);
  const elRad = THREE.MathUtils.degToRad(elevationDeg);
  const cosEl = Math.cos(elRad);

  return new THREE.Vector3(
    -Math.sin(azRad) * cosEl * distance,  // X: negative sin because positive azimuth = left
    Math.sin(elRad) * distance,            // Y: up
    -Math.cos(azRad) * cosEl * distance    // Z: forward is -Z in Three.js
  );
}

/**
 * Exponential moving average smoother.
 */
export function smoothValue(current: number, target: number, smoothing: number): number {
  return current + (target - current) * smoothing;
}

/**
 * Smoothly interpolate a value array toward target values.
 */
export function smoothArray(
  current: Float32Array,
  target: Float32Array,
  smoothing: number
): void {
  for (let i = 0; i < current.length; i++) {
    current[i] += (target[i] - current[i]) * smoothing;
  }
}

/**
 * Map a value from one range to another, clamped.
 */
export function mapRange(
  value: number,
  inMin: number,
  inMax: number,
  outMin: number,
  outMax: number
): number {
  const t = Math.max(0, Math.min(1, (value - inMin) / (inMax - inMin)));
  return outMin + t * (outMax - outMin);
}

/**
 * Compute RMS (root mean square) of a Float32Array.
 */
export function computeRMS(data: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < data.length; i++) {
    sum += data[i] * data[i];
  }
  return Math.sqrt(sum / data.length);
}
