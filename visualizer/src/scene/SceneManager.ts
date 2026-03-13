import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

export class SceneManager {
  public scene: THREE.Scene;
  public camera: THREE.PerspectiveCamera;
  public renderer: THREE.WebGLRenderer;
  public controls: OrbitControls;

  private clock: THREE.Clock;
  private updateCallbacks: Array<(delta: number, elapsed: number) => void> = [];
  private frameCount = 0;
  private fpsTime = 0;
  private currentFps = 0;

  constructor(container: HTMLElement) {
    // Scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x050508);
    this.scene.fog = new THREE.FogExp2(0x050508, 0.06);

    // Camera
    this.camera = new THREE.PerspectiveCamera(
      60,
      container.clientWidth / container.clientHeight,
      0.1,
      100
    );
    this.camera.position.set(3, 2.5, 4);
    this.camera.lookAt(0, 0, 0);

    // Renderer
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
    });
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.2;
    container.appendChild(this.renderer.domElement);

    // Controls
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.minDistance = 1.5;
    this.controls.maxDistance = 15;
    this.controls.target.set(0, 0, 0);

    // Lighting
    this.setupLighting();

    // Grid helper (subtle)
    const grid = new THREE.GridHelper(10, 20, 0x111122, 0x111122);
    grid.position.y = -0.01;
    this.scene.add(grid);

    // Clock
    this.clock = new THREE.Clock();

    // Resize handler
    window.addEventListener('resize', () => this.onResize(container));
  }

  private setupLighting(): void {
    // Ambient light for overall visibility
    const ambient = new THREE.AmbientLight(0x222233, 0.5);
    this.scene.add(ambient);

    // Key light from front-above
    const keyLight = new THREE.DirectionalLight(0xffffff, 0.8);
    keyLight.position.set(2, 4, 3);
    this.scene.add(keyLight);

    // Fill light from side
    const fillLight = new THREE.DirectionalLight(0x4488ff, 0.3);
    fillLight.position.set(-3, 1, -2);
    this.scene.add(fillLight);

    // Rim light from behind
    const rimLight = new THREE.DirectionalLight(0x00ddff, 0.2);
    rimLight.position.set(0, 2, -4);
    this.scene.add(rimLight);
  }

  public onUpdate(callback: (delta: number, elapsed: number) => void): void {
    this.updateCallbacks.push(callback);
  }

  public removeUpdate(callback: (delta: number, elapsed: number) => void): void {
    const index = this.updateCallbacks.indexOf(callback);
    if (index !== -1) this.updateCallbacks.splice(index, 1);
  }

  public setCameraPreset(preset: string): void {
    const duration = 0.8;
    const target = new THREE.Vector3(0, 0, 0);
    let position: THREE.Vector3;

    switch (preset) {
      case 'front':
        position = new THREE.Vector3(0, 0.5, 5);
        break;
      case 'top':
        position = new THREE.Vector3(0, 6, 0.01);
        break;
      case 'side':
        position = new THREE.Vector3(5, 0.5, 0);
        break;
      case 'free':
      default:
        position = new THREE.Vector3(3, 2.5, 4);
        break;
    }

    // Animate camera position
    const startPos = this.camera.position.clone();
    const startTime = this.clock.getElapsedTime();

    const animateCamera = () => {
      const elapsed = this.clock.getElapsedTime() - startTime;
      const t = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3); // ease-out cubic

      this.camera.position.lerpVectors(startPos, position, eased);
      this.controls.target.lerp(target, eased * 0.5 + 0.5);

      if (t < 1) {
        requestAnimationFrame(animateCamera);
      }
    };
    animateCamera();
  }

  get fps(): number {
    return this.currentFps;
  }

  public start(): void {
    const animate = () => {
      requestAnimationFrame(animate);

      const delta = this.clock.getDelta();
      const elapsed = this.clock.getElapsedTime();

      // FPS counter
      this.frameCount++;
      this.fpsTime += delta;
      if (this.fpsTime >= 0.5) {
        this.currentFps = Math.round(this.frameCount / this.fpsTime);
        this.frameCount = 0;
        this.fpsTime = 0;
      }

      // Update controls
      this.controls.update();

      // Run all update callbacks
      for (const cb of this.updateCallbacks) {
        cb(delta, elapsed);
      }

      // Render
      this.renderer.render(this.scene, this.camera);
    };

    animate();
  }

  private onResize(container: HTMLElement): void {
    this.camera.aspect = container.clientWidth / container.clientHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(container.clientWidth, container.clientHeight);
  }
}
