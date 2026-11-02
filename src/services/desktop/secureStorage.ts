/**
 * Native Secure Storage Bridge for Electron Desktop
 *
 * Encrypts sensitive secrets (API keys) on disk using Windows DPAPI
 * (via Electron's `safeStorage` API). Secrets are decrypted in-memory
 * only when an active HTTP API call is being dispatched.
 */

export async function isSecureStorageAvailable(): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  try {
    return Boolean(await window.electronAPI?.secureStorage?.isAvailable());
  } catch {
    return false;
  }
}

/**
 * Encrypts a plaintext secret into an OS-level encrypted cipher payload prefixed with `enc:`.
 * If native secureStorage is unavailable, falls back gracefully.
 */
export async function encryptSecret(plainText: string): Promise<string> {
  if (!plainText) return '';
  if (plainText.startsWith('enc:')) return plainText; // already encrypted

  if (typeof window !== 'undefined' && window.electronAPI?.secureStorage?.encrypt) {
    try {
      const encrypted = await window.electronAPI.secureStorage.encrypt(plainText);
      if (encrypted && encrypted.startsWith('enc:')) {
        return encrypted;
      }
    } catch (err) {
      console.warn('[SecureStorage] Native encryption failed:', err);
    }
  }

  return plainText;
}

/**
 * Decrypts an OS-level encrypted payload back into a plaintext string in-memory.
 */
export async function decryptSecret(cipherText: string): Promise<string> {
  if (!cipherText) return '';
  if (!cipherText.startsWith('enc:')) return cipherText; // already plaintext

  if (typeof window !== 'undefined' && window.electronAPI?.secureStorage?.decrypt) {
    try {
      return await window.electronAPI.secureStorage.decrypt(cipherText);
    } catch (err) {
      console.warn('[SecureStorage] Native decryption failed:', err);
    }
  }

  return cipherText;
}
