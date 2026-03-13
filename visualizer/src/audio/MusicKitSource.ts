import { AudioEngine } from './AudioEngine';

/**
 * Apple MusicKit JS integration for streaming from Apple Music.
 * Note: MusicKit outputs stereo only — Atmos rendering is done by
 * Apple's decoder before output. Spatial positions are inferred.
 *
 * Requires a MusicKit developer token configured in the HTML page:
 * <script src="https://js-cdn.music.apple.com/musickit/v3/musickit.js"></script>
 */
export class MusicKitSource {
  private engine: AudioEngine;
  private musicKit: any = null; // MusicKit.MusicKitInstance
  private mediaElementSource: MediaElementAudioSourceNode | null = null;
  private isInitialized = false;

  public onReady: (() => void) | null = null;
  public onNowPlayingChanged: ((item: any) => void) | null = null;
  public onError: ((error: Error) => void) | null = null;

  constructor(engine: AudioEngine) {
    this.engine = engine;
  }

  /**
   * Initialize MusicKit with a developer token.
   * The token should be configured via MusicKit.configure() on the page.
   */
  public async initialize(developerToken?: string): Promise<void> {
    if (this.isInitialized) return;

    try {
      // Check if MusicKit is available globally
      const MusicKit = (window as any).MusicKit;
      if (!MusicKit) {
        throw new Error(
          'MusicKit JS not loaded. Add the MusicKit script to your HTML: ' +
          'https://js-cdn.music.apple.com/musickit/v3/musickit.js'
        );
      }

      if (developerToken) {
        this.musicKit = await MusicKit.configure({
          developerToken,
          app: {
            name: 'Dolby Atmos Visualizer',
            build: '1.0.0',
          },
        });
      } else {
        this.musicKit = MusicKit.getInstance();
      }

      if (!this.musicKit) {
        throw new Error('Failed to initialize MusicKit instance');
      }

      this.isInitialized = true;
      this.onReady?.();
    } catch (error) {
      this.onError?.(error as Error);
      throw error;
    }
  }

  /**
   * Authorize with Apple Music (shows sign-in dialog).
   */
  public async authorize(): Promise<void> {
    if (!this.musicKit) throw new Error('MusicKit not initialized');
    await this.musicKit.authorize();
  }

  /**
   * Search Apple Music catalog.
   */
  public async search(query: string): Promise<any[]> {
    if (!this.musicKit) throw new Error('MusicKit not initialized');

    const results = await this.musicKit.api.music(
      `/v1/catalog/us/search`,
      { term: query, types: 'songs', limit: 10 }
    );

    return results.data?.results?.songs?.data || [];
  }

  /**
   * Play a song by its Apple Music ID.
   * Connects the audio element to the Web Audio API for analysis.
   */
  public async playSong(songId: string): Promise<void> {
    if (!this.musicKit) throw new Error('MusicKit not initialized');

    await this.engine.resume();

    await this.musicKit.setQueue({ song: songId });
    await this.musicKit.play();

    // Connect the MusicKit audio element to Web Audio for analysis
    this.connectAudioElement();
  }

  /**
   * Connect MusicKit's internal audio element to the Web Audio API.
   */
  private connectAudioElement(): void {
    if (this.mediaElementSource) return;

    // MusicKit uses an internal <audio> element
    const audioElement = document.querySelector('#apple-music-player') as HTMLMediaElement
      || (this.musicKit as any)?._player?.audio;

    if (audioElement) {
      this.mediaElementSource = this.engine.connectMediaElement(audioElement);
    }
  }

  public async togglePlay(): Promise<void> {
    if (!this.musicKit) return;

    if (this.musicKit.isPlaying) {
      await this.musicKit.pause();
    } else {
      await this.musicKit.play();
      this.connectAudioElement();
    }
  }

  public async skipNext(): Promise<void> {
    if (!this.musicKit) return;
    await this.musicKit.skipToNextItem();
  }

  public getNowPlaying(): any {
    return this.musicKit?.nowPlayingItem;
  }

  public getIsPlaying(): boolean {
    return this.musicKit?.isPlaying || false;
  }

  public isReady(): boolean {
    return this.isInitialized;
  }
}
