import * as THREE from 'three';
import { SPEAKERS_7_1_4, SPEAKER_RADIUS } from '../utils/constants';
import { polarToCartesian, smoothStep } from '../utils/math';

/**
 * Renders energy rings and pulses at each speaker position.
 * Provides a visual indication of per-channel audio energy.
 */
export class EnergyVisualizer {
  public group: THREE.Group;
  private rings: THREE.Mesh[] = [];
  private pulses: THREE.Mesh[] = [];
  private currentEnergies: number[] = [];
  private headCenter = new THREE.Vector3(0, 0.6, 0);

  constructor() {
    this.group = new THREE.Group();
    this.group.name = 'energy';

    for (const config of SPEAKERS_7_1_4) {
      const position = polarToCartesian(config.azimuth, config.elevation, SPEAKER_RADIUS);
      position.add(this.headCenter);

      const color = new THREE.Color(config.color);

      // Outer energy ring (larger, more transparent)
      const outerRing = new THREE.Mesh(
        new THREE.RingGeometry(0.18, 0.22, 48),
        new THREE.MeshBasicMaterial({
          color,
          transparent: true,
          opacity: 0,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
      );
      outerRing.position.copy(position);
      outerRing.lookAt(this.headCenter);
      this.group.add(outerRing);
      this.rings.push(outerRing);

      // Pulse sphere (expands on beats)
      const pulse = new THREE.Mesh(
        new THREE.SphereGeometry(0.1, 16, 12),
        new THREE.MeshBasicMaterial({
          color,
          transparent: true,
          opacity: 0,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
      );
      pulse.position.copy(position);
      this.group.add(pulse);
      this.pulses.push(pulse);

      this.currentEnergies.push(0);
    }
  }

  /**
   * Update energy visualizations.
   * @param channelEnergies Per-channel energy values (0-1)
   * @param isOnset Whether a beat onset was detected
   */
  public update(channelEnergies: number[], isOnset: boolean): void {
    for (let i = 0; i < SPEAKERS_7_1_4.length; i++) {
      const config = SPEAKERS_7_1_4[i];
      const target = channelEnergies[config.channelIndex] ?? 0;

      this.currentEnergies[i] = smoothStep(this.currentEnergies[i], target, 0.12);
      const energy = this.currentEnergies[i];

      // Outer ring
      const ring = this.rings[i];
      const ringScale = 1 + energy * 4;
      ring.scale.set(ringScale, ringScale, 1);
      (ring.material as THREE.MeshBasicMaterial).opacity = energy * 0.4;

      // Pulse sphere
      const pulse = this.pulses[i];
      if (isOnset && energy > 0.2) {
        // Trigger pulse expansion
        pulse.scale.set(1, 1, 1);
        (pulse.material as THREE.MeshBasicMaterial).opacity = 0.6;
      }

      // Animate pulse decay
      const currentScale = pulse.scale.x;
      if (currentScale > 0.01) {
        const newScale = currentScale * 0.92;
        pulse.scale.set(newScale, newScale, newScale);
        const mat = pulse.material as THREE.MeshBasicMaterial;
        mat.opacity *= 0.92;
      }
    }
  }

  public addToScene(scene: THREE.Scene): void {
    scene.add(this.group);
  }
}
