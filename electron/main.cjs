const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1080,
    minHeight: 720,
    title: 'Microstock Studio',
    backgroundColor: '#09090b',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  const isDev = process.env.NODE_ENV === 'development';
  const devUrl = process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173';

  if (isDev && !app.isPackaged) {
    mainWindow.loadURL(devUrl);
    // Open DevTools in dev mode if requested
    if (process.env.OPEN_DEVTOOLS) {
      mainWindow.webContents.openDevTools();
    }
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Ensure single instance lock
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    setupIpcHandlers();
    createWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      }
    });
  });
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

function setupIpcHandlers() {
  // IPC: Directory Selection Dialog
  ipcMain.handle('dialog:selectDirectory', async (event, options = {}) => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: options.title || 'Select Folder',
      properties: ['openDirectory', 'createDirectory'],
      defaultPath: options.defaultPath,
    });

    if (result.canceled || result.filePaths.length === 0) {
      return { canceled: true, path: null };
    }

    return { canceled: false, path: result.filePaths[0] };
  });

  // IPC: Direct-to-Disk Native File Saving (bypasses browser Blobs/ZIP memory bloat)
  ipcMain.handle('fs:saveFiles', async (event, payload) => {
    try {
      const { files, folderName } = payload;
      if (!files || !Array.isArray(files) || files.length === 0) {
        return { success: false, savedCount: 0, error: 'No files provided.' };
      }

      // Prompt user to select destination folder
      const dialogResult = await dialog.showOpenDialog(mainWindow, {
        title: folderName ? `Select Destination for "${folderName}"` : 'Select Destination Folder',
        properties: ['openDirectory', 'createDirectory'],
      });

      if (dialogResult.canceled || dialogResult.filePaths.length === 0) {
        return { success: false, savedCount: 0, canceled: true, error: 'Folder selection canceled.' };
      }

      const rootDir = dialogResult.filePaths[0];
      const targetDir = folderName ? path.join(rootDir, folderName) : rootDir;

      // Ensure target directory exists
      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
      }

      let saved = 0;
      const seenNames = new Map();
      for (const item of files) {
        if (!item || !item.name) continue;
        let finalName = item.name;
        const lower = finalName.toLowerCase();
        if (seenNames.has(lower)) {
          const count = seenNames.get(lower) + 1;
          seenNames.set(lower, count);
          const ext = path.extname(finalName);
          const base = path.basename(finalName, ext);
          finalName = `${base}_${count}${ext}`;
        } else {
          seenNames.set(lower, 1);
        }
        const filePath = path.join(targetDir, finalName);
        const buffer = Buffer.from(item.buffer);
        fs.writeFileSync(filePath, buffer);
        saved++;
      }

      return {
        success: true,
        savedCount: saved,
        targetDir,
      };
    } catch (err) {
      console.error('[Electron Main] fs:saveFiles error:', err);
      return {
        success: false,
        savedCount: 0,
        error: err.message || 'Failed to save files natively.',
      };
    }
  });
}
