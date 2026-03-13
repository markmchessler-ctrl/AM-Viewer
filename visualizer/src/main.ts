import { SceneManager } from './scene/SceneManager';
import { HeadModel } from './scene/HeadModel';
import { SpeakerLayout } from './scene/SpeakerLayout';
import { ParticleSystem } from './scene/ParticleSystem';
import { EnergyVisualizer } from './scene/EnergyVisualizer';
import { ObjectTracker } from './scene/ObjectTracker';
import { AudioEngine, type AudioSourceType } from './audio/AudioEngine';
import { FileSource } from './audio/FileSource';
import { SystemCaptureSource } from './audio/SystemCaptureSource';
import { MusicKitSource } from './audio/MusicKitSource';
import { AudioAnalyzer } from './audio/AudioAnalyzer';
import { BeatDetector } from './analysis/BeatDetector';
import { TonalAnalyzer } from './analysis/TonalAnalyzer';
import { Controls } from './ui/Controls';
import { HUD } from './ui/HUD';
import type { AdmMetadata } from './adm/AdmTypes';

/**
 * Dolby Atmos 3D Visualizer — Main Application
 *
 * Connects audio sources → analysis → 3D visualization
 */
class AtmosVisualizer {
  // Scene
  private sceneManager: SceneManager;
  private headModel: HeadModel;
  private speakerLayout: SpeakerLayout;
  private particleSystem: ParticleSystem;
  private energyVisualizer: EnergyVisualizer;
  private objectTracker: ObjectTracker;

  // Audio
  private audioEngine: AudioEngine;
  private fileSource: FileSource;
  private systemCapture: SystemCaptureSource;
  private musicKitSource: MusicKitSource;

  // Analysis
  private audioAnalyzer: AudioAnalyzer;
  private beatDetector: BeatDetector;
  private tonalAnalyzer: TonalAnalyzer;

  // UI
  private hud: HUD;

  // State
  private activeSource: AudioSourceType = 'file';
  private admMetadata: AdmMetadata | null = null;
  private selectedDeviceId = '';
  private elapsedTime = 0;

  constructor() {
    const container = document.getElementById('app')!;

    // Initialize 3D scene
    this.sceneManager = new SceneManager(container);

    // Head model
    this.headModel = new HeadModel();
    this.headModel.addToScene(this.sceneManager.scene);

    // Speaker layout
    this.speakerLayout = new SpeakerLayout();
    this.speakerLayout.addToScene(this.sceneManager.scene);

    // Particle system
    this.particleSystem = new ParticleSystem();
    this.particleSystem.setSpeakerPositions(this.speakerLayout.getSpeakerPositions());
    this.sceneManager.scene.add(this.particleSystem.getMesh());

    // Energy visualizer
    this.energyVisualizer = new EnergyVisualizer();
    this.energyVisualizer.addToScene(this.sceneManager.scene);

    // Object tracker
    this.objectTracker = new ObjectTracker();
    this.objectTracker.addToScene(this.sceneManager.scene);

    // Audio engine
    this.audioEngine = new AudioEngine();
    this.fileSource = new FileSource(this.audioEngine);
    this.systemCapture = new SystemCaptureSource(this.audioEngine);
    this.musicKitSource = new MusicKitSource(this.audioEngine);

    // Analysis
    this.audioAnalyzer = new AudioAnalyzer(this.audioEngine);
    this.beatDetector = new BeatDetector();
    this.tonalAnalyzer = new TonalAnalyzer();

    // UI
    this.hud = new HUD();
    this.setupControls();
    this.setupFileSourceCallbacks();

    // Start render loop
    this.sceneManager.onUpdate((delta, elapsed) => this.update(delta, elapsed));
    this.sceneManager.start();
  }

  private controls!: Controls;

  private setupControls(): void {
    this.controls = new Controls({
      onSourceChange: (source) => this.setActiveSource(source),
      onFileSelected: (file) => this.loadFile(file),
      onPlay: () => this.fileSource.play(),
      onPause: () => this.fileSource.pause(),
      onStop: () => this.fileSource.stop(),
      onReplay: () => {
        this.fileSource.stop();
        this.fileSource.play();
      },
      onCaptureDeviceSelected: (deviceId) => {
        this.selectedDeviceId = deviceId;
      },
      onCaptureStart: () => this.startCapture(),
      onMusicKitPlay: () => this.toggleMusicKit(),
      onMusicKitSearch: (_query) => {
        console.log('MusicKit search requires a valid Apple Developer token');
      },
      onParticleDensityChange: (value) => {
        this.particleSystem.setDensity(value);
      },
      onShowLabelsChange: (show) => {
        this.speakerLayout.setShowLabels(show);
      },
      onCameraPreset: (preset) => {
        this.sceneManager.setCameraPreset(preset);
      },
    });
  }

  private setupFileSourceCallbacks(): void {
    this.fileSource.onLoad = (result) => {
      console.log(
        `Loaded: ${result.fileName} | ${result.channelCount}ch | ` +
        `${result.duration.toFixed(1)}s | ${result.sampleRate}Hz` +
        (result.admMetadata ? ' | ADM metadata found' : '')
      );

      this.admMetadata = result.admMetadata;
      if (this.admMetadata) {
        console.log(
          `ADM: ${this.admMetadata.objects.length} objects, ` +
          `${this.admMetadata.beds.length} beds`
        );
      }

      // Show playback controls
      this.controls.showPlaybackControls(result.fileName, result.channelCount, result.duration);

      // Playback starts automatically from loadBuffer()
    };

    this.fileSource.onEnded = () => {
      console.log('Playback ended');
    };
  }

  private setActiveSource(source: AudioSourceType): void {
    // Stop current source
    this.fileSource.stop();
    this.systemCapture.stopCapture();
    this.audioEngine.disconnect();
    this.admMetadata = null;
    this.objectTracker.clear();
    this.beatDetector.reset();
    this.tonalAnalyzer.reset();

    this.activeSource = source;

    // Enumerate devices if switching to system capture
    if (source === 'system-capture') {
      this.systemCapture.enumerateDevices().then(devices => {
        const controls = document.getElementById('device-select') as HTMLSelectElement;
        if (controls) {
          controls.innerHTML = '<option value="">Select device...</option>';
          for (const d of devices) {
            const opt = document.createElement('option');
            opt.value = d.deviceId;
            opt.textContent = d.label;
            controls.appendChild(opt);
          }
        }
      });
    }
  }

  private async loadFile(file: File): Promise<void> {
    try {
      await this.fileSource.loadFile(file);
    } catch (error) {
      console.error('Failed to load file:', error);
    }
  }

  private async startCapture(): Promise<void> {
    if (!this.selectedDeviceId) {
      console.warn('No audio device selected');
      return;
    }
    try {
      await this.systemCapture.startCapture(this.selectedDeviceId);
      console.log('System capture started');
    } catch (error) {
      console.error('Failed to start capture:', error);
    }
  }

  private async toggleMusicKit(): Promise<void> {
    try {
      if (!this.musicKitSource.isReady()) {
        await this.musicKitSource.initialize();
        await this.musicKitSource.authorize();
      }
      await this.musicKitSource.togglePlay();
    } catch (error) {
      console.error('MusicKit error:', error);
    }
  }

  /**
   * Main update loop — called every frame via requestAnimationFrame.
   */
  private update(delta: number, elapsed: number): void {
    this.elapsedTime = elapsed;

    // Skip analysis if no audio channels active
    if (this.audioEngine.channelCount === 0) {
      // Still update HUD
      this.hud.update({
        isOnset: false,
        bpm: 0,
        fps: this.sceneManager.fps,
        source: 'No source',
      });
      return;
    }

    // Run audio analysis
    const analysis = this.audioAnalyzer.analyze();

    // Beat detection
    const channelFluxes = analysis.channels.map(ch => ch.flux);
    const beat = this.beatDetector.update(channelFluxes, elapsed);

    // Tonal analysis
    const centroids = analysis.channels.map(ch => ch.centroid);
    const _tonalShift = this.tonalAnalyzer.update(centroids);

    // Update speaker layout visualization
    this.speakerLayout.update(analysis.channelEnergies);

    // Update energy rings
    this.energyVisualizer.update(analysis.channelEnergies, beat.isOnset);

    // Update particle system
    this.particleSystem.update(analysis.bandEnergies, beat.isOnset, delta);

    // Update ADM object tracker if metadata is present
    if (this.admMetadata && this.admMetadata.objects.length > 0) {
      const currentTime = this.activeSource === 'file'
        ? this.fileSource.getCurrentTime()
        : elapsed;
      this.objectTracker.updateObjects(this.admMetadata.objects, currentTime);
    }

    // Update HUD
    const sourceLabel = this.activeSource === 'file'
      ? (this.fileSource.getIsPlaying() ? 'File (playing)' : 'File')
      : this.activeSource === 'system-capture'
        ? (this.systemCapture.getIsCapturing() ? 'System Capture (active)' : 'System Capture')
        : 'MusicKit';

    this.hud.update({
      isOnset: beat.isOnset,
      bpm: beat.bpm,
      fps: this.sceneManager.fps,
      source: sourceLabel,
    });
  }
}

// Boot the application
new AtmosVisualizer();
