import { MasterMetadataRecord, SupportedPlatform } from '../../types';
import { db } from '../../db';

export const AGENCY_KEYWORD_CAPS: Record<SupportedPlatform, number> = {
  adobe: 49,
  shutterstock: 50,
  freepik: 50,
  vecteezy: 50,
  dreamstime: 80,
  '123rf': 50,
};

export interface BulkMetadataSurgeryPayload {
  mode: 'keywords' | 'text';
  keywordAction?: 'remove' | 'replace' | 'prepend' | 'append';
  targetKeywordsRaw?: string;
  replacementKeywordRaw?: string;
  findText?: string;
  replaceText?: string;
  caseSensitive?: boolean;
  applyToTitle?: boolean;
  applyToDescription?: boolean;
}

/**
 * Trims rankedKeywords on all provided records to the target agency's maximum keyword cap.
 */
export async function autoTrimKeywordsForAgency(
  records: MasterMetadataRecord[],
  agencyId: SupportedPlatform
): Promise<{ updatedCount: number; cap: number }> {
  const cap = AGENCY_KEYWORD_CAPS[agencyId] || 50;
  let updatedCount = 0;

  for (const rec of records) {
    const kws = rec.rankedKeywords || [];
    if (kws.length > cap) {
      const trimmed = kws.slice(0, cap);
      await db.masterRecords.update(rec.id, { rankedKeywords: trimmed });
      updatedCount++;
    }
  }

  return { updatedCount, cap };
}

/**
 * Executes bulk keyword sanitization (remove / replace / prepend / append) or
 * bulk Title & Description Find & Replace across all target records.
 */
export async function applyBulkMetadataSurgery(
  records: MasterMetadataRecord[],
  payload: BulkMetadataSurgeryPayload
): Promise<{ updatedCount: number }> {
  let updatedCount = 0;

  if (payload.mode === 'keywords') {
    const action = payload.keywordAction || 'remove';
    const inputTokens = (payload.targetKeywordsRaw || '')
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
    const inputLowerSet = new Set(inputTokens.map((t) => t.toLowerCase()));
    const replacementTokens = (payload.replacementKeywordRaw || '')
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);

    if (inputTokens.length === 0) return { updatedCount: 0 };

    for (const rec of records) {
      const current = rec.rankedKeywords || [];
      let next: string[] = [...current];
      let changed = false;

      if (action === 'remove') {
        next = current.filter((k) => !inputLowerSet.has(k.trim().toLowerCase()));
        changed = next.length !== current.length;
      } else if (action === 'replace') {
        const replaced: string[] = [];
        for (const k of current) {
          if (inputLowerSet.has(k.trim().toLowerCase())) {
            changed = true;
            for (const rep of replacementTokens) {
              if (!replaced.some((x) => x.toLowerCase() === rep.toLowerCase())) {
                replaced.push(rep);
              }
            }
          } else if (!replaced.some((x) => x.toLowerCase() === k.toLowerCase())) {
            replaced.push(k);
          }
        }
        next = replaced;
      } else if (action === 'prepend') {
        const existingLower = new Set(current.map((k) => k.toLowerCase()));
        const toAdd = inputTokens.filter((t) => !existingLower.has(t.toLowerCase()));
        if (toAdd.length > 0) {
          next = [...toAdd, ...current];
          changed = true;
        }
      } else if (action === 'append') {
        const existingLower = new Set(current.map((k) => k.toLowerCase()));
        const toAdd = inputTokens.filter((t) => !existingLower.has(t.toLowerCase()));
        if (toAdd.length > 0) {
          next = [...current, ...toAdd];
          changed = true;
        }
      }

      if (changed) {
        await db.masterRecords.update(rec.id, { rankedKeywords: next });
        updatedCount++;
      }
    }
  } else {
    const findStr = payload.findText || '';
    const replaceStr = payload.replaceText ?? '';
    if (!findStr) return { updatedCount: 0 };

    const escaped = findStr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(escaped, payload.caseSensitive ? 'g' : 'gi');

    for (const rec of records) {
      const changes: Partial<MasterMetadataRecord> = {};
      let changed = false;

      if (payload.applyToTitle !== false && rec.baseTitle) {
        const nextTitle = rec.baseTitle.replace(regex, replaceStr);
        if (nextTitle !== rec.baseTitle) {
          changes.baseTitle = nextTitle;
          changed = true;
        }
      }

      if (payload.applyToDescription !== false && rec.detailedDescription) {
        const nextDesc = rec.detailedDescription.replace(regex, replaceStr);
        if (nextDesc !== rec.detailedDescription) {
          changes.detailedDescription = nextDesc;
          changed = true;
        }
      }

      if (changed) {
        await db.masterRecords.update(rec.id, changes);
        updatedCount++;
      }
    }
  }

  return { updatedCount };
}

async function computeBrowserSha256Hex(file: File): Promise<string | null> {
  try {
    if (typeof crypto !== 'undefined' && crypto.subtle && typeof file.arrayBuffer === 'function') {
      const buf = await file.arrayBuffer();
      const digest = await crypto.subtle.digest('SHA-256', buf);
      return Array.from(new Uint8Array(digest))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
    }
  } catch {
    // ignore fallback
  }
  return null;
}

function getFileStem(filename: string): string {
  return filename.trim().toLowerCase().replace(/\.[^.]+$/, '');
}

/**
 * Matches files dragged and dropped from Windows File Explorer against candidate records
 * using exact filename match, stem match (for EPS/JPG pairs), or SHA-256 binary hash match.
 */
export async function matchDroppedFilesToPendingAssets(
  droppedFiles: File[],
  candidates: MasterMetadataRecord[]
): Promise<{
  matchedIds: string[];
  matchedFilenames: string[];
  unmatchedDroppedNames: string[];
}> {
  const matchedIdSet = new Set<string>();
  const matchedFilenames: string[] = [];
  const unmatchedDroppedNames: string[] = [];

  for (const file of droppedFiles) {
    const droppedNameLower = (file.name || '').trim().toLowerCase();
    const droppedStem = getFileStem(file.name || '');
    const droppedHash = await computeBrowserSha256Hex(file);

    let foundMatch = false;
    for (const rec of candidates) {
      const recNameLower = (rec.filename || '').trim().toLowerCase();
      const recStem = getFileStem(rec.filename || '');
      const recCleanHash = (rec.fileHash || '').replace(/^sha256_/, '').toLowerCase();

      const isNameMatch = recNameLower === droppedNameLower || (droppedStem && recStem === droppedStem);
      const isHashMatch = Boolean(droppedHash && recCleanHash && droppedHash === recCleanHash);

      if (isNameMatch || isHashMatch) {
        if (!matchedIdSet.has(rec.id)) {
          matchedIdSet.add(rec.id);
          matchedFilenames.push(rec.filename);
        }
        foundMatch = true;
      }
    }

    if (!foundMatch && file.name) {
      unmatchedDroppedNames.push(file.name);
    }
  }

  return {
    matchedIds: Array.from(matchedIdSet),
    matchedFilenames,
    unmatchedDroppedNames,
  };
}
