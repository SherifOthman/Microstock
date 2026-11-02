/**
 * Core Renamer Sanitization & Bug Fixing Engine
 * Implements strict multi-pass tokenization, hash filtering, word-boundary truncation,
 * dangling preposition removal, and numeric-only detection.
 */

import {
  DANGLING_PREPOSITIONS,
  DANGLING_FRAGMENTS,
  RENAMER_STOP_WORDS,
  RESOLUTION_TOKENS,
} from '../constants/renamerRules';
import { smartTruncate, stripDanglingWords } from './stringUtils';

export { smartTruncate, stripDanglingWords };

export interface SanitizedFilenameResult {
  originalName: string;
  cleanBase: string; // e.g. "green_laser_scanning_carbon_fiber"
  extension: string; // e.g. ".mp4"
  validWordsCount: number;
  needsFixing: boolean;
  fixingReason?: string;
  isAlreadyRenamed: boolean;
  isAlreadyFormatted: boolean;
  existingBatchPrefix?: string;
  detectedHash?: string;
}

/**
 * Checks if a token is a hexadecimal hash or random alphanumeric ID.
 * Matches:
 * - 5 to 32 char hex/alphanumeric mixing digits and hex letters (e.g. 33dc072c, 311e93b6, e9949579)
 * - Pure hex strings of length 6 to 16
 * - Hash with trailing index (e.g. 9710797b_1)
 */
export function isHexHashToken(token: string): boolean {
  if (!token) return false;
  const t = token.toLowerCase();

  // Strip trailing version/counter like _1 or -v2 for hash testing (MUST require - or _ separator)
  const core = t.replace(/[-_](?:v?\d+)$/, '');

  if (core.length < 5 || core.length > 32) return false;

  // UUID fragment or hex string
  const isHexOnly = /^[0-9a-f]{5,32}$/i.test(core);
  const hasDigit = /\d/.test(core);
  const hasHexLetter = /[a-f]/i.test(core);

  // If it's a mix of digits and hex letters, it's 100% a hash (e.g. 33dc072c)
  if (isHexOnly && hasDigit && hasHexLetter) {
    return true;
  }

  // Pure hex of 6+ chars that is not a recognized English word
  if (isHexOnly && core.length >= 6) {
    const commonHexWords = new Set(['coffee', 'decade', 'facade', 'access']);
    if (!commonHexWords.has(core)) {
      return true;
    }
  }

  return false;
}

/**
 * Checks if a token is a timestamp (e.g. 20261026005358 or 68212868)
 */
export function isTimestampToken(token: string): boolean {
  return /^\d{6,16}$/.test(token);
}

/**
 * Checks if a token is a resolution marker (e.g. 1080p, 4k, uhd)
 */
export function isResolutionToken(token: string): boolean {
  return RESOLUTION_TOKENS.has(token.toLowerCase());
}

/**
 * Detects if a filename is already formatted with our batch counter.
 * Matches B01_AI_VD_001_ or B01_001_ or B01_NT_PH_001_
 */
export function detectExistingBatchPrefix(filename: string): { isAlreadyRenamed: boolean; prefix?: string; rest?: string } {
  const match = filename.match(/^(B\d{1,4}_(?:AI|NT)_[A-Z]{2}_\d{2,4}_|B\d{1,4}_\d{2,4}__?)(.*)/i);
  if (match) {
    return {
      isAlreadyRenamed: true,
      prefix: match[1],
      rest: match[2],
    };
  }
  return { isAlreadyRenamed: false };
}

/**
 * Main sanitization engine for a single filename:
 * - Solves Bug 1: Removes embedded hex hashes before resolutions/timestamps
 * - Solves Bug 2: Detects numeric-only names (< 2 valid alphabetical words) and flags needsFixing
 * - Solves Bug 3: Whole-word truncation and dangling fragment/preposition removal
 */
export function sanitizeRenamerFilename(
  originalFilename: string,
  maxBudgetChars = 55
): SanitizedFilenameResult {
  const extMatch = originalFilename.match(/\.[a-zA-Z0-9]+$/);
  const extension = extMatch ? extMatch[0].toLowerCase() : '';
  let rawBase = extMatch ? originalFilename.slice(0, extMatch.index) : originalFilename;

  // Check idempotency first
  const existingPrefixCheck = detectExistingBatchPrefix(rawBase);
  if (existingPrefixCheck.isAlreadyRenamed && existingPrefixCheck.rest) {
    // If it was already renamed, we can clean the rest or preserve it
    rawBase = existingPrefixCheck.rest;
  }

  // Pre-strip full UUIDs (8-4-4-4-12 hex)
  rawBase = rawBase.replace(/[-_]?[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, ' ');

  // Split into raw tokens
  const rawTokens = rawBase
    .replace(/[._-]+/g, ' ')
    .replace(/[^a-zA-Z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);

  let detectedHash: string | undefined;

  // Multi-pass token filter
  const cleanTokens: string[] = [];
  for (const token of rawTokens) {
    const lower = token.toLowerCase();

    // 1. Skip resolution tokens
    if (isResolutionToken(lower)) continue;

    // 2. Skip timestamp tokens
    if (isTimestampToken(lower)) continue;

    // 3. Skip hex hashes / random IDs (situated anywhere in filename)
    if (isHexHashToken(lower)) {
      if (!detectedHash) detectedHash = lower;
      continue;
    }

    // 4. Skip common renamer stop words (upscayl, remini, copy, etc.)
    if (RENAMER_STOP_WORDS.has(lower)) continue;

    // 5. Skip version numbers (v1, v2)
    if (/^v\d+$/i.test(lower)) continue;

    // 6. Skip standalone single numbers or digits
    if (/^\d+$/.test(lower)) continue;

    cleanTokens.push(lower);
  }

  // Strip dangling prepositions & truncated fragments from the end of cleanTokens
  while (cleanTokens.length > 0) {
    const last = cleanTokens[cleanTokens.length - 1];
    if (DANGLING_PREPOSITIONS.has(last) || DANGLING_FRAGMENTS.has(last) || last.length < 2) {
      cleanTokens.pop();
    } else {
      break;
    }
  }

  // Count valid English alphabetical words (at least 3 letters each)
  const validWords = cleanTokens.filter((t) => /^[a-zA-Z]{3,}$/.test(t));

  // Bug 2 Fix: If < 2 valid alphabetical words remain, route to _Needs_Fixing
  if (validWords.length < 2) {
    return {
      originalName: originalFilename,
      cleanBase: cleanTokens.join('_') || rawBase.replace(/^[._-]+|[._-]+$/g, '') || 'unnamed_asset',
      extension,
      validWordsCount: validWords.length,
      needsFixing: true,
      fixingReason: `Filename lacks descriptive subject (contains ${validWords.length} valid words, minimum 2 required).`,
      isAlreadyRenamed: existingPrefixCheck.isAlreadyRenamed,
      isAlreadyFormatted: existingPrefixCheck.isAlreadyRenamed,
      existingBatchPrefix: existingPrefixCheck.prefix,
      detectedHash,
    };
  }

  // Bug 3 Fix: Whole-word boundary truncation
  const budgetedTokens: string[] = [];
  let currentLength = 0;

  for (const token of cleanTokens) {
    const addedLen = budgetedTokens.length === 0 ? token.length : token.length + 1;
    if (currentLength + addedLen <= maxBudgetChars) {
      budgetedTokens.push(token);
      currentLength += addedLen;
    } else {
      break;
    }
  }

  // After truncation, re-check that the end doesn't dangle on a preposition
  while (budgetedTokens.length > 0) {
    const last = budgetedTokens[budgetedTokens.length - 1];
    if (DANGLING_PREPOSITIONS.has(last) || DANGLING_FRAGMENTS.has(last) || last.length < 2) {
      budgetedTokens.pop();
    } else {
      break;
    }
  }

  const cleanBase = budgetedTokens.join('_');

  return {
    originalName: originalFilename,
    cleanBase: cleanBase || 'asset',
    extension,
    validWordsCount: validWords.length,
    needsFixing: false,
    isAlreadyRenamed: existingPrefixCheck.isAlreadyRenamed,
    isAlreadyFormatted: existingPrefixCheck.isAlreadyRenamed,
    existingBatchPrefix: existingPrefixCheck.prefix,
    detectedHash,
  };
}
