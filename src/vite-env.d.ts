/// <reference types="vite/client" />

interface Window {
  electronAPI?: {
    isElectron: boolean;
    selectDirectory: (options?: { title?: string; defaultPath?: string }) => Promise<{ canceled: boolean; path: string | null }>;
    saveFiles: (
      files: Array<{ name: string; buffer: ArrayBuffer }>,
      folderName?: string
    ) => Promise<{ success: boolean; savedCount: number; targetDir?: string; canceled?: boolean; error?: string }>;
  };
}
