import type { SceneManager } from '../scene/SceneManager';

export type SourceMode = 'file' | 'capture' | 'musickit';

export interface ControlEvents {
  onSourceChange: (mode: SourceMode) => void;
  onFileLoad: (file: File) => void;
  onDeviceSelect: (deviceId: string) => void;
  onCaptureStart: () => void;
  onPlay: () => void;
  onStop: () => void;
}

/**
 * Wires up the HTML control panel to callbacks.
 */
export class Controls {
  private sourceSelect: HTMLSelectElement;
  private dropZone: HTMLElement;
  private fileSourceDiv: HTMLElement;
  private deviceSelector: HTMLElement;
  private deviceSelect: HTMLSelectElement;
  private captureBtn: HTMLButtonElement;
  private playbackControls: HTMLElement;
  private playBtn: HTMLButtonElement;
  private stopBtn: HTMLButtonElement;
  private trackInfo: HTMLElement;

  constructor(
    private sceneManager: SceneManager,
    private events: ControlEvents
  ) {
    this.sourceSelect = document.getElementById('source-select') as HTMLSelectElement;
    this.dropZone = document.getElementById('drop-zone')!;
    this.fileSourceDiv = document.getElementById('file-source')!;
    this.deviceSelector = document.getElementById('device-selector')!;
    this.deviceSelect = document.getElementById('device-select') as HTMLSelectElement;
    this.captureBtn = document.getElementById('capture-btn') as HTMLButtonElement;
    this.playbackControls = document.getElementById('playback-controls')!;
    this.playBtn = document.getElementById('play-btn') as HTMLButtonElement;
    this.stopBtn = document.getElementById('stop-btn') as HTMLButtonElement;
    this.trackInfo = document.getElementById('track-info')!;

    this.setupSourceSelector();
    this.setupDropZone();
    this.setupCaptureControls();
    this.setupPlaybackControls();
    this.setupCameraButtons();
  }

  private setupSourceSelector(): void {
    this.sourceSelect.addEventListener('change', () => {
      const mode = this.sourceSelect.value as SourceMode;
      this.fileSourceDiv.style.display = mode === 'file' ? 'block' : 'none';
      this.deviceSelector.style.display = mode === 'capture' ? 'block' : 'none';
      this.events.onSourceChange(mode);
    });
  }

  private setupDropZone(): void {
    this.dropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      this.dropZone.classList.add('dragover');
    });
    this.dropZone.addEventListener('dragleave', () => {
      this.dropZone.classList.remove('dragover');
    });
    this.dropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      this.dropZone.classList.remove('dragover');
      const file = e.dataTransfer?.files[0];
      if (file) this.events.onFileLoad(file);
    });
    this.dropZone.addEventListener('click', () => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.wav,.flac,.bwf,.aif,.aiff';
      input.addEventListener('change', () => {
        const file = input.files?.[0];
        if (file) this.events.onFileLoad(file);
      });
      input.click();
    });
  }

  private setupCaptureControls(): void {
    this.captureBtn.addEventListener('click', () => {
      this.events.onCaptureStart();
    });
    this.deviceSelect.addEventListener('change', () => {
      this.events.onDeviceSelect(this.deviceSelect.value);
    });
  }

  private setupPlaybackControls(): void {
    this.playBtn.addEventListener('click', () => this.events.onPlay());
    this.stopBtn.addEventListener('click', () => this.events.onStop());
  }

  private setupCameraButtons(): void {
    const presets = ['front', 'top', 'side', 'free'] as const;
    for (const preset of presets) {
      const btn = document.getElementById(`cam-${preset}`);
      btn?.addEventListener('click', () => {
        this.sceneManager.setCameraPreset(preset);
        // Update active state
        for (const p of presets) {
          document.getElementById(`cam-${p}`)?.classList.remove('active');
        }
        btn.classList.add('active');
      });
    }
  }

  setDevices(devices: MediaDeviceInfo[]): void {
    this.deviceSelect.innerHTML = '<option value="">Select audio input device...</option>';
    for (const d of devices) {
      const opt = document.createElement('option');
      opt.value = d.deviceId;
      opt.textContent = d.label || `Device ${d.deviceId.slice(0, 8)}`;
      this.deviceSelect.appendChild(opt);
    }
  }

  showPlayback(show: boolean): void {
    this.playbackControls.style.display = show ? 'flex' : 'none';
  }

  setTrackInfo(text: string): void {
    this.trackInfo.textContent = text;
  }

  setDropZoneText(text: string): void {
    this.dropZone.innerHTML = text;
  }
}
