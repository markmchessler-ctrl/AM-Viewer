/**
 * Tracks tonal/spectral shifts — detects when the spectral centroid
 * or overall tonal character changes significantly.
 */
export class TonalAnalyzer {
  private prevCentroid = 0;
  private centroidHistory: number[] = [];
  private historySize = 30;

  /**
   * Compute spectral centroid from FFT magnitudes.
   * Returns normalized centroid (0..1) and whether a tonal shift occurred.
   */
  analyze(fft: Float32Array, sampleRate: number, fftSize: number): {
    centroid: number;
    normalizedCentroid: number;
    tonalShift: boolean;
  } {
    const binHz = sampleRate / fftSize;
    let weightedSum = 0;
    let magnitudeSum = 0;

    for (let i = 1; i < fft.length; i++) {
      // fft is in dB, convert to linear
      const mag = Math.pow(10, fft[i] / 20);
      weightedSum += mag * (i * binHz);
      magnitudeSum += mag;
    }

    const centroid = magnitudeSum > 0 ? weightedSum / magnitudeSum : 0;
    const normalizedCentroid = Math.min(1, centroid / (sampleRate / 4));

    // Track history for shift detection
    this.centroidHistory.push(normalizedCentroid);
    if (this.centroidHistory.length > this.historySize) {
      this.centroidHistory.shift();
    }

    // Detect tonal shift: significant change in centroid
    const diff = Math.abs(normalizedCentroid - this.prevCentroid);
    const tonalShift = diff > 0.08;
    this.prevCentroid = normalizedCentroid;

    return { centroid, normalizedCentroid, tonalShift };
  }
}
