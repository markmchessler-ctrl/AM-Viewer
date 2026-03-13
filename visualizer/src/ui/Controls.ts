import type { AudioSourceType } from '../audio/AudioEngine';

export interface ControlsCallbacks {
  onSourceChange: (source: AudioSourceType) => void;
  onFileSelected: (file: File) => void;
  onElectronFileLoaded?: (buffer: ArrayBuffer, fileName: string) => void;
  onPlay: () => void;
  onPause: () => void;
  onStop: () => void;
  onReplay: () => void;
  onCaptureDeviceSelected: (deviceId: string) => void;
  onCaptureStart: () => void;
  onMusicKitPlay: () => void;
  onMusicKitSearch: (query: string) => void;
  onParticleDensityChange: (value: number) => void;
  onShowLabelsChange: (show: boolean) => void;
  onCameraPreset: (preset: string) => void;
}

/**
 * Manages the floating control panel UI.
 */
export class Controls {
  private callbacks: ControlsCallbacks;

  constructor(callbacks: ControlsCallbacks) {
    this.callbacks = callbacks;
    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    // Source selector
    const sourceSelect = document.getElementById('source-select') as HTMLSelectElement;
    sourceSelect?.addEventListener('change', () => {
      const value = sourceSelect.value as AudioSourceType;
      this.callbacks.onSourceChange(value);
      this.toggleSourceControls(value);
    });

    // Electron native file dialog
    if (window.electronAPI?.isElectron) {
      const dropZoneEl = document.getElementById('drop-zone') as HTMLElement;
      if (dropZoneEl) {
        const openBtn = document.createElement('button');
        openBtn.textContent = 'Open File...';
        openBtn.className = 'electron-open-btn';
        openBtn.style.cssText = 'margin-bottom:6px;padding:6px 14px;background:#2a2a3e;color:#ccc;border:1px solid #444;border-radius:4px;cursor:pointer;width:100%;';
        openBtn.addEventListener('click', async () => {
          const result = await window.electronAPI!.openFileDialog();
          if (result) {
            this.callbacks.onElectronFileLoaded?.(result.buffer, result.name);
            dropZoneEl.textContent = result.name;
          }
        });
        dropZoneEl.parentElement?.insertBefore(openBtn, dropZoneEl);
      }
    }

    // File input
    const fileInput = document.getElementById('file-input') as HTMLInputElement;
    const dropZone = document.getElementById('drop-zone') as HTMLElement;

    dropZone?.addEventListener('click', () => fileInput?.click());

    fileInput?.addEventListener('change', () => {
      const file = fileInput.files?.[0];
      if (file) {
        this.callbacks.onFileSelected(file);
        dropZone.textContent = file.name;
      }
    });

    // Drag and drop
    dropZone?.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropZone.classList.add('dragover');
    });

    dropZone?.addEventListener('dragleave', () => {
      dropZone.classList.remove('dragover');
    });

    dropZone?.addEventListener('drop', (e) => {
      e.preventDefault();
      dropZone.classList.remove('dragover');
      const file = e.dataTransfer?.files[0];
      if (file) {
        this.callbacks.onFileSelected(file);
        dropZone.textContent = file.name;
      }
    });

    // Playback controls
    document.getElementById('btn-play')?.addEventListener('click', () => this.callbacks.onPlay());
    document.getElementById('btn-pause')?.addEventListener('click', () => this.callbacks.onPause());
    document.getElementById('btn-stop')?.addEventListener('click', () => this.callbacks.onStop());
    document.getElementById('btn-replay')?.addEventListener('click', () => this.callbacks.onReplay());

    // Capture controls
    const deviceSelect = document.getElementById('device-select') as HTMLSelectElement;
    deviceSelect?.addEventListener('change', () => {
      this.callbacks.onCaptureDeviceSelected(deviceSelect.value);
    });

    const captureStart = document.getElementById('capture-start') as HTMLButtonElement;
    captureStart?.addEventListener('click', () => {
      this.callbacks.onCaptureStart();
    });

    // MusicKit controls
    const musicKitPlay = document.getElementById('musickit-play') as HTMLButtonElement;
    musicKitPlay?.addEventListener('click', () => {
      this.callbacks.onMusicKitPlay();
    });

    const musicKitSearch = document.getElementById('musickit-search') as HTMLInputElement;
    musicKitSearch?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        this.callbacks.onMusicKitSearch(musicKitSearch.value);
      }
    });

    // Visualization settings
    const particleDensity = document.getElementById('particle-density') as HTMLInputElement;
    particleDensity?.addEventListener('input', () => {
      this.callbacks.onParticleDensityChange(parseFloat(particleDensity.value));
    });

    const showLabels = document.getElementById('show-labels') as HTMLSelectElement;
    showLabels?.addEventListener('change', () => {
      this.callbacks.onShowLabelsChange(showLabels.value === '1');
    });

    // Camera presets
    document.querySelectorAll('.camera-preset').forEach(btn => {
      btn.addEventListener('click', () => {
        const preset = (btn as HTMLElement).dataset.preset || 'free';
        this.callbacks.onCameraPreset(preset);
      });
    });
  }

  private toggleSourceControls(source: AudioSourceType): void {
    const fileControls = document.getElementById('file-controls');
    const captureControls = document.getElementById('capture-controls');
    const musickitControls = document.getElementById('musickit-controls');

    if (fileControls) fileControls.style.display = source === 'file' ? 'block' : 'none';
    if (captureControls) captureControls.style.display = source === 'system-capture' ? 'block' : 'none';
    if (musickitControls) musickitControls.style.display = source === 'musickit' ? 'block' : 'none';
  }

  /**
   * Show playback controls and set track info.
   */
  public showPlaybackControls(fileName: string, channelCount: number, duration: number): void {
    const el = document.getElementById('playback-controls');
    if (el) el.style.display = 'block';

    const info = document.getElementById('track-info');
    if (info) {
      info.textContent = `${fileName} | ${channelCount}ch | ${duration.toFixed(1)}s`;
    }
  }

  /**
   * Populate the device selector dropdown with available audio devices.
   */
  public updateDeviceList(devices: Array<{ deviceId: string; label: string }>): void {
    const select = document.getElementById('device-select') as HTMLSelectElement;
    if (!select) return;

    select.innerHTML = '<option value="">Select device...</option>';
    for (const device of devices) {
      const option = document.createElement('option');
      option.value = device.deviceId;
      option.textContent = device.label;
      select.appendChild(option);
    }
  }
}
