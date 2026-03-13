import * as THREE from 'three';

/**
 * Procedural mannequin head (Neumann KU 100 aesthetic).
 * Positioned at origin, facing -Z (Three.js forward convention).
 */
export class HeadModel {
  readonly group: THREE.Group;

  constructor() {
    this.group = new THREE.Group();
    this.group.name = 'HeadModel';

    const headMat = new THREE.MeshStandardMaterial({
      color: 0x888890,
      roughness: 0.65,
      metalness: 0.1,
    });

    const darkMat = new THREE.MeshStandardMaterial({
      color: 0x333338,
      roughness: 0.8,
      metalness: 0.05,
    });

    // Cranium — slightly elongated sphere
    const cranium = new THREE.Mesh(
      new THREE.SphereGeometry(0.42, 32, 24),
      headMat
    );
    cranium.scale.set(0.85, 1.0, 0.9);
    cranium.position.set(0, 0.9, 0);
    this.group.add(cranium);

    // Jaw area — smaller sphere blended below
    const jaw = new THREE.Mesh(
      new THREE.SphereGeometry(0.3, 24, 16),
      headMat
    );
    jaw.scale.set(0.78, 0.6, 0.8);
    jaw.position.set(0, 0.58, -0.02);
    this.group.add(jaw);

    // Ears
    for (const side of [-1, 1]) {
      const ear = new THREE.Mesh(
        new THREE.SphereGeometry(0.1, 12, 8),
        headMat
      );
      ear.scale.set(0.4, 0.8, 0.6);
      ear.position.set(side * 0.38, 0.85, 0);
      this.group.add(ear);
    }

    // Nose
    const nose = new THREE.Mesh(
      new THREE.SphereGeometry(0.08, 12, 8),
      headMat
    );
    nose.scale.set(0.6, 0.7, 1.2);
    nose.position.set(0, 0.72, -0.38);
    this.group.add(nose);

    // Eye sockets (dark indentations)
    for (const side of [-1, 1]) {
      const eye = new THREE.Mesh(
        new THREE.SphereGeometry(0.055, 12, 8),
        darkMat
      );
      eye.position.set(side * 0.15, 0.88, -0.34);
      this.group.add(eye);
    }

    // Neck cylinder
    const neck = new THREE.Mesh(
      new THREE.CylinderGeometry(0.14, 0.16, 0.25, 16),
      headMat
    );
    neck.position.set(0, 0.38, 0);
    this.group.add(neck);

    // Shoulder base (subtle pedestal)
    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(0.28, 0.32, 0.08, 20),
      headMat
    );
    base.position.set(0, 0.24, 0);
    this.group.add(base);

    // Position the whole group so the head center is near origin
    this.group.position.set(0, -0.55, 0);
  }

  addToScene(scene: THREE.Scene): void {
    scene.add(this.group);
  }
}
