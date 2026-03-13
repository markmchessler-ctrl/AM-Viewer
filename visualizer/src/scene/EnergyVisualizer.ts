import * as THREE from 'three';
import { SPEAKERS_7_1_4, SPEAKER_RADIUS } from '../utils/constants';
import { polarToCartesian } from '../utils/math';

/**
 * Per-speaker energy pulses — expanding rings that emanate from speakers on beats.
 */
export class EnergyVisualizer {
  readonly group: THREE.Group;
  private pulses: Pulse[] = [];
  private speakerPositions: THREE.Vector3[];

  constructor() {
    this.group = new THREE.Group();
    this.group.name = 'EnergyVisualizer';

    this.speakerPositions = SPEAKERS_7_1_4.map(s =>
      polarToCartesian(s.azimuth, s.elevation, SPEAKER_RADIUS)
    );
  }

  /**
   * Trigger energy pulses from speakers with energy above threshold.
   */
  triggerPulse(channelEnergies: number[], isOnset: boolean): void {
    for (let i = 0; i < this.speakerPositions.length; i++) {
      const energy = channelEnergies[i] ?? 0;
      if (isOnset && energy > 0.15) {
        this.spawnPulse(i, energy);
      }
    }
  }

  private spawnPulse(speakerIndex: number, energy: number): void {
    const pos = this.speakerPositions[speakerIndex];
    const color = SPEAKERS_7_1_4[speakerIndex].color;

    const geo = new THREE.RingGeometry(0.05, 0.08, 24);
    const mat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.6 * energy,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(pos);
    mesh.lookAt(0, pos.y, 0);
    this.group.add(mesh);

    this.pulses.push({
      mesh,
      material: mat,
      age: 0,
      lifetime: 0.6 + energy * 0.4,
      maxScale: 2 + energy * 4,
    });

    // Limit active pulses
    while (this.pulses.length > 60) {
      const old = this.pulses.shift()!;
      this.group.remove(old.mesh);
      old.mesh.geometry.dispose();
      old.material.dispose();
    }
  }

  update(dt: number): void {
    for (let i = this.pulses.length - 1; i >= 0; i--) {
      const p = this.pulses[i];
      p.age += dt;
      const t = p.age / p.lifetime;

      if (t >= 1) {
        this.group.remove(p.mesh);
        p.mesh.geometry.dispose();
        p.material.dispose();
        this.pulses.splice(i, 1);
        continue;
      }

      const scale = 1 + t * p.maxScale;
      p.mesh.scale.set(scale, scale, 1);
      p.material.opacity = (1 - t) * 0.5;
    }
  }

  addToScene(scene: THREE.Scene): void {
    scene.add(this.group);
  }
}

interface Pulse {
  mesh: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
  age: number;
  lifetime: number;
  maxScale: number;
}
