const path = require('path');
const fs = require('fs');

/**
 * StockFlow Native SQLite Relational Engine (Main Process)
 * Stores data in a single portable file: <Documents>/StockFlow/stockflow.sqlite
 * Configured with WAL mode for high concurrency and zero-lock reads.
 */
class SqliteDatabaseManager {
  constructor() {
    this.db = null;
    this.dbPath = '';
    this.isNativeSqlite = false;
    this.memoryFallback = {
      masterRecords: new Map(),
      apiKeys: new Map(),
      batches: new Map(),
      settings: new Map(),
    };
  }

  init(app) {
    if (this.db || this.dbPath) return;

    let baseDir = '';
    try {
      const docsDir = app.getPath('documents');
      baseDir = path.join(docsDir, 'StockFlow');
      fs.mkdirSync(baseDir, { recursive: true });
    } catch {
      baseDir = app.getPath('userData');
      fs.mkdirSync(baseDir, { recursive: true });
    }

    this.dbPath = path.join(baseDir, 'stockflow.sqlite');

    try {
      const Database = require('better-sqlite3');
      this.db = new Database(this.dbPath);
      this.db.pragma('journal_mode = WAL');
      this.db.pragma('synchronous = NORMAL');
      this.db.pragma('foreign_keys = ON');
      this.createSchema();
      this.seedDefaultAgencies();
      this.isNativeSqlite = true;
    } catch (err) {
      console.warn('[SQLite] Native better-sqlite3 unavailable, using in-memory relational fallback:', err.message);
      this.isNativeSqlite = false;
    }
  }

  createSchema() {
    if (!this.db) return;

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS assets (
        id TEXT PRIMARY KEY,
        batch_id TEXT,
        filename TEXT NOT NULL,
        media_type TEXT DEFAULT 'image',
        file_size INTEGER,
        compressed_size INTEGER,
        width INTEGER,
        height INTEGER,
        duration_seconds REAL,
        resolution TEXT,
        thumbnail_base64 TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        error_message TEXT,
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

      -- Dormant Distribution Tracker Schema (Milestone 3 Foundation)
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
    `);
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

  rowToMasterRecord(row) {
    if (!row) return undefined;
    let rankedKeywords = [];
    let categories = undefined;
    let attemptHistory = undefined;

    try {
      if (row.keywords_json) rankedKeywords = JSON.parse(row.keywords_json);
    } catch {
      rankedKeywords = [];
    }
    try {
      if (row.categories_json) categories = JSON.parse(row.categories_json);
    } catch {
      categories = undefined;
    }
    try {
      if (row.attempt_history_json) attemptHistory = JSON.parse(row.attempt_history_json);
    } catch {
      attemptHistory = undefined;
    }

    const videoMeta =
      row.duration_seconds != null || row.resolution != null || row.width != null || row.height != null
        ? {
            durationSeconds: row.duration_seconds ?? undefined,
            resolution: row.resolution ?? undefined,
            width: row.width ?? undefined,
            height: row.height ?? undefined,
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

    return {
      id: row.id,
      batchId: row.batch_id || '',
      filename: row.filename,
      fileSize: row.file_size ?? undefined,
      compressedSize: row.compressed_size ?? undefined,
      thumbnailBase64: row.thumbnail_base64 || '',
      mediaType: row.media_type || 'image',
      videoMeta,
      isAiGenerated: Boolean(row.is_ai_generated ?? 1),
      baseTitle: row.base_title || '',
      detailedDescription: row.detailed_description || '',
      rankedKeywords,
      categories,
      aiGenerationInfo,
      status: row.status || 'pending',
      errorMessage: row.error_message ?? undefined,
      createdAt: row.created_at,
    };
  }

  upsertSingleMasterRecord(rec) {
    const now = Date.now();
    const createdAt = rec.createdAt || now;

    const upsertAsset = this.db.prepare(`
      INSERT INTO assets (
        id, batch_id, filename, media_type, file_size, compressed_size,
        width, height, duration_seconds, resolution, thumbnail_base64,
        status, error_message, created_at, updated_at
      ) VALUES (
        @id, @batch_id, @filename, @media_type, @file_size, @compressed_size,
        @width, @height, @duration_seconds, @resolution, @thumbnail_base64,
        @status, @error_message, @created_at, @updated_at
      )
      ON CONFLICT(id) DO UPDATE SET
        batch_id = excluded.batch_id,
        filename = excluded.filename,
        media_type = excluded.media_type,
        file_size = COALESCE(excluded.file_size, assets.file_size),
        compressed_size = COALESCE(excluded.compressed_size, assets.compressed_size),
        width = COALESCE(excluded.width, assets.width),
        height = COALESCE(excluded.height, assets.height),
        duration_seconds = COALESCE(excluded.duration_seconds, assets.duration_seconds),
        resolution = COALESCE(excluded.resolution, assets.resolution),
        thumbnail_base64 = CASE
          WHEN excluded.thumbnail_base64 IS NOT NULL AND excluded.thumbnail_base64 != ''
          THEN excluded.thumbnail_base64
          ELSE assets.thumbnail_base64
        END,
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

    upsertAsset.run({
      id: rec.id,
      batch_id: rec.batchId || '',
      filename: rec.filename || '',
      media_type: rec.mediaType || 'image',
      file_size: rec.fileSize ?? null,
      compressed_size: rec.compressedSize ?? null,
      width: rec.videoMeta?.width ?? null,
      height: rec.videoMeta?.height ?? null,
      duration_seconds: rec.videoMeta?.durationSeconds ?? null,
      resolution: rec.videoMeta?.resolution ?? null,
      thumbnail_base64: rec.thumbnailBase64 || '',
      status: rec.status || 'pending',
      error_message: rec.errorMessage ?? null,
      created_at: createdAt,
      updated_at: now,
    });

    upsertMeta.run({
      asset_id: rec.id,
      base_title: rec.baseTitle || '',
      detailed_description: rec.detailedDescription || '',
      keywords_json: JSON.stringify(rec.rankedKeywords || []),
      categories_json: rec.categories ? JSON.stringify(rec.categories) : null,
      is_ai_generated: rec.isAiGenerated === false ? 0 : 1,
      ai_provider: rec.aiGenerationInfo?.provider ?? null,
      ai_model: rec.aiGenerationInfo?.model ?? null,
      ai_prompt: rec.aiGenerationInfo?.prompt ?? null,
      latency_ms: rec.aiGenerationInfo?.latencyMs ?? null,
      attempt_history_json: rec.aiGenerationInfo?.attemptHistory
        ? JSON.stringify(rec.aiGenerationInfo.attemptHistory)
        : null,
      updated_at: now,
    });
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
      engine: this.isNativeSqlite ? 'sqlite-wal' : 'memory-fallback',
    };
  }

  // --- MasterMetadataRecords (assets + asset_metadata) ---
  getMasterRecords() {
    if (!this.isNativeSqlite) {
      return Array.from(this.memoryFallback.masterRecords.values()).sort(
        (a, b) => (a.createdAt || 0) - (b.createdAt || 0)
      );
    }
    const rows = this.db
      .prepare(`
        SELECT
          a.*,
          m.base_title,
          m.detailed_description,
          m.keywords_json,
          m.categories_json,
          m.is_ai_generated,
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
    return rows.map((r) => this.rowToMasterRecord(r));
  }

  getMasterRecord(id) {
    if (!this.isNativeSqlite) {
      return this.memoryFallback.masterRecords.get(id);
    }
    const row = this.db
      .prepare(`
        SELECT
          a.*,
          m.base_title,
          m.detailed_description,
          m.keywords_json,
          m.categories_json,
          m.is_ai_generated,
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
    return this.rowToMasterRecord(row);
  }

  countMasterRecords() {
    if (!this.isNativeSqlite) {
      return this.memoryFallback.masterRecords.size;
    }
    const row = this.db.prepare('SELECT COUNT(*) as cnt FROM assets').get();
    return row ? row.cnt : 0;
  }

  putMasterRecord(record) {
    if (!this.isNativeSqlite) {
      this.memoryFallback.masterRecords.set(record.id, { ...record });
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
    if (!this.isNativeSqlite) {
      for (const r of records) {
        this.memoryFallback.masterRecords.set(r.id, { ...r });
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
    const merged = { ...existing, ...changes, id };
    this.putMasterRecord(merged);
    return 1;
  }

  modifyAllMasterRecords(changes) {
    if (!this.isNativeSqlite) {
      for (const [id, rec] of this.memoryFallback.masterRecords.entries()) {
        this.memoryFallback.masterRecords.set(id, { ...rec, ...changes });
      }
      return;
    }
    const all = this.getMasterRecords();
    const updated = all.map((r) => ({ ...r, ...changes }));
    this.bulkPutMasterRecords(updated);
  }

  deleteMasterRecord(id) {
    if (!this.isNativeSqlite) {
      this.memoryFallback.masterRecords.delete(id);
      return;
    }
    this.db.prepare('DELETE FROM assets WHERE id = ?').run(id);
  }

  bulkDeleteMasterRecords(ids) {
    if (!Array.isArray(ids) || ids.length === 0) return;
    if (!this.isNativeSqlite) {
      for (const id of ids) this.memoryFallback.masterRecords.delete(id);
      return;
    }
    const stmt = this.db.prepare('DELETE FROM assets WHERE id = ?');
    const tx = this.db.transaction((list) => {
      for (const id of list) stmt.run(id);
    });
    tx(ids);
  }

  clearMasterRecords() {
    if (!this.isNativeSqlite) {
      this.memoryFallback.masterRecords.clear();
      return;
    }
    this.db.prepare('DELETE FROM assets').run();
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
    if (!this.isNativeSqlite) {
      this.memoryFallback.apiKeys.delete(id);
      return;
    }
    this.db.prepare('DELETE FROM api_keys WHERE id = ?').run(id);
  }

  deleteApiKeysByProvider(providerId) {
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
    if (!this.isNativeSqlite) {
      this.memoryFallback.batches.delete(id);
      return;
    }
    this.db.prepare('DELETE FROM batches WHERE id = ?').run(id);
  }

  clearBatches() {
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
    if (!this.isNativeSqlite) {
      this.memoryFallback.settings.clear();
      return;
    }
    this.db.prepare('DELETE FROM settings').run();
  }
}

const sqliteDb = new SqliteDatabaseManager();
module.exports = { sqliteDb, SqliteDatabaseManager };

