import { SceneManager } from './scene/SceneManager';
import { HeadModel } from './scene/HeadModel';
import { SpeakerLayout } from './scene/SpeakerLayout';
import { ParticleSystem } from './scene/ParticleSystem';
import { EnergyVisualizer } from './scene/EnergyVisualizer';
import { ObjectTracker } from './scene/ObjectTracker';
import { AudioEngine } from './audio/AudioEngine';
import { AudioAnalyzer, type ChannelAnalysis } from './audio/AudioAnalyzer';
import { FileSource } from './audio/FileSource';
import { SystemCaptureSource } from './audio/SystemCaptureSource';
import { MultichannelDecoder } from './audio/MultichannelDecoder';
import { BeatDetector } from './analysis/BeatDetector';
import { TonalAnalyzer } from './analysis/TonalAnalyzer';
import { HUD } from './ui/HUD';
import { Controls, type SourceMode } from './ui/Controls';
import type { BandName } from './utils/constants';
import type { AdmData } from './adm/AdmTypes';

class App {
  // Scene
  private sceneManager: SceneManager;
  private head: HeadModel;
  private speakers: SpeakerLayout;
  private particles: ParticleSystem;
  private energy: EnergyVisualizer;
  private objectTracker: ObjectTracker;

  // Audio
  private audioEngine: AudioEngine;
  private audioAnalyzer: AudioAnalyzer;
  private fileSource: FileSource;
  private captureSource: SystemCaptureSource;

  // Analysis
  private beatDetector: BeatDetector;
  private tonalAnalyzer: TonalAnalyzer;

  // UI
  private hud: HUD;
  private controls: Controls;

  // State
  private currentSource: SourceMode = 'file';
  private admData: AdmData | null = null;
  private currentBufferSource: AudioBufferSourceNode | null = null;

  constructor() {
    const container = document.getElementById('app')!;

    // Scene setup
    this.sceneManager = new SceneManager(container);
    this.head = new HeadModel();
    this.speakers = new SpeakerLayout();
    this.particles = new ParticleSystem();
    this.energy = new EnergyVisualizer();
    this.objectTracker = new ObjectTracker();

    this.head.addToScene(this.sceneManager.scene);
    this.speakers.addToScene(this.sceneManager.scene);
    this.particles.addToScene(this.sceneManager.scene);
    this.energy.addToScene(this.sceneManager.scene);
    this.objectTracker.addToScene(this.sceneManager.scene);

    // Audio setup
    this.audioEngine = new AudioEngine();
    this.audioAnalyzer = new AudioAnalyzer();
    this.fileSource = new FileSource(this.audioEngine);
    this.captureSource = new SystemCaptureSource(this.audioEngine);

    // Analysis
    this.beatDetector = new BeatDetector();
    this.tonalAnalyzer = new TonalAnalyzer();

    // UI
    this.hud = new HUD();
    this.controls = new Controls(this.sceneManager, {
      onSourceChange: (mode) => this.switchSource(mode),
      onFileLoad: (file) => this.loadFile(file),
      onDeviceSelect: () => { /* stored in select element */ },
      onCaptureStart: () => this.startCapture(),
      onPlay: () => this.play(),
      onStop: () => this.stop(),
    });

    // Render loop
    this.sceneManager.onUpdate((dt, elapsed) => this.update(dt, elapsed));
    this.sceneManager.start();

    this.hud.set('Status', 'Ready — drop an audio file or select a source');
  }

  private switchSource(mode: SourceMode): void {
    this.stop();
    this.currentSource = mode;
    this.admData = null;
    this.objectTracker.clear();

    if (mode === 'capture') {
      this.enumerateDevices();
    }
  }

  private async enumerateDevices(): Promise<void> {
    try {
      const devices = await this.captureSource.getDevices();
      this.controls.setDevices(devices);
    } catch (err) {
      console.error('Failed to enumerate devices:', err);
      this.hud.set('Error', 'Could not access audio devices');
    }
  }

  private async loadFile(file: File): Promise<void> {
    this.hud.set('Status', `Loading ${file.name}...`);
    this.controls.setDropZoneText(`Loading...`);

    try {
      await this.audioEngine.init();
      const arrayBuffer = await file.arrayBuffer();
      const result = await this.fileSource.load(arrayBuffer, file.name);

      const layout = MultichannelDecoder.identifyLayout(result.channelCount);
      this.hud.set('File', `${file.name} (${layout}, ${result.channelCount}ch)`);
      this.hud.set('Status', 'Ready to play');
      this.controls.setDropZoneText(`${file.name}<br><small>${layout} — ${result.channelCount} channels</small>`);
      this.controls.showPlayback(true);

      // ADM data
      if (result.admData) {
        this.admData = result.admData;
        this.hud.set('ADM', `${result.admData.objects.length} objects, ${result.admData.programmes.length} programmes`);
        this.objectTracker.setObjects(result.admData.objects);
      } else {
        this.admData = null;
        this.hud.remove('ADM');
        this.objectTracker.clear();
      }
    } catch (err) {
      console.error('Failed to load file:', err);
      this.hud.set('Status', `Error: ${err}`);
      this.controls.setDropZoneText(`Error loading file<br><small>Drop another file to try again</small>`);
    }
  }

  private async startCapture(): Promise<void> {
    const deviceSelect = document.getElementById('device-select') as HTMLSelectElement;
    const deviceId = deviceSelect.value;
    if (!deviceId) {
      this.hud.set('Status', 'Select an audio input device first');
      return;
    }

    try {
      await this.audioEngine.init();
      await this.captureSource.startCapture(deviceId, 12);
      this.hud.set('Status', `Capturing from device (${this.audioEngine.channelCount}ch)`);
      this.hud.set('Layout', MultichannelDecoder.identifyLayout(this.audioEngine.channelCount));
    } catch (err) {
      console.error('Capture failed:', err);
      this.hud.set('Status', `Capture error: ${err}`);
    }
  }

  private play(): void {
    if (this.currentSource === 'file') {
      this.fileSource.play();
      this.hud.set('Status', 'Playing');
    }
  }

  private stop(): void {
    if (this.currentSource === 'file') {
      this.fileSource.stop();
      this.controls.showPlayback(true);
    } else if (this.currentSource === 'capture') {
      this.captureSource.stopCapture();
    }
    this.hud.set('Status', 'Stopped');
  }

  private update(dt: number, elapsed: number): void {
    const analysers = this.audioEngine.channelAnalysers;
    const hasAudio = analysers.length > 0 &&
      (this.fileSource.playing || this.captureSource.capturing);

    if (hasAudio) {
      // Analyze all channels
      const channelData = this.audioAnalyzer.analyzeAll(analysers);

      // Extract per-channel energies (RMS)
      const channelEnergies = channelData.map(d => Math.min(1, d.rms * 5));

      // Compute aggregate spectral flux
      const totalFlux = channelData.reduce((sum, d) => sum + d.spectralFlux, 0) / channelData.length;

      // Beat detection
      const now = performance.now();
      const beat = this.beatDetector.update(totalFlux, now);

      // Tonal analysis (use master or first channel)
      const masterFFT = channelData[0]?.fft;
      if (masterFFT) {
        const tonal = this.tonalAnalyzer.analyze(
          masterFFT,
          this.audioEngine.context?.sampleRate ?? 48000,
          2048
        );
        if (tonal.tonalShift) {
          // Could trigger color palette shift here
        }
      }

      // Per-channel band data
      const channelBands: Array<Record<BandName, number>> = channelData.map(d => d.bands);

      // Update visuals
      this.speakers.update(channelEnergies);
      this.particles.emit(channelBands, beat.isOnset);
      this.energy.triggerPulse(channelEnergies, beat.isOnset);

      // Update ADM object tracker
      if (this.admData && this.fileSource.playing) {
        this.objectTracker.update(this.fileSource.currentTime, channelEnergies);
      }

      // HUD
      if (beat.bpm > 0) this.hud.set('BPM', `${beat.bpm}`);
      if (this.fileSource.playing) {
        const t = this.fileSource.currentTime;
        const d = this.fileSource.duration;
        this.hud.set('Time', `${this.formatTime(t)} / ${this.formatTime(d)}`);
      }
    } else {
      // Idle: gentle zero-energy update to keep speakers at baseline
      const zeroEnergies = new Array(12).fill(0);
      this.speakers.update(zeroEnergies);
    }

    // Always update animated elements
    this.particles.update(dt);
    this.energy.update(dt);

    // Update HUD
    this.hud.update(this.sceneManager.fps);
  }

  private formatTime(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  }
}

// Start the app
new App();
