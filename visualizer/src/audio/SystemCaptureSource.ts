import { AudioEngine } from './AudioEngine';

/**
 * Captures multichannel audio from a virtual audio device
 * (e.g., BlackHole 16ch or Loopback) configured in Audio MIDI Setup.
 */
export class SystemCaptureSource {
  private engine: AudioEngine;
  private stream: MediaStream | null = null;
  capturing = false;

  constructor(engine: AudioEngine) {
    this.engine = engine;
  }

  /**
   * Enumerate available audio input devices.
   */
  async getDevices(): Promise<MediaDeviceInfo[]> {
    // Request permission first (needed to get labels)
    try {
      const tempStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      tempStream.getTracks().forEach(t => t.stop());
    } catch {
      // Permission denied — return what we can
    }

    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.filter(d => d.kind === 'audioinput');
  }

  /**
   * Start capturing from the specified device.
   * @param deviceId The audio input device ID
   * @param requestedChannels Number of channels to request (e.g., 12 for 7.1.4)
   */
  async startCapture(deviceId: string, requestedChannels = 12): Promise<void> {
    await this.engine.init();
    this.stopCapture();

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          deviceId: { exact: deviceId },
          channelCount: { ideal: requestedChannels },
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });

      this.engine.connectStream(this.stream);
      this.capturing = true;

      // Check actual channel count
      const track = this.stream.getAudioTracks()[0];
      const settings = track?.getSettings();
      const actualChannels = settings?.channelCount ?? 2;
      if (actualChannels < requestedChannels) {
        console.warn(
          `Requested ${requestedChannels} channels but got ${actualChannels}. ` +
          `Browser may be downmixing. For full multichannel capture, use the Electron desktop app.`
        );
      }
    } catch (err) {
      console.error('Failed to start system capture:', err);
      throw err;
    }
  }

  stopCapture(): void {
    if (this.stream) {
      this.stream.getTracks().forEach(t => t.stop());
      this.stream = null;
    }
    this.engine.disconnect();
    this.capturing = false;
  }
}
