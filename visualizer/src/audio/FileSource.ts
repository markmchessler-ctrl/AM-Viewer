import { AudioEngine } from './AudioEngine';
import { AdmBwfParser } from '../adm/AdmBwfParser';
import type { AdmData } from '../adm/AdmTypes';

export interface FileLoadResult {
  buffer: AudioBuffer;
  admData: AdmData | null;
  fileName: string;
  channelCount: number;
}

/**
 * Load and play local audio files (WAV, FLAC, ADM BWF).
 */
export class FileSource {
  private engine: AudioEngine;
  private currentSource: AudioBufferSourceNode | null = null;
  private currentBuffer: AudioBuffer | null = null;
  private startTime = 0;
  private pauseOffset = 0;
  playing = false;
  onEnded: (() => void) | null = null;

  constructor(engine: AudioEngine) {
    this.engine = engine;
  }

  /**
   * Load an audio file from an ArrayBuffer.
   */
  async load(arrayBuffer: ArrayBuffer, fileName: string): Promise<FileLoadResult> {
    await this.engine.init();

    // Check for ADM BWF data
    let admData: AdmData | null = null;
    try {
      admData = AdmBwfParser.parse(arrayBuffer);
    } catch {
      // Not an ADM BWF file, that's fine
    }

    const buffer = await this.engine.decodeFile(arrayBuffer.slice(0));
    this.currentBuffer = buffer;

    return {
      buffer,
      admData,
      fileName,
      channelCount: buffer.numberOfChannels,
    };
  }

  /**
   * Play the loaded buffer.
   */
  play(): void {
    if (!this.currentBuffer || !this.engine.context) return;
    this.stop();

    const source = this.engine.playBuffer(this.currentBuffer);
    source.onended = () => {
      this.playing = false;
      this.onEnded?.();
    };
    this.currentSource = source;
    this.startTime = this.engine.context.currentTime - this.pauseOffset;
    this.playing = true;
  }

  /**
   * Stop playback.
   */
  stop(): void {
    if (this.currentSource) {
      try { this.currentSource.stop(); } catch { /* ignore */ }
      this.currentSource = null;
    }
    this.playing = false;
    this.pauseOffset = 0;
  }

  /**
   * Get current playback time in seconds.
   */
  get currentTime(): number {
    if (!this.engine.context || !this.playing) return this.pauseOffset;
    return this.engine.context.currentTime - this.startTime;
  }

  get duration(): number {
    return this.currentBuffer?.duration ?? 0;
  }
}
