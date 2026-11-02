/// <reference types="vite/client" />

interface Window {
  electronAPI?: {
    isElectron: boolean;
    selectDirectory: (options?: { title?: string; defaultPath?: string }) => Promise<{ canceled: boolean; path: string | null }>;
    saveFiles: (
      files: Array<{ name: string; buffer: ArrayBuffer }>,
      folderName?: string
    ) => Promise<{ success: boolean; savedCount: number; targetDir?: string; canceled?: boolean; error?: string }>;
    minimizeWindow: () => void;
    maximizeWindow: () => void;
    closeWindow: () => void;
    isMaximized: () => Promise<boolean>;
    rasterizeEpsNative: (
      fileBuffer: ArrayBuffer,
      fileName: string
    ) => Promise<{ success: boolean; buffer?: ArrayBuffer; width?: number; height?: number; error?: string }>;
    scanMasterDirectory: (masterPath: string) => Promise<{
      success: boolean;
      masterPath?: string;
      mediaBatches?: {
        Photos: Array<{
          name: string;
          number: number;
          path: string;
          fileCount: number;
          highestIndex: number;
          lastFileName?: string;
        }>;
        Videos: Array<{
          name: string;
          number: number;
          path: string;
          fileCount: number;
          highestIndex: number;
          lastFileName?: string;
        }>;
        Vectors: Array<{
          name: string;
          number: number;
          path: string;
          fileCount: number;
          highestIndex: number;
          lastFileName?: string;
        }>;
      };
      batches?: Array<{
        name: string;
        number: number;
        path: string;
        fileCount: number;
        highestIndex: number;
        lastFileName?: string;
      }>;
      latestBatch?: {
        name: string;
        number: number;
        path: string;
        fileCount: number;
        highestIndex: number;
        lastFileName?: string;
      } | null;
      error?: string;
    }>;
    saveBatchFiles: (
      masterDir: string,
      files: Array<{ relativePath: string; buffer: ArrayBuffer }>
    ) => Promise<{ success: boolean; savedCount: number; masterDir?: string; foldersCreated?: string[]; error?: string }>;
    showItemInFolder: (filePath: string) => Promise<{ success: boolean; error?: string }>;
    openPath: (folderPath: string) => Promise<{ success: boolean; error?: string }>;
    quarantineFile: (payload: string | { filePath: string; mediaType?: string; masterDir?: string }) => Promise<{
      success: boolean;
      moved?: boolean;
      targetPath?: string;
      targetDir?: string;
      reason?: string;
      error?: string;
    }>;
    secureStorage?: {
      isAvailable: () => Promise<boolean>;
      encrypt: (plainText: string) => Promise<string>;
      decrypt: (cipherText: string) => Promise<string>;
    };
    getPathForFile: (file: File) => string;
  };
}
