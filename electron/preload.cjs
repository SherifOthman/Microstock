const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  selectDirectory: (options) => ipcRenderer.invoke('dialog:selectDirectory', options),
  saveFiles: (files, folderName) => ipcRenderer.invoke('fs:saveFiles', { files, folderName }),
  minimizeWindow: () => ipcRenderer.send('window-minimize'),
  maximizeWindow: () => ipcRenderer.send('window-maximize'),
  closeWindow: () => ipcRenderer.send('window-close'),
  isMaximized: () => ipcRenderer.invoke('window-is-maximized'),
  setPowerSaveBlocker: (enable) => ipcRenderer.invoke('power:setBlocker', enable),
  isPowerSaveBlocking: () => ipcRenderer.invoke('power:isBlocking'),
  showNotification: (options) => ipcRenderer.invoke('app:showNotification', options),
  notifyUploadComplete: (stats) => ipcRenderer.send('notify-upload-complete', stats),
  notifyBatchComplete: (payload) => ipcRenderer.invoke('app:notifyBatchComplete', payload),
  rasterizeEpsNative: (fileBufferOrOptions, fileName) => {
    if (
      fileBufferOrOptions &&
      typeof fileBufferOrOptions === 'object' &&
      !(fileBufferOrOptions instanceof ArrayBuffer) &&
      !ArrayBuffer.isView(fileBufferOrOptions)
    ) {
      return ipcRenderer.invoke('eps:rasterizeNative', fileBufferOrOptions);
    }
    return ipcRenderer.invoke('eps:rasterizeNative', { fileBuffer: fileBufferOrOptions, fileName });
  },
  scanMasterDirectory: (masterPath) =>
    ipcRenderer.invoke('fs:scanMasterDirectory', masterPath),
  saveBatchFiles: (masterDir, files) =>
    ipcRenderer.invoke('fs:saveBatchFiles', { masterDir, files }),
  showItemInFolder: (filePath) =>
    ipcRenderer.invoke('shell:showItemInFolder', filePath),
  openPath: (folderPath) =>
    ipcRenderer.invoke('shell:openPath', folderPath),
  quarantineFile: (filePathOrPayload) =>
    ipcRenderer.invoke('fs:quarantineFile', filePathOrPayload),
  secureStorage: {
    isAvailable: () => ipcRenderer.invoke('secure:isAvailable'),
    encrypt: (plainText) => ipcRenderer.invoke('secure:encrypt', plainText),
    decrypt: (cipherText) => ipcRenderer.invoke('secure:decrypt', cipherText),
  },
  getPathForFile: (file) => {
    try {
      if (webUtils && typeof webUtils.getPathForFile === 'function') {
        return webUtils.getPathForFile(file);
      }
      return file.path || '';
    } catch {
      return file.path || '';
    }
  },
  db: {
    invoke: (method, ...args) => ipcRenderer.invoke('db:invoke', method, ...args),
  },
  ftp: {
    saveCredentials: (payload) => ipcRenderer.invoke('ftp:saveCredentials', payload),
    testConnection: (payload) => ipcRenderer.invoke('ftp:testConnection', payload),
    uploadFile: (payload) => ipcRenderer.invoke('ftp:uploadFile', payload),
    abortBatch: () => ipcRenderer.invoke('ftp:abortBatch'),
    disconnectSession: () => ipcRenderer.invoke('ftp:disconnectSession'),
    selectFolderFiles: () => ipcRenderer.invoke('ftp:selectFolderFiles'),
    onTelemetry: (callback) => {
      const handler = (_event, frame) => callback(frame);
      ipcRenderer.on('ftp:telemetry', handler);
      return () => ipcRenderer.removeListener('ftp:telemetry', handler);
    },
  },
});
