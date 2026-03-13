import { FFT_SIZE } from '../utils/constants';
import type { AdmMetadata } from '../adm/AdmTypes';

export type AudioSourceType = 'file' | 'system-capture' | 'musickit';

/**
 * Central audio graph manager.
 * Creates the AudioContext and routes audio through analysis nodes.
 *
 * For multichannel files (>2 channels), uses per-channel mono source nodes
 * with explicit stereo downmix. For ADM BWF files (>12 channels), bed channels
 * are downmixed via ITU-R BS.775 and object channels are stereo-panned
 * based on their ADM spatial positions.
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

  // Per-channel source nodes (for multichannel file playback)
  private channelSources: AudioBufferSourceNode[] = [];
  // Object channel panning nodes
  private objectPanners: StereoPannerNode[] = [];
  private objectGains: GainNode[] = [];
  // Number of bed channels in current file
  private _bedChannelCount = 0;

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
   * Used for stereo files only. For multichannel, use connectMultichannelSources().
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
   * Connect per-channel mono AudioBuffers for multichannel playback and analysis.
   * Each channel gets its own source node, analyser, and routing to stereo output.
   *
   * Bed channels (0..bedCount-1) are downmixed via ITU-R BS.775 coefficients.
   * Object channels (bedCount..N-1) are stereo-panned based on ADM positions.
   *
   * Returns the array of AudioBufferSourceNodes (caller must start them all).
   */
  public connectMultichannelSources(
    monoBuffers: AudioBuffer[],
    admMetadata: AdmMetadata | null
  ): AudioBufferSourceNode[] {
    this.disconnect();

    const totalChannels = monoBuffers.length;

    // Determine bed channel count from ADM metadata or default
    const bedChannelCount = admMetadata?.beds?.[0]?.channels?.length
      || Math.min(totalChannels, 12);
    this._bedChannelCount = bedChannelCount;

    this.channelAnalysers = [];
    this.fftBuffers = [];
    this.timeDomainBuffers = [];
    this.downmixGains = [];
    this.channelSources = [];
    this.objectPanners = [];
    this.objectGains = [];

    // Create stereo merger for bed channels
    this.stereoMerger = this.context.createChannelMerger(2);
    this.stereoMerger.connect(this.masterGain);

    // Get bed downmix coefficients
    const downmix = this.getDownmixMatrix(bedChannelCount);

    for (let i = 0; i < totalChannels; i++) {
      // Create source and analyser for each channel
      const source = this.context.createBufferSource();
      source.buffer = monoBuffers[i];
      this.channelSources.push(source);

      const analyser = this.context.createAnalyser();
      analyser.fftSize = FFT_SIZE;
      analyser.smoothingTimeConstant = 0.8;
      source.connect(analyser);
      this.channelAnalysers.push(analyser);
      this.fftBuffers.push(new Float32Array(new ArrayBuffer(analyser.frequencyBinCount * 4)));
      this.timeDomainBuffers.push(new Float32Array(new ArrayBuffer(analyser.fftSize * 4)));

      if (i < bedChannelCount) {
        // Bed channel: route through downmix matrix to stereo merger
        const mix = downmix[i];
        if (mix) {
          if (mix.left > 0) {
            const gainL = this.context.createGain();
            gainL.gain.value = mix.left;
            analyser.connect(gainL);
            gainL.connect(this.stereoMerger, 0, 0);
            this.downmixGains.push(gainL);
          }
          if (mix.right > 0) {
            const gainR = this.context.createGain();
            gainR.gain.value = mix.right;
            analyser.connect(gainR);
            gainR.connect(this.stereoMerger, 0, 1);
            this.downmixGains.push(gainR);
          }
        }
      } else {
        // Object channel: route through gain + stereo panner → masterGain
        const objectIndex = i - bedChannelCount;
        const objectGain = this.context.createGain();

        // Default object gain — will be updated from ADM metadata
        let gain = 0.7;
        let pan = 0;

        // Get initial position from ADM metadata if available
        const admObj = admMetadata?.objects?.[objectIndex];
        if (admObj) {
          if (admObj.gain !== undefined) gain = admObj.gain;

          if (admObj.azimuth !== undefined) {
            // ADM: positive azimuth = left, negative = right
            // StereoPannerNode: -1 = left, +1 = right
            const azRad = (admObj.azimuth * Math.PI) / 180;
            pan = -Math.sin(azRad);
          }

          // Attenuate for elevation (objects directly above are less lateralized)
          if (admObj.elevation !== undefined) {
            const elRad = (admObj.elevation * Math.PI) / 180;
            gain *= Math.cos(elRad) * 0.5 + 0.5; // Softer attenuation
          }
        }

        objectGain.gain.value = gain;
        this.objectGains.push(objectGain);

        const panner = this.context.createStereoPanner();
        panner.pan.value = Math.max(-1, Math.min(1, pan));
        this.objectPanners.push(panner);

        analyser.connect(objectGain);
        objectGain.connect(panner);
        panner.connect(this.masterGain);
      }
    }

    this.sourceType = 'file';
    return this.channelSources;
  }

  /**
   * Update the stereo panning and gain of an object channel in real-time.
   * Called each frame when ADM objects have animated positions (blockFormats).
   */
  public updateObjectPanning(
    objectIndex: number,
    azimuth: number,
    elevation: number,
    gain?: number
  ): void {
    const panner = this.objectPanners[objectIndex];
    const gainNode = this.objectGains[objectIndex];
    if (!panner || !gainNode) return;

    const azRad = (azimuth * Math.PI) / 180;
    const pan = -Math.sin(azRad);
    panner.pan.setValueAtTime(
      Math.max(-1, Math.min(1, pan)),
      this.context.currentTime
    );

    if (gain !== undefined) {
      const elRad = (elevation * Math.PI) / 180;
      const adjustedGain = gain * (Math.cos(elRad) * 0.5 + 0.5);
      gainNode.gain.setValueAtTime(adjustedGain, this.context.currentTime);
    }
  }

  /**
   * Get the number of bed channels in the current file.
   */
  get bedChannelCount(): number {
    return this._bedChannelCount;
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
   * Used for stereo/stream sources. For multichannel files, use connectMultichannelSources().
   */
  private setupChannelAnalysis(source: AudioNode, channelCount: number): void {
    this.channelAnalysers = [];
    this.fftBuffers = [];
    this.timeDomainBuffers = [];
    this.downmixGains = [];
    this._bedChannelCount = 0;

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

    // For multichannel streams (system capture): use ChannelSplitter
    this.channelSplitter = this.context.createChannelSplitter(maxChannels);
    source.connect(this.channelSplitter);
    this._bedChannelCount = maxChannels;

    for (let i = 0; i < maxChannels; i++) {
      const analyser = this.context.createAnalyser();
      analyser.fftSize = FFT_SIZE;
      analyser.smoothingTimeConstant = 0.8;
      this.channelSplitter.connect(analyser, i);
      this.channelAnalysers.push(analyser);
      this.fftBuffers.push(new Float32Array(new ArrayBuffer(analyser.frequencyBinCount * 4)));
      this.timeDomainBuffers.push(new Float32Array(new ArrayBuffer(analyser.fftSize * 4)));
    }

    // Build stereo downmix
    this.stereoMerger = this.context.createChannelMerger(2);
    const downmix = this.getDownmixMatrix(maxChannels);

    for (let i = 0; i < maxChannels; i++) {
      const mix = downmix[i];
      if (!mix) continue;

      if (mix.left > 0) {
        const gainL = this.context.createGain();
        gainL.gain.value = mix.left;
        this.channelSplitter.connect(gainL, i);
        gainL.connect(this.stereoMerger, 0, 0);
        this.downmixGains.push(gainL);
      }

      if (mix.right > 0) {
        const gainR = this.context.createGain();
        gainR.gain.value = mix.right;
        this.channelSplitter.connect(gainR, i);
        gainR.connect(this.stereoMerger, 0, 1);
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

    // 5.1: L R C LFE Ls Rs
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
   * Disconnect the current source and clean up all nodes.
   */
  public disconnect(): void {
    // Stop and disconnect per-channel sources
    for (const s of this.channelSources) {
      try { s.stop(); } catch { /* not started or already stopped */ }
      try { s.disconnect(); } catch { /* already disconnected */ }
    }
    this.channelSources = [];

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

    for (const p of this.objectPanners) {
      try { p.disconnect(); } catch { /* already disconnected */ }
    }
    this.objectPanners = [];

    for (const g of this.objectGains) {
      try { g.disconnect(); } catch { /* already disconnected */ }
    }
    this.objectGains = [];

    this.channelAnalysers = [];
    this._bedChannelCount = 0;
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
