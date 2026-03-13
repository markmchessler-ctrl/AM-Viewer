import * as THREE from 'three';
import { SPEAKERS_7_1_4, SPEAKER_RADIUS, type SpeakerDef } from '../utils/constants';
import { polarToCartesian } from '../utils/math';

interface SpeakerVisual {
  def: SpeakerDef;
  position: THREE.Vector3;
  mesh: THREE.Mesh;
  ring: THREE.Mesh;
  glow: THREE.PointLight;
  line: THREE.Line;
  label: THREE.Sprite;
  energy: number;
}

export class SpeakerLayout {
  readonly group: THREE.Group;
  private speakers: SpeakerVisual[] = [];
  showLabels = true;
  showLines = true;

  constructor() {
    this.group = new THREE.Group();
    this.group.name = 'SpeakerLayout';

    for (const def of SPEAKERS_7_1_4) {
      const pos = polarToCartesian(def.azimuth, def.elevation, SPEAKER_RADIUS);
      const visual = this.createSpeaker(def, pos);
      this.speakers.push(visual);
    }
  }

  private createSpeaker(def: SpeakerDef, position: THREE.Vector3): SpeakerVisual {
    // Speaker sphere
    const geo = new THREE.IcosahedronGeometry(0.08, 2);
    const mat = new THREE.MeshStandardMaterial({
      color: def.color,
      emissive: def.color,
      emissiveIntensity: 0.3,
      roughness: 0.3,
      metalness: 0.4,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(position);
    this.group.add(mesh);

    // Energy ring
    const ringGeo = new THREE.RingGeometry(0.12, 0.16, 24);
    const ringMat = new THREE.MeshBasicMaterial({
      color: def.color,
      transparent: true,
      opacity: 0.15,
      side: THREE.DoubleSide,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.position.copy(position);
    ring.lookAt(0, position.y, 0); // face toward center
    this.group.add(ring);

    // Point light glow
    const glow = new THREE.PointLight(def.color, 0.1, 2);
    glow.position.copy(position);
    this.group.add(glow);

    // Line to center
    const lineGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0.35, 0), // head center approx
      position,
    ]);
    const lineMat = new THREE.LineBasicMaterial({
      color: def.color,
      transparent: true,
      opacity: 0.08,
    });
    const line = new THREE.Line(lineGeo, lineMat);
    this.group.add(line);

    // Text label sprite
    const label = this.createLabel(def.shortLabel, def.color);
    label.position.copy(position);
    label.position.y += 0.18;
    label.scale.set(0.35, 0.12, 1);
    this.group.add(label);

    return { def, position, mesh, ring, glow, line, label, energy: 0 };
  }

  private createLabel(text: string, color: number): THREE.Sprite {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 48;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, 128, 48);
    ctx.font = 'bold 28px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const c = new THREE.Color(color);
    ctx.fillStyle = `rgba(${Math.round(c.r * 255)}, ${Math.round(c.g * 255)}, ${Math.round(c.b * 255)}, 0.8)`;
    ctx.fillText(text, 64, 24);
    const tex = new THREE.CanvasTexture(canvas);
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
    return new THREE.Sprite(mat);
  }

  /**
   * Update speaker visuals with per-channel energy levels.
   * @param energies Array of energy values [0..1] indexed by channel
   */
  update(energies: number[]): void {
    for (const spk of this.speakers) {
      const e = energies[spk.def.channelIndex] ?? 0;
      spk.energy += (e - spk.energy) * 0.2; // smooth
      const energy = spk.energy;

      // Ring scale
      const ringScale = 1 + energy * 3;
      spk.ring.scale.set(ringScale, ringScale, 1);
      (spk.ring.material as THREE.MeshBasicMaterial).opacity = 0.1 + energy * 0.5;

      // Emissive intensity
      (spk.mesh.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.2 + energy * 2;

      // Glow intensity
      spk.glow.intensity = 0.05 + energy * 1.5;

      // Visibility toggles
      spk.label.visible = this.showLabels;
      spk.line.visible = this.showLines;
    }
  }

  getSpeakerPositions(): THREE.Vector3[] {
    return this.speakers.map(s => s.position.clone());
  }

  addToScene(scene: THREE.Scene): void {
    scene.add(this.group);
  }
}
