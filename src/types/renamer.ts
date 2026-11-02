/**
 * Types and Contracts for the File Renamer & Segregation Pipeline
 */

import { SegregatedTrack } from '../constants/renamerRules';

export type AssetBatchType = 'ai' | 'native' | 'AI' | 'NATIVE';

export type RenamerMediaType = 'photo' | 'video' | 'vector';

export interface RenamerFileItem {
  id: string;
  originalFile: File | { name: string; size: number; path?: string };
  originalName: string;
  originalFilename?: string;
  cleanName: string;
  mediaType: RenamerMediaType;
  batchType: AssetBatchType;
  track: SegregatedTrack;
  batchNumber: number; // e.g. 1 -> B01
  sequenceNumber: number; // e.g. 1 -> 001
  proposedFilename: string; // e.g. B01_AI_VD_001_clean_title.mp4
  newFilename?: string;
  targetFolder: string; // e.g. AI_Videos/ or _Needs_Fixing/
  needsFixing: boolean;
  fixingReason?: string;
  status: 'pending' | 'staged' | 'renamed' | 'skipped' | 'error';
  errorMessage?: string;
  isPairedVectorPreview?: boolean;
  pairedEpsName?: string;
  isAlreadyFormatted?: boolean;
  extension?: string;
}

export interface RenamerBatchOptions {
  batchType: AssetBatchType;
  startingBatchNumber?: number;
  safeStaging?: boolean;
  idempotentSkip?: boolean;
}

export interface RenamerJobResult {
  batchId: string;
  batchType: AssetBatchType;
  totalFiles: number;
  successfullyRenamed: number;
  routedToNeedsFixing: number;
  skippedAlreadyRenamed: number;
  failedCount: number;
  errors: Array<{ filename: string; error: string }>;
  tracksSummary: Record<SegregatedTrack, number>;
}
