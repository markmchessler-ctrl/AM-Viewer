import { FFT_SIZE } from '../utils/constants';

export type AudioSourceType = 'file' | 'system-capture' | 'musickit';

/**
 * Central audio graph manager.
 * Creates the AudioContext and routes audio through analysis nodes.
 *
 * For multichannel files (>6 channels like 7.1.4), browsers cannot
 * automatically downmix to stereo. We explicitly downmix using
 * individual channel gain nodes routed to a stereo merger.
 */
export class AudioEngine {
  public context: AudioContext;
  public masterGain: GainNode;
  private channelAnalysers: AnalyserNode[] = [];
  private channelSplitter: ChannelSplitterNode | null = null;
  private stereoMerger: ChannelMergerNode | null = null;
  private downmixGains: GainNode[] = [];
  private currentSourceNode: AudioNode | null = null;
  private sourceType: AudioSourceType = 'file';

  // Per-channel FFT data buffers
  private fftBuffers: Array<Float32Array<ArrayBuffer>> = [];
  private timeDomainBuffers: Array<Float32Array<ArrayBuffer>> = [];

  constructor() {
    this.context = new AudioContext();
    this.masterGain = this.context.createGain();
    this.masterGain.channelCount = 2;
    this.masterGain.channelCountMode = 'explicit';
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
   * Set up per-channel analysis and stereo downmix for audio output.
   */
  private setupChannelAnalysis(source: AudioNode, channelCount: number): void {
    this.channelAnalysers = [];
    this.fftBuffers = [];
    this.timeDomainBuffers = [];
    this.downmixGains = [];

    const maxChannels = Math.min(channelCount, 12);

    // For stereo sources, just connect directly
    if (maxChannels <= 2) {
      const analyser = this.context.createAnalyser();
      analyser.fftSize = FFT_SIZE;
      analyser.smoothingTimeConstant = 0.8;
      source.connect(analyser);
      this.channelAnalysers.push(analyser);
      this.fftBuffers.push(new Float32Array(new ArrayBuffer(analyser.frequencyBinCount * 4)));
      this.timeDomainBuffers.push(new Float32Array(new ArrayBuffer(analyser.fftSize * 4)));

      if (maxChannels === 2) {
        // Add a second analyser for R channel
        this.channelSplitter = this.context.createChannelSplitter(2);
        source.connect(this.channelSplitter);
        const analyserR = this.context.createAnalyser();
        analyserR.fftSize = FFT_SIZE;
        analyserR.smoothingTimeConstant = 0.8;
        this.channelSplitter.connect(analyserR, 1);
        this.channelAnalysers.push(analyserR);
        this.fftBuffers.push(new Float32Array(new ArrayBuffer(analyserR.frequencyBinCount * 4)));
        this.timeDomainBuffers.push(new Float32Array(new ArrayBuffer(analyserR.fftSize * 4)));
      }

      source.connect(this.masterGain);
      return;
    }

    // For multichannel: split into individual channels for analysis
    // and build an explicit stereo downmix for audio output
    this.channelSplitter = this.context.createChannelSplitter(maxChannels);
    source.connect(this.channelSplitter);

    // Create per-channel analysers
    for (let i = 0; i < maxChannels; i++) {
      const analyser = this.context.createAnalyser();
      analyser.fftSize = FFT_SIZE;
      analyser.smoothingTimeConstant = 0.8;
      this.channelSplitter.connect(analyser, i);
      this.channelAnalysers.push(analyser);
      this.fftBuffers.push(new Float32Array(new ArrayBuffer(analyser.frequencyBinCount * 4)));
      this.timeDomainBuffers.push(new Float32Array(new ArrayBuffer(analyser.fftSize * 4)));
    }

    // Build stereo downmix: route each channel to L/R with appropriate gains
    // ITU-R BS.775-based downmix coefficients
    this.stereoMerger = this.context.createChannelMerger(2);

    // Downmix matrix: [channelIndex] = { left: gain, right: gain }
    const downmix = this.getDownmixMatrix(maxChannels);

    for (let i = 0; i < maxChannels; i++) {
      const mix = downmix[i];
      if (!mix) continue;

      if (mix.left > 0) {
        const gainL = this.context.createGain();
        gainL.gain.value = mix.left;
        this.channelSplitter.connect(gainL, i);
        gainL.connect(this.stereoMerger, 0, 0); // to left output
        this.downmixGains.push(gainL);
      }

      if (mix.right > 0) {
        const gainR = this.context.createGain();
        gainR.gain.value = mix.right;
        this.channelSplitter.connect(gainR, i);
        gainR.connect(this.stereoMerger, 0, 1); // to right output
        this.downmixGains.push(gainR);
      }
    }

    this.stereoMerger.connect(this.masterGain);
  }

  /**
   * Get stereo downmix coefficients for a given channel count.
   * Based on ITU-R BS.775 and Dolby downmix conventions.
   */
  private getDownmixMatrix(channelCount: number): Array<{ left: number; right: number }> {
    const c = 0.707; // -3dB center
    const s = 0.707; // -3dB surround
    const h = 0.5;   // -6dB height

    if (channelCount >= 12) {
      // 7.1.4: L R C LFE Ls Rs Lrs Rrs Ltf Rtf Ltb Rtb
      return [
        { left: 1.0, right: 0.0 },  // L → L
        { left: 0.0, right: 1.0 },  // R → R
        { left: c,   right: c   },  // C → both
        { left: c,   right: c   },  // LFE → both (attenuated)
        { left: s,   right: 0.0 },  // Ls → L
        { left: 0.0, right: s   },  // Rs → R
        { left: s,   right: 0.0 },  // Lrs → L
        { left: 0.0, right: s   },  // Rrs → R
        { left: h,   right: 0.0 },  // Ltf → L
        { left: 0.0, right: h   },  // Rtf → R
        { left: h,   right: 0.0 },  // Ltb → L
        { left: 0.0, right: h   },  // Rtb → R
      ];
    }

    if (channelCount >= 10) {
      // 5.1.4: L R C LFE Ls Rs Ltf Rtf Ltb Rtb
      return [
        { left: 1.0, right: 0.0 },
        { left: 0.0, right: 1.0 },
        { left: c,   right: c   },
        { left: c,   right: c   },
        { left: s,   right: 0.0 },
        { left: 0.0, right: s   },
        { left: h,   right: 0.0 },
        { left: 0.0, right: h   },
        { left: h,   right: 0.0 },
        { left: 0.0, right: h   },
      ];
    }

    if (channelCount >= 8) {
      // 7.1: L R C LFE Ls Rs Lrs Rrs
      return [
        { left: 1.0, right: 0.0 },
        { left: 0.0, right: 1.0 },
        { left: c,   right: c   },
        { left: c,   right: c   },
        { left: s,   right: 0.0 },
        { left: 0.0, right: s   },
        { left: s,   right: 0.0 },
        { left: 0.0, right: s   },
      ];
    }

    // 5.1: L R C LFE Ls Rs (browser can handle this natively, but just in case)
    return [
      { left: 1.0, right: 0.0 },
      { left: 0.0, right: 1.0 },
      { left: c,   right: c   },
      { left: c,   right: c   },
      { left: s,   right: 0.0 },
      { left: 0.0, right: s   },
    ];
  }

  /**
   * Disconnect the current source and clean up.
   */
  public disconnect(): void {
    if (this.currentSourceNode) {
      try { this.currentSourceNode.disconnect(); } catch { /* already disconnected */ }
      this.currentSourceNode = null;
    }
    if (this.channelSplitter) {
      try { this.channelSplitter.disconnect(); } catch { /* already disconnected */ }
      this.channelSplitter = null;
    }
    if (this.stereoMerger) {
      try { this.stereoMerger.disconnect(); } catch { /* already disconnected */ }
      this.stereoMerger = null;
    }
    for (const g of this.downmixGains) {
      try { g.disconnect(); } catch { /* already disconnected */ }
    }
    this.downmixGains = [];
    this.channelAnalysers = [];
  }

  get channelCount(): number {
    return this.channelAnalysers.length;
  }

  public getFrequencyData(channel: number): Float32Array {
    const analyser = this.channelAnalysers[channel];
    const buffer = this.fftBuffers[channel];
    if (analyser && buffer) {
      analyser.getFloatFrequencyData(buffer);
      return buffer;
    }
    return new Float32Array(0);
  }

  public getTimeDomainData(channel: number): Float32Array {
    const analyser = this.channelAnalysers[channel];
    const buffer = this.timeDomainBuffers[channel];
    if (analyser && buffer) {
      analyser.getFloatTimeDomainData(buffer);
      return buffer;
    }
    return new Float32Array(0);
  }

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
