import * as THREE from 'three';
import type { AdmAudioObject } from '../adm/AdmTypes';
import { clamp, smoothStep } from '../utils/math';

interface TrackedObject {
  admObject: AdmAudioObject;
  mesh: THREE.Mesh;
  trail: THREE.Line;
  trailPositions: THREE.Vector3[];
  label: THREE.Sprite;
  currentEnergy: number;
}

/**
 * Visualizes ADM audio objects moving in 3D space.
 * Each object is rendered as a glowing sphere with a trail.
 */
export class ObjectTracker {
  public group: THREE.Group;
  private objects: Map<string, TrackedObject> = new Map();
  private headCenter = new THREE.Vector3(0, 0.6, 0);
  private maxTrailPoints = 60;

  // Color palette for different object types
  private typeColors: Record<string, string> = {
    dialogue: '#ffdd44',
    music: '#44ff88',
    effects: '#ff4488',
    default: '#ffffff',
  };

  constructor() {
    this.group = new THREE.Group();
    this.group.name = 'objects';
  }

  /**
   * Update tracked objects from ADM metadata.
   * Optionally accepts per-channel energy data for energy-driven visualization.
   */
  public updateObjects(
    admObjects: AdmAudioObject[],
    currentTime: number,
    channelEnergies?: number[],
    bedChannelCount?: number,
  ): void {
    const activeIds = new Set<string>();

    for (let i = 0; i < admObjects.length; i++) {
      const obj = admObjects[i];
      activeIds.add(obj.id);

      if (!this.objects.has(obj.id)) {
        this.createTrackedObject(obj);
      }

      const tracked = this.objects.get(obj.id)!;
      tracked.admObject = obj;

      // Get position at current time
      const pos = this.getObjectPosition(obj, currentTime);
      if (pos) {
        const worldPos = pos.clone().add(this.headCenter);

        // Update trail
        tracked.trailPositions.push(worldPos.clone());
        if (tracked.trailPositions.length > this.maxTrailPoints) {
          tracked.trailPositions.shift();
        }
        this.updateTrail(tracked);

        // Smooth position update
        tracked.mesh.position.lerp(worldPos, 0.2);
        tracked.label.position.copy(tracked.mesh.position);
        tracked.label.position.y += 0.15;

        // Use per-channel audio energy if available, otherwise fall back to ADM gain
        let energy: number;
        if (channelEnergies && bedChannelCount !== undefined) {
          const chIndex = bedChannelCount + i;
          energy = clamp((channelEnergies[chIndex] ?? 0) * 3, 0, 2);
        } else {
          energy = clamp(obj.gain ?? 1, 0, 2);
        }

        tracked.currentEnergy = smoothStep(tracked.currentEnergy, energy, 0.1);
        const scale = 0.08 + tracked.currentEnergy * 0.08;
        tracked.mesh.scale.set(scale / 0.06, scale / 0.06, scale / 0.06);

        const mat = tracked.mesh.material as THREE.MeshStandardMaterial;
        mat.emissiveIntensity = 0.5 + tracked.currentEnergy * 1.5;
      }
    }

    // Remove objects no longer in the ADM data
    for (const [id, tracked] of this.objects) {
      if (!activeIds.has(id)) {
        this.group.remove(tracked.mesh);
        this.group.remove(tracked.trail);
        this.group.remove(tracked.label);
        this.objects.delete(id);
      }
    }
  }

  private createTrackedObject(obj: AdmAudioObject): void {
    const colorHex = this.typeColors[obj.contentKind ?? 'default'] || this.typeColors.default;
    const color = new THREE.Color(colorHex);

    // Glowing sphere
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.06, 16, 12),
      new THREE.MeshStandardMaterial({
        color,
        emissive: color,
        emissiveIntensity: 0.8,
        roughness: 0.3,
        metalness: 0.5,
        transparent: true,
        opacity: 0.9,
      })
    );
    this.group.add(mesh);

    // Trail line
    const trailGeom = new THREE.BufferGeometry();
    const trail = new THREE.Line(
      trailGeom,
      new THREE.LineBasicMaterial({
        color,
        transparent: true,
        opacity: 0.3,
      })
    );
    this.group.add(trail);

    // Label
    const label = this.createLabel(obj.name || obj.id, color);
    this.group.add(label);

    this.objects.set(obj.id, {
      admObject: obj,
      mesh,
      trail,
      trailPositions: [],
      label,
      currentEnergy: 0,
    });
  }

  private getObjectPosition(obj: AdmAudioObject, _time: number): THREE.Vector3 | null {
    if (obj.x !== undefined && obj.y !== undefined && obj.z !== undefined) {
      // ADM Cartesian: X is left-right, Y is front-back, Z is up-down
      // Map to Three.js: x = -X (right), y = Z (up), z = Y (forward)
      return new THREE.Vector3(
        -obj.x * 2.5,
        obj.z * 2.5,
        obj.y * 2.5
      );
    }
    if (obj.azimuth !== undefined && obj.elevation !== undefined) {
      const dist = (obj.distance ?? 1) * 2.5;
      const az = THREE.MathUtils.degToRad(obj.azimuth);
      const el = THREE.MathUtils.degToRad(obj.elevation);
      return new THREE.Vector3(
        -dist * Math.cos(el) * Math.sin(az),
        dist * Math.sin(el),
        dist * Math.cos(el) * Math.cos(az)
      );
    }
    return null;
  }

  private updateTrail(tracked: TrackedObject): void {
    const points = tracked.trailPositions;
    if (points.length < 2) return;

    const positions = new Float32Array(points.length * 3);
    for (let i = 0; i < points.length; i++) {
      positions[i * 3] = points[i].x;
      positions[i * 3 + 1] = points[i].y;
      positions[i * 3 + 2] = points[i].z;
    }

    tracked.trail.geometry.dispose();
    tracked.trail.geometry = new THREE.BufferGeometry();
    tracked.trail.geometry.setAttribute(
      'position',
      new THREE.BufferAttribute(positions, 3)
    );
  }

  private createLabel(text: string, color: THREE.Color): THREE.Sprite {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext('2d')!;

    ctx.font = '20px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = `#${color.getHexString()}`;
    ctx.fillText(text.substring(0, 20), 128, 32);

    const texture = new THREE.CanvasTexture(canvas);
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        opacity: 0.6,
        depthTest: false,
      })
    );
    sprite.scale.set(0.5, 0.125, 1);
    return sprite;
  }

  public clear(): void {
    for (const [, tracked] of this.objects) {
      this.group.remove(tracked.mesh);
      this.group.remove(tracked.trail);
      this.group.remove(tracked.label);
    }
    this.objects.clear();
  }

  public addToScene(scene: THREE.Scene): void {
    scene.add(this.group);
  }
}
