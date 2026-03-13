/**
 * 7.1.4 Dolby Atmos speaker layout (ITU-R BS.2051 System J)
 * Positions defined in polar coordinates: azimuth (degrees), elevation (degrees)
 * Converted to 3D Cartesian at a fixed radius from the listener position (origin).
 */

export interface SpeakerDef {
  label: string;
  shortLabel: string;
  azimuth: number;   // degrees, positive = left
  elevation: number; // degrees, positive = up
  color: number;     // hex color
  channelIndex: number;
}

// Radius from head center to speaker positions (in scene units)
export const SPEAKER_RADIUS = 3.0;

// 7.1.4 layout — 12 speakers
export const SPEAKERS_7_1_4: SpeakerDef[] = [
  { label: 'Front Left',       shortLabel: 'L',   azimuth:   30, elevation:  0, color: 0x4488ff, channelIndex: 0 },
  { label: 'Front Right',      shortLabel: 'R',   azimuth:  -30, elevation:  0, color: 0x4488ff, channelIndex: 1 },
  { label: 'Center',           shortLabel: 'C',   azimuth:    0, elevation:  0, color: 0x4488ff, channelIndex: 2 },
  { label: 'LFE',              shortLabel: 'LFE', azimuth:    0, elevation:-30, color: 0xff6633, channelIndex: 3 },
  { label: 'Side Left',        shortLabel: 'Ls',  azimuth:  110, elevation:  0, color: 0x4488ff, channelIndex: 4 },
  { label: 'Side Right',       shortLabel: 'Rs',  azimuth: -110, elevation:  0, color: 0x4488ff, channelIndex: 5 },
  { label: 'Rear Left',        shortLabel: 'Lrs', azimuth:  150, elevation:  0, color: 0x4488ff, channelIndex: 6 },
  { label: 'Rear Right',       shortLabel: 'Rrs', azimuth: -150, elevation:  0, color: 0x4488ff, channelIndex: 7 },
  { label: 'Top Front Left',   shortLabel: 'Ltf', azimuth:   45, elevation: 45, color: 0x44dddd, channelIndex: 8 },
  { label: 'Top Front Right',  shortLabel: 'Rtf', azimuth:  -45, elevation: 45, color: 0x44dddd, channelIndex: 9 },
  { label: 'Top Rear Left',    shortLabel: 'Ltb', azimuth:  135, elevation: 45, color: 0x44dddd, channelIndex: 10 },
  { label: 'Top Rear Right',   shortLabel: 'Rtb', azimuth: -135, elevation: 45, color: 0x44dddd, channelIndex: 11 },
];

// Frequency band definitions (Hz)
export const FREQ_BANDS = {
  bass:    { min: 20,   max: 250  },
  lowMid:  { min: 250,  max: 500  },
  mid:     { min: 500,  max: 2000 },
  highMid: { min: 2000, max: 6000 },
  treble:  { min: 6000, max: 20000 },
} as const;

export type BandName = keyof typeof FREQ_BANDS;

// Band colors for particles (warm → cool)
export const BAND_COLORS: Record<BandName, number> = {
  bass:    0xff4422,
  lowMid:  0xff8844,
  mid:     0x44cc88,
  highMid: 0x4488ff,
  treble:  0x8844ff,
};

// FFT size for AnalyserNodes
export const FFT_SIZE = 2048;
export const SAMPLE_RATE = 48000;

// Particle system
export const MAX_PARTICLES = 8000;
export const PARTICLE_LIFETIME = 2.0; // seconds

// Beat detection
export const ONSET_DEBOUNCE_MS = 100;
export const ONSET_THRESHOLD_K = 1.4; // multiplier above mean for onset
