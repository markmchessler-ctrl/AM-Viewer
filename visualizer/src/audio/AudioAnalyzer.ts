import { AudioEngine } from './AudioEngine';
import { FREQ_BANDS, FFT_SIZE, SAMPLE_RATE, type FreqBandName } from '../utils/constants';
import { clamp, dbToLinear } from '../utils/math';

export interface ChannelAnalysis {
  /** Per-band energy values (0-1) */
  bands: number[];
  /** Overall RMS energy (0-1) */
  rms: number;
  /** Spectral flux (rate of spectral change) */
  flux: number;
  /** Spectral centroid (brightness measure, Hz) */
  centroid: number;
}

export interface AnalysisFrame {
  /** Per-channel analysis data */
  channels: ChannelAnalysis[];
  /** Per-channel band energies (convenience accessor) */
  bandEnergies: number[][];
  /** Per-channel RMS values */
  channelEnergies: number[];
  /** Global (summed) band energies */
  globalBands: number[];
  /** Global RMS */
  globalRms: number;
}

/**
 * Performs per-channel audio analysis including FFT band splitting,
 * spectral flux, and spectral centroid computation.
 */
export class AudioAnalyzer {
  private engine: AudioEngine;
  private prevMagnitudes: Float32Array[] = [];
  private bandNames: FreqBandName[] = ['bass', 'lowMid', 'mid', 'highMid', 'treble'];

  constructor(engine: AudioEngine) {
    this.engine = engine;
  }

  /**
   * Compute a full analysis frame for all active channels.
   */
  public analyze(): AnalysisFrame {
    const allFftData = this.engine.getAllFrequencyData();
    const channelCount = allFftData.length;

    const channels: ChannelAnalysis[] = [];
    const bandEnergies: number[][] = [];
    const channelEnergies: number[] = [];

    // Ensure prevMagnitudes array matches channel count
    while (this.prevMagnitudes.length < channelCount) {
      this.prevMagnitudes.push(new Float32Array(FFT_SIZE / 2));
    }

    for (let ch = 0; ch < channelCount; ch++) {
      const fftData = allFftData[ch];
      if (!fftData || fftData.length === 0) {
        channels.push({ bands: [0, 0, 0, 0, 0], rms: 0, flux: 0, centroid: 0 });
        bandEnergies.push([0, 0, 0, 0, 0]);
        channelEnergies.push(0);
        continue;
      }

      const analysis = this.analyzeChannel(fftData, ch);
      channels.push(analysis);
      bandEnergies.push(analysis.bands);
      channelEnergies.push(analysis.rms);
    }

    // Compute global aggregates
    const globalBands = [0, 0, 0, 0, 0];
    let globalRms = 0;

    if (channelCount > 0) {
      for (const ch of channels) {
        for (let b = 0; b < 5; b++) {
          globalBands[b] += ch.bands[b];
        }
        globalRms += ch.rms;
      }
      for (let b = 0; b < 5; b++) {
        globalBands[b] /= channelCount;
      }
      globalRms /= channelCount;
    }

    return {
      channels,
      bandEnergies,
      channelEnergies,
      globalBands,
      globalRms,
    };
  }

  private analyzeChannel(fftData: Float32Array, channelIndex: number): ChannelAnalysis {
    const binCount = fftData.length;
    const nyquist = SAMPLE_RATE / 2;
    const binWidth = nyquist / binCount;

    // Convert dB FFT data to linear magnitudes
    const magnitudes = new Float32Array(binCount);
    for (let i = 0; i < binCount; i++) {
      magnitudes[i] = dbToLinear(clamp(fftData[i], -100, 0));
    }

    // Band energy computation
    const bands = this.bandNames.map(name => {
      const band = FREQ_BANDS[name];
      const startBin = Math.floor(band.min / binWidth);
      const endBin = Math.min(Math.ceil(band.max / binWidth), binCount);

      let sum = 0;
      let count = 0;
      for (let i = startBin; i < endBin; i++) {
        sum += magnitudes[i];
        count++;
      }

      return count > 0 ? clamp(sum / count * 4, 0, 1) : 0; // Scale up for visibility
    });

    // RMS energy
    let rmsSum = 0;
    for (let i = 0; i < binCount; i++) {
      rmsSum += magnitudes[i] * magnitudes[i];
    }
    const rms = clamp(Math.sqrt(rmsSum / binCount) * 5, 0, 1);

    // Spectral flux (positive half-wave rectified difference from previous frame)
    let flux = 0;
    const prevMag = this.prevMagnitudes[channelIndex];
    for (let i = 0; i < binCount; i++) {
      const diff = magnitudes[i] - prevMag[i];
      if (diff > 0) flux += diff;
    }
    flux = clamp(flux / binCount * 20, 0, 1);

    // Store current magnitudes for next frame
    this.prevMagnitudes[channelIndex] = magnitudes;

    // Spectral centroid (weighted average frequency)
    let weightedSum = 0;
    let magSum = 0;
    for (let i = 0; i < binCount; i++) {
      const freq = i * binWidth;
      weightedSum += freq * magnitudes[i];
      magSum += magnitudes[i];
    }
    const centroid = magSum > 0 ? weightedSum / magSum : 0;

    return { bands, rms, flux, centroid };
  }
}
