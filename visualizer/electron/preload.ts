import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  /**
   * Open a native file dialog for audio files.
   * Returns { name: string, buffer: ArrayBuffer } or null if cancelled.
   */
  openAudioFile: (): Promise<{ name: string; buffer: ArrayBuffer } | null> => {
    return ipcRenderer.invoke('open-audio-file');
  },

  /**
   * Read a file from disk as ArrayBuffer.
   */
  readFile: (filePath: string): Promise<ArrayBuffer> => {
    return ipcRenderer.invoke('read-file', filePath);
  },

  /**
   * Check if running in Electron.
   */
  isElectron: true,
});
