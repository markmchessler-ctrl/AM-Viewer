/**
 * Heads-up display showing beat indicator, BPM, FPS, and source info.
 */
export class HUD {
  private beatDot: HTMLElement | null;
  private bpmDisplay: HTMLElement | null;
  private fpsDisplay: HTMLElement | null;
  private sourceDisplay: HTMLElement | null;
  private beatTimeout: number | null = null;

  constructor() {
    this.beatDot = document.getElementById('beat-dot');
    this.bpmDisplay = document.getElementById('hud-bpm');
    this.fpsDisplay = document.getElementById('hud-fps');
    this.sourceDisplay = document.getElementById('hud-source');
  }

  public update(data: {
    isOnset: boolean;
    bpm: number;
    fps: number;
    source: string;
  }): void {
    // Beat indicator
    if (data.isOnset && this.beatDot) {
      this.beatDot.classList.add('active');
      if (this.beatTimeout !== null) {
        clearTimeout(this.beatTimeout);
      }
      this.beatTimeout = window.setTimeout(() => {
        this.beatDot?.classList.remove('active');
      }, 80);
    }

    // BPM
    if (this.bpmDisplay) {
      this.bpmDisplay.textContent = data.bpm > 0 ? `${data.bpm} BPM` : '-- BPM';
    }

    // FPS
    if (this.fpsDisplay) {
      this.fpsDisplay.textContent = `${data.fps} FPS`;
    }

    // Source
    if (this.sourceDisplay) {
      this.sourceDisplay.textContent = data.source;
    }
  }
}
