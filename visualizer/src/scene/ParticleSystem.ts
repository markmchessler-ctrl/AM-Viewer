import * as THREE from 'three';
import { MAX_PARTICLES, SPEAKERS_7_1_4, BAND_COLORS, type FreqBandName } from '../utils/constants';
import { clamp } from '../utils/math';

interface Particle {
  alive: boolean;
  age: number;
  lifetime: number;
  speakerIndex: number;
  bandIndex: number;
  velocity: THREE.Vector3;
}

/**
 * GPU-efficient particle system using InstancedMesh.
 * Particles emit from speaker positions, flow toward the head, and react to audio.
 */
export class ParticleSystem {
  private instancedMesh: THREE.InstancedMesh;
  private particles: Particle[];
  private dummy: THREE.Object3D;
  private poolIndex = 0;
  private speakerPositions: THREE.Vector3[] = [];
  private headCenter = new THREE.Vector3(0, 0.6, 0);
  private colorArray: Float32Array;
  private densityMultiplier = 1;

  // Band color vectors (pre-computed)
  private bandColorVecs: THREE.Color[];

  constructor() {
    // Create instanced geometry
    const geometry = new THREE.SphereGeometry(0.015, 6, 4);
    const material = new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0.8,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    this.instancedMesh = new THREE.InstancedMesh(geometry, material, MAX_PARTICLES);
    this.instancedMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.instancedMesh.name = 'particles';

    // Enable per-instance color
    this.colorArray = new Float32Array(MAX_PARTICLES * 3);
    this.instancedMesh.instanceColor = new THREE.InstancedBufferAttribute(
      this.colorArray, 3
    );
    this.instancedMesh.instanceColor.setUsage(THREE.DynamicDrawUsage);

    // Initialize particles as dead
    this.particles = [];
    this.dummy = new THREE.Object3D();

    for (let i = 0; i < MAX_PARTICLES; i++) {
      this.particles.push({
        alive: false,
        age: 0,
        lifetime: 1,
        speakerIndex: 0,
        bandIndex: 0,
        velocity: new THREE.Vector3(),
      });

      // Place all dead particles off-screen
      this.dummy.position.set(0, -100, 0);
      this.dummy.scale.set(0, 0, 0);
      this.dummy.updateMatrix();
      this.instancedMesh.setMatrixAt(i, this.dummy.matrix);
    }

    // Pre-compute band colors
    const bandNames: FreqBandName[] = ['bass', 'lowMid', 'mid', 'highMid', 'treble'];
    this.bandColorVecs = bandNames.map(name => new THREE.Color(BAND_COLORS[name]));
  }

  public setSpeakerPositions(positions: THREE.Vector3[]): void {
    this.speakerPositions = positions;
  }

  public setDensity(multiplier: number): void {
    this.densityMultiplier = multiplier;
  }

  /**
   * Update the particle system each frame.
   * @param bandEnergies Per-channel array of 5-band energy values
   * @param isOnset Whether a beat onset was detected this frame
   * @param delta Frame delta time in seconds
   */
  public update(
    bandEnergies: number[][],
    isOnset: boolean,
    delta: number
  ): void {
    // Emit new particles from speakers based on energy
    for (let si = 0; si < this.speakerPositions.length && si < bandEnergies.length; si++) {
      const bands = bandEnergies[si];
      if (!bands) continue;

      const totalEnergy = bands.reduce((sum, e) => sum + e, 0) / bands.length;

      // Number of particles to emit per frame scales with energy
      let emitCount = Math.floor(totalEnergy * 4 * this.densityMultiplier);
      if (isOnset) emitCount *= 3; // burst on beats

      for (let e = 0; e < emitCount; e++) {
        // Pick the dominant band for color
        let maxBand = 0;
        let maxVal = 0;
        for (let b = 0; b < bands.length; b++) {
          if (bands[b] > maxVal) {
            maxVal = bands[b];
            maxBand = b;
          }
        }

        this.emitParticle(si, maxBand, totalEnergy, isOnset);
      }
    }

    // Update all alive particles
    for (let i = 0; i < MAX_PARTICLES; i++) {
      const p = this.particles[i];
      if (!p.alive) continue;

      p.age += delta;
      if (p.age >= p.lifetime) {
        p.alive = false;
        this.dummy.position.set(0, -100, 0);
        this.dummy.scale.set(0, 0, 0);
        this.dummy.updateMatrix();
        this.instancedMesh.setMatrixAt(i, this.dummy.matrix);
        continue;
      }

      const t = p.age / p.lifetime; // 0..1

      // Move toward head with some turbulence
      const toHead = this.headCenter.clone().sub(this.dummy.position).normalize();
      const turbulence = new THREE.Vector3(
        (Math.random() - 0.5) * 0.3,
        (Math.random() - 0.5) * 0.3,
        (Math.random() - 0.5) * 0.3
      );

      p.velocity.lerp(toHead.multiplyScalar(0.5), delta * 2);
      p.velocity.add(turbulence.multiplyScalar(delta));

      // Read current position from matrix
      this.instancedMesh.getMatrixAt(i, this.dummy.matrix);
      this.dummy.matrix.decompose(this.dummy.position, this.dummy.quaternion, this.dummy.scale);

      this.dummy.position.add(p.velocity.clone().multiplyScalar(delta));

      // Scale down as particle ages
      const fadeScale = 1 - t * t;
      const size = fadeScale * (0.5 + Math.random() * 0.5);
      this.dummy.scale.set(size, size, size);

      this.dummy.updateMatrix();
      this.instancedMesh.setMatrixAt(i, this.dummy.matrix);

      // Fade color opacity via alpha (stored as reduced color intensity)
      const color = this.bandColorVecs[p.bandIndex] || this.bandColorVecs[0];
      const fade = clamp(fadeScale, 0, 1);
      this.colorArray[i * 3] = color.r * fade;
      this.colorArray[i * 3 + 1] = color.g * fade;
      this.colorArray[i * 3 + 2] = color.b * fade;
    }

    this.instancedMesh.instanceMatrix.needsUpdate = true;
    if (this.instancedMesh.instanceColor) {
      this.instancedMesh.instanceColor.needsUpdate = true;
    }
  }

  private emitParticle(
    speakerIndex: number,
    bandIndex: number,
    energy: number,
    isOnset: boolean
  ): void {
    const p = this.particles[this.poolIndex];
    const i = this.poolIndex;
    this.poolIndex = (this.poolIndex + 1) % MAX_PARTICLES;

    const speakerPos = this.speakerPositions[speakerIndex];
    if (!speakerPos) return;

    p.alive = true;
    p.age = 0;
    p.lifetime = 1.5 + Math.random() * 2;
    p.speakerIndex = speakerIndex;
    p.bandIndex = clamp(bandIndex, 0, 4);

    // Start at speaker position with some random offset
    const offset = new THREE.Vector3(
      (Math.random() - 0.5) * 0.15,
      (Math.random() - 0.5) * 0.15,
      (Math.random() - 0.5) * 0.15
    );

    this.dummy.position.copy(speakerPos).add(offset);

    // Initial velocity: toward head with some spread
    const toHead = this.headCenter.clone().sub(speakerPos).normalize();
    const spread = new THREE.Vector3(
      (Math.random() - 0.5) * 0.5,
      (Math.random() - 0.5) * 0.5,
      (Math.random() - 0.5) * 0.5
    );

    const speed = (0.3 + energy * 0.7) * (isOnset ? 2 : 1);
    p.velocity.copy(toHead.multiplyScalar(speed)).add(spread);

    // Initial scale
    const scale = 0.5 + energy * 1.5;
    this.dummy.scale.set(scale, scale, scale);
    this.dummy.updateMatrix();
    this.instancedMesh.setMatrixAt(i, this.dummy.matrix);

    // Set initial color
    const color = this.bandColorVecs[p.bandIndex] || this.bandColorVecs[0];
    this.colorArray[i * 3] = color.r;
    this.colorArray[i * 3 + 1] = color.g;
    this.colorArray[i * 3 + 2] = color.b;
  }

  public getMesh(): THREE.InstancedMesh {
    return this.instancedMesh;
  }
}
