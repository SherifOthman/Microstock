export type ProviderType = 'gemini' | 'groq' | 'openrouter' | 'mistral' | 'cloudflare';

export type KeyStatus = 'healthy' | 'cooling_down' | 'exhausted_daily' | 'invalid' | 'disabled';

export interface ApiKeyRecord {
  id: string; // UUID v4
  providerId: ProviderType;
  key: string;
  label: string;
  modelId: string;
  rpmLimit: number; // e.g. 15 for Gemini Free, 30 for Groq
  rpdLimit: number; // e.g. 1500 for Gemini Free
  status: KeyStatus;
  cooldownUntil?: number; // timestamp in ms
  exhaustedUntil?: number; // timestamp in ms (midnight UTC)
  requestsInWindow: number[]; // timestamps of requests in the last 60,000ms
  dailyRequestCount: number;
  dailyResetTimestamp: number;
  activeRequests: number; // currently in-flight requests (typically 0 or 1)
  lastUsedAt: number; // timestamp in ms
  lastLatencyMs?: number;
  lastError?: string;
  createdAt: number;
}

export interface ProviderMeta {
  id: ProviderType;
  name: string;
  description: string;
  badge: string;
  defaultModelId: string;
  recommendedVisionModels: string[];
  defaultRpm: number;
  defaultRpd: number;
  docsUrl: string;
  signupUrl: string;
  supportsDynamicModels: boolean;
}

export interface ModelInfo {
  id: string;
  name: string;
  isVision: boolean;
  contextLength?: number;
  description?: string;
  pricing?: {
    prompt?: string;
    completion?: string;
  };
}

export interface MasterMetadataRecord {
  id: string; // file UUID or hash
  batchId: string;
  filename: string;
  fileSize?: number;
  compressedSize?: number;
  thumbnailBase64: string; // max 512px thumbnail JPEG
  mediaType?: MediaType;
  videoMeta?: {
    durationSeconds?: number;
    resolution?: string;
    width?: number;
    height?: number;
    hasAudio?: boolean;
  };
  isAiGenerated: boolean;
  baseTitle: string;
  shortTitle?: string; // Strictly < 100 chars (Freepik, Vecteezy)
  longTitle?: string; // Up to 200 chars (Adobe, Shutterstock, Dreamstime, 123RF)
  detailedDescription: string;
  rankedKeywords: string[]; // 40-50 tags
  categories?: {
    adobeCategoryId?: number; // 1-21
    shutterstockCategories?: (string | undefined)[]; // Up to 2 of 26 official names
    dreamstimeCategory1?: number; // Visual subject 1
    dreamstimeCategory2?: number; // Visual subject 2
    dreamstimeCategory3?: number; // 114 for AI, or subject 3
  };
  aiGenerationInfo?: {
    prompt: string;
    model: string;
    provider?: string;
    latencyMs?: number;
    attemptHistory?: Array<{ provider: string; model: string; status: 'success' | 'failed'; error?: string }>;
  };
  status: 'pending' | 'processing' | 'completed' | 'error';
  errorMessage?: string;
  nativePath?: string;
  /** Strict workspace isolation scope so Studio and Tracker queues/records never leak into each other */
  workspaceScope?: 'studio' | 'tracker';
  // Distribution Tracker Extended Vault Fields
  originalPath?: string;
  masterPath?: string;
  previewPath?: string;
  relativeMasterPath?: string;
  relativePreviewPath?: string;
  previewUrl?: string;
  originalFilename?: string;
  fileHash?: string;
  perceptualHash?: string;
  pipelineStage?: TrackerPipelineStage;
  aiVisionScore?: number;
  aiFlags?: string[];
  agencyTrackings?: Record<SupportedPlatform, AgencyTrackingRecord>;
  createdAt: number;
  updatedAt?: number;
}

export type TrackerPipelineStage =
  | 'queued'
  | 'copying_temp'
  | 'hashing'
  | 'validating_quality'
  | 'extracting_eps'
  | 'muting_audio'
  | 'generating_metadata'
  | 'committing_vault'
  | 'committed'
  | 'duplicate_skipped'
  | 'failed';

export type TrackerAgencyStatus =
  | 'New'
  | 'Pending Upload'
  | 'Uploaded'
  | 'In Review'
  | 'Accepted'
  | 'Rejected';

export interface AgencyTrackingRecord {
  id: string;
  assetId: string;
  agencyId: SupportedPlatform;
  status: TrackerAgencyStatus;
  exportBasketId?: string;
  stagedFilePath?: string;
  exportedFilename?: string;
  submissionBatchName?: string;
  agencyAssetId?: string;
  agencyUrl?: string;
  rejectionReasonId?: string;
  rejectionReasonTitle?: string;
  customRejectionNote?: string;
  rejectionCount: number;
  exportedAt?: number;
  uploadedAt?: number;
  reviewedAt?: number;
  acceptedAt?: number;
  rejectedAt?: number;
  // Future-Proof Fields
  ftpStatus?: 'idle' | 'queued' | 'uploading' | 'transferred' | 'failed';
  ftpRemotePath?: string;
  ftpLastAttemptAt?: number;
  ftpErrorMessage?: string;
  scrapedStatusRaw?: string;
  scrapedDownloads: number;
  scrapedEarningsCents: number;
  scrapedViews: number;
  lastScrapedAt?: number;
  aiFlags?: string;
  agencyMetadataOverride?: string;
  notes?: string;
  createdAt: number;
  updatedAt: number;
}

export interface RejectionReasonRecord {
  id: string;
  agencyId: SupportedPlatform | 'all';
  code?: string;
  title: string;
  description: string;
  severity: 'fixable' | 'standard' | 'permanent_ban_risk';
  usageCount: number;
  isActive: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface ExportBasketRecord {
  id: string;
  agencyId: SupportedPlatform;
  basketName: string;
  stagingFolderPath: string;
  csvFilePath?: string;
  itemCount: number;
  status: 'pending_reconciliation' | 'reconciled' | 'cancelled';
  createdAt: number;
  reconciledAt?: number;
}

export interface BackupLogRecord {
  id: string;
  triggerEvent:
    | 'app_startup'
    | 'app_quit'
    | 'batch_ingest'
    | 'batch_metadata'
    | 'batch_export'
    | 'batch_reconcile'
    | 'ftp_batch_complete'
    | 'manual';
  backupFilePath: string;
  fileSizeBytes: number;
  assetCountSnapshot: number;
  durationMs: number;
  createdAt: number;
}

export interface TrackerSummaryStats {
  totalAssets: number;
  newCount: number;
  pendingUploadCount: number;
  uploadedCount: number;
  inReviewCount: number;
  acceptedCount: number;
  rejectedCount: number;
  perAgencyStats: Record<
    SupportedPlatform,
    {
      New: number;
      'Pending Upload': number;
      Uploaded: number;
      'In Review': number;
      Accepted: number;
      Rejected: number;
    }
  >;
  lastBackup?: BackupLogRecord;
  backupCount: number;
}

export interface WorkspacePathsInfo {
  baseDir: string;
  dbPath: string;
  queuesDbPath?: string;
  masterVaultDir: string;
  tempStagingDir: string;
  exportBasketsDir: string;
  backupsDir: string;
  isUserDataDirty?: boolean;
  hasBackupToday?: boolean;
  userDataSizeBytes?: number;
  queuesSizeBytes?: number;
}

export interface BatchRecord {
  id: string;
  name: string;
  createdAt: number;
  totalCount: number;
  processedCount: number;
  failedCount: number;
  status: 'idle' | 'processing' | 'completed' | 'paused';
}

export type MediaType = 'image' | 'video' | 'vector';

export type SupportedPlatform =
  | 'adobe'
  | 'freepik'
  | 'shutterstock'
  | 'vecteezy'
  | 'dreamstime'
  | '123rf';

export type PlatformUploadStatus =
  | 'not_uploaded'
  | 'uploaded'
  | 'pending_review'
  | 'approved'
  | 'rejected';

export interface PlatformStatusInfo {
  status: PlatformUploadStatus;
  updatedAt: number;
  notes?: string;
}

export interface AssetTrackerRecord {
  id: string; // unique hash or sanitized filename
  filename: string;
  cleanTitle?: string;
  mediaType: MediaType;
  fileSizeBytes?: number;
  thumbnailBase64?: string;
  videoDurationSeconds?: number;
  videoResolution?: string;
  folderPath?: string;
  masterRecordId?: string; // links to generated AI metadata if available
  platforms: Record<SupportedPlatform, PlatformStatusInfo>;
  createdAt: number;
  updatedAt: number;
}

export interface PlatformLimitConfig {
  platformId: SupportedPlatform;
  name: string;
  defaultBatchLimit: number;
  limitPeriod: 'batch' | 'daily' | 'weekly';
  description: string;
}

export type AiExecutionMode = 'cloud' | 'local';

export type LocalHardwareProfile = 'auto' | 'integrated' | 'dedicated';

export interface LocalAiConfig {
  baseUrl: string; // e.g. 'http://127.0.0.1:1234/v1'
  modelId: string; // e.g. 'default' or detected loaded model
  timeoutSeconds: number; // e.g. 300s
  hardwareProfile?: LocalHardwareProfile; // 'auto' (default) | 'integrated' (384px iGPU) | 'dedicated' (512px dGPU)
}

export interface AppSettings {
  routingStrategy: 'interleaved' | 'priority_tiered';
  providerPriority: ProviderType[];
  concurrencyLimit: number; // Total max parallel requests across all keys
  autoRetryOn429: boolean;
  maxRetriesPerImage: number;
  thumbnailQuality: number; // 0.75
  thumbnailMaxSize: number; // 512
  defaultAiPrompt: string;
  defaultAiModelName: string;
  platformLimits?: Record<SupportedPlatform, number>;
  providerModels?: Partial<Record<ProviderType, string>>;
  aiExecutionMode?: AiExecutionMode;
  localAiConfig?: LocalAiConfig;
}

export * from './renamer';
