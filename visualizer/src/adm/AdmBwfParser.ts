import type { AdmMetadata, AdmAudioObject, AdmAudioBed, AdmBlockFormat, AdmPosition, AdmBedChannel } from './AdmTypes';

/**
 * Parses ADM XML metadata embedded in Broadcast WAV (BWF) files.
 * Extracts the <axml> RIFF chunk containing the ADM XML, then parses
 * it into structured metadata objects.
 *
 * Reference: existing Python parser at src/am_viewer/adm/adm_tool.py
 */
export class AdmBwfParser {
  /**
   * Extract ADM metadata from a BWF file's ArrayBuffer.
   * Returns null if no ADM XML chunk is found.
   */
  public static parseFromBuffer(buffer: ArrayBuffer): AdmMetadata | null {
    const xmlString = this.extractAxmlChunk(buffer);
    if (!xmlString) return null;
    return this.parseAdmXml(xmlString);
  }

  /**
   * Extract the <axml> RIFF chunk from a WAV/BWF file.
   */
  private static extractAxmlChunk(buffer: ArrayBuffer): string | null {
    const view = new DataView(buffer);
    const decoder = new TextDecoder('utf-8');

    // Verify RIFF header
    const riffId = decoder.decode(new Uint8Array(buffer, 0, 4));
    if (riffId !== 'RIFF') return null;

    const waveId = decoder.decode(new Uint8Array(buffer, 8, 4));
    if (waveId !== 'WAVE') return null;

    // Walk through RIFF chunks looking for 'axml'
    let offset = 12;
    while (offset < buffer.byteLength - 8) {
      const chunkId = decoder.decode(new Uint8Array(buffer, offset, 4));
      const chunkSize = view.getUint32(offset + 4, true);
      offset += 8;

      if (chunkId === 'axml') {
        const xmlBytes = new Uint8Array(buffer, offset, chunkSize);
        return decoder.decode(xmlBytes);
      }

      // Move to next chunk (RIFF chunks are word-aligned)
      offset += chunkSize + (chunkSize % 2);
    }

    return null;
  }

  /**
   * Parse ADM XML string into structured metadata.
   */
  public static parseAdmXml(xmlString: string): AdmMetadata {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlString, 'text/xml');

    const objects = this.parseAudioObjects(doc);
    const beds = this.parseAudioBeds(doc);

    return {
      objects,
      beds,
      presentations: [], // Could be expanded later
    };
  }

  private static parseAudioObjects(doc: Document): AdmAudioObject[] {
    const objects: AdmAudioObject[] = [];

    // Find all audioObject elements
    const objectElements = doc.querySelectorAll(
      'audioObject, audioProgramme > audioContentIDRef'
    );

    // Parse audioChannelFormat elements with typeDefinition="Objects"
    const channelFormats = doc.querySelectorAll('audioChannelFormat');

    for (const cf of channelFormats) {
      const typeLabel = cf.getAttribute('typeLabel');
      const typeDef = cf.getAttribute('typeDefinition');

      if (typeLabel !== '0003' && typeDef !== 'Objects') continue;

      const id = cf.getAttribute('audioChannelFormatID') || '';
      const name = cf.getAttribute('audioChannelFormatName') || '';

      const obj: AdmAudioObject = {
        id,
        name,
        blockFormats: [],
      };

      // Parse audioBlockFormat elements for positions
      const blockFormats = cf.querySelectorAll('audioBlockFormat');
      for (const bf of blockFormats) {
        const block = this.parseBlockFormat(bf);
        if (block) obj.blockFormats!.push(block);
      }

      // Set initial position from first block
      if (obj.blockFormats!.length > 0) {
        const first = obj.blockFormats![0];
        Object.assign(obj, first.position);
        if (first.gain !== undefined) obj.gain = first.gain;
      }

      objects.push(obj);
    }

    // Also parse audioObject elements directly
    const audioObjects = doc.querySelectorAll('audioObject');
    for (const ao of audioObjects) {
      const id = ao.getAttribute('audioObjectID') || '';
      const name = ao.getAttribute('audioObjectName') || '';

      // Check if we already parsed this via channelFormat
      if (objects.some(o => o.name === name)) continue;

      const dialogueEl = ao.querySelector('dialogue');
      let contentKind = 'default';
      if (dialogueEl) {
        const val = parseInt(dialogueEl.textContent || '0');
        if (val === 1) contentKind = 'dialogue';
      }

      const gainEl = ao.querySelector('gain');
      let gain = 1;
      if (gainEl) {
        gain = parseFloat(gainEl.textContent || '1');
        const gainUnit = gainEl.getAttribute('gainUnit');
        if (gainUnit === 'dB') {
          gain = Math.pow(10, gain / 20);
        }
      }

      objects.push({
        id,
        name,
        contentKind,
        gain,
      });
    }

    return objects;
  }

  private static parseAudioBeds(doc: Document): AdmAudioBed[] {
    const beds: AdmAudioBed[] = [];

    // Find audioChannelFormat elements with typeDefinition="DirectSpeakers"
    const channelFormats = doc.querySelectorAll('audioChannelFormat');
    const bedChannels: AdmBedChannel[] = [];

    for (const cf of channelFormats) {
      const typeLabel = cf.getAttribute('typeLabel');
      const typeDef = cf.getAttribute('typeDefinition');

      if (typeLabel !== '0001' && typeDef !== 'DirectSpeakers') continue;

      const blockFormats = cf.querySelectorAll('audioBlockFormat');
      for (const bf of blockFormats) {
        const speakerLabel = bf.querySelector('speakerLabel')?.textContent || '';
        if (speakerLabel) {
          bedChannels.push({
            speakerLabel,
            trackIndex: bedChannels.length,
          });
        }
      }
    }

    if (bedChannels.length > 0) {
      beds.push({
        id: 'bed_0',
        name: 'Main Bed',
        speakerConfig: this.inferSpeakerConfig(bedChannels.length),
        channels: bedChannels,
      });
    }

    return beds;
  }

  private static parseBlockFormat(element: Element): AdmBlockFormat | null {
    const position: AdmPosition = {};
    let gain: number | undefined;

    // Check for Cartesian flag
    const cartesian = element.querySelector('cartesian')?.textContent === '1';

    if (cartesian) {
      const xEl = element.querySelector('position[coordinate="X"]');
      const yEl = element.querySelector('position[coordinate="Y"]');
      const zEl = element.querySelector('position[coordinate="Z"]');

      if (xEl) position.x = parseFloat(xEl.textContent || '0');
      if (yEl) position.y = parseFloat(yEl.textContent || '0');
      if (zEl) position.z = parseFloat(zEl.textContent || '0');
    } else {
      const azEl = element.querySelector('position[coordinate="azimuth"]');
      const elEl = element.querySelector('position[coordinate="elevation"]');
      const distEl = element.querySelector('position[coordinate="distance"]');

      if (azEl) position.azimuth = parseFloat(azEl.textContent || '0');
      if (elEl) position.elevation = parseFloat(elEl.textContent || '0');
      if (distEl) position.distance = parseFloat(distEl.textContent || '1');
    }

    const gainEl = element.querySelector('gain');
    if (gainEl) {
      gain = parseFloat(gainEl.textContent || '1');
    }

    // Parse time
    const rtime = this.parseTimecode(element.getAttribute('rtime'));
    const duration = this.parseTimecode(element.getAttribute('duration'));

    return {
      rtime,
      duration,
      position,
      gain,
    };
  }

  private static parseTimecode(tc: string | null): number | undefined {
    if (!tc) return undefined;

    // Format: HH:MM:SS.sssss or fractional seconds
    const parts = tc.split(':');
    if (parts.length === 3) {
      const hours = parseInt(parts[0]);
      const mins = parseInt(parts[1]);
      const secs = parseFloat(parts[2]);
      return hours * 3600 + mins * 60 + secs;
    }

    return parseFloat(tc) || undefined;
  }

  private static inferSpeakerConfig(channelCount: number): string {
    switch (channelCount) {
      case 2: return '0+2+0';
      case 6: return '0+5+0';
      case 8: return '2+5+0';
      case 10: return '4+5+0';
      case 12: return '4+7+0';
      case 16: return '9+10+3';
      default: return `?+${channelCount}+?`;
    }
  }

  /**
   * Detect if an ArrayBuffer is a WAV/BWF file with ADM metadata.
   */
  public static hasAdmMetadata(buffer: ArrayBuffer): boolean {
    return this.extractAxmlChunk(buffer) !== null;
  }
}
