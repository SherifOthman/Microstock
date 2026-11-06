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
    setPowerSaveBlocker?: (enable: boolean) => Promise<{ active: boolean; id?: number | null; error?: string }>;
    isPowerSaveBlocking?: () => Promise<boolean>;
    showNotification?: (options: { title: string; body: string }) => Promise<{ success: boolean }>;
    notifyUploadComplete?: (stats: {
      succeededCount: number;
      failedCount: number;
      skippedCount?: number;
      duration?: string;
    }) => void;
    notifyBatchComplete?: (payload: {
      module?: 'ftp' | 'studio' | 'cleaner' | 'eps' | 'audio';
      title?: string;
      body?: string;
      succeededCount?: number;
      skippedCount?: number;
      failedCount?: number;
      duration?: string;
    }) => Promise<{ success: boolean }>;
    rasterizeEpsNative: (
      fileBufferOrOptions:
        | ArrayBuffer
        | { fileBuffer?: ArrayBuffer | null; filePath?: string; fileName?: string; maxDim?: number; quality?: number },
      fileName?: string
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
    shell?: {
      showItemInFolder: (filePath: string) => Promise<{ success: boolean; error?: string }>;
      openPath: (folderPath: string) => Promise<{ success: boolean; error?: string }>;
    };
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
    db?: {
      invoke: (method: string, ...args: any[]) => Promise<any>;
    };
    ftp?: {
      saveCredentials: (payload: {
        agencyId?: string;
        protocol?: 'ftp' | 'ftps' | 'sftp';
        host: string;
        port: number;
        username: string;
        password?: string;
        passiveMode?: boolean;
        lastVerifiedAt?: number;
      }) => Promise<any>;
      testConnection: (payload: {
        agencyId?: string;
        protocol?: 'ftp' | 'ftps' | 'sftp';
        host?: string;
        port?: number;
        username?: string;
        password?: string;
      }) => Promise<{
        success: boolean;
        latencyMs?: number;
        protocol?: string;
        host?: string;
        port?: number;
        verifiedAt?: number;
        errorCode?: string;
        error?: string;
      }>;
      uploadFile: (payload: {
        agencyId?: string;
        localPath?: string;
        fileBuffer?: ArrayBuffer;
        remoteFolder: string;
        filename: string;
        itemId: string;
        byteOffset?: number;
      }) => Promise<{
        success: boolean;
        isDuplicateSkip?: boolean;
        errorCode?: string;
        errorMessage?: string;
      }>;
      abortBatch: () => Promise<{ aborted: boolean }>;
      disconnectSession?: () => Promise<{ disconnected: boolean }>;
      selectFolderFiles?: () => Promise<{
        canceled: boolean;
        folderPath?: string;
        files: Array<{ name: string; size: number; path: string }>;
      }>;
      onTelemetry: (
        callback: (frame: {
          type: 'file-progress';
          itemId: string;
          bytesTransferred: number;
          timestamp: number;
        }) => void
      ) => () => void;
    };
    tasks?: {
      updateLifecycleState: (payload: {
        moduleId: 'ftp' | 'studio' | 'eps' | 'cleaner' | 'audio';
        isRunning: boolean;
        isPaused: boolean;
        progressPercent?: number;
        statusLabel?: string;
      }) => Promise<{
        status: 'idle' | 'running' | 'paused';
        hasActiveOrPaused: boolean;
        activeCount: number;
        primaryLabel: string;
      }>;
      getLifecycleSummary?: () => Promise<{
        status: 'idle' | 'running' | 'paused';
        hasActiveOrPaused: boolean;
        activeCount: number;
        primaryLabel: string;
      }>;
      forceQuit?: () => Promise<{ quitting: boolean }>;
      onTrayCommand: (
        callback: (payload: {
          command: 'pause-all' | 'resume-all' | 'prepare-force-quit';
          timestamp: number;
        }) => void
      ) => () => void;
    };
  };
}

