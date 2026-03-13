interface ElectronAPI {
  openFileDialog(): Promise<{
    path: string;
    name: string;
    buffer: ArrayBuffer;
  } | null>;
  readFile(filePath: string): Promise<ArrayBuffer>;
  isElectron: boolean;
}

interface Window {
  electronAPI?: ElectronAPI;
}
