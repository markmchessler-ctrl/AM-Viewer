import { smoothStep, clamp } from '../utils/math';

/**
 * Tracks tonal shifts by monitoring spectral centroid changes
 * and overall spectral shape evolution over time.
 *
 * Outputs a "tonal shift" value that indicates how much the
 * timbral quality of the audio is changing — useful for
 * triggering color palette shifts in the visualization.
 */
export class TonalAnalyzer {
  private prevCentroid = 0;
  private smoothedCentroid = 0;
  private centroidHistory: number[] = [];
  private historySize = 30;
  private shiftAmount = 0;

  /**
   * Update with current spectral centroids from all channels.
   * @param centroids Per-channel spectral centroid values in Hz
   * @returns Tonal shift value (0-1), higher = more tonal change
   */
  public update(centroids: number[]): number {
    // Average centroid across channels
    let avgCentroid = 0;
    if (centroids.length > 0) {
      avgCentroid = centroids.reduce((a, b) => a + b, 0) / centroids.length;
    }

    // Smooth the centroid
    this.smoothedCentroid = smoothStep(this.smoothedCentroid, avgCentroid, 0.1);

    // Compute rate of change
    const centroidDelta = Math.abs(this.smoothedCentroid - this.prevCentroid);
    this.prevCentroid = this.smoothedCentroid;

    // Normalize delta (typical centroid is 500-5000 Hz, delta of 100+ Hz is significant)
    const normalizedDelta = clamp(centroidDelta / 200, 0, 1);

    // Track history for long-term tonal shift detection
    this.centroidHistory.push(this.smoothedCentroid);
    if (this.centroidHistory.length > this.historySize) {
      this.centroidHistory.shift();
    }

    // Compute variance of recent centroids (high variance = tonal instability)
    let variance = 0;
    if (this.centroidHistory.length > 2) {
      const mean = this.centroidHistory.reduce((a, b) => a + b, 0) / this.centroidHistory.length;
      for (const c of this.centroidHistory) {
        variance += (c - mean) * (c - mean);
      }
      variance /= this.centroidHistory.length;
    }

    const normalizedVariance = clamp(Math.sqrt(variance) / 500, 0, 1);

    // Combine instant delta and long-term variance
    this.shiftAmount = smoothStep(
      this.shiftAmount,
      normalizedDelta * 0.7 + normalizedVariance * 0.3,
      0.08
    );

    return this.shiftAmount;
  }

  /**
   * Get the smoothed spectral centroid (Hz).
   * Can be used to map brightness of the visualization.
   */
  public getCentroid(): number {
    return this.smoothedCentroid;
  }

  /**
   * Get the current tonal shift amount (0-1).
   */
  public getShiftAmount(): number {
    return this.shiftAmount;
  }

  public reset(): void {
    this.prevCentroid = 0;
    this.smoothedCentroid = 0;
    this.centroidHistory = [];
    this.shiftAmount = 0;
  }
}
