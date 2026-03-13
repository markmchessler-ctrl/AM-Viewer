import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

export class SceneManager {
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  readonly renderer: THREE.WebGLRenderer;
  readonly controls: OrbitControls;

  private clock = new THREE.Clock();
  private updateCallbacks: Array<(dt: number, elapsed: number) => void> = [];
  private animationId = 0;
  private fpsFrames = 0;
  private fpsTime = 0;
  fps = 0;

  constructor(container: HTMLElement) {
    // Scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0a0a0f);
    this.scene.fog = new THREE.FogExp2(0x0a0a0f, 0.035);

    // Camera
    this.camera = new THREE.PerspectiveCamera(
      55,
      container.clientWidth / container.clientHeight,
      0.1,
      100
    );
    this.camera.position.set(3, 2.5, 5);

    // Renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.2;
    container.insertBefore(this.renderer.domElement, container.firstChild);

    // Controls
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.minDistance = 1.5;
    this.controls.maxDistance = 20;
    this.controls.target.set(0, 0.3, 0);

    // Lighting
    const ambient = new THREE.AmbientLight(0x303040, 0.8);
    this.scene.add(ambient);

    const dirLight = new THREE.DirectionalLight(0xddeeff, 1.0);
    dirLight.position.set(3, 5, 4);
    this.scene.add(dirLight);

    const rimLight = new THREE.DirectionalLight(0x4466aa, 0.4);
    rimLight.position.set(-3, 2, -4);
    this.scene.add(rimLight);

    // Grid helper (subtle)
    const grid = new THREE.GridHelper(10, 20, 0x222233, 0x181825);
    grid.position.y = -0.01;
    this.scene.add(grid);

    // Resize
    window.addEventListener('resize', () => this.onResize(container));
  }

  onUpdate(cb: (dt: number, elapsed: number) => void): void {
    this.updateCallbacks.push(cb);
  }

  start(): void {
    this.clock.start();
    const loop = () => {
      this.animationId = requestAnimationFrame(loop);
      const dt = this.clock.getDelta();
      const elapsed = this.clock.getElapsedTime();

      // FPS counter
      this.fpsFrames++;
      this.fpsTime += dt;
      if (this.fpsTime >= 0.5) {
        this.fps = Math.round(this.fpsFrames / this.fpsTime);
        this.fpsFrames = 0;
        this.fpsTime = 0;
      }

      for (const cb of this.updateCallbacks) {
        cb(dt, elapsed);
      }

      this.controls.update();
      this.renderer.render(this.scene, this.camera);
    };
    loop();
  }

  stop(): void {
    cancelAnimationFrame(this.animationId);
  }

  setCameraPreset(preset: 'front' | 'top' | 'side' | 'free'): void {
    const target = new THREE.Vector3(0, 0.3, 0);
    switch (preset) {
      case 'front':
        this.camera.position.set(0, 1.5, 6);
        break;
      case 'top':
        this.camera.position.set(0, 8, 0.01);
        break;
      case 'side':
        this.camera.position.set(6, 1.5, 0);
        break;
      case 'free':
        this.camera.position.set(3, 2.5, 5);
        break;
    }
    this.controls.target.copy(target);
    this.controls.update();
  }

  private onResize(container: HTMLElement): void {
    this.camera.aspect = container.clientWidth / container.clientHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(container.clientWidth, container.clientHeight);
  }
}
