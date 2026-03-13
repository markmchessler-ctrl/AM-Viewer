/**
 * TypeScript types mirroring the existing Python ADM classes
 * from src/am_viewer/adm/adm_classes.py
 */

export const POLAR = 0;
export const CARTESIAN = 1;

export const DIRECTSPEAKERS = 1;
export const MATRIX = 2;
export const OBJECTS = 3;
export const HOA = 4;
export const BINAURAL = 5;

export const TYPE_DEFINITION = ['Invalid', 'DirectSpeakers', 'Matrix', 'Objects', 'HOA', 'Binaural'];
export const TYPE_LABEL = ['Invalid', '0001', '0002', '0003', '0004', '0005'];

export interface AdmPosition {
  isPolar: boolean;
  azOrX: number;    // azimuth (degrees) or X
  elOrY: number;    // elevation (degrees) or Y
  distOrZ: number;  // distance or Z
}

export interface AdmLoudnessMetadata {
  loudnessMethod?: string;
  integratedLoudness?: number;
  loudnessRange?: number;
  maxTruePeak?: number;
  dialogueLoudness?: number;
}

export interface AdmDialogue {
  value: number;
  contentKind: number;
}

export interface AdmZone {
  name: string;
  minAzOrX: number;
  maxAzOrX: number;
  minElOrY: number;
  maxElOrY: number;
  minZ: number;
  maxZ: number;
}

export interface AdmChannelLock {
  value: boolean;
  maxDistance: number;
}

export interface AdmJumpPosition {
  value: boolean;
  interpolationLength: number;
}

export interface AdmHeadphoneRender {
  bypass: boolean;
  mode: string;
}

export interface AdmBlockFormat {
  id: string;
  cartesian: boolean;
  position?: AdmPosition;
  speakerLabel?: string;
  headphoneRender?: AdmHeadphoneRender;
  width?: number;
  height?: number;
  depth?: number;
  gain?: number;
  diffuse?: number;
  channelLock?: AdmChannelLock;
  jumpPosition?: AdmJumpPosition;
  zoneExclusion?: AdmZone[];
}

export interface AdmChannelFormat {
  id: string;
  name: string;
  audioBlock?: AdmBlockFormat;
}

export interface AdmPackFormat {
  id: string;
  name: string;
  typeLabel: string;
  audioChannelIds: string[];
  channels?: AdmChannelFormat[];
}

export interface AdmTrackUID {
  id: string;
  channelFormatId: string;
  packFormatId: string;
  trackId: number;
}

export interface AdmAudioObject {
  id: string;
  name: string;
  packIds: string[];
  trackIds: string[];
  objectIds: string[];
  headLocked: boolean;
  gain: number;
  position?: AdmPosition;
  complementaryObjectIds: string[];
}

export interface AdmAudioContent {
  id: string;
  name: string;
  dialogue?: AdmDialogue;
  audioObjectIds: string[];
}

export interface AdmAudioProgramme {
  id: string;
  name: string;
  language: string;
  labels: string[];
  contentIds: string[];
  loudness?: AdmLoudnessMetadata;
}

export interface AdmData {
  programmes: AdmAudioProgramme[];
  contents: AdmAudioContent[];
  objects: AdmAudioObject[];
  packFormats: AdmPackFormat[];
  channelFormats: AdmChannelFormat[];
  trackUIDs: AdmTrackUID[];
}
