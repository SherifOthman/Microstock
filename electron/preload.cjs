const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  selectDirectory: (options) => ipcRenderer.invoke('dialog:selectDirectory', options),
  saveFiles: (files, folderName) => ipcRenderer.invoke('fs:saveFiles', { files, folderName }),
});
