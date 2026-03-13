import * as THREE from 'three';
import type { AdmAudioObject } from '../adm/AdmTypes';

interface TrackedObject {
  admObject: AdmAudioObject;
  mesh: THREE.Mesh;
  label: THREE.Sprite;
  trail: THREE.Vector3[];
  trailLine: THREE.Line;
}

/**
 * Visualizes ADM audio objects moving in 3D space.
 */
export class ObjectTracker {
  readonly group: THREE.Group;
  private objects: TrackedObject[] = [];
  private trailMaxLength = 60;

  constructor() {
    this.group = new THREE.Group();
    this.group.name = 'ObjectTracker';
  }

  /**
   * Set the ADM audio objects to track.
   */
  setObjects(admObjects: AdmAudioObject[]): void {
    this.clear();

    for (const obj of admObjects) {
      const color = this.objectColor(obj.name);

      // Glowing sphere
      const geo = new THREE.SphereGeometry(0.06, 12, 8);
      const mat = new THREE.MeshStandardMaterial({
        color,
        emissive: color,
        emissiveIntensity: 0.8,
        roughness: 0.3,
        metalness: 0.2,
      });
      const mesh = new THREE.Mesh(geo, mat);
      this.group.add(mesh);

      // Label
      const label = this.createLabel(obj.name, color);
      label.scale.set(0.5, 0.15, 1);
      this.group.add(label);

      // Trail
      const trailGeo = new THREE.BufferGeometry();
      const trailMat = new THREE.LineBasicMaterial({
        color,
        transparent: true,
        opacity: 0.4,
      });
      const trailLine = new THREE.Line(trailGeo, trailMat);
      this.group.add(trailLine);

      this.objects.push({
        admObject: obj,
        mesh,
        label,
        trail: [],
        trailLine,
      });
    }
  }

  /**
   * Update object positions based on current playback time.
   */
  update(currentTime: number, channelLevels?: number[]): void {
    for (const tracked of this.objects) {
      const pos = this.getObjectPosition(tracked.admObject, currentTime);
      if (!pos) continue;

      tracked.mesh.position.copy(pos);
      tracked.label.position.copy(pos);
      tracked.label.position.y += 0.12;

      // Pulse size with level if available
      const scale = 1 + (channelLevels ? (channelLevels[0] ?? 0) * 0.5 : 0);
      tracked.mesh.scale.setScalar(scale);

      // Update trail
      tracked.trail.push(pos.clone());
      if (tracked.trail.length > this.trailMaxLength) {
        tracked.trail.shift();
      }
      if (tracked.trail.length >= 2) {
        tracked.trailLine.geometry.dispose();
        tracked.trailLine.geometry = new THREE.BufferGeometry().setFromPoints(tracked.trail);
      }
    }
  }

  private getObjectPosition(obj: AdmAudioObject, _time: number): THREE.Vector3 | null {
    if (!obj.position) return null;

    if (obj.position.isPolar) {
      const azRad = THREE.MathUtils.degToRad(obj.position.azOrX);
      const elRad = THREE.MathUtils.degToRad(obj.position.elOrY);
      const dist = obj.position.distOrZ * 2.5; // scale to scene
      const cosEl = Math.cos(elRad);
      return new THREE.Vector3(
        -Math.sin(azRad) * cosEl * dist,
        Math.sin(elRad) * dist + 0.35,
        -Math.cos(azRad) * cosEl * dist
      );
    }

    // Cartesian: ADM range is -1..1
    return new THREE.Vector3(
      obj.position.azOrX * 2.5,
      obj.position.elOrY * 2.5 + 0.35,
      -obj.position.distOrZ * 2.5
    );
  }

  private objectColor(name: string): number {
    const lower = name.toLowerCase();
    if (lower.includes('dialog') || lower.includes('voice')) return 0xffcc44;
    if (lower.includes('music')) return 0x44aaff;
    if (lower.includes('effect') || lower.includes('sfx')) return 0xff4488;
    // Hash-based color
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
    return (hash & 0x00ffffff) | 0x444444;
  }

  private createLabel(text: string, color: number): THREE.Sprite {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, 256, 64);
    ctx.font = '24px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const c = new THREE.Color(color);
    ctx.fillStyle = `rgba(${Math.round(c.r * 255)}, ${Math.round(c.g * 255)}, ${Math.round(c.b * 255)}, 0.9)`;
    ctx.fillText(text, 128, 32);
    const tex = new THREE.CanvasTexture(canvas);
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
    return new THREE.Sprite(mat);
  }

  clear(): void {
    for (const obj of this.objects) {
      this.group.remove(obj.mesh);
      this.group.remove(obj.label);
      this.group.remove(obj.trailLine);
      obj.mesh.geometry.dispose();
      (obj.mesh.material as THREE.Material).dispose();
      obj.trailLine.geometry.dispose();
      (obj.trailLine.material as THREE.Material).dispose();
    }
    this.objects = [];
  }

  addToScene(scene: THREE.Scene): void {
    scene.add(this.group);
  }
}
