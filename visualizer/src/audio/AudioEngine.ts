import { FFT_SIZE } from '../utils/constants';

export type SourceType = 'file' | 'capture' | 'musickit';

/**
 * Central audio graph manager.
 * Creates the AudioContext and routes audio through analysis nodes.
 */
export class AudioEngine {
  context: AudioContext | null = null;
  private sourceNode: AudioNode | null = null;
  private gainNode: GainNode | null = null;
  private splitter: ChannelSplitterNode | null = null;
  channelAnalysers: AnalyserNode[] = [];
  masterAnalyser: AnalyserNode | null = null;
  channelCount = 2;

  async init(): Promise<AudioContext> {
    if (this.context) return this.context;
    this.context = new AudioContext({ sampleRate: 48000 });
    return this.context;
  }

  /**
   * Connect a source node and set up the analysis graph.
   */
  connectSource(source: AudioNode, channels: number): void {
    this.disconnect();
    const ctx = this.context!;
    this.channelCount = channels;
    this.sourceNode = source;

    // Master gain
    this.gainNode = ctx.createGain();
    this.gainNode.gain.value = 1.0;

    // Master analyser
    this.masterAnalyser = ctx.createAnalyser();
    this.masterAnalyser.fftSize = FFT_SIZE;
    this.masterAnalyser.smoothingTimeConstant = 0.8;

    if (channels > 2) {
      // Multichannel: split into per-channel analysers
      this.splitter = ctx.createChannelSplitter(channels);
      source.connect(this.splitter);

      this.channelAnalysers = [];
      for (let i = 0; i < channels; i++) {
        const analyser = ctx.createAnalyser();
        analyser.fftSize = FFT_SIZE;
        analyser.smoothingTimeConstant = 0.8;
        this.splitter.connect(analyser, i);
        this.channelAnalysers.push(analyser);
      }

      // Also route to master for overall analysis
      source.connect(this.gainNode);
      this.gainNode.connect(this.masterAnalyser);
      this.gainNode.connect(ctx.destination);
    } else {
      // Stereo/mono: single analyser
      source.connect(this.gainNode);
      this.gainNode.connect(this.masterAnalyser);
      this.gainNode.connect(ctx.destination);

      // Create 2 "channel" analysers by duplicating master
      this.channelAnalysers = [this.masterAnalyser, this.masterAnalyser];
    }
  }

  /**
   * Connect a MediaStream (for system capture).
   */
  connectStream(stream: MediaStream): MediaStreamAudioSourceNode {
    const ctx = this.context!;
    const source = ctx.createMediaStreamSource(stream);
    const trackSettings = stream.getAudioTracks()[0]?.getSettings();
    const channels = trackSettings?.channelCount ?? 2;
    this.connectSource(source, channels);
    return source;
  }

  /**
   * Connect an HTMLMediaElement (for MusicKit).
   */
  connectMediaElement(element: HTMLMediaElement): MediaElementAudioSourceNode {
    const ctx = this.context!;
    const source = ctx.createMediaElementSource(element);
    this.connectSource(source, 2);
    return source;
  }

  /**
   * Load and decode an audio file buffer.
   */
  async decodeFile(arrayBuffer: ArrayBuffer): Promise<AudioBuffer> {
    const ctx = await this.init();
    return ctx.decodeAudioData(arrayBuffer);
  }

  /**
   * Play a decoded AudioBuffer.
   */
  playBuffer(buffer: AudioBuffer): AudioBufferSourceNode {
    const ctx = this.context!;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    this.connectSource(source, buffer.numberOfChannels);
    source.start(0);
    return source;
  }

  setVolume(v: number): void {
    if (this.gainNode) this.gainNode.gain.value = v;
  }

  disconnect(): void {
    try {
      this.sourceNode?.disconnect();
    } catch { /* ignore */ }
    try {
      this.gainNode?.disconnect();
    } catch { /* ignore */ }
    try {
      this.splitter?.disconnect();
    } catch { /* ignore */ }
    for (const a of this.channelAnalysers) {
      try { a.disconnect(); } catch { /* ignore */ }
    }
    this.channelAnalysers = [];
    this.sourceNode = null;
    this.gainNode = null;
    this.splitter = null;
    this.masterAnalyser = null;
  }

  async resume(): Promise<void> {
    if (this.context?.state === 'suspended') {
      await this.context.resume();
    }
  }
}
