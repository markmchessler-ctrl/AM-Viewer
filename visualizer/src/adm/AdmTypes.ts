/**
 * TypeScript types mirroring the ADM data structures from
 * src/am_viewer/adm/adm_classes.py in the existing Python codebase.
 */

export interface AdmPosition {
  /** Cartesian coordinates (normalized -1 to 1) */
  x?: number;
  y?: number;
  z?: number;
  /** Polar coordinates */
  azimuth?: number;    // degrees, ±180
  elevation?: number;  // degrees, ±90
  distance?: number;   // 0 to 1
}

export interface AdmAudioObject {
  id: string;
  name: string;
  /** Content kind: dialogue, music, effects, etc. */
  contentKind?: string;
  /** Gain (linear, 1.0 = unity) */
  gain?: number;
  /** Cartesian position (normalized -1 to 1) */
  x?: number;
  y?: number;
  z?: number;
  /** Polar position */
  azimuth?: number;
  elevation?: number;
  distance?: number;
  /** 3D size/extent */
  width?: number;
  height?: number;
  depth?: number;
  /** Diverge / divergence range */
  diverge?: number;
  /** Whether this uses Cartesian coordinates */
  cartesian?: boolean;
  /** Block format timeline for animated positions */
  blockFormats?: AdmBlockFormat[];
}

export interface AdmBlockFormat {
  /** Time offset in seconds */
  rtime?: number;
  /** Duration in seconds */
  duration?: number;
  position: AdmPosition;
  gain?: number;
  width?: number;
  height?: number;
  depth?: number;
}

export interface AdmAudioBed {
  id: string;
  name: string;
  /** Speaker configuration label (e.g., "0+5+0", "0+7+0+4OH") */
  speakerConfig: string;
  /** Channel assignments */
  channels: AdmBedChannel[];
}

export interface AdmBedChannel {
  /** Speaker label (e.g., "M+030" for front left) */
  speakerLabel: string;
  /** Track/channel index in the audio file */
  trackIndex: number;
}

export interface AdmAudioPresentation {
  id: string;
  name: string;
  language?: string;
  /** References to audio objects and beds in this presentation */
  objectRefs: string[];
  bedRefs: string[];
}

export interface AdmMetadata {
  objects: AdmAudioObject[];
  beds: AdmAudioBed[];
  presentations: AdmAudioPresentation[];
}
