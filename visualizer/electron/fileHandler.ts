import { dialog, type BrowserWindow } from 'electron';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Native file dialog handler for Electron.
 */
export class FileHandler {
  /**
   * Show native open dialog filtered for audio formats.
   */
  static async showOpenDialog(window: BrowserWindow): Promise<{
    name: string;
    path: string;
    buffer: ArrayBuffer;
  } | null> {
    const result = await dialog.showOpenDialog(window, {
      title: 'Open Audio File',
      filters: [
        { name: 'Audio Files', extensions: ['wav', 'flac', 'bwf', 'aif', 'aiff'] },
        { name: 'ADM BWF Files', extensions: ['wav', 'bwf'] },
        { name: 'All Files', extensions: ['*'] },
      ],
      properties: ['openFile'],
    });

    if (result.canceled || result.filePaths.length === 0) return null;

    const filePath = result.filePaths[0];
    const buffer = fs.readFileSync(filePath);

    return {
      name: path.basename(filePath),
      path: filePath,
      buffer: buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength),
    };
  }

  /**
   * Read a file and return its contents as ArrayBuffer.
   */
  static readFile(filePath: string): ArrayBuffer {
    const buffer = fs.readFileSync(filePath);
    return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
  }
}
