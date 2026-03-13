import { contextBridge, ipcRenderer } from 'electron';

/**
 * Preload script — exposes a safe API bridge from the main process
 * to the renderer process via contextBridge.
 */
contextBridge.exposeInMainWorld('electronAPI', {
  /**
   * Open a native file dialog for audio files.
   * Returns { path, name, buffer } or null if canceled.
   */
  openFileDialog: (): Promise<{ path: string; name: string; buffer: ArrayBuffer } | null> =>
    ipcRenderer.invoke('dialog:openFile'),

  /**
   * Read a file from the filesystem.
   * Returns an ArrayBuffer.
   */
  readFile: (filePath: string): Promise<ArrayBuffer> =>
    ipcRenderer.invoke('fs:readFile', filePath),

  /**
   * Check if running in Electron.
   */
  isElectron: true,
});
