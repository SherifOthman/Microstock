const ftp = require('basic-ftp');
const fs = require('fs');
const path = require('path');
const { Readable } = require('stream');

const SUPPORTED_MEDIA_EXTENSIONS = new Set([
  '.jpg',
  '.jpeg',
  '.png',
  '.webp',
  '.tif',
  '.tiff',
  '.bmp',
  '.eps',
  '.ai',
  '.svg',
  '.cdr',
  '.mp4',
  '.mov',
  '.webm',
  '.avi',
  '.mkv',
  '.m4v',
]);

/**
 * Plain Standard FTP Adapter via basic-ftp (Forced Port 21, Unencrypted Standard FTP)
 * Matches FileZilla's default standard FTP connection behavior for Dreamstime (`ftp.dreamstime.com`).
 */
class PlainFtpAdapter {
  constructor() {
    this.client = null;
  }

  async connect({ host, username, password, timeoutMs = 20000 }) {
    this.disconnect();
    const client = new ftp.Client(timeoutMs);
    client.ftp.verbose = false;
    await client.access({
      host: (host || 'ftp.dreamstime.com').trim(),
      port: 21,
      user: (username || '').trim(),
      password: password || '',
      secure: false,
    });
    this.client = client;
  }

  async navigateToRemoteFolder(remoteDir) {
    if (!this.client) throw new Error('FTP client is not connected.');
    const normalized =
      !remoteDir || remoteDir === '/'
        ? '/'
        : remoteDir.startsWith('/')
        ? remoteDir
        : `/${remoteDir}`;

    if (normalized === '/') {
      await this.client.cd('/');
      return;
    }

    try {
      await this.client.cd(normalized);
    } catch {
      await this.client.ensureDir(normalized);
    }
  }

  async uploadFile({ localPath, fileBuffer, remoteFolder, filename, onProgress }) {
    if (!this.client) throw new Error('FTP client is not connected.');

    const hasDiskFile = typeof localPath === 'string' && localPath.length > 0 && fs.existsSync(localPath);
    const hasMemoryBuffer = fileBuffer && (Buffer.isBuffer(fileBuffer) || fileBuffer.byteLength > 0);

    if (!hasDiskFile && !hasMemoryBuffer) {
      const err = new Error(`Local source file not found on disk: ${localPath || filename}`);
      err.code = 'ENOENT';
      throw err;
    }

    await this.navigateToRemoteFolder(remoteFolder);

    this.client.trackProgress((info) => {
      if (typeof onProgress === 'function') {
        onProgress(info.bytesOverall || info.bytes || 0);
      }
    });

    try {
      const rawTarget = path.basename(filename || localPath || 'upload.bin');
      const targetName = rawTarget
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^\x20-\x7E]/g, '_');
      if (hasDiskFile) {
        await this.client.uploadFrom(localPath, targetName);
      } else {
        const buf = Buffer.isBuffer(fileBuffer) ? fileBuffer : Buffer.from(fileBuffer);
        const stream = Readable.from(buf);
        await this.client.uploadFrom(stream, targetName);
      }
    } finally {
      this.client.trackProgress();
    }
  }

  disconnect() {
    if (this.client) {
      try {
        this.client.close();
      } catch {
        // ignore close errors
      }
      this.client = null;
    }
  }
}

function scanDirectoryForMediaFiles(rootDir) {
  const results = [];
  const stack = [rootDir];

  while (stack.length > 0) {
    const currentDir = stack.pop();
    let entries = [];
    try {
      entries = fs.readdirSync(currentDir, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (SUPPORTED_MEDIA_EXTENSIONS.has(ext)) {
          try {
            const stat = fs.statSync(fullPath);
            results.push({
              name: entry.name,
              size: stat.size,
              path: fullPath,
            });
          } catch {
            // skip unreadable file
          }
        }
      }
    }
  }

  return results;
}

class ElectronFtpManager {
  constructor({ sqliteDb, safeStorage, getMainWindow, dialog }) {
    this.sqliteDb = sqliteDb;
    this.safeStorage = safeStorage;
    this.getMainWindow = getMainWindow;
    this.dialog = dialog;
    this.activeAbortController = null;
    this.activeAdapter = null;
  }

  encryptPassword(plainText) {
    if (!plainText) return '';
    if (plainText.startsWith('enc:')) return plainText;
    try {
      if (this.safeStorage && this.safeStorage.isEncryptionAvailable()) {
        const buf = this.safeStorage.encryptString(plainText);
        return `enc:${buf.toString('hex')}`;
      }
    } catch (err) {
      console.error('[FtpManager] safeStorage.encryptString error:', err);
    }
    return `enc:${Buffer.from(plainText, 'utf8').toString('hex')}`;
  }

  decryptPassword(cipherText) {
    if (!cipherText) return '';
    if (!cipherText.startsWith('enc:')) return cipherText;
    const hex = cipherText.slice(4);
    try {
      const buf = Buffer.from(hex, 'hex');
      if (this.safeStorage && this.safeStorage.isEncryptionAvailable()) {
        return this.safeStorage.decryptString(buf);
      }
      return buf.toString('utf8');
    } catch (err) {
      console.error('[FtpManager] safeStorage.decryptString error:', err);
      try {
        return Buffer.from(hex, 'hex').toString('utf8');
      } catch {
        return '';
      }
    }
  }

  saveCredentials(payload = {}) {
    const agencyId = payload.agencyId || 'dreamstime';
    let encryptedPassword = undefined;
    if (typeof payload.password === 'string' && payload.password.length > 0) {
      encryptedPassword = this.encryptPassword(payload.password);
    }
    return this.sqliteDb.saveFtpProfile({
      agencyId,
      protocol: 'ftp',
      host: (payload.host || 'ftp.dreamstime.com').trim(),
      port: 21,
      username: (payload.username || '').trim(),
      encryptedPassword,
      passiveMode: true,
      lastVerifiedAt: payload.lastVerifiedAt,
    });
  }

  async testConnection(payload = {}) {
    const agencyId = payload.agencyId || 'dreamstime';
    const profileWithSecret = this.sqliteDb.getFtpProfileWithSecret(agencyId);
    const host = (payload.host || profileWithSecret?.host || 'ftp.dreamstime.com').trim();
    const username = (payload.username ?? profileWithSecret?.username ?? '').trim();
    const password =
      typeof payload.password === 'string' && payload.password.length > 0
        ? payload.password
        : this.decryptPassword(profileWithSecret?.encryptedPassword || '');

    if (!host || !username || !password) {
      return {
        success: false,
        error: 'Host, Username, and Password are required to connect to Dreamstime FTP.',
      };
    }

    const startMs = Date.now();
    const adapter = new PlainFtpAdapter();
    try {
      await adapter.connect({
        host,
        username,
        password,
        timeoutMs: 15000,
      });
      const latencyMs = Date.now() - startMs;
      const now = Date.now();
      this.sqliteDb.saveFtpProfile({
        agencyId,
        protocol: 'ftp',
        host,
        port: 21,
        username,
        encryptedPassword:
          typeof payload.password === 'string' && payload.password.length > 0
            ? this.encryptPassword(payload.password)
            : profileWithSecret?.encryptedPassword,
        passiveMode: true,
        lastVerifiedAt: now,
      });
      return {
        success: true,
        latencyMs,
        protocol: 'ftp',
        host,
        port: 21,
        verifiedAt: now,
      };
    } catch (err) {
      return {
        success: false,
        errorCode: String(err.code || 'FTP_AUTH_ERROR'),
        error: err.message || 'Failed to connect to Dreamstime FTP server.',
      };
    } finally {
      adapter.disconnect();
    }
  }

  async selectFolderFiles() {
    const win = this.getMainWindow ? this.getMainWindow() : null;
    if (!this.dialog) {
      return { canceled: true, files: [] };
    }
    const result = await this.dialog.showOpenDialog(win, {
      title: 'Select Shoot Folder to Queue for FTP Upload',
      properties: ['openDirectory'],
    });
    if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
      return { canceled: true, files: [] };
    }
    const folderPath = result.filePaths[0];
    const files = scanDirectoryForMediaFiles(folderPath);
    return {
      canceled: false,
      folderPath,
      files,
    };
  }

  sendTelemetry(frame) {
    const win = this.getMainWindow ? this.getMainWindow() : null;
    if (win && !win.isDestroyed() && win.webContents) {
      win.webContents.send('ftp:telemetry', frame);
    }
  }

  abortActiveBatch() {
    if (this.activeAbortController) {
      this.activeAbortController.aborted = true;
    }
    if (this.activeAdapter) {
      this.activeAdapter.disconnect();
      this.activeAdapter = null;
    }
    return { aborted: true };
  }

  async uploadSingleNativeFile(payload = {}) {
    const {
      agencyId = 'dreamstime',
      localPath,
      fileBuffer,
      remoteFolder = '/',
      filename,
      itemId,
    } = payload;

    const profileWithSecret = this.sqliteDb.getFtpProfileWithSecret(agencyId);
    const host = (profileWithSecret?.host || 'ftp.dreamstime.com').trim();
    const username = (profileWithSecret?.username || '').trim();
    const password = this.decryptPassword(profileWithSecret?.encryptedPassword || '');

    if (!username || !password) {
      return {
        success: false,
        errorCode: 'NO_CREDENTIALS',
        errorMessage: 'Dreamstime FTP credentials are not configured. Open Site Settings to save your login.',
      };
    }

    const adapter = new PlainFtpAdapter();
    this.activeAdapter = adapter;
    let lastEmit = 0;

    try {
      await adapter.connect({
        host,
        username,
        password,
        timeoutMs: 30000,
      });

      await adapter.uploadFile({
        localPath,
        fileBuffer,
        remoteFolder,
        filename,
        onProgress: (bytesTransferred) => {
          const now = Date.now();
          if (now - lastEmit >= 25) {
            lastEmit = now;
            this.sendTelemetry({
              type: 'file-progress',
              itemId,
              bytesTransferred,
              timestamp: now,
            });
          }
        },
      });

      return {
        success: true,
      };
    } catch (err) {
      return {
        success: false,
        errorCode: String(err.code || 'FTP_TRANSFER_ERR'),
        errorMessage: err.message || 'FTP transfer failed.',
      };
    } finally {
      adapter.disconnect();
      if (this.activeAdapter === adapter) {
        this.activeAdapter = null;
      }
    }
  }
}

module.exports = {
  ElectronFtpManager,
  PlainFtpAdapter,
  FtpFtpsAdapter: PlainFtpAdapter,
};
