import { AudioEngine } from './AudioEngine';

export interface AudioDeviceInfo {
  deviceId: string;
  label: string;
  channelCount?: number;
}

/**
 * Captures multichannel audio from a virtual audio device configured
 * in macOS Audio MIDI Setup (e.g., BlackHole 16ch, Loopback).
 *
 * This is the highest-fidelity mode for Apple Music Atmos visualization:
 * Apple Music decodes Atmos → outputs multichannel → virtual device → this captures all channels.
 */
export class SystemCaptureSource {
  private engine: AudioEngine;
  private stream: MediaStream | null = null;
  private isCapturing = false;

  public onDevicesEnumerated: ((devices: AudioDeviceInfo[]) => void) | null = null;
  public onCaptureStarted: ((channelCount: number) => void) | null = null;
  public onError: ((error: Error) => void) | null = null;

  constructor(engine: AudioEngine) {
    this.engine = engine;
  }

  /**
   * Enumerate available audio input devices.
   */
  public async enumerateDevices(): Promise<AudioDeviceInfo[]> {
    // Request permission first (needed to get device labels)
    try {
      const tempStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      tempStream.getTracks().forEach(t => t.stop());
    } catch {
      // Permission denied — device labels will be empty
    }

    const devices = await navigator.mediaDevices.enumerateDevices();
    const audioInputs: AudioDeviceInfo[] = devices
      .filter(d => d.kind === 'audioinput')
      .map(d => ({
        deviceId: d.deviceId,
        label: d.label || `Audio Input ${d.deviceId.slice(0, 8)}`,
      }));

    this.onDevicesEnumerated?.(audioInputs);
    return audioInputs;
  }

  /**
   * Start capturing from a specific audio device.
   * @param deviceId The device to capture from
   * @param requestedChannels Number of channels to request (default 12 for 7.1.4)
   */
  public async startCapture(deviceId: string, requestedChannels = 12): Promise<void> {
    await this.engine.resume();
    this.stopCapture();

    try {
      // Request multichannel input
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          deviceId: { exact: deviceId },
          channelCount: { ideal: requestedChannels },
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          sampleRate: { ideal: 48000 },
        },
      });

      // Check actual channel count
      const track = this.stream.getAudioTracks()[0];
      const settings = track?.getSettings();
      const actualChannels = settings?.channelCount || 2;

      if (actualChannels < requestedChannels) {
        console.warn(
          `Requested ${requestedChannels} channels but got ${actualChannels}. ` +
          `Browser may have downmixed. For full multichannel capture, use Electron.`
        );
      }

      // Connect to engine
      this.engine.connectStream(this.stream);
      this.isCapturing = true;

      this.onCaptureStarted?.(actualChannels);
    } catch (error) {
      this.onError?.(error as Error);
      throw error;
    }
  }

  /**
   * Stop capturing.
   */
  public stopCapture(): void {
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }
    this.isCapturing = false;
    this.engine.disconnect();
  }

  public getIsCapturing(): boolean {
    return this.isCapturing;
  }
}
