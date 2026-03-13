import { AudioEngine } from './AudioEngine';
import { AdmBwfParser } from '../adm/AdmBwfParser';
import type { AdmMetadata } from '../adm/AdmTypes';

export interface FileLoadResult {
  buffer: AudioBuffer;
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
  private decodedBuffer: AudioBuffer | null = null;
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
   * Decodes the audio and immediately starts playback.
   */
  public async loadBuffer(arrayBuffer: ArrayBuffer, fileName: string): Promise<FileLoadResult> {
    await this.engine.resume();

    this.stop();

    // Check for ADM metadata in BWF files (use a copy since decodeAudioData detaches the buffer)
    let admMetadata: AdmMetadata | null = null;
    const bufferCopy = arrayBuffer.slice(0);
    if (AdmBwfParser.hasAdmMetadata(bufferCopy)) {
      admMetadata = AdmBwfParser.parseFromBuffer(bufferCopy);
    }

    // Decode the audio data
    this.decodedBuffer = await this.engine.context.decodeAudioData(arrayBuffer);

    const result: FileLoadResult = {
      buffer: this.decodedBuffer,
      channelCount: this.decodedBuffer.numberOfChannels,
      duration: this.decodedBuffer.duration,
      sampleRate: this.decodedBuffer.sampleRate,
      admMetadata,
      fileName,
    };

    this.onLoad?.(result);

    // Start playback immediately (still within user gesture context)
    this.startPlayback(0);

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
   * Internal: create a new source node from the decoded buffer and start it.
   * AudioBufferSourceNode can only be started once, so we recreate each time.
   */
  private startPlayback(offset: number): void {
    if (!this.decodedBuffer) return;

    // Create a fresh source node (they are single-use)
    const source = this.engine.connectBuffer(this.decodedBuffer);
    this.currentSource = source;

    source.onended = () => {
      this.isPlaying = false;
      this.pauseOffset = 0;
      this.onEnded?.();
    };

    source.start(0, offset);
    this.startTime = this.engine.context.currentTime - offset;
    this.isPlaying = true;
  }

  /**
   * Start or resume playback.
   */
  public play(): void {
    if (this.isPlaying || !this.decodedBuffer) return;
    this.engine.resume().then(() => {
      this.startPlayback(this.pauseOffset);
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
