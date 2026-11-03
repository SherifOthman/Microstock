const { app, BrowserWindow, ipcMain, dialog, shell, safeStorage, protocol } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { Readable } = require('stream');
const { spawn, spawnSync } = require('child_process');
const { sqliteDb } = require('./sqliteDb.cjs');

// Register custom stockflow:// protocol as privileged before app is ready
// Enables native <img src="stockflow://..."> and <video src="stockflow://..."> streaming
if (protocol && typeof protocol.registerSchemesAsPrivileged === 'function') {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: 'stockflow',
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        stream: true,
        bypassCSP: true,
      },
    },
  ]);
}

let mainWindow = null;

// Locate Ghostscript binary on Windows
function findGhostscriptExecutable() {
  const commonPaths = [
    'C:\\Program Files\\gs\\gs10.08.0\\bin\\gswin64c.exe',
    'C:\\Program Files\\gs\\gs10.04.0\\bin\\gswin64c.exe',
    'C:\\Program Files\\gs\\gs10.03.0\\bin\\gswin64c.exe',
    'C:\\Program Files\\gs\\gs10.02.0\\bin\\gswin64c.exe',
  ];

  for (const p of commonPaths) {
    if (fs.existsSync(p)) return p;
  }

  // Search C:\Program Files\gs dynamically
  const gsRoot = 'C:\\Program Files\\gs';
  if (fs.existsSync(gsRoot)) {
    try {
      const dirs = fs.readdirSync(gsRoot);
      for (const d of dirs) {
        const binCandidate = path.join(gsRoot, d, 'bin', 'gswin64c.exe');
        if (fs.existsSync(binCandidate)) return binCandidate;
        const binCandidate32 = path.join(gsRoot, d, 'bin', 'gswin32c.exe');
        if (fs.existsSync(binCandidate32)) return binCandidate32;
      }
    } catch {
      // ignore
    }
  }

  // System PATH fallback
  try {
    const which = spawnSync('where', ['gswin64c.exe'], { encoding: 'utf8', windowsHide: true });
    if (which.status === 0 && which.stdout.trim()) {
      return which.stdout.trim().split(/\r?\n/)[0];
    }
  } catch {
    // ignore
  }

  return null;
}

// Windows Shell Notification to immediately refresh Windows Explorer folders
function notifyWindowsShellFolder(folderPath) {
  if (process.platform !== 'win32') return;
  const scriptPath = path.join(__dirname, 'refresh-shell.ps1');
  if (fs.existsSync(scriptPath)) {
    try {
      const child = spawn('powershell.exe', [
        '-NoProfile',
        '-ExecutionPolicy',
        'Bypass',
        '-File',
        scriptPath,
      ], {
        windowsHide: true,
        detached: true,
        stdio: 'ignore',
      });
      child.unref();
    } catch {
      // ignore
    }
  }
}

// Synchronously write and explicitly fsync to force OS buffer flush
function writeAndFlushFileSync(filePath, buffer) {
  const fd = fs.openSync(filePath, 'w');
  try {
    fs.writeSync(fd, buffer, 0, buffer.length, 0);
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
}

// Let hardware acceleration run normally unless explicitly disabled
// (disableHardwareAcceleration can cause invisible windows on some Windows GPU setups)

function createWindow() {
  console.log('[Electron Main] Creating window...');
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1080,
    minHeight: 720,
    title: 'Microstock Studio',
    backgroundColor: '#09090b',
    autoHideMenuBar: true,
    show: false,
    center: true,
    frame: false,
    skipTaskbar: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  // Force the window to be visible, focused, and maximized on the active screen once ready
  mainWindow.once('ready-to-show', () => {
    console.log('[Electron Main] ready-to-show fired. Showing, focusing and maximizing window.');
    mainWindow.show();
    mainWindow.maximize();
    mainWindow.focus();
  });

  // Safety fallback: if ready-to-show hasn't fired in 3s, force display
  setTimeout(() => {
    if (mainWindow && !mainWindow.isVisible()) {
      console.log('[Electron Main] Fallback timer: showing window.');
      mainWindow.show();
      mainWindow.maximize();
      mainWindow.focus();
    }
  }, 3000);

  console.log('[Electron Main] Window created, bounds:', mainWindow.getBounds());

  const isDev = !app.isPackaged;
  const devUrl = process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173';

  if (isDev) {
    console.log('[Electron Main] Dev mode — loading:', devUrl);
    mainWindow.loadURL(devUrl).catch((err) => {
      console.error('[Electron Main] Failed to load dev URL:', err);
      // Fallback to dist/index.html even in dev if vite isn't ready
      mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
    });
    // Open DevTools in dev mode if requested
    if (process.env.OPEN_DEVTOOLS) {
      mainWindow.webContents.openDevTools();
    }
  } else {
    const indexPath = path.join(__dirname, '../dist/index.html');
    console.log('[Electron Main] Production mode — loading:', indexPath);
    mainWindow.loadFile(indexPath).catch((err) => {
      console.error('[Electron Main] Failed to load file:', err);
    });
  }

  // Log any renderer crashes
  mainWindow.webContents.on('render-process-gone', (event, details) => {
    console.error('[Electron Main] Renderer crashed:', details);
  });
  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
    console.error('[Electron Main] Page failed to load:', errorCode, errorDescription);
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function getMimeTypeForFile(filePath) {
  const ext = path.extname(filePath || '').toLowerCase();
  const mimeMap = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
    '.bmp': 'image/bmp',
    '.svg': 'image/svg+xml',
    '.tif': 'image/tiff',
    '.tiff': 'image/tiff',
    '.avif': 'image/avif',
    '.mp4': 'video/mp4',
    '.m4v': 'video/mp4',
    '.mov': 'video/quicktime',
    '.webm': 'video/webm',
    '.avi': 'video/x-msvideo',
    '.mkv': 'video/x-matroska',
    '.eps': 'application/postscript',
    '.ai': 'application/postscript',
  };
  return mimeMap[ext] || 'application/octet-stream';
}

function registerStockflowProtocol() {
  if (!protocol || typeof protocol.handle !== 'function') return;

  protocol.handle('stockflow', async (request) => {
    try {
      const parsedUrl = new URL(request.url);
      let filePath = parsedUrl.searchParams.get('path') || '';
      if (!filePath) {
        const rawPath = decodeURIComponent(parsedUrl.pathname || '').replace(/^\/+/, '');
        if (rawPath && rawPath !== 'local') {
          filePath = rawPath;
        }
      }

      if (!filePath || !fs.existsSync(filePath)) {
        return new Response('File not found', { status: 404 });
      }

      const stat = fs.statSync(filePath);
      if (!stat.isFile()) {
        return new Response('Not a file', { status: 404 });
      }

      const mimeType = getMimeTypeForFile(filePath);
      const totalSize = stat.size;
      const rangeHeader = request.headers.get('range') || request.headers.get('Range');

      if (rangeHeader) {
        const match = rangeHeader.match(/bytes=(\d*)-(\d*)/);
        if (match) {
          const start = match[1] ? parseInt(match[1], 10) : 0;
          const end = match[2] ? Math.min(parseInt(match[2], 10), totalSize - 1) : totalSize - 1;

          if (start >= totalSize || start > end) {
            return new Response(null, {
              status: 416,
              headers: { 'Content-Range': `bytes */${totalSize}` },
            });
          }

          const chunkLength = end - start + 1;
          const nodeStream = fs.createReadStream(filePath, { start, end });
          return new Response(Readable.toWeb(nodeStream), {
            status: 206,
            headers: {
              'Content-Type': mimeType,
              'Content-Length': String(chunkLength),
              'Content-Range': `bytes ${start}-${end}/${totalSize}`,
              'Accept-Ranges': 'bytes',
              'Cache-Control': 'no-cache',
            },
          });
        }
      }

      const nodeStream = fs.createReadStream(filePath);
      return new Response(Readable.toWeb(nodeStream), {
        status: 200,
        headers: {
          'Content-Type': mimeType,
          'Content-Length': String(totalSize),
          'Accept-Ranges': 'bytes',
          'Cache-Control': 'no-cache',
        },
      });
    } catch (err) {
      console.error('[Electron Main] stockflow:// protocol error:', err);
      return new Response('Internal protocol error', { status: 500 });
    }
  });
}

/**
 * Strips any existing `_Needs_Fixing` or `Needs_Fixing` tail segments from a directory path
 * so quarantine operations never nest `_Needs_Fixing/_Needs_Fixing`.
 */
function stripNeedsFixingSegments(dirPath) {
  const resolved = path.resolve(dirPath);
  const parsed = path.parse(resolved);
  const relativePart = resolved.slice(parsed.root.length);
  const segments = relativePart.split(/[\\/]+/).filter(Boolean);
  const needsFixingIdx = segments.findIndex((seg) => /^_?needs[_-\s]?fixing$/i.test(seg));
  if (needsFixingIdx !== -1) {
    const cleanSegments = segments.slice(0, needsFixingIdx);
    return cleanSegments.length > 0 ? path.join(parsed.root, ...cleanSegments) : parsed.root;
  }
  return resolved;
}

/**
 * Resolves the target quarantine directory for a flagged file and detects if the file
 * is already inside a `_Needs_Fixing` folder to prevent recursive folder duplication.
 */
function resolveQuarantineTarget(filePath, mediaType = 'Photos', masterDir = null) {
  const resolvedFile = path.resolve(filePath);
  const currentFileDir = path.dirname(resolvedFile);

  // Check if the file is already inside a _Needs_Fixing / Needs_Fixing directory tree
  const cleanFromFileDir = stripNeedsFixingSegments(currentFileDir);
  const isAlreadyInNeedsFixing =
    path.resolve(cleanFromFileDir).toLowerCase() !== path.resolve(currentFileDir).toLowerCase();

  if (isAlreadyInNeedsFixing) {
    const canonicalTargetDir = path.join(cleanFromFileDir, '_Needs_Fixing', mediaType);
    // If the file is already inside _Needs_Fixing (either directly or in its media subfolder),
    // do not create another nested _Needs_Fixing folder!
    if (
      path.resolve(currentFileDir).toLowerCase() === path.resolve(canonicalTargetDir).toLowerCase() ||
      /^_?needs[_-\s]?fixing$/i.test(path.basename(currentFileDir)) ||
      /^_?needs[_-\s]?fixing$/i.test(path.basename(path.dirname(currentFileDir)))
    ) {
      return {
        alreadyQuarantined: true,
        targetDir: currentFileDir,
        targetPath: resolvedFile,
      };
    }
  }

  let baseDir;
  if (masterDir && typeof masterDir === 'string' && fs.existsSync(masterDir)) {
    const resolvedMaster = path.resolve(masterDir);
    const strippedMaster = stripNeedsFixingSegments(resolvedMaster);
    // If masterDir itself was a _Needs_Fixing folder, use its parent root; otherwise beside masterDir
    if (strippedMaster.toLowerCase() !== resolvedMaster.toLowerCase()) {
      baseDir = strippedMaster;
    } else {
      baseDir = path.dirname(resolvedMaster);
    }
  } else {
    baseDir = cleanFromFileDir;
  }

  const targetDir = path.join(baseDir, '_Needs_Fixing', mediaType);
  if (path.resolve(targetDir).toLowerCase() === path.resolve(currentFileDir).toLowerCase()) {
    return {
      alreadyQuarantined: true,
      targetDir: currentFileDir,
      targetPath: resolvedFile,
    };
  }

  return {
    alreadyQuarantined: false,
    targetDir,
    targetPath: path.join(targetDir, path.basename(resolvedFile)),
  };
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
    registerStockflowProtocol();
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
  sqliteDb.init(app);

  // Native SQLite Relational Database RPC Bridge
  ipcMain.handle('db:invoke', async (_event, method, ...args) => {
    return sqliteDb.invoke(method, ...args);
  });

  // Window Control IPC
  ipcMain.on('window-minimize', () => {
    if (mainWindow) mainWindow.minimize();
  });

  ipcMain.on('window-maximize', () => {
    if (mainWindow) {
      if (mainWindow.isMaximized()) {
        mainWindow.unmaximize();
      } else {
        mainWindow.maximize();
      }
    }
  });

  ipcMain.on('window-close', () => {
    if (mainWindow) mainWindow.close();
  });

  ipcMain.handle('window-is-maximized', () => {
    return mainWindow ? mainWindow.isMaximized() : false;
  });

  // Native Secure Storage via Electron safeStorage (Windows DPAPI / OS Keychain)
  ipcMain.handle('secure:isAvailable', () => {
    try {
      return Boolean(
        safeStorage &&
        typeof safeStorage.isEncryptionAvailable === 'function' &&
        safeStorage.isEncryptionAvailable()
      );
    } catch {
      return false;
    }
  });

  ipcMain.handle('secure:encrypt', async (event, plainText) => {
    if (!plainText) return '';
    try {
      if (safeStorage && safeStorage.isEncryptionAvailable()) {
        const buffer = safeStorage.encryptString(plainText);
        return `enc:${buffer.toString('hex')}`;
      }
    } catch (err) {
      console.error('[Electron] safeStorage encryption failed:', err);
    }
    return plainText;
  });

  ipcMain.handle('secure:decrypt', async (event, cipherText) => {
    if (!cipherText) return '';
    if (typeof cipherText === 'string' && cipherText.startsWith('enc:')) {
      try {
        if (safeStorage && safeStorage.isEncryptionAvailable()) {
          const hex = cipherText.slice(4);
          const buffer = Buffer.from(hex, 'hex');
          return safeStorage.decryptString(buffer);
        }
      } catch (err) {
        console.error('[Electron] safeStorage decryption failed:', err);
      }
    }
    return cipherText;
  });

  // Shell: Open file location in Windows Explorer
  ipcMain.handle('shell:showItemInFolder', async (event, filePath) => {
    try {
      if (filePath && typeof filePath === 'string' && fs.existsSync(filePath)) {
        shell.showItemInFolder(filePath);
        return { success: true };
      }
      return { success: false, error: 'File path does not exist on disk.' };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // Shell: Open folder path in Windows Explorer
  ipcMain.handle('shell:openPath', async (event, folderPath) => {
    try {
      if (folderPath && typeof folderPath === 'string' && fs.existsSync(folderPath)) {
        await shell.openPath(folderPath);
        return { success: true };
      }
      return { success: false, error: 'Folder path does not exist.' };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // IPC: Smart Quarantine (Move flagged file to _Needs_Fixing / [Media Type] beside master folder)
  ipcMain.handle('fs:quarantineFile', async (event, payload) => {
    try {
      const filePath = typeof payload === 'string' ? payload : payload?.filePath;
      const mediaType = (typeof payload === 'object' && payload?.mediaType) || 'Photos';
      const masterDir = typeof payload === 'object' ? payload?.masterDir : null;

      if (!filePath || typeof filePath !== 'string') {
        return { success: false, error: 'Invalid file path' };
      }

      // Safety catch: if user already moved or deleted the file in Windows Explorer, ignore silently (ENOENT)
      if (!fs.existsSync(filePath)) {
        return { success: true, moved: false, reason: 'File already moved or deleted (ENOENT)' };
      }

      const resolved = resolveQuarantineTarget(filePath, mediaType, masterDir);
      if (resolved.alreadyQuarantined) {
        return {
          success: true,
          moved: false,
          alreadyQuarantined: true,
          targetPath: resolved.targetPath,
          targetDir: resolved.targetDir,
          reason: 'File is already inside _Needs_Fixing folder',
        };
      }

      const targetDir = resolved.targetDir;

      // Automatically create _Needs_Fixing / [Media Type] directory if it does not exist
      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
      }

      const fileName = path.basename(filePath);
      let targetPath = path.join(targetDir, fileName);

      // Handle duplicate filename in quarantine folder
      if (fs.existsSync(targetPath)) {
        const ext = path.extname(fileName);
        const base = path.basename(fileName, ext);
        targetPath = path.join(targetDir, `${base}_${Date.now()}${ext}`);
      }

      try {
        fs.renameSync(filePath, targetPath);
      } catch (renameErr) {
        // Silent catch for ENOENT if race condition with user manual action
        if (renameErr.code === 'ENOENT') {
          return { success: true, moved: false, reason: 'File already moved or deleted (ENOENT)' };
        }
        if (renameErr.code === 'EXDEV') {
          fs.copyFileSync(filePath, targetPath);
          fs.unlinkSync(filePath);
        } else {
          throw renameErr;
        }
      }

      // Refresh Windows Explorer for both folders
      notifyWindowsShellFolder(path.dirname(filePath));
      notifyWindowsShellFolder(targetDir);

      return { success: true, moved: true, targetPath, targetDir };
    } catch (err) {
      console.warn('[Electron Main] fs:quarantineFile safety catch:', err.message);
      return { success: false, error: err.message };
    }
  });

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
        writeAndFlushFileSync(filePath, buffer);
        saved++;
      }

      // Notify Windows Shell so Windows Explorer updates immediately without pressing F5
      notifyWindowsShellFolder(targetDir);

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

  // IPC: Scan Master Directory for Media-First Batches (Photos/B01, Videos/B01, Vectors/B01)
  ipcMain.handle('fs:scanMasterDirectory', async (event, masterPath) => {
    try {
      if (!masterPath || typeof masterPath !== 'string') {
        return { success: false, error: 'No directory path provided.' };
      }

      if (!fs.existsSync(masterPath)) {
        return { success: false, error: 'Destination directory does not exist on disk.' };
      }

      const stat = fs.statSync(masterPath);
      if (!stat.isDirectory()) {
        return { success: false, error: 'Specified path is not a directory.' };
      }

      const scanBatchesInDir = (dirPath) => {
        if (!fs.existsSync(dirPath)) return [];
        let entries = [];
        try {
          entries = fs.readdirSync(dirPath, { withFileTypes: true });
        } catch {
          return [];
        }

        const batches = [];
        for (const ent of entries) {
          if (!ent.isDirectory()) continue;
          const match = ent.name.match(/^B(?:atch)?[-_\s]?(\d+)$/i);
          if (match) {
            const batchNum = parseInt(match[1], 10);
            const folderFullPath = path.join(dirPath, ent.name);
            let files = [];
            try {
              files = fs.readdirSync(folderFullPath).filter((f) => {
                try {
                  return fs.statSync(path.join(folderFullPath, f)).isFile();
                } catch {
                  return false;
                }
              });
            } catch {
              files = [];
            }

            let highestIndex = 0;
            let lastFileName = '';

            for (const f of files) {
              // Match patterns like B01_001__name.jpg, B01_AI_PH_040_name.jpg, B03_010.jpg, 010_...
              const numMatch = f.match(/(?:^B\d+[-_](?:(?:AI|NT)[-_][A-Z]{2}[-_])?(\d+)|[-_](\d+)\.[^.]+$|^(\d+)[-_])/i);
              if (numMatch) {
                const parsed = parseInt(numMatch[1] || numMatch[2] || numMatch[3], 10);
                if (!isNaN(parsed) && parsed > highestIndex && parsed < 100000) {
                  highestIndex = parsed;
                  lastFileName = f;
                }
              }
            }

            if (highestIndex === 0 && files.length > 0) {
              highestIndex = files.length;
              lastFileName = files[files.length - 1];
            }

            batches.push({
              name: ent.name,
              number: batchNum,
              path: folderFullPath,
              fileCount: files.length,
              highestIndex,
              lastFileName,
            });
          }
        }

        return batches.sort((a, b) => a.number - b.number);
      };

      // Helper to merge and deduplicate batches from dual-root folders (e.g. Real/Photos and legacy Photos)
      const mergeBatches = (listA, listB) => {
        const map = new Map();
        for (const b of [...listA, ...listB]) {
          if (!map.has(b.number) || map.get(b.number).highestIndex < b.highestIndex) {
            map.set(b.number, b);
          }
        }
        return Array.from(map.values()).sort((a, b) => a.number - b.number);
      };

      // 1. Scan Dual-Root Hierarchies: Real (Photos, Videos, Vectors) & AI (AI_Photos, AI_Videos, AI_Vectors)
      // Supports both Real/Photos and Photos for seamless backward compatibility
      const mediaBatches = {
        Photos: mergeBatches(
          scanBatchesInDir(path.join(masterPath, 'Real', 'Photos')),
          scanBatchesInDir(path.join(masterPath, 'Photos'))
        ),
        Videos: mergeBatches(
          scanBatchesInDir(path.join(masterPath, 'Real', 'Videos')),
          scanBatchesInDir(path.join(masterPath, 'Videos'))
        ),
        Vectors: mergeBatches(
          scanBatchesInDir(path.join(masterPath, 'Real', 'Vectors')),
          scanBatchesInDir(path.join(masterPath, 'Vectors'))
        ),
        AI_Photos: mergeBatches(
          scanBatchesInDir(path.join(masterPath, 'AI', 'AI_Photos')),
          scanBatchesInDir(path.join(masterPath, 'AI_Photos'))
        ),
        AI_Videos: mergeBatches(
          scanBatchesInDir(path.join(masterPath, 'AI', 'AI_Videos')),
          scanBatchesInDir(path.join(masterPath, 'AI_Videos'))
        ),
        AI_Vectors: mergeBatches(
          scanBatchesInDir(path.join(masterPath, 'AI', 'AI_Vectors')),
          scanBatchesInDir(path.join(masterPath, 'AI_Vectors'))
        ),
      };

      // 2. Also scan Root Master for legacy B01, B02 batches if any
      const rootBatches = scanBatchesInDir(masterPath);

      // Latest batch across all categories
      const allBatches = [
        ...mediaBatches.Photos,
        ...mediaBatches.Videos,
        ...mediaBatches.Vectors,
        ...mediaBatches.AI_Photos,
        ...mediaBatches.AI_Videos,
        ...mediaBatches.AI_Vectors,
        ...rootBatches,
      ];
      const latestBatch = allBatches.length > 0 ? allBatches.sort((a, b) => b.number - a.number)[0] : null;

      return {
        success: true,
        masterPath,
        mediaBatches,
        batches: rootBatches.length > 0 ? rootBatches : allBatches,
        latestBatch,
      };
    } catch (err) {
      console.error('[Electron Main] fs:scanMasterDirectory error:', err);
      return { success: false, error: err.message || 'Failed to scan master directory.' };
    }
  });

  // IPC: Save Batch Files Natively into Subfolders (B01, B02...) with Windows Explorer Refresh
  ipcMain.handle('fs:saveBatchFiles', async (event, payload) => {
    try {
      const { masterDir, files } = payload;
      if (!masterDir || !fs.existsSync(masterDir)) {
        return { success: false, error: 'Master destination directory does not exist.' };
      }
      if (!files || !Array.isArray(files) || files.length === 0) {
        return { success: false, error: 'No files provided to save.' };
      }

      let savedCount = 0;
      const modifiedFolders = new Set();

      for (const item of files) {
        if (!item || !item.relativePath || !item.buffer) continue;
        const fullPath = path.join(masterDir, item.relativePath);
        const folderPath = path.dirname(fullPath);

        if (!fs.existsSync(folderPath)) {
          fs.mkdirSync(folderPath, { recursive: true });
        }
        modifiedFolders.add(folderPath);

        const buffer = Buffer.from(item.buffer);
        writeAndFlushFileSync(fullPath, buffer);
        savedCount++;
      }

      // Immediately refresh Windows Explorer for master folder and all touched batch subfolders
      notifyWindowsShellFolder(masterDir);
      for (const dir of modifiedFolders) {
        notifyWindowsShellFolder(dir);
      }

      return {
        success: true,
        savedCount,
        masterDir,
        foldersCreated: Array.from(modifiedFolders),
      };
    } catch (err) {
      console.error('[Electron Main] fs:saveBatchFiles error:', err);
      return { success: false, error: err.message || 'Failed to save batch files.' };
    }
  });

  // Asynchronous Ghostscript Process Pool (prevents blocking Electron Main Process event loop)
  const MAX_GS_CONCURRENCY = Math.min(3, Math.max(1, (os.cpus() ? os.cpus().length : 4) - 1));
  let activeGsProcesses = 0;
  const gsWaitQueue = [];

  function acquireGsSlot() {
    if (activeGsProcesses < MAX_GS_CONCURRENCY) {
      activeGsProcesses++;
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      gsWaitQueue.push(resolve);
    });
  }

  function releaseGsSlot() {
    activeGsProcesses = Math.max(0, activeGsProcesses - 1);
    if (gsWaitQueue.length > 0 && activeGsProcesses < MAX_GS_CONCURRENCY) {
      const next = gsWaitQueue.shift();
      if (next) {
        activeGsProcesses++;
        next();
      }
    }
  }

  function runGhostscriptAsync(gsBinary, gsArgs, timeoutMs = 25000) {
    return new Promise((resolve) => {
      let settled = false;
      let stdout = '';
      let stderr = '';

      const child = spawn(gsBinary, gsArgs, {
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          try {
            child.kill('SIGKILL');
          } catch {}
          resolve({ status: -1, stdout, stderr: stderr || 'Ghostscript timed out after 25s' });
        }
      }, timeoutMs);

      if (child.stdout) {
        child.stdout.on('data', (chunk) => {
          if (stdout.length < 65536) stdout += chunk.toString();
        });
      }
      if (child.stderr) {
        child.stderr.on('data', (chunk) => {
          if (stderr.length < 65536) stderr += chunk.toString();
        });
      }

      child.on('error', (err) => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          resolve({ status: -1, stdout, stderr: err.message || 'Failed to spawn Ghostscript' });
        }
      });

      child.on('close', (code) => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          resolve({ status: code ?? -1, stdout, stderr });
        }
      });
    });
  }

  // IPC: High-Fidelity Native EPS to JPG Rasterization via Ghostscript (Non-Blocking Async Pool)
  ipcMain.handle('eps:rasterizeNative', async (event, payload) => {
    const { fileBuffer, filePath, fileName, maxDim, quality } = payload || {};
    const hasValidPath = typeof filePath === 'string' && filePath.trim().length > 0 && fs.existsSync(filePath);
    if (!hasValidPath && !fileBuffer) {
      return { success: false, error: 'No EPS file path or buffer provided' };
    }

    const gsBinary = findGhostscriptExecutable();
    if (!gsBinary) {
      return {
        success: false,
        error: 'Ghostscript binary not found. Please install Ghostscript or place gswin64c.exe in Program Files.',
      };
    }

    await acquireGsSlot();
    const tempDir = os.tmpdir();
    const uniqueId = `${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const tempEps = hasValidPath ? null : path.join(tempDir, `eps_input_${uniqueId}.eps`);
    const tempJpg = path.join(tempDir, `eps_out_${uniqueId}.jpg`);

    try {
      if (tempEps && fileBuffer) {
        await fs.promises.writeFile(tempEps, Buffer.from(fileBuffer));
      }
      const inputEpsPath = hasValidPath ? filePath : tempEps;

      // Use lightweight 72 DPI when generating thumbnails (maxDim <= 1024), or 300 DPI for full conversion
      const isThumbnailMode = typeof maxDim === 'number' && maxDim > 0 && maxDim <= 1024;
      const targetDpi = isThumbnailMode ? 72 : 300;
      const targetJpegQ =
        typeof quality === 'number' && quality > 0 && quality <= 1
          ? Math.max(50, Math.min(100, Math.round(quality * 100)))
          : isThumbnailMode
          ? 75
          : 95;

      const gsArgs = [
        '-dSAFER',
        '-dBATCH',
        '-dNOPAUSE',
        '-dEPSCrop',
        `-r${targetDpi}`,
        '-sDEVICE=jpeg',
        `-dJPEGQ=${targetJpegQ}`,
        '-dTextAlphaBits=4',
        '-dGraphicsAlphaBits=4',
        '-sColorConversionStrategy=RGB',
        '-dProcessColorModel=/DeviceRGB',
        '-dBackgroundColor=16#FFFFFF',
        '-sOutputFile=' + tempJpg,
        inputEpsPath,
      ];

      const proc = await runGhostscriptAsync(gsBinary, gsArgs, 25000);

      if (proc.status !== 0 || !fs.existsSync(tempJpg)) {
        const errMsg = proc.stderr || proc.stdout || 'Ghostscript exited with status ' + proc.status;
        return { success: false, error: errMsg };
      }

      const jpgBuffer = await fs.promises.readFile(tempJpg);

      // Read dimensions from SOF marker
      let width = 0;
      let height = 0;
      for (let i = 0; i < jpgBuffer.length - 8; i++) {
        if (jpgBuffer[i] === 0xff && (jpgBuffer[i + 1] === 0xc0 || jpgBuffer[i + 1] === 0xc2)) {
          height = jpgBuffer.readUInt16BE(i + 5);
          width = jpgBuffer.readUInt16BE(i + 7);
          break;
        }
      }

      return {
        success: true,
        buffer: jpgBuffer.buffer.slice(jpgBuffer.byteOffset, jpgBuffer.byteOffset + jpgBuffer.byteLength),
        width,
        height,
      };
    } catch (err) {
      console.error(`[Electron Main] eps:rasterizeNative error on "${fileName || 'unknown'}":`, err);
      return { success: false, error: err.message || 'EPS rasterization failed.' };
    } finally {
      if (tempEps) {
        try { await fs.promises.unlink(tempEps); } catch {}
      }
      try { await fs.promises.unlink(tempJpg); } catch {}
      releaseGsSlot();
    }
  });
}
