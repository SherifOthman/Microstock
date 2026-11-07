const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const SUPPORTED_AGENCIES = ['adobe', 'freepik', 'shutterstock', 'vecteezy', 'dreamstime', '123rf'];

const DEFAULT_REJECTION_REASONS = [
  {
    id: 'rej_tech_quality',
    agencyId: 'all',
    code: 'TECH_QUALITY',
    title: 'Technical Quality / Artifacts',
    description: 'Chromatic aberration, sensor noise, compression artifacts, or AI anatomy/blending flaws.',
    severity: 'fixable',
  },
  {
    id: 'rej_similar_content',
    agencyId: 'all',
    code: 'SIMILAR_DUPLICATE',
    title: 'Similar / Duplicate Submission',
    description: 'Asset is too visually or conceptually similar to files already in queue or portfolio.',
    severity: 'standard',
  },
  {
    id: 'rej_ip_trademark',
    agencyId: 'all',
    code: 'IP_TRADEMARK',
    title: 'Intellectual Property / Trademark',
    description: 'Contains recognizable brand logos, copyrighted designs, or protected architecture.',
    severity: 'permanent_ban_risk',
  },
  {
    id: 'rej_missing_release',
    agencyId: 'all',
    code: 'MISSING_RELEASE',
    title: 'Missing Model / Property Release',
    description: 'Recognizable face or private property requires a signed release or Editorial flag.',
    severity: 'fixable',
  },
  {
    id: 'rej_metadata_mismatch',
    agencyId: 'all',
    code: 'METADATA_SPAM',
    title: 'Title / Keyword Inaccuracy',
    description: 'Irrelevant keywords, brand names in tags, or missing generative AI flag.',
    severity: 'fixable',
  },
  {
    id: 'rej_low_commercial_value',
    agencyId: 'all',
    code: 'COMMERCIAL_VALUE',
    title: 'Non-Commercial / Low Demand',
    description: 'Composition or subject matter does not meet current agency commercial demand.',
    severity: 'standard',
  },
];

function toLocalDayKey(timestampMs) {
  const d = new Date(timestampMs);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * StockFlow Dual-SQLite Relational Engine (Main Process)
 * 1. `userdata.sqlite`     — Permanent user portfolio, metadata, agency tracking, API keys, FTP profiles, settings.
 * 2. `local_queues.sqlite` — Ephemeral high-frequency task queues (completely ignored during backups).
 *
 * Enforces:
 * - Zero Base64 Bloat (only relative local file paths stored, served via `stockflow://local?path=`)
 * - Relative Path Management anchored to the configurable Master Workspace Folder
 * - Smart Once-Per-Day Dirty-Flag Backup on `app-quit` with 7-Day Rolling Retention & Custom Backup Path
 */
class SqliteDatabaseManager {
  constructor(customBaseDir = null) {
    this.db = null;
    this.queuesDb = null;
    this.baseDir = typeof customBaseDir === 'string' ? customBaseDir : '';
    this.dbPath = '';
    this.queuesDbPath = '';
    this.masterVaultDir = '';
    this.previewsDir = '';
    this.tempStagingDir = '';
    this.exportBasketsDir = '';
    this.backupsDir = '';
    this.isNativeSqlite = false;
    this.isUserDataDirty = false;
    this.lastMutationAt = 0;
    this.backupRetentionDays = 7;
    this.maxBackupRetention = 30;
    this.memoryFallback = {
      masterRecords: new Map(),
      agencyTracking: new Map(), // key: `${assetId}::${agencyId}`
      rejectionDictionary: new Map(),
      exportBaskets: new Map(),
      backupLogs: [],
      apiKeys: new Map(),
      batches: new Map(),
      settings: new Map(),
      ftpProfiles: new Map(),
      ftpSessions: new Map(),
      ftpTransferLogs: [],
      persistentTaskQueues: new Map(),
    };
    this._seedMemoryFallbackDefaults();
  }

  _seedMemoryFallbackDefaults() {
    const now = Date.now();
    for (const r of DEFAULT_REJECTION_REASONS) {
      this.memoryFallback.rejectionDictionary.set(r.id, {
        ...r,
        usageCount: 0,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      });
    }
    this.memoryFallback.ftpProfiles.set('dreamstime', {
      agencyId: 'dreamstime',
      protocol: 'ftp',
      host: 'upload.dreamstime.com',
      port: 21,
      username: '',
      encryptedPassword: '',
      hasSavedPassword: false,
      passiveMode: true,
      updatedAt: now,
    });
  }

  markDirty() {
    this.isUserDataDirty = true;
    this.lastMutationAt = Date.now();
  }

  init(app = null, customBaseDir = null) {
    if (typeof app === 'string' && !customBaseDir) {
      customBaseDir = app;
      app = null;
    }
    if (this.db && !customBaseDir) return;

    let baseDir = customBaseDir || this.baseDir || '';
    if (!baseDir) {
      try {
        const docsDir = app.getPath('documents');
        baseDir = path.join(docsDir, 'StockFlow');
        fs.mkdirSync(baseDir, { recursive: true });
      } catch {
        baseDir = app ? app.getPath('userData') : path.join(process.cwd(), '.stockflow_data');
        fs.mkdirSync(baseDir, { recursive: true });
      }
    } else {
      fs.mkdirSync(baseDir, { recursive: true });
    }

    this.baseDir = baseDir;
    this.dbPath = path.join(baseDir, 'userdata.sqlite');
    this.queuesDbPath = path.join(baseDir, 'local_queues.sqlite');
    this.ftpProfilesVaultPath = path.join(baseDir, 'ftp_profiles_vault.json');
    this.masterVaultDir = path.join(baseDir, 'Master_Vault');
    this.previewsDir = path.join(this.masterVaultDir, '.stockflow_previews');
    this.tempStagingDir = path.join(baseDir, '.stockflow_temp');
    this.exportBasketsDir = path.join(baseDir, 'Export_Baskets');
    this.backupsDir = path.join(baseDir, 'backups');

    // Retire legacy bloated `stockflow.sqlite` if present so we start fresh with clean `userdata.sqlite`
    for (const legacySuffix of ['', '-wal', '-shm']) {
      const legacyFile = path.join(baseDir, `stockflow.sqlite${legacySuffix}`);
      if (fs.existsSync(legacyFile)) {
        try {
          fs.unlinkSync(legacyFile);
        } catch {
          // ignore if locked
        }
      }
    }

    for (const dir of [
      this.masterVaultDir,
      this.previewsDir,
      this.tempStagingDir,
      this.exportBasketsDir,
      this.backupsDir,
    ]) {
      try {
        fs.mkdirSync(dir, { recursive: true });
      } catch {
        // ignore
      }
    }

    try {
      const Database = require('better-sqlite3');
      // 1. Open permanent database: userdata.sqlite
      this.db = new Database(this.dbPath);
      this.db.pragma('journal_mode = WAL');
      this.db.pragma('synchronous = NORMAL');
      this.db.pragma('foreign_keys = ON');

      // 2. Open ephemeral queue database: local_queues.sqlite
      this.queuesDb = new Database(this.queuesDbPath);
      this.queuesDb.pragma('journal_mode = WAL');
      this.queuesDb.pragma('synchronous = NORMAL');

      this.createSchema();
      this.createQueuesSchema();
      this.migrateColumnsIfNeeded();
      this.seedDefaultAgencies();
      this.seedDefaultRejectionDictionary();
      this.ensureAgencyTrackingForAllAssets();
      this.isNativeSqlite = true;

      // Hydrate persisted custom Master Workspace Folder & Custom Backup Directory
      this._hydrateCustomWorkspaceSettings();
      this.isUserDataDirty = false;
    } catch (err) {
      console.warn('[SQLite] Native better-sqlite3 unavailable, using in-memory relational fallback:', err.message);
      this.isNativeSqlite = false;
    }

    // Hydrate and synchronize FTP profiles between disk JSON vault and SQLite
    this._hydrateFtpProfilesVault();
  }

  _hydrateFtpProfilesVault() {
    try {
      if (this.ftpProfilesVaultPath && fs.existsSync(this.ftpProfilesVaultPath)) {
        const raw = fs.readFileSync(this.ftpProfilesVaultPath, 'utf8');
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          for (const [agencyId, prof] of Object.entries(parsed)) {
            if (prof && typeof prof === 'object') {
              this.memoryFallback.ftpProfiles.set(agencyId, {
                ...prof,
                agencyId,
                hasSavedPassword: Boolean(prof.encryptedPassword && prof.encryptedPassword.length > 0),
              });
            }
          }
        }
      }
    } catch (err) {
      console.warn('[SQLite] Failed to read ftp_profiles_vault.json:', err.message);
    }

    if (this.isNativeSqlite && this.db) {
      try {
        const rows = this.db.prepare('SELECT * FROM ftp_profiles').all();
        const sqliteByAgency = new Map();
        for (const row of rows) {
          const spec = this.getDefaultFtpAgencySpec(row.agency_id);
          const mapped = {
            agencyId: row.agency_id,
            protocol: row.protocol || spec.protocol,
            host: row.host || spec.host,
            port: Number(row.port) || spec.port,
            username: row.username || '',
            encryptedPassword: row.encrypted_password || '',
            hasSavedPassword: Boolean(row.encrypted_password && row.encrypted_password.length > 0),
            passiveMode: Boolean(row.passive_mode),
            lastVerifiedAt: row.last_verified_at || null,
            updatedAt: row.updated_at || Date.now(),
          };
          sqliteByAgency.set(row.agency_id, mapped);
          const vaultEntry = this.memoryFallback.ftpProfiles.get(row.agency_id);
          if (
            !vaultEntry ||
            ((mapped.username || mapped.encryptedPassword) &&
              (!vaultEntry.username || (mapped.updatedAt || 0) >= (vaultEntry.updatedAt || 0)))
          ) {
            this.memoryFallback.ftpProfiles.set(row.agency_id, mapped);
          }
        }

        // Sync any vault entries back into SQLite if missing or newer in vault
        for (const [agencyId, vaultProf] of this.memoryFallback.ftpProfiles.entries()) {
          const sqlRow = sqliteByAgency.get(agencyId);
          const vaultHasCreds = Boolean(vaultProf.username || vaultProf.encryptedPassword);
          const sqlHasCreds = Boolean(sqlRow && (sqlRow.username || sqlRow.encryptedPassword));
          if (
            vaultHasCreds &&
            (!sqlHasCreds || (vaultProf.updatedAt || 0) > (sqlRow?.updatedAt || 0))
          ) {
            const spec = this.getDefaultFtpAgencySpec(agencyId);
            this.db
              .prepare(`
                INSERT OR REPLACE INTO ftp_profiles (
                  agency_id, protocol, host, port, username, encrypted_password,
                  passive_mode, last_verified_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
              `)
              .run(
                agencyId,
                vaultProf.protocol || spec.protocol,
                vaultProf.host || spec.host,
                Number(vaultProf.port) || spec.port,
                vaultProf.username || '',
                vaultProf.encryptedPassword || '',
                vaultProf.passiveMode !== false ? 1 : 0,
                vaultProf.lastVerifiedAt || null,
                vaultProf.updatedAt || Date.now()
              );
          }
        }
      } catch (err) {
        console.warn('[SQLite] Failed to sync FTP profiles with SQLite:', err.message);
      }
    }

    this._persistFtpProfilesVault();
  }

  _persistFtpProfilesVault() {
    if (!this.ftpProfilesVaultPath) return;
    try {
      const out = {};
      for (const [agencyId, prof] of this.memoryFallback.ftpProfiles.entries()) {
        if (prof && (prof.username || prof.encryptedPassword)) {
          out[agencyId] = prof;
        }
      }
      fs.writeFileSync(this.ftpProfilesVaultPath, JSON.stringify(out, null, 2), 'utf8');
    } catch (err) {
      console.warn('[SQLite] Failed to write ftp_profiles_vault.json:', err.message);
    }
  }

  _hydrateCustomWorkspaceSettings() {
    try {
      const savedMaster = this.getSetting('master_workspace_folder');
      if (savedMaster?.value && typeof savedMaster.value === 'string' && savedMaster.value.trim()) {
        const candidate = path.resolve(savedMaster.value.trim());
        try {
          fs.mkdirSync(candidate, { recursive: true });
          this.masterVaultDir = candidate;
          this.previewsDir = path.join(this.masterVaultDir, '.stockflow_previews');
          fs.mkdirSync(this.previewsDir, { recursive: true });
        } catch {
          // keep default if inaccessible
        }
      }

      const savedBackup = this.getSetting('custom_backup_dir');
      if (savedBackup?.value && typeof savedBackup.value === 'string' && savedBackup.value.trim()) {
        const candidate = path.resolve(savedBackup.value.trim());
        try {
          fs.mkdirSync(candidate, { recursive: true });
          this.backupsDir = candidate;
        } catch {
          // keep default if inaccessible
        }
      }
    } catch {
      // ignore hydration errors
    }
  }

  close() {
    this._persistFtpProfilesVault();
    if (this.db) {
      try {
        this.db.pragma('wal_checkpoint(TRUNCATE)');
      } catch {}
      try {
        this.db.close();
      } catch {}
      this.db = null;
    }
    if (this.queuesDb) {
      try {
        this.queuesDb.pragma('wal_checkpoint(TRUNCATE)');
      } catch {}
      try {
        this.queuesDb.close();
      } catch {}
      this.queuesDb = null;
    }
  }

  // ============================================================================
  // Relative Path Management (Master Workspace Folder Portability)
  // ============================================================================
  toRelativeWorkspacePath(inputPath) {
    if (!inputPath || typeof inputPath !== 'string') return null;
    const trimmed = inputPath.trim();
    if (!trimmed) return null;

    // Already relative
    if (!path.isAbsolute(trimmed) && !/^[a-zA-Z]:[\\/]/.test(trimmed)) {
      return trimmed.replace(/\\/g, '/').replace(/^\/+/, '');
    }

    const normalizedInput = path.normalize(trimmed);

    // 1. Check if inside current masterVaultDir
    if (this.masterVaultDir) {
      const normalizedMaster = path.normalize(this.masterVaultDir);
      const relToMaster = path.relative(normalizedMaster, normalizedInput);
      if (relToMaster && !relToMaster.startsWith('..') && !path.isAbsolute(relToMaster)) {
        return relToMaster.replace(/\\/g, '/');
      }
    }

    // 2. Check if path contains a portable `Master_Vault/` marker from another machine/location
    const forwardInput = normalizedInput.replace(/\\/g, '/');
    const vaultMarkerIdx = forwardInput.indexOf('/Master_Vault/');
    if (vaultMarkerIdx !== -1) {
      return forwardInput.slice(vaultMarkerIdx + '/Master_Vault/'.length);
    }

    // 3. Check if inside baseDir
    if (this.baseDir) {
      const normalizedBase = path.normalize(this.baseDir);
      const relToBase = path.relative(normalizedBase, normalizedInput);
      if (relToBase && !relToBase.startsWith('..') && !path.isAbsolute(relToBase)) {
        return relToBase.replace(/\\/g, '/');
      }
    }

    // External source path outside the workspace (keep normalized path)
    return forwardInput;
  }

  toAbsoluteWorkspacePath(storedPath) {
    if (!storedPath || typeof storedPath !== 'string') return undefined;
    const trimmed = storedPath.trim();
    if (!trimmed) return undefined;

    const isAbs = path.isAbsolute(trimmed) || /^[a-zA-Z]:[\\/]/.test(trimmed);
    if (isAbs) {
      const norm = path.normalize(trimmed);
      if (fs.existsSync(norm)) {
        return norm;
      }
      // If an old absolute path from another PC/folder contains `/Master_Vault/`, relink dynamically
      const forward = norm.replace(/\\/g, '/');
      const marker = '/Master_Vault/';
      const idx = forward.indexOf(marker);
      if (idx !== -1 && this.masterVaultDir) {
        const relSub = forward.slice(idx + marker.length);
        return path.resolve(this.masterVaultDir, relSub);
      }
      return norm;
    }

    // Relative path: resolve against masterVaultDir first, then baseDir if needed
    const cleanRel = trimmed.replace(/^[/\\]+/, '');
    const masterRoot = this.masterVaultDir || path.join(this.baseDir || process.cwd(), 'Master_Vault');
    const candidateInMaster = path.resolve(masterRoot, cleanRel);
    if (fs.existsSync(candidateInMaster)) {
      return candidateInMaster;
    }

    if (this.baseDir) {
      const candidateInBase = path.resolve(this.baseDir, cleanRel);
      if (fs.existsSync(candidateInBase)) {
        return candidateInBase;
      }
    }

    return candidateInMaster;
  }

  buildStockflowProtocolUrl(fullDiskPath) {
    if (!fullDiskPath || typeof fullDiskPath !== 'string') return '';
    return `stockflow://local?path=${encodeURIComponent(fullDiskPath)}`;
  }

  /**
   * Saves a binary preview JPEG to `<masterVaultDir>/.stockflow_previews/<assetId>.jpg`
   * if a vector or video only has a buffer/base64 frame in memory, ensuring ZERO Base64 in SQLite.
   */
  _persistPreviewToDiskIfNeeded(assetId, previewBufferOrBase64) {
    if (!assetId || !previewBufferOrBase64) return null;
    try {
      const targetDir = this.previewsDir || path.join(this.masterVaultDir || process.cwd(), '.stockflow_previews');
      fs.mkdirSync(targetDir, { recursive: true });
      const safeId = String(assetId).replace(/[^a-zA-Z0-9_-]/g, '_');

      if (typeof previewBufferOrBase64 === 'string' && previewBufferOrBase64.startsWith('data:image/svg+xml')) {
        const commaIdx = previewBufferOrBase64.indexOf(',');
        if (commaIdx !== -1) {
          const payload = previewBufferOrBase64.slice(commaIdx + 1);
          const svgContent = previewBufferOrBase64.includes(';base64,')
            ? Buffer.from(payload, 'base64').toString('utf8')
            : decodeURIComponent(payload);
          if (svgContent && svgContent.includes('<svg')) {
            const svgFullPath = path.join(targetDir, `${safeId}.svg`);
            fs.writeFileSync(svgFullPath, svgContent, 'utf8');
            return this.toRelativeWorkspacePath(svgFullPath);
          }
        }
        return null;
      }

      let buf = null;
      if (Buffer.isBuffer(previewBufferOrBase64)) {
        buf = previewBufferOrBase64;
      } else if (previewBufferOrBase64 instanceof ArrayBuffer || ArrayBuffer.isView(previewBufferOrBase64)) {
        buf = Buffer.from(previewBufferOrBase64);
      } else if (typeof previewBufferOrBase64 === 'string' && previewBufferOrBase64.length > 0) {
        const rawB64 = previewBufferOrBase64.replace(/^data:image\/[^;]+;base64,/, '');
        if (rawB64.length >= 4) {
          buf = Buffer.from(rawB64, 'base64');
        }
      }
      if (!buf || buf.length === 0) return null;

      const previewFullPath = path.join(targetDir, `${safeId}.jpg`);
      fs.writeFileSync(previewFullPath, buf);
      return this.toRelativeWorkspacePath(previewFullPath);
    } catch {
      return null;
    }
  }

  createSchema() {
    if (!this.db) return;

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS assets (
        id TEXT PRIMARY KEY,
        batch_id TEXT,
        original_path TEXT,
        master_path TEXT,
        preview_path TEXT,
        filename TEXT NOT NULL,
        original_filename TEXT,
        file_hash TEXT,
        perceptual_hash TEXT,
        media_type TEXT DEFAULT 'image',
        mime_type TEXT,
        file_size INTEGER,
        compressed_size INTEGER,
        width INTEGER,
        height INTEGER,
        aspect_ratio TEXT,
        duration_seconds REAL,
        frame_rate REAL,
        codec TEXT,
        has_audio INTEGER DEFAULT 0,
        audio_muted_at INTEGER,
        eps_extracted_at INTEGER,
        resolution TEXT,
        color_space TEXT,
        thumbnail_base64 TEXT DEFAULT '',
        is_ai_generated INTEGER DEFAULT 1,
        ai_generator_model TEXT,
        base_title TEXT DEFAULT '',
        detailed_description TEXT DEFAULT '',
        keywords_json TEXT DEFAULT '[]',
        categories_json TEXT,
        metadata_json TEXT,
        pipeline_stage TEXT DEFAULT 'committed',
        status TEXT NOT NULL DEFAULT 'pending',
        error_message TEXT,
        ai_vision_score REAL,
        ai_flags_json TEXT,
        custom_attributes_json TEXT,
        is_archived INTEGER DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_assets_created_at ON assets(created_at);
      CREATE INDEX IF NOT EXISTS idx_assets_filename ON assets(filename);
      CREATE INDEX IF NOT EXISTS idx_assets_status ON assets(status);

      CREATE TABLE IF NOT EXISTS asset_metadata (
        asset_id TEXT PRIMARY KEY REFERENCES assets(id) ON DELETE CASCADE,
        base_title TEXT NOT NULL DEFAULT '',
        detailed_description TEXT NOT NULL DEFAULT '',
        keywords_json TEXT NOT NULL DEFAULT '[]',
        categories_json TEXT,
        is_ai_generated INTEGER NOT NULL DEFAULT 1,
        ai_provider TEXT,
        ai_model TEXT,
        ai_prompt TEXT,
        latency_ms INTEGER,
        attempt_history_json TEXT,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS api_keys (
        id TEXT PRIMARY KEY,
        provider_id TEXT NOT NULL,
        encrypted_key TEXT NOT NULL,
        label TEXT NOT NULL,
        model_id TEXT NOT NULL,
        rpm_limit INTEGER NOT NULL DEFAULT 15,
        rpd_limit INTEGER NOT NULL DEFAULT 1500,
        status TEXT NOT NULL DEFAULT 'healthy',
        cooldown_until INTEGER,
        exhausted_until INTEGER,
        daily_request_count INTEGER NOT NULL DEFAULT 0,
        daily_reset_timestamp INTEGER NOT NULL DEFAULT 0,
        last_used_at INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        record_json TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_api_keys_provider ON api_keys(provider_id);
      CREATE INDEX IF NOT EXISTS idx_api_keys_created ON api_keys(created_at);

      CREATE TABLE IF NOT EXISTS batches (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        status TEXT NOT NULL,
        total_count INTEGER NOT NULL DEFAULT 0,
        processed_count INTEGER NOT NULL DEFAULT 0,
        failed_count INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        record_json TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value_json TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS agencies (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        default_limit INTEGER NOT NULL DEFAULT 50,
        limit_period TEXT NOT NULL DEFAULT 'batch'
      );

      CREATE TABLE IF NOT EXISTS asset_distributions (
        asset_id TEXT NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
        agency_id TEXT NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
        upload_status TEXT NOT NULL DEFAULT 'not_uploaded',
        batch_folder TEXT,
        uploaded_at INTEGER,
        notes TEXT,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (asset_id, agency_id)
      );

      CREATE INDEX IF NOT EXISTS idx_distributions_agency_status
        ON asset_distributions(agency_id, upload_status);

      CREATE TABLE IF NOT EXISTS rejection_dictionary (
        id TEXT PRIMARY KEY,
        agency_id TEXT NOT NULL DEFAULT 'all',
        code TEXT,
        title TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        severity TEXT NOT NULL DEFAULT 'standard',
        usage_count INTEGER NOT NULL DEFAULT 0,
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        UNIQUE(agency_id, title)
      );

      CREATE INDEX IF NOT EXISTS idx_rejection_agency_active
        ON rejection_dictionary(agency_id, is_active);

      CREATE TABLE IF NOT EXISTS export_baskets (
        id TEXT PRIMARY KEY,
        agency_id TEXT NOT NULL,
        basket_name TEXT NOT NULL,
        staging_folder_path TEXT NOT NULL,
        csv_file_path TEXT,
        item_count INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'pending_reconciliation',
        created_at INTEGER NOT NULL,
        reconciled_at INTEGER
      );

      CREATE INDEX IF NOT EXISTS idx_baskets_agency_status
        ON export_baskets(agency_id, status);

      CREATE TABLE IF NOT EXISTS agency_tracking (
        id TEXT PRIMARY KEY,
        asset_id TEXT NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
        agency_id TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'New',
        export_basket_id TEXT REFERENCES export_baskets(id) ON DELETE SET NULL,
        staged_file_path TEXT,
        exported_filename TEXT,
        submission_batch_name TEXT,
        agency_asset_id TEXT,
        agency_url TEXT,
        rejection_reason_id TEXT REFERENCES rejection_dictionary(id) ON DELETE SET NULL,
        custom_rejection_note TEXT,
        rejection_count INTEGER NOT NULL DEFAULT 0,
        exported_at INTEGER,
        uploaded_at INTEGER,
        reviewed_at INTEGER,
        accepted_at INTEGER,
        rejected_at INTEGER,
        ftp_status TEXT,
        ftp_remote_path TEXT,
        ftp_last_attempt_at INTEGER,
        ftp_error_message TEXT,
        scraped_status_raw TEXT,
        scraped_downloads INTEGER NOT NULL DEFAULT 0,
        scraped_earnings_cents INTEGER NOT NULL DEFAULT 0,
        scraped_views INTEGER NOT NULL DEFAULT 0,
        last_scraped_at INTEGER,
        ai_flags TEXT,
        agency_metadata_override TEXT,
        notes TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        UNIQUE(asset_id, agency_id)
      );

      CREATE INDEX IF NOT EXISTS idx_tracking_agency_status
        ON agency_tracking(agency_id, status);
      CREATE INDEX IF NOT EXISTS idx_tracking_export_basket
        ON agency_tracking(export_basket_id);
      CREATE INDEX IF NOT EXISTS idx_tracking_rejection_reason
        ON agency_tracking(rejection_reason_id);

      CREATE TABLE IF NOT EXISTS backup_logs (
        id TEXT PRIMARY KEY,
        trigger_event TEXT NOT NULL,
        backup_file_path TEXT NOT NULL,
        file_size_bytes INTEGER NOT NULL DEFAULT 0,
        asset_count_snapshot INTEGER NOT NULL DEFAULT 0,
        duration_ms INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_backup_logs_created_at
        ON backup_logs(created_at);

      CREATE TABLE IF NOT EXISTS ftp_profiles (
        agency_id TEXT PRIMARY KEY,
        protocol TEXT NOT NULL DEFAULT 'ftp',
        host TEXT NOT NULL DEFAULT 'upload.dreamstime.com',
        port INTEGER NOT NULL DEFAULT 21,
        username TEXT NOT NULL DEFAULT '',
        encrypted_password TEXT NOT NULL DEFAULT '',
        passive_mode INTEGER NOT NULL DEFAULT 1,
        last_verified_at INTEGER,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS ftp_sessions (
        id TEXT PRIMARY KEY,
        agency_id TEXT NOT NULL DEFAULT 'dreamstime',
        mode TEXT NOT NULL DEFAULT 'live',
        status TEXT NOT NULL DEFAULT 'running',
        total_files INTEGER NOT NULL DEFAULT 0,
        succeeded_files INTEGER NOT NULL DEFAULT 0,
        failed_files INTEGER NOT NULL DEFAULT 0,
        total_bytes INTEGER NOT NULL DEFAULT 0,
        average_speed_bps INTEGER NOT NULL DEFAULT 0,
        started_at INTEGER NOT NULL,
        completed_at INTEGER
      );

      CREATE INDEX IF NOT EXISTS idx_ftp_sessions_started_at
        ON ftp_sessions(started_at DESC);

      CREATE TABLE IF NOT EXISTS ftp_transfer_logs (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL REFERENCES ftp_sessions(id) ON DELETE CASCADE,
        agency_id TEXT NOT NULL DEFAULT 'dreamstime',
        filename TEXT NOT NULL,
        local_path TEXT,
        file_size INTEGER NOT NULL DEFAULT 0,
        media_type TEXT NOT NULL DEFAULT 'image',
        remote_directory TEXT NOT NULL DEFAULT '/',
        remote_path TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'succeeded',
        retry_count INTEGER NOT NULL DEFAULT 0,
        error_code TEXT,
        error_message TEXT,
        duration_ms INTEGER NOT NULL DEFAULT 0,
        completed_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_ftp_transfer_logs_session
        ON ftp_transfer_logs(session_id, completed_at DESC);
    `);
  }

  /**
   * Ephemeral Queue Store Schema inside `local_queues.sqlite`
   * Completely separated from `userdata.sqlite` so temporary queues never bloat backups.
   */
  createQueuesSchema() {
    if (!this.queuesDb) return;
    this.queuesDb.exec(`
      CREATE TABLE IF NOT EXISTS persistent_task_queues (
        module_id TEXT PRIMARY KEY,
        session_id TEXT,
        batch_status TEXT NOT NULL DEFAULT 'idle',
        agency_id TEXT NOT NULL DEFAULT 'dreamstime',
        queue_json TEXT NOT NULL DEFAULT '[]',
        telemetry_json TEXT NOT NULL DEFAULT '{}',
        updated_at INTEGER NOT NULL
      );
    `);
  }

  migrateColumnsIfNeeded() {
    if (!this.db) return;
    const existingCols = new Set(
      this.db
        .prepare('PRAGMA table_info(assets)')
        .all()
        .map((c) => c.name)
    );

    const newColumns = [
      ['original_path', 'TEXT'],
      ['master_path', 'TEXT'],
      ['preview_path', 'TEXT'],
      ['original_filename', 'TEXT'],
      ['file_hash', 'TEXT'],
      ['perceptual_hash', 'TEXT'],
      ['mime_type', 'TEXT'],
      ['aspect_ratio', 'TEXT'],
      ['frame_rate', 'REAL'],
      ['codec', 'TEXT'],
      ['has_audio', 'INTEGER DEFAULT 0'],
      ['audio_muted_at', 'INTEGER'],
      ['eps_extracted_at', 'INTEGER'],
      ['color_space', 'TEXT'],
      ['is_ai_generated', 'INTEGER DEFAULT 1'],
      ['ai_generator_model', 'TEXT'],
      ['base_title', "TEXT DEFAULT ''"],
      ['detailed_description', "TEXT DEFAULT ''"],
      ['keywords_json', "TEXT DEFAULT '[]'"],
      ['categories_json', 'TEXT'],
      ['metadata_json', 'TEXT'],
      ['pipeline_stage', "TEXT DEFAULT 'committed'"],
      ['ai_vision_score', 'REAL'],
      ['ai_flags_json', 'TEXT'],
      ['custom_attributes_json', 'TEXT'],
      ['is_archived', 'INTEGER DEFAULT 0'],
    ];

    for (const [colName, colDef] of newColumns) {
      if (!existingCols.has(colName)) {
        try {
          this.db.exec(`ALTER TABLE assets ADD COLUMN ${colName} ${colDef}`);
        } catch (err) {
          console.warn(`[SQLite Migration] Column ${colName} skip:`, err.message);
        }
      }
    }

    // Enforce Zero-Base64 Rule on any existing rows if present
    try {
      this.db.exec(`UPDATE assets SET thumbnail_base64 = '' WHERE thumbnail_base64 != '' AND thumbnail_base64 IS NOT NULL;`);
      this.db.exec(`
        CREATE INDEX IF NOT EXISTS idx_assets_file_hash ON assets(file_hash);
        CREATE INDEX IF NOT EXISTS idx_assets_pipeline ON assets(status, pipeline_stage);
      `);
    } catch {
      // ignore
    }
  }

  seedDefaultAgencies() {
    if (!this.db) return;
    const stmt = this.db.prepare(`
      INSERT OR IGNORE INTO agencies (id, name, default_limit, limit_period)
      VALUES (?, ?, ?, ?)
    `);
    const defaults = [
      ['adobe', 'Adobe Stock', 50, 'batch'],
      ['freepik', 'Freepik', 20, 'daily'],
      ['shutterstock', 'Shutterstock', 100, 'batch'],
      ['vecteezy', 'Vecteezy', 30, 'daily'],
      ['dreamstime', 'Dreamstime', 50, 'weekly'],
      ['123rf', '123RF', 100, 'batch'],
    ];
    const tx = this.db.transaction(() => {
      for (const row of defaults) {
        stmt.run(...row);
      }
    });
    tx();
  }

  seedDefaultRejectionDictionary() {
    if (!this.db) return;
    const now = Date.now();
    const stmt = this.db.prepare(`
      INSERT OR IGNORE INTO rejection_dictionary (
        id, agency_id, code, title, description, severity, usage_count, is_active, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, 0, 1, ?, ?)
    `);
    const tx = this.db.transaction(() => {
      for (const item of DEFAULT_REJECTION_REASONS) {
        stmt.run(item.id, item.agencyId, item.code, item.title, item.description, item.severity, now, now);
      }
    });
    tx();
  }

  ensureAgencyTrackingForAllAssets() {
    if (!this.db) return;
    const now = Date.now();
    const assets = this.db.prepare('SELECT id FROM assets').all();
    if (assets.length === 0) return;

    const insertTracking = this.db.prepare(`
      INSERT OR IGNORE INTO agency_tracking (
        id, asset_id, agency_id, status, rejection_count,
        scraped_downloads, scraped_earnings_cents, scraped_views, created_at, updated_at
      ) VALUES (?, ?, ?, 'New', 0, 0, 0, 0, ?, ?)
    `);

    const tx = this.db.transaction(() => {
      for (const a of assets) {
        for (const agencyId of SUPPORTED_AGENCIES) {
          insertTracking.run(`${a.id}_${agencyId}`, a.id, agencyId, now, now);
        }
      }
    });
    tx();
  }

  // ============================================================================
  // Pillar 5: Smart Backup Engine (Once-Daily Dirty Flag + 7-Day Rolling Retention)
  // ============================================================================
  hasBackupToday(referenceMs = Date.now()) {
    const todayKey = toLocalDayKey(referenceMs);
    const recentLogs = this.getBackupLogs(10);
    for (const log of recentLogs) {
      if (log?.createdAt && toLocalDayKey(log.createdAt) === todayKey) {
        if (!this.isNativeSqlite || (log.backupFilePath && fs.existsSync(log.backupFilePath))) {
          return true;
        }
      }
    }
    return false;
  }

  /**
   * Executed automatically on `app-quit` (`before-quit`).
   * Only creates a backup if `userdata.sqlite` was modified (`isUserDataDirty === true`)
   * AND no backup has been created yet today.
   */
  performQuitBackupIfNeeded() {
    if (!this.isUserDataDirty) {
      return { skipped: true, reason: 'not_dirty' };
    }
    if (this.hasBackupToday()) {
      return { skipped: true, reason: 'already_backed_up_today' };
    }
    const log = this.performHotBackup('app_quit');
    return { skipped: false, backup: log, backupFilePath: log?.backupFilePath };
  }

  performHotBackup(triggerEvent = 'manual') {
    const startTime = Date.now();
    const validTrigger = triggerEvent || 'manual';

    if (!this.isNativeSqlite || !this.db || !this.dbPath) {
      const mockLog = {
        id: crypto.randomUUID(),
        triggerEvent: validTrigger,
        backupFilePath: path.join(this.backupsDir || '/backups', `userdata_backup_${startTime}_${validTrigger}.sqlite`),
        fileSizeBytes: 4096,
        assetCountSnapshot: this.memoryFallback.masterRecords.size,
        durationMs: 1,
        createdAt: startTime,
      };
      this.memoryFallback.backupLogs.unshift(mockLog);
      if (this.memoryFallback.backupLogs.length > this.maxBackupRetention) {
        this.memoryFallback.backupLogs.length = this.maxBackupRetention;
      }
      this.isUserDataDirty = false;
      return mockLog;
    }

    try {
      fs.mkdirSync(this.backupsDir, { recursive: true });

      // Flush WAL to userdata.sqlite safely before taking snapshot (local_queues.sqlite is completely ignored)
      try {
        this.db.pragma('wal_checkpoint(PASSIVE)');
      } catch {
        // ignore if busy
      }

      const isoStamp = new Date(startTime)
        .toISOString()
        .replace(/[:.]/g, '-')
        .replace('T', '_');
      const safeTrigger = String(validTrigger).replace(/[^a-zA-Z0-9_-]/g, '');
      const shortId = crypto.randomUUID().slice(0, 6);
      const backupFilename = `userdata_backup_${isoStamp}_${safeTrigger}_${shortId}.sqlite`;
      const backupFilePath = path.join(this.backupsDir, backupFilename);

      fs.copyFileSync(this.dbPath, backupFilePath);

      const stat = fs.statSync(backupFilePath);
      const assetCount = this.countMasterRecords();
      const durationMs = Math.max(1, Date.now() - startTime);

      const logRecord = {
        id: crypto.randomUUID(),
        triggerEvent: validTrigger,
        backupFilePath,
        fileSizeBytes: stat.size,
        assetCountSnapshot: assetCount,
        durationMs,
        createdAt: startTime,
      };

      this.db
        .prepare(`
          INSERT INTO backup_logs (
            id, trigger_event, backup_file_path, file_size_bytes, asset_count_snapshot, duration_ms, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `)
        .run(
          logRecord.id,
          logRecord.triggerEvent,
          logRecord.backupFilePath,
          logRecord.fileSizeBytes,
          logRecord.assetCountSnapshot,
          logRecord.durationMs,
          logRecord.createdAt
        );

      this.isUserDataDirty = false;

      // Rolling Retention Policy: Delete backups older than 7 days (and cap at maxBackupRetention)
      this.pruneOldBackups(this.backupRetentionDays, this.maxBackupRetention);

      return logRecord;
    } catch (err) {
      console.warn('[SQLite HotBackup] Backup warning:', err.message);
      return null;
    }
  }

  /**
   * Rolling Retention Policy:
   * - Deletes backup files older than `maxAgeDays` (default 7 days)
   * - Also enforces a hard ceiling of `maxFiles` (default 30 files)
   * - Always preserves at least the 1 newest backup file
   */
  pruneOldBackups(maxAgeDays = 7, maxFiles = 30) {
    if (!this.backupsDir || !fs.existsSync(this.backupsDir)) return 0;
    try {
      const now = Date.now();
      const maxAgeMs = Math.max(1, Number(maxAgeDays || 7)) * 24 * 60 * 60 * 1000;

      const files = fs
        .readdirSync(this.backupsDir)
        .filter(
          (f) =>
            (f.endsWith('.sqlite') || f.endsWith('.db')) &&
            f !== 'userdata.sqlite' &&
            f !== 'local_queues.sqlite' &&
            f !== 'stockflow.sqlite'
        )
        .map((name) => {
          const fullPath = path.join(this.backupsDir, name);
          const stat = fs.statSync(fullPath);
          return { name, fullPath, mtimeMs: stat.mtimeMs };
        })
        .sort((a, b) => b.mtimeMs - a.mtimeMs);

      let deleted = 0;
      for (let i = 0; i < files.length; i++) {
        const item = files[i];
        // Always keep the newest backup (index 0)
        if (i === 0) continue;
        const isExpiredByAge = now - item.mtimeMs > maxAgeMs;
        const isOverMaxCount = i >= maxFiles;
        if (isExpiredByAge || isOverMaxCount) {
          try {
            fs.unlinkSync(item.fullPath);
            deleted++;
          } catch {
            // ignore
          }
        }
      }
      return deleted;
    } catch {
      return 0;
    }
  }

  getBackupLogs(limit = 30) {
    if (!this.isNativeSqlite) {
      return this.memoryFallback.backupLogs.slice(0, limit);
    }
    const rows = this.db
      .prepare('SELECT * FROM backup_logs ORDER BY created_at DESC LIMIT ?')
      .all(limit);
    return rows.map((r) => ({
      id: r.id,
      triggerEvent: r.trigger_event,
      backupFilePath: r.backup_file_path,
      fileSizeBytes: r.file_size_bytes,
      assetCountSnapshot: r.asset_count_snapshot,
      durationMs: r.duration_ms,
      createdAt: r.created_at,
    }));
  }

  getWorkspacePaths() {
    let userDataSizeBytes = 0;
    let queuesSizeBytes = 0;
    try {
      if (this.dbPath && fs.existsSync(this.dbPath)) {
        userDataSizeBytes = fs.statSync(this.dbPath).size;
      }
      if (this.queuesDbPath && fs.existsSync(this.queuesDbPath)) {
        queuesSizeBytes = fs.statSync(this.queuesDbPath).size;
      }
    } catch {}

    return {
      baseDir: this.baseDir,
      dbPath: this.dbPath,
      queuesDbPath: this.queuesDbPath,
      masterVaultDir: this.masterVaultDir,
      tempStagingDir: this.tempStagingDir,
      exportBasketsDir: this.exportBasketsDir,
      backupsDir: this.backupsDir,
      isUserDataDirty: Boolean(this.isUserDataDirty),
      hasBackupToday: this.hasBackupToday(),
      userDataSizeBytes,
      queuesSizeBytes,
    };
  }

  setMasterWorkspaceFolder(folderPath) {
    if (!folderPath || typeof folderPath !== 'string' || !folderPath.trim()) {
      throw new Error('A valid Master Workspace Folder path is required.');
    }
    const resolved = path.resolve(folderPath.trim());
    fs.mkdirSync(resolved, { recursive: true });
    this.masterVaultDir = resolved;
    this.previewsDir = path.join(this.masterVaultDir, '.stockflow_previews');
    fs.mkdirSync(this.previewsDir, { recursive: true });

    this.putSetting({ key: 'master_workspace_folder', value: resolved });
    return this.getWorkspacePaths();
  }

  setCustomBackupDirectory(folderPath) {
    if (!folderPath || typeof folderPath !== 'string' || !folderPath.trim()) {
      throw new Error('A valid Custom Backup Directory path is required.');
    }
    const resolved = path.resolve(folderPath.trim());
    fs.mkdirSync(resolved, { recursive: true });
    this.backupsDir = resolved;

    this.putSetting({ key: 'custom_backup_dir', value: resolved });
    return this.getWorkspacePaths();
  }

  // ============================================================================
  // Row Mapping & Master Records (Zero Base64 + Dynamic Relative Path Resolution)
  // ============================================================================
  rowToMasterRecord(row, agencyMapForAsset = null) {
    if (!row) return undefined;
    let rankedKeywords = [];
    let categories = undefined;
    let attemptHistory = undefined;
    let aiFlags = undefined;

    const kwSource = row.m_keywords_json || row.keywords_json;
    const catSource = row.m_categories_json || row.categories_json;

    try {
      if (kwSource) rankedKeywords = JSON.parse(kwSource);
    } catch {
      rankedKeywords = [];
    }
    try {
      if (catSource) categories = JSON.parse(catSource);
    } catch {
      categories = undefined;
    }
    try {
      if (row.attempt_history_json) attemptHistory = JSON.parse(row.attempt_history_json);
    } catch {
      attemptHistory = undefined;
    }
    try {
      if (row.ai_flags_json) aiFlags = JSON.parse(row.ai_flags_json);
    } catch {
      aiFlags = undefined;
    }

    const videoMeta =
      row.duration_seconds != null || row.resolution != null || row.width != null || row.height != null || row.has_audio != null
        ? {
            durationSeconds: row.duration_seconds ?? undefined,
            resolution: row.resolution ?? undefined,
            width: row.width ?? undefined,
            height: row.height ?? undefined,
            hasAudio: Boolean(row.has_audio),
          }
        : undefined;

    const aiGenerationInfo =
      row.ai_prompt || row.ai_model || row.ai_provider || row.latency_ms != null || attemptHistory
        ? {
            prompt: row.ai_prompt || '',
            model: row.ai_model || '',
            provider: row.ai_provider ?? undefined,
            latencyMs: row.latency_ms ?? undefined,
            attemptHistory,
          }
        : undefined;

    const isAi =
      row.m_is_ai_generated !== undefined && row.m_is_ai_generated !== null
        ? Boolean(row.m_is_ai_generated)
        : Boolean(row.is_ai_generated ?? 1);

    // Dynamically construct full paths from stored relative paths
    const resolvedMasterPath = this.toAbsoluteWorkspacePath(row.master_path);
    const resolvedPreviewPath = this.toAbsoluteWorkspacePath(row.preview_path);
    const resolvedOriginalPath = this.toAbsoluteWorkspacePath(row.original_path);
    const isRenderableImagePath = (p) =>
      typeof p === 'string' && /\.(jpe?g|png|webp|gif|bmp|svg|avif)$/i.test(p.trim());

    const candidateImagePaths = [resolvedPreviewPath, resolvedMasterPath, resolvedOriginalPath].filter(
      (p) => p && isRenderableImagePath(p)
    );
    const existingImagePath =
      candidateImagePaths.find((p) => {
        try {
          return fs.existsSync(p);
        } catch {
          return false;
        }
      }) || candidateImagePaths[0];
    const primaryDiskPath = existingImagePath || resolvedPreviewPath || (row.media_type === 'image' ? resolvedMasterPath || resolvedOriginalPath : undefined);
    const previewUrl = primaryDiskPath ? this.buildStockflowProtocolUrl(primaryDiskPath) : '';

    let parsedMetadataJson = null;
    try {
      if (row.metadata_json) parsedMetadataJson = JSON.parse(row.metadata_json);
    } catch {
      parsedMetadataJson = null;
    }

    const rawBaseTitle = row.m_base_title ?? row.base_title ?? '';
    const longTitle = parsedMetadataJson?.longTitle || rawBaseTitle || '';
    const shortTitle =
      parsedMetadataJson?.shortTitle ||
      (rawBaseTitle.length < 100
        ? rawBaseTitle
        : rawBaseTitle.slice(0, 99).replace(/\s+\S*$/, '').trim());

    return {
      id: row.id,
      batchId: row.batch_id || '',
      filename: row.filename,
      originalFilename: row.original_filename ?? undefined,
      originalPath: resolvedOriginalPath,
      masterPath: resolvedMasterPath,
      previewPath: resolvedPreviewPath,
      relativeMasterPath: row.master_path ?? undefined,
      relativePreviewPath: row.preview_path ?? undefined,
      nativePath: resolvedMasterPath || resolvedOriginalPath || undefined,
      previewUrl: previewUrl || undefined,
      fileHash: row.file_hash ?? undefined,
      perceptualHash: row.perceptual_hash ?? undefined,
      fileSize: row.file_size ?? undefined,
      compressedSize: row.compressed_size ?? undefined,
      // Zero-Base64 Rule: Never store or emit Base64 blobs from SQLite
      thumbnailBase64: '',
      mediaType: row.media_type || 'image',
      videoMeta,
      isAiGenerated: isAi,
      baseTitle: rawBaseTitle || longTitle || shortTitle,
      shortTitle: shortTitle || undefined,
      longTitle: longTitle || undefined,
      detailedDescription: row.m_detailed_description ?? row.detailed_description ?? '',
      rankedKeywords,
      categories,
      aiGenerationInfo,
      pipelineStage: row.pipeline_stage || 'committed',
      status: row.status || 'completed',
      errorMessage: row.error_message ?? undefined,
      workspaceScope: parsedMetadataJson?.workspaceScope || undefined,
      aiVisionScore: row.ai_vision_score ?? undefined,
      aiFlags,
      agencyTrackings: agencyMapForAsset || undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  _buildAgencyTrackingMapForAssets() {
    const result = new Map();
    if (!this.isNativeSqlite) {
      for (const rec of this.memoryFallback.agencyTracking.values()) {
        if (!result.has(rec.assetId)) result.set(rec.assetId, {});
        const reason = rec.rejectionReasonId
          ? this.memoryFallback.rejectionDictionary.get(rec.rejectionReasonId)
          : undefined;
        result.get(rec.assetId)[rec.agencyId] = {
          ...rec,
          rejectionReasonTitle: reason ? reason.title : rec.rejectionReasonTitle,
        };
      }
      return result;
    }

    const rows = this.db
      .prepare(`
        SELECT
          t.*,
          r.title AS rejection_reason_title
        FROM agency_tracking t
        LEFT JOIN rejection_dictionary r ON t.rejection_reason_id = r.id
      `)
      .all();

    for (const r of rows) {
      if (!result.has(r.asset_id)) {
        result.set(r.asset_id, {});
      }
      result.get(r.asset_id)[r.agency_id] = {
        id: r.id,
        assetId: r.asset_id,
        agencyId: r.agency_id,
        status: r.status || 'New',
        exportBasketId: r.export_basket_id ?? undefined,
        stagedFilePath: r.staged_file_path ?? undefined,
        exportedFilename: r.exported_filename ?? undefined,
        submissionBatchName: r.submission_batch_name ?? undefined,
        agencyAssetId: r.agency_asset_id ?? undefined,
        agencyUrl: r.agency_url ?? undefined,
        rejectionReasonId: r.rejection_reason_id ?? undefined,
        rejectionReasonTitle: r.rejection_reason_title ?? undefined,
        customRejectionNote: r.custom_rejection_note ?? undefined,
        rejectionCount: r.rejection_count || 0,
        exportedAt: r.exported_at ?? undefined,
        uploadedAt: r.uploaded_at ?? undefined,
        reviewedAt: r.reviewed_at ?? undefined,
        acceptedAt: r.accepted_at ?? undefined,
        rejectedAt: r.rejected_at ?? undefined,
        ftpStatus: r.ftp_status ?? undefined,
        ftpRemotePath: r.ftp_remote_path ?? undefined,
        ftpLastAttemptAt: r.ftp_last_attempt_at ?? undefined,
        ftpErrorMessage: r.ftp_error_message ?? undefined,
        scrapedStatusRaw: r.scraped_status_raw ?? undefined,
        scrapedDownloads: r.scraped_downloads || 0,
        scrapedEarningsCents: r.scraped_earnings_cents || 0,
        scrapedViews: r.scraped_views || 0,
        lastScrapedAt: r.last_scraped_at ?? undefined,
        aiFlags: r.ai_flags ?? undefined,
        agencyMetadataOverride: r.agency_metadata_override ?? undefined,
        notes: r.notes ?? undefined,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      };
    }

    return result;
  }

  _ensureMemoryAgencyTrackingForAsset(assetId, now = Date.now()) {
    const trackingObj = {};
    for (const agencyId of SUPPORTED_AGENCIES) {
      const key = `${assetId}::${agencyId}`;
      if (!this.memoryFallback.agencyTracking.has(key)) {
        this.memoryFallback.agencyTracking.set(key, {
          id: `${assetId}_${agencyId}`,
          assetId,
          agencyId,
          status: 'New',
          rejectionCount: 0,
          scrapedDownloads: 0,
          scrapedEarningsCents: 0,
          scrapedViews: 0,
          createdAt: now,
          updatedAt: now,
        });
      }
      trackingObj[agencyId] = this.memoryFallback.agencyTracking.get(key);
    }
    return trackingObj;
  }

  upsertSingleMasterRecord(rec) {
    const now = Date.now();
    const createdAt = rec.createdAt || now;
    const kwJson = JSON.stringify(rec.rankedKeywords || []);
    const catJson = rec.categories ? JSON.stringify(rec.categories) : null;
    const isAiInt = rec.isAiGenerated === false ? 0 : 1;

    // Convert paths to portable relative paths inside Master Workspace Folder
    const relMasterPath = this.toRelativeWorkspacePath(rec.masterPath);
    const relOriginalPath = this.toRelativeWorkspacePath(rec.originalPath || rec.nativePath);
    let relPreviewPath = this.toRelativeWorkspacePath(rec.previewPath);

    // If an asset has no previewPath on disk yet, write its rasterized JPEG/SVG preview to .stockflow_previews
    // so local thumbnails always render even for vectors, videos, or dropped files, with ZERO Base64 in SQLite.
    if (!relPreviewPath && rec.thumbnailBase64) {
      relPreviewPath = this._persistPreviewToDiskIfNeeded(rec.id, rec.thumbnailBase64);
    }

    const effectiveLongTitle = rec.longTitle || rec.baseTitle || rec.shortTitle || '';
    const effectiveShortTitle =
      rec.shortTitle ||
      (effectiveLongTitle.length < 100
        ? effectiveLongTitle
        : effectiveLongTitle.slice(0, 99).replace(/\s+\S*$/, '').trim());
    const effectiveBaseTitle = rec.baseTitle || effectiveLongTitle || effectiveShortTitle || '';
    const metadataJson = JSON.stringify({
      shortTitle: effectiveShortTitle,
      longTitle: effectiveLongTitle,
      workspaceScope: rec.workspaceScope || undefined,
    });

    const upsertAsset = this.db.prepare(`
      INSERT INTO assets (
        id, batch_id, original_path, master_path, preview_path,
        filename, original_filename, file_hash, perceptual_hash,
        media_type, file_size, compressed_size,
        width, height, duration_seconds, has_audio, resolution, thumbnail_base64,
        is_ai_generated, base_title, detailed_description, keywords_json, categories_json, metadata_json,
        pipeline_stage, status, error_message, created_at, updated_at
      ) VALUES (
        @id, @batch_id, @original_path, @master_path, @preview_path,
        @filename, @original_filename, @file_hash, @perceptual_hash,
        @media_type, @file_size, @compressed_size,
        @width, @height, @duration_seconds, @has_audio, @resolution, '',
        @is_ai_generated, @base_title, @detailed_description, @keywords_json, @categories_json, @metadata_json,
        @pipeline_stage, @status, @error_message, @created_at, @updated_at
      )
      ON CONFLICT(id) DO UPDATE SET
        batch_id = excluded.batch_id,
        original_path = COALESCE(excluded.original_path, assets.original_path),
        master_path = COALESCE(excluded.master_path, assets.master_path),
        preview_path = COALESCE(excluded.preview_path, assets.preview_path),
        filename = excluded.filename,
        original_filename = COALESCE(excluded.original_filename, assets.original_filename),
        file_hash = COALESCE(excluded.file_hash, assets.file_hash),
        perceptual_hash = COALESCE(excluded.perceptual_hash, assets.perceptual_hash),
        media_type = excluded.media_type,
        file_size = COALESCE(excluded.file_size, assets.file_size),
        compressed_size = COALESCE(excluded.compressed_size, assets.compressed_size),
        width = COALESCE(excluded.width, assets.width),
        height = COALESCE(excluded.height, assets.height),
        duration_seconds = COALESCE(excluded.duration_seconds, assets.duration_seconds),
        has_audio = COALESCE(excluded.has_audio, assets.has_audio),
        resolution = COALESCE(excluded.resolution, assets.resolution),
        thumbnail_base64 = '',
        is_ai_generated = excluded.is_ai_generated,
        base_title = excluded.base_title,
        detailed_description = excluded.detailed_description,
        keywords_json = excluded.keywords_json,
        categories_json = COALESCE(excluded.categories_json, assets.categories_json),
        metadata_json = COALESCE(excluded.metadata_json, assets.metadata_json),
        pipeline_stage = COALESCE(excluded.pipeline_stage, assets.pipeline_stage),
        status = excluded.status,
        error_message = excluded.error_message,
        updated_at = excluded.updated_at
    `);

    const upsertMeta = this.db.prepare(`
      INSERT INTO asset_metadata (
        asset_id, base_title, detailed_description, keywords_json, categories_json,
        is_ai_generated, ai_provider, ai_model, ai_prompt, latency_ms,
        attempt_history_json, updated_at
      ) VALUES (
        @asset_id, @base_title, @detailed_description, @keywords_json, @categories_json,
        @is_ai_generated, @ai_provider, @ai_model, @ai_prompt, @latency_ms,
        @attempt_history_json, @updated_at
      )
      ON CONFLICT(asset_id) DO UPDATE SET
        base_title = excluded.base_title,
        detailed_description = excluded.detailed_description,
        keywords_json = excluded.keywords_json,
        categories_json = excluded.categories_json,
        is_ai_generated = excluded.is_ai_generated,
        ai_provider = excluded.ai_provider,
        ai_model = excluded.ai_model,
        ai_prompt = excluded.ai_prompt,
        latency_ms = excluded.latency_ms,
        attempt_history_json = excluded.attempt_history_json,
        updated_at = excluded.updated_at
    `);

    const insertAgencyTracking = this.db.prepare(`
      INSERT OR IGNORE INTO agency_tracking (
        id, asset_id, agency_id, status, rejection_count,
        scraped_downloads, scraped_earnings_cents, scraped_views, created_at, updated_at
      ) VALUES (?, ?, ?, 'New', 0, 0, 0, 0, ?, ?)
    `);

    upsertAsset.run({
      id: rec.id,
      batch_id: rec.batchId || '',
      original_path: relOriginalPath,
      master_path: relMasterPath,
      preview_path: relPreviewPath,
      filename: rec.filename || '',
      original_filename: rec.originalFilename || rec.filename || null,
      file_hash: rec.fileHash || null,
      perceptual_hash: rec.perceptualHash || null,
      media_type: rec.mediaType || 'image',
      file_size: rec.fileSize ?? null,
      compressed_size: rec.compressedSize ?? null,
      width: rec.videoMeta?.width ?? null,
      height: rec.videoMeta?.height ?? null,
      duration_seconds: rec.videoMeta?.durationSeconds ?? null,
      has_audio: rec.videoMeta?.hasAudio ? 1 : 0,
      resolution: rec.videoMeta?.resolution ?? null,
      is_ai_generated: isAiInt,
      base_title: effectiveBaseTitle,
      detailed_description: rec.detailedDescription || '',
      keywords_json: kwJson,
      categories_json: catJson,
      metadata_json: metadataJson,
      pipeline_stage: rec.pipelineStage || 'committed',
      status: rec.status || 'completed',
      error_message: rec.errorMessage ?? null,
      created_at: createdAt,
      updated_at: now,
    });

    upsertMeta.run({
      asset_id: rec.id,
      base_title: effectiveBaseTitle,
      detailed_description: rec.detailedDescription || '',
      keywords_json: kwJson,
      categories_json: catJson,
      is_ai_generated: isAiInt,
      ai_provider: rec.aiGenerationInfo?.provider ?? null,
      ai_model: rec.aiGenerationInfo?.model ?? null,
      ai_prompt: rec.aiGenerationInfo?.prompt ?? null,
      latency_ms: rec.aiGenerationInfo?.latencyMs ?? null,
      attempt_history_json: rec.aiGenerationInfo?.attemptHistory
        ? JSON.stringify(rec.aiGenerationInfo.attemptHistory)
        : null,
      updated_at: now,
    });

    for (const agencyId of SUPPORTED_AGENCIES) {
      insertAgencyTracking.run(`${rec.id}_${agencyId}`, rec.id, agencyId, createdAt, now);
    }
  }

  // ============================================================================
  // Public RPC Dispatcher
  // ============================================================================
  invoke(method, ...args) {
    if (typeof this[method] !== 'function') {
      throw new Error(`Unknown SQLite RPC method: ${method}`);
    }
    return this[method](...args);
  }

  getDbInfo() {
    return {
      dbPath: this.dbPath,
      queuesDbPath: this.queuesDbPath,
      baseDir: this.baseDir,
      masterVaultDir: this.masterVaultDir,
      exportBasketsDir: this.exportBasketsDir,
      backupsDir: this.backupsDir,
      isUserDataDirty: Boolean(this.isUserDataDirty),
      engine: this.isNativeSqlite ? 'sqlite-wal' : 'memory-fallback',
    };
  }

  // --- MasterMetadataRecords (assets + asset_metadata + agency_tracking) ---
  getMasterRecords() {
    const trackingMap = this._buildAgencyTrackingMapForAssets();
    if (!this.isNativeSqlite) {
      return Array.from(this.memoryFallback.masterRecords.values())
        .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0))
        .map((r) => ({
          ...r,
          thumbnailBase64: '',
          agencyTrackings: trackingMap.get(r.id) || this._ensureMemoryAgencyTrackingForAsset(r.id),
        }));
    }
    const rows = this.db
      .prepare(`
        SELECT
          a.*,
          m.base_title AS m_base_title,
          m.detailed_description AS m_detailed_description,
          m.keywords_json AS m_keywords_json,
          m.categories_json AS m_categories_json,
          m.is_ai_generated AS m_is_ai_generated,
          m.ai_provider,
          m.ai_model,
          m.ai_prompt,
          m.latency_ms,
          m.attempt_history_json
        FROM assets a
        LEFT JOIN asset_metadata m ON a.id = m.asset_id
        ORDER BY a.created_at ASC
      `)
      .all();
    return rows.map((r) => this.rowToMasterRecord(r, trackingMap.get(r.id)));
  }

  getMasterRecord(id) {
    const trackingMap = this._buildAgencyTrackingMapForAssets();
    if (!this.isNativeSqlite) {
      const rec = this.memoryFallback.masterRecords.get(id);
      if (!rec) return undefined;
      return {
        ...rec,
        thumbnailBase64: '',
        agencyTrackings: trackingMap.get(id) || this._ensureMemoryAgencyTrackingForAsset(id),
      };
    }
    const row = this.db
      .prepare(`
        SELECT
          a.*,
          m.base_title AS m_base_title,
          m.detailed_description AS m_detailed_description,
          m.keywords_json AS m_keywords_json,
          m.categories_json AS m_categories_json,
          m.is_ai_generated AS m_is_ai_generated,
          m.ai_provider,
          m.ai_model,
          m.ai_prompt,
          m.latency_ms,
          m.attempt_history_json
        FROM assets a
        LEFT JOIN asset_metadata m ON a.id = m.asset_id
        WHERE a.id = ?
      `)
      .get(id);
    return this.rowToMasterRecord(row, trackingMap.get(id));
  }

  countMasterRecords() {
    if (!this.isNativeSqlite) {
      return this.memoryFallback.masterRecords.size;
    }
    const row = this.db.prepare('SELECT COUNT(*) as cnt FROM assets').get();
    return row ? row.cnt : 0;
  }

  putMasterRecord(record) {
    this.markDirty();
    if (!this.isNativeSqlite) {
      const agencyTrackings = this._ensureMemoryAgencyTrackingForAsset(record.id, record.createdAt || Date.now());
      this.memoryFallback.masterRecords.set(record.id, { ...record, thumbnailBase64: '', agencyTrackings });
      return record.id;
    }
    const tx = this.db.transaction((rec) => {
      this.upsertSingleMasterRecord(rec);
    });
    tx(record);
    return record.id;
  }

  bulkPutMasterRecords(records) {
    if (!Array.isArray(records) || records.length === 0) return;
    this.markDirty();
    if (!this.isNativeSqlite) {
      for (const r of records) {
        const agencyTrackings = this._ensureMemoryAgencyTrackingForAsset(r.id, r.createdAt || Date.now());
        this.memoryFallback.masterRecords.set(r.id, { ...r, thumbnailBase64: '', agencyTrackings });
      }
      return;
    }
    const tx = this.db.transaction((items) => {
      for (const rec of items) {
        this.upsertSingleMasterRecord(rec);
      }
    });
    tx(records);
  }

  updateMasterRecord(id, changes) {
    const existing = this.getMasterRecord(id);
    if (!existing) return 0;
    const merged = { ...existing, ...changes, id, thumbnailBase64: '' };
    this.putMasterRecord(merged);
    return 1;
  }

  modifyAllMasterRecords(changes) {
    this.markDirty();
    if (!this.isNativeSqlite) {
      for (const [id, rec] of this.memoryFallback.masterRecords.entries()) {
        this.memoryFallback.masterRecords.set(id, { ...rec, ...changes, thumbnailBase64: '' });
      }
      return;
    }
    const all = this.getMasterRecords();
    const updated = all.map((r) => ({ ...r, ...changes, thumbnailBase64: '' }));
    this.bulkPutMasterRecords(updated);
  }

  deleteMasterRecord(id) {
    this.markDirty();
    if (!this.isNativeSqlite) {
      this.memoryFallback.masterRecords.delete(id);
      for (const agencyId of SUPPORTED_AGENCIES) {
        this.memoryFallback.agencyTracking.delete(`${id}::${agencyId}`);
      }
      return;
    }
    this.db.prepare('DELETE FROM assets WHERE id = ?').run(id);
  }

  bulkDeleteMasterRecords(ids) {
    if (!Array.isArray(ids) || ids.length === 0) return;
    this.markDirty();
    if (!this.isNativeSqlite) {
      for (const id of ids) {
        this.memoryFallback.masterRecords.delete(id);
        for (const agencyId of SUPPORTED_AGENCIES) {
          this.memoryFallback.agencyTracking.delete(`${id}::${agencyId}`);
        }
      }
      return;
    }
    const stmt = this.db.prepare('DELETE FROM assets WHERE id = ?');
    const tx = this.db.transaction((list) => {
      for (const id of list) stmt.run(id);
    });
    tx(ids);
  }

  clearMasterRecords() {
    this.markDirty();
    if (!this.isNativeSqlite) {
      this.memoryFallback.masterRecords.clear();
      this.memoryFallback.agencyTracking.clear();
      return;
    }
    this.db.prepare('DELETE FROM assets').run();
  }

  // ============================================================================
  // Pillar 1 & 2: Atomic Deduplication, Ingestion & Master Vault Operations
  // ============================================================================
  checkDuplicateHash(fileHash) {
    if (!fileHash) return { isDuplicate: false };
    if (!this.isNativeSqlite) {
      for (const rec of this.memoryFallback.masterRecords.values()) {
        if (rec.workspaceScope === 'studio') continue;
        if (rec.fileHash && rec.fileHash === fileHash) {
          return { isDuplicate: true, existingAssetId: rec.id, existingFilename: rec.filename };
        }
      }
      return { isDuplicate: false };
    }
    const rows = this.db
      .prepare('SELECT id, filename, master_path, metadata_json FROM assets WHERE file_hash = ?')
      .all(fileHash);
    for (const row of rows) {
      try {
        const meta = row.metadata_json ? JSON.parse(row.metadata_json) : null;
        if (meta && meta.workspaceScope === 'studio') continue;
      } catch {}
      return {
        isDuplicate: true,
        existingAssetId: row.id,
        existingFilename: row.filename,
        masterPath: this.toAbsoluteWorkspacePath(row.master_path),
      };
    }
    return { isDuplicate: false };
  }

  stageAndHashFile({ sourcePath, fileBuffer, filename, batchId = 'batch_default' }) {
    const cleanBatch = String(batchId || 'batch_default').replace(/[^a-zA-Z0-9_-]/g, '_');
    const tempBatchDir = path.join(this.tempStagingDir || path.join(process.cwd(), '.stockflow_temp'), cleanBatch);
    fs.mkdirSync(tempBatchDir, { recursive: true });

    const safeName = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}_${path.basename(filename || sourcePath || 'asset.bin')}`;
    const tempFilePath = path.join(tempBatchDir, safeName);

    try {
      if (sourcePath && fs.existsSync(sourcePath)) {
        fs.copyFileSync(sourcePath, tempFilePath);
      } else if (fileBuffer) {
        fs.writeFileSync(tempFilePath, Buffer.from(fileBuffer));
      } else {
        throw new Error('Source file does not exist and no file buffer was provided.');
      }

      const buf = fs.readFileSync(tempFilePath);
      const fileHash = crypto.createHash('sha256').update(buf).digest('hex');
      const fileSize = buf.byteLength;

      const dupCheck = this.checkDuplicateHash(fileHash);
      if (dupCheck.isDuplicate) {
        try {
          fs.unlinkSync(tempFilePath);
        } catch {}
        return {
          success: true,
          isDuplicate: true,
          fileHash,
          fileSize,
          existingAssetId: dupCheck.existingAssetId,
          existingFilename: dupCheck.existingFilename,
        };
      }

      return {
        success: true,
        isDuplicate: false,
        tempFilePath,
        fileHash,
        fileSize,
      };
    } catch (err) {
      try {
        if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
      } catch {}
      return {
        success: false,
        error: err.message || 'Failed to stage and hash file in temp directory.',
      };
    }
  }

  rollbackIngestedItem({ assetId, tempFilePath, previewTempPath }) {
    if (tempFilePath && typeof tempFilePath === 'string' && fs.existsSync(tempFilePath)) {
      try {
        fs.unlinkSync(tempFilePath);
      } catch {}
    }
    if (previewTempPath && typeof previewTempPath === 'string' && fs.existsSync(previewTempPath)) {
      try {
        fs.unlinkSync(previewTempPath);
      } catch {}
    }
    if (assetId) {
      this.deleteMasterRecord(assetId);
    }
    return { rolledBack: true };
  }

  commitAtomicallyToMasterVault(payload) {
    const {
      record,
      tempFilePath,
      previewBuffer,
      mutedVideoBuffer,
    } = payload || {};

    if (!record || !record.id || !record.filename) {
      throw new Error('Invalid asset record for Master Vault commit.');
    }

    const mediaSubfolder =
      record.mediaType === 'video'
        ? 'Videos'
        : record.mediaType === 'vector'
        ? 'Vectors'
        : 'Photos';
    const aiPrefix = record.isAiGenerated ? 'AI' : 'Real';
    const batchFolder = (record.batchId || 'B01').replace(/[^a-zA-Z0-9_-]/g, '_');

    const vaultTargetDir = path.join(
      this.masterVaultDir || path.join(process.cwd(), '.stockflow_data', 'Master_Vault'),
      aiPrefix,
      mediaSubfolder,
      batchFolder
    );
    fs.mkdirSync(vaultTargetDir, { recursive: true });

    const masterFullPath = record.masterPath
      ? this.toAbsoluteWorkspacePath(record.masterPath)
      : path.join(vaultTargetDir, record.filename);
    let previewFullPath = record.previewPath ? this.toAbsoluteWorkspacePath(record.previewPath) : null;

    try {
      // Pillar 6: For vectors, write the companion .jpg preview BEFORE moving the .eps into the Master Vault
      if (previewBuffer && record.mediaType === 'vector') {
        const ext = path.extname(record.filename);
        const base = path.basename(record.filename, ext);
        previewFullPath = path.join(vaultTargetDir, `${base}.jpg`);
        fs.writeFileSync(previewFullPath, Buffer.from(previewBuffer));
      } else if (!previewFullPath && record.thumbnailBase64) {
        const relPreview = this._persistPreviewToDiskIfNeeded(record.id, record.thumbnailBase64);
        if (relPreview) {
          previewFullPath = this.toAbsoluteWorkspacePath(relPreview);
        }
      }

      // Pillar 6: For videos with a lossless-muted buffer, write the muted bytes to tempFilePath before moving
      if (mutedVideoBuffer && record.mediaType === 'video' && tempFilePath) {
        fs.writeFileSync(tempFilePath, Buffer.from(mutedVideoBuffer));
      }

      if (tempFilePath && fs.existsSync(tempFilePath)) {
        try {
          fs.renameSync(tempFilePath, masterFullPath);
        } catch (moveErr) {
          if (moveErr.code === 'EXDEV') {
            fs.copyFileSync(tempFilePath, masterFullPath);
            fs.unlinkSync(tempFilePath);
          } else {
            throw moveErr;
          }
        }
      }

      // Store portable relative paths in SQLite and strip any Base64 strings
      const finalizedRecord = {
        ...record,
        workspaceScope: record.workspaceScope || 'tracker',
        masterPath: this.toRelativeWorkspacePath(masterFullPath),
        previewPath: previewFullPath ? this.toRelativeWorkspacePath(previewFullPath) : undefined,
        nativePath: masterFullPath,
        thumbnailBase64: '',
        pipelineStage: 'committed',
        status: 'completed',
      };

      this.putMasterRecord(finalizedRecord);
      return this.getMasterRecord(record.id);
    } catch (err) {
      try {
        if (tempFilePath && fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
        if (previewFullPath && fs.existsSync(previewFullPath)) fs.unlinkSync(previewFullPath);
      } catch {}
      throw err;
    }
  }

  // ============================================================================
  // Pillar 1, 3 & 4: Agency Tracking, Export Baskets & Reconciliation
  // ============================================================================
  getRejectionDictionary(agencyId = null) {
    if (!this.isNativeSqlite) {
      const all = Array.from(this.memoryFallback.rejectionDictionary.values()).filter((r) => r.isActive);
      if (agencyId && agencyId !== 'all') {
        return all.filter((r) => r.agencyId === 'all' || r.agencyId === agencyId);
      }
      return all;
    }

    let rows;
    if (agencyId && agencyId !== 'all') {
      rows = this.db
        .prepare(
          `SELECT * FROM rejection_dictionary WHERE is_active = 1 AND (agency_id = 'all' OR agency_id = ?) ORDER BY usage_count DESC, title ASC`
        )
        .all(agencyId);
    } else {
      rows = this.db
        .prepare(`SELECT * FROM rejection_dictionary WHERE is_active = 1 ORDER BY usage_count DESC, title ASC`)
        .all();
    }

    return rows.map((r) => ({
      id: r.id,
      agencyId: r.agency_id,
      code: r.code ?? undefined,
      title: r.title,
      description: r.description || '',
      severity: r.severity || 'standard',
      usageCount: r.usage_count || 0,
      isActive: Boolean(r.is_active),
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }));
  }

  addRejectionReason({ agencyId = 'all', title, description = '', severity = 'standard', code = null }) {
    if (!title || !String(title).trim()) {
      throw new Error('Rejection reason title is required.');
    }
    this.markDirty();
    const cleanTitle = String(title).trim();
    const cleanDesc = String(description || '').trim();
    const now = Date.now();
    const id = `rej_${crypto.randomUUID().slice(0, 8)}`;

    if (!this.isNativeSqlite) {
      const rec = {
        id,
        agencyId,
        code: code || undefined,
        title: cleanTitle,
        description: cleanDesc,
        severity,
        usageCount: 0,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      };
      this.memoryFallback.rejectionDictionary.set(id, rec);
      return rec;
    }

    this.db
      .prepare(`
        INSERT INTO rejection_dictionary (
          id, agency_id, code, title, description, severity, usage_count, is_active, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, 0, 1, ?, ?)
        ON CONFLICT(agency_id, title) DO UPDATE SET
          description = excluded.description,
          severity = excluded.severity,
          is_active = 1,
          updated_at = excluded.updated_at
      `)
      .run(id, agencyId, code, cleanTitle, cleanDesc, severity, now, now);

    const row = this.db
      .prepare('SELECT * FROM rejection_dictionary WHERE agency_id = ? AND title = ?')
      .get(agencyId, cleanTitle);

    return {
      id: row.id,
      agencyId: row.agency_id,
      code: row.code ?? undefined,
      title: row.title,
      description: row.description || '',
      severity: row.severity || 'standard',
      usageCount: row.usage_count || 0,
      isActive: Boolean(r_active(row)),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  createExportBasket({ agencyId, basketName, assetIds, csvFilename, csvContent, additionalCsvs = [] }) {
    if (!agencyId || !Array.isArray(assetIds) || assetIds.length === 0) {
      throw new Error('Agency and at least one asset ID are required to create an Export Basket.');
    }
    this.markDirty();

    const now = Date.now();
    const basketId = `basket_${crypto.randomUUID().slice(0, 8)}`;
    const dateStamp = new Date(now).toISOString().slice(0, 10);
    const cleanBasketName =
      (basketName || `${agencyId.toUpperCase()}_${dateStamp}`).replace(/[^a-zA-Z0-9_-]/g, '_');

    const stagingFolderPath = path.join(
      this.exportBasketsDir || path.join(process.cwd(), '.stockflow_data', 'Export_Baskets'),
      `${cleanBasketName}_${basketId}`
    );

    try {
      fs.mkdirSync(stagingFolderPath, { recursive: true });
    } catch {
      // ignore in virtualized test environments
    }

    let csvFilePath = null;
    if (csvFilename && typeof csvContent === 'string' && csvContent.length > 0) {
      csvFilePath = path.join(stagingFolderPath, csvFilename);
      try {
        fs.writeFileSync(csvFilePath, Buffer.from(csvContent, 'utf8'));
      } catch {
        // ignore if virtual FS
      }
    }

    if (Array.isArray(additionalCsvs)) {
      for (const extra of additionalCsvs) {
        if (extra?.filename && extra?.csvString) {
          try {
            fs.writeFileSync(path.join(stagingFolderPath, extra.filename), Buffer.from(extra.csvString, 'utf8'));
          } catch {}
        }
      }
    }

    // Copy master files into the staging basket folder if they exist on disk
    for (const assetId of assetIds) {
      const rec = this.getMasterRecord(assetId);
      if (!rec) continue;
      const srcPath = rec.masterPath || rec.originalPath || rec.nativePath;
      if (srcPath && fs.existsSync(srcPath)) {
        try {
          const destPath = path.join(stagingFolderPath, rec.filename);
          fs.copyFileSync(srcPath, destPath);
          if (rec.previewPath && fs.existsSync(rec.previewPath)) {
            const previewDest = path.join(stagingFolderPath, path.basename(rec.previewPath));
            fs.copyFileSync(rec.previewPath, previewDest);
          }
        } catch {
          // ignore if file missing
        }
      }
    }

    const basketRecord = {
      id: basketId,
      agencyId,
      basketName: cleanBasketName,
      stagingFolderPath,
      csvFilePath: csvFilePath || undefined,
      itemCount: assetIds.length,
      status: 'pending_reconciliation',
      createdAt: now,
    };

    if (!this.isNativeSqlite) {
      this.memoryFallback.exportBaskets.set(basketId, basketRecord);
      for (const assetId of assetIds) {
        this._ensureMemoryAgencyTrackingForAsset(assetId, now);
        const key = `${assetId}::${agencyId}`;
        const existing = this.memoryFallback.agencyTracking.get(key);
        this.memoryFallback.agencyTracking.set(key, {
          ...existing,
          status: 'Pending Upload',
          exportBasketId: basketId,
          stagedFilePath: path.join(stagingFolderPath, this.memoryFallback.masterRecords.get(assetId)?.filename || ''),
          submissionBatchName: cleanBasketName,
          exportedAt: now,
          updatedAt: now,
        });
      }
      return basketRecord;
    }

    const tx = this.db.transaction(() => {
      this.db
        .prepare(`
          INSERT INTO export_baskets (
            id, agency_id, basket_name, staging_folder_path, csv_file_path, item_count, status, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, 'pending_reconciliation', ?)
        `)
        .run(
          basketId,
          agencyId,
          cleanBasketName,
          stagingFolderPath,
          csvFilePath,
          assetIds.length,
          now
        );

      const upsertTracking = this.db.prepare(`
        INSERT INTO agency_tracking (
          id, asset_id, agency_id, status, export_basket_id, staged_file_path,
          submission_batch_name, exported_at, rejection_count,
          scraped_downloads, scraped_earnings_cents, scraped_views, created_at, updated_at
        ) VALUES (?, ?, ?, 'Pending Upload', ?, ?, ?, ?, 0, 0, 0, 0, ?, ?)
        ON CONFLICT(asset_id, agency_id) DO UPDATE SET
          status = 'Pending Upload',
          export_basket_id = excluded.export_basket_id,
          staged_file_path = excluded.staged_file_path,
          submission_batch_name = excluded.submission_batch_name,
          exported_at = excluded.exported_at,
          updated_at = excluded.updated_at
      `);

      for (const assetId of assetIds) {
        const assetRow = this.db.prepare('SELECT filename FROM assets WHERE id = ?').get(assetId);
        const stagedPath = assetRow ? path.join(stagingFolderPath, assetRow.filename) : stagingFolderPath;
        upsertTracking.run(
          `${assetId}_${agencyId}`,
          assetId,
          agencyId,
          basketId,
          stagedPath,
          cleanBasketName,
          now,
          now,
          now
        );
      }
    });

    tx();
    return basketRecord;
  }

  getExportBaskets(agencyId = null) {
    if (!this.isNativeSqlite) {
      const all = Array.from(this.memoryFallback.exportBaskets.values()).sort(
        (a, b) => b.createdAt - a.createdAt
      );
      return agencyId ? all.filter((b) => b.agencyId === agencyId) : all;
    }

    const rows = agencyId
      ? this.db
          .prepare('SELECT * FROM export_baskets WHERE agency_id = ? ORDER BY created_at DESC')
          .all(agencyId)
      : this.db.prepare('SELECT * FROM export_baskets ORDER BY created_at DESC').all();

    return rows.map((r) => ({
      id: r.id,
      agencyId: r.agency_id,
      basketName: r.basket_name,
      stagingFolderPath: r.staging_folder_path,
      csvFilePath: r.csv_file_path ?? undefined,
      itemCount: r.item_count,
      status: r.status,
      createdAt: r.created_at,
      reconciledAt: r.reconciled_at ?? undefined,
    }));
  }

  reconcileAgencyStatuses({
    assetIds,
    agencyId,
    targetStatus,
    rejectionReasonId = null,
    customRejectionNote = null,
    agencyUrl = null,
    agencyAssetId = null,
  }) {
    if (!Array.isArray(assetIds) || assetIds.length === 0 || !agencyId || !targetStatus) {
      return { updatedCount: 0 };
    }
    this.markDirty();

    const now = Date.now();

    if (!this.isNativeSqlite) {
      let updatedCount = 0;
      for (const assetId of assetIds) {
        this._ensureMemoryAgencyTrackingForAsset(assetId, now);
        const key = `${assetId}::${agencyId}`;
        const existing = this.memoryFallback.agencyTracking.get(key);
        const isRejected = targetStatus === 'Rejected';
        const isReverted = targetStatus === 'New';
        this.memoryFallback.agencyTracking.set(key, {
          ...existing,
          status: targetStatus,
          rejectionReasonId: isRejected ? rejectionReasonId || undefined : isReverted ? undefined : existing.rejectionReasonId,
          customRejectionNote: isRejected
            ? customRejectionNote || undefined
            : isReverted
            ? undefined
            : existing.customRejectionNote,
          rejectionCount: isRejected ? (existing.rejectionCount || 0) + 1 : existing.rejectionCount || 0,
          uploadedAt: targetStatus === 'Uploaded' ? now : existing.uploadedAt,
          acceptedAt: targetStatus === 'Accepted' ? now : existing.acceptedAt,
          rejectedAt: isRejected ? now : existing.rejectedAt,
          agencyUrl: agencyUrl || existing.agencyUrl,
          agencyAssetId: agencyAssetId || existing.agencyAssetId,
          updatedAt: now,
        });
        updatedCount++;
      }
      if (targetStatus === 'Rejected' && rejectionReasonId) {
        const reason = this.memoryFallback.rejectionDictionary.get(rejectionReasonId);
        if (reason) {
          reason.usageCount = (reason.usageCount || 0) + assetIds.length;
        }
      }
      return { updatedCount };
    }

    const tx = this.db.transaction(() => {
      const stmt = this.db.prepare(`
        INSERT INTO agency_tracking (
          id, asset_id, agency_id, status, rejection_reason_id, custom_rejection_note,
          rejection_count, uploaded_at, reviewed_at, accepted_at, rejected_at,
          agency_url, agency_asset_id,
          scraped_downloads, scraped_earnings_cents, scraped_views, created_at, updated_at
        ) VALUES (
          @id, @asset_id, @agency_id, @status, @rejection_reason_id, @custom_rejection_note,
          @rejection_inc, @uploaded_at, @reviewed_at, @accepted_at, @rejected_at,
          @agency_url, @agency_asset_id,
          0, 0, 0, @now, @now
        )
        ON CONFLICT(asset_id, agency_id) DO UPDATE SET
          status = excluded.status,
          rejection_reason_id = CASE
            WHEN excluded.status = 'Rejected' THEN excluded.rejection_reason_id
            WHEN excluded.status = 'New' THEN NULL
            ELSE agency_tracking.rejection_reason_id
          END,
          custom_rejection_note = CASE
            WHEN excluded.status = 'Rejected' THEN excluded.custom_rejection_note
            WHEN excluded.status = 'New' THEN NULL
            ELSE agency_tracking.custom_rejection_note
          END,
          rejection_count = CASE
            WHEN excluded.status = 'Rejected' THEN agency_tracking.rejection_count + 1
            ELSE agency_tracking.rejection_count
          END,
          uploaded_at = COALESCE(excluded.uploaded_at, agency_tracking.uploaded_at),
          reviewed_at = COALESCE(excluded.reviewed_at, agency_tracking.reviewed_at),
          accepted_at = COALESCE(excluded.accepted_at, agency_tracking.accepted_at),
          rejected_at = COALESCE(excluded.rejected_at, agency_tracking.rejected_at),
          agency_url = COALESCE(excluded.agency_url, agency_tracking.agency_url),
          agency_asset_id = COALESCE(excluded.agency_asset_id, agency_tracking.agency_asset_id),
          updated_at = excluded.updated_at
      `);

      for (const assetId of assetIds) {
        stmt.run({
          id: `${assetId}_${agencyId}`,
          asset_id: assetId,
          agency_id: agencyId,
          status: targetStatus,
          rejection_reason_id: targetStatus === 'Rejected' ? rejectionReasonId : null,
          custom_rejection_note: targetStatus === 'Rejected' ? customRejectionNote : null,
          rejection_inc: targetStatus === 'Rejected' ? 1 : 0,
          uploaded_at: targetStatus === 'Uploaded' ? now : null,
          reviewed_at: targetStatus === 'In Review' ? now : null,
          accepted_at: targetStatus === 'Accepted' ? now : null,
          rejected_at: targetStatus === 'Rejected' ? now : null,
          agency_url: agencyUrl || null,
          agency_asset_id: agencyAssetId || null,
          now,
        });
      }

      if (targetStatus === 'Rejected' && rejectionReasonId) {
        this.db
          .prepare('UPDATE rejection_dictionary SET usage_count = usage_count + ?, updated_at = ? WHERE id = ?')
          .run(assetIds.length, now, rejectionReasonId);
      }

      this.db
        .prepare(`
          UPDATE export_baskets
          SET status = 'reconciled', reconciled_at = ?
          WHERE status = 'pending_reconciliation'
            AND NOT EXISTS (
              SELECT 1 FROM agency_tracking t
              WHERE t.export_basket_id = export_baskets.id AND t.status = 'Pending Upload'
            )
        `)
        .run(now);
    });

    tx();
    return { updatedCount: assetIds.length };
  }

  getTrackerStats() {
    const records = this.getMasterRecords().filter((r) => r.workspaceScope !== 'studio');
    const perAgencyStats = {};
    for (const agencyId of SUPPORTED_AGENCIES) {
      perAgencyStats[agencyId] = {
        New: 0,
        'Pending Upload': 0,
        Uploaded: 0,
        'In Review': 0,
        Accepted: 0,
        Rejected: 0,
      };
    }

    let newCount = 0;
    let pendingUploadCount = 0;
    let uploadedCount = 0;
    let inReviewCount = 0;
    let acceptedCount = 0;
    let rejectedCount = 0;

    for (const rec of records) {
      const map = rec.agencyTrackings || {};
      for (const agencyId of SUPPORTED_AGENCIES) {
        const st = map[agencyId]?.status || 'New';
        if (perAgencyStats[agencyId][st] !== undefined) {
          perAgencyStats[agencyId][st]++;
        }
        if (st === 'New') newCount++;
        else if (st === 'Pending Upload') pendingUploadCount++;
        else if (st === 'Uploaded') uploadedCount++;
        else if (st === 'In Review') inReviewCount++;
        else if (st === 'Accepted') acceptedCount++;
        else if (st === 'Rejected') rejectedCount++;
      }
    }

    const backups = this.getBackupLogs(30);
    return {
      totalAssets: records.length,
      newCount,
      pendingUploadCount,
      uploadedCount,
      inReviewCount,
      acceptedCount,
      rejectedCount,
      perAgencyStats,
      lastBackup: backups[0] || undefined,
      backupCount: backups.length,
    };
  }

  // --- ApiKeys ---
  getApiKeys() {
    if (!this.isNativeSqlite) {
      return Array.from(this.memoryFallback.apiKeys.values()).sort(
        (a, b) => (a.createdAt || 0) - (b.createdAt || 0)
      );
    }
    const rows = this.db.prepare('SELECT record_json FROM api_keys ORDER BY created_at ASC').all();
    return rows
      .map((r) => {
        try {
          return JSON.parse(r.record_json);
        } catch {
          return null;
        }
      })
      .filter(Boolean);
  }

  getApiKey(id) {
    if (!this.isNativeSqlite) {
      return this.memoryFallback.apiKeys.get(id);
    }
    const row = this.db.prepare('SELECT record_json FROM api_keys WHERE id = ?').get(id);
    if (!row) return undefined;
    try {
      return JSON.parse(row.record_json);
    } catch {
      return undefined;
    }
  }

  putApiKey(record) {
    this.markDirty();
    if (!this.isNativeSqlite) {
      this.memoryFallback.apiKeys.set(record.id, { ...record });
      return record.id;
    }
    this.db
      .prepare(`
        INSERT OR REPLACE INTO api_keys (
          id, provider_id, encrypted_key, label, model_id,
          rpm_limit, rpd_limit, status, cooldown_until, exhausted_until,
          daily_request_count, daily_reset_timestamp, last_used_at, created_at, record_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        record.id,
        record.providerId,
        record.key || '',
        record.label || '',
        record.modelId || '',
        record.rpmLimit || 15,
        record.rpdLimit || 1500,
        record.status || 'healthy',
        record.cooldownUntil ?? null,
        record.exhaustedUntil ?? null,
        record.dailyRequestCount || 0,
        record.dailyResetTimestamp || 0,
        record.lastUsedAt || 0,
        record.createdAt || Date.now(),
        JSON.stringify(record)
      );
    return record.id;
  }

  bulkPutApiKeys(records) {
    if (!Array.isArray(records) || records.length === 0) return;
    this.markDirty();
    if (!this.isNativeSqlite) {
      for (const r of records) {
        this.memoryFallback.apiKeys.set(r.id, { ...r });
      }
      return;
    }
    const tx = this.db.transaction((items) => {
      for (const r of items) {
        this.putApiKey(r);
      }
    });
    tx(records);
  }

  updateApiKey(id, changes) {
    const existing = this.getApiKey(id);
    if (!existing) return 0;
    const merged = { ...existing, ...changes, id };
    this.putApiKey(merged);
    return 1;
  }

  deleteApiKey(id) {
    this.markDirty();
    if (!this.isNativeSqlite) {
      this.memoryFallback.apiKeys.delete(id);
      return;
    }
    this.db.prepare('DELETE FROM api_keys WHERE id = ?').run(id);
  }

  deleteApiKeysByProvider(providerId) {
    this.markDirty();
    if (!this.isNativeSqlite) {
      for (const [id, rec] of this.memoryFallback.apiKeys.entries()) {
        if (rec.providerId === providerId) {
          this.memoryFallback.apiKeys.delete(id);
        }
      }
      return;
    }
    this.db.prepare('DELETE FROM api_keys WHERE provider_id = ?').run(providerId);
  }

  clearApiKeys() {
    this.markDirty();
    if (!this.isNativeSqlite) {
      this.memoryFallback.apiKeys.clear();
      return;
    }
    this.db.prepare('DELETE FROM api_keys').run();
  }

  // --- Batches ---
  getBatches() {
    if (!this.isNativeSqlite) {
      return Array.from(this.memoryFallback.batches.values()).sort(
        (a, b) => (a.createdAt || 0) - (b.createdAt || 0)
      );
    }
    const rows = this.db.prepare('SELECT record_json FROM batches ORDER BY created_at ASC').all();
    return rows
      .map((r) => {
        try {
          return JSON.parse(r.record_json);
        } catch {
          return null;
        }
      })
      .filter(Boolean);
  }

  getBatch(id) {
    if (!this.isNativeSqlite) {
      return this.memoryFallback.batches.get(id);
    }
    const row = this.db.prepare('SELECT record_json FROM batches WHERE id = ?').get(id);
    if (!row) return undefined;
    try {
      return JSON.parse(row.record_json);
    } catch {
      return undefined;
    }
  }

  putBatch(record) {
    this.markDirty();
    if (!this.isNativeSqlite) {
      this.memoryFallback.batches.set(record.id, { ...record });
      return record.id;
    }
    this.db
      .prepare(`
        INSERT OR REPLACE INTO batches (
          id, name, status, total_count, processed_count, failed_count, created_at, record_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        record.id,
        record.name || '',
        record.status || 'idle',
        record.totalCount || 0,
        record.processedCount || 0,
        record.failedCount || 0,
        record.createdAt || Date.now(),
        JSON.stringify(record)
      );
    return record.id;
  }

  deleteBatch(id) {
    this.markDirty();
    if (!this.isNativeSqlite) {
      this.memoryFallback.batches.delete(id);
      return;
    }
    this.db.prepare('DELETE FROM batches WHERE id = ?').run(id);
  }

  clearBatches() {
    this.markDirty();
    if (!this.isNativeSqlite) {
      this.memoryFallback.batches.clear();
      return;
    }
    this.db.prepare('DELETE FROM batches').run();
  }

  // --- Settings ---
  getSetting(key) {
    if (!this.isNativeSqlite) {
      return this.memoryFallback.settings.get(key);
    }
    const row = this.db.prepare('SELECT key, value_json FROM settings WHERE key = ?').get(key);
    if (!row) return undefined;
    try {
      return { key: row.key, value: JSON.parse(row.value_json) };
    } catch {
      return undefined;
    }
  }

  putSetting(item) {
    const k = item.key;
    const val = item.value;
    this.markDirty();
    if (!this.isNativeSqlite) {
      this.memoryFallback.settings.set(k, { key: k, value: val });
      return k;
    }
    this.db
      .prepare('INSERT OR REPLACE INTO settings (key, value_json, updated_at) VALUES (?, ?, ?)')
      .run(k, JSON.stringify(val), Date.now());
    return k;
  }

  clearSettings() {
    this.markDirty();
    if (!this.isNativeSqlite) {
      this.memoryFallback.settings.clear();
      return;
    }
    this.db.prepare('DELETE FROM settings').run();
  }

  // ============================================================================
  // Pillar 6: Microstock FTP Credential Vault & Persistent Session Audit Logs
  // ============================================================================
  getFtpProfile(agencyId = 'dreamstime') {
    const profile = this.getFtpProfileWithSecret(agencyId);
    const { encryptedPassword, ...safeProfile } = profile;
    return {
      ...safeProfile,
      hasSavedPassword: Boolean(encryptedPassword && encryptedPassword.length > 0),
    };
  }

  getDefaultFtpAgencySpec(agencyId = 'dreamstime') {
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

  getFtpProfileWithSecret(agencyId = 'dreamstime') {
    const now = Date.now();
    const spec = this.getDefaultFtpAgencySpec(agencyId);
    const defaultProfile = {
      agencyId,
      protocol: spec.protocol,
      host: spec.host,
      port: spec.port,
      username: '',
      encryptedPassword: '',
      hasSavedPassword: false,
      passiveMode: true,
      updatedAt: now,
    };

    const fallbackEntry = this.memoryFallback.ftpProfiles.get(agencyId);

    if (!this.isNativeSqlite || !this.db) {
      return fallbackEntry
        ? {
            ...fallbackEntry,
            protocol: fallbackEntry.protocol || spec.protocol,
            host: fallbackEntry.host || spec.host,
            port: Number(fallbackEntry.port) || spec.port,
            hasSavedPassword: Boolean(
              fallbackEntry.encryptedPassword && fallbackEntry.encryptedPassword.length > 0
            ),
          }
        : defaultProfile;
    }

    const row = this.db
      .prepare('SELECT * FROM ftp_profiles WHERE agency_id = ?')
      .get(agencyId);

    if (!row || (!row.username && !row.encrypted_password)) {
      if (fallbackEntry && (fallbackEntry.username || fallbackEntry.encryptedPassword)) {
        return {
          ...fallbackEntry,
          protocol: fallbackEntry.protocol || spec.protocol,
          host: fallbackEntry.host || spec.host,
          port: Number(fallbackEntry.port) || spec.port,
          hasSavedPassword: Boolean(
            fallbackEntry.encryptedPassword && fallbackEntry.encryptedPassword.length > 0
          ),
        };
      }
      if (!row) return defaultProfile;
    }

    const sqlProfile = {
      agencyId: row.agency_id,
      protocol: row.protocol || spec.protocol,
      host: row.host || spec.host,
      port: Number(row.port) || spec.port,
      username: row.username || fallbackEntry?.username || '',
      encryptedPassword: row.encrypted_password || fallbackEntry?.encryptedPassword || '',
      hasSavedPassword: Boolean(
        (row.encrypted_password && row.encrypted_password.length > 0) ||
          (fallbackEntry?.encryptedPassword && fallbackEntry.encryptedPassword.length > 0)
      ),
      passiveMode: Boolean(row.passive_mode),
      lastVerifiedAt: row.last_verified_at || fallbackEntry?.lastVerifiedAt || undefined,
      updatedAt: row.updated_at || fallbackEntry?.updatedAt || now,
    };

    return sqlProfile;
  }

  saveFtpProfile(payload = {}) {
    this.markDirty();
    const agencyId = payload.agencyId || 'dreamstime';
    const spec = this.getDefaultFtpAgencySpec(agencyId);
    const existing = this.getFtpProfileWithSecret(agencyId);
    const now = Date.now();

    const encryptedPassword =
      typeof payload.encryptedPassword === 'string' && payload.encryptedPassword.length > 0
        ? payload.encryptedPassword
        : payload.clearPassword
        ? ''
        : existing.encryptedPassword || '';

    const updated = {
      agencyId,
      protocol: payload.protocol || existing.protocol || spec.protocol,
      host: (payload.host ?? existing.host ?? spec.host).trim(),
      port: Number(payload.port || existing.port || spec.port),
      username: (payload.username ?? existing.username ?? '').trim(),
      encryptedPassword,
      hasSavedPassword: Boolean(encryptedPassword && encryptedPassword.length > 0),
      passiveMode: payload.passiveMode !== undefined ? Boolean(payload.passiveMode) : existing.passiveMode,
      lastVerifiedAt: payload.lastVerifiedAt ?? existing.lastVerifiedAt ?? null,
      updatedAt: now,
    };

    this.memoryFallback.ftpProfiles.set(agencyId, updated);
    this._persistFtpProfilesVault();

    if (this.isNativeSqlite && this.db) {
      this.db
        .prepare(`
          INSERT OR REPLACE INTO ftp_profiles (
            agency_id, protocol, host, port, username, encrypted_password,
            passive_mode, last_verified_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)
        .run(
          updated.agencyId,
          updated.protocol,
          updated.host,
          updated.port,
          updated.username,
          updated.encryptedPassword,
          updated.passiveMode ? 1 : 0,
          updated.lastVerifiedAt,
          updated.updatedAt
        );
      try {
        this.db.pragma('wal_checkpoint(PASSIVE)');
      } catch {
        // ignore
      }
    }

    return this.getFtpProfile(agencyId);
  }

  createFtpSession(payload = {}) {
    this.markDirty();
    const now = Date.now();
    const session = {
      id: payload.id || crypto.randomUUID(),
      agencyId: payload.agencyId || 'dreamstime',
      mode: payload.mode || 'live',
      status: payload.status || 'running',
      totalFiles: Number(payload.totalFiles || 0),
      succeededFiles: Number(payload.succeededFiles || 0),
      failedFiles: Number(payload.failedFiles || 0),
      totalBytes: Number(payload.totalBytes || 0),
      averageSpeedBps: Number(payload.averageSpeedBps || 0),
      startedAt: payload.startedAt || now,
      completedAt: payload.completedAt || null,
    };

    if (!this.isNativeSqlite) {
      this.memoryFallback.ftpSessions.set(session.id, { ...session });
      return session;
    }

    this.db
      .prepare(`
        INSERT OR REPLACE INTO ftp_sessions (
          id, agency_id, mode, status, total_files, succeeded_files,
          failed_files, total_bytes, average_speed_bps, started_at, completed_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        session.id,
        session.agencyId,
        session.mode,
        session.status,
        session.totalFiles,
        session.succeededFiles,
        session.failedFiles,
        session.totalBytes,
        session.averageSpeedBps,
        session.startedAt,
        session.completedAt
      );

    return session;
  }

  updateFtpSession(sessionId, updates = {}) {
    if (!sessionId) return null;
    this.markDirty();
    if (!this.isNativeSqlite) {
      const existing = this.memoryFallback.ftpSessions.get(sessionId);
      if (!existing) return null;
      const merged = { ...existing, ...updates };
      this.memoryFallback.ftpSessions.set(sessionId, merged);
      return merged;
    }

    const row = this.db.prepare('SELECT * FROM ftp_sessions WHERE id = ?').get(sessionId);
    if (!row) return null;

    const merged = {
      id: row.id,
      agencyId: updates.agencyId ?? row.agency_id,
      mode: updates.mode ?? row.mode,
      status: updates.status ?? row.status,
      totalFiles: updates.totalFiles ?? row.total_files,
      succeededFiles: updates.succeededFiles ?? row.succeeded_files,
      failedFiles: updates.failedFiles ?? row.failed_files,
      totalBytes: updates.totalBytes ?? row.total_bytes,
      averageSpeedBps: updates.averageSpeedBps ?? row.average_speed_bps,
      startedAt: row.started_at,
      completedAt: updates.completedAt ?? row.completed_at,
    };

    this.createFtpSession(merged);
    return merged;
  }

  getFtpSessions(limit = 25) {
    if (!this.isNativeSqlite) {
      return Array.from(this.memoryFallback.ftpSessions.values())
        .sort((a, b) => (b.startedAt || 0) - (a.startedAt || 0))
        .slice(0, limit);
    }

    const rows = this.db
      .prepare('SELECT * FROM ftp_sessions ORDER BY started_at DESC LIMIT ?')
      .all(limit);

    return rows.map((r) => ({
      id: r.id,
      agencyId: r.agency_id,
      mode: r.mode,
      status: r.status,
      totalFiles: r.total_files,
      succeededFiles: r.succeeded_files,
      failedFiles: r.failed_files,
      totalBytes: r.total_bytes,
      averageSpeedBps: r.average_speed_bps,
      startedAt: r.started_at,
      completedAt: r.completed_at || undefined,
    }));
  }

  logFtpTransfer(payload = {}) {
    this.markDirty();
    const now = Date.now();
    const entry = {
      id: payload.id || crypto.randomUUID(),
      sessionId: payload.sessionId,
      agencyId: payload.agencyId || 'dreamstime',
      filename: payload.filename || 'unknown',
      localPath: payload.localPath ? this.toRelativeWorkspacePath(payload.localPath) : null,
      fileSize: Number(payload.fileSize || 0),
      mediaType: payload.mediaType || 'image',
      remoteDirectory: payload.remoteDirectory || '/',
      remotePath: payload.remotePath || `/${payload.filename || 'unknown'}`,
      status: payload.status || 'succeeded',
      retryCount: Number(payload.retryCount || 0),
      errorCode: payload.errorCode || null,
      errorMessage: payload.errorMessage || null,
      durationMs: Number(payload.durationMs || 0),
      completedAt: payload.completedAt || now,
    };

    if (!this.isNativeSqlite) {
      this.memoryFallback.ftpTransferLogs.unshift(entry);
      return entry;
    }

    this.db
      .prepare(`
        INSERT OR REPLACE INTO ftp_transfer_logs (
          id, session_id, agency_id, filename, local_path, file_size,
          media_type, remote_directory, remote_path, status, retry_count,
          error_code, error_message, duration_ms, completed_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        entry.id,
        entry.sessionId,
        entry.agencyId,
        entry.filename,
        entry.localPath,
        entry.fileSize,
        entry.mediaType,
        entry.remoteDirectory,
        entry.remotePath,
        entry.status,
        entry.retryCount,
        entry.errorCode,
        entry.errorMessage,
        entry.durationMs,
        entry.completedAt
      );

    return entry;
  }

  getFtpTransferLogs(sessionId = null, limit = 200) {
    if (!this.isNativeSqlite) {
      const list = sessionId
        ? this.memoryFallback.ftpTransferLogs.filter((l) => l.sessionId === sessionId)
        : this.memoryFallback.ftpTransferLogs;
      return list.slice(0, limit);
    }

    const rows = sessionId
      ? this.db
          .prepare('SELECT * FROM ftp_transfer_logs WHERE session_id = ? ORDER BY completed_at DESC LIMIT ?')
          .all(sessionId, limit)
      : this.db
          .prepare('SELECT * FROM ftp_transfer_logs ORDER BY completed_at DESC LIMIT ?')
          .all(limit);

    return rows.map((r) => ({
      id: r.id,
      sessionId: r.session_id,
      agencyId: r.agency_id,
      filename: r.filename,
      localPath: r.local_path ? this.toAbsoluteWorkspacePath(r.local_path) : undefined,
      fileSize: r.file_size,
      mediaType: r.media_type,
      remoteDirectory: r.remote_directory,
      remotePath: r.remote_path,
      status: r.status,
      retryCount: r.retry_count,
      errorCode: r.error_code || undefined,
      errorMessage: r.error_message || undefined,
      durationMs: r.duration_ms,
      completedAt: r.completed_at,
    }));
  }

  clearFtpLogs() {
    this.markDirty();
    if (!this.isNativeSqlite) {
      this.memoryFallback.ftpSessions.clear();
      this.memoryFallback.ftpTransferLogs = [];
      return { cleared: true };
    }
    this.db.prepare('DELETE FROM ftp_transfer_logs').run();
    this.db.prepare('DELETE FROM ftp_sessions').run();
    return { cleared: true };
  }

  // ============================================================================
  // Pillar 7: Ephemeral Queue Persistence in `local_queues.sqlite`
  // Completely isolated from `userdata.sqlite` and ignored during backups.
  // ============================================================================
  saveQueueSnapshot(payload = {}) {
    const moduleId = String(payload.moduleId || 'ftp').trim();
    const now = Date.now();
    const record = {
      moduleId,
      sessionId: payload.sessionId || null,
      batchStatus: payload.batchStatus || 'idle',
      agencyId: payload.agencyId || 'dreamstime',
      queueJson:
        typeof payload.queueJson === 'string'
          ? payload.queueJson
          : JSON.stringify(payload.queue || []),
      telemetryJson:
        typeof payload.telemetryJson === 'string'
          ? payload.telemetryJson
          : JSON.stringify(payload.telemetry || {}),
      updatedAt: payload.updatedAt || now,
    };

    if (!this.isNativeSqlite || !this.queuesDb) {
      this.memoryFallback.persistentTaskQueues.set(moduleId, record);
      return {
        moduleId: record.moduleId,
        sessionId: record.sessionId,
        batchStatus: record.batchStatus,
        agencyId: record.agencyId,
        updatedAt: record.updatedAt,
      };
    }

    this.queuesDb
      .prepare(`
        INSERT OR REPLACE INTO persistent_task_queues (
          module_id, session_id, batch_status, agency_id, queue_json, telemetry_json, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        record.moduleId,
        record.sessionId,
        record.batchStatus,
        record.agencyId,
        record.queueJson,
        record.telemetryJson,
        record.updatedAt
      );

    return {
      moduleId: record.moduleId,
      sessionId: record.sessionId,
      batchStatus: record.batchStatus,
      agencyId: record.agencyId,
      updatedAt: record.updatedAt,
    };
  }

  getQueueSnapshot(moduleId = 'ftp') {
    const cleanModuleId = String(moduleId || 'ftp').trim();

    if (!this.isNativeSqlite || !this.queuesDb) {
      const existing = this.memoryFallback.persistentTaskQueues.get(cleanModuleId);
      if (!existing) return null;
      let queue = [];
      let telemetry = {};
      try {
        queue = JSON.parse(existing.queueJson || '[]');
      } catch {
        queue = [];
      }
      try {
        telemetry = JSON.parse(existing.telemetryJson || '{}');
      } catch {
        telemetry = {};
      }
      return {
        moduleId: existing.moduleId,
        sessionId: existing.sessionId || undefined,
        batchStatus: existing.batchStatus,
        agencyId: existing.agencyId,
        queue,
        telemetry,
        updatedAt: existing.updatedAt,
      };
    }

    const row = this.queuesDb
      .prepare('SELECT * FROM persistent_task_queues WHERE module_id = ?')
      .get(cleanModuleId);
    if (!row) return null;

    let queue = [];
    let telemetry = {};
    try {
      queue = JSON.parse(row.queue_json || '[]');
    } catch {
      queue = [];
    }
    try {
      telemetry = JSON.parse(row.telemetry_json || '{}');
    } catch {
      telemetry = {};
    }

    return {
      moduleId: row.module_id,
      sessionId: row.session_id || undefined,
      batchStatus: row.batch_status,
      agencyId: row.agency_id,
      queue,
      telemetry,
      updatedAt: row.updated_at,
    };
  }

  clearQueueSnapshot(moduleId = 'ftp') {
    const cleanModuleId = String(moduleId || 'ftp').trim();
    if (!this.isNativeSqlite || !this.queuesDb) {
      this.memoryFallback.persistentTaskQueues.delete(cleanModuleId);
      return { cleared: true, moduleId: cleanModuleId };
    }
    this.queuesDb
      .prepare('DELETE FROM persistent_task_queues WHERE module_id = ?')
      .run(cleanModuleId);
    return { cleared: true, moduleId: cleanModuleId };
  }
}

function r_active(row) {
  return row ? row.is_active : 1;
}

const sqliteDb = new SqliteDatabaseManager();
module.exports = { sqliteDb, SqliteDatabaseManager, DEFAULT_REJECTION_REASONS, SUPPORTED_AGENCIES };
