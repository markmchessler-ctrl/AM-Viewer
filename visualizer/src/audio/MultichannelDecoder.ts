/**
 * Utility for splitting a multichannel AudioBuffer into individual
 * channel AudioBuffers or connecting through a ChannelSplitterNode.
 *
 * Used for both file source (AudioBuffer) and system capture (MediaStream).
 */
export class MultichannelDecoder {
  /**
   * Get channel labels for a given channel count.
   */
  public static getChannelLabels(channelCount: number): string[] {
    const labels_7_1_4 = [
      'L', 'R', 'C', 'LFE', 'Ls', 'Rs', 'Lrs', 'Rrs',
      'Ltf', 'Rtf', 'Ltb', 'Rtb'
    ];

    const labels_5_1_4 = [
      'L', 'R', 'C', 'LFE', 'Ls', 'Rs',
      'Ltf', 'Rtf', 'Ltb', 'Rtb'
    ];

    const labels_5_1 = ['L', 'R', 'C', 'LFE', 'Ls', 'Rs'];
    const labels_stereo = ['L', 'R'];

    if (channelCount > 12) {
      // ADM BWF: 12 bed channels + object channels
      return [
        ...labels_7_1_4,
        ...Array.from({ length: channelCount - 12 }, (_, i) => `Obj${i + 1}`)
      ];
    }

    switch (channelCount) {
      case 12: return labels_7_1_4;
      case 10: return labels_5_1_4;
      case 6: return labels_5_1;
      case 2: return labels_stereo;
      default:
        return Array.from({ length: channelCount }, (_, i) => `Ch${i + 1}`);
    }
  }

  /**
   * Map a channel index to a 7.1.4 speaker index based on the channel count.
   * Returns the speaker index in the SPEAKERS_7_1_4 array, or -1 if unmapped.
   */
  public static mapChannelToSpeaker(channelIndex: number, channelCount: number): number {
    if (channelCount >= 12) {
      // 7.1.4: direct mapping
      return channelIndex < 12 ? channelIndex : -1;
    }

    if (channelCount >= 10) {
      // 5.1.4: map to 7.1.4 (no rear surrounds)
      const map = [0, 1, 2, 3, 4, 5, -1, -1, 8, 9, 10, 11];
      return map[channelIndex] ?? -1;
    }

    if (channelCount >= 6) {
      // 5.1: map to 7.1.4 (no height, no rear)
      const map = [0, 1, 2, 3, 4, 5];
      return map[channelIndex] ?? -1;
    }

    if (channelCount >= 2) {
      // Stereo: map to front L/R
      const map = [0, 1];
      return map[channelIndex] ?? -1;
    }

    return channelIndex === 0 ? 2 : -1; // Mono → center
  }

  /**
   * Extract a single channel from an AudioBuffer as a new mono buffer.
   */
  public static extractChannel(
    buffer: AudioBuffer,
    channelIndex: number,
    context: AudioContext
  ): AudioBuffer {
    const channelData = buffer.getChannelData(channelIndex);
    const monoBuffer = context.createBuffer(1, buffer.length, buffer.sampleRate);
    monoBuffer.getChannelData(0).set(channelData);
    return monoBuffer;
  }

  /**
   * Extract all channels from an AudioBuffer as individual mono buffers.
   */
  public static extractAllChannels(
    buffer: AudioBuffer,
    context: AudioContext
  ): AudioBuffer[] {
    const channels: AudioBuffer[] = [];
    for (let i = 0; i < buffer.numberOfChannels; i++) {
      channels.push(this.extractChannel(buffer, i, context));
    }
    return channels;
  }

  /**
   * Compute the RMS energy of a single channel from an AudioBuffer.
   */
  public static computeChannelRms(buffer: AudioBuffer, channelIndex: number): number {
    const data = buffer.getChannelData(channelIndex);
    let sum = 0;
    for (let i = 0; i < data.length; i++) {
      sum += data[i] * data[i];
    }
    return Math.sqrt(sum / data.length);
  }
}
