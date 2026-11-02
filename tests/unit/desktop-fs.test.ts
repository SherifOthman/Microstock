import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  isElectron,
  isNativeDirectorySupported,
  saveFilesToLocalDirectory,
  FileToSave,
} from '../../src/services/desktop/desktopFs';
import {
  isSecureStorageAvailable,
  encryptSecret,
  decryptSecret,
} from '../../src/services/desktop/secureStorage';

describe('Desktop Native File System Bridge (desktopFs.ts)', () => {
  const originalWindow = global.window;

  beforeEach(() => {
    // Reset window mock
    (global as any).window = {
      electronAPI: undefined,
      ipcRenderer: undefined,
      process: undefined,
    };
  });

  afterEach(() => {
    (global as any).window = originalWindow;
    vi.restoreAllMocks();
  });

  describe('isElectron() & isNativeDirectorySupported()', () => {
    it('returns false when window has no electron bridges', () => {
      expect(isElectron()).toBe(false);
      expect(isNativeDirectorySupported()).toBe(false);
    });

    it('returns true when window.electronAPI is present', () => {
      (global as any).window.electronAPI = {};
      expect(isElectron()).toBe(true);
      expect(isNativeDirectorySupported()).toBe(true);
    });

    it('returns true when window.ipcRenderer is present', () => {
      (global as any).window.ipcRenderer = {};
      expect(isElectron()).toBe(true);
      expect(isNativeDirectorySupported()).toBe(true);
    });

    it('returns true when process.versions.electron is set', () => {
      (global as any).window.process = { versions: { electron: '28.0.0' } };
      expect(isElectron()).toBe(true);
      expect(isNativeDirectorySupported()).toBe(true);
    });
  });

  describe('saveFilesToLocalDirectory()', () => {
    it('returns error when files array is empty or null', async () => {
      const res1 = await saveFilesToLocalDirectory([]);
      expect(res1.success).toBe(false);
      expect(res1.error).toContain('No files provided');

      const res2 = await saveFilesToLocalDirectory(null as any);
      expect(res2.success).toBe(false);
    });

    it('strictly throws an error if called in a standard non-Electron browser', async () => {
      (global as any).window.electronAPI = undefined;
      const files: FileToSave[] = [
        { name: 'test.csv', data: 'col1,col2\nval1,val2' },
      ];

      await expect(saveFilesToLocalDirectory(files)).rejects.toThrow(
        'This application must run in the Electron Desktop Client'
      );
    });

    it('converts various data types (string, Uint8Array, Blob) to ArrayBuffers and calls electronAPI.saveFiles', async () => {
      const mockSaveFiles = vi.fn().mockResolvedValue({
        success: true,
        savedCount: 3,
      });

      (global as any).window.electronAPI = {
        saveFiles: mockSaveFiles,
      };

      const files: FileToSave[] = [
        { name: 'data.csv', data: 'hello,world' },
        { name: 'binary.bin', data: new Uint8Array([1, 2, 3, 4]) },
        { name: 'blob.txt', data: new Blob(['blob content'], { type: 'text/plain' }) },
      ];

      const res = await saveFilesToLocalDirectory(files, { folderName: 'MyExports' });

      expect(res.success).toBe(true);
      expect(res.savedCount).toBe(3);
      expect(mockSaveFiles).toHaveBeenCalledTimes(1);

      const [preparedFiles, folderName] = mockSaveFiles.mock.calls[0];
      expect(folderName).toBe('MyExports');
      expect(preparedFiles).toHaveLength(3);
      expect(preparedFiles[0].name).toBe('data.csv');
      expect(preparedFiles[0].buffer instanceof ArrayBuffer).toBe(true);
      expect(preparedFiles[1].name).toBe('binary.bin');
      expect(preparedFiles[1].buffer instanceof ArrayBuffer).toBe(true);
      expect(preparedFiles[2].name).toBe('blob.txt');
      expect(preparedFiles[2].buffer instanceof ArrayBuffer).toBe(true);
    });

    it('handles native directory selection cancellation gracefully', async () => {
      const mockSaveFiles = vi.fn().mockResolvedValue({
        success: false,
        canceled: true,
        savedCount: 0,
      });

      (global as any).window.electronAPI = {
        saveFiles: mockSaveFiles,
      };

      const files: FileToSave[] = [{ name: 'test.csv', data: 'content' }];
      const res = await saveFilesToLocalDirectory(files);

      expect(res.success).toBe(false);
      expect(res.canceled).toBe(true);
      expect(res.savedCount).toBe(0);
    });

    it('handles native disk write errors gracefully', async () => {
      const mockSaveFiles = vi.fn().mockResolvedValue({
        success: false,
        error: 'EACCES: permission denied',
        savedCount: 0,
      });

      (global as any).window.electronAPI = {
        saveFiles: mockSaveFiles,
      };

      const files: FileToSave[] = [{ name: 'locked.csv', data: 'content' }];
      const res = await saveFilesToLocalDirectory(files);

      expect(res.success).toBe(false);
      expect(res.error).toBe('EACCES: permission denied');
    });
  });
});

describe('Native Secure Storage Bridge (secureStorage.ts)', () => {
  beforeEach(() => {
    (global as any).window = {};
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('isSecureStorageAvailable() reports true only when native bridge exists', async () => {
    expect(await isSecureStorageAvailable()).toBe(false);

    (global as any).window.electronAPI = {
      secureStorage: {
        isAvailable: vi.fn().mockResolvedValue(true),
      },
    };
    expect(await isSecureStorageAvailable()).toBe(true);
  });

  it('encryptSecret() encrypts plaintext with enc: prefix via DPAPI bridge', async () => {
    (global as any).window.electronAPI = {
      secureStorage: {
        encrypt: vi.fn().mockImplementation(async (plain: string) => `enc:${Buffer.from(plain).toString('base64')}`),
      },
    };

    const encrypted = await encryptSecret('my-super-secret-api-key');
    expect(encrypted.startsWith('enc:')).toBe(true);
    expect(encrypted).not.toContain('my-super-secret-api-key');

    // Should return original if already encrypted
    const reEncrypted = await encryptSecret('enc:already_encrypted_payload');
    expect(reEncrypted).toBe('enc:already_encrypted_payload');

    // Should handle empty strings
    expect(await encryptSecret('')).toBe('');
  });

  it('decryptSecret() decrypts enc: payloads back to plaintext', async () => {
    (global as any).window.electronAPI = {
      secureStorage: {
        decrypt: vi.fn().mockImplementation(async (cipher: string) => {
          const b64 = cipher.slice(4);
          return Buffer.from(b64, 'base64').toString('utf8');
        }),
      },
    };

    const cipher = `enc:${Buffer.from('hello-decrypted-world').toString('base64')}`;
    const decrypted = await decryptSecret(cipher);
    expect(decrypted).toBe('hello-decrypted-world');

    // Should return original if not encrypted
    const plainPassthrough = await decryptSecret('plain-api-key');
    expect(plainPassthrough).toBe('plain-api-key');

    // Should handle empty strings
    expect(await decryptSecret('')).toBe('');
  });

  it('encryptSecret & decryptSecret fall back gracefully if native bridge fails', async () => {
    (global as any).window.electronAPI = {
      secureStorage: {
        encrypt: vi.fn().mockRejectedValue(new Error('DPAPI failure')),
        decrypt: vi.fn().mockRejectedValue(new Error('Decryption failure')),
      },
    };

    // Should not throw, should return fallback string
    const fallbackPlain = await encryptSecret('my-plain-key');
    expect(fallbackPlain).toBe('my-plain-key');

    const fallbackCipher = await decryptSecret('enc:broken');
    expect(fallbackCipher).toBe('enc:broken');
  });
});
