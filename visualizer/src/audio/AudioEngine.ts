import { FFT_SIZE } from '../utils/constants';

export type AudioSourceType = 'file' | 'system-capture' | 'musickit';

/**
 * Central audio graph manager.
 * Creates the AudioContext and routes audio through analysis nodes.
 */
export class AudioEngine {
  public context: AudioContext;
  public masterGain: GainNode;
  private channelAnalysers: AnalyserNode[] = [];
  private channelSplitter: ChannelSplitterNode | null = null;
  private currentSourceNode: AudioNode | null = null;
  private sourceType: AudioSourceType = 'file';

  // Per-channel FFT data buffers
  private fftBuffers: Array<Float32Array<ArrayBuffer>> = [];
  private timeDomainBuffers: Array<Float32Array<ArrayBuffer>> = [];

  constructor() {
    this.context = new AudioContext();
    this.masterGain = this.context.createGain();
    this.masterGain.connect(this.context.destination);
  }

  /**
   * Resume audio context (must be called from user gesture).
   */
  public async resume(): Promise<void> {
    if (this.context.state === 'suspended') {
      await this.context.resume();
    }
  }

  /**
   * Connect a decoded AudioBuffer (from file) for playback and analysis.
   */
  public connectBuffer(buffer: AudioBuffer): AudioBufferSourceNode {
    this.disconnect();

    const source = this.context.createBufferSource();
    source.buffer = buffer;

    this.setupChannelAnalysis(source, buffer.numberOfChannels);

    this.currentSourceNode = source;
    this.sourceType = 'file';

    return source;
  }

  /**
   * Connect a MediaStream (from system capture / getUserMedia) for analysis.
   */
  public connectStream(stream: MediaStream): MediaStreamAudioSourceNode {
    this.disconnect();

    const source = this.context.createMediaStreamSource(stream);
    const track = stream.getAudioTracks()[0];
    const settings = track?.getSettings();
    const channelCount = settings?.channelCount || 2;

    this.setupChannelAnalysis(source, channelCount);

    this.currentSourceNode = source;
    this.sourceType = 'system-capture';

    return source;
  }

  /**
   * Connect a media element (from MusicKit) for analysis.
   */
  public connectMediaElement(element: HTMLMediaElement): MediaElementAudioSourceNode {
    this.disconnect();

    const source = this.context.createMediaElementSource(element);
    this.setupChannelAnalysis(source, 2); // MusicKit outputs stereo

    this.currentSourceNode = source;
    this.sourceType = 'musickit';

    return source;
  }

  /**
   * Set up per-channel analysis by splitting the source into individual channels.
   */
  private setupChannelAnalysis(source: AudioNode, channelCount: number): void {
    // Clean up previous analysers
    this.channelAnalysers = [];
    this.fftBuffers = [];
    this.timeDomainBuffers = [];

    const maxChannels = Math.min(channelCount, 12); // Cap at 7.1.4

    // Create channel splitter
    this.channelSplitter = this.context.createChannelSplitter(maxChannels);
    source.connect(this.channelSplitter);

    // Create an analyser for each channel
    for (let i = 0; i < maxChannels; i++) {
      const analyser = this.context.createAnalyser();
      analyser.fftSize = FFT_SIZE;
      analyser.smoothingTimeConstant = 0.8;

      this.channelSplitter.connect(analyser, i);
      this.channelAnalysers.push(analyser);

      this.fftBuffers.push(new Float32Array(new ArrayBuffer(analyser.frequencyBinCount * 4)));
      this.timeDomainBuffers.push(new Float32Array(new ArrayBuffer(analyser.fftSize * 4)));
    }

    // Also connect to master gain for audio output
    source.connect(this.masterGain);
  }

  /**
   * Disconnect the current source and clean up.
   */
  public disconnect(): void {
    if (this.currentSourceNode) {
      try {
        this.currentSourceNode.disconnect();
      } catch {
        // Already disconnected
      }
      this.currentSourceNode = null;
    }
    if (this.channelSplitter) {
      try {
        this.channelSplitter.disconnect();
      } catch {
        // Already disconnected
      }
      this.channelSplitter = null;
    }
    this.channelAnalysers = [];
  }

  /**
   * Get the number of active analysis channels.
   */
  get channelCount(): number {
    return this.channelAnalysers.length;
  }

  /**
   * Get FFT frequency data for a specific channel.
   */
  public getFrequencyData(channel: number): Float32Array {
    const analyser = this.channelAnalysers[channel];
    const buffer = this.fftBuffers[channel];
    if (analyser && buffer) {
      analyser.getFloatFrequencyData(buffer);
      return buffer;
    }
    return new Float32Array(0);
  }

  /**
   * Get time-domain data for a specific channel.
   */
  public getTimeDomainData(channel: number): Float32Array {
    const analyser = this.channelAnalysers[channel];
    const buffer = this.timeDomainBuffers[channel];
    if (analyser && buffer) {
      analyser.getFloatTimeDomainData(buffer);
      return buffer;
    }
    return new Float32Array(0);
  }

  /**
   * Get all FFT data for all channels.
   */
  public getAllFrequencyData(): Float32Array[] {
    for (let i = 0; i < this.channelAnalysers.length; i++) {
      this.channelAnalysers[i].getFloatFrequencyData(this.fftBuffers[i]);
    }
    return this.fftBuffers;
  }

  public setVolume(volume: number): void {
    this.masterGain.gain.setValueAtTime(volume, this.context.currentTime);
  }

  public getSourceType(): AudioSourceType {
    return this.sourceType;
  }
}
