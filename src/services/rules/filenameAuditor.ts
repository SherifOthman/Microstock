export interface FilenameAuditIssue {
  filename: string;
  type: 'adobe_length' | 'diacritics' | 'spaces' | 'special_chars' | 'vecteezy_mutation';
  severity: 'error' | 'warning';
  message: string;
  suggestedName: string;
}

export interface FilenameAuditReport {
  totalFiles: number;
  cleanFiles: number;
  riskyFiles: number;
  issues: FilenameAuditIssue[];
}

/**
 * Sanitizes a filename to a universal safe format:
 * - Strips accents/diacritics (ç -> c, é -> e, etc.)
 * - Replaces spaces and underscores with clean PascalCase or simple hyphens
 * - Removes non-alphanumeric characters except hyphen and dot
 * - Keeps base name under 25 chars (+ ext = < 30 chars for Adobe Stock)
 */
export function sanitizeFilenameForStock(filename: string): string {
  const dotIndex = filename.lastIndexOf('.');
  const ext = dotIndex !== -1 ? filename.slice(dotIndex).toLowerCase() : '.jpg';
  const base = dotIndex !== -1 ? filename.slice(0, dotIndex) : filename;

  // 1. Remove diacritics
  let clean = base.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  // 2. Convert spaces / underscores / hyphens to Camel/PascalCase
  clean = clean
    .split(/[\s_\-]+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join('');

  // 3. Remove any remaining illegal characters
  clean = clean.replace(/[^a-zA-Z0-9]/g, '');

  // 4. Truncate base name to 25 chars so base + ext is strictly <= 30 chars (Adobe Stock limit)
  if (clean.length > 25) {
    clean = clean.slice(0, 25);
  }

  return `${clean}${ext}`;
}

/**
 * Audits a list of filenames against stock agency restrictions
 */
export function auditFilenames(filenames: string[]): FilenameAuditReport {
  const issues: FilenameAuditIssue[] = [];
  const riskySet = new Set<string>();

  for (const filename of filenames) {
    const hasDiacritics = /[^\u0000-\u007F]/.test(filename);
    const hasSpaces = /\s/.test(filename);
    const hasSpecialChars = /[&%$#@!+=~`'"\\\/…,]/.test(filename);
    const isAdobeLengthExceeded = filename.length > 30;
    const hasUnderscores = filename.includes('_');

    const suggested = sanitizeFilenameForStock(filename);

    if (isAdobeLengthExceeded) {
      riskySet.add(filename);
      issues.push({
        filename,
        type: 'adobe_length',
        severity: 'error',
        message: `Exceeds Adobe Stock 30-char limit (${filename.length} chars). Adobe CSV parser will fail or reject this asset!`,
        suggestedName: suggested,
      });
    }

    if (hasDiacritics) {
      riskySet.add(filename);
      issues.push({
        filename,
        type: 'diacritics',
        severity: 'error',
        message: `Contains accents/diacritics (e.g. ç, é, ñ). Vecteezy and Adobe Stock will mutate this name upon upload, causing CSV mismatch!`,
        suggestedName: suggested,
      });
    }

    if (hasSpecialChars) {
      riskySet.add(filename);
      issues.push({
        filename,
        type: 'special_chars',
        severity: 'error',
        message: `Contains illegal characters or ellipses (…). Platforms cannot match this in CSV.`,
        suggestedName: suggested,
      });
    }

    if (hasSpaces) {
      riskySet.add(filename);
      issues.push({
        filename,
        type: 'spaces',
        severity: 'warning',
        message: `Contains spaces. FTP uploads on Freepik, Adobe, and Vecteezy often break with spaces.`,
        suggestedName: suggested,
      });
    }

    if (hasUnderscores && !hasDiacritics && !isAdobeLengthExceeded) {
      issues.push({
        filename,
        type: 'vecteezy_mutation',
        severity: 'warning',
        message: `Contains underscores (_). Vecteezy strips underscores during web upload (use our Vecteezy Hydrator tool to map effortlessly).`,
        suggestedName: suggested,
      });
    }
  }

  return {
    totalFiles: filenames.length,
    cleanFiles: filenames.length - riskySet.size,
    riskyFiles: riskySet.size,
    issues,
  };
}
