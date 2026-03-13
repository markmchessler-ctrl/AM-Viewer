import { FREQ_BANDS, type BandName } from '../utils/constants';

/**
 * Splits FFT data into frequency bands: bass, lowMid, mid, highMid, treble.
 */
export class BandSplitter {
  private sampleRate: number;
  private fftSize: number;

  constructor(sampleRate = 48000, fftSize = 2048) {
    this.sampleRate = sampleRate;
    this.fftSize = fftSize;
  }

  /**
   * Split FFT magnitude data into 5 frequency bands.
   * @param fft Float32Array of frequency magnitudes (dB)
   * @returns Record of band energies (0..1 normalized)
   */
  split(fft: Float32Array): Record<BandName, number> {
    const binHz = this.sampleRate / this.fftSize;
    const result = {} as Record<BandName, number>;

    for (const [name, range] of Object.entries(FREQ_BANDS) as Array<[BandName, { min: number; max: number }]>) {
      const startBin = Math.floor(range.min / binHz);
      const endBin = Math.min(Math.ceil(range.max / binHz), fft.length - 1);

      let sum = 0;
      let count = 0;
      for (let i = startBin; i <= endBin; i++) {
        // Convert dB to linear magnitude
        const mag = Math.pow(10, fft[i] / 20);
        sum += mag;
        count++;
      }

      result[name] = count > 0 ? Math.min(1, (sum / count) * 8) : 0;
    }

    return result;
  }
}
