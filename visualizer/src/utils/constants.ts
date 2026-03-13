/**
 * Speaker positions for 7.1.4 Dolby Atmos layout (ITU-R BS.2051 System J).
 * Angles in degrees; positions computed at a fixed radius from the listener.
 */

export interface SpeakerConfig {
  name: string;
  label: string;
  azimuth: number;   // degrees, positive = left
  elevation: number; // degrees, positive = up
  channelIndex: number;
  color: string;
}

export const SPEAKER_RADIUS = 2.5;

export const SPEAKERS_7_1_4: SpeakerConfig[] = [
  { name: 'L',   label: 'Front Left',      azimuth:  30,  elevation: 0,   channelIndex: 0,  color: '#4488ff' },
  { name: 'R',   label: 'Front Right',     azimuth: -30,  elevation: 0,   channelIndex: 1,  color: '#4488ff' },
  { name: 'C',   label: 'Center',          azimuth:   0,  elevation: 0,   channelIndex: 2,  color: '#44ff88' },
  { name: 'LFE', label: 'Subwoofer',       azimuth:   0,  elevation: -30, channelIndex: 3,  color: '#ff4444' },
  { name: 'Ls',  label: 'Side Left',       azimuth:  110, elevation: 0,   channelIndex: 4,  color: '#4488ff' },
  { name: 'Rs',  label: 'Side Right',      azimuth: -110, elevation: 0,   channelIndex: 5,  color: '#4488ff' },
  { name: 'Lrs', label: 'Rear Left',       azimuth:  150, elevation: 0,   channelIndex: 6,  color: '#8844ff' },
  { name: 'Rrs', label: 'Rear Right',      azimuth: -150, elevation: 0,   channelIndex: 7,  color: '#8844ff' },
  { name: 'Ltf', label: 'Top Front Left',  azimuth:  45,  elevation: 45,  channelIndex: 8,  color: '#00ddff' },
  { name: 'Rtf', label: 'Top Front Right', azimuth: -45,  elevation: 45,  channelIndex: 9,  color: '#00ddff' },
  { name: 'Ltb', label: 'Top Rear Left',   azimuth:  135, elevation: 45,  channelIndex: 10, color: '#00ddff' },
  { name: 'Rtb', label: 'Top Rear Right',  azimuth: -135, elevation: 45,  channelIndex: 11, color: '#00ddff' },
];

/** Frequency band boundaries in Hz */
export const FREQ_BANDS = {
  bass:    { min: 20,   max: 250 },
  lowMid:  { min: 250,  max: 500 },
  mid:     { min: 500,  max: 2000 },
  highMid: { min: 2000, max: 6000 },
  treble:  { min: 6000, max: 20000 },
} as const;

export type FreqBandName = keyof typeof FREQ_BANDS;

/** Colors mapped to frequency bands for particle visualization */
export const BAND_COLORS: Record<FreqBandName, string> = {
  bass:    '#ff4422',
  lowMid:  '#ff8844',
  mid:     '#44ff88',
  highMid: '#44ddff',
  treble:  '#8844ff',
};

/** FFT size for analysis nodes */
export const FFT_SIZE = 2048;

/** Maximum particle pool size */
export const MAX_PARTICLES = 8000;

/** Default sample rate */
export const SAMPLE_RATE = 48000;
