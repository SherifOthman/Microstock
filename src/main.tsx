import './lib/domPolyfill'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import { ErrorBoundary } from './components/ErrorBoundary'
import { LanguageProvider } from './context/LanguageContext'

// Conditional Browser Preview Fallback:
// When running outside the Electron wrapper (e.g., normal browser / AI Studio Preview),
// polyfill window.electronAPI with safe async fallbacks matching preload.cjs signatures.
if (typeof window !== 'undefined' && typeof window.electronAPI === 'undefined') {
  let mockMaximized = false
  const previewStore = {
    masterRecords: new Map<string, any>(),
    apiKeys: new Map<string, any>(),
    batches: new Map<string, any>(),
    settings: new Map<string, { key: string; value: any }>(),
  }

  try {
    const savedKeys = localStorage.getItem('stockflow_sqlite_preview_keys')
    if (savedKeys) {
      for (const k of JSON.parse(savedKeys)) {
        if (k?.id) previewStore.apiKeys.set(k.id, k)
      }
    }
    const savedSettings = localStorage.getItem('stockflow_sqlite_preview_settings')
    if (savedSettings) {
      for (const s of JSON.parse(savedSettings)) {
        if (s?.key) previewStore.settings.set(s.key, s)
      }
    }
  } catch {
    // ignore storage errors
  }

  const persistPreviewKeys = () => {
    try {
      localStorage.setItem(
        'stockflow_sqlite_preview_keys',
        JSON.stringify(Array.from(previewStore.apiKeys.values()))
      )
    } catch {
      // ignore
    }
  }

  const persistPreviewSettings = () => {
    try {
      localStorage.setItem(
        'stockflow_sqlite_preview_settings',
        JSON.stringify(Array.from(previewStore.settings.values()))
      )
    } catch {
      // ignore
    }
  }

  window.electronAPI = {
    isElectron: true,
    selectDirectory: async (options) => ({
      canceled: false,
      path: options?.defaultPath || 'C:\\Users\\Studio\\Microstock_Master',
    }),
    saveFiles: async (files, folderName) => ({
      success: true,
      savedCount: Array.isArray(files) ? files.length : 0,
      targetDir: `C:\\Users\\Studio\\Downloads\\${folderName || 'Export'}`,
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
      masterPath: masterPath || 'C:\\Users\\Studio\\Microstock_Master',
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
      masterDir: masterDir || 'C:\\Users\\Studio\\Microstock_Master',
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
        targetDir: 'C:\\Users\\Studio\\Microstock_Master\\_Needs_Fixing',
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
        switch (method) {
          case 'getDbInfo':
            return {
              dbPath: 'C:\\Users\\Studio\\Documents\\StockFlow\\stockflow.sqlite',
              engine: 'browser-preview-sqlite-mock',
            }
          case 'getMasterRecords':
            return Array.from(previewStore.masterRecords.values()).sort(
              (a, b) => (a.createdAt || 0) - (b.createdAt || 0)
            )
          case 'getMasterRecord':
            return previewStore.masterRecords.get(args[0])
          case 'countMasterRecords':
            return previewStore.masterRecords.size
          case 'putMasterRecord': {
            const rec = args[0]
            previewStore.masterRecords.set(rec.id, { ...rec })
            return rec.id
          }
          case 'bulkPutMasterRecords': {
            for (const r of args[0] || []) {
              previewStore.masterRecords.set(r.id, { ...r })
            }
            return
          }
          case 'updateMasterRecord': {
            const [id, changes] = args
            const existing = previewStore.masterRecords.get(id)
            if (!existing) return 0
            previewStore.masterRecords.set(id, { ...existing, ...changes, id })
            return 1
          }
          case 'modifyAllMasterRecords': {
            const changes = args[0] || {}
            for (const [id, rec] of previewStore.masterRecords.entries()) {
              previewStore.masterRecords.set(id, { ...rec, ...changes })
            }
            return
          }
          case 'deleteMasterRecord':
            previewStore.masterRecords.delete(args[0])
            return
          case 'bulkDeleteMasterRecords':
            for (const id of args[0] || []) previewStore.masterRecords.delete(id)
            return
          case 'clearMasterRecords':
            previewStore.masterRecords.clear()
            return
          case 'getApiKeys':
            return Array.from(previewStore.apiKeys.values()).sort(
              (a, b) => (a.createdAt || 0) - (b.createdAt || 0)
            )
          case 'getApiKey':
            return previewStore.apiKeys.get(args[0])
          case 'putApiKey': {
            const rec = args[0]
            previewStore.apiKeys.set(rec.id, { ...rec })
            persistPreviewKeys()
            return rec.id
          }
          case 'bulkPutApiKeys': {
            for (const r of args[0] || []) {
              previewStore.apiKeys.set(r.id, { ...r })
            }
            persistPreviewKeys()
            return
          }
          case 'updateApiKey': {
            const [id, changes] = args
            const existing = previewStore.apiKeys.get(id)
            if (!existing) return 0
            previewStore.apiKeys.set(id, { ...existing, ...changes, id })
            persistPreviewKeys()
            return 1
          }
          case 'deleteApiKey':
            previewStore.apiKeys.delete(args[0])
            persistPreviewKeys()
            return
          case 'deleteApiKeysByProvider': {
            const providerId = args[0]
            for (const [id, rec] of previewStore.apiKeys.entries()) {
              if (rec.providerId === providerId) previewStore.apiKeys.delete(id)
            }
            persistPreviewKeys()
            return
          }
          case 'clearApiKeys':
            previewStore.apiKeys.clear()
            persistPreviewKeys()
            return
          case 'getBatches':
            return Array.from(previewStore.batches.values()).sort(
              (a, b) => (a.createdAt || 0) - (b.createdAt || 0)
            )
          case 'getBatch':
            return previewStore.batches.get(args[0])
          case 'putBatch': {
            const rec = args[0]
            previewStore.batches.set(rec.id, { ...rec })
            return rec.id
          }
          case 'deleteBatch':
            previewStore.batches.delete(args[0])
            return
          case 'clearBatches':
            previewStore.batches.clear()
            return
          case 'getSetting':
            return previewStore.settings.get(args[0])
          case 'putSetting': {
            const item = args[0]
            previewStore.settings.set(item.key, { key: item.key, value: item.value })
            persistPreviewSettings()
            return item.key
          }
          case 'clearSettings':
            previewStore.settings.clear()
            persistPreviewSettings()
            return
          default:
            return undefined
        }
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
