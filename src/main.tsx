import './lib/domPolyfill'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import { ErrorBoundary } from './components/ErrorBoundary'
import { LanguageProvider } from './context/LanguageContext'

import { invokeFallbackDbRpc } from './db'

// Conditional Browser Preview Fallback:
// When running outside the Electron wrapper (e.g., normal browser / AI Studio Preview),
// polyfill window.electronAPI with safe async fallbacks matching preload.cjs signatures.
if (typeof window !== 'undefined' && typeof window.electronAPI === 'undefined') {
  let mockMaximized = false

  window.electronAPI = {
    isElectron: true,
    selectDirectory: async (options) => ({
      canceled: false,
      path: options?.defaultPath || 'C:\\Users\\Studio\\Documents\\StockFlow\\Master_Vault',
    }),
    saveFiles: async (files, folderName) => ({
      success: true,
      savedCount: Array.isArray(files) ? files.length : 0,
      targetDir: `C:\\Users\\Studio\\Documents\\StockFlow\\Export_Baskets\\${folderName || 'Export'}`,
      canceled: false,
    }),
    minimizeWindow: () => {},
    maximizeWindow: () => {
      mockMaximized = !mockMaximized
    },
    closeWindow: () => {},
    isMaximized: async () => mockMaximized,
    // Returns success: false in browser preview so epsEngine.ts seamlessly falls back to Tier 1 Web Worker rasterization
    rasterizeEpsNative: async () => ({
      success: false,
      error: 'Native Ghostscript unavailable in browser preview; using Web Worker fallback.',
    }),
    scanMasterDirectory: async (masterPath) => ({
      success: true,
      masterPath: masterPath || 'C:\\Users\\Studio\\Documents\\StockFlow\\Master_Vault',
      mediaBatches: {
        Photos: [],
        Videos: [],
        Vectors: [],
      },
      batches: [],
      latestBatch: null,
    }),
    saveBatchFiles: async (masterDir, files) => ({
      success: true,
      savedCount: Array.isArray(files) ? files.length : 0,
      masterDir: masterDir || 'C:\\Users\\Studio\\Documents\\StockFlow\\Master_Vault',
      foldersCreated: ['Photos/B01', 'Videos/B01', 'Vectors/B01'],
    }),
    showItemInFolder: async () => ({ success: true }),
    openPath: async () => ({ success: true }),
    quarantineFile: async (payload) => {
      const filePath = typeof payload === 'string' ? payload : payload?.filePath || ''
      return {
        success: true,
        moved: true,
        targetPath: `${filePath}.quarantined`,
        targetDir: 'C:\\Users\\Studio\\Documents\\StockFlow\\_Needs_Fixing',
      }
    },
    secureStorage: {
      isAvailable: async () => false,
      encrypt: async (plainText) => btoa(plainText),
      decrypt: async (cipherText) => {
        try {
          return atob(cipherText)
        } catch {
          return cipherText
        }
      },
    },
    getPathForFile: (file) => (file as unknown as { path?: string })?.path || file?.name || '',
    db: {
      invoke: async (method: string, ...args: any[]) => {
        return await invokeFallbackDbRpc(method, ...args)
      },
    },
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <LanguageProvider>
        <App />
      </LanguageProvider>
    </ErrorBoundary>
  </StrictMode>,
)
