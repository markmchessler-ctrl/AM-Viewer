import { AudioEngine } from './AudioEngine';
import { AdmBwfParser } from '../adm/AdmBwfParser';
import type { AdmMetadata } from '../adm/AdmTypes';

export interface FileLoadResult {
  buffer: AudioBuffer;
  source: AudioBufferSourceNode;
  channelCount: number;
  duration: number;
  sampleRate: number;
  admMetadata: AdmMetadata | null;
  fileName: string;
}

/**
 * Handles loading local audio files (WAV, FLAC, BWF) and connecting
 * them to the audio engine for playback and analysis.
 */
export class FileSource {
  private engine: AudioEngine;
  private currentSource: AudioBufferSourceNode | null = null;
  private rawBuffer: ArrayBuffer | null = null;
  private isPlaying = false;
  private startTime = 0;
  private pauseOffset = 0;

  // Callbacks
  public onLoad: ((result: FileLoadResult) => void) | null = null;
  public onEnded: (() => void) | null = null;
  public onError: ((error: Error) => void) | null = null;

  constructor(engine: AudioEngine) {
    this.engine = engine;
  }

  /**
   * Load an audio file from an ArrayBuffer.
   */
  public async loadBuffer(arrayBuffer: ArrayBuffer, fileName: string): Promise<FileLoadResult> {
    await this.engine.resume();

    this.stop();
    this.rawBuffer = arrayBuffer.slice(0); // Keep a copy

    // Check for ADM metadata in BWF files
    let admMetadata: AdmMetadata | null = null;
    if (AdmBwfParser.hasAdmMetadata(arrayBuffer)) {
      admMetadata = AdmBwfParser.parseFromBuffer(arrayBuffer);
    }

    // Decode the audio data
    const audioBuffer = await this.engine.context.decodeAudioData(arrayBuffer);

    // Connect to engine
    const source = this.engine.connectBuffer(audioBuffer);
    this.currentSource = source;

    source.onended = () => {
      this.isPlaying = false;
      this.pauseOffset = 0;
      this.onEnded?.();
    };

    const result: FileLoadResult = {
      buffer: audioBuffer,
      source,
      channelCount: audioBuffer.numberOfChannels,
      duration: audioBuffer.duration,
      sampleRate: audioBuffer.sampleRate,
      admMetadata,
      fileName,
    };

    this.onLoad?.(result);
    return result;
  }

  /**
   * Load from a File object (from file picker or drag-and-drop).
   */
  public async loadFile(file: File): Promise<FileLoadResult> {
    const arrayBuffer = await file.arrayBuffer();
    return this.loadBuffer(arrayBuffer, file.name);
  }

  /**
   * Start or resume playback.
   */
  public play(): void {
    if (this.isPlaying || !this.rawBuffer) return;

    // AudioBufferSourceNode can only be started once, so recreate it
    this.engine.context.decodeAudioData(this.rawBuffer.slice(0)).then(audioBuffer => {
      const source = this.engine.connectBuffer(audioBuffer);
      this.currentSource = source;

      source.onended = () => {
        this.isPlaying = false;
        this.pauseOffset = 0;
        this.onEnded?.();
      };

      source.start(0, this.pauseOffset);
      this.startTime = this.engine.context.currentTime - this.pauseOffset;
      this.isPlaying = true;
    });
  }

  /**
   * Pause playback.
   */
  public pause(): void {
    if (!this.isPlaying || !this.currentSource) return;

    this.pauseOffset = this.engine.context.currentTime - this.startTime;
    this.currentSource.stop();
    this.isPlaying = false;
  }

  /**
   * Stop playback and reset.
   */
  public stop(): void {
    if (this.currentSource) {
      try {
        this.currentSource.stop();
      } catch {
        // May not have been started
      }
    }
    this.isPlaying = false;
    this.pauseOffset = 0;
    this.currentSource = null;
  }

  /**
   * Toggle play/pause.
   */
  public togglePlay(): void {
    if (this.isPlaying) {
      this.pause();
    } else {
      this.play();
    }
  }

  /**
   * Get current playback time in seconds.
   */
  public getCurrentTime(): number {
    if (this.isPlaying) {
      return this.engine.context.currentTime - this.startTime;
    }
    return this.pauseOffset;
  }

  public getIsPlaying(): boolean {
    return this.isPlaying;
  }
}
