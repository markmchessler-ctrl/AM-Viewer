import * as fs from 'fs';
import * as path from 'path';

/**
 * Native file handling for the Electron main process.
 * Provides utilities for reading audio files and watching directories.
 */
export class FileHandler {
  private watcher: fs.FSWatcher | null = null;

  /**
   * Read an audio file as an ArrayBuffer.
   */
  public static readFileAsBuffer(filePath: string): ArrayBuffer {
    const buffer = fs.readFileSync(filePath);
    return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
  }

  /**
   * Get file metadata.
   */
  public static getFileInfo(filePath: string): {
    name: string;
    size: number;
    extension: string;
  } {
    const stats = fs.statSync(filePath);
    return {
      name: path.basename(filePath),
      size: stats.size,
      extension: path.extname(filePath).toLowerCase(),
    };
  }

  /**
   * Check if a file is a supported audio format.
   */
  public static isSupportedAudioFile(filePath: string): boolean {
    const ext = path.extname(filePath).toLowerCase();
    return ['.wav', '.flac', '.bwf'].includes(ext);
  }

  /**
   * Watch a directory for new audio files.
   */
  public watchDirectory(
    dirPath: string,
    onNewFile: (filePath: string) => void
  ): void {
    this.stopWatching();

    this.watcher = fs.watch(dirPath, (eventType, filename) => {
      if (eventType === 'rename' && filename) {
        const fullPath = path.join(dirPath, filename);
        if (fs.existsSync(fullPath) && FileHandler.isSupportedAudioFile(fullPath)) {
          onNewFile(fullPath);
        }
      }
    });
  }

  /**
   * Stop watching for file changes.
   */
  public stopWatching(): void {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }
  }
}
