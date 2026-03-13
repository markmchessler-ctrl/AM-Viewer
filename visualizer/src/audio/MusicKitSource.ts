import { AudioEngine } from './AudioEngine';

/**
 * Apple MusicKit JS integration.
 * Connects MusicKit player audio to the Web Audio analysis graph.
 * Note: MusicKit outputs stereo only — Atmos rendering happens in Apple's decoder.
 */
export class MusicKitSource {
  private engine: AudioEngine;
  private musicKit: any = null; // MusicKit.MusicKitInstance
  private mediaElementSource: MediaElementAudioSourceNode | null = null;
  playing = false;

  constructor(engine: AudioEngine) {
    this.engine = engine;
  }

  /**
   * Initialize MusicKit with a developer token.
   * The MusicKit JS library must be loaded via CDN in index.html.
   */
  async init(developerToken: string, appName = 'Atmos Visualizer'): Promise<void> {
    const MK = (window as any).MusicKit;
    if (!MK) {
      throw new Error(
        'MusicKit JS not loaded. Add <script src="https://js-cdn.music.apple.com/musickit/v3/musickit.js"></script> to index.html'
      );
    }

    this.musicKit = await MK.configure({
      developerToken,
      app: {
        name: appName,
        build: '1.0.0',
      },
    });
  }

  /**
   * Authorize the user (opens Apple Music sign-in).
   */
  async authorize(): Promise<string> {
    if (!this.musicKit) throw new Error('MusicKit not initialized');
    return this.musicKit.authorize();
  }

  /**
   * Search Apple Music catalog.
   */
  async search(query: string): Promise<any[]> {
    if (!this.musicKit) throw new Error('MusicKit not initialized');
    const result = await this.musicKit.api.music(`/v1/catalog/us/search`, {
      term: query,
      types: 'songs',
      limit: 10,
    });
    return result.data?.results?.songs?.data ?? [];
  }

  /**
   * Play a song by its Apple Music ID.
   */
  async playSong(songId: string): Promise<void> {
    if (!this.musicKit) throw new Error('MusicKit not initialized');
    await this.engine.init();

    await this.musicKit.setQueue({ song: songId });
    await this.musicKit.play();

    // Connect the audio element to Web Audio for analysis
    if (!this.mediaElementSource) {
      const audioElement = this.musicKit.player._player?._mediaElement
        ?? document.querySelector('audio');
      if (audioElement) {
        this.mediaElementSource = this.engine.connectMediaElement(audioElement);
      }
    }

    this.playing = true;
  }

  async pause(): Promise<void> {
    await this.musicKit?.pause();
    this.playing = false;
  }

  async skipNext(): Promise<void> {
    await this.musicKit?.skipToNextItem();
  }

  get nowPlaying(): { title: string; artist: string; artwork?: string } | null {
    const item = this.musicKit?.nowPlayingItem;
    if (!item) return null;
    return {
      title: item.attributes?.name ?? 'Unknown',
      artist: item.attributes?.artistName ?? 'Unknown',
      artwork: item.attributes?.artwork?.url?.replace('{w}', '100')?.replace('{h}', '100'),
    };
  }
}
