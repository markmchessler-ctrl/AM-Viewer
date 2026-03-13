import * as THREE from 'three';

/**
 * Creates a stylized mannequin head at the scene origin, evoking
 * the Neumann KU 100 dummy head aesthetic.
 */
export class HeadModel {
  public group: THREE.Group;

  constructor() {
    this.group = new THREE.Group();
    this.group.name = 'head';

    const headMaterial = new THREE.MeshStandardMaterial({
      color: 0x888899,
      roughness: 0.7,
      metalness: 0.1,
    });

    const darkMaterial = new THREE.MeshStandardMaterial({
      color: 0x333340,
      roughness: 0.9,
      metalness: 0.0,
    });

    // Cranium — slightly elongated ellipsoid
    const cranium = new THREE.Mesh(
      new THREE.SphereGeometry(0.35, 32, 24),
      headMaterial
    );
    cranium.scale.set(1, 1.15, 1.05);
    cranium.position.y = 0.1;
    this.group.add(cranium);

    // Jaw / chin area — smaller sphere merged below
    const jaw = new THREE.Mesh(
      new THREE.SphereGeometry(0.28, 24, 16),
      headMaterial
    );
    jaw.scale.set(0.9, 0.7, 0.85);
    jaw.position.set(0, -0.18, 0.05);
    this.group.add(jaw);

    // Left ear
    const earGeom = new THREE.SphereGeometry(0.1, 16, 12);
    const leftEar = new THREE.Mesh(earGeom, headMaterial);
    leftEar.scale.set(0.4, 1, 0.7);
    leftEar.position.set(-0.34, 0.05, 0);
    this.group.add(leftEar);

    // Right ear
    const rightEar = new THREE.Mesh(earGeom, headMaterial);
    rightEar.scale.set(0.4, 1, 0.7);
    rightEar.position.set(0.34, 0.05, 0);
    this.group.add(rightEar);

    // Ear canal indicators (dark circles)
    const canalGeom = new THREE.CircleGeometry(0.035, 16);
    const leftCanal = new THREE.Mesh(canalGeom, darkMaterial);
    leftCanal.position.set(-0.36, 0.05, 0);
    leftCanal.rotation.y = Math.PI / 2;
    this.group.add(leftCanal);

    const rightCanal = new THREE.Mesh(canalGeom, darkMaterial);
    rightCanal.position.set(0.36, 0.05, 0);
    rightCanal.rotation.y = -Math.PI / 2;
    this.group.add(rightCanal);

    // Nose — elongated sphere protruding forward
    const nose = new THREE.Mesh(
      new THREE.SphereGeometry(0.06, 12, 8),
      headMaterial
    );
    nose.scale.set(0.7, 0.8, 1.8);
    nose.position.set(0, -0.04, 0.35);
    this.group.add(nose);

    // Eye sockets — dark indentations
    const eyeGeom = new THREE.SphereGeometry(0.05, 12, 8);

    const leftEye = new THREE.Mesh(eyeGeom, darkMaterial);
    leftEye.position.set(-0.12, 0.08, 0.3);
    this.group.add(leftEye);

    const rightEye = new THREE.Mesh(eyeGeom, darkMaterial);
    rightEye.position.set(0.12, 0.08, 0.3);
    this.group.add(rightEye);

    // Neck / mounting post — cylinder below the head
    const neck = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.1, 0.3, 16),
      headMaterial
    );
    neck.position.set(0, -0.45, 0);
    this.group.add(neck);

    // Base / stand — flat disc
    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(0.2, 0.22, 0.04, 24),
      darkMaterial
    );
    base.position.set(0, -0.62, 0);
    this.group.add(base);

    // Position the entire head group at world origin
    this.group.position.set(0, 0.6, 0);
  }

  public addToScene(scene: THREE.Scene): void {
    scene.add(this.group);
  }
}
