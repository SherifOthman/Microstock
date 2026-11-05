const ftp = require('basic-ftp');
const fs = require('fs');
const path = require('path');

/**
 * SFTP-Ready StockTransferAdapter Interface (Phase 1: FTP/Explicit FTPS via basic-ftp)
 * Phase 2 will register SftpAdapter (ssh2-sftp-client) behind the exact same contract.
 */
class FtpFtpsAdapter {
  constructor() {
    this.client = null;
    this.ensuredDirs = new Set();
  }

  async connect({ host, port = 21, username, password, secure = true, timeoutMs = 15000 }) {
    this.disconnect();
    const client = new ftp.Client(timeoutMs);
    client.ftp.verbose = false;
    await client.access({
      host,
      port: Number(port) || 21,
      user: username,
      password,
      secure: Boolean(secure),
      secureOptions: secure ? { rejectUnauthorized: false } : undefined,
    });
    this.client = client;
    this.ensuredDirs.clear();
    this.ensuredDirs.add('/');
  }

  async ensureDirectory(remoteDir) {
    if (!this.client) throw new Error('FTP client is not connected.');
    const normalized = !remoteDir || remoteDir === '/' ? '/' : remoteDir.startsWith('/') ? remoteDir : `/${remoteDir}`;
    if (this.ensuredDirs.has(normalized)) {
      await this.client.cd(normalized);
      return;
    }
    await this.client.ensureDir(normalized);
    this.ensuredDirs.add(normalized);
  }

  async uploadFile({ localPath, remoteFolder, filename, onProgress }) {
    if (!this.client) throw new Error('FTP client is not connected.');
    if (!localPath || !fs.existsSync(localPath)) {
      const err = new Error(`Local source file not found on disk: ${localPath || filename}`);
      err.code = 'ENOENT';
      throw err;
    }

    await this.ensureDirectory(remoteFolder);

    this.client.trackProgress((info) => {
      if (typeof onProgress === 'function') {
        onProgress(info.bytesOverall || info.bytes || 0);
      }
    });

    try {
      const targetName = path.basename(filename || localPath);
      await this.client.uploadFrom(localPath, targetName);
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
    this.ensuredDirs.clear();
  }
}

class ElectronFtpManager {
  constructor({ sqliteDb, safeStorage, getMainWindow }) {
    this.sqliteDb = sqliteDb;
    this.safeStorage = safeStorage;
    this.getMainWindow = getMainWindow;
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
      protocol: payload.protocol || 'ftps',
      host: (payload.host || 'ftp.dreamstime.com').trim(),
      port: Number(payload.port) || 21,
      username: (payload.username || '').trim(),
      encryptedPassword,
      passiveMode: payload.passiveMode !== false,
      lastVerifiedAt: payload.lastVerifiedAt,
    });
  }

  async testConnection(payload = {}) {
    const agencyId = payload.agencyId || 'dreamstime';
    const profileWithSecret = this.sqliteDb.getFtpProfileWithSecret(agencyId);
    const host = (payload.host || profileWithSecret?.host || 'ftp.dreamstime.com').trim();
    const port = Number(payload.port || profileWithSecret?.port || 21);
    const protocol = payload.protocol || profileWithSecret?.protocol || 'ftps';
    const username = (payload.username ?? profileWithSecret?.username ?? '').trim();
    const password =
      typeof payload.password === 'string' && payload.password.length > 0
        ? payload.password
        : this.decryptPassword(profileWithSecret?.encryptedPassword || '');

    if (!host || !username || !password) {
      return {
        success: false,
        error: 'Host, Username, and Password are required to test the Dreamstime connection.',
      };
    }

    const startMs = Date.now();
    const adapter = new FtpFtpsAdapter();
    try {
      await adapter.connect({
        host,
        port,
        username,
        password,
        secure: protocol === 'ftps',
        timeoutMs: 12000,
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
        error: err.message || 'Failed to connect to Dreamstime FTP server.',
      };
    } finally {
      adapter.disconnect();
    }
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
      remoteFolder = '/',
      filename,
      itemId,
    } = payload;

    const profileWithSecret = this.sqliteDb.getFtpProfileWithSecret(agencyId);
    const host = (profileWithSecret?.host || 'ftp.dreamstime.com').trim();
    const port = Number(profileWithSecret?.port || 21);
    const protocol = profileWithSecret?.protocol || 'ftps';
    const username = (profileWithSecret?.username || '').trim();
    const password = this.decryptPassword(profileWithSecret?.encryptedPassword || '');

    if (!username || !password) {
      return {
        success: false,
        errorCode: 'NO_CREDENTIALS',
        errorMessage: 'Dreamstime FTP credentials are not configured in the Secure Vault.',
      };
    }

    const adapter = new FtpFtpsAdapter();
    this.activeAdapter = adapter;
    let lastEmit = 0;

    try {
      await adapter.connect({
        host,
        port,
        username,
        password,
        secure: protocol === 'ftps',
        timeoutMs: 20000,
      });

      await adapter.uploadFile({
        localPath,
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
  FtpFtpsAdapter,
};
