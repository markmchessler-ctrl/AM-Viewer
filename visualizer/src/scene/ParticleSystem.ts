import * as THREE from 'three';
import { SPEAKERS_7_1_4, SPEAKER_RADIUS, MAX_PARTICLES, PARTICLE_LIFETIME, BAND_COLORS, type BandName } from '../utils/constants';
import { polarToCartesian } from '../utils/math';

interface Particle {
  alive: boolean;
  age: number;
  lifetime: number;
  velocity: THREE.Vector3;
  speaker: number;
  band: BandName;
}

/**
 * GPU-efficient particle system using InstancedMesh.
 * Particles emit from speakers, flow toward the head, with color mapped to frequency band.
 */
export class ParticleSystem {
  readonly mesh: THREE.InstancedMesh;
  private particles: Particle[];
  private dummy = new THREE.Object3D();
  private speakerPositions: THREE.Vector3[];
  private colorAttr: THREE.InstancedBufferAttribute;
  density = 1.0; // 0..2 multiplier

  constructor() {
    const geo = new THREE.SphereGeometry(0.025, 6, 4);
    const mat = new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0.8,
      depthWrite: false,
    });
    // Use vertex colors
    mat.vertexColors = false;

    this.mesh = new THREE.InstancedMesh(geo, mat, MAX_PARTICLES);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;

    // Per-instance color
    const colors = new Float32Array(MAX_PARTICLES * 3);
    this.colorAttr = new THREE.InstancedBufferAttribute(colors, 3);
    this.mesh.instanceColor = this.colorAttr;

    this.particles = Array.from({ length: MAX_PARTICLES }, () => ({
      alive: false,
      age: 0,
      lifetime: PARTICLE_LIFETIME,
      velocity: new THREE.Vector3(),
      speaker: 0,
      band: 'mid' as BandName,
    }));

    // Hide all initially
    this.dummy.scale.set(0, 0, 0);
    this.dummy.updateMatrix();
    for (let i = 0; i < MAX_PARTICLES; i++) {
      this.mesh.setMatrixAt(i, this.dummy.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;

    this.speakerPositions = SPEAKERS_7_1_4.map(s =>
      polarToCartesian(s.azimuth, s.elevation, SPEAKER_RADIUS)
    );
  }

  /**
   * Emit particles based on per-channel band energies and onset detection.
   */
  emit(
    channelBands: Array<Record<BandName, number>>,
    isOnset: boolean,
  ): void {
    const bandNames: BandName[] = ['bass', 'lowMid', 'mid', 'highMid', 'treble'];

    for (let ch = 0; ch < Math.min(channelBands.length, this.speakerPositions.length); ch++) {
      const bands = channelBands[ch];
      if (!bands) continue;

      for (const band of bandNames) {
        const energy = bands[band];
        // Emit rate proportional to energy
        let rate = energy * 2 * this.density;
        if (isOnset) rate *= 3;
        if (Math.random() > rate) continue;

        this.spawnParticle(ch, band, energy, isOnset);
      }
    }
  }

  private spawnParticle(speaker: number, band: BandName, energy: number, burst: boolean): void {
    // Find a dead particle slot
    const idx = this.particles.findIndex(p => !p.alive);
    if (idx === -1) return;

    const p = this.particles[idx];
    p.alive = true;
    p.age = 0;
    p.lifetime = PARTICLE_LIFETIME * (0.5 + Math.random() * 0.5);
    p.speaker = speaker;
    p.band = band;

    const origin = this.speakerPositions[speaker];
    // Velocity toward center with some turbulence
    const toCenter = new THREE.Vector3(0, 0.35, 0).sub(origin).normalize();
    const speed = (0.3 + energy * 0.8) * (burst ? 2 : 1);
    p.velocity.copy(toCenter).multiplyScalar(speed);
    // Add random spread
    p.velocity.x += (Math.random() - 0.5) * 0.4;
    p.velocity.y += (Math.random() - 0.5) * 0.3;
    p.velocity.z += (Math.random() - 0.5) * 0.4;

    // Set initial position
    this.dummy.position.copy(origin);
    this.dummy.position.x += (Math.random() - 0.5) * 0.1;
    this.dummy.position.y += (Math.random() - 0.5) * 0.1;
    this.dummy.position.z += (Math.random() - 0.5) * 0.1;

    const scale = (0.5 + energy * 1.5) * (burst ? 1.5 : 1);
    this.dummy.scale.set(scale, scale, scale);
    this.dummy.updateMatrix();
    this.mesh.setMatrixAt(idx, this.dummy.matrix);

    // Set color
    const color = new THREE.Color(BAND_COLORS[band]);
    this.colorAttr.setXYZ(idx, color.r, color.g, color.b);
  }

  update(dt: number): void {
    let needsUpdate = false;

    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      if (!p.alive) continue;

      p.age += dt;
      if (p.age >= p.lifetime) {
        p.alive = false;
        this.dummy.scale.set(0, 0, 0);
        this.dummy.updateMatrix();
        this.mesh.setMatrixAt(i, this.dummy.matrix);
        needsUpdate = true;
        continue;
      }

      // Get current position from matrix
      this.mesh.getMatrixAt(i, this.dummy.matrix);
      this.dummy.matrix.decompose(this.dummy.position, this.dummy.quaternion, this.dummy.scale);

      // Move
      this.dummy.position.add(p.velocity.clone().multiplyScalar(dt));

      // Perlin-like turbulence (simple sin-based)
      const t = p.age * 3;
      this.dummy.position.x += Math.sin(t + i * 0.1) * 0.003;
      this.dummy.position.y += Math.cos(t * 0.7 + i * 0.2) * 0.002;
      this.dummy.position.z += Math.sin(t * 1.3 + i * 0.3) * 0.003;

      // Fade out: shrink as particle ages
      const life = 1 - p.age / p.lifetime;
      const s = this.dummy.scale.x * (life > 0.5 ? 1 : life * 2);
      this.dummy.scale.set(
        Math.max(0.01, s),
        Math.max(0.01, s),
        Math.max(0.01, s)
      );

      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(i, this.dummy.matrix);
      needsUpdate = true;
    }

    if (needsUpdate) {
      this.mesh.instanceMatrix.needsUpdate = true;
      this.colorAttr.needsUpdate = true;
    }
  }

  addToScene(scene: THREE.Scene): void {
    scene.add(this.mesh);
  }
}
