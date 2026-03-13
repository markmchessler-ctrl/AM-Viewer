import { FREQ_BANDS, type FreqBandName } from '../utils/constants';
import { clamp, dbToLinear } from '../utils/math';

/**
 * Splits FFT frequency data into energy values for each frequency band.
 */
export class BandSplitter {
  private bandNames: FreqBandName[] = ['bass', 'lowMid', 'mid', 'highMid', 'treble'];

  /**
   * Compute band energies from FFT data.
   * @param fftData Float32Array of frequency data in dB
   * @param sampleRate The audio sample rate
   * @returns Array of 5 energy values (0-1) for each band
   */
  public split(fftData: Float32Array, sampleRate: number): number[] {
    const binCount = fftData.length;
    const nyquist = sampleRate / 2;
    const binWidth = nyquist / binCount;

    return this.bandNames.map(name => {
      const band = FREQ_BANDS[name];
      const startBin = Math.floor(band.min / binWidth);
      const endBin = Math.min(Math.ceil(band.max / binWidth), binCount);

      let sum = 0;
      let count = 0;

      for (let i = startBin; i < endBin; i++) {
        sum += dbToLinear(clamp(fftData[i], -100, 0));
        count++;
      }

      return count > 0 ? clamp(sum / count * 4, 0, 1) : 0;
    });
  }

  /**
   * Get the dominant frequency band index for the given FFT data.
   */
  public getDominantBand(fftData: Float32Array, sampleRate: number): number {
    const bands = this.split(fftData, sampleRate);
    let maxIndex = 0;
    let maxVal = 0;
    for (let i = 0; i < bands.length; i++) {
      if (bands[i] > maxVal) {
        maxVal = bands[i];
        maxIndex = i;
      }
    }
    return maxIndex;
  }
}
