import { clamp } from '../utils/math';

export interface BeatInfo {
  /** Whether a beat onset was detected this frame */
  isOnset: boolean;
  /** Estimated BPM (0 if unknown) */
  bpm: number;
  /** Current spectral flux energy (0-1) */
  energy: number;
  /** Raw flux value */
  flux: number;
  /** Time since last onset in seconds */
  timeSinceLastOnset: number;
}

/**
 * Beat/onset detection using spectral flux analysis.
 *
 * Algorithm:
 * 1. Accumulate spectral flux values from all channels
 * 2. Maintain a running mean and standard deviation
 * 3. Detect onset when flux exceeds mean + k * stddev
 * 4. Track inter-onset intervals for BPM estimation
 */
export class BeatDetector {
  private fluxHistory: number[] = [];
  private historySize = 43; // ~1 second at 43fps
  private threshold = 1.5; // k value for mean + k*stddev
  private minOnsetInterval = 0.1; // seconds
  private lastOnsetTime = 0;
  private onsetIntervals: number[] = [];
  private maxIntervals = 20;
  private currentBpm = 0;
  private currentFlux = 0;
  private wasOnset = false;

  /**
   * Update the beat detector with the current frame's spectral flux values.
   * @param channelFluxes Array of per-channel flux values (0-1)
   * @param currentTime Current time in seconds
   * @returns Beat detection result
   */
  public update(channelFluxes: number[], currentTime: number): BeatInfo {
    // Average flux across all channels
    let totalFlux = 0;
    for (const f of channelFluxes) {
      totalFlux += f;
    }
    this.currentFlux = channelFluxes.length > 0 ? totalFlux / channelFluxes.length : 0;

    // Add to history
    this.fluxHistory.push(this.currentFlux);
    if (this.fluxHistory.length > this.historySize) {
      this.fluxHistory.shift();
    }

    // Compute mean and standard deviation
    const mean = this.fluxHistory.reduce((a, b) => a + b, 0) / this.fluxHistory.length;
    let variance = 0;
    for (const f of this.fluxHistory) {
      variance += (f - mean) * (f - mean);
    }
    const stddev = Math.sqrt(variance / this.fluxHistory.length);

    // Detect onset: flux exceeds threshold and minimum interval has passed
    const adaptiveThreshold = mean + this.threshold * stddev;
    const timeSinceLastOnset = currentTime - this.lastOnsetTime;
    const isOnset = this.currentFlux > adaptiveThreshold
      && this.currentFlux > 0.05
      && timeSinceLastOnset > this.minOnsetInterval
      && !this.wasOnset; // Edge detection: only trigger on rising edge

    if (isOnset) {
      // Track inter-onset interval for BPM
      if (this.lastOnsetTime > 0 && timeSinceLastOnset < 2) {
        this.onsetIntervals.push(timeSinceLastOnset);
        if (this.onsetIntervals.length > this.maxIntervals) {
          this.onsetIntervals.shift();
        }
        this.updateBpm();
      }
      this.lastOnsetTime = currentTime;
    }

    this.wasOnset = isOnset;

    return {
      isOnset,
      bpm: this.currentBpm,
      energy: clamp(this.currentFlux, 0, 1),
      flux: this.currentFlux,
      timeSinceLastOnset: currentTime - this.lastOnsetTime,
    };
  }

  /**
   * Estimate BPM from inter-onset intervals using median.
   */
  private updateBpm(): void {
    if (this.onsetIntervals.length < 4) return;

    // Use median interval to be robust to outliers
    const sorted = [...this.onsetIntervals].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];

    if (median > 0) {
      const bpm = 60 / median;
      // Sanity check: typical music is 60-200 BPM
      if (bpm >= 60 && bpm <= 200) {
        this.currentBpm = Math.round(bpm);
      } else if (bpm > 200 && bpm <= 400) {
        // Likely detecting double-time; halve it
        this.currentBpm = Math.round(bpm / 2);
      }
    }
  }

  public getBpm(): number {
    return this.currentBpm;
  }

  public reset(): void {
    this.fluxHistory = [];
    this.onsetIntervals = [];
    this.lastOnsetTime = 0;
    this.currentBpm = 0;
    this.currentFlux = 0;
    this.wasOnset = false;
  }
}
