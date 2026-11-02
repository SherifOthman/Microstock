/**
 * Pure Filename Sanitization & Normalization Functions
 */

import { GENERIC_AI_BOILERPLATE } from '../constants/metadataLimits';

/**
 * Cleans user/photographer filenames into human-readable subject hints for AI prompts.
 * Strips batch prefixes, UUIDs, hex hashes, version tags, and boilerplate words.
 */
export function cleanFilenameHint(filename: string): string {
  if (!filename) return '';

  let rawBase = filename;
  if (filename.includes('__')) {
    const doubleUnderscoreIdx = filename.indexOf('__');
    rawBase = filename.slice(doubleUnderscoreIdx + 2);
  }

  let cleaned = rawBase
    // strip common image/video extensions
    .replace(/\.(jpe?g|png|webp|eps|ai|svg|mov|mp4|tiff?|mkv|webm|avi)$/i, '')
    // strip Midjourney / Stable Diffusion UUIDs
    .replace(/[-_]?[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '')
    // strip upscaler/AI tool suffixes
    .replace(/[-_\s]*(?:upscayl(?:ed)?|upscale|remini|topaz|gigapixel|magnific)[^._\s]*/gi, '');

  // Strip generic MD5-style hex hashes, trailing unique IDs, and version numbers
  while (/[-_][0-9a-f]{6,16}(?:[-_]\d+|[-_]v\d+)?$/i.test(cleaned) || /[-_\s]+\d{1,4}\s*$/i.test(cleaned)) {
    cleaned = cleaned
      .replace(/[-_][0-9a-f]{6,16}(?:[-_]\d+|[-_]v\d+)?$/i, '')
      .replace(/[-_\s]+\d{1,4}\s*$/i, '')
      .trim();
  }

  cleaned = cleaned
    // strip leading zero-padded or sequential counters e.g. "001_", "02-", "001 "
    .replace(/^\s*\d{1,4}[-_\s]+/i, '')
    // replace underscores and hyphens with spaces
    .replace(/[-_]+/g, ' ')
    // strip trailing or embedded timestamp strings
    .replace(/\b\d{8,14}\b/g, '')
    .replace(/\b\d{4}\s+\d{2}\s+\d{2}\b/g, '')
    // strip common resolution tags
    .replace(/\b[248]k\b/gi, '')
    .replace(/\b(hd|uhd|raw|edit)\b/gi, '')
    // collapse whitespace and trim
    .replace(/\s+/g, ' ')
    .trim();

  // Filter out generic boilerplate command words and hex hashes
  const tokens = cleaned
    .split(/\s+/)
    .map((w) => w.trim())
    .filter((w) => {
      if (w.length < 2) return false;
      if (/^\d+$/.test(w)) return false;
      if (GENERIC_AI_BOILERPLATE.has(w.toLowerCase())) return false;
      if (/^[0-9a-f]{6,16}$/i.test(w) && /\d/.test(w) && /[a-f]/i.test(w)) return false;
      return true;
    });

  if (tokens.length < 1) {
    return '';
  }

  return tokens.join(' ');
}

/**
 * Universal filename cleaner for CSV export:
 * - The Ellipsis Bug: Microstock servers automatically convert '…' (U+2026) to '_'
 * - Non-ASCII Diacritics: Normalizes and strips accents (e.g. Açaí -> Acai)
 */
export function sanitizeExportFilename(filename: string): string {
  if (!filename) return '';
  let clean = filename.replace(/\u2026/g, '_');
  clean = clean.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return clean;
}

/**
 * Sanitizes local filenames to match Vecteezy's web uploader ingestion rules.
 * Vecteezy strips spaces and underscores to merge words, but KEEPS hyphens (-) intact.
 */
export function sanitizeForVecteezyWeb(filename: string): string {
  if (!filename) return '';
  const lastDot = filename.lastIndexOf('.');
  const ext = lastDot !== -1 ? filename.slice(lastDot).toLowerCase() : '';
  let name = lastDot !== -1 ? filename.slice(0, lastDot) : filename;

  name = name.replace(/\u2026/g, '-');
  name = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  name = name.replace(/[^a-zA-Z0-9\s_-]/g, '');
  name = name.replace(/[\s_]+/g, '');

  if (!name) name = 'asset';
  if (name.length > 50) name = name.slice(0, 50);

  return name + ext;
}
