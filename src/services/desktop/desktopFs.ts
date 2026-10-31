/**
 * Desktop Native File System Bridge (Strict Electron Client)
 * 
 * Exclusively uses Electron IPC and Node.js native `fs` to write files
 * directly to disk. Eliminates browser Blobs, JSZip in-memory overhead,
 * and browser download limits.
 */

export interface FileToSave {
  name: string;
  data: Blob | File | Uint8Array | string;
}

export interface SaveDirectoryOptions {
  folderName?: string;
  onProgress?: (done: number, total: number, currentName: string) => void;
}

export interface SaveDirectoryResult {
  success: boolean;
  savedCount: number;
  error?: string;
  canceled?: boolean;
}

/**
 * Checks if running inside the Electron desktop app
 */
export function isElectron(): boolean {
  if (typeof window === 'undefined') return false;
  return Boolean(
    (window as any).electronAPI ||
    (window as any).ipcRenderer ||
    (window as any).process?.versions?.electron
  );
}

/**
 * Checks if native desktop directory writing is supported
 */
export function isNativeDirectorySupported(): boolean {
  return isElectron();
}

/**
 * Saves an array of files directly to the local hard drive using Electron's native fs.
 * Strictly throws an error if attempted in a standard browser.
 */
export async function saveFilesToLocalDirectory(
  files: FileToSave[],
  options: SaveDirectoryOptions = {}
): Promise<SaveDirectoryResult> {
  if (!files || files.length === 0) {
    return { success: false, savedCount: 0, error: 'No files provided to save.' };
  }

  if (!isElectron()) {
    throw new Error('This application must run in the Electron Desktop Client');
  }

  const electronAPI = (window as any).electronAPI;
  if (!electronAPI?.saveFiles) {
    throw new Error('This application must run in the Electron Desktop Client');
  }

  // Convert Blob/File data to ArrayBuffers for IPC transfer
  const preparedFiles = await Promise.all(
    files.map(async (f) => {
      let buffer: ArrayBuffer;
      if (f.data instanceof Blob || f.data instanceof File) {
        buffer = await f.data.arrayBuffer();
      } else if (typeof f.data === 'string') {
        const encoded = new TextEncoder().encode(f.data);
        const ab = new ArrayBuffer(encoded.byteLength);
        new Uint8Array(ab).set(encoded);
        buffer = ab;
      } else if (f.data instanceof Uint8Array) {
        const ab = new ArrayBuffer(f.data.byteLength);
        new Uint8Array(ab).set(f.data);
        buffer = ab;
      } else {
        buffer = new ArrayBuffer(0);
      }
      return {
        name: f.name,
        buffer,
      };
    })
  );

  const result = await electronAPI.saveFiles(preparedFiles, options.folderName);
  return {
    success: result.success,
    savedCount: result.savedCount || files.length,
    canceled: result.canceled,
    error: result.error,
  };
}
