/**
 * Splits a multichannel AudioBuffer into per-channel AudioBufferSourceNodes.
 * Used when loading multichannel WAV/FLAC files.
 */
export class MultichannelDecoder {
  /**
   * Get the channel count from a buffer and map to a layout name.
   */
  static identifyLayout(channelCount: number): string {
    switch (channelCount) {
      case 2: return '2.0';
      case 6: return '5.1';
      case 8: return '7.1';
      case 10: return '5.1.4';
      case 12: return '7.1.4';
      case 14: return '9.1.4';
      case 16: return '9.1.6';
      default: return `${channelCount}ch`;
    }
  }

  /**
   * Map channel indices to 7.1.4 speaker labels.
   * Returns labels for as many channels as the buffer has.
   */
  static getChannelLabels(channelCount: number): string[] {
    const labels_7_1_4 = [
      'L', 'R', 'C', 'LFE', 'Ls', 'Rs', 'Lrs', 'Rrs',
      'Ltf', 'Rtf', 'Ltb', 'Rtb',
    ];
    const labels_5_1 = ['L', 'R', 'C', 'LFE', 'Ls', 'Rs'];
    const labels_stereo = ['L', 'R'];

    if (channelCount >= 12) return labels_7_1_4.slice(0, channelCount);
    if (channelCount >= 6) return labels_5_1.slice(0, channelCount);
    if (channelCount >= 2) return labels_stereo;
    return ['Mono'];
  }
}
