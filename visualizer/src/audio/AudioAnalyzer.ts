import { FFT_SIZE, FREQ_BANDS, type BandName } from '../utils/constants';

export interface ChannelAnalysis {
  fft: Float32Array;
  bands: Record<BandName, number>;
  rms: number;
  spectralFlux: number;
}

/**
 * Per-channel audio analysis: FFT, band energy, RMS, spectral flux.
 */
export class AudioAnalyzer {
  private prevMagnitudes: Map<AnalyserNode, Float32Array> = new Map();
  private sampleRate: number;

  constructor(sampleRate = 48000) {
    this.sampleRate = sampleRate;
  }

  /**
   * Analyze a single AnalyserNode and return channel analysis data.
   */
  analyzeChannel(analyser: AnalyserNode): ChannelAnalysis {
    const binCount = analyser.frequencyBinCount;
    const fft = new Float32Array(binCount);
    analyser.getFloatFrequencyData(fft);

    // Convert dB to linear magnitudes for processing
    const magnitudes = new Float32Array(binCount);
    for (let i = 0; i < binCount; i++) {
      magnitudes[i] = Math.pow(10, fft[i] / 20);
    }

    // Band energies
    const bands = this.computeBands(magnitudes, binCount);

    // RMS from time domain
    const timeDomain = new Float32Array(analyser.fftSize);
    analyser.getFloatTimeDomainData(timeDomain);
    let rmsSum = 0;
    for (let i = 0; i < timeDomain.length; i++) {
      rmsSum += timeDomain[i] * timeDomain[i];
    }
    const rms = Math.sqrt(rmsSum / timeDomain.length);

    // Spectral flux
    let flux = 0;
    const prev = this.prevMagnitudes.get(analyser);
    if (prev) {
      for (let i = 0; i < binCount; i++) {
        const diff = magnitudes[i] - prev[i];
        if (diff > 0) flux += diff;
      }
    }
    this.prevMagnitudes.set(analyser, magnitudes);

    return { fft, bands, rms, spectralFlux: flux };
  }

  /**
   * Analyze all channels and return array of per-channel analysis.
   */
  analyzeAll(analysers: AnalyserNode[]): ChannelAnalysis[] {
    return analysers.map(a => this.analyzeChannel(a));
  }

  private computeBands(magnitudes: Float32Array, binCount: number): Record<BandName, number> {
    const binHz = this.sampleRate / (FFT_SIZE);
    const result = {} as Record<BandName, number>;

    for (const [name, range] of Object.entries(FREQ_BANDS) as Array<[BandName, { min: number; max: number }]>) {
      const startBin = Math.floor(range.min / binHz);
      const endBin = Math.min(Math.ceil(range.max / binHz), binCount - 1);
      let sum = 0;
      let count = 0;
      for (let i = startBin; i <= endBin; i++) {
        sum += magnitudes[i];
        count++;
      }
      // Normalize to 0..1 range (approximate)
      result[name] = count > 0 ? Math.min(1, (sum / count) * 8) : 0;
    }

    return result;
  }
}
