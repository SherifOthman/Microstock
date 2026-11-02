/**
 * Pure String Utility Functions
 */

import { DANGLING_PREPOSITIONS, DANGLING_FRAGMENTS } from '../constants/renamerRules';

/**
 * Truncates text strictly at whole-word boundaries without breaking words mid-character.
 * Supports both space and underscore word separators.
 */
export function smartTruncate(str: string, maxLen: number, endWithPeriod = false): string {
  if (!str) return '';
  const trimmed = str.trim();
  if (trimmed.length <= maxLen) {
    if (endWithPeriod && !trimmed.endsWith('.')) {
      return `${trimmed}.`;
    }
    return trimmed;
  }

  // Find budget
  const budget = endWithPeriod ? maxLen - 1 : maxLen;
  const nextChar = trimmed.charAt(budget);

  // If next character is a separator or end of string, cut is already at a whole word boundary!
  if (nextChar === ' ' || nextChar === '_' || nextChar === '-' || budget >= trimmed.length) {
    let result = trimmed.slice(0, budget).replace(/[,;:\s-_]+$/, '');
    if (endWithPeriod && !result.endsWith('.')) result += '.';
    return result;
  }

  const cut = trimmed.slice(0, budget);
  const lastSep = Math.max(cut.lastIndexOf(' '), cut.lastIndexOf('_'));

  let result = lastSep > 0 ? cut.slice(0, lastSep) : cut;

  // Clean trailing punctuation
  result = result.replace(/[,;:\s-_]+$/, '');

  if (endWithPeriod && !result.endsWith('.')) {
    result += '.';
  }

  return result;
}

/**
 * Strips dangling prepositions, articles, or truncated trailing word fragments.
 * Accepts either string (returns string) or string array (returns string array).
 */
export function stripDanglingWords(input: string): string;
export function stripDanglingWords(input: string[]): string[];
export function stripDanglingWords(input: string | string[]): string | string[] {
  const isString = typeof input === 'string';
  const tokens = isString ? input.split(/[_\s]+/).filter(Boolean) : [...input];

  while (tokens.length > 0) {
    const last = tokens[tokens.length - 1].toLowerCase();
    if (DANGLING_PREPOSITIONS.has(last) || DANGLING_FRAGMENTS.has(last) || last.length < 2) {
      tokens.pop();
    } else {
      break;
    }
  }

  return isString ? tokens.join('_') : tokens;
}

/**
 * Sanitizes plain text by removing markdown and AI meta markers
 */
export function sanitizeNonAiText(text: string): string {
  if (!text) return '';
  return text
    .replace(/\b(?:prompt|model|ai generated|generative ai|seed|upscaled?)\b/gi, '')
    .replace(/[#*`~_]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
