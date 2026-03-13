import { AudioEngine } from './AudioEngine';
import { MultichannelDecoder } from './MultichannelDecoder';
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
 *
 * For multichannel files (>2 channels), uses per-channel mono source nodes
 * via AudioEngine.connectMultichannelSources(). For stereo files, uses
 * the simpler single-source path.
 */
export class FileSource {
  private engine: AudioEngine;
  private currentSource: AudioBufferSourceNode | null = null;
  private channelSources: AudioBufferSourceNode[] = [];
  private decodedBuffer: AudioBuffer | null = null;
  private monoBuffers: AudioBuffer[] | null = null;
  private admMetadata: AdmMetadata | null = null;
  private isPlaying = false;
  private startTime = 0;
  private pauseOffset = 0;
  private isMultichannel = false;

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
    this.admMetadata = null;
    const bufferCopy = arrayBuffer.slice(0);
    if (AdmBwfParser.hasAdmMetadata(bufferCopy)) {
      this.admMetadata = AdmBwfParser.parseFromBuffer(bufferCopy);
    }

    // Decode the audio data
    this.decodedBuffer = await this.engine.context.decodeAudioData(arrayBuffer);

    const channelCount = this.decodedBuffer.numberOfChannels;
    this.isMultichannel = channelCount > 2;

    // For multichannel: extract individual mono buffers upfront
    if (this.isMultichannel) {
      console.log(`Extracting ${channelCount} channels as mono buffers...`);
      this.monoBuffers = MultichannelDecoder.extractAllChannels(
        this.decodedBuffer,
        this.engine.context
      );
      // Release the original multichannel buffer to save memory
      // (mono buffers are independent copies)
      this.decodedBuffer = null;
    } else {
      this.monoBuffers = null;
    }

    const result: FileLoadResult = {
      buffer: this.decodedBuffer || this.monoBuffers![0], // For API compat
      channelCount,
      duration: (this.decodedBuffer || this.monoBuffers![0]).duration,
      sampleRate: (this.decodedBuffer || this.monoBuffers![0]).sampleRate,
      admMetadata: this.admMetadata,
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
   * Internal: create source nodes and start playback.
   * AudioBufferSourceNode can only be started once, so we recreate each time.
   */
  private startPlayback(offset: number): void {
    if (this.isMultichannel && this.monoBuffers) {
      this.startMultichannelPlayback(offset);
    } else if (this.decodedBuffer) {
      this.startStereoPlayback(offset);
    }
  }

  /**
   * Start playback using per-channel mono source nodes.
   */
  private startMultichannelPlayback(offset: number): void {
    if (!this.monoBuffers) return;

    // Create per-channel source nodes via AudioEngine
    this.channelSources = this.engine.connectMultichannelSources(
      this.monoBuffers,
      this.admMetadata
    );

    // Track when playback ends (listen to first source)
    if (this.channelSources.length > 0) {
      this.channelSources[0].onended = () => {
        this.isPlaying = false;
        this.pauseOffset = 0;
        this.onEnded?.();
      };
    }

    // Start all sources in sync with a small look-ahead
    const when = this.engine.context.currentTime + 0.01;
    for (const source of this.channelSources) {
      source.start(when, offset);
    }

    this.startTime = when - offset;
    this.isPlaying = true;
    this.currentSource = this.channelSources[0] || null;
  }

  /**
   * Start playback using a single stereo source node.
   */
  private startStereoPlayback(offset: number): void {
    if (!this.decodedBuffer) return;

    const source = this.engine.connectBuffer(this.decodedBuffer);
    this.currentSource = source;
    this.channelSources = [];

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
    if (this.isPlaying) return;
    if (!this.decodedBuffer && !this.monoBuffers) return;
    this.engine.resume().then(() => {
      this.startPlayback(this.pauseOffset);
    });
  }

  /**
   * Pause playback.
   */
  public pause(): void {
    if (!this.isPlaying) return;

    this.pauseOffset = this.engine.context.currentTime - this.startTime;

    if (this.isMultichannel && this.channelSources.length > 0) {
      for (const source of this.channelSources) {
        try { source.stop(); } catch { /* not started */ }
      }
    } else if (this.currentSource) {
      this.currentSource.stop();
    }

    this.isPlaying = false;
  }

  /**
   * Stop playback and reset.
   */
  public stop(): void {
    if (this.isMultichannel && this.channelSources.length > 0) {
      for (const source of this.channelSources) {
        try { source.stop(); } catch { /* not started */ }
      }
      this.channelSources = [];
    }

    if (this.currentSource) {
      try { this.currentSource.stop(); } catch { /* not started */ }
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

  /**
   * Get the ADM metadata for the currently loaded file.
   */
  public getAdmMetadata(): AdmMetadata | null {
    return this.admMetadata;
  }
}
