import type {
  AdmData, AdmAudioProgramme, AdmAudioContent, AdmAudioObject,
  AdmPackFormat, AdmChannelFormat, AdmBlockFormat, AdmTrackUID,
  AdmPosition, AdmLoudnessMetadata, AdmDialogue,
} from './AdmTypes';

/**
 * Parse ADM XML metadata embedded in Broadcast WAV (BWF) files.
 * Extracts the <axml> RIFF chunk and parses the ADM XML.
 */
export class AdmBwfParser {
  /**
   * Parse a BWF file ArrayBuffer and extract ADM data.
   * Returns null if no ADM XML is found.
   */
  static parse(arrayBuffer: ArrayBuffer): AdmData | null {
    const xmlString = this.extractAxmlChunk(arrayBuffer);
    if (!xmlString) return null;
    return this.parseAdmXml(xmlString);
  }

  /**
   * Extract the axml chunk from a RIFF/WAV file.
   */
  static extractAxmlChunk(buffer: ArrayBuffer): string | null {
    const view = new DataView(buffer);
    const decoder = new TextDecoder('utf-8');

    // Verify RIFF header
    const riff = decoder.decode(new Uint8Array(buffer, 0, 4));
    if (riff !== 'RIFF') return null;

    // Verify WAVE format
    const wave = decoder.decode(new Uint8Array(buffer, 8, 4));
    if (wave !== 'WAVE') return null;

    // Scan for axml chunk
    let offset = 12;
    while (offset < buffer.byteLength - 8) {
      const chunkId = decoder.decode(new Uint8Array(buffer, offset, 4));
      const chunkSize = view.getUint32(offset + 4, true);

      if (chunkId === 'axml') {
        const xmlBytes = new Uint8Array(buffer, offset + 8, chunkSize);
        let xml = decoder.decode(xmlBytes);
        // Strip null characters
        xml = xml.replace(/\0/g, '');
        return xml.trim();
      }

      // Move to next chunk (chunks are word-aligned)
      offset += 8 + chunkSize;
      if (chunkSize % 2 !== 0) offset++;
    }

    return null;
  }

  /**
   * Parse ADM XML string into structured data.
   */
  static parseAdmXml(xmlString: string): AdmData {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlString, 'application/xml');

    // Handle both direct ADM and S-ADM (with coreMetadata wrapper)
    let root: Element = doc.documentElement;
    const coreMetadata = root.querySelector('coreMetadata') ??
                          root.querySelector('frame > frameFormat')?.parentElement;
    if (coreMetadata) {
      root = coreMetadata;
    }

    const data: AdmData = {
      programmes: [],
      contents: [],
      objects: [],
      packFormats: [],
      channelFormats: [],
      trackUIDs: [],
    };

    // Parse audio programmes
    for (const el of root.querySelectorAll('audioProgramme')) {
      data.programmes.push(this.parseProgramme(el));
    }

    // Parse audio contents
    for (const el of root.querySelectorAll('audioContent')) {
      data.contents.push(this.parseContent(el));
    }

    // Parse audio objects
    for (const el of root.querySelectorAll('audioObject')) {
      data.objects.push(this.parseObject(el));
    }

    // Parse audio pack formats
    for (const el of root.querySelectorAll('audioPackFormat')) {
      data.packFormats.push(this.parsePackFormat(el));
    }

    // Parse audio channel formats
    for (const el of root.querySelectorAll('audioChannelFormat')) {
      data.channelFormats.push(this.parseChannelFormat(el));
    }

    // Parse audio track UIDs
    for (const el of root.querySelectorAll('audioTrackUID')) {
      data.trackUIDs.push(this.parseTrackUID(el));
    }

    // Resolve object positions from block formats
    this.resolveObjectPositions(data);

    return data;
  }

  private static parseProgramme(el: Element): AdmAudioProgramme {
    const labels: string[] = [];
    for (const label of el.querySelectorAll('audioProgrammeLabel')) {
      labels.push(label.textContent?.trim() ?? '');
    }

    const contentIds: string[] = [];
    for (const ref of el.querySelectorAll('audioContentIDRef')) {
      contentIds.push(ref.textContent?.trim() ?? '');
    }

    let loudness: AdmLoudnessMetadata | undefined;
    const loudnessEl = el.querySelector('loudnessMetadata');
    if (loudnessEl) {
      loudness = {
        integratedLoudness: this.floatContent(loudnessEl, 'integratedLoudness'),
        loudnessRange: this.floatContent(loudnessEl, 'loudnessRange'),
        maxTruePeak: this.floatContent(loudnessEl, 'maxTruePeak'),
        dialogueLoudness: this.floatContent(loudnessEl, 'dialogueLoudness'),
      };
    }

    return {
      id: el.getAttribute('audioProgrammeID') ?? '',
      name: el.getAttribute('audioProgrammeName') ?? '',
      language: el.getAttribute('language') ?? '',
      labels,
      contentIds,
      loudness,
    };
  }

  private static parseContent(el: Element): AdmAudioContent {
    const objectIds: string[] = [];
    for (const ref of el.querySelectorAll('audioObjectIDRef')) {
      objectIds.push(ref.textContent?.trim() ?? '');
    }

    let dialogue: AdmDialogue | undefined;
    const dialogueEl = el.querySelector('dialogue');
    if (dialogueEl) {
      dialogue = {
        value: parseInt(dialogueEl.textContent ?? '0', 10),
        contentKind: parseInt(dialogueEl.getAttribute('nonDialogueContentKind') ??
                              dialogueEl.getAttribute('dialogueContentKind') ??
                              dialogueEl.getAttribute('mixedContentKind') ?? '0', 10),
      };
    }

    return {
      id: el.getAttribute('audioContentID') ?? '',
      name: el.getAttribute('audioContentName') ?? '',
      dialogue,
      audioObjectIds: objectIds,
    };
  }

  private static parseObject(el: Element): AdmAudioObject {
    const packIds: string[] = [];
    for (const ref of el.querySelectorAll('audioPackFormatIDRef')) {
      packIds.push(ref.textContent?.trim() ?? '');
    }

    const trackIds: string[] = [];
    for (const ref of el.querySelectorAll('audioTrackUIDRef')) {
      trackIds.push(ref.textContent?.trim() ?? '');
    }

    const objectIds: string[] = [];
    for (const ref of el.querySelectorAll('audioObjectIDRef')) {
      objectIds.push(ref.textContent?.trim() ?? '');
    }

    const complementaryIds: string[] = [];
    for (const ref of el.querySelectorAll('audioComplementaryObjectIDRef')) {
      complementaryIds.push(ref.textContent?.trim() ?? '');
    }

    const gainEl = el.querySelector('gain');
    const gain = gainEl ? parseFloat(gainEl.textContent ?? '1') : 1;

    const headLocked = el.querySelector('headLocked')?.textContent === '1';

    return {
      id: el.getAttribute('audioObjectID') ?? '',
      name: el.getAttribute('audioObjectName') ?? '',
      packIds,
      trackIds,
      objectIds,
      headLocked,
      gain,
      complementaryObjectIds: complementaryIds,
    };
  }

  private static parsePackFormat(el: Element): AdmPackFormat {
    const channelIds: string[] = [];
    for (const ref of el.querySelectorAll('audioChannelFormatIDRef')) {
      channelIds.push(ref.textContent?.trim() ?? '');
    }

    return {
      id: el.getAttribute('audioPackFormatID') ?? '',
      name: el.getAttribute('audioPackFormatName') ?? '',
      typeLabel: el.getAttribute('typeLabel') ?? '',
      audioChannelIds: channelIds,
    };
  }

  private static parseChannelFormat(el: Element): AdmChannelFormat {
    const blockEl = el.querySelector('audioBlockFormat');
    let audioBlock: AdmBlockFormat | undefined;
    if (blockEl) {
      audioBlock = this.parseBlockFormat(blockEl);
    }

    return {
      id: el.getAttribute('audioChannelFormatID') ?? '',
      name: el.getAttribute('audioChannelFormatName') ?? '',
      audioBlock,
    };
  }

  private static parseBlockFormat(el: Element): AdmBlockFormat {
    const cartesian = el.querySelector('cartesian')?.textContent === '1';
    let position: AdmPosition | undefined;

    if (cartesian) {
      position = {
        isPolar: false,
        azOrX: this.floatContent(el, 'position[coordinate="X"]') ?? 0,
        elOrY: this.floatContent(el, 'position[coordinate="Y"]') ?? 0,
        distOrZ: this.floatContent(el, 'position[coordinate="Z"]') ?? 0,
      };
    } else {
      // Check for polar coordinates
      const az = this.floatContent(el, 'position[coordinate="azimuth"]');
      const elev = this.floatContent(el, 'position[coordinate="elevation"]');
      const dist = this.floatContent(el, 'position[coordinate="distance"]');
      if (az !== undefined || elev !== undefined) {
        position = {
          isPolar: true,
          azOrX: az ?? 0,
          elOrY: elev ?? 0,
          distOrZ: dist ?? 1,
        };
      }
    }

    return {
      id: el.getAttribute('audioBlockFormatID') ?? '',
      cartesian,
      position,
      speakerLabel: el.querySelector('speakerLabel')?.textContent?.trim(),
      gain: this.floatContent(el, 'gain'),
    };
  }

  private static parseTrackUID(el: Element): AdmTrackUID {
    return {
      id: el.getAttribute('UID') ?? '',
      channelFormatId: el.querySelector('audioChannelFormatIDRef')?.textContent?.trim() ?? '',
      packFormatId: el.querySelector('audioPackFormatIDRef')?.textContent?.trim() ?? '',
      trackId: parseInt(el.querySelector('audioTrackFormatIDRef')?.textContent?.trim() ?? '0', 10),
    };
  }

  /**
   * Resolve object positions by traversing pack → channel → block format chain.
   */
  private static resolveObjectPositions(data: AdmData): void {
    for (const obj of data.objects) {
      if (obj.position) continue; // already set

      // Find first pack format
      for (const packId of obj.packIds) {
        const pack = data.packFormats.find(p => p.id === packId);
        if (!pack) continue;

        for (const chId of pack.audioChannelIds) {
          const ch = data.channelFormats.find(c => c.id === chId);
          if (ch?.audioBlock?.position) {
            obj.position = ch.audioBlock.position;
            return;
          }
        }
      }
    }
  }

  private static floatContent(parent: Element, selector: string): number | undefined {
    const el = parent.querySelector(selector);
    if (!el?.textContent) return undefined;
    const val = parseFloat(el.textContent);
    return isNaN(val) ? undefined : val;
  }
}
