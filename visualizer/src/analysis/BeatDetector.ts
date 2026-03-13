import { ONSET_DEBOUNCE_MS, ONSET_THRESHOLD_K } from '../utils/constants';

export interface BeatInfo {
  isOnset: boolean;
  bpm: number;
  energy: number;
  flux: number;
}

/**
 * Onset/beat detection using spectral flux with adaptive thresholding.
 */
export class BeatDetector {
  private fluxHistory: number[] = [];
  private historySize = 43; // ~1 second at 60fps
  private lastOnsetTime = 0;
  private onsetIntervals: number[] = [];
  private maxIntervals = 20;
  bpm = 0;

  update(spectralFlux: number, now: number): BeatInfo {
    this.fluxHistory.push(spectralFlux);
    if (this.fluxHistory.length > this.historySize) {
      this.fluxHistory.shift();
    }

    // Compute adaptive threshold
    const mean = this.fluxHistory.reduce((a, b) => a + b, 0) / this.fluxHistory.length;
    let variance = 0;
    for (const f of this.fluxHistory) {
      variance += (f - mean) * (f - mean);
    }
    const stddev = Math.sqrt(variance / this.fluxHistory.length);
    const threshold = mean + ONSET_THRESHOLD_K * stddev;

    // Onset detection with debounce
    const timeSinceLast = now - this.lastOnsetTime;
    const isOnset = spectralFlux > threshold && timeSinceLast > ONSET_DEBOUNCE_MS;

    if (isOnset) {
      // Track inter-onset intervals for BPM
      if (this.lastOnsetTime > 0 && timeSinceLast < 2000) {
        this.onsetIntervals.push(timeSinceLast);
        if (this.onsetIntervals.length > this.maxIntervals) {
          this.onsetIntervals.shift();
        }
        this.bpm = this.estimateBPM();
      }
      this.lastOnsetTime = now;
    }

    return {
      isOnset,
      bpm: this.bpm,
      energy: mean,
      flux: spectralFlux,
    };
  }

  private estimateBPM(): number {
    if (this.onsetIntervals.length < 4) return 0;
    const avg = this.onsetIntervals.reduce((a, b) => a + b, 0) / this.onsetIntervals.length;
    if (avg <= 0) return 0;
    let bpm = 60000 / avg;
    // Normalize to reasonable range
    while (bpm > 200) bpm /= 2;
    while (bpm < 60) bpm *= 2;
    return Math.round(bpm);
  }
}
