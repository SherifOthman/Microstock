const ftp = require('basic-ftp');
const fs = require('fs');
const path = require('path');
const { Readable } = require('stream');

let SftpClient = null;
try {
  SftpClient = require('ssh2-sftp-client');
} catch (e) {
  console.warn('[FtpManager] ssh2-sftp-client could not be loaded:', e.message);
}

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
  '.csv',
]);

function sanitizeRemoteFilename(rawFilename) {
  const base = path.basename(rawFilename || 'upload.bin');
  return base
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\x7E]/g, '_');
}

/**
 * Persistent Single-Socket Plain FTP Adapter via basic-ftp (Port 21, Unencrypted Standard FTP)
 * - Reuses a single FTP control connection across sequential files in a batch.
 * - Enforces a 30-second zero-byte stall watchdog inside `trackProgress` (never cuts off large files as long as bytes flow).
 * - Immediately closes the TCP socket on stall or abort so Ghost Uploads can never continue in the background.
 * - Pre-checks remote directory listings (cached per folder during the batch) to accurately detect existing duplicate files.
 */
class PlainFtpAdapter {
  constructor() {
    this.client = null;
    this.connectedConfigKey = null;
    this.currentRemoteDir = null;
    this.remoteDirListingCache = new Map();
  }

  isConnected() {
    return Boolean(this.client && !this.client.closed);
  }

  async ensureConnected({ host, port = 21, username, password, secure = false, timeoutMs = 30000 }) {
    const cleanHost = (host || 'upload.dreamstime.com').trim();
    const cleanUser = (username || '').trim();
    const ftpPort = Number(port) || 21;
    const isSecure = Boolean(secure);
    const configKey = `${cleanHost}:${ftpPort}:${isSecure ? 'ftps' : 'ftp'}:${cleanUser}`;

    if (this.isConnected() && this.connectedConfigKey === configKey) {
      return;
    }

    this.disconnect();
    const client = new ftp.Client(timeoutMs);
    client.ftp.verbose = false;
    await client.access({
      host: cleanHost,
      port: ftpPort,
      user: cleanUser,
      password: password || '',
      secure: isSecure,
      secureOptions: isSecure ? { rejectUnauthorized: false } : undefined,
    });
    this.client = client;
    this.connectedConfigKey = configKey;
    this.currentRemoteDir = null;
    this.remoteDirListingCache.clear();
  }

  async navigateToRemoteFolder(remoteDir) {
    if (!this.isConnected()) throw new Error('FTP client is not connected.');
    const normalized =
      !remoteDir || remoteDir === '/'
        ? '/'
        : remoteDir.startsWith('/')
        ? remoteDir
        : `/${remoteDir}`;

    if (this.currentRemoteDir === normalized) {
      return normalized;
    }

    if (normalized === '/') {
      await this.client.cd('/');
      this.currentRemoteDir = '/';
      return '/';
    }

    try {
      await this.client.cd(normalized);
      this.currentRemoteDir = normalized;
    } catch {
      await this.client.ensureDir(normalized);
      this.currentRemoteDir = normalized;
    }
    return normalized;
  }

  /**
   * Checks if `targetName` already exists with non-zero size in the current remote directory.
   * Uses a per-session directory listing cache so we don't re-list on every file, and updates the cache on upload.
   */
  async checkRemoteDuplicate(normalizedFolder, targetName, localSize) {
    if (!this.isConnected()) return false;
    try {
      let fileMap = this.remoteDirListingCache.get(normalizedFolder);
      if (!fileMap) {
        const list = await this.client.list();
        fileMap = new Map();
        if (Array.isArray(list)) {
          for (const entry of list) {
            if (entry && entry.name) {
              fileMap.set(entry.name.toLowerCase(), Number(entry.size || 0));
            }
          }
        }
        this.remoteDirListingCache.set(normalizedFolder, fileMap);
      }

      const existingSize = fileMap.get(targetName.toLowerCase());
      if (existingSize !== undefined && existingSize > 0) {
        // If remote file exists and is either >= 95% of localSize (or non-zero), it's already on the server
        if (!localSize || existingSize >= Math.floor(localSize * 0.95)) {
          return true;
        }
      }
    } catch {
      // If LIST is restricted or fails, fall back to STOR response
    }
    return false;
  }

  markFileUploadedInCache(normalizedFolder, targetName, fileSize) {
    let fileMap = this.remoteDirListingCache.get(normalizedFolder);
    if (!fileMap) {
      fileMap = new Map();
      this.remoteDirListingCache.set(normalizedFolder, fileMap);
    }
    fileMap.set(targetName.toLowerCase(), Number(fileSize || 1));
  }

  /**
   * Uploads a single file over the persistent FTP connection with a 30-second zero-byte stall watchdog.
   * The watchdog resets every time `trackProgress` reports forward byte movement.
   */
  async uploadFile({
    localPath,
    fileBuffer,
    remoteFolder,
    filename,
    stallTimeoutMs = 30000,
    onProgress,
  }) {
    if (!this.isConnected()) throw new Error('FTP client is not connected.');

    const hasDiskFile =
      typeof localPath === 'string' && localPath.length > 0 && fs.existsSync(localPath);
    const hasMemoryBuffer =
      fileBuffer && (Buffer.isBuffer(fileBuffer) || fileBuffer.byteLength > 0);

    if (!hasDiskFile && !hasMemoryBuffer) {
      const err = new Error(`Local source file not found on disk: ${localPath || filename}`);
      err.code = 'ENOENT';
      throw err;
    }

    let localSize = 0;
    if (hasDiskFile) {
      try {
        localSize = fs.statSync(localPath).size;
      } catch {
        localSize = 0;
      }
    } else if (hasMemoryBuffer) {
      localSize = Buffer.isBuffer(fileBuffer) ? fileBuffer.length : fileBuffer.byteLength;
    }

    const normalizedFolder = await this.navigateToRemoteFolder(remoteFolder);
    const targetName = sanitizeRemoteFilename(filename || localPath || 'upload.bin');

    // 1. Pre-check if the exact file already exists on the remote server
    const alreadyExists = await this.checkRemoteDuplicate(normalizedFolder, targetName, localSize);
    if (alreadyExists) {
      const dupErr = new Error(`550 File already exists on server: ${targetName}`);
      dupErr.code = 'FTP_DUPLICATE_550';
      dupErr.isDuplicateSkip = true;
      throw dupErr;
    }

    // 2. Set up 30-second Zero-Byte Stall Watchdog (resets on every byte transferred)
    let lastBytes = -1;
    let stallTimer = null;
    let stalledOut = false;

    const resetStallWatchdog = (rejectStall) => {
      if (stallTimer) clearTimeout(stallTimer);
      stallTimer = setTimeout(() => {
        stalledOut = true;
        // Immediately kill the TCP socket so NO ghost upload can continue in the background!
        this.disconnect();
        const stallErr = new Error(
          `Transfer stalled (0 bytes moved for ${Math.round(stallTimeoutMs / 1000)}s) on ${targetName}`
        );
        stallErr.code = 'ETIMEDOUT_STALL';
        rejectStall(stallErr);
      }, stallTimeoutMs);
    };

    return await new Promise((resolve, reject) => {
      resetStallWatchdog(reject);

      this.client.trackProgress((info) => {
        const currentBytes = Number(info.bytes || info.bytesOverall || 0);
        if (currentBytes > lastBytes) {
          lastBytes = currentBytes;
          resetStallWatchdog(reject);
        }
        if (typeof onProgress === 'function') {
          onProgress(currentBytes);
        }
      });

      const runTransfer = async () => {
        try {
          // Clear any corrupted/interrupted partial file on the remote FTP server before STOR
          // so Dreamstime never rejects the upload with "550 Permission denied / Overwrite not allowed".
          try {
            await this.client.send(`DELE ${targetName}`);
          } catch {
            // Ignore 550 File not found when no partial file exists on the server
          }

          if (hasDiskFile) {
            await this.client.uploadFrom(localPath, targetName);
          } else {
            const buf = Buffer.isBuffer(fileBuffer) ? fileBuffer : Buffer.from(fileBuffer);
            const stream = Readable.from(buf);
            await this.client.uploadFrom(stream, targetName);
          }

          if (stallTimer) clearTimeout(stallTimer);
          if (this.client) {
            try {
              this.client.trackProgress();
            } catch {
              // ignore
            }
          }

          this.markFileUploadedInCache(normalizedFolder, targetName, localSize);
          resolve({ bytesTransferred: localSize });
        } catch (err) {
          if (stallTimer) clearTimeout(stallTimer);
          if (this.client) {
            try {
              this.client.trackProgress();
            } catch {
              // ignore
            }
          }
          if (stalledOut) return; // Already rejected by stall watchdog

          // Inspect whether this was a true STOR 550 duplicate/overwrite rejection vs a socket drop
          const msg = String(err.message || '');
          const code = Number(err.code) || 0;
          const isExplicitStorDuplicate =
            code === 550 &&
            /(?:already exists|file exists|cannot overwrite|overwrite|duplicate)/i.test(msg);

          if (isExplicitStorDuplicate) {
            err.code = 'FTP_DUPLICATE_550';
            err.isDuplicateSkip = true;
          } else {
            // Any other error during STOR may leave the control/data socket dirty; close so next attempt reconnects cleanly
            this.disconnect();
          }
          reject(err);
        }
      };

      runTransfer();
    });
  }

  disconnect() {
    if (this.client) {
      try {
        this.client.trackProgress();
      } catch {
        // ignore
      }
      try {
        this.client.close();
      } catch {
        // ignore close errors
      }
      this.client = null;
    }
    this.connectedConfigKey = null;
    this.currentRemoteDir = null;
    this.remoteDirListingCache.clear();
  }
}

/**
 * Persistent SFTP Adapter via ssh2-sftp-client (Port 2022 for 123RF Footage / Videos)
 * - Automatically connects with hostVerifier bypass for microstock SFTP hosts.
 * - Handles remote directory verification and recursive creation.
 * - Supports fastPut for local disk paths and put for memory buffers.
 */
class SftpAdapter {
  constructor() {
    this.client = null;
    this.connectedConfigKey = null;
    this.currentRemoteDir = null;
    this.remoteDirListingCache = new Map();
  }

  isConnected() {
    return Boolean(this.client && this.client.sftp);
  }

  async ensureConnected({ host, port = 2022, username, password, timeoutMs = 30000 }) {
    if (!SftpClient) {
      throw new Error('SFTP client library (ssh2-sftp-client) is not available.');
    }
    const cleanHost = (host || 'footage.ftp.123rf.com').trim();
    const cleanUser = (username || '').trim();
    const sftpPort = Number(port) || 2022;
    const configKey = `${cleanHost}:${sftpPort}:${cleanUser}`;

    if (this.isConnected() && this.connectedConfigKey === configKey) {
      return;
    }

    await this.disconnect();
    const client = new SftpClient();
    await client.connect({
      host: cleanHost,
      port: sftpPort,
      username: cleanUser,
      password: password || '',
      readyTimeout: timeoutMs,
      hostVerifier: () => true,
    });
    this.client = client;
    this.connectedConfigKey = configKey;
    this.currentRemoteDir = null;
    this.remoteDirListingCache.clear();
  }

  async navigateToRemoteFolder(remoteDir) {
    if (!this.isConnected()) throw new Error('SFTP client is not connected.');
    const normalized =
      !remoteDir || remoteDir === '/'
        ? '/'
        : remoteDir.startsWith('/')
        ? remoteDir
        : `/${remoteDir}`;

    if (normalized !== '/') {
      try {
        const exists = await this.client.exists(normalized);
        if (!exists) {
          await this.client.mkdir(normalized, true);
        }
      } catch {
        // continue if directory already exists or cannot be created
      }
    }
    this.currentRemoteDir = normalized;
    return normalized;
  }

  async checkRemoteDuplicate(normalizedFolder, targetName, localSize) {
    if (!this.isConnected()) return false;
    try {
      let fileMap = this.remoteDirListingCache.get(normalizedFolder);
      if (!fileMap) {
        const list = await this.client.list(normalizedFolder);
        fileMap = new Map();
        if (Array.isArray(list)) {
          for (const entry of list) {
            if (entry && entry.name) {
              fileMap.set(entry.name.toLowerCase(), Number(entry.size || 0));
            }
          }
        }
        this.remoteDirListingCache.set(normalizedFolder, fileMap);
      }
      const existingSize = fileMap.get(targetName.toLowerCase());
      if (existingSize !== undefined && existingSize > 0) {
        if (!localSize || existingSize >= Math.floor(localSize * 0.95)) {
          return true;
        }
      }
    } catch {}
    return false;
  }

  markFileUploadedInCache(normalizedFolder, targetName, fileSize) {
    let fileMap = this.remoteDirListingCache.get(normalizedFolder);
    if (!fileMap) {
      fileMap = new Map();
      this.remoteDirListingCache.set(normalizedFolder, fileMap);
    }
    fileMap.set(targetName.toLowerCase(), Number(fileSize || 1));
  }

  async uploadFile({ localPath, fileBuffer, remoteFolder, filename, onProgress }) {
    if (!this.isConnected()) throw new Error('SFTP client is not connected.');
    const targetDir = await this.navigateToRemoteFolder(remoteFolder);
    const targetName = sanitizeRemoteFilename(filename || localPath || 'upload.bin');
    const remotePath = targetDir === '/' ? `/${targetName}` : `${targetDir}/${targetName}`;

    const hasDiskFile =
      typeof localPath === 'string' && localPath.length > 0 && fs.existsSync(localPath);
    const hasMemoryBuffer =
      fileBuffer && (Buffer.isBuffer(fileBuffer) || fileBuffer.byteLength > 0);

    if (!hasDiskFile && !hasMemoryBuffer) {
      const err = new Error(`Local source file not found on disk: ${localPath || filename}`);
      err.code = 'ENOENT';
      throw err;
    }

    let localSize = 0;
    if (hasDiskFile) {
      try {
        localSize = fs.statSync(localPath).size;
      } catch {
        localSize = 0;
      }
    } else if (hasMemoryBuffer) {
      localSize = Buffer.isBuffer(fileBuffer) ? fileBuffer.length : fileBuffer.byteLength;
    }

    const alreadyExists = await this.checkRemoteDuplicate(targetDir, targetName, localSize);
    if (alreadyExists) {
      const dupErr = new Error(`550 File already exists on server: ${targetName}`);
      dupErr.code = 'FTP_DUPLICATE_550';
      dupErr.isDuplicateSkip = true;
      throw dupErr;
    }

    if (hasDiskFile) {
      await this.client.fastPut(localPath, remotePath, {
        step: (transferred) => {
          if (typeof onProgress === 'function') onProgress(transferred);
        },
      });
    } else {
      const buf = Buffer.isBuffer(fileBuffer) ? fileBuffer : Buffer.from(fileBuffer);
      await this.client.put(buf, remotePath);
      if (typeof onProgress === 'function') onProgress(localSize);
    }

    this.markFileUploadedInCache(targetDir, targetName, localSize);
    return { bytesTransferred: localSize };
  }

  async disconnect() {
    if (this.client) {
      try {
        await this.client.end();
      } catch {}
      this.client = null;
    }
    this.connectedConfigKey = null;
    this.currentRemoteDir = null;
    this.remoteDirListingCache.clear();
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
    this.persistentAdapter = new PlainFtpAdapter();
    this.sftpAdapter = new SftpAdapter();
    this.uploadMutex = Promise.resolve();
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

  resolveAgencyDefaults(agencyId = 'dreamstime') {
    switch (agencyId) {
      case '123rf':
        return { protocol: 'ftp', host: 'ftp.123rf.com', port: 21 };
      case 'vecteezy':
        return { protocol: 'sftp', host: 'content-ftp.eezy.com', port: 22 };
      case 'shutterstock':
        return { protocol: 'ftps', host: 'ftps.shutterstock.com', port: 21 };
      case 'adobe':
        return { protocol: 'sftp', host: 'sftp.contributor.adobestock.com', port: 22 };
      case 'magnific':
        return { protocol: 'sftp', host: 'contributor-ftp.magnific.com', port: 60022 };
      case 'dreamstime':
      default:
        return { protocol: 'ftp', host: 'upload.dreamstime.com', port: 21 };
    }
  }

  saveCredentials(payload = {}) {
    const agencyId = payload.agencyId || 'dreamstime';
    const defaults = this.resolveAgencyDefaults(agencyId);
    let encryptedPassword = undefined;
    if (typeof payload.password === 'string' && payload.password.length > 0) {
      encryptedPassword = this.encryptPassword(payload.password);
    }
    return this.sqliteDb.saveFtpProfile({
      agencyId,
      protocol: payload.protocol || defaults.protocol,
      host: (payload.host || defaults.host).trim(),
      port: Number(payload.port || defaults.port),
      username: (payload.username || '').trim(),
      encryptedPassword,
      passiveMode: true,
      lastVerifiedAt: payload.lastVerifiedAt,
    });
  }

  async testConnection(payload = {}) {
    const agencyId = payload.agencyId || 'dreamstime';
    const defaults = this.resolveAgencyDefaults(agencyId);
    const profileWithSecret = this.sqliteDb.getFtpProfileWithSecret(agencyId);
    const protocol = payload.protocol || profileWithSecret?.protocol || defaults.protocol;
    const host = (payload.host || profileWithSecret?.host || defaults.host).trim();
    const port = Number(payload.port || profileWithSecret?.port || defaults.port);
    const username = (payload.username ?? profileWithSecret?.username ?? '').trim();
    const password =
      typeof payload.password === 'string' && payload.password.length > 0
        ? payload.password
        : this.decryptPassword(profileWithSecret?.encryptedPassword || '');

    if (!host || !username || !password) {
      return {
        success: false,
        error: 'Host, Username, and Password are required to connect.',
      };
    }

    const startMs = Date.now();
    if (protocol === 'sftp') {
      const testSftp = new SftpAdapter();
      try {
        await testSftp.ensureConnected({
          host,
          port,
          username,
          password,
          timeoutMs: 15000,
        });
        const latencyMs = Date.now() - startMs;
        const now = Date.now();
        this.sqliteDb.saveFtpProfile({
          agencyId,
          protocol,
          host,
          port,
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
          protocol,
          host,
          port,
          verifiedAt: now,
        };
      } catch (err) {
        return {
          success: false,
          errorCode: String(err.code || 'SFTP_AUTH_ERROR'),
          error: err.message || `Failed to connect to ${host}:${port} via SFTP.`,
        };
      } finally {
        await testSftp.disconnect();
      }
    }

    const testAdapter = new PlainFtpAdapter();
    try {
      await testAdapter.ensureConnected({
        host,
        port,
        username,
        password,
        secure: protocol === 'ftps',
        timeoutMs: 15000,
      });
      const latencyMs = Date.now() - startMs;
      const now = Date.now();
      this.sqliteDb.saveFtpProfile({
        agencyId,
        protocol,
        host,
        port,
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
        protocol,
        host,
        port,
        verifiedAt: now,
      };
    } catch (err) {
      return {
        success: false,
        errorCode: String(err.code || 'FTP_AUTH_ERROR'),
        error: err.message || `Failed to connect to ${host}:${port}.`,
      };
    } finally {
      testAdapter.disconnect();
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
    this.persistentAdapter.disconnect();
    if (this.sftpAdapter) this.sftpAdapter.disconnect();
    return { aborted: true };
  }

  disconnectSession() {
    this.persistentAdapter.disconnect();
    if (this.sftpAdapter) this.sftpAdapter.disconnect();
    return { disconnected: true };
  }

  /**
   * Strictly serialized single-file upload over persistent FTP / FTPS / SFTP sessions.
   * Uses an internal mutex so two transfers can NEVER overlap on the socket even if invoked concurrently.
   */
  uploadSingleNativeFile(payload = {}) {
    const run = async () => {
      const {
        agencyId = 'dreamstime',
        protocol: explicitProtocol,
        port: explicitPort,
        hostOverride,
        mediaType,
        localPath,
        fileBuffer,
        remoteFolder = '/',
        filename,
        itemId,
        byteOffset = 0,
      } = payload;

      const defaults = this.resolveAgencyDefaults(agencyId);
      const profileWithSecret = this.sqliteDb.getFtpProfileWithSecret(agencyId);
      const isVideoMedia =
        mediaType === 'video' ||
        (filename && /\.(mp4|mov|m4v|webm|avi|mkv)$/i.test(filename)) ||
        remoteFolder === '/ai_video';

      const protocol =
        explicitProtocol ||
        (agencyId === '123rf' && isVideoMedia ? 'sftp' : profileWithSecret?.protocol || defaults.protocol);

      const targetPort = Number(
        explicitPort ||
          (agencyId === '123rf' && protocol === 'sftp'
            ? 2022
            : profileWithSecret?.port || defaults.port)
      );

      const host = (
        hostOverride ||
        (agencyId === '123rf' && protocol === 'sftp'
          ? 'footage.ftp.123rf.com'
          : profileWithSecret?.host || defaults.host)
      ).trim();

      const username = (profileWithSecret?.username || '').trim();
      const password = this.decryptPassword(profileWithSecret?.encryptedPassword || '');

      if (!username || !password) {
        return {
          success: false,
          errorCode: 'NO_CREDENTIALS',
          errorMessage: `${agencyId.toUpperCase()} FTP/SFTP credentials are not configured. Open Site Settings to save your login.`,
        };
      }

      let lastEmit = 0;

      if (protocol === 'sftp') {
        try {
          await this.sftpAdapter.ensureConnected({
            host,
            port: targetPort,
            username,
            password,
            timeoutMs: 30000,
          });

          await this.sftpAdapter.uploadFile({
            localPath,
            fileBuffer,
            remoteFolder,
            filename,
            onProgress: (bytesTransferred) => {
              const now = Date.now();
              if (now - lastEmit >= 40) {
                lastEmit = now;
                this.sendTelemetry({
                  type: 'file-progress',
                  itemId,
                  bytesTransferred: Number(byteOffset || 0) + Number(bytesTransferred || 0),
                  timestamp: now,
                });
              }
            },
          });

          return { success: true };
        } catch (err) {
          return {
            success: false,
            isDuplicateSkip: Boolean(err.isDuplicateSkip || err.code === 'FTP_DUPLICATE_550'),
            errorCode: String(err.code || 'SFTP_TRANSFER_ERR'),
            errorMessage: err.message || 'SFTP transfer failed.',
          };
        }
      }

      try {
        await this.persistentAdapter.ensureConnected({
          host,
          port: targetPort,
          username,
          password,
          secure: protocol === 'ftps',
          timeoutMs: 30000,
        });

        await this.persistentAdapter.uploadFile({
          localPath,
          fileBuffer,
          remoteFolder,
          filename,
          stallTimeoutMs: 30000,
          onProgress: (bytesTransferred) => {
            const now = Date.now();
            if (now - lastEmit >= 40) {
              lastEmit = now;
              this.sendTelemetry({
                type: 'file-progress',
                itemId,
                bytesTransferred: Number(byteOffset || 0) + Number(bytesTransferred || 0),
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
          isDuplicateSkip: Boolean(err.isDuplicateSkip || err.code === 'FTP_DUPLICATE_550'),
          errorCode: String(err.code || 'FTP_TRANSFER_ERR'),
          errorMessage: err.message || 'FTP transfer failed.',
        };
      }
    };

    const next = this.uploadMutex.then(run, run);
    this.uploadMutex = next.then(
      () => {},
      () => {}
    );
    return next;
  }
}

module.exports = {
  ElectronFtpManager,
  PlainFtpAdapter,
  SftpAdapter,
  FtpFtpsAdapter: PlainFtpAdapter,
};
