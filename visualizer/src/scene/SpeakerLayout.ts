import * as THREE from 'three';
import { SPEAKERS_7_1_4, SPEAKER_RADIUS, type SpeakerConfig } from '../utils/constants';
import { polarToCartesian, smoothStep } from '../utils/math';

interface SpeakerMesh {
  config: SpeakerConfig;
  position: THREE.Vector3;
  sphere: THREE.Mesh;
  ring: THREE.Mesh;
  line: THREE.Line;
  label: THREE.Sprite;
  glowLight: THREE.PointLight;
  currentEnergy: number;
}

export class SpeakerLayout {
  public group: THREE.Group;
  private speakers: SpeakerMesh[] = [];
  private showLabels = true;
  private headCenter = new THREE.Vector3(0, 0.6, 0);

  constructor() {
    this.group = new THREE.Group();
    this.group.name = 'speakers';

    for (const config of SPEAKERS_7_1_4) {
      const speaker = this.createSpeaker(config);
      this.speakers.push(speaker);
    }
  }

  private createSpeaker(config: SpeakerConfig): SpeakerMesh {
    const position = polarToCartesian(config.azimuth, config.elevation, SPEAKER_RADIUS);
    position.add(this.headCenter);

    const color = new THREE.Color(config.color);

    // Speaker sphere
    const sphereGeom = new THREE.IcosahedronGeometry(0.08, 2);
    const sphereMat = new THREE.MeshStandardMaterial({
      color: color,
      emissive: color,
      emissiveIntensity: 0.3,
      roughness: 0.4,
      metalness: 0.6,
    });
    const sphere = new THREE.Mesh(sphereGeom, sphereMat);
    sphere.position.copy(position);
    this.group.add(sphere);

    // Energy ring
    const ringGeom = new THREE.RingGeometry(0.12, 0.15, 32);
    const ringMat = new THREE.MeshBasicMaterial({
      color: color,
      transparent: true,
      opacity: 0.15,
      side: THREE.DoubleSide,
    });
    const ring = new THREE.Mesh(ringGeom, ringMat);
    ring.position.copy(position);
    ring.lookAt(this.headCenter);
    this.group.add(ring);

    // Connection line to head center
    const lineGeom = new THREE.BufferGeometry().setFromPoints([
      position,
      this.headCenter,
    ]);
    const lineMat = new THREE.LineBasicMaterial({
      color: color,
      transparent: true,
      opacity: 0.06,
    });
    const line = new THREE.Line(lineGeom, lineMat);
    this.group.add(line);

    // Label sprite
    const label = this.createLabel(config.name, color);
    label.position.copy(position);
    label.position.y += 0.18;
    this.group.add(label);

    // Glow point light
    const glowLight = new THREE.PointLight(color, 0, 1.5);
    glowLight.position.copy(position);
    this.group.add(glowLight);

    return {
      config,
      position,
      sphere,
      ring,
      line,
      label,
      glowLight,
      currentEnergy: 0,
    };
  }

  private createLabel(text: string, color: THREE.Color): THREE.Sprite {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 64;
    const ctx = canvas.getContext('2d')!;

    ctx.font = 'bold 28px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = `#${color.getHexString()}`;
    ctx.fillText(text, 64, 32);

    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;

    const spriteMat = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      opacity: 0.7,
      depthTest: false,
    });

    const sprite = new THREE.Sprite(spriteMat);
    sprite.scale.set(0.3, 0.15, 1);
    return sprite;
  }

  /**
   * Update speaker visualizations with per-channel energy levels.
   * @param channelEnergies Array of energy values (0-1) per channel, indexed by channelIndex.
   */
  public update(channelEnergies: number[]): void {
    for (const speaker of this.speakers) {
      const targetEnergy = channelEnergies[speaker.config.channelIndex] ?? 0;
      speaker.currentEnergy = smoothStep(speaker.currentEnergy, targetEnergy, 0.15);

      const energy = speaker.currentEnergy;

      // Sphere emissive intensity
      const mat = speaker.sphere.material as THREE.MeshStandardMaterial;
      mat.emissiveIntensity = 0.3 + energy * 1.5;

      // Ring scale and opacity
      const ringScale = 1 + energy * 3;
      speaker.ring.scale.set(ringScale, ringScale, 1);
      (speaker.ring.material as THREE.MeshBasicMaterial).opacity = 0.1 + energy * 0.5;

      // Glow light intensity
      speaker.glowLight.intensity = energy * 2;

      // Connection line opacity
      (speaker.line.material as THREE.LineBasicMaterial).opacity = 0.04 + energy * 0.15;

      // Label visibility
      speaker.label.visible = this.showLabels;
    }
  }

  public setShowLabels(show: boolean): void {
    this.showLabels = show;
  }

  public getSpeakerPositions(): THREE.Vector3[] {
    return this.speakers.map(s => s.position.clone());
  }

  public getSpeakerColors(): THREE.Color[] {
    return this.speakers.map(s => new THREE.Color(s.config.color));
  }

  public addToScene(scene: THREE.Scene): void {
    scene.add(this.group);
  }
}
