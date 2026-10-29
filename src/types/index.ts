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
  };
  isAiGenerated: boolean;
  baseTitle: string;
  detailedDescription: string;
  rankedKeywords: string[]; // 40-50 tags
  categories: {
    adobeCategoryId: number; // 1-21
    shutterstockCategories: [string, string?]; // Up to 2 of 26 official names
    dreamstimeCategory1: number; // Visual subject 1
    dreamstimeCategory2: number; // Visual subject 2
    dreamstimeCategory3: number; // 114 for AI, or subject 3
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
  createdAt: number;
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
}
