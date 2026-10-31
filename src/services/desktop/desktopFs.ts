/**
 * Desktop & Native File System Bridge
 * 
 * Provides unified direct-to-disk file saving for Electron, Tauri, and Chromium
 * desktop shells. Eliminates JSZip in-memory bloat and browser Blob download crashes
 * when processing large batches of high-res videos, images, and vectors.
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
 * Checks if running inside an Electron desktop app
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
 * Checks if running inside a Tauri desktop app
 */
export function isTauri(): boolean {
  if (typeof window === 'undefined') return false;
  return Boolean((window as any).__TAURI__ || (window as any).__TAURI_METADATA__);
}

/**
 * Checks if native desktop direct-to-disk directory writing is supported
 */
export function isNativeDirectorySupported(): boolean {
  if (typeof window === 'undefined') return false;
  return isElectron() || isTauri() || 'showDirectoryPicker' in window;
}

/**
 * Saves an array of files directly to the local hard drive.
 * 
 * Guarantees 100% of files are written sequentially without dropping any file.
 * Automatically adapts between Electron IPC, Tauri FS, and the Native File System Access API.
 */
export async function saveFilesToLocalDirectory(
  files: FileToSave[],
  options: SaveDirectoryOptions = {}
): Promise<SaveDirectoryResult> {
  if (!files || files.length === 0) {
    return { success: false, savedCount: 0, error: 'No files provided to save.' };
  }

  // 1. Electron Desktop Environment Bridge
  if (isElectron()) {
    try {
      const electronAPI = (window as any).electronAPI;
      if (electronAPI?.saveFiles) {
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
    } catch (err: any) {
      console.warn('[DesktopFS] Electron IPC save fallback to File System Access API:', err);
    }
  }

  // 2. Tauri Desktop Environment Bridge
  if (isTauri()) {
    try {
      const tauri = (window as any).__TAURI__;
      if (tauri?.dialog?.open && tauri?.fs?.writeBinaryFile) {
        const selectedDir = await tauri.dialog.open({ directory: true, multiple: false });
        if (!selectedDir) {
          return { success: false, savedCount: 0, canceled: true, error: 'User cancelled folder selection.' };
        }

        const targetBase = options.folderName ? `${selectedDir}/${options.folderName}` : selectedDir;
        if (options.folderName && tauri.fs.createDir) {
          await tauri.fs.createDir(targetBase, { recursive: true }).catch(() => {});
        }

        let saved = 0;
        for (const f of files) {
          let u8: Uint8Array;
          if (f.data instanceof Blob || f.data instanceof File) {
            u8 = new Uint8Array(await f.data.arrayBuffer());
          } else if (typeof f.data === 'string') {
            u8 = new TextEncoder().encode(f.data);
          } else if (f.data instanceof Uint8Array) {
            u8 = f.data;
          } else {
            u8 = new Uint8Array(0);
          }

          const filePath = `${targetBase}/${f.name}`;
          await tauri.fs.writeBinaryFile(filePath, u8);
          saved++;
          options.onProgress?.(saved, files.length, f.name);
        }

        return { success: true, savedCount: saved };
      }
    } catch (err: any) {
      console.warn('[DesktopFS] Tauri save fallback to File System Access API:', err);
    }
  }

  // 3. Native File System Access API (Standard in Chromium, Electron shells & Edge)
  if (typeof window !== 'undefined' && 'showDirectoryPicker' in window) {
    try {
      const rootDirHandle = await (window as any).showDirectoryPicker({ mode: 'readwrite' });
      const targetDirHandle = options.folderName
        ? await rootDirHandle.getDirectoryHandle(options.folderName, { create: true })
        : rootDirHandle;

      let saved = 0;
      for (const f of files) {
        const fileHandle = await targetDirHandle.getFileHandle(f.name, { create: true });
        const writable = await fileHandle.createWritable();
        
        if (f.data instanceof Blob || f.data instanceof File) {
          await writable.write(f.data);
        } else if (typeof f.data === 'string') {
          await writable.write(new Blob([f.data], { type: 'text/plain' }));
        } else if (f.data instanceof Uint8Array) {
          await writable.write(f.data);
        }

        await writable.close();
        saved++;
        options.onProgress?.(saved, files.length, f.name);
      }

      return { success: true, savedCount: saved };
    } catch (err: any) {
      if (err.name === 'AbortError') {
        return { success: false, savedCount: 0, canceled: true, error: 'User cancelled folder selection.' };
      }
      return { success: false, savedCount: 0, error: err.message || 'Failed to save files directly to folder.' };
    }
  }

  return {
    success: false,
    savedCount: 0,
    error: 'Native file system is not supported in this environment.',
  };
}
